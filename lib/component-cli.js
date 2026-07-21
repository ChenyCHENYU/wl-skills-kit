"use strict";

const {
  applyComponentPlan,
  loadCatalog,
  planComponents,
} = require("./component-catalog");

const STATUS_LABELS = {
  missing: "待落盘",
  ready: "可复用",
  "update-available": "可复用（有同契约更新）",
  unmanaged: "冲突（未受管）",
  incompatible: "冲突（契约不兼容）",
  incomplete: "冲突（文件不完整）",
  modified: "冲突（本地已修改）",
  "requirements-missing": "冲突（依赖缺失）",
};

function publicItem(item) {
  return {
    name: item.component.name,
    status: item.status,
    targetDir: item.component.targetDir,
    reason: item.reason,
    requirements: item.requirements,
  };
}

function publicPlan(plan, extra = {}) {
  return {
    ok: plan.conflicts.length === 0,
    planHash: plan.planHash,
    selected: plan.selected,
    actions: plan.actions.map(publicItem),
    reusable: plan.reusable.map(publicItem),
    conflicts: plan.conflicts.map(publicItem),
    ...extra,
  };
}

function printItems(write, title, items) {
  if (items.length === 0) return;
  write(`  ${title}:`);
  for (const item of items) {
    const label = STATUS_LABELS[item.status] || item.status;
    write(`    - ${item.component.name}: ${label} → ${item.component.targetDir}`);
    if (item.reason) write(`      ${item.reason}`);
  }
}

function printPlan(write, version, plan) {
  write("");
  write(`  wl-skills-kit v${version}  [component]`);
  if (plan.selected.length === 0) {
    write("  ✔ 未发现对标准业务组件的引用\n");
    return;
  }
  printItems(write, "待落盘", plan.actions);
  printItems(write, "可复用", plan.reusable);
  printItems(write, "阻断项", plan.conflicts);
  write(`  planHash: ${plan.planHash}\n`);
}

function runList(options) {
  const catalog = loadCatalog(options.catalogPath);
  const result = catalog.components.map((component) => ({
    name: component.name,
    contractVersion: component.contractVersion,
    targetDir: component.targetDir,
    importPath: component.importPath,
  }));
  if (options.json) options.write(JSON.stringify(result, null, 2));
  else {
    options.write("");
    options.write(`  标准业务组件目录（${result.length} 个）:`);
    for (const item of result) options.write(`    - ${item.name} v${item.contractVersion} → ${item.targetDir}`);
    options.write("");
  }
  return { ok: true, result };
}

function createPlan(options) {
  return planComponents({
    projectRoot: options.projectRoot,
    catalogPath: options.catalogPath,
    names: options.components?.length ? options.components : undefined,
  });
}

function runCheck(options) {
  const plan = createPlan(options);
  if (options.json) options.write(JSON.stringify(publicPlan(plan), null, 2));
  else printPlan(options.write, options.version, plan);
  return { ok: plan.actions.length === 0 && plan.conflicts.length === 0, plan };
}

function printPreviewHint(options, plan) {
  printPlan(options.write, options.version, plan);
  if (plan.conflicts.length > 0) return;
  if (plan.actions.length === 0) {
    options.write("  ✔ 无需落盘，现有组件可直接复用\n");
    return;
  }
  options.write("  预览不写文件；确认后在同一命令追加:");
  options.write(`  --confirm --plan-hash ${plan.planHash}\n`);
}

function runEnsurePreview(options, plan) {
  if (options.json) options.write(JSON.stringify(publicPlan(plan, { preview: true }), null, 2));
  else printPreviewHint(options, plan);
  return { ok: plan.conflicts.length === 0, plan, preview: true };
}

async function runEnsureApply(options, plan) {
  const created = await applyComponentPlan(plan, options.planHash);
  if (options.json) {
    options.write(JSON.stringify(publicPlan(plan, { preview: false, created }), null, 2));
  } else {
    printPlan(options.write, options.version, plan);
    for (const target of created) options.write(`  ✔ 已落盘 ${target}`);
    if (created.length === 0) options.write("  ✔ 无需落盘，现有组件可直接复用");
    options.write("");
  }
  return { ok: true, plan, preview: false, created };
}

function runEnsure(options) {
  const plan = createPlan(options);
  if (!options.confirm || options.dryRun) return runEnsurePreview(options, plan);
  return runEnsureApply(options, plan);
}

function runComponentCommand(options = {}) {
  const context = { write: console.log, ...options };
  const actions = { list: runList, check: runCheck, ensure: runEnsure };
  const handler = actions[context.action || "check"];
  if (!handler) throw new Error(`未知 component 子命令: ${context.action}；可用 list/check/ensure`);
  return handler(context);
}

module.exports = { publicPlan, runComponentCommand };

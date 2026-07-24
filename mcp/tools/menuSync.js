"use strict";

const fs = require("fs");
const path = require("path");
const { queryMenuTree, saveMenu, querySysDomainList, deleteMenu } = require("../api/menuApi");
const { writeBlockReason } = require("../write-guard");
const { createPlanHash } = require("../../lib/plan-hash");
const {
  blockedResult,
  completedResult,
  previewResult,
  toolResult,
  validatePlanHash,
} = require("../tool-result");
const {
  buildMenuBody,
  cleanCell,
  findExisting,
  findLatestReport,
  flattenMenus,
  getProjectRoot,
  getReportDirs,
  isDividerRow,
  locateAppDomain,
  normalizeTree,
  parseBoolean,
  parseReport,
  resolveDomainId,
  resolveReportPath,
  splitMarkdownRow,
} = require("../menu/menu-support");

async function resolveMenuDomain(config) {
  const configured = config.menu?.domainId;
  if (configured && !String(configured).includes("domainId")) return { ok: true, domainId: configured };
  const resolved = await resolveDomainId(config);
  return resolved.ok
    ? { ok: true, domainId: resolved.domainId }
    : { ok: false, error: resolved.error };
}

async function queryMenuState(config) {
  const domain = await resolveMenuDomain(config);
  if (!domain.ok) throw new Error(`未能自动获取 domainId：${domain.error}`);
  const query = await queryMenuTree(domain.domainId, config);
  if (!query.ok) throw new Error(`查询菜单树失败: ${query.error} (code: ${query.code})`);
  return { domainId: domain.domainId, tree: query.data, flatMenus: flattenMenus(query.data, null, []) };
}

async function handleDomainQuery(config) {
  try {
    const result = await querySysDomainList(config);
    if (!result.ok) {
      return blockedResult(
        `查询应用域列表失败: ${result.error} (code: ${result.code})`,
        "query-failed",
        { mode: "query" },
      );
    }
    const records = result.data || [];
    const items = records.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      description: d.description || "",
    }));
    const text =
      items.length === 0
        ? "✅ 应用域查询成功，当前无应用域数据"
        : `✅ 应用域查询成功（共 ${items.length} 个）\n\n${items
            .map((d) => `${d.name} (code=${d.code}, domainId=${d.id})`)
            .join("\n")}`;
    return toolResult(text, {
      ok: true,
      state: "completed",
      mode: "query",
      count: items.length,
      items,
    });
  } catch (error) {
    return blockedResult(error.message, "query-failed", { mode: "query" });
  }
}

/**
 * 删除菜单（敏感操作：默认预览，确认后执行）。
 *
 * 参数：
 *   menuIds: string[]           要删除的菜单 ID 列表
 *   confirmApply?: boolean      默认 false（只预览），传 true 才执行
 *   cascadeChildren?: boolean   默认 true（递归删除子菜单），传 false 则只删指定 ID（有子节点时后端会报错）
 *   planHash?: string           confirmApply=true 时必须传预览返回的 planHash
 *
 * 安全机制：
 *   ① 默认只预览，列出会删除的完整范围（含子节点）
 *   ② 确认需传 confirmApply:true + 正确 planHash
 *   ③ 生产环境（allowProductionWrites:false）阻断删除
 *   ④ 自底向上逐个删除（后端不级联）
 */
async function handleMenuDelete(args, config) {
  const { menuIds } = args;
  if (!Array.isArray(menuIds) || menuIds.length === 0) {
    return blockedResult("参数错误：menuIds 必须是非空数组（要删除的菜单 ID）", "blocked", { mode: "delete" });
  }
  const cascade = args.cascadeChildren !== false;

  // ① 查询当前菜单树，定位要删的节点及其子树
  const state = await queryMenuState(config);
  const flatAll = flattenMenus(normalizeTree(state.tree), null, []);

  // ② 收集要删除的完整 ID 列表（含子节点）
  const toDelete = [];
  const visited = new Set();
  function collect(id) {
    if (visited.has(String(id))) return;
    visited.add(String(id));
    const node = flatAll.find((n) => String(n.id) === String(id));
    if (node) {
      if (cascade) {
        const kids = node.children || node.childList || [];
        for (const kid of kids) collect(kid.id);
      }
      toDelete.push({ id: node.id, menuName: node.menuName, type: node.type, path: node.path || "" });
    } else {
      // ID 不在当前树里，仍允许删（可能是无权限的节点）
      toDelete.push({ id, menuName: "(未知节点)", type: "?", path: "" });
    }
  }
  for (const id of menuIds) collect(id);

  // ③ 计算 planHash
  const planValue = {
    schemaVersion: 1,
    domainId: String(state.domainId),
    mode: "delete",
    cascade,
    items: toDelete.map((d) => ({ id: d.id, menuName: d.menuName })),
  };
  const plan = { ...planValue, planHash: createPlanHash("menu-delete", planValue) };

  // ④ 未确认 → 只预览
  if (args.confirmApply !== true) {
    const lines = [
      `⚠️ 菜单删除预览：共 ${toDelete.length} 个菜单将被删除（cascadeChildren=${cascade}）。`,
      `planHash: ${plan.planHash}`,
      "确认无误后，携带相同 planHash 并传 confirmApply: true 才会真正执行删除。",
      "",
      "| 菜单名 | ID | 类型 | path |",
      "|---|---|---|---|",
    ];
    for (const d of toDelete) lines.push(`| ${d.menuName} | ${d.id} | ${d.type} | ${d.path} |`);
    return previewResult(lines.join("\n"), plan, { actions: plan.items, count: toDelete.length });
  }

  // ⑤ 确认 → 校验 planHash + 写保护
  const stale = validatePlanHash(args, plan);
  if (stale) return stale;
  const blocked = writeBlockReason(config);
  if (blocked) return blockedResult(blocked, "blocked", { mode: "delete" });

  // ⑥ 执行删除（自底向上）
  const rows = [];
  // 反转：先删子节点再删父节点
  const ordered = [...toDelete].reverse();
  for (const item of ordered) {
    const result = await deleteMenu(item.id, config);
    rows.push({
      action: "删除",
      menuName: item.menuName,
      id: item.id,
      ok: result.ok,
      status: result.ok ? "✅ 成功" : `❌ 失败: ${result.error}`,
    });
  }
  const text = formatMenuRows(rows);
  return toolResult(text, {
    ok: true,
    state: "completed",
    mode: "delete",
    count: rows.filter((r) => r.ok).length,
    results: rows,
  });
}

async function handleMenuQuery(config) {
  try {
    const state = await queryMenuState(config);
    const tree = normalizeTree(state.tree);
    const text = tree.length === 0
      ? `✅ 菜单树查询成功，当前应用域（domainId=${state.domainId}）暂无菜单数据`
      : `✅ 菜单树查询成功（domainId=${state.domainId}）\n\n${JSON.stringify(state.tree, null, 2)}`;
    return toolResult(text, {
      ok: true, state: "completed", mode: "query", domainId: String(state.domainId), count: tree.length, items: tree,
    });
  } catch (error) {
    return blockedResult(error.message, "query-failed", { mode: "query" });
  }
}

function directMenuPlan(args, config, menuState) {
  const value = {
    schemaVersion: 1,
    sysAppNo: config.sysAppNo || "",
    domainId: String(menuState.domainId),
    items: args.items,
    remoteTree: menuState.tree,
  };
  return {
    ...value,
    planHash: createPlanHash("menu-upsert", value),
    actions: args.items.map((item) => ({
      action: item.id ? "update" : "create",
      menuName: item.menuName || "(未命名)",
      id: item.id || "",
    })),
  };
}

async function buildDirectMenuPlan(args, config) {
  if (!Array.isArray(args.items) || args.items.length === 0) throw new Error("参数错误：items 必须是非空数组");
  return directMenuPlan(args, config, await queryMenuState(config));
}

function formatDirectMenuPreview(plan) {
  return [
    `菜单写入预览：共 ${plan.actions.length} 条，本次零写入。`,
    `planHash: ${plan.planHash}`,
    "确认后携带相同 planHash 并传 confirmApply: true。",
    "",
    JSON.stringify(plan.actions, null, 2),
  ].join("\n");
}

async function saveMenuRow(item, config) {
  const action = item.id ? "更新" : "新增";
  const result = await saveMenu(item, config);
  const savedId = result.data?.id || item.id || "(新增)";
  return {
    action,
    menuName: item.menuName || "(未命名)",
    id: savedId,
    ok: result.ok,
    status: result.ok ? "✅ 成功" : `❌ 失败: ${result.error}`,
  };
}

function formatMenuRows(rows) {
  const successCount = rows.filter((row) => row.ok).length;
  const lines = [
    `菜单操作完成：成功 ${successCount} 条，失败 ${rows.length - successCount} 条`, "",
    "| 操作 | 菜单名 | ID | 状态 |", "|---|---|---|---|",
  ];
  for (const row of rows) lines.push(`| ${row.action} | ${row.menuName} | ${row.id} | ${row.status} |`);
  return lines.join("\n");
}

function directMenuPreflight(args, config) {
  if (!Array.isArray(args.items) || args.items.length === 0) {
    return blockedResult("参数错误：items 必须是非空数组", "blocked", { mode: "preview" });
  }
  if (args.confirmApply !== true) return null;
  const blocked = writeBlockReason(config);
  return blocked
    ? blockedResult(blocked, "blocked", { mode: "apply" })
    : null;
}

async function handleMenuUpsert(args = {}, config) {
  const preflight = directMenuPreflight(args, config);
  if (preflight) return preflight;
  let plan;
  try {
    plan = await buildDirectMenuPlan(args, config);
  } catch (error) {
    return blockedResult(error.message, "blocked", { mode: args.confirmApply === true ? "apply" : "preview" });
  }
  if (args.confirmApply !== true) {
    return previewResult(formatDirectMenuPreview(plan), plan, { actions: plan.actions });
  }
  const stale = validatePlanHash(args, plan);
  if (stale) return stale;
  const rows = [];
  for (const item of args.items) rows.push(await saveMenuRow(item, config));
  const ok = rows.every((row) => row.ok);
  const result = completedResult(formatMenuRows(rows), { planHash: plan.planHash, results: rows });
  return ok ? result : { ...result, isError: true, structuredContent: { ...result.structuredContent, ok: false, state: "partial" } };
}

function reportParentId(config) {
  return config.menu?.parentMenuId || config.parentMenuId || "";
}

function validateReportInputs(config, reportPath, parsed) {
  const parentId = reportParentId(config);
  if (!parentId || String(parentId).includes("parentMenuId")) {
    throw new Error("请先在 .wl-skills/skills/sync/env.local.json 填写 menu.parentMenuId");
  }
  if (!config.sysAppNo) throw new Error("请先在 .wl-skills/skills/sync/env.local.json 填写 sysAppNo");
  if (!reportPath) throw new Error("未找到 SYS_MENU_INFO*.md，请传 reportPath 或先生成 .wl-skills/reports/SYS_MENU_INFO.md");
  if (parsed.dirs.length === 0 && parsed.pages.length === 0) {
    throw new Error(`未从报告解析到菜单数据：${path.relative(getProjectRoot(), reportPath)}`);
  }
  return parentId;
}

function reportPlanRows(parsed, config, parentId, flatMenus) {
  const parent = flatMenus.find((item) => String(item.id) === String(parentId)) || {};
  const parentCode = parent.menuNameCode || parent.nameCode || "";
  const dirIds = new Map();
  const rows = [];
  for (let index = 0; index < parsed.dirs.length; index += 1) {
    const item = parsed.dirs[index];
    const existing = findExisting(flatMenus, { ...item, parentId });
    const body = buildMenuBody(item, config, parentId, parentCode, item.orderNum || index + 1);
    if (existing) body.id = existing.id;
    dirIds.set(item.menuName, existing?.id || `[pending:${item.path}]`);
    rows.push({ action: existing ? "update" : "create", item: body });
  }
  appendPagePlanRows({ rows, pages: parsed.pages, config, rootParentId: parentId, parentCode, dirIds, flatMenus });
  return rows;
}

function appendPagePlanRows(context) {
  const { rows, pages, config, rootParentId, parentCode, dirIds, flatMenus } = context;
  for (let index = 0; index < pages.length; index += 1) {
    const item = pages[index];
    const parentId = dirIds.get(item.parentMenuName) || rootParentId;
    const parent = flatMenus.find((menu) => String(menu.id) === String(parentId)) || {};
    const existing = findExisting(flatMenus, { ...item, parentId });
    const body = buildMenuBody(item, config, parentId, parent.menuNameCode || parentCode, index + 1);
    if (existing) body.id = existing.id;
    rows.push({ action: existing ? "update" : "create", item: body });
  }
}

async function buildReportPlan(args, config) {
  const reportPath = resolveReportPath(args.reportPath);
  const parsed = reportPath ? parseReport(fs.readFileSync(reportPath, "utf8")) : { dirs: [], pages: [] };
  const parentId = validateReportInputs(config, reportPath, parsed);
  const menuState = await queryMenuState(config);
  const rows = reportPlanRows(parsed, config, parentId, menuState.flatMenus);
  const rel = path.relative(getProjectRoot(), reportPath).replace(/\\/g, "/");
  const value = { schemaVersion: 1, sysAppNo: config.sysAppNo, domainId: String(menuState.domainId), parentId: String(parentId), reportPath: rel, parsed, remoteTree: menuState.tree };
  return { ...value, planHash: createPlanHash("menu-report-sync", value), rows, parsed, menuState };
}

async function saveDirectoryPlans(plan, config, rows) {
  const dirIds = new Map();
  for (const entry of plan.rows.filter((row) => row.item.type === "M")) {
    const saved = await saveMenu(entry.item, config);
    const id = saved.data?.id || entry.item.id;
    if (saved.ok && id) dirIds.set(entry.item.menuName, id);
    rows.push({ ...entry, ok: saved.ok, status: saved.ok ? "✅ 成功" : `❌ ${saved.error}` });
  }
  return dirIds;
}

async function savePagePlans(plan, config, dirIds, rows) {
  for (const entry of plan.rows.filter((row) => row.item.type === "C")) {
    const item = { ...entry.item };
    const source = plan.parsed.pages.find((page) => page.menuName === item.menuName);
    if (source && dirIds.has(source.parentMenuName)) item.parentId = dirIds.get(source.parentMenuName);
    const saved = await saveMenu(item, config);
    rows.push({ ...entry, item, ok: saved.ok, status: saved.ok ? "✅ 成功" : `❌ ${saved.error}` });
  }
}

function formatReportRows(plan, rows, mode) {
  const lines = [
    `${mode === "apply" ? "✅" : "🔍"} SYS_MENU_INFO ${mode === "apply" ? "同步完成" : "同步预览"}：${plan.reportPath}`,
    "", `- 一级目录：${plan.parsed.dirs.length}`, `- 二级菜单：${plan.parsed.pages.length}`,
    `- planHash：${plan.planHash}`, "", "| 操作 | 类型 | 菜单名 | path | parentId | 状态 |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of rows) lines.push(`| ${row.action} | ${row.item.type} | ${row.item.menuName} | ${row.item.path} | ${row.item.parentId} | ${row.status || "预览"} |`);
  return lines.join("\n");
}

async function handleMenuSyncFromReport(args = {}, config) {
  const earlyBlock = args.confirmApply === true ? writeBlockReason(config) : "";
  if (earlyBlock) return blockedResult(earlyBlock, "blocked", { mode: "apply" });
  let plan;
  try {
    plan = await buildReportPlan(args, config);
  } catch (error) {
    return blockedResult(error.message, "blocked", { mode: args.confirmApply === true ? "apply" : "preview" });
  }
  if (args.confirmApply !== true || args.dryRun === true) {
    return previewResult(formatReportRows(plan, plan.rows, "preview"), plan, {
      summary: { directories: plan.parsed.dirs.length, pages: plan.parsed.pages.length }, actions: plan.rows,
    });
  }
  const stale = validatePlanHash(args, plan);
  if (stale) return stale;
  const rows = [];
  const dirIds = await saveDirectoryPlans(plan, config, rows);
  await savePagePlans(plan, config, dirIds, rows);
  const ok = rows.every((row) => row.ok);
  const result = completedResult(formatReportRows(plan, rows, "apply"), {
    planHash: plan.planHash, summary: { directories: plan.parsed.dirs.length, pages: plan.parsed.pages.length }, results: rows,
  });
  return ok ? result : { ...result, isError: true, structuredContent: { ...result.structuredContent, ok: false, state: "partial" } };
}
module.exports = {
  handleDomainQuery,
  handleMenuQuery,
  handleMenuUpsert,
  handleMenuDelete,
  handleMenuSyncFromReport,
  // 导出纯工具函数供单测覆盖
  _internal: {
    cleanCell,
    splitMarkdownRow,
    isDividerRow,
    parseBoolean,
    normalizeTree,
    flattenMenus,
    findExisting,
    getReportDirs,
    findLatestReport,
    resolveReportPath,
    locateAppDomain,
    resolveDomainId,
    parseReport,
  },
};

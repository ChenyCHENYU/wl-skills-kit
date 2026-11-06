"use strict";

// Package-local checks: task records own the baseline; no background watcher or business switch.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { resolveProjectPath } = require("./project-path");
const { analyzeTask } = require("./task-intent.cjs");
const LIMIT = 4000;
const PAGE_ROOTS = ["src/views", "src/pages", "pages"];
const ROOT_REGISTRATION = /^(?:pages|routes)\.(?:[cm]?[jt]s|json)$/;
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const slash = value => value.split(path.sep).join("/");

const menuOrderPatterns = [
  /(?:调整|修改|更改|修复|统一|重排|更新)[^，。；;\n]{0,16}(?:菜单|导航)(?!配置|组件|页面|样式|标题|字段|数据)[^，。；;\n]{0,16}(?:顺序|排序)/,
  /(?:菜单|导航)(?!配置|组件|页面|样式|标题|字段|数据)[^，。；;\n]{0,18}(?:顺序|排序)\s*(?:改|调整|设|更新|调到)/,
  /(?:菜单|导航)(?!配置|组件|页面|样式|标题|字段|数据)[^，。；;\n]{0,18}(?:放|移|挪|调)[^，。；;\n]{0,16}(?:前面|后面|之前|之后)/,
  /(?:给|为)[^，。；;\n]{0,12}(?:菜单|导航)排序/,
  /(?:菜单|导航)[^，。；;\n]{0,18}(?:置顶|置底|上移|下移)/,
];
const frontendMenuOrder = /菜单(?:配置页|页|组件|样式)|导航栏(?:的)?(?:按钮|图标|组件|样式)|(?:只|仅)(?:改|调|修改|调整)\s*(?:Vue|CSS|样式|组件)/i;

function menuOrderMatch(active) {
  for (const clause of active.split(/[，,。；;\n]/)) {
    if (frontendMenuOrder.test(clause)) continue;
    const matched = menuOrderPatterns.map(pattern => clause.match(pattern)?.[0]).find(Boolean);
    if (matched) return matched;
  }
}

function scopeKind(task) {
  const active = analyzeTask(task).activeText;
  if (menuOrderMatch(active)) return "menu-order";
  if (!/(?:调整|修改|更改|修复|补齐|增加|添加|统一|实现|重排|排序)/.test(active)) return null;
  return /(?:批量|统一|全部|所有)[^。；\n]{0,60}(?:页面|工位|查询反馈)|(?:页面|工位)[^。；\n]{0,30}(?:批量|统一|全部|所有)/.test(active) ? "batch-pages" : null;
}

function sourceFiles(root) {
  const files = [];
  const problems = [];
  function visit(relative) {
    const physical = path.join(root, relative);
    if (!fs.existsSync(physical)) return;
    if (fs.lstatSync(physical).isSymbolicLink()) { problems.push(`未跟随符号链接：${relative}`); return; }
    for (const entry of fs.readdirSync(physical, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
      const file = slash(path.join(relative, entry.name));
      if (files.length >= LIMIT) { problems.push(`源码清单超过 ${LIMIT} 文件，需缩小项目范围`); return; }
      if (entry.isSymbolicLink()) { problems.push(`未跟随符号链接：${file}`); continue; }
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  ["src", "vite", "pages", "router", "routes"].forEach(visit);
  files.push(...fs.readdirSync(root).filter(file => ROOT_REGISTRATION.test(file)));
  return { files: files.sort(), problems: [...new Set(problems)] };
}

function protectedSource(file) {
  return withinScanRoots(file, PAGE_ROOTS) || /(?:^|\/)pages\.[cm]?[jt]s$/.test(file)
    || /^(?:src\/)?(?:router|routes)\//.test(file) || ROOT_REGISTRATION.test(file);
}

function inspectSources(root, includeBehavior = true) {
  const inventory = sourceFiles(root);
  const dependencyFiles = includeBehavior ? ["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock"].filter(file => fs.existsSync(path.join(root, file))) : [];
  const files = {};
  const behaviorFiles = {};
  let bytes = 0;
  // Runtime input is not limited to code extensions: shared JSON/styles/templates
  // can change page behavior too. Menu-only checks need only protected sources.
  for (const file of [...inventory.files.filter(file => includeBehavior || protectedSource(file)), ...dependencyFiles]) {
    const physical = path.join(root, file);
    const stat = fs.lstatSync(physical);
    if (stat.isSymbolicLink()) { inventory.problems.push(`未跟随符号链接：${file}`); continue; }
    if (!stat.isFile()) { inventory.problems.push(`不是普通文件，未取证：${file}`); continue; }
    const { size } = stat;
    bytes += size;
    if (size > 2 * 1024 * 1024 || bytes > 32 * 1024 * 1024) { inventory.problems.push(`超过单文件2MiB/总32MiB预算，未取证：${file}`); continue; }
    const hash = digest(fs.readFileSync(physical));
    behaviorFiles[file] = hash;
    if (protectedSource(file)) files[file] = hash;
  }
  const pages = inventory.files.filter(file => file.endsWith("/index.vue"))
    .map(file => path.posix.dirname(file)).filter(page => withinScanRoots(page) && !PAGE_ROOTS.includes(page));
  return { files, pages, problems: inventory.problems, fingerprint: digest(JSON.stringify(behaviorFiles)) };
}

function normalizePage(root, input) {
  if (typeof input !== "string" || !input.trim()) throw new Error("页面路径必须为非空字符串");
  const local = slash(path.relative(root, resolveProjectPath(root, input)));
  return local.endsWith("/index.vue") ? local.slice(0, -10) : local;
}

function readSelection(root, file, candidates) {
  if (!file) return null;
  const physical = resolveProjectPath(root, file);
  if (fs.statSync(physical).size > 256 * 1024) throw new Error("page-scope 清单超过 256 KiB");
  const value = JSON.parse(fs.readFileSync(physical, "utf8"));
  validateSelection(value);
  const affectedPages = value.affectedPages.map(page => ({ path: normalizePage(root, page.path), expectation: String(page.expectation || "").trim() }));
  const excludedPages = value.excludedPages.map(page => ({ path: normalizePage(root, page.path), reason: String(page.reason || "").trim() }));
  const all = [...affectedPages, ...excludedPages];
  if (all.some(page => !candidates.includes(page.path)) || new Set(all.map(page => page.path)).size !== all.length) throw new Error("page-scope 包含未知或重复页面");
  if (affectedPages.some(page => !page.expectation) || excludedPages.some(page => !page.reason)) throw new Error("影响页面须有 expectation，排除页面须有 reason");
  const scanRoots = readScanRoots(root, value.scanRoots);
  if (all.some(page => !withinScanRoots(page.path, scanRoots))) throw new Error("声明页面不在显式 scanRoots 范围内");
  return { affectedPages, excludedPages, scanRoots, basis: value.basis.trim(), file: slash(path.relative(root, physical)), sha256: digest(fs.readFileSync(physical)) };
}

function readScanRoots(root, input) {
  if (input === undefined) return PAGE_ROOTS;
  if (!Array.isArray(input) || !input.length || input.some(value => typeof value !== "string")) throw new Error("scanRoots 须为非空目录数组，未指定则核对全部候选；不从影响页反推全集");
  return [...new Set(input.map(value => {
    const physical = resolveProjectPath(root, value);
    if (!fs.statSync(physical).isDirectory()) throw new Error("scanRoots 必须是已存在的项目内目录");
    return slash(path.relative(root, physical));
  }))];
}

function withinScanRoots(page, roots = PAGE_ROOTS) {
  return roots.some(root => page === root || page.startsWith(`${root}/`));
}

function validateSelection(value) {
  if (!value || !Array.isArray(value.affectedPages) || !Array.isArray(value.excludedPages) || typeof value.basis !== "string" || !value.basis.trim()) {
    throw new Error("page-scope 需要 basis、affectedPages 数组和 excludedPages 数组");
  }
}

function defaultSelection(root, input, candidates) {
  const targets = (input.targets || []).map(target => normalizePage(root, target));
  const global = /所有|全部/.test(analyzeTask(input.task).activeText);
  const selected = global ? candidates : candidates.filter(page => targets.some(target => page === target || page.startsWith(`${target}/`)));
  return { affectedPages: selected.map(page => ({ path: page, expectation: "待补充可观察的功能预期" })), excludedPages: [], scanRoots: PAGE_ROOTS,
    basis: global ? "用户请求所有/全部页面；仍需核对候选中的组件和排除项" : "明确目标路径；独立页面候选仍需人工核对，组件引用不证明覆盖完整" };
}

function attachScope(decision, input, root) {
  const kind = decision.applicable === true ? scopeKind(input.task) : null;
  if (!kind) return decision;
  if (kind === "batch-pages" && decision.backendWorkflow) return decision;
  const baseline = inspectSources(root, kind === "batch-pages");
  const selection = kind === "batch-pages" ? readSelection(root, input.pageScope, baseline.pages) || defaultSelection(root, input, baseline.pages) : {};
  const changeScope = { kind, baseline, ...selection, candidateCompleteness: "filesystem-candidates-only; semantic scope needs confirmation" };
  return { ...decision, changeScope, requiredFiles: [...new Set([...decision.requiredFiles, ".wl-skills/guides/change-scope.md"])], requiredChecks: [...new Set([...decision.requiredChecks, ...scopeCheckIds(kind)])] };
}

function scopeCheckIds(kind) {
  return kind === "menu-order" ? ["menu-source-scope"] : ["batch-page-inventory", "batch-page-coverage", "batch-page-behavior"];
}

function changedFiles(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
}

function menuAssessment(scope, current) {
  const changes = changedFiles(scope.baseline.files, current.files);
  const problems = [...scope.baseline.problems, ...current.problems];
  const status = changes.length ? "failed" : problems.length ? "skipped" : "passed";
  return { kind: scope.kind, changes, problems, checks: [{ id: "menu-source-scope", status,
    reason: changes.length ? "菜单排序越界：页面源码/目录、pages 注册表或路由发生变化，恢复后再执行" : problems.length ? "基线不完整，不能证明源码范围未变" : "页面文件、pages 注册表和路由与任务基线一致；仅证明源码范围" }] };
}

function coveredPages(root, status, checkedFiles) {
  const candidates = [...(checkedFiles || []).map(file => ({ path: file })), ...(status.tools || []).flatMap(tool => tool.checkedFiles || [])];
  return new Set(candidates.filter(file => currentFile(root, file)).map(file => file.path).filter(file => file.endsWith("/index.vue")).map(file => path.posix.dirname(file)));
}

function currentFile(root, file) {
  try {
    const physical = resolveProjectPath(root, file.path);
    return fs.statSync(physical).isFile() && (!file.sha256 || digest(fs.readFileSync(physical)) === file.sha256);
  } catch { return false; }
}

function selectionProblems(root, scope, current) {
  const affected = new Set(scope.affectedPages.map(page => page.path));
  const candidates = [...new Set([...scope.baseline.pages, ...current.pages])];
  const changedPages = [...new Set(changedFiles(scope.baseline.files, current.files).flatMap(file => candidates.filter(page => file.startsWith(`${page}/`))))];
  const problems = [...scope.baseline.problems, ...current.problems];
  const unclassified = classificationGaps(scope, current);
  if (unclassified.length) problems.push(`扫描根内还有 ${unclassified.length} 个未分类候选页，须明确影响或排除理由：${unclassified.slice(0, 30).join("、")}`);
  if (!scope.affectedPages.length) problems.push("尚未确认受影响页面；用 --page-scope 声明范围与功能预期");
  if (scope.affectedPages.some(page => page.expectation === "待补充可观察的功能预期")) problems.push("尚未确认每页可观察的功能预期；组件引用和 grep 不足以证明功能生效");
  for (const page of changedPages.filter(page => !affected.has(page))) problems.push(`新增/删除、已排除或未声明的页面被修改：${page}`);
  if (scope.file && (!currentFile(root, { path: scope.file, sha256: scope.sha256 }))) problems.push("页面范围清单已变，请用同 runId 重新 task 后验证");
  return problems;
}

function classificationGaps(scope, current) {
  const declared = new Set([...scope.affectedPages, ...scope.excludedPages].map(page => page.path));
  return [...new Set([...scope.baseline.pages, ...current.pages])].filter(page => withinScanRoots(page, scope.scanRoots) && !declared.has(page));
}

function runPageVerifier(root, script, scope, current) {
  const physical = resolveProjectPath(root, script);
  const stat = fs.statSync(physical);
  if (!/\.[cm]?js$/.test(physical) || !stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error("page-verifier 必须是项目内已存在且不超过2MiB的 JS 测试适配脚本");
  const invocation = { executable: process.execPath, args: [slash(path.relative(root, physical))], cwd: root, sha256: digest(fs.readFileSync(physical)) };
  console.error(`逐页功能验证（显式选择）：${JSON.stringify(invocation)}`);
  const result = spawnSync(process.execPath, [physical], { cwd: root, input: JSON.stringify({ pages: scope.affectedPages, fingerprint: current.fingerprint, scopeFingerprint: selectionFingerprint(scope) }), encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) return { status: "failed", reason: "显式选择的逐页验证脚本失败/超时；未读取原始输出以避免泄露", invocation, pages: [] };
  if (!verificationInputsFresh(root, invocation, scope, current)) return { status: "failed", reason: "验证期间源码、范围或验证脚本改变，结果不采信", invocation, pages: [] };
  return verifierPages(JSON.parse(result.stdout), scope, invocation, current.fingerprint);
}

function verificationInputsFresh(root, invocation, scope, current) {
  return inspectSources(root).fingerprint === current.fingerprint && currentFile(root, { path: invocation.args[0], sha256: invocation.sha256 })
    && (!scope.file || currentFile(root, { path: scope.file, sha256: scope.sha256 }));
}

function selectionFingerprint(scope) {
  return digest(JSON.stringify({ affectedPages: scope.affectedPages, excludedPages: scope.excludedPages, scanRoots: scope.scanRoots, basis: scope.basis }));
}

function verifierPages(value, scope, invocation, fingerprint) {
  const { pages } = value;
  if (!Array.isArray(pages) || pages.length !== scope.affectedPages.length) throw new Error("page-verifier 必须逐一返回所有影响页面的 pages 结果");
  const expected = new Set(scope.affectedPages.map(page => page.path));
  for (const page of pages) {
    if (!expected.delete(page.path) || !["passed", "failed"].includes(page.status) || !Number.isInteger(page.assertions) || page.assertions < 1) throw new Error("page-verifier 页面重复、未知或没有实际断言计数");
  }
  return { status: pages.every(page => page.status === "passed") ? "passed" : "failed", reason: "实际执行指定项目脚本的逐页断言结果；测试质量和场景完整性仍需审阅", pageCount: pages.length, resultsSha256: digest(JSON.stringify(pages)), pages: pages.map(page => ({ path: page.path, status: page.status, assertions: page.assertions })), invocation, fingerprint, scopeFingerprint: selectionFingerprint(scope) };
}

function priorBehavior(root, status, scope, current) {
  const latest = (status.tools || []).filter(tool => matchingBehavior(tool.summary?.changeScope?.behavior, scope, current))
    .sort((left, right) => String(right.executionStartedAt || right.recordedAt).localeCompare(String(left.executionStartedAt || left.recordedAt))
      || Number(right.summary.changeScope.behavior.status === "failed") - Number(left.summary.changeScope.behavior.status === "failed"))[0]?.summary.changeScope.behavior;
  if (latest?.invocation && !currentFile(root, { path: latest.invocation.args[0], sha256: latest.invocation.sha256 })) {
    return { status: "skipped", reason: "最近一次验证的脚本已改变，须重新执行；不退回更旧的通过结果", pages: [] };
  }
  return latest || { status: "skipped", reason: "未运行逐页功能验证；静态扫描不能证明功能生效", pages: scope.affectedPages.map(page => ({ path: page.path, status: "unverified" })) };
}

function matchingBehavior(behavior, scope, current) {
  return behavior?.fingerprint === current.fingerprint && behavior.scopeFingerprint === selectionFingerprint(scope)
    && ["passed", "failed"].includes(behavior.status);
}

function assessScope(root, status, checkedFiles, verifier) {
  const scope = status.decision?.changeScope;
  if (!scope) return null;
  const current = inspectSources(root, scope.kind === "batch-pages");
  if (scope.kind === "menu-order") return menuAssessment(scope, current);
  const problems = selectionProblems(root, scope, current);
  const covered = coveredPages(root, status, checkedFiles);
  const missing = scope.affectedPages.filter(page => !covered.has(page.path)).map(page => page.path);
  const behavior = scopeBehavior(root, status, scope, current, problems, verifier);
  const unclassified = classificationGaps(scope, current);
  return { kind: scope.kind, problems, missing, unclassifiedCandidates: unclassified.slice(0, 200), unclassifiedCount: unclassified.length, behavior, checks: batchChecks(scope, problems, missing, behavior) };
}

function scopeBehavior(root, status, scope, current, problems, verifier) {
  if (problems.length) return { status: "skipped", reason: "范围清单尚未闭合，未运行/采信逐页行为验证", pages: [] };
  if (!verifier) return priorBehavior(root, status, scope, current);
  let behavior;
  try { behavior = runPageVerifier(root, verifier, scope, current); }
  catch { behavior = { status: "failed", reason: "逐页验证脚本路径/输出不可核对；本次失败不能由旧成功或静态扫描消项", pages: [] }; }
  return { ...behavior, fingerprint: current.fingerprint, scopeFingerprint: selectionFingerprint(scope) };
}

function batchChecks(scope, problems, missing, behavior) {
  return [
    { id: "batch-page-inventory", status: problems.length ? "skipped" : "passed", reason: problems.join("；") || "已声明范围依据、逐页预期与排除理由；语义范围仍由需求审阅确认" },
    { id: "batch-page-coverage", status: missing.length || !scope.affectedPages.length ? "skipped" : "passed", reason: missing.length ? `尚未静态校验：${missing.join("、")}` : "已声明页面 index.vue 均有当前源码的实际静态校验记录" },
    { id: "batch-page-behavior", status: problems.length ? "skipped" : behavior.status, reason: behavior.reason },
  ];
}

function enforceMenuTask(root, status, name, input) {
  if (status.decision?.changeScope?.kind !== "menu-order" || !/^wls_menu_(?:upsert|sync_from_report|delete)$/.test(name)) return;
  const assessment = assessScope(root, status);
  if (assessment.checks.some(check => check.status !== "passed")) throw new Error("菜单排序源码边界未通过；禁止继续写入菜单，请先核对 status 中的 changeScopeVerification");
  if (name !== "wls_menu_upsert") throw new Error("仅排序任务只允许 wls_menu_upsert 的 orderOnly 模式，不能同步报告或删除菜单");
  input.orderOnly = true;
}

module.exports = { attachScope, assessScope, enforceMenuTask, menuOrderMatch, scopeKind };

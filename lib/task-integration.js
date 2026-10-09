"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const core = require("./task-observability.cjs");
const { canonicalSkills } = require("./editor-adapters");
const { GATEWAY_PATH } = require("./task-gateway");
const pkg = require("../package.json");
const files = path.resolve(__dirname, "../files");
const standardMap = require("../files/.wl-skills/standards/task-map.json");
const standardFiles = fs.readdirSync(path.join(files, ".wl-skills/standards")).filter((name) => /^\d{2}-.+\.md$/.test(name));
function ruleIds(ids) { return ids.map((id) => standardFiles.find((file) => file.startsWith(`${id}-`))?.replace(/\.md$/, "")).filter(Boolean); }
const POLICY = {
  domainKeywords: ["前端", "页面", "Vue", "data.ts", "api.md", "菜单", "字典", "权限", "规范审计"],
  domainExtensions: [".vue"],
  negativeKeywords: ["写诗", "诗歌", "旅游", "旅行", "天气", "做饭"],
  baselineRules: ruleIds(standardMap.baseline),
  baselineChecks: ["validate"],
  minimumScore: 1,
  minimumMargin: 1,
  unsupportedIntents: ["React", "Svelte", "Angular"],
};

function routeKeywords() {
  const registry = fs.readFileSync(path.join(files, ".wl-skills/skills/_registry.md"), "utf8");
  const rows = registry.split(/\r?\n/).filter((line) => line.includes("✅ 启用"));
  return new Map(rows.map((row) => {
    const cells = row.split("|").map((cell) => cell.trim());
    const triggers = cells[5].split(" / ").map((value) => value.replace(/\*\*/g, "").replace(/[（(].*$/, "").trim());
    return [cells[1], triggers];
  }));
}

function taskCatalog() {
  const keywords = routeKeywords();
  return canonicalSkills(files).map((skill) => ({
    id: skill.name, path: skill.canonicalPath, description: skill.description,
    triggers: skill.name === "business-doc-extract" ? ["业务梳理", "模块沉淀", "字段字典维护", "待确认事项整理"] : keywords.get(skill.name),
    negative: skill.name === "business-doc-extract" ? ["小修小改", "碎片问答"] : [],
    rules: ruleIds(standardMap.skills[skill.name] || []),
    checks: skill.canonicalPath.includes("/sync/") ? ["backend-preview-and-confirmation"] : ["validate"],
    status: "enabled",
  }));
}

function taskOptions(projectRoot, extra = {}) {
  const actualRoot = fs.realpathSync(path.resolve(projectRoot));
  return { projectRoot: actualRoot, packageName: pkg.name, packageVersion: pkg.version, storageDir: ".wl-skills/runs",
    ruleFiles: projectEvidencePaths(actualRoot, [path.join(__dirname, "ast-rules.js"), path.resolve(__dirname, "../bin/wl-skills.js"), path.join(actualRoot, ".wl-skills/standards")]),
    configFiles: projectEvidencePaths(actualRoot, [".wl-skills-validate.json", "package.json", "tsconfig.json"].map((rel) => path.join(actualRoot, rel))), ...extra };
}

function projectEvidencePaths(root, candidates) {
  return candidates.filter((candidate) => fs.existsSync(candidate)).map((candidate) => path.relative(root, fs.realpathSync(candidate)).replace(/\\/g, "/"))
    .filter((rel) => rel && !rel.startsWith("../") && !path.isAbsolute(rel));
}

function initialDecision(input, catalog) {
  const onlyGit = /(?:git\s+(?:commit|push|pull|status|diff)|提交|推送|合并|分支)/i.test(input.task) && !/生成|创建页面|修改|修复|实现|重构|新增/i.test(input.task);
  const syncOnly = input.skill?.endsWith("-sync") || /同步(?:菜单|字典|权限)|(?:菜单|字典|权限)同步/.test(input.task);
  const policy = onlyGit ? { ...POLICY, domainKeywords: ["Git", "提交", "推送", "合并", "分支"], baselineRules: ruleIds(["08"]), baselineChecks: [] } : syncOnly ? { ...POLICY, baselineRules: [] , baselineChecks: [] } : POLICY;
  return core.evaluateTask({ ...input, catalog: onlyGit ? [] : catalog, policy });
}

function decideTask(input) {
  const catalog = taskCatalog();
  const decision = initialDecision(input, catalog);
  if (input.skill && !catalog.some((skill) => skill.id === input.skill)) return capabilityGap(decision, `本包未发布专项 Skill：${input.skill}`);
  if (POLICY.unsupportedIntents.some((intent) => String(input.task).toLowerCase().includes(intent.toLowerCase()))) return capabilityGap(decision, "本包页面实现器目前只支持 Vue；所请求框架没有已发布的执行器");
  if (decision.applicable === true) {
    const signals = `${input.task} ${(input.context?.signals || []).join(" ")}`.toLowerCase();
    const conditional = standardMap.conditional.filter((entry) => entry.keywords.some((word) => signals.includes(word.toLowerCase()))).flatMap((entry) => entry.rules);
    decision.requiredRules = [...new Set([...decision.requiredRules, ...ruleIds(conditional)])];
    decision.ruleDetails = decision.requiredRules.map((id) => ({ id, name: fs.readFileSync(path.join(files, `.wl-skills/standards/${id}.md`), "utf8").match(/^#\s+(.+)$/m)?.[1] || id, source: `.wl-skills/standards/${id}.md` }));
    decision.requiredFiles = [...new Set([...decision.requiredFiles, ...decision.ruleDetails.map((rule) => rule.source), ".wl-skills/standards/task-map.json"])];
  }
  return decision;
}

function capabilityGap(decision, reason) {
  return { ...decision, routingStatus: decision.status, status: "gap", applicable: true, ready: false, selectedSkills: [], requiredFiles: [], reasons: [...decision.reasons, reason], reason, gaps: [{ reason, suggestion: "提交本包专项能力/规则/执行器提案，经测试和人工审阅后再启用；不自动修改技能" }] };
}

function hostDiagnostic(opts) {
  const entries = new Map([["claude", ["CLAUDE.md"]], ["claude-code", ["CLAUDE.md"]], ["copilot", [".github/copilot-instructions.md"]], ["github-copilot", [".github/copilot-instructions.md"]], ["cursor", [".cursor/rules/wl-skills-kit.mdc"]]]);
  return core.doctorHost({ ...opts, entryFiles: entries.get(opts.host) || ["AGENTS.md"], skillPaths: taskCatalog().map((skill) => skill.path), gatewayPath: GATEWAY_PATH });
}

function inputOptions(input) {
  return taskOptions(input.projectRoot || process.env.WL_PROJECT_ROOT || process.cwd(), { runId: input.runId, targets: input.targets || [] });
}

function runTaskAction(action, input = {}) {
  const opts = inputOptions(input);
  const task = input.task || "";
  if (action === "status") return core.readStatus(opts);
  if (action === "doctor-host") return hostDiagnostic({ ...opts, host: input.host || "unknown" });
  const decision = decideTask({ task, targets: opts.targets, context: input.context, skill: input.skill });
  assetReadiness(decision, opts.projectRoot);
  if (action !== "task") return core.attachNotice(decision, opts);
  return core.attachNotice({ ...decision, ...core.startTask({ ...opts, task, decision }) }, opts);
}

function taskCli(action, args, projectRoot) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    target: { type: "string", multiple: true }, project: { type: "string" }, text: { type: "string" },
    "run-id": { type: "string" }, host: { type: "string" }, skill: { type: "string" }, json: { type: "boolean" },
  } });
  const result = runTaskAction(action, { projectRoot: values.project || projectRoot, task: values.text || positionals.join(" "), targets: values.target, runId: values["run-id"], host: values.host, skill: values.skill });
  if (values.json || action === "doctor-host") console.log(JSON.stringify(result));
  else if (action === "status") console.log(core.formatStatus(result));
  else console.log(`${core.formatDecision(result)}${result.runId ? `\nrunId: ${result.runId}` : ""}`);
  return result;
}

function assetReadiness(decision, projectRoot) {
  if (decision.applicable !== true) return;
  const required = [...decision.requiredFiles, ...decision.requiredRules.map((id) => `.wl-skills/standards/${id}.md`)];
  const missing = required.filter((rel) => !fs.existsSync(path.join(projectRoot, rel)));
  decision.ready = decision.ready !== false && missing.length === 0;
  decision.missingInputs = missing;
  if (missing.length) {
    decision.routingStatus ||= decision.status;
    decision.status = "gap";
    decision.reasons.push("本包所需 canonical Skill/规范尚未安装到目标项目");
    decision.reason = decision.reasons.join("；");
    decision.gaps.push({ reason: "本包所需 canonical Skill/规范尚未安装到目标项目", paths: missing, suggestion: "执行本包 init/update 后重新判定；不需要安装兄弟包" });
  }
}

function pageCheck(summary, errors) {
  if (!summary.pages) return { id: "validate", status: "skipped", reason: "No applicable page scanned" };
  return { id: "validate", status: errors > 0 ? "failed" : "passed", reason: "Actual validate pipeline ran; not a claim of all semantic standards" };
}

function typeCheckFact(summary) {
  const result = summary.typeCheckResult || {};
  if (!result.ran) return { id: "typecheck", status: "skipped", reason: "Not enabled or unavailable" };
  return { id: "typecheck", status: result.errors > 0 ? "failed" : "passed", reason: "Actual compiler invocation" };
}

function astCheck(summary, issues) {
  if (!summary.astAvailable || !summary.astPages) return { id: "ast", status: "skipped", reason: "AST parser unavailable or no applicable AST page" };
  const errors = issues.some((issue) => issue.level === "error" && /^K\d+$/.test(issue.rule) && issue.rule !== "K14");
  return { id: "ast", status: errors ? "failed" : "passed", reason: `AST pages ${summary.astPages}; cache hits ${summary.astCacheHits || 0}` };
}

function validationFacts(summary, issues, strict = false) {
  const errors = issues.filter((issue) => issue.level === "error").length;
  const warns = issues.filter((issue) => issue.level === "warn").length;
  const checks = [pageCheck(summary, errors), typeCheckFact(summary), astCheck(summary, issues)];
  return { exitCode: errors > 0 || strict && warns > 0 ? 1 : 0, validationStatus: summary.pages > 0 ? errors > 0 ? "failed" : "passed" : "unverified", checkedFiles: summary.checkedFiles || [], checks, summary: { ...summary, errors, warns } };
}

function taskToolDescriptors() {
  return ["task", "route", "explain", "status", "doctor-host"].map((action) => ({
    name: `wls_${action.replace(/-/g, "_")}`,
    description: `Kit ${action}: task decision, own execution evidence or static host diagnosis; never proves host loading from a model declaration.`,
    inputSchema: { type: "object", properties: { task: { type: "string" }, targets: { type: "array", items: { type: "string" } }, runId: { type: "string" }, host: { type: "string" }, skill: { type: "string" } } },
    needsBackendConfig: false, observabilityAction: true,
    handle: (input) => JSON.stringify(runTaskAction(action, input)),
  }));
}

function beginMcpTool(desc, input) {
  if (desc.observabilityAction) return null;
  return core.beginExecution(taskOptions(process.env.WL_PROJECT_ROOT || process.cwd(), {
    tool: desc.name, runId: input.runId, targets: input.path ? [input.path] : [], readOnlyVerification: true,
  }));
}

function finishMcpTool(handle, desc, normalized) {
  if (!handle) return undefined;
  const validation = desc.name === "wls_validate_page" ? normalized.structuredContent : null;
  const facts = { exitCode: normalized.isError ? 1 : 0, validationStatus: "unverified", checks: [], summary: {} };
  if (validation) Object.assign(facts, validationMcpFacts(validation));
  const receipt = core.finishExecution(handle, facts);
  return { runId: receipt.runId, executionStatus: receipt.executionStatus, validationStatus: receipt.validationStatus, receiptPath: receipt.recordPath };
}

function validationMcpFacts(validation) {
  return { validationStatus: validation.validationStatus || "unverified", checkedFiles: validation.summary?.checkedFiles || [], checks: [{ id: "validate", status: validation.ok ? "passed" : "failed", reason: "Actual validation CLI result" }], summary: validation.summary || {} };
}

module.exports = { core, taskOptions, taskCatalog, decideTask, runTaskAction, taskCli, validationFacts, taskToolDescriptors, beginMcpTool, finishMcpTool };

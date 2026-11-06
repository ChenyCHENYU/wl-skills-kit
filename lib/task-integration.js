"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const core = require("./task-observability.cjs");
const projectScope = require("./project-scope.cjs");
const taskIntent = require("./task-intent.cjs");
const { resolveResourcePath, resolveResource } = require("./project-integration.cjs");
const { projectResult } = require("./integration-result.cjs");
const { canonicalSkills } = require("./editor-adapters");
const { GATEWAY_PATH } = require("./task-gateway");
const changeScope = require("./change-scope");
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


function taskCatalog() {
  const keywords = standardMap.triggers;
  return canonicalSkills(files).map((skill) => ({
    id: skill.name, name: skill.title, path: skill.canonicalPath, description: skill.description,
    triggers: keywords[skill.name] || [],
    triggerCondition: standardMap.triggerConditions?.[skill.name],
    negative: skill.name === "business-doc-extract" ? ["小修小改", "碎片问答"] : [],
    rules: ruleIds(standardMap.skills[skill.name] || []),
    ...standardMap.skillPolicies[skill.name],
    status: "enabled",
  }));
}

function taskOptions(projectRoot, extra = {}) {
  const actualRoot = fs.realpathSync(path.resolve(projectRoot));
  return { projectRoot: actualRoot, packageName: pkg.name, packageVersion: pkg.version, storageDir: ".wl-skills/state/kit/runs",
    ruleFiles: [path.join(__dirname, "ast-rules.js"), path.join(__dirname, "change-scope.js"), path.resolve(__dirname, "../bin/wl-skills.js"), path.resolve(__dirname, "../package.json"), resolveResourcePath(actualRoot, ".wl-skills/standards", path.resolve(__dirname, ".."))],
    configFiles: projectEvidencePaths(actualRoot, [".wl-skills-validate.json", "package.json", ".wl-skills/config.json", "tsconfig.json"].map((rel) => path.join(actualRoot, rel))), ...extra };
}

function projectEvidencePaths(root, candidates) {
  return candidates.filter((candidate) => fs.existsSync(candidate)).map((candidate) => projectEvidencePath(root, candidate)).filter(Boolean);
}

function evidenceRelative(root, target) {
  const relative = path.relative(root, target);
  return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) ? relative.replace(/\\/g, "/") : null;
}

function projectEvidencePath(root, candidate) {
  const physical = fs.realpathSync(candidate);
  const local = evidenceRelative(root, physical);
  if (local) return local;
  const dependency = path.join(root, "node_modules", pkg.name);
  if (!fs.existsSync(dependency)) return null;
  const internal = evidenceRelative(fs.realpathSync(dependency), physical);
  // The shared reader still verifies package identity and its own realpath boundary.
  return internal ? `node_modules/${pkg.name}/${internal}` : null;
}

function initialDecision(input, catalog) {
  const active = taskIntent.analyzeTask(input.task).activeText;
  const routedCatalog = conditionalCatalog(input, catalog);
  const explicit = input.skill && routedCatalog.find((skill) => skill.id === input.skill);
  const gitOnly = !explicit && gitOnlyTask(active, routedCatalog);
  const policy = gitOnly ? { ...POLICY, domainKeywords: ["Git", "提交", "推送", "合并", "分支"], baselineRules: ruleIds(["08"]), baselineChecks: [] } : POLICY;
  const selectedInput = explicitInput(input, gitOnly ? [] : routedCatalog, explicit);
  let decision = core.evaluateTask({ ...selectedInput, policy });
  if (explicit) {
    const reason = `显式选择 ${explicit.name}（${explicit.id}）；动作许可仍依据原始任务判定`;
    decision = { ...decision, selectionEvidence: "explicit-skill-id", reasons: [reason], reason };
  }
  decision = retainIndependentStages(decision, input, routedCatalog, catalog, active, policy);
  return applySkillPolicy(decision, input, catalog);
}

function gitOnlyTask(active, catalog) {
  const onlyGit = /(?:git\s+(?:commit|push|pull|status|diff)|提交|推送|合并|分支)/i.test(active) && !/生成|创建页面|修改|修复|实现|重构|新增/i.test(active);
  return onlyGit && !catalog.some((skill) => skill.baselinePolicy === "own-domain" && skill.triggers.some((trigger) => taskIntent.phraseMatches(active, trigger)));
}

function explicitInput(input, catalog, explicit) {
  if (!explicit) return { ...input, catalog };
  const signals = Array.isArray(input.context?.signals) ? input.context.signals : [];
  return { ...input, context: { ...input.context, domainRelevant: true, signals: [...signals, explicit.id] }, catalog: [{ ...explicit, triggers: [], negative: [], contexts: [explicit.id] }] };
}

function retainIndependentStages(decision, input, catalog, canonical, active, policy) {
  if (input.skill) return decision;
  const independent = catalog.filter((skill) => skill.baselinePolicy === "own-domain" && skill.triggers.some((trigger) => taskIntent.phraseMatches(active, trigger)));
  const pageCreation = /(?:创建|新建|新增|生成|实现|开发)[^，。；;\n]{0,16}(?:页面|管理页|列表页)/i.test(active);
  const clauses = independentClauseSkills(input, canonical, active, policy);
  if (independent.length < 2 && clauses.length < 2 && !(independent.length && pageCreation)) return decision;
  const ids = [...new Set([...independent.map((skill) => skill.id), ...clauses, ...(pageCreation ? ["page-codegen"] : [])])];
  const reason = "任务包含多个独立能力，请分别执行明确的阶段并复用同一 runId，或指定本次能力";
  return { ...decision, status: "ambiguous", selectedSkills: [], skillDetails: [], requiredFiles: [], requiredChecks: [...policy.baselineChecks], requiredRules: [...policy.baselineRules], reasons: [reason], reason, independentSkills: ids };
}

function independentClauseSkills(input, catalog, active, policy) {
  const clauses = active.split(/，|；|(?:并且|同时|然后|并|以及|和)(?=\s*(?:请|再|另外|创建|新建|新增|生成|修改|修复|检查|审计|同步|解析|抽取|提取|整理|给|为))/);
  if (clauses.length < 2) return [];
  return [...new Set(clauses.flatMap((task) => core.evaluateTask({ ...input, task, catalog: conditionalCatalog({ ...input, task }, catalog), policy }).selectedSkills))];
}

function conditionalCatalog(input, catalog) {
  const active = taskIntent.analyzeTask(input.task).activeText;
  const menuOrder = changeScope.menuOrderMatch(active);
  const routed = catalog.map((skill) => {
    const exclusions = (skill.negativePatterns || []).map((pattern) => new RegExp(pattern, "i"));
    const relevant = exclusions.length ? active.split(/，|；|(?:并|同时|以及)(?=\s*(?:请|再|创建|新增|新建|查询|同步|给|为))/).filter((clause) => !exclusions.some((pattern) => pattern.test(clause))).join("，") : active;
    const condition = skill.triggerCondition;
    const quantified = (skill.intentPatterns || []).flatMap((pattern) => relevant.match(new RegExp(pattern, "gi")) || []);
    const declared = exclusions.length ? skill.triggers.filter((trigger) => taskIntent.phraseMatches(relevant, trigger)) : skill.triggers;
    if (skill.id === "menu-sync" && menuOrder) quantified.push(menuOrder);
    const triggers = [...new Set([...declared, ...quantified])];
    if (!condition || triggerEvidence(input, condition)) return { ...skill, triggers };
    return { ...skill, triggers: triggers.filter((word) => !condition.triggers.includes(word)) };
  });
  // 名称里的“角色/权限/字典”不代表独立动作；完整对象“权限管理菜单”
  // 应由菜单能力处理。带并列词或另一动作的命中保留，交给复合请求判定。
  const text = active.toLowerCase();
  const hits = routed.filter((skill) => skill.baselinePolicy === "own-domain").flatMap((skill) => skill.triggers.filter((trigger) => taskIntent.phraseMatches(active, trigger)).map((trigger) => ({ id: skill.id, trigger, start: text.indexOf(trigger.toLowerCase()), end: text.indexOf(trigger.toLowerCase()) + trigger.length })));
  return routed.map((skill) => ({ ...skill, triggers: skill.triggers.filter((trigger) => !hits.some((inner) => inner.id === skill.id && inner.trigger === trigger && hits.some((outer) => containsObjectName(text, inner, outer)))) }));
}

function containsObjectName(text, inner, outer) {
  if (outer.id === inner.id || outer.start > inner.start || outer.end < inner.end || outer.trigger.length <= inner.trigger.length) return false;
  const surrounding = text.slice(outer.start, inner.start) + text.slice(inner.end, outer.end);
  return !/并|同时|以及|和|及|、|然后|创建|新增|同步|查询|授权|分配/.test(surrounding);
}

function applySkillPolicy(decision, input, catalog) {
  const selected = catalog.filter((skill) => decision.selectedSkills.includes(skill.id));
  const backend = selected.filter((skill) => skill.baselinePolicy === "own-domain");
  if (!backend.length) return decision;
  const active = taskIntent.analyzeTask(input.task).activeText;
  const frontend = standardMap.frontendEvidence;
  const hasFrontend = frontend.taskKeywords.some((word) => taskIntent.phraseMatches(active, word))
    || (input.targets || []).some((target) => targetTriggerEvidence(target, frontend));
  const baselineRules = hasFrontend ? decision.baselineRules : [];
  const queryOnly = !changeScope.menuOrderMatch(active) && backend.every((skill) => (skill.queryPatterns || []).some((pattern) => new RegExp(pattern, "i").test(active)))
    && !backend.some((skill) => (skill.intentPatterns || []).filter((pattern) => !(skill.queryPatterns || []).includes(pattern)).some((pattern) => new RegExp(pattern, "i").test(active)));
  const stage = queryOnly ? "backend-query" : "backend-preview";
  return { ...decision, baselineRules,
    requiredRules: [...new Set([...baselineRules, ...selected.flatMap((skill) => skill.rules)])],
    requiredChecks: [...new Set([...(hasFrontend ? POLICY.baselineChecks : []), ...selected.filter((skill) => skill.baselinePolicy !== "own-domain").flatMap((skill) => skill.checks), stage])],
    backendWorkflow: { domains: backend.map((skill) => skill.domain), requiredStage: stage,
      stages: queryOnly ? ["query"] : ["preview", "apply", "postverify"],
      applyRequires: "explicit-confirmation-and-matching-planHash", postverify: "reported-only-from-actual-tool-result" },
  };
}

function triggerEvidence(input, condition) {
  const task = taskIntent.analyzeTask(input.task).activeText;
  if (condition.taskKeywords.some((word) => taskIntent.phraseMatches(task, word))) return true;
  return (input.targets || []).some((target) => targetTriggerEvidence(target, condition));
}

function targetTriggerEvidence(target, condition) {
  const normalized = String(target).replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  return condition.targetExtensions.some((extension) => normalized.endsWith(extension))
    || condition.targetNames.includes(path.posix.basename(normalized))
    || condition.targetDirectories.some((directory) => normalized === directory || normalized.startsWith(`${directory}/`));
}

function decideTask(input) {
  const catalog = taskCatalog();
  const decision = initialDecision(input, catalog);
  if (input.skill && !catalog.some((skill) => skill.id === input.skill)) return capabilityGap(decision, `本包未发布专项 Skill：${input.skill}`);
  if (POLICY.unsupportedIntents.some((intent) => taskIntent.phraseMatches(input.task, intent))) return capabilityGap(decision, "本包页面实现器目前只支持 Vue；所请求框架没有已发布的执行器");
  if (decision.applicable === true) {
    const signals = `${taskIntent.analyzeTask(input.task).activeText} ${(input.context?.signals || []).join(" ")}`.toLowerCase();
    const frontendConditions = decision.backendWorkflow && decision.baselineRules.length === 0 ? [] : standardMap.conditional;
    const conditional = frontendConditions.filter((entry) => entry.keywords.some((word) => signals.includes(word.toLowerCase()))).flatMap((entry) => entry.rules);
    decision.requiredRules = [...new Set([...decision.requiredRules, ...ruleIds(conditional)])];
    decision.ruleDetails = decision.requiredRules.map((id) => ({ id, name: fs.readFileSync(path.join(files, `.wl-skills/standards/${id}.md`), "utf8").match(/^#\s+(.+)$/m)?.[1] || id, source: `.wl-skills/standards/${id}.md` }));
    decision.requiredFiles = [...new Set([...decision.requiredFiles, ...decision.ruleDetails.map((rule) => rule.source), ".wl-skills/standards/task-map.json"])];
  }
  return decision;
}

function capabilityGap(decision, reason) {
  return { ...decision, routingStatus: decision.status, status: "gap", applicable: true, ready: false, selectedSkills: [], skillDetails: [], requiredFiles: [], reasons: [...decision.reasons, reason], reason, gaps: [{ reason, suggestion: "提交本包专项能力/规则/执行器提案，经测试和人工审阅后再启用；不自动修改技能" }] };
}

function hostDiagnostic(opts) {
  return core.doctorHost({ ...opts, skillPaths: taskCatalog().map((skill) => resolveResourcePath(opts.projectRoot, skill.path, path.resolve(__dirname, ".."))), gatewayPath: GATEWAY_PATH });
}

function inputOptions(input) {
  return taskOptions(input.projectRoot || process.env.WL_PROJECT_ROOT || process.cwd(), { runId: input.runId, targets: input.targets || [] });
}

function resolveInputScope(input) {
  return projectScope.resolveScope({ projectRoot: input.projectRoot || process.env.WL_PROJECT_ROOT || process.cwd(), packageName: pkg.name, targets: input.targets || [] });
}

function runTaskAction(action, input = {}) {
  const resolved = resolveInputScope(input);
  const opts = inputOptions({ ...input, projectRoot: resolved.projectRoot, targets: resolved.targets });
  const task = input.task || "";
  if (action === "status") return taskResultReadiness(scopeStatus(core.readStatus(opts), opts), opts);
  if (action === "doctor-host") return hostDiagnostic({ ...opts, host: input.host || "unknown" });
  if (resolved.scope.status !== "applicable") return taskResultReadiness(core.attachNotice(projectScope.excludedDecision(resolved.scope), opts), opts);
  const decision = changeScope.attachScope(decideTask({ task, targets: opts.targets, context: input.context, skill: input.skill }), input, opts.projectRoot);
  decision.scope = resolved.scope;
  assetReadiness(decision, opts.projectRoot);
  if (action !== "task") return taskResultReadiness(core.attachNotice(decision, opts), opts);
  const record = core.startTask({ ...opts, task, decision });
  return taskResultReadiness(core.attachNotice({ ...record.decision, ...record }, opts), opts);
}

function scopeStatus(result, opts) {
  const assessment = changeScope.assessScope(opts.projectRoot, result);
  if (!assessment) return result;
  const failed = assessment.checks.some(check => check.status === "failed");
  const pending = assessment.checks.filter(check => check.status !== "passed").map(check => check.id);
  const updated = core.attachNotice({ ...result, changeScopeVerification: assessment, pendingChecks: [...new Set([...result.pendingChecks, ...pending])],
    validationStatus: failed ? "failed" : pending.length && result.validationStatus === "passed" ? "partial" : result.validationStatus }, opts);
  return scopeNotice(updated, assessment);
}

function scopeNotice(result, assessment) {
  const checks = assessment.checks.filter(check => check.status !== "passed");
  const observed = checks.map(check => ({ code: check.status, tool: "status-read-only", check: check.id, message: check.reason.slice(0, 1000) }));
  result.notice.validationIssues = [...observed, ...result.notice.validationIssues.filter(issue => !checks.some(check => check.id === issue.check))].slice(0, 50);
  const detail = checks.map(check => `${check.id}=${check.status}：${check.reason}`).join("；").slice(0, 2000);
  result.notice.summary += `\n状态读取时范围核验：${detail || "当前源码范围检查通过；不增加工具执行记录"}`;
  result.notice.usageChain = result.notice.usageChain.map(stage => stage.stage === "validation" ? { ...stage, currentScopeChecks: assessment.checks, evidence: "current-source-baseline-comparison; no new execution receipt" } : stage);
  if (checks.length) result.notice.nextActions.unshift({ code: "resolve-current-scope", message: "查看 changeScopeVerification 的当前范围差异/缺漏，按原授权修复并复验；状态读取没有新增执行记录。" });
  return result;
}

function taskResultReadiness(result, opts) {
  const effective = projectResult(result, opts, { packageName: pkg.name, packageVersion: pkg.version }).integration;
  return compactScopeResult({ ...result, ready: effective.scope?.status === "applicable" && effective.ready === true });
}

function compactScopeResult(result) {
  const value = { ...result };
  if (value.changeScope) value.changeScope = compactScope(value.changeScope);
  if (value.decision?.changeScope) value.decision = { ...value.decision, changeScope: compactScope(value.decision.changeScope) };
  if (value.records) value.records = value.records.map(compactScopeResult);
  return value;
}

function compactScope(scope) {
  const { files: capturedFiles, pages, ...baseline } = scope.baseline;
  const value = { ...scope, baseline: { ...baseline, fileCount: Object.keys(capturedFiles).length, pageCount: pages.length, pages: pages.slice(0, 200), truncated: pages.length > 200,
    fullInventory: "任务 recordPath 的 decision.changeScope.baseline（完整证据只保存在本地任务记录）" } };
  for (const key of ["affectedPages", "excludedPages"]) {
    if (value[key]) { value[`${key}Count`] = value[key].length; value[key] = value[key].slice(0, 200); }
  }
  return value;
}

function taskCli(action, args, projectRoot) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    target: { type: "string", multiple: true }, project: { type: "string" }, text: { type: "string" },
    "run-id": { type: "string" }, host: { type: "string" }, skill: { type: "string" }, "page-scope": { type: "string" }, json: { type: "boolean" },
  } });
  const result = runTaskAction(action, { projectRoot: values.project || projectRoot, task: values.text || positionals.join(" "), targets: values.target, runId: values["run-id"], host: values.host, skill: values.skill, pageScope: values["page-scope"] });
  if (values.json) console.log(JSON.stringify(result));
  else if (action === "doctor-host") console.log(core.formatHostDiagnostic(result));
  else if (action === "status") console.log(`${core.formatStatus(result)}${formatScope(result)}`);
  else console.log(`${core.formatDecision(result)}${result.runId ? `\nrunId: ${result.runId}` : ""}${formatScope(result)}`);
  return result;
}

function formatScope(result) {
  const scope = result.decision?.changeScope || result.changeScope;
  if (!scope) return "";
  const details = result.changeScopeVerification;
  const body = details ? details.checks.map(check => `${check.id}=${check.status}: ${check.reason}`).join("\n")
    : scope.kind === "menu-order" ? "只允许已有菜单排序字段；页面目录、pages 注册分组和路由不得变更。"
      : `发现 ${scope.baseline.pageCount} 个页面候选（含独立页），声明影响 ${scope.affectedPagesCount} 页；静态扫描与功能验收分开记录。用 --json 查看候选，超过200页读取本地recordPath，用 --page-scope 明确范围、预期与排除理由。`;
  return `\n变更范围：${body}`;
}

function assetReadiness(decision, projectRoot) {
  if (decision.applicable !== true) return;
  const required = [...decision.requiredFiles, ...decision.requiredRules.map((id) => `.wl-skills/standards/${id}.md`)];
  const resources = [...new Set(required)].map(resourceId => resolveResource({ projectRoot, resourceId, packageRoot: path.resolve(__dirname, "..") }));
  const missing = resources.filter(resource => !isReadableAsset(resource.physicalPath)).map(resource => resource.resourceId);
  decision.resources = resources;
  decision.requiredFiles = resources.map(resource => resource.physicalPath);
  for (const rule of decision.ruleDetails || []) {
    rule.resourceId = rule.source;
    rule.source = resolveResourcePath(projectRoot, rule.source, path.resolve(__dirname, ".."));
  }
  decision.ready = decision.ready !== false && missing.length === 0;
  decision.missingInputs = missing;
  if (missing.length) {
    decision.routingStatus ||= decision.status;
    decision.status = "gap";
    decision.reasons.push("本包所需 canonical Skill/规范不可读取");
    decision.reason = decision.reasons.join("；");
    decision.gaps.push({ reason: "本包所需 canonical Skill/规范不可读取", paths: missing, suggestion: "核对本包完整性、锁定版本和项目覆盖文件后重新判定；不需要安装兄弟包" });
  }
}

function isReadableAsset(file) {
  try {
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, fs.constants.R_OK);
    return true;
  } catch { return false; }
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
  const errors = issues.some((issue) => issue.level === "error" && (issue.rule === "AST_PARSE" || /^K\d+$/.test(issue.rule) && issue.rule !== "K14"));
  return { id: "ast", status: errors ? "failed" : "passed", reason: `AST pages ${summary.astPages}; cache hits ${summary.astCacheHits || 0}` };
}

function dictionaryCheck(summary, issues) {
  if (!summary.dictContracts) return null;
  const dictionaryIssues = issues.filter((issue) => issue.rule === "D1" || issue.rule === "D2");
  const failure = dictionaryIssues.find((issue) => issue.level === "error");
  const issue = failure || dictionaryIssues[0];
  return {
    id: "dictionary-contract",
    status: failure ? "failed" : issue ? "unverified" : "passed",
    reason: issue ? `${issue.rule} ${issue.text}` : `已检查 ${summary.dictContracts} 个字典契约及其引用`,
  };
}

function validationFacts(summary, issues, strict = false) {
  const errors = issues.filter((issue) => issue.level === "error").length;
  const warns = issues.filter((issue) => issue.level === "warn").length;
  const checks = [pageCheck(summary, errors), typeCheckFact(summary), astCheck(summary, issues)];
  const dictionary = dictionaryCheck(summary, issues);
  if (dictionary) checks.push(dictionary);
  return { exitCode: errors > 0 || strict && warns > 0 ? 1 : 0, validationStatus: summary.pages > 0 || dictionary ? errors > 0 ? "failed" : "passed" : "unverified", checkedFiles: summary.checkedFiles || [], checks, summary: { ...summary, errors, warns } };
}

function scopedValidationFacts(handle, summary, issues, strict = false, verifier) {
  const status = core.readStatus(handle.options);
  const assessment = assessValidationScope(handle, summary, status, verifier);
  if (assessment) {
    summary.changeScope = assessment;
    for (const check of assessment.checks.filter(check => check.status === "failed")) issues.push({ level: "error", dir: ".", rule: check.id, text: check.reason });
  }
  const facts = validationFacts(summary, issues, strict);
  if (assessment) facts.checks.push(...assessment.checks);
  return facts;
}

function assessValidationScope(handle, summary, status, verifier) {
  let assessment;
  try {
    if (verifier && status.decision?.changeScope?.kind !== "batch-pages") throw new Error("--page-verifier 仅用于同 runId 已声明的批量页面任务；未运行脚本");
    assessment = changeScope.assessScope(handle.options.projectRoot, status, summary.checkedFiles || [], verifier);
  } catch (error) {
    assessment = { problems: [error.message], checks: [{ id: "batch-page-behavior", status: "failed", reason: error.message }] };
  }
  return assessment;
}

function taskToolDescriptors() {
  return ["task", "route", "explain", "status", "doctor-host"].map((action) => ({
    name: `wls_${action.replace(/-/g, "_")}`,
    description: `Kit ${action}: task decision, own execution evidence or static host diagnosis; never proves host loading from a model declaration.`,
    inputSchema: { type: "object", properties: { task: { type: "string" }, targets: { type: "array", items: { type: "string" } }, runId: { type: "string" }, host: { type: "string" }, skill: { type: "string" }, pageScope: { type: "string", description: "项目内批量页面范围JSON：basis、affectedPages[{path,expectation}]、excludedPages[{path,reason}]" } } },
    needsBackendConfig: false, observabilityAction: true,
    handle: (input) => JSON.stringify(runTaskAction(action, input)),
  }));
}

function beginMcpTool(desc, input) {
  if (desc.observabilityAction) return null;
  const options = taskOptions(process.env.WL_PROJECT_ROOT || process.cwd(), {
    tool: desc.name, runId: input.runId || process.env.WL_TASK_RUN_ID, targets: input.path ? [input.path] : [], readOnlyVerification: true,
  });
  const status = mcpTaskStatus(options, desc.name);
  changeScope.enforceMenuTask(options.projectRoot, status, desc.name, input);
  const handle = core.beginExecution(options);
  const backend = standardMap.backendTools[desc.name];
  if (backend) handle.backendRequest = { confirmed: input[backend.confirmation] === true, planHash: input.planHash };
  return handle;
}

function mcpTaskStatus(options, name) {
  const selected = core.readStatus(options);
  if (!options.runId && selected.decision) options.runId = selected.runId;
  if (options.runId && !selected.decision && /^wls_menu_(?:upsert|sync_from_report|delete)$/.test(name)) {
    const active = core.readStatus({ ...options, runId: undefined });
    if (active.decision?.changeScope) throw new Error("当前已有范围约束任务；新 runId 尚未 task，不能跳过原范围。请复用原 runId 或先明确判定独立任务。");
  }
  return selected;
}

function finishMcpTool(handle, desc, normalized) {
  if (!handle) return undefined;
  const validation = desc.name === "wls_validate_page" ? normalized.structuredContent : null;
  const facts = { exitCode: normalized.isError ? 1 : 0, validationStatus: "unverified", checks: [], summary: {} };
  if (validation) Object.assign(facts, validationMcpFacts(validation));
  else if (standardMap.backendTools[desc.name]) Object.assign(facts, backendMcpFacts(handle, desc, normalized));
  const assessment = changeScope.assessScope(handle.options.projectRoot, core.readStatus(handle.options));
  if (assessment?.kind === "menu-order") {
    facts.checks.push(...assessment.checks);
    facts.summary.changeScope = assessment;
  }
  const receipt = core.finishExecution(handle, facts);
  return { runId: receipt.runId, executionStatus: receipt.executionStatus, validationStatus: receipt.validationStatus, receiptPath: receipt.recordPath,
    ...(facts.summary.backend ? { backend: facts.summary.backend } : {}) };
}

function backendMcpFacts(handle, desc, normalized) {
  const config = standardMap.backendTools[desc.name];
  const result = normalized.structuredContent || {};
  const success = normalized.isError !== true && result.ok === true;
  const failed = normalized.isError === true || result.ok === false;
  const hash = backendPlanHash(result.planHash);
  const backend = { stage: "unknown", query: "unverified", preview: "unverified", apply: "unverified", postverify: "unverified", scope: "backend-operation-only" };
  const checks = [];
  const context = { handle, desc, result, success, failed, hash, backend, checks };
  if (config.kind === "query") queryBackendFacts(context);
  else if (result.mode === "preview") previewBackendFacts(context);
  else if (result.mode === "apply") applyBackendFacts(context);
  if (hash) backend.planHash = hash;
  return { exitCode: failed ? 1 : 0, validationStatus: "unverified", checks, summary: { backend } };
}

function backendPlanHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function backendStageStatus(success, recognized, failed) {
  return success && recognized ? "passed" : failed ? "failed" : "unverified";
}

function recordBackendCheck(checks, id, status, reason) {
  if (status !== "unverified") checks.push({ id, status, reason });
}

function queryBackendFacts({ result, success, failed, backend, checks }) {
  const known = ["completed", "success"].includes(result.state) && Number.isInteger(result.count) && Array.isArray(result.items);
  backend.stage = "query";
  backend.query = backendStageStatus(success, known, failed);
  recordBackendCheck(checks, "backend-query", backend.query, "Actual registered query handler result; no write or source-rule verification inferred");
}

function previewBackendFacts({ result, success, failed, hash, backend, checks }) {
  backend.stage = "preview";
  backend.preview = backendStageStatus(success, result.state === "ready" && hash !== null, failed);
  recordBackendCheck(checks, "backend-preview", backend.preview, "Actual preview result; confirmation, apply and post-verification remain separate");
}

function confirmedBackendApply(handle, hash) {
  return handle.backendRequest?.confirmed === true && hash !== null && handle.backendRequest.planHash === hash;
}

function matchingBackendPreview(handle, desc, hash) {
  return core.readStatus(handle.options).records.some((record) => record.kind === "tool-finished" && record.tool === desc.name
    && record.summary?.backend?.preview === "passed" && record.summary.backend.planHash === hash);
}

function backendPostverify(desc, result) {
  const { visibility } = result;
  if (["wls_menu_upsert", "wls_menu_sync_from_report"].includes(desc.name) && visibility?.checked === true && Number.isInteger(visibility.missingCount) && visibility.missingCount >= 0) {
    return visibility.missingCount === 0 ? "passed" : "failed";
  }
  return desc.name === "wls_dict_upsert" && result.state === "verified" ? "passed" : "unverified";
}

function applyBackendFacts({ handle, desc, result, success, failed, hash, backend, checks }) {
  backend.stage = "apply";
  const recognized = ["completed", "verified"].includes(result.state) && confirmedBackendApply(handle, hash);
  backend.apply = backendStageStatus(success, recognized, failed);
  recordBackendCheck(checks, "backend-apply", backend.apply, "Actual guarded apply result with matching confirmed planHash; does not imply post-verification");
  if (backend.apply !== "passed") return;
  if (matchingBackendPreview(handle, desc, hash)) {
    backend.preview = "passed";
    recordBackendCheck(checks, "backend-preview", "passed", "Matching actual preview receipt exists in the same run");
    recordBackendCheck(checks, standardMap.backendCheckCompatibility.legacy, "passed", "Legacy aggregate: actual matching preview plus guarded confirmed apply; post-verification is separate");
  }
  backend.postverify = backendPostverify(desc, result);
  recordBackendCheck(checks, "backend-postverify", backend.postverify, "Actual handler post-verification result; menu visibility or dictionary reconciliation only");
}

function validationMcpFacts(validation) {
  return { validationStatus: validation.validationStatus || "unverified", checkedFiles: validation.summary?.checkedFiles || [], checks: [{ id: "validate", status: validation.ok ? "passed" : "failed", reason: "Actual validation CLI result" }], summary: validation.summary || {} };
}

module.exports = { core, taskOptions, taskCatalog, decideTask, runTaskAction, taskCli, validationFacts, scopedValidationFacts, taskToolDescriptors, beginMcpTool, finishMcpTool };

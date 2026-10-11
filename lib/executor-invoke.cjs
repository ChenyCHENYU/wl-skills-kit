"use strict";

/** Public execution admission. Package schemas and recorded decisions remain the facts. */
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, addUsedSchema: false });
const cache = new Map();
const STRING = { type: "string", minLength: 1, pattern: "\\S" };
const REQUEST_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object", additionalProperties: false,
  required: ["operation", "projectRoot", "runId", "executorId", "parameters"],
  properties: {
    operation: { const: "execute" }, protocolVersion: { const: 1 }, requestId: STRING,
    projectRoot: STRING, runId: { ...STRING, pattern: "^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$" }, executorId: STRING,
    parameters: { type: "object" },
  },
};
const OPERATION = {
  id: "execute", summary: "通过稳定结构化入口执行本包允许的业务只读检查器",
  readOnly: false, required: ["projectRoot", "runId", "executorId", "parameters"], optional: [],
  sideEffects: "业务只读；按执行器声明写本包任务记录或检查报告", mapping: "protocol request operation=execute (executor-invoke-v1)",
};
class ExecutionError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function refuse(code, message) { throw new ExecutionError(code, message); }
function validateSchema(schema, value) {
  const key = JSON.stringify(schema);
  let validate = cache.get(key);
  try {
    if (!validate) {
      validate = ajv.compile(schema);
      if (cache.size >= 64) cache.clear();
      cache.set(key, validate);
    }
  } catch (error) { refuse("unsupported-contract", `不能解释执行参数 Schema：${error.message}`); }
  if (!validate(value)) refuse("invalid-executor-input", ajv.errorsText(validate.errors, { separator: "; " }));
}
function realTarget(root, target) {
  const full = path.resolve(root, target);
  if (full !== root && !full.startsWith(root + path.sep)) refuse("invalid-executor-input", "执行目标越出项目根");
  let existing = full;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) refuse("invalid-executor-input", "执行目标没有可核验祖先");
    existing = parent;
  }
  const real = fs.realpathSync(existing);
  if (real !== root && !real.startsWith(root + path.sep)) refuse("invalid-executor-input", "执行目标符号链接越出项目根");
  if (!fs.existsSync(full)) return;
  inspectTargetTree(root, full);
}
function inspectTargetTree(root, full) {
  const ignored = new Set(["node_modules", ".git", ".wl-skills", ".wl-skills-ui", ".wl-skills-bd", ".wl-skills-design", ".wl-skills-test", "test-reports", "dist", "build", "target", "coverage"]);
  const visited = new Set(), queue = [full];
  let entries = 0;
  while (queue.length) {
    const current = queue.pop();
    if (++entries > 50000) refuse("unsupported-executor-range", "范围超过路径预检预算，请缩小目标");
    const resolved = fs.realpathSync(current);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) refuse("invalid-executor-input", "目录内部符号链接越出项目根");
    if (!fs.statSync(current).isDirectory() || visited.has(resolved)) continue;
    visited.add(resolved);
    for (const name of fs.readdirSync(current)) if (!ignored.has(name)) queue.push(path.join(current, name));
  }
}
function identifyPlan(config, input, status, root) {
  const core = status.integration;
  let recordedRoot;
  try { recordedRoot = core?.projectRoot && fs.realpathSync(core.projectRoot); }
  catch { refuse("identity-mismatch", "计划项目根无法核验"); }
  if (!core || core.packageName !== config.packageName || core.packageVersion !== config.packageVersion
      || recordedRoot !== root || core.runId !== input.runId) refuse("identity-mismatch", "任务身份、项目或包版本不一致");
  const plan = (status.records || []).filter(record => record.kind === "task-decision").at(-1);
  assertLatestPlan(config, input, plan, root);
  return { core, plan };
}
function assertLatestPlan(config, input, plan, root) {
  if (!plan || plan.runId !== input.runId || plan.packageName !== config.packageName || plan.packageVersion !== config.packageVersion) refuse("missing-plan", "没有本包同 runId 的真实任务计划");
  assertPlanRoot(plan, root);
}
function assertPlanRoot(plan, root) {
  const recorded = plan.decision?.scope?.projectRoot || plan.notice?.projectRoot;
  let resolved;
  try { resolved = typeof recorded === "string" && fs.realpathSync(recorded); }
  catch { refuse("identity-mismatch", "任务计划原项目根无法核验，请重新建立任务"); }
  if (resolved !== root) refuse("identity-mismatch", "任务计划属于另一项目或缺少原项目身份，请重新建立任务");
}
function assertReady(config, core) {
  if (core.scope?.status !== "applicable" || core.scope.adopted !== true) refuse("not-applicable", "项目未接入或不适用本包");
  assertCatalog(config);
  if (!["matched", "baseline"].includes(core.decisionStatus) || core.ready !== true) refuse("unresolved-plan", "计划存在缺口、歧义或待确认输入");
  if (core.action?.checksAllowed !== true) refuse("action-not-allowed", "本任务没有允许检查");
}
function assertCatalog(config) {
  if (config.inventory?.loadErrors?.length) refuse("catalog-load-error", `能力目录加载异常：${config.inventory.loadErrors.join("; ")}`);
}
function allowsRecheck(status, core) {
  return core.action?.mode === "apply" && core.planStale === false && status.outdatedChecker === false
    && !["invalid", "mismatch"].includes(core.runtime?.status);
}
function assertFresh(status, core, plan) {
  const tools = (status.records || []).filter(record => record.kind === "tool-finished");
  const replanned = tools.length > 0 && tools.every(record => record.recordedAt < plan.recordedAt);
  const recheck = allowsRecheck(status, core);
  if (core.planStale !== false || core.stale !== false && !replanned && !recheck) refuse("stale-plan", "计划或检查证据过期，需重新判定");
  if (["invalid", "mismatch"].includes(core.runtime?.status)) refuse("identity-mismatch", "安装资产、本地依赖与运行版本未对齐");
}
function selectExecutor(config, input, core) {
  const executor = config.executors.find(item => item.id === input.executorId);
  if (!executor || executor.sideEffects?.business !== "none" || executor.authorization !== "read-only-business-check") refuse("unsupported-executor", "执行器不存在或不是业务只读检查器");
  if (!core.allowedExecutors.includes(input.executorId)) refuse("executor-not-allowed", "计划未允许此执行器");
  return executor;
}
function admit(config, input, status) {
  const root = fs.realpathSync(input.projectRoot);
  const { core, plan } = identifyPlan(config, input, status, root);
  assertReady(config, core);
  assertFresh(status, core, plan);
  const executor = selectExecutor(config, input, core);
  validateSchema(executor.parameters, input.parameters);
  if (JSON.stringify(input.parameters.targets) !== JSON.stringify(core.targets)) refuse("target-mismatch", "执行目标必须与计划一致");
  for (const target of input.parameters.targets) realTarget(root, target);
  if (input.parameters.rules?.some(id => !core.ruleRefs.some(rule => rule.legacyId === id))) refuse("rule-mismatch", "规则超出任务计划");
  return { executor, parameters: input.parameters, projectRoot: root, runId: input.runId };
}
module.exports = { REQUEST_SCHEMA, OPERATION, ExecutionError, validateSchema, admit, realTarget };

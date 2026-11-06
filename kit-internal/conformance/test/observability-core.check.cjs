"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const Ajv = require("ajv");
const core = require("../support/task-observability.cjs");
const schema = require("../support/task-observability.schema.json");
const validate = new Ajv({ allErrors: true }).compile(schema);

function workspace(t) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wl-observability-core-"));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, "src"));
  fs.writeFileSync(path.join(projectRoot, "src/page.vue"), "<template><div/></template>\n");
  return { projectRoot, packageName: "@agile-team/wl-skills-kit", packageVersion: "test-1", targets: ["src/page.vue"] };
}

function trackGateway(options, paths) {
  const hash = content => require("node:crypto").createHash("md5").update(content).digest("hex");
  const files = Object.fromEntries(paths.map(relative => [relative, hash(fs.readFileSync(path.join(options.projectRoot, relative)))]));
  fs.writeFileSync(path.join(options.projectRoot, ".wl-skills-manifest.json"), JSON.stringify({version:options.packageVersion,files}));
}

function routeOptions(task) {
  return {
    task,
    catalog: [{ id: "page-create", path: "skills/page/SKILL.md", triggers: ["生成页面"], rules: ["K1"], checks: ["K1"] }, { id: "page-review", path: "skills/review/SKILL.md", triggers: ["检查页面"], checks: ["K1"] }],
    policy: { domainKeywords: ["页面", "Vue"], domainExtensions: [".vue"], baselineRules: ["K1"], baselineChecks: ["K1"], negativeKeywords: ["旅游", "天气"], unsupportedIntents: ["量子渲染"] },
  };
}

test("a standalone notice respects explain-only intent and establishes a run before suggesting checks", t => {
  const options = workspace(t);
  const view = (task, runId) => core.attachNotice({
    task, runId, decision: { status: "matched", selectedSkills: ["menu-sync"], requiredChecks: ["preview"] },
  }, options);
  const explanation = view("解释一下怎么批量创建菜单，先不要执行", "explain-menu");
  assert.equal(explanation.notice.action.checksAllowed, false);
  assert.ok(explanation.notice.nextActions.some(action => action.code === "stay-in-scope"));
  assert.ok(!explanation.notice.nextActions.some(action => action.code === "execute-required-checks"));
  assert.match(core.formatDecision(explanation), /参考检查：preview/);
  const routed = view("检查页面");
  assert.ok(routed.notice.nextActions.some(action => action.code === "start-task"));
  assert.ok(!routed.notice.nextActions.some(action => action.code === "execute-required-checks"));
  assert.ok(view("检查页面", "inspection").notice.nextActions.some(action => action.code === "execute-required-checks"));
  const prohibited = view("检查页面，不调用工具", "inspection-no-tools").notice;
  assert.equal(prohibited.action.checksAllowed, false);
  assert.ok(prohibited.nextActions.some(action => action.code === "stay-in-scope"));
  assert.ok(!prohibited.nextActions.some(action => action.code === "execute-required-checks"));
});

test("empty status gives an actionable local task command without claiming a skill was used", (t) => {
  const options = workspace(t);
  const dependency = path.join(options.projectRoot, "node_modules", options.packageName);
  fs.mkdirSync(path.join(dependency, "bin"), { recursive: true });
  fs.writeFileSync(path.join(dependency, "package.json"), JSON.stringify({ name: options.packageName, version: options.packageVersion }));
  fs.writeFileSync(path.join(dependency, "bin/wl-skills.js"), "fixture");
  const status = core.readStatus({ ...options, runId: "not-started" });
  assert.deepEqual(status.tools, []);
  assert.match(status.notice.summary, /没有任务记录/u);
  assert.equal(status.notice.skills.length, 0);
  assert.equal(status.notice.usageChain.find(stage => stage.stage === "host-discovery").status, "unverified");
  assert.equal(status.notice.usageChain.find(stage => stage.stage === "content-loading").status, "unverified");
  const action = status.notice.nextActions.find(item => item.code === "start-task");
  const root = fs.realpathSync(options.projectRoot);
  assert.equal(action.cwd, root);
  assert.deepEqual(action.argv, ["node", "./node_modules/@agile-team/wl-skills-kit/bin/wl-skills.js", "task", "<任务描述>", "--run-id", "not-started", "--project", root]);
  assert.match(core.formatStatus(status), /下一步：.*先运行 task/u);
  assert.equal(fs.existsSync(path.join(options.projectRoot, ".wl-skills/runs")), false);
});

test("suggested commands require a readable matching local package and never guess an execution path", (t) => {
  const options = workspace(t);
  const empty = () => core.readStatus({ ...options, runId: "missing-local-executor" }).notice.nextActions.find(action => action.code === "start-task");
  assert.equal(empty().argv, undefined);
  assert.match(empty().commandHint, /沿用本次实际 CLI 入口/u);
  const dependency = path.join(options.projectRoot, "node_modules", options.packageName);
  fs.mkdirSync(path.join(dependency, "bin"), { recursive: true });
  const metadata = path.join(dependency, "package.json");
  fs.writeFileSync(path.join(dependency, "bin/wl-skills.js"), "fixture");
  for (const value of [{ name: "another-package", version: options.packageVersion }, { name: options.packageName, version: "old" }]) {
    fs.writeFileSync(metadata, JSON.stringify(value));
    assert.equal(empty().argv, undefined);
  }
  fs.writeFileSync(metadata, JSON.stringify({ name: options.packageName, version: options.packageVersion }));
  assert.equal(empty().argv[0], "node");
  fs.rmSync(path.join(dependency, "bin/wl-skills.js"));
  assert.equal(empty().argv, undefined);
});

test("routing receipts explain planned files and checks while finished tools alone establish execution", (t) => {
  const options = workspace(t);
  fs.mkdirSync(path.join(options.projectRoot, "skills/page"), { recursive: true });
  fs.writeFileSync(path.join(options.projectRoot, "skills/page/SKILL.md"), "Page workflow");
  const planned = core.startTask({ ...options, ...routeOptions("生成页面"), runId: "readable-receipts" });
  assert.match(planned.notice.summary, /匹配技能：page-create；执行工具尚未运行/u);
  assert.equal(planned.notice.usageChain.find(stage => stage.stage === "tool-execution").evidence, "no-finished-tool-receipts");
  assert.deepEqual(planned.notice.nextActions.find(item => item.code === "read-selected-files").files, ["skills/page/SKILL.md"]);
  assert.equal(validate(planned), true, JSON.stringify(validate.errors));
  assert.match(core.formatDecision(planned), /使用链：任务路由/u);
  assert.match(core.formatDecision(planned), /task 本身只记录计划/u);
  execute({ ...options, runId: planned.runId });
  const finished = core.readStatus({ ...options, runId: planned.runId });
  assert.match(finished.notice.summary, /实际工具：kit.validate；执行=completed；验证=passed/u);
  const stages = finished.notice.usageChain;
  assert.deepEqual(stages.find(stage => stage.stage === "tool-execution").tools, ["kit.validate"]);
  assert.deepEqual(stages.find(stage => stage.stage === "validation").pendingChecks, []);
  assert.equal(stages.find(stage => stage.stage === "content-loading").status, "unverified");
  assert.equal(finished.notice.unverified.includes("planned-actions-not-executed"), false);
  assert.equal(finished.notice.unverified.includes("model-read-canonical-files"), true);
  assert.match(core.formatStatus(finished), /实际工具：kit.validate/u);
});

test("overlapping MCP calls keep their exact tool on durable receipts without leaking onto CLI runs", async (t) => {
  const options = workspace(t);
  const runId = "same-run-mixed-tools";
  const executeAs = (tool, wait) => core.withMcpInvocation(tool, async () => {
    const handle = core.beginExecution({ ...options, runId, tool: "internal-" + tool });
    if (wait) await new Promise(resolve => setImmediate(resolve));
    return core.finishExecution(handle);
  });
  const [first, second] = await Promise.all([executeAs("wls_first", true), executeAs("wls_second", false)]);
  const direct = core.finishExecution(core.beginExecution({ ...options, runId, tool: "direct-cli" }));
  assert.deepEqual(first.invocation, { channel: "mcp", tool: "wls_first" });
  assert.deepEqual(second.invocation, { channel: "mcp", tool: "wls_second" });
  assert.equal(direct.invocation, undefined);
  assert.equal(validate(first), true, JSON.stringify(validate.errors));
  const status = core.readStatus({ ...options, runId });
  assert.match(status.notice.summary, /MCP wls_first → internal-wls_first/u);
  assert.match(status.notice.summary, /MCP wls_second → internal-wls_second/u);
  assert.doesNotMatch(status.notice.summary, /MCP direct-cli/u);
  assert.equal(status.stages.contentLoaded, "unverified");
  assert.deepEqual(status.notice.usageChain.find(stage => stage.stage === "tool-execution").mcpTools.sort(), ["wls_first", "wls_second"]);
});

test("the two-line display summary carries bounded project, target, run, rules and pending-check identity", (t) => {
  const options = workspace(t);
  const targets = ["src/page.vue", "src/second.vue", "src/third.vue", "src/fourth.vue", "src/fifth.vue"];
  const rules = Array.from({ length: 8 }, (_, index) => `K${index + 1}`);
  const checks = Array.from({ length: 5 }, (_, index) => `check-${index + 1}`);
  const task = "original task text must never enter the display summary";
  const record = core.attachNotice({ task, runId: "bounded-summary", targets, status: "matched", selectedSkills: ["page-create"], requiredRules: rules, requiredChecks: checks }, options);
  const text = record.notice.summary;
  assert.equal(text.split("\n").length, 2);
  assert.ok(text.includes(`项目=${fs.realpathSync(options.projectRoot)}`));
  assert.ok(text.includes("目标=src/page.vue、src/second.vue、src/third.vue（另 2 项）"));
  assert.ok(text.includes("runId=bounded-summary"));
  assert.ok(text.includes("规则=K1、K2、K3、K4、K5、K6（另 2 项）"));
  assert.ok(text.includes("参考检查=check-1、check-2、check-3（另 2 项）"));
  assert.match(text, /验证=unverified（尚未验证）/u);
  assert.equal(text.includes(task), false);
  const completed = core.attachNotice({ ...record, pendingChecks: [], validationStatus: "passed" }, options).notice.summary;
  assert.match(completed, /验证=passed（检查通过）/u);
  assert.match(completed, /待检查=无/u);
  const readonly = core.attachNotice({ status: "baseline" }, options).notice.summary;
  assert.match(readonly, /runId=未建立/u);
});

test("running, failure and stale feedback never turn a plan into completed validation", (t) => {
  const options = workspace(t);
  const handle = core.beginExecution({ ...options, runId: "visible-running", tool: "kit.validate" });
  const running = core.readStatus({ ...options, runId: handle.metadata.runId });
  assert.match(running.notice.summary, /工具执行中，尚无完成回执/u);
  assert.ok(running.notice.nextActions.some(item => item.code === "await-execution"));
  core.finishExecution(handle, { exitCode: 1, validationStatus: "failed", checks: [{ id: "K1", status: "failed" }], checkedFiles: options.targets });
  const failed = core.readStatus({ ...options, runId: handle.metadata.runId });
  assert.ok(failed.notice.nextActions.some(item => item.code === "resolve-failed-checks"));
  fs.appendFileSync(path.join(options.projectRoot, "src/page.vue"), "changed");
  const stale = core.readStatus({ ...options, runId: handle.metadata.runId });
  assert.ok(stale.notice.nextActions.some(item => item.code === "rerun-stale-checks"));
  assert.equal(stale.notice.validationStatus, "stale");
});

test("runtime diagnosis catches version drift and malformed installation state without claiming host loading", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, '.wl-skills-manifest.json'), JSON.stringify({ version: 'old' }));
  assert.equal(core.inspectRuntime(options.projectRoot, options).status, 'mismatch');
  fs.writeFileSync(path.join(options.projectRoot, '.wl-skills-manifest.json'), '{broken');
  assert.equal(core.inspectRuntime(options.projectRoot, options).status, 'invalid');
  for (const [key, file] of [['design', '.wl-skills-design/state.json'], ['test', '.wl-skills-test/manifest.json']]) {
    const full = path.join(options.projectRoot, file); fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify({ version: 'test-1' }));
    const value = core.inspectRuntime(options.projectRoot, { ...options, packageName: `@agile-team/wl-skills-${key}` });
    assert.equal(value.status, 'aligned'); assert.equal(value.distributedVersion, 'test-1'); assert.equal(value.hostInvocation, 'unverified');
  }
});

test("all package notices deny version drift without borrowing another package's state", (t) => {
  const base = workspace(t);
  for (const [key, manifest] of Object.entries({kit: ".wl-skills-manifest.json", ui: ".wl-skills-ui-manifest.json", bd: ".wl-skills-bd-manifest.json", design: ".wl-skills-design/state.json", test: ".wl-skills-test/manifest.json"})) {
    const options = {...base, packageName: `@agile-team/wl-skills-${key}`};
    const file = path.join(options.projectRoot, manifest);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, JSON.stringify({version: "old"}));
    const record = core.attachNotice({status: "baseline", ready: true, scope: {status: "applicable"}}, options);
    assert.equal(record.status, "gap", key);
    assert.equal(record.ready, false, key);
    assert.equal(record.notice.runtime.status, "mismatch", key);
    assert.match(core.formatDecision(record), /版本对齐=mismatch/u);
    fs.writeFileSync(file, JSON.stringify({version: options.packageVersion}));
    assert.equal(core.attachNotice({status: "baseline", ready: true, scope: {status: "applicable"}}, options).ready, true, key);
  }
});

test("readonly planning becomes stale before its first check while apply tasks permit their intended edits", (t) => {
  const options = workspace(t);
  const inspect = core.startTask({...options, ...routeOptions("检查页面"), runId: "inspect-first"});
  const apply = core.startTask({...options, ...routeOptions("生成页面"), runId: "apply-edit"});
  fs.appendFileSync(path.join(options.projectRoot, "src/page.vue"), "<!-- business edit -->\n");
  assert.equal(core.readStatus({...options, runId: inspect.runId}).planStale, true);
  assert.equal(core.readStatus({...options, runId: apply.runId}).planStale, false);
  execute({...options, runId: apply.runId});
  assert.equal(core.readStatus({...options, runId: apply.runId}).validationStatus, "passed");
});

test("external own dependency rules remain readable and fresh without authorizing foreign reads or writes", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, "package.json"), JSON.stringify({devDependencies: {[options.packageName]: options.packageVersion}}));
  const dependency = fs.mkdtempSync(path.join(os.tmpdir(), "wl-own-dependency-"));
  t.after(() => fs.rmSync(dependency, {recursive: true, force: true}));
  fs.writeFileSync(path.join(dependency, "package.json"), JSON.stringify({name: options.packageName, version: options.packageVersion}));
  fs.writeFileSync(path.join(dependency, "SKILL.md"), "rule v1");
  fs.mkdirSync(path.join(options.projectRoot, "node_modules/@agile-team"), {recursive: true});
  fs.symlinkSync(dependency, path.join(options.projectRoot, "node_modules", options.packageName));
  const rule = `node_modules/${options.packageName}/SKILL.md`;
  const selected = core.evaluateTask(routeOptions("生成页面"));
  selected.requiredFiles = [rule];
  const plan = core.startTask({...options, task: "生成页面", decision: selected});
  assert.equal(plan.ruleSnapshot.files[0].path, rule);
  const host = core.doctorHost({...options, gatewayPath: rule, skillPaths: [rule], entryFiles: []});
  assert.equal(host.gateway.status, "present");
  assert.equal(host.entryReadiness, "needs-host");
  assert.equal(core.readStatus({...options, runId: plan.runId}).planStale, false);
  fs.writeFileSync(path.join(dependency, "SKILL.md"), "rule v2");
  assert.equal(core.readStatus({...options, runId: plan.runId}).planStale, true);
  assert.throws(() => core.captureSnapshot({...options, targets: [rule]}), /symlinks/u);
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "wl-not-own-dependency-"));
  t.after(() => fs.rmSync(foreign, {recursive: true, force: true}));
  fs.writeFileSync(path.join(foreign, "SKILL.md"), "foreign");
  fs.symlinkSync(path.join(foreign, "SKILL.md"), path.join(dependency, "escape.md"));
  assert.throws(() => core.startTask({...options, task: "生成页面", decision: {...selected, requiredFiles: [`node_modules/${options.packageName}/escape.md`]}}), /own dependency/u);
  fs.symlinkSync(dependency, path.join(options.projectRoot, "node_modules/foreign"));
  assert.throws(() => core.startTask({...options, task: "生成页面", decision: {...selected, requiredFiles: ["node_modules/foreign/SKILL.md"]}}), /escapes/u);
  assert.deepEqual(fs.readdirSync(foreign), ["SKILL.md"]);
});

test("rule evidence shares a cumulative read budget across separate targets", (t) => {
  const options = workspace(t);
  for (const name of ["first.md", "second.md"]) fs.writeFileSync(path.join(options.projectRoot, name), Buffer.alloc(9 * 1024 * 1024, 97));
  const plan = core.startTask({...options, task: "生成页面", decision: {...core.evaluateTask(routeOptions("生成页面")), requiredFiles: []}, ruleFiles: ["first.md", "second.md"]});
  assert.equal(plan.ruleSnapshot.complete, false);
  assert.equal(plan.ruleSnapshot.files.length, 1);
  assert.deepEqual(plan.ruleSnapshot.omitted, [{path: "second.md", reason: "snapshot-budget"}]);
  const receipt = execute({...options, runId: plan.runId, ruleFiles: ["first.md", "second.md"]});
  assert.equal(receipt.validationStatus, "partial");
  assert.equal(core.readStatus({...options, runId: plan.runId}).validationStatus, "partial");
});

function execute(options, attributes = {}) {
  const checkedFiles = (options.targets || []).filter((target) => {
    const file = path.resolve(options.projectRoot, target);
    return fs.existsSync(file) && fs.statSync(file).isFile();
  });
  return core.finishExecution(core.beginExecution({ ...options, tool: "kit.validate", readOnlyVerification: true }), { exitCode: 0, validationStatus: "passed", checks: [{ id: "K1", status: "passed" }], checkedFiles, ...attributes });
}

test("task decisions separate matches, baseline, ambiguity, gaps, irrelevant and uncertain requests", () => {
  assert.equal(core.evaluateTask(routeOptions("生成页面")).status, "matched");
  assert.equal(core.evaluateTask(routeOptions("Vue变量更名")).status, "baseline");
  assert.equal(core.evaluateTask(routeOptions("生成页面并检查页面")).status, "ambiguous");
  assert.equal(core.evaluateTask(routeOptions("页面量子渲染")).status, "gap");
  assert.equal(core.evaluateTask(routeOptions("旅游天气")).status, "not-applicable");
  assert.equal(core.evaluateTask(routeOptions("帮我处理一下")).status, "needs-context");
});

test("negated triggers and ASCII substrings cannot force a skill", () => {
  assert.notEqual(core.evaluateTask(routeOptions("不要生成页面，只解释布局")).status, "matched");
  const options = { task: "capital prefix", catalog: [{ id: "api", triggers: ["api", "fix"] }], policy: {} };
  assert.equal(core.evaluateTask(options).status, "needs-context");
});

test("unrelated and uncertain requests do not acquire unrelated mandatory checks", () => {
  for (const task of ["旅游天气", "帮我处理一下"]) {
    const decision = core.evaluateTask(routeOptions(task));
    assert.deepEqual(decision.baselineRules, []);
    assert.deepEqual(decision.requiredRules, []);
    assert.deepEqual(decision.requiredChecks, []);
  }
  assert.equal(core.evaluateTask(routeOptions("帮我处理一下")).missingInputs.length, 1);
});

test("a missing capability produces a reviewable proposal without modifying rules", (t) => {
  const options = workspace(t);
  const record = core.startTask({ ...options, ...routeOptions("页面量子渲染") });
  assert.equal(record.executionStatus, "not-executed");
  assert.equal(core.listGaps(options)[0].status, "proposed");
  assert.equal(fs.readFileSync(path.join(options.projectRoot, "src/page.vue"), "utf8"), "<template><div/></template>\n");
  assert.equal(core.readStatus({ ...options, runId: record.runId }).stages.contentLoaded, "unverified");
});

test("exit zero does not establish validation and empty scopes never pass", (t) => {
  const options = workspace(t);
  assert.equal(execute(options, { validationStatus: undefined }).validationStatus, "unverified");
  assert.equal(execute(options, { checks: [] }).validationStatus, "unverified");
  assert.equal(execute({ ...options, targets: [] }).validationStatus, "unverified");
});

test("failed and skipped checks remain visible despite successful tool transport", (t) => {
  const options = workspace(t);
  const failed = execute(options, { checks: [{ id: "K1", status: "fail" }] });
  assert.equal(failed.executionStatus, "completed");
  assert.equal(failed.validationStatus, "failed");
  const partial = execute(options, { checks: [{ id: "K1", status: "pass" }, { id: "typecheck", status: "skip", reason: "checker not enabled" }] });
  assert.equal(partial.validationStatus, "partial");
  assert.equal(execute(options, { checks: [{ id: "K1", status: "not-applicable" }] }).validationStatus, "not-applicable");
});

test("task-required checks remain pending until they are actually performed", (t) => {
  const options = workspace(t);
  const plan = core.startTask({ ...options, ...routeOptions("生成页面") });
  execute({ ...options, runId: plan.runId }, { checks: [{ id: "other-rule", status: "passed" }] });
  assert.deepEqual(core.readStatus({ ...options, runId: plan.runId }).pendingChecks, ["K1"]);
});

test("source edits invalidate verification and a real rerun restores freshness", (t) => {
  const options = workspace(t);
  const first = execute(options);
  fs.appendFileSync(path.join(options.projectRoot, "src/page.vue"), "<!-- changed -->\n");
  assert.equal(core.readStatus({ ...options, runId: first.runId }).validationStatus, "stale");
  execute({ ...options, runId: first.runId });
  const status = core.readStatus({ ...options, runId: first.runId });
  assert.equal(status.validationStatus, "passed");
  assert.equal(status.executionStatus, "completed");
  assert.equal(status.stages.toolsExecuted, 2);
});

test("an older overlapping execution finishing late cannot replace the newer failure", (t) => {
  const options = { ...workspace(t), runId: "overlapping-run", tool: "validate" };
  const older = core.beginExecution(options);
  const newer = core.beginExecution(options);
  core.finishExecution(newer, { checks: [{ id: "K1", status: "failed" }], validationStatus: "failed", exitCode: 1 });
  core.finishExecution(older, { checks: [{ id: "K1", status: "passed" }], validationStatus: "passed" });
  const status = core.readStatus(options);
  assert.equal(status.validationStatus, "failed");
  assert.equal(status.executionStatus, "failed");
  assert.equal(status.tools[0].executionId, newer.record.eventId);
});

test("equal cross-process start timestamps retain failure rather than using finish order", async (t) => {
  const options = { ...workspace(t), runId: "equal-start-run", tool: "validate" };
  const script = `Date.now=()=>100000;const c=require(${JSON.stringify(require.resolve("../support/task-observability.cjs"))});const o=JSON.parse(process.argv[1]);const failed=process.argv[2]==='failed';const h=c.beginExecution(o);setTimeout(()=>c.finishExecution(h,{exitCode:failed?1:0,validationStatus:failed?'failed':'passed',checks:[{id:'K1',status:failed?'failed':'passed'}],checkedFiles:o.targets}),failed?0:40);`;
  await Promise.all(["passed", "failed"].map((state) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", script, JSON.stringify(options), state]);
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  })));
  const status = core.readStatus(options);
  assert.equal(status.executionOrderUnverified, true);
  assert.equal(status.validationStatus, "failed");
  assert.equal(status.tools.length, 2);
});

test("unresolved gaps cannot be hidden by passing baseline checks", (t) => {
  const options = workspace(t);
  const plan = core.startTask({ ...options, ...routeOptions("页面量子渲染") });
  execute({ ...options, runId: plan.runId });
  const status = core.readStatus({ ...options, runId: plan.runId });
  assert.equal(status.unresolvedDecision, true);
  assert.equal(status.validationStatus, "partial");
  assert.equal(status.gaps.length, 1);
});

test("checking one task target cannot claim coverage of a second file", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, "src/second.vue"), "<template><div/></template>");
  const plan = core.startTask({ ...options, ...routeOptions("生成页面"), targets: ["src/page.vue", "src/second.vue"] });
  execute({ ...options, runId: plan.runId });
  const partial = core.readStatus({ ...options, runId: plan.runId });
  assert.equal(partial.validationStatus, "partial");
  assert.deepEqual(partial.scopeGaps, [{ path: "src/second.vue", reason: "task-target-not-checked" }]);
  execute({ ...options, runId: plan.runId, targets: ["src/second.vue"] });
  assert.equal(core.readStatus({ ...options, runId: plan.runId }).validationStatus, "passed");
});

test("a broad input snapshot cannot substitute for the executor's checked file list", (t) => {
  const options = workspace(t);
  const plan = core.startTask({ ...options, ...routeOptions("生成页面") });
  execute({ ...options, runId: plan.runId, targets: ["src"] }, { checkedFiles: [] });
  const status = core.readStatus({ ...options, runId: plan.runId });
  assert.equal(status.validationStatus, "partial");
  assert.equal(status.scopeGaps[0].path, "src/page.vue");
  const handle = core.beginExecution({ ...options, tool: "validate" });
  assert.throws(() => core.finishExecution(handle, { checkedFiles: ["src"] }), /not directories/);
});

test("rule/config changes and checker version changes invalidate old evidence", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, "rules.md"), "rule v1");
  const receipt = execute({ ...options, ruleFiles: ["rules.md"] });
  fs.writeFileSync(path.join(options.projectRoot, "rules.md"), "rule v2");
  assert.equal(core.readStatus({ ...options, runId: receipt.runId }).stale, true);
  assert.equal(core.readStatus({ ...options, packageVersion: "test-2", runId: receipt.runId }).outdatedChecker, true);
});

test("actual referenced files outside the primary target also invalidate verification", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, "contract.json"), "{}");
  const receipt = execute(options, { checkedFiles: ["src/page.vue", "contract.json"] });
  fs.writeFileSync(path.join(options.projectRoot, "contract.json"), "{\"changed\":true}");
  assert.equal(core.readStatus({ ...options, runId: receipt.runId }).validationStatus, "stale");
});

test("task planning follows rule changes without mistaking normal code edits for invalid planning", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, "rules.md"), "rule v1");
  const plan = core.startTask({ ...options, ...routeOptions("生成页面"), ruleFiles: ["rules.md"] });
  fs.appendFileSync(path.join(options.projectRoot, "src/page.vue"), "<!-- legitimate implementation -->");
  execute({ ...options, runId: plan.runId, ruleFiles: ["rules.md"] });
  assert.equal(core.readStatus({ ...options, runId: plan.runId }).validationStatus, "passed");
  fs.writeFileSync(path.join(options.projectRoot, "rules.md"), "rule v2");
  const stale = core.readStatus({ ...options, runId: plan.runId });
  assert.equal(stale.planStale, true);
  assert.equal(stale.validationStatus, "stale");
  core.startTask({ ...options, ...routeOptions("生成页面"), runId: plan.runId, ruleFiles: ["rules.md"] });
  execute({ ...options, runId: plan.runId, ruleFiles: ["rules.md"] });
  assert.equal(core.readStatus({ ...options, runId: plan.runId }).validationStatus, "passed");
});

test("changes during a readonly check downgrade its evidence", (t) => {
  const options = workspace(t);
  const handle = core.beginExecution({ ...options, tool: "validate", readOnlyVerification: true });
  fs.appendFileSync(path.join(options.projectRoot, "src/page.vue"), "modified while checking");
  const record = core.finishExecution(handle, { validationStatus: "passed", checks: [{ id: "K1", status: "passed" }] });
  assert.equal(record.validationStatus, "partial");
  assert.equal(record.changedDuringCheck, true);
});

test("rule changes during verification cannot certify the new rules", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, "rules.md"), "v1");
  const handle = core.beginExecution({ ...options, ruleFiles: ["rules.md"], tool: "validate", readOnlyVerification: true });
  fs.writeFileSync(path.join(options.projectRoot, "rules.md"), "v2");
  const record = core.finishExecution(handle, { validationStatus: "passed", checks: [{ id: "K1", status: "passed" }] });
  assert.equal(record.validationStatus, "partial");
  assert.equal(record.changedDuringCheck, true);
});

test("task records are not mixed across runs or across package owners", (t) => {
  const options = workspace(t);
  const first = execute(options);
  const second = execute(options, { checks: [{ id: "K1", status: "failed" }] });
  assert.equal(core.readStatus({ ...options, runId: first.runId }).validationStatus, "passed");
  assert.equal(core.readStatus({ ...options, runId: second.runId }).validationStatus, "failed");
  const other = core.readStatus({ ...options, packageName: "@agile-team/wl-skills-ui", runId: first.runId });
  assert.equal(other.executionStatus, "not-executed");
  assert.equal(core.aggregateStatus([core.readStatus({ ...options, runId: first.runId }), core.readStatus({ ...options, runId: second.runId })]).mixedRuns, true);
});

test("own evidence is excluded from project snapshots but business folders named runs are included", (t) => {
  const options = workspace(t);
  fs.mkdirSync(path.join(options.projectRoot, "src/runs"));
  fs.writeFileSync(path.join(options.projectRoot, "src/runs/business.js"), "v1");
  const receipt = execute({ ...options, targets: ["."] });
  assert.equal(core.readStatus({ ...options, runId: receipt.runId }).stale, false);
  fs.appendFileSync(path.join(options.projectRoot, "src/runs/business.js"), "v2");
  assert.equal(core.readStatus({ ...options, runId: receipt.runId }).stale, true);
});

test("all returned and persisted event records conform to the published schema", (t) => {
  const options = workspace(t);
  core.startTask({ ...options, ...routeOptions("生成页面"), runId: "schema-run" });
  execute({ ...options, runId: "schema-run" });
  for (const record of core.readStatus({ ...options, runId: "schema-run" }).records) assert.equal(validate(record), true, JSON.stringify(validate.errors));
});

test("snapshots larger than fifty files retain all evidence paths", (t) => {
  const options = workspace(t);
  for (let index = 0; index < 60; index += 1) fs.writeFileSync(path.join(options.projectRoot, "src", `${index}.js`), String(index));
  const receipt = execute({ ...options, targets: ["src"] });
  const stored = core.readStatus({ ...options, runId: receipt.runId }).tools[0];
  assert.equal(stored.inputSnapshot.files.length, 61);
  assert.equal(stored.inputSnapshot.complete, true);
});

test("namespace traversal, symlink escape and unsafe run IDs fail before foreign writes", (t) => {
  const options = workspace(t);
  assert.throws(() => core.startTask({ ...options, storageDir: "../foreign", task: "page", decision: core.evaluateTask(routeOptions("生成页面")) }), /namespace/);
  assert.throws(() => core.beginExecution({ ...options, runId: "../escape" }), /runId/);
  assert.throws(() => core.captureSnapshot({ ...options, targets: ["../outside"] }), /escapes/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "wl-observability-foreign-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(options.projectRoot, ".wl-skills"));
  assert.throws(() => execute(options), /symlinks/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("pnpm-style internal rule symlinks can be inspected while evidence writes remain strict", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, "package.json"), JSON.stringify({ devDependencies: { [options.packageName]: "*" } }));
  fs.mkdirSync(path.join(options.projectRoot, ".pnpm/local-package"), { recursive: true });
  fs.writeFileSync(path.join(options.projectRoot, ".pnpm/local-package/SKILL.md"), "canonical skill");
  fs.mkdirSync(path.join(options.projectRoot, "node_modules"));
  fs.symlinkSync("../.pnpm/local-package", path.join(options.projectRoot, "node_modules/local-package"));
  const selected = core.evaluateTask(routeOptions("生成页面"));
  selected.requiredFiles = ["node_modules/local-package/SKILL.md"];
  const plan = core.startTask({ ...options, task: "生成页面", decision: selected });
  assert.equal(plan.ruleSnapshot.files[0].path, ".pnpm/local-package/SKILL.md");
  const diagnostic = core.doctorHost({ ...options, gatewayPath: "node_modules/local-package/SKILL.md", skillPaths: selected.requiredFiles, entryFiles: [] });
  assert.equal(diagnostic.gateway.status, "present");
  assert.equal(diagnostic.entryReadiness, "needs-host");
  assert.equal(diagnostic.hostDiscovery, "unverified");
  assert.equal(core.readStatus({ ...options, runId: plan.runId }).planStale, false);
  fs.mkdirSync(path.join(options.projectRoot, ".pnpm/new-package"));
  fs.writeFileSync(path.join(options.projectRoot, ".pnpm/new-package/SKILL.md"), "updated canonical skill");
  fs.unlinkSync(path.join(options.projectRoot, "node_modules/local-package"));
  fs.symlinkSync("../.pnpm/new-package", path.join(options.projectRoot, "node_modules/local-package"));
  assert.equal(core.readStatus({ ...options, runId: plan.runId }).planStale, true);
});

test("checked absolute paths through a project root alias resolve to the same project", (t) => {
  const options = workspace(t);
  const alias = `${options.projectRoot}-alias`;
  fs.symlinkSync(options.projectRoot, alias);
  t.after(() => fs.unlinkSync(alias));
  const receipt = execute(options, { checkedFiles: [path.join(alias, "src/page.vue")] });
  assert.equal(receipt.checkedFiles[0].path, "src/page.vue");
  assert.equal(core.readStatus({ ...options, runId: receipt.runId }).validationStatus, "passed");
});

test("host readiness checks assets without claiming discovery or MCP connection", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, ".wl-skills-manifest.json"), JSON.stringify({ version: options.packageVersion }));
  const diagnostic = core.doctorHost({ ...options, host: "codex", gatewayPath: "src/page.vue", skillPaths: ["src/page.vue"], entryFiles: ["AGENTS.md"] });
  assert.equal(diagnostic.entryReadiness, "incomplete");
  assert.equal(diagnostic.hostDiscovery, "unverified");
  assert.equal(diagnostic.mcpConnection, "unverified");
});

test("model names and bare VS Code never borrow AGENTS as a working host", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, ".wl-skills-manifest.json"), JSON.stringify({ version: options.packageVersion }));
  fs.writeFileSync(path.join(options.projectRoot, "AGENTS.md"), "Instructions");
  for (const host of ["glm", "gpt", "vscode", "unknown"]) {
    const report = core.doctorHost({ ...options, host, entryFiles: ["AGENTS.md"], gatewayPath: "src/page.vue", skillPaths: ["src/page.vue"] });
    assert.equal(report.entryReadiness, "needs-host", host);
    assert.equal(report.hostId, null);
    assert.deepEqual(report.entries, []);
    assert.equal(report.nextActions[0].code, "select-host");
    assert.match(core.formatHostDiagnostic(report), /需要指定实际宿主/u);
    assert.equal(report.launchCwd, "unverified");
  }
});

test("known host diagnosis uses its native paths and aliases with actionable activation guidance", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, ".wl-skills-manifest.json"), JSON.stringify({ version: options.packageVersion }));
  for (const file of ["AGENTS.md", ".agents/skills/wl-skills-kit/SKILL.md", ".codex/config.toml"]) {
    fs.mkdirSync(path.dirname(path.join(options.projectRoot, file)), { recursive: true });
    fs.writeFileSync(path.join(options.projectRoot, file), file.endsWith("SKILL.md") ? "---\nname: wl-skills-kit\ndescription: fixture\n---\nGateway\n" : "fixture");
  }
  trackGateway(options, [".agents/skills/wl-skills-kit/SKILL.md"]);
  const report = core.doctorHost({ ...options, host: "codex-vscode", entryFiles: ["wrong-profile.md"], skillPaths: ["src/page.vue"] });
  assert.equal(report.hostId, "codex");
  assert.equal(report.entryReadiness, "ready");
  assert.equal(report.instructionReadiness, "incomplete", "an unrelated AGENTS file proves no WL guidance");
  assert.equal(report.entries[0].packageGuidance, "unverified");
  assert.deepEqual(report.entries.map(item => item.path), ["AGENTS.md"]);
  assert.equal(report.gateways[0].status, "present");
  assert.equal(report.mcpConfigs[0].status, "present");
  assert.equal(report.mcpConnection, "unverified");
  assert.ok(report.nextActions.some(item => item.code === "activate-skill" && item.message.includes("$wl-skills-kit")));
  assert.ok(report.nextActions.some(item => item.code === "verify-mcp-connection"));
  const text = core.formatHostDiagnostic(report);
  assert.match(text, /kit@test-1.*静态入口就绪/u);
  assert.match(text, /宿主发现=unverified；模型读取=unverified；MCP连接=unverified/u);
  assert.match(text, /宿主启动目录=unverified/u);
  fs.appendFileSync(path.join(options.projectRoot, "AGENTS.md"), "\n<!-- wl-skills-kit:begin -->\nUse the local task gateway.\n<!-- wl-skills-kit:end -->\n");
  assert.equal(core.doctorHost({ ...options, host: "codex", skillPaths: ["src/page.vue"] }).instructionReadiness, "ready");
  fs.rmSync(path.join(options.projectRoot, "AGENTS.md"));
  const nativeOnly = core.doctorHost({ ...options, host: "codex", skillPaths: ["src/page.vue"] });
  assert.equal(nativeOnly.entryReadiness, "ready", "native skills do not require AGENTS.md for discovery");
  assert.equal(nativeOnly.instructionReadiness, "incomplete");
  assert.ok(nativeOnly.nextActions.some(item => item.code === "sync-instruction-entries"));
  fs.rmSync(path.join(options.projectRoot, ".agents"), { recursive: true });
  const missing = core.doctorHost({ ...options, host: "codex", gatewayPath: "src/page.vue", skillPaths: ["src/page.vue"] });
  assert.equal(missing.entryReadiness, "incomplete");
  assert.ok(missing.nextActions.some(item => item.code === "repair-host-assets"));
});

test("host diagnosis never suggests installation or update outside an applicable adopted project", (t) => {
  const options = workspace(t);
  for (const projectType of ["mobile", "workspace", null]) {
    const config = path.join(options.projectRoot, ".wl-skills-scope.json");
    if (projectType) fs.writeFileSync(config, JSON.stringify({ schemaVersion: 1, projectType }));
    else fs.rmSync(config);
    const report = core.doctorHost({ ...options, host: "codex", skillPaths: ["src/page.vue"] });
    assert.equal(report.entryReadiness, "not-applicable");
    assert.deepEqual(report.nextActions.map(action => action.code), ["select-applicable-project"]);
    assert.equal(/\b(?:init|update)\b/u.test(core.formatHostDiagnostic(report)), false);
    assert.match(report.nextActions[0].message, /实际已接入且适用的项目根/u);
  }
});

test("ZCode duplicate discovery paths are visible warnings while either standalone path remains usable", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, ".wl-skills-manifest.json"), JSON.stringify({ version: options.packageVersion }));
  const entries = [".zcode/skills/wl-skills-kit/SKILL.md", ".agents/skills/wl-skills-kit/SKILL.md"];
  const content = "---\nname: wl-skills-kit\ndescription: fixture\n---\nTracked fixture content\n";
  for (const relative of entries) {
    fs.mkdirSync(path.dirname(path.join(options.projectRoot, relative)), { recursive: true });
    fs.writeFileSync(path.join(options.projectRoot, relative), content);
  }
  trackGateway(options, entries);
  const diagnose = () => core.doctorHost({ ...options, host: "zcode", skillPaths: ["src/page.vue"] });
  const report = diagnose();
  assert.equal(report.entryReadiness, "ready");
  const duplicate = report.nextActions.find((action) => action.code === "duplicate-host-gateway");
  assert.deepEqual(duplicate.files, entries);
  assert.match(duplicate.message, /声明同名技能/u);
  assert.match(duplicate.message, /是否重复加载仍未验证/u);
  assert.ok(report.warnings.some((warning) => warning.includes("duplicate-host-gateway")));
  assert.match(core.formatHostDiagnostic(report), /下一步：ZCode 的多个候选入口声明同名技能/u);
  for (const relative of entries) assert.equal(fs.readFileSync(path.join(options.projectRoot, relative), "utf8"), content);
  for (const absent of entries) {
    fs.rmSync(path.join(options.projectRoot, absent));
    const single = diagnose();
    assert.equal(single.entryReadiness, "ready");
    assert.equal(single.nextActions.some((action) => action.code === "duplicate-host-gateway"), false);
    fs.writeFileSync(path.join(options.projectRoot, absent), content);
  }
  assert.equal(report.hostDiscovery, "unverified");
  assert.equal(report.contentLoaded, "unverified");
});

test("gateway required fields must describe this package before static readiness can be reported", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, ".wl-skills-manifest.json"), JSON.stringify({ version: options.packageVersion }));
  const relative = ".agents/skills/wl-skills-kit/SKILL.md", gateway = path.join(options.projectRoot, relative);
  fs.mkdirSync(path.dirname(gateway), { recursive: true });
  const diagnose = () => core.doctorHost({ ...options, host: "codex", skillPaths: ["src/page.vue"], gatewayPath: relative });
  for (const content of ["Missing YAML", "---\nname: another-skill\ndescription: fixture\n---\n", "---\nname: wl-skills-kit\ndescription: true\n---\n", "---\nname: wl-skills-kit\ndescription: ''\n---\n", "---\nname: wl-skills-kit\nname: wl-skills-kit\ndescription: duplicate\n---\n"]) {
    fs.writeFileSync(gateway, content);
    const report = diagnose();
    assert.equal(report.entryReadiness, "incomplete", content);
    assert.equal(report.gateway.status, "invalid", content);
    assert.ok(report.nextActions.some(action => action.code === "review-host-gateway"));
    assert.equal(report.contentLoaded, "unverified");
  }
  for (const description of ['"quoted description"', "'single quoted description'", ">-\n  Multiline description\n  for this package"]) {
    fs.writeFileSync(gateway, `---\nname: 'wl-skills-kit'\ndescription: ${description}\n---\nGateway\n`);
    trackGateway(options, [relative]);
    assert.equal(diagnose().entryReadiness, "ready", description);
  }
});

test("gateway ownership matches all five manifest formats and changed valid content is never ready", (t) => {
  const hash = (algorithm, content) => require("node:crypto").createHash(algorithm).update(content).digest("hex");
  for (const key of ["kit", "ui", "bd", "design", "test"]) {
    const options = { ...workspace(t), packageName: `@agile-team/wl-skills-${key}` };
    const relative = `.agents/skills/wl-skills-${key}/SKILL.md`, gateway = path.join(options.projectRoot, relative);
    const content = `---\nname: wl-skills-${key}\ndescription: fixture\n---\nOriginal instructions\n`;
    fs.mkdirSync(path.dirname(gateway), { recursive: true }); fs.writeFileSync(gateway, content);
    const installedHash = hash(key === "kit" ? "md5" : "sha256", content);
    const files = key === "kit" || key === "ui" ? { [relative]: installedHash } : key === "bd" ? { [relative]: { kind: "file", installedHash } } : [{ path: relative, kind: "file", hash: installedHash }];
    const manifestPath = path.join(options.projectRoot, `.wl-skills/state/${key}/manifest.json`);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, package: options.packageName, version: options.packageVersion, files }));
    const diagnose = () => core.doctorHost({ ...options, host: "codex", skillPaths: ["src/page.vue"], gatewayPath: relative });
    assert.equal(diagnose().entryReadiness, "ready", key);
    assert.equal(diagnose().gateway.ownership.status, "verified", key);
    fs.appendFileSync(gateway, "\nChanged instructions retain valid frontmatter.\n");
    const changed = diagnose();
    assert.equal(changed.entryReadiness, "incomplete", key);
    assert.equal(changed.gateway.status, "modified", key);
    assert.equal(changed.gateway.frontmatter.valid, true, key);
    assert.equal(changed.gateway.ownership.status, "modified", key);
    assert.equal(changed.hostDiscovery, "unverified");
    if (key === "bd") {
      fs.writeFileSync(gateway, content.replace(/\n/g, "\r\n"));
      assert.equal(diagnose().entryReadiness, "ready", "BD normalized ownership retains CRLF compatibility");
    }
  }
});

test("a requested MCP connection diagnoses the selected host configuration without borrowing another host or claiming connection", (t) => {
  const options = workspace(t);
  fs.writeFileSync(path.join(options.projectRoot, "package.json"), JSON.stringify({ dependencies: { [options.packageName]: options.packageVersion }, wlSkills: { hosts: ["codex", "zcode", "kilo"], mcp: true } }));
  fs.writeFileSync(path.join(options.projectRoot, ".mcp.json"), JSON.stringify({ mcpServers: { unrelated: {} } }));
  for (const host of ["codex", "zcode", "kilo"]) {
    const report = core.doctorHost({ ...options, host, skillPaths: ["src/page.vue"] });
    assert.equal(report.mcpConfiguration.requested, true, host);
    assert.equal(report.mcpConfiguration.status, "missing", host);
    assert.ok(report.nextActions.some(action => action.code === "configure-selected-host-mcp"), host);
    assert.equal(report.mcpConnection, "unverified", host);
  }
  fs.mkdirSync(path.join(options.projectRoot, ".codex"));
  fs.writeFileSync(path.join(options.projectRoot, ".codex/config.toml"), "# unrelated host setting only\n");
  const present = core.doctorHost({ ...options, host: "codex", skillPaths: ["src/page.vue"] });
  assert.equal(present.mcpConfiguration.status, "missing-server");
  assert.equal(present.mcpConfiguration.contentsInspected, true);
  assert.equal(present.mcpConfiguration.connection, "unverified");
  assert.equal(core.doctorHost({ ...options, host: "cline", skillPaths: ["src/page.vue"] }).mcpConfiguration.status, "unsupported-manual");
});

test("metadata records redact credentials and never store source contents", (t) => {
  const options = workspace(t);
  const receipt = execute(options, { summary: { accessToken: "private-value", nested: { password: "private-password" }, message: "Bearer example-credential" } });
  const stored = JSON.stringify(core.readStatus({ ...options, runId: receipt.runId }));
  assert.equal(stored.includes("private-value"), false);
  assert.equal(stored.includes("private-password"), false);
  assert.equal(stored.includes("example-credential"), false);
  assert.equal(stored.includes("<template>"), false);
});

test("immutable event publication preserves concurrent writers with the same run ID", async (t) => {
  const options = workspace(t);
  const script = `const c=require(${JSON.stringify(require.resolve("../support/task-observability.cjs"))});const o=JSON.parse(process.argv[1]);for(let i=0;i<8;i++)c.startTask({...o,task:'Vue rename',decision:c.evaluateTask({task:'Vue rename',policy:{domainKeywords:['Vue'],baselineRules:['K1']}})});`;
  await Promise.all(Array.from({ length: 2 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", script, JSON.stringify({ ...options, runId: "same-run" })]);
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Concurrent writer failed (${code}): ${stderr}`));
    });
  })));
  assert.equal(core.readStatus({ ...options, runId: "same-run" }).records.length, 16);
});

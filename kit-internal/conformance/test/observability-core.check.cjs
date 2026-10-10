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

function routeOptions(task) {
  return {
    task,
    catalog: [{ id: "page-create", path: "skills/page/SKILL.md", triggers: ["生成页面"], rules: ["K1"], checks: ["K1"] }, { id: "page-review", path: "skills/review/SKILL.md", triggers: ["检查页面"], checks: ["K1"] }],
    policy: { domainKeywords: ["页面", "Vue"], domainExtensions: [".vue"], baselineRules: ["K1"], baselineChecks: ["K1"], negativeKeywords: ["旅游", "天气"], unsupportedIntents: ["量子渲染"] },
  };
}

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
  assert.equal(diagnostic.entryReadiness, "ready");
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
  const diagnostic = core.doctorHost({ ...options, host: "codex", gatewayPath: "src/page.vue", skillPaths: ["src/page.vue"], entryFiles: ["AGENTS.md"] });
  assert.equal(diagnostic.entryReadiness, "incomplete");
  assert.equal(diagnostic.hostDiscovery, "unverified");
  assert.equal(diagnostic.mcpConnection, "unverified");
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

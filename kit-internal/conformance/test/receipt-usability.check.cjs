"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../support/task-observability.cjs");
const hosts = require("../support/host-profiles.cjs");
const policy = require("../support/project-integration.cjs");

test("skill purpose is preserved from actual selection through the human receipt", () => {
  const decision = core.evaluateTask({ task: "创建菜单", catalog: [{ id: "menu-sync", name: "菜单创建与批量同步", description: "查询、预览和同步项目菜单", triggers: ["创建菜单"], checks: ["backend-preview"], status: "enabled" }], policy: {} });
  const record = { packageName: "@agile-team/wl-skills-kit", packageVersion: "1.0.0", runId: "real-plan", decision, executionStatus: "not-executed", validationStatus: "unverified" };
  const text = core.formatExecutionReceipt(record, { tool: "wls_task", mcpOutcome: "returned" });
  assert.match(text, /^\[WL MCP\] 本次工具=wls_task；调用=已返回/u);
  assert.match(text, /菜单创建与批量同步（menu-sync）/u);
  assert.match(text, /执行工具尚未运行/u);
  assert.match(text, /runId=real-plan/u);
  assert.equal(decision.skillDetails[0].name, "菜单创建与批量同步");
});

test("partial verification explains actual skipped checks even when no planned check remains", () => {
  const status = { packageName: "@agile-team/wl-skills-kit", packageVersion: "1.0.0", runId: "partial-receipt", task: "检查页面", decision: { status: "baseline", requiredChecks: ["validate"] }, executionStatus: "completed", validationStatus: "partial", pendingChecks: [], tools: [{ tool: "validate", checks: [{ id: "validate", status: "passed" }, { id: "typecheck", status: "skipped", reason: "项目未启用类型检查" }] }] };
  core.attachNotice(status);
  assert.equal(status.notice.validationIssues[0].check, "typecheck");
  assert.match(status.notice.summary, /未完成原因=typecheck：项目未启用类型检查/u);
  assert.ok(status.notice.nextActions.some(item => item.code === "complete-partial-validation"));
  const text = core.formatExecutionReceipt(status, { tool: "wls_validate_page", mcpOutcome: "returned" });
  assert.match(text, /^\[WL MCP\] 本次工具=wls_validate_page；调用=已返回/u);
  assert.match(text, /执行=completed；验证=partial/u);
});

test("preview, blocked and continuation responses without a journal do not fabricate execution or verification", () => {
  for (const [outcome, label] of [["returned", "已返回"], ["preview", "预览已返回，尚未应用"], ["blocked", "已阻止，工具未执行"], ["continuation", "结果续页：只读取原快照，未重新执行或新增检查"]]) {
    const text = core.formatExecutionReceipt({ runId: "caller-supplied" }, { tool: "case_generator", mcpOutcome: outcome });
    assert.ok(text.includes(`调用=${label}`));
    assert.match(text, /无关联任务或校验证据/u);
    assert.doesNotMatch(text, /检查通过|runId=/u);
  }
});

test("Qoder uses its documented native skill root while Trae remains explicit rule guidance", () => {
  for (const key of ["kit", "ui", "bd", "test", "design"]) {
    const name = `@agile-team/wl-skills-${key}`;
    const profile = hosts.resolveHostProfile("qoder-cli", name);
    assert.equal(profile.hostId, "qoder");
    assert.deepEqual(profile.gatewayPaths, [`.qoder/skills/wl-skills-${key}/SKILL.md`]);
    assert.equal(profile.discoveryMode, "native-skills");
    assert.deepEqual(hosts.gatewayInstallPaths(name, policy.resolveIntegration({ hosts: "qoder-ide" })), profile.gatewayPaths);
    assert.equal(hosts.resolveHostProfile("trae", name).discoveryMode, "rule-guidance");
  }
});

test("host discovery budgets are conditions rather than assertions about a live session", () => {
  const name = "@agile-team/wl-skills-kit";
  const codex = hosts.resolveHostProfile("codex", name);
  assert.equal(codex.discoveryRules.mayOmitSkills, true);
  assert.equal(codex.discoveryRules.hostConfigurationObserved, false);
  const claude = hosts.resolveHostProfile("claude", name);
  assert.ok(claude.entryFiles.includes("CLAUDE.md"));
  assert.match(claude.discoveryRules.instructionsNote, /2\.1\.277/u);
});

test("ambiguous requests show the actual candidate purposes without pretending either ran", () => {
  const decision = core.evaluateTask({ task: "创建菜单并创建字典", catalog: [{ id: "menu-sync", name: "菜单同步", triggers: ["创建菜单"], status: "enabled" }, { id: "dict-sync", name: "字典同步", triggers: ["创建字典"], status: "enabled" }], policy: {} });
  assert.equal(decision.status, "ambiguous");
  const text = core.formatExecutionReceipt({ decision, executionStatus: "not-executed", validationStatus: "unverified" });
  assert.match(text, /候选需确认：/u);
  assert.match(text, /菜单同步（menu-sync）/u);
  assert.match(text, /字典同步（dict-sync）/u);
  assert.match(text, /执行工具尚未运行/u);
});

test("a real read-only route notice retains the selected Chinese capability without a fabricated run", () => {
  const decision = core.evaluateTask({task:"创建菜单",catalog:[{id:"menu-sync",name:"菜单创建与批量同步",triggers:["创建菜单"],status:"enabled"}],policy:{}});
  const {notice} = core.attachNotice({decision,executionStatus:"not-executed",validationStatus:"unverified"},{packageName:"@agile-team/wl-skills-kit",packageVersion:"1.0.0"});
  const text = core.formatExecutionReceipt({notice},{tool:"wls_route",mcpOutcome:"returned"});
  assert.match(text,/菜单创建与批量同步（menu-sync）/u);
  assert.match(text,/执行工具尚未运行/u);
  assert.match(text,/runId=未建立/u);
  assert.doesNotMatch(text,/验证=passed/u);
});

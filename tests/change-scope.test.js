import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const integration = require("../lib/task-integration");
const { scopeKind } = require("../lib/change-scope");
const { dispatchTool, HANDLERS } = require("../mcp/server");
const { handleMenuUpsert } = require("../mcp/tools/menuSync");
const rootPackage = path.resolve(import.meta.dirname, "..");
const cli = path.join(rootPackage, "bin/wl-skills.js");
const roots = [];
function write(root, file, value) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), value);
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-scope-evidence-"));
  roots.push(root);
  write(root, "package.json", JSON.stringify({ dependencies: { "@agile-team/wl-skills-kit": require("../package.json").version } }));
  fs.mkdirSync(path.join(root, "node_modules/@agile-team"), { recursive: true });
  fs.symlinkSync(rootPackage, path.join(root, "node_modules/@agile-team/wl-skills-kit"), "dir");
  for (const name of ["station", "batching", "settings"]) {
    write(root, `src/views/${name}/index.vue`, "<template><div>Fixture page</div></template>");
    write(root, `src/views/${name}/data.ts`, "export const name = 'fixture';\n");
    write(root, `src/views/${name}/feedback.cjs`, "exports.feedback = (error, rows) => error ? 'error' : rows.length ? 'success' : 'empty';\n");
  }
  write(root, "src/components/Workstation.vue", "<template><div>Shared station</div></template>");
  write(root, "vite/plugins/shared/pages.ts", "export const groups = { steelmaking: { performance: ['station','batching'] } };\n");
  write(root, "src/router/index.ts", "export const routes = [];\n");
  write(root, "checks/pages.json", JSON.stringify({ basis: "需求同时包含公共工位和独立配料站，设置不相关", affectedPages: ["station", "batching"].map(name => ({ path: `src/views/${name}`, expectation: "错误/成功/空结果分别反馈" })), excludedPages: [{ path: "src/views/settings", reason: "设置不属于工位查询" }] }));
  write(root, "checks/verify.cjs", `const fs=require('node:fs');const assert=require('node:assert/strict');const path=require('node:path');
    const input=JSON.parse(fs.readFileSync(0,'utf8'));
    const pages=input.pages.map(page=>{const {feedback}=require(path.resolve(page.path,'feedback.cjs'));
      assert.equal(feedback(new Error('fixture'),[]),'error');assert.equal(feedback(null,[]),'empty');assert.equal(feedback(null,[1]),'success');
      return {path:page.path,status:'passed',assertions:3};});console.log(JSON.stringify({pages}));`);
  const run = args => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", timeout: 30000 });
    let report;
    try { report = JSON.parse(result.stdout); } catch { /* Rejections may be plain diagnostics. */ }
    return { ...result, report };
  };
  const task = (text = "统一给所有工位页面增加查询反馈", extra = []) => run(["task", text, "--run-id", "scope-test", "--json", ...extra]);
  const check = (target = "src/views", extra = []) => run(["validate", target, "--run-id", "scope-test", "--json", ...extra]);
  const status = () => run(["status", "--run-id", "scope-test", "--json"]).report;
  return { root, run, task, check, status };
}
afterEach(() => { vi.unstubAllEnvs(); roots.splice(0).forEach(root => fs.rmSync(root, { force: true, recursive: true })); });

describe("scope supervision through public CLI", () => {
  it("discovers the independent page and keeps static/behavior coverage separate", () => {
    const { task, check, status } = fixture();
    const plan = task(undefined, ["--page-scope", "checks/pages.json"]);
    expect(plan.status, plan.stderr).toBe(0);
    expect(plan.report.decision.changeScope.baseline.pages).toContain("src/views/batching");
    const partial = check("src/views/station");
    expect(partial.report.summary.changeScope.missing).toEqual(["src/views/batching"]);
    expect(status().pendingChecks).toContain("batch-page-coverage");
    const scanned = check();
    expect(scanned.report.summary.changeScope.missing).toEqual([]);
    expect(status().pendingChecks).toContain("batch-page-behavior");
    expect(status().validationStatus).not.toBe("passed");
    const verified = check("src/views", ["--page-verifier", "checks/verify.cjs"]);
    expect(verified.status, verified.stderr).toBe(0);
    expect(verified.report.summary.changeScope.behavior.pages).toEqual([
      { path: "src/views/station", status: "passed", assertions: 3 }, { path: "src/views/batching", status: "passed", assertions: 3 },
    ]);
    expect(status().pendingChecks.filter(id => id.startsWith("batch-page"))).toEqual([]);
  });
  it("an actual failed assertion blocks, and changed shared component invalidates prior behavior", () => {
    const { root, task, check, status } = fixture();
    task(undefined, ["--page-scope", "checks/pages.json"]);
    write(root, "src/views/batching/feedback.cjs", "exports.feedback=()=> 'success';\n");
    expect(check("src/views", ["--page-verifier", "checks/verify.cjs"]).status).toBe(1);
    expect(status().validationStatus).toBe("failed");
    write(root, "src/views/batching/feedback.cjs", "exports.feedback = (error, rows) => error ? 'error' : rows.length ? 'success' : 'empty';\n");
    expect(check("src/views", ["--page-verifier", "checks/verify.cjs"]).status).toBe(0);
    write(root, "src/components/Workstation.vue", "<template><div>New component behavior</div></template>");
    expect(status().pendingChecks).toContain("batch-page-behavior");
  });
  it.each([["src/config/query-feedback.json", '{"showFeedback":false}'], ["src/components/Workstation.scss", ".query-feedback { display:none; }"]])("invalidates behavior when shared runtime input %s changes", (file, content) => {
    const { root, task, check, status } = fixture();
    write(root, file, "initial fixture input");
    task(undefined, ["--page-scope", "checks/pages.json"]);
    expect(check("src/views", ["--page-verifier", "checks/verify.cjs"]).status).toBe(0);
    write(root, file, content);
    expect(status().pendingChecks).toContain("batch-page-behavior");
  });
  it("keeps oversized dependency evidence incomplete instead of bypassing the source budget", () => {
    const { root, task, check, status } = fixture();
    write(root, "package-lock.json", " ".repeat(2 * 1024 * 1024 + 1));
    const plan = task(undefined, ["--page-scope", "checks/pages.json"]);
    expect(plan.report.decision.changeScope.baseline.problems.some(problem => problem.includes("package-lock.json"))).toBe(true);
    const result = check("src/views", ["--page-verifier", "checks/verify.cjs"]);
    expect(result.report.summary.changeScope.behavior.status).toBe("skipped");
    expect(status().pendingChecks).toContain("batch-page-inventory");
    expect(status().pendingChecks).toContain("batch-page-behavior");
  });
  it("rejects an oversized verifier before reading or executing it", () => {
    const { root, task, check } = fixture();
    const body = "/*" + "x".repeat(2 * 1024 * 1024) + "*/\nrequire('node:fs').writeFileSync('oversized-verifier-ran','yes');console.log(JSON.stringify({pages:[]}));";
    write(root, "checks/oversized.cjs", body);
    task(undefined, ["--page-scope", "checks/pages.json"]);
    const result = check("src/views", ["--page-verifier", "checks/oversized.cjs"]);
    expect(result.status).toBe(1);
    expect(fs.existsSync(path.join(root, "oversized-verifier-ran"))).toBe(false);
    expect(result.report.summary.changeScope.behavior.status).toBe("failed");
  });
  it("does not launder a newer failed behavior check with an older success and a later static-only scan", () => {
    const { root, task, check, status } = fixture();
    const verifier = fs.readFileSync(path.join(root, "checks/verify.cjs"), "utf8");
    write(root, "checks/verify.cjs", "if(require('node:fs').existsSync('checks/fail.flag'))process.exit(1);\n" + verifier);
    task(undefined, ["--page-scope", "checks/pages.json"]);
    expect(check("src/views", ["--page-verifier", "checks/verify.cjs"]).status).toBe(0);
    write(root, "checks/fail.flag", "simulate a real failed assertion with unchanged source/script");
    expect(check("src/views/station", ["--page-verifier", "checks/verify.cjs"]).status).toBe(1);
    const staticOnly = check("src/views/station");
    expect(staticOnly.status).toBe(1);
    expect(staticOnly.report.summary.changeScope.behavior.status).toBe("failed");
    expect(status().validationStatus).toBe("failed");
    fs.unlinkSync(path.join(root, "checks/fail.flag"));
    expect(check("src/views/station", ["--page-verifier", "checks/verify.cjs"]).status).toBe(0);
  });
  it("refuses zero-assertion/partial results and no-scope verifier requests", () => {
    const { root, task, check } = fixture();
    task(undefined, ["--page-scope", "checks/pages.json"]);
    write(root, "checks/invalid.cjs", "console.log(JSON.stringify({pages:[{path:'src/views/station',status:'passed',assertions:0}]}));");
    expect(check("src/views", ["--page-verifier", "checks/invalid.cjs"]).status).toBe(1);
    task("修改一个页面文字", ["--target", "src/views/station"]);
    const noScope = check("src/views", ["--page-verifier", "checks/verify.cjs"]);
    expect(noScope.status).toBe(1);
    expect(noScope.report.issues.some(issue => issue.text.includes("未运行脚本"))).toBe(true);
  });
  it.each([
    ["src/views/station/index.vue", "<template><div>unauthorized page edit</div></template>"],
    ["pages/station/index.vue", "<template><div>unauthorized page edit</div></template>"],
    ["pages.json", "{\"pages\":[]}"],
    ["vite/plugins/shared/pages.ts", "export default ['flat-station','flat-batching'];"],
    ["src/router/index.ts", "export const routes = ['/new-path'];"],
    ["routes/index.ts", "export const routes = ['/new-path'];"],
  ])("menu-only task catches changes in %s through validate and live status", (file, content) => {
    const { root, task, check, status } = fixture();
    const plan = task("调整菜单顺序");
    expect(plan.report.decision.selectedSkills).toEqual(["menu-sync"]);
    write(root, file, content);
    expect(status().changeScopeVerification.changes).toContain(file);
    expect(status().validationStatus).toBe("failed");
    expect(status().notice.validationStatus).toBe("failed");
    expect(status().notice.summary).toContain("菜单排序越界");
    expect(status().notice.usageChain.find(stage => stage.stage === "validation").status).toBe("failed");
    expect(status().tools).toHaveLength(0);
    expect(check().status).toBe(1);
  });
  it("catches moved pages, while explicit local menu order data remains outside protected registrations", () => {
    const { root, task, status } = fixture();
    write(root, "src/menu-order.json", "{\"station\":1}");
    task("调整菜单顺序");
    write(root, "src/menu-order.json", "{\"station\":2}");
    expect(status().changeScopeVerification.checks[0].status).toBe("passed");
    fs.renameSync(path.join(root, "src/views/station"), path.join(root, "src/views/renamed-station"));
    expect(status().validationStatus).toBe("failed");
  });
  it("reports data-only changes in an excluded independent page", () => {
    const { root, task, check, status } = fixture();
    task(undefined, ["--page-scope", "checks/pages.json"]);
    write(root, "src/views/settings/data.ts", "export const unrelated = true;");
    expect(check().report.summary.changeScope.problems.some(problem => problem.includes("settings"))).toBe(true);
    expect(status().pendingChecks).toContain("batch-page-inventory");
  });
  it("does not reuse behavior results after changing the declared expectations", () => {
    const { root, task, check, status } = fixture();
    task(undefined, ["--page-scope", "checks/pages.json"]);
    expect(check("src/views", ["--page-verifier", "checks/verify.cjs"]).status).toBe(0);
    const declaration = JSON.parse(fs.readFileSync(path.join(root, "checks/pages.json"), "utf8"));
    declaration.affectedPages[0].expectation += "，并校验超时";
    write(root, "checks/pages.json", JSON.stringify(declaration));
    task(undefined, ["--page-scope", "checks/pages.json"]);
    expect(status().pendingChecks).toContain("batch-page-behavior");
  });
  it("a manifest omitting the independent page cannot clear inventory or behavior even after full static scan", () => {
    const { root, task, check, status } = fixture();
    const declaration = JSON.parse(fs.readFileSync(path.join(root, "checks/pages.json"), "utf8"));
    declaration.affectedPages = declaration.affectedPages.filter(page => !page.path.endsWith("/batching"));
    write(root, "checks/pages.json", JSON.stringify(declaration));
    task("统一给所有工位页面增加查询反馈，包括独立配料站", ["--page-scope", "checks/pages.json"]);
    const result = check("src/views", ["--page-verifier", "checks/verify.cjs"]);
    expect(result.report.summary.changeScope.unclassifiedCandidates).toEqual(["src/views/batching"]);
    expect(result.report.summary.changeScope.behavior.status).toBe("skipped");
    expect(status().pendingChecks).toContain("batch-page-inventory");
    expect(status().pendingChecks).toContain("batch-page-behavior");
    expect(status().validationStatus).not.toBe("passed");
  });
  it("allows explicitly justified scan roots while retaining outside candidates in the baseline", () => {
    const { root, task, check, status } = fixture();
    write(root, "checks/narrow.json", JSON.stringify({ basis: "本次仅改选定station组，其他业务域不属于本轮需求", scanRoots: ["src/views/station"], affectedPages: [{ path: "src/views/station", expectation: "查询成功/错误/空结果分别反馈" }], excludedPages: [] }));
    const planned = task("统一给选定工位页面增加查询反馈", ["--page-scope", "checks/narrow.json"]);
    expect(planned.report.decision.changeScope.baseline.pages).toContain("src/views/batching");
    const result = check("src/views/station", ["--page-verifier", "checks/verify.cjs"]);
    expect(result.report.summary.changeScope.unclassifiedCount).toBe(0);
    expect(status().pendingChecks.filter(id => id.startsWith("batch-page"))).toEqual([]);
  });
  it("bounds returned candidates but keeps the complete local baseline", () => {
    const { root, task } = fixture();
    for (let index = 0; index < 210; index++) write(root, `src/views/extra-${index}/index.vue`, "<template><div>extra</div></template>");
    const planned = task();
    const { baseline } = planned.report.decision.changeScope;
    expect(baseline.pages).toHaveLength(200);
    expect(baseline.pageCount).toBe(213);
    expect(baseline.files).toBeUndefined();
    const stored = JSON.parse(fs.readFileSync(path.join(root, planned.report.recordPath), "utf8"));
    expect(stored.decision.changeScope.baseline.pages).toHaveLength(213);
    expect(Object.keys(stored.decision.changeScope.baseline.files).length).toBeGreaterThan(213);
  });
  it("keeps ordinary single-page and explicitly negated work outside the extra workflow", () => {
    const { task } = fixture();
    expect(task("修改单个页面文字").report.decision.changeScope).toBeUndefined();
    expect(scopeKind("不要调整菜单顺序，只修改页面文字")).toBeNull();
  });
  it.each(["批量增加查询反馈菜单", "给所有工位菜单增加一个权限标识"])("does not impose page checks on the already selected backend workflow: %s", taskText => {
    const { task } = fixture();
    const planned = task(taskText).report;
    expect(planned.decision.backendWorkflow).toBeDefined();
    expect(planned.decision.changeScope).toBeUndefined();
    expect(planned.decision.requiredChecks.some(check => check.startsWith("batch-page-"))).toBe(false);
  });
  it("forwards the declared page scope through the existing protocol context without widening execute", () => {
    const { root, run } = fixture();
    const envelope = input => {
      write(root, "request.json", JSON.stringify({ protocolVersion: 1, projectRoot: root, ...input }));
      return run(["protocol", "request", "--input-file", "request.json", "--json"]);
    };
    const planned = envelope({ operation: "task", task: "统一给所有工位页面增加查询反馈", targets: ["src/views"], runId: "protocol-scope", context: { pageScope: "checks/pages.json" } });
    expect(planned.status, planned.stderr).toBe(0);
    expect(planned.report.result.decision.changeScope.file).toBe("checks/pages.json");
    const checked = envelope({ operation: "execute", runId: "protocol-scope", executorId: "validate", parameters: { targets: ["src/views"] } });
    expect(checked.status, JSON.stringify(checked.report)).toBe(0);
    expect(JSON.parse(checked.report.result.execution.stdout).summary.changeScope.behavior.status).toBe("skipped");
    const status = envelope({ operation: "status", runId: "protocol-scope" });
    expect(status.report.result.pendingChecks).toContain("batch-page-behavior");
    expect(checked.report.result.integration.validationStatus).not.toBe("passed");
    const topLevel = envelope({ operation: "task", task: "统一给所有工位页面增加查询反馈", runId: "invalid-top", pageScope: "checks/pages.json" });
    expect(topLevel.status).toBe(2);
    expect(topLevel.report.error.code).toBe("invalid-input");
    const invalidExecute = envelope({ operation: "execute", runId: "protocol-scope", executorId: "validate", parameters: { targets: ["src/views"], pageVerifier: "checks/verify.cjs" } });
    expect(invalidExecute.status).toBe(2);
  });
});

describe("MCP guarded menu ordering without business requests", () => {
  it.each([
    [[{ id: "one", orderNum: 2, path: "changed" }]], [[{ orderNum: 1 }]], [[{ id: "one", orderNum: 1 }, { id: "one", orderNum: 2 }]],
  ])("rejects extra fields before querying backend: %j", async (items) => {
    const result = await handleMenuUpsert({ orderOnly: true, items }, {});
    expect(result.structuredContent.state).toBe("blocked");
  });
  it("automatically applies narrow mode for a matching task and blocks source drift before handler", async () => {
    const { root } = fixture();
    vi.stubEnv("WL_PROJECT_ROOT", root);
    integration.runTaskAction("task", { projectRoot: root, task: "调整菜单顺序", runId: "scope-mcp" });
    const descriptor = HANDLERS.wls_menu_upsert;
    const prior = { handle: descriptor.handle, needsBackendConfig: descriptor.needsBackendConfig };
    let input;
    descriptor.needsBackendConfig = false;
    descriptor.handle = args => { input = args; return { text: "Local fixture", structuredContent: { ok: true, state: "ready", mode: "preview", planHash: "a".repeat(64) } }; };
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await dispatchTool(1, "wls_menu_upsert", { items: [{ id: "one", orderNum: 2 }], runId: "scope-mcp" });
      expect(input.orderOnly).toBe(true);
      input = null;
      write(root, "vite/plugins/shared/pages.ts", "export default ['flat'];");
      await dispatchTool(2, "wls_menu_upsert", { items: [{ id: "one", orderNum: 3 }], runId: "scope-mcp" });
      expect(input).toBeNull();
      expect(JSON.parse(stdout.mock.calls.at(-1)[0]).result.isError).toBe(true);
    } finally { Object.assign(descriptor, prior); stdout.mockRestore(); }
  });
  it("cannot evade an active menu-order task by inventing an unselected runId", async () => {
    const { root } = fixture();
    vi.stubEnv("WL_PROJECT_ROOT", root);
    integration.runTaskAction("task", { projectRoot: root, task: "调整菜单顺序", runId: "active-menu-order" });
    write(root, "vite/plugins/shared/pages.ts", "export default ['unauthorized-flat'];");
    const descriptor = HANDLERS.wls_menu_upsert;
    const prior = { handle: descriptor.handle, needsBackendConfig: descriptor.needsBackendConfig };
    const handle = vi.fn(() => ({ text: "Fixture only", structuredContent: { ok: true, state: "ready", mode: "preview", planHash: "a".repeat(64) } }));
    descriptor.handle = handle; descriptor.needsBackendConfig = false;
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await dispatchTool(3, "wls_menu_upsert", { items: [{ id: "one", orderNum: 3, path: "unapproved" }], runId: "new-unselected-run" });
      expect(handle).not.toHaveBeenCalled();
      expect(JSON.parse(stdout.mock.calls.at(-1)[0]).result.isError).toBe(true);
    } finally { Object.assign(descriptor, prior); stdout.mockRestore(); }
  });
  it("reuses the selected task for consecutive MCP calls without an explicit runId", async () => {
    const { root } = fixture();
    vi.stubEnv("WL_PROJECT_ROOT", root);
    integration.runTaskAction("task", { projectRoot: root, task: "调整菜单顺序", runId: "implicit-menu-order" });
    const descriptor = HANDLERS.wls_menu_upsert;
    const prior = { handle: descriptor.handle, needsBackendConfig: descriptor.needsBackendConfig };
    const received = [];
    descriptor.needsBackendConfig = false;
    descriptor.handle = args => { received.push(args); return { text: "Fixture only", structuredContent: { ok: true, state: "ready", mode: "preview", planHash: "a".repeat(64) } }; };
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await dispatchTool(4, "wls_menu_upsert", { items: [{ id: "one", orderNum: 2 }] });
      await dispatchTool(5, "wls_menu_upsert", { items: [{ id: "one", orderNum: 3 }] });
      expect(received.map(input => input.runId)).toEqual(["implicit-menu-order", "implicit-menu-order"]);
      expect(received.every(input => input.orderOnly === true)).toBe(true);
    } finally { Object.assign(descriptor, prior); stdout.mockRestore(); }
  });
});

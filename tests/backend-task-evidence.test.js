import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const integration = require("../lib/task-integration");
const { dispatchTool, HANDLERS } = require("../mcp/server");
const packageRoot = path.resolve(import.meta.dirname, "..");
const roots = [];
const hash = "a".repeat(64);
function project(task = "批量创建 10 个菜单，先预览") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-backend-evidence-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { "@agile-team/wl-skills-kit": require("../package.json").version } }));
  fs.mkdirSync(path.join(root, "node_modules/@agile-team"), { recursive: true });
  fs.symlinkSync(packageRoot, path.join(root, "node_modules/@agile-team/wl-skills-kit"), "dir");
  vi.stubEnv("WL_PROJECT_ROOT", root);
  const plan = integration.runTaskAction("task", { projectRoot: root, task, runId: "backend-test" });
  return { root, plan, status: () => integration.runTaskAction("status", { projectRoot: root, runId: plan.runId }) };
}
async function dispatch(name, structuredContent, args = {}) {
  const descriptor = HANDLERS[name];
  const prior = { handle: descriptor.handle, needsBackendConfig: descriptor.needsBackendConfig };
  descriptor.needsBackendConfig = false;
  descriptor.handle = () => ({ text: "Isolated local handler fixture; no backend request", structuredContent, ...(structuredContent.ok === false ? { isError: true } : {}) });
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await dispatchTool(1, name, { ...(name === "wls_menu_upsert" ? { items: [{ menuName: "Fixture" }] } : {}), ...args, runId: "backend-test" });
    return JSON.parse(stdout.mock.calls.map(([chunk]) => chunk).join("")).result;
  } finally { Object.assign(descriptor, prior); stdout.mockRestore(); }
}
afterEach(() => { vi.unstubAllEnvs(); roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })); });

describe("actual MCP dispatch records backend stages without external writes", () => {
  it("preview clears only its planned stage and never claims confirmation/apply", async () => {
    const { plan, status } = project();
    expect(plan.requiredChecks).toEqual(["backend-preview"]);
    const response = await dispatch("wls_menu_upsert", { ok: true, state: "ready", mode: "preview", planHash: hash });
    expect(response._meta.wlExecution.backend).toMatchObject({ stage: "preview", preview: "passed", apply: "unverified", postverify: "unverified" });
    const result = status();
    expect(result.executionStatus).toBe("completed");
    expect(result.pendingChecks).toEqual([]);
    expect(result.tools[0].checks.map((check) => check.id)).toEqual(["backend-preview"]);
    expect(result.validationStatus).not.toBe("passed");
  });
  it("carries matching actual preview evidence into apply and separately records visibility", async () => {
    const { status } = project();
    await dispatch("wls_menu_upsert", { ok: true, state: "ready", mode: "preview", planHash: hash });
    const response = await dispatch("wls_menu_upsert", { ok: true, state: "completed", mode: "apply", planHash: hash, visibility: { checked: true, missingCount: 0 } }, { confirmApply: true, planHash: hash });
    expect(response._meta.wlExecution.backend).toMatchObject({ stage: "apply", preview: "passed", apply: "passed", postverify: "passed" });
    const result = status();
    expect(result.pendingChecks).toEqual([]);
    expect(result.tools[0].checks.map((check) => check.id)).toEqual(["backend-apply", "backend-preview", "backend-preview-and-confirmation", "backend-postverify"]);
    expect(result.tools[0].summary.backend.scope).toBe("backend-operation-only");
  });
  it("old aggregate plans stay pending at preview and complete only after matching confirmed apply", async () => {
    const { root, plan, status } = project();
    integration.core.startTask({ ...integration.taskOptions(root, { runId: plan.runId }), task: plan.task,
      decision: { ...plan.decision, requiredChecks: ["backend-preview-and-confirmation"] } });
    await dispatch("wls_menu_upsert", { ok: true, state: "ready", mode: "preview", planHash: hash });
    expect(status().pendingChecks).toEqual(["backend-preview-and-confirmation"]);
    await dispatch("wls_menu_upsert", { ok: true, state: "completed", mode: "apply", planHash: hash }, { confirmApply: true, planHash: hash });
    expect(status().pendingChecks).toEqual([]);
    expect(status().tools[0].summary.backend.postverify).toBe("unverified");
  });
  it.each([
    [{ ok: true, state: "mystery", mode: "preview", planHash: hash }, {}],
    [{ ok: true, state: "completed", mode: "apply", planHash: hash }, {}],
    [{ ok: true, state: "completed", mode: "apply", planHash: hash }, { confirmApply: true, planHash: "b".repeat(64) }],
  ])("does not convert unknown or unconfirmed responses into completed checks", async (result, input) => {
    const { status } = project();
    await dispatch("wls_menu_upsert", result, input);
    expect(status().tools[0].checks).toEqual([]);
    expect(status().pendingChecks).toEqual(["backend-preview"]);
  });
  it("apply without a same-run preview cannot satisfy preview or the legacy aggregate", async () => {
    const { status } = project();
    await dispatch("wls_menu_upsert", { ok: true, state: "completed", mode: "apply", planHash: hash }, { confirmApply: true, planHash: hash });
    const result = status();
    expect(result.tools[0].checks.map((check) => check.id)).toEqual(["backend-apply"]);
    expect(result.tools[0].summary.backend.postverify).toBe("unverified");
    expect(result.pendingChecks).toEqual(["backend-preview"]);
  });
  it("keeps failed post-verification visible after successful persistence", async () => {
    const { status } = project();
    await dispatch("wls_menu_upsert", { ok: true, state: "completed", mode: "apply", planHash: hash, visibility: { checked: true, missingCount: 1 } }, { confirmApply: true, planHash: hash });
    expect(status().tools[0].checks.find((check) => check.id === "backend-postverify").status).toBe("failed");
    expect(status().validationStatus).toBe("failed");
  });
  it("query evidence cannot satisfy a write preview", async () => {
    const { status } = project("查询 5 个菜单");
    await dispatch("wls_menu_query", { ok: true, state: "completed", mode: "query", count: 0, items: [] });
    expect(status().pendingChecks).toEqual([]);
    expect(status().tools[0].checks.map((check) => check.id)).toEqual(["backend-query"]);
    expect(status().tools[0].summary.backend.apply).toBe("unverified");
  });
  it("real stdio connects task, local mocked preview/apply and status with one runId", async () => {
    const { root } = project();
    const child = spawn(process.execPath, ["-e", `
      const server = require(${JSON.stringify(path.join(packageRoot, "mcp/server.js"))});
      const tool = server.HANDLERS.wls_menu_upsert;
      tool.needsBackendConfig = false;
      tool.handle = (args) => ({ text: "Local mock only", structuredContent: {
        ok: true, state: args.confirmApply ? "completed" : "ready", mode: args.confirmApply ? "apply" : "preview",
        planHash: ${JSON.stringify(hash)}, ...(args.confirmApply ? { visibility: { checked: true, missingCount: 0 } } : {})
      } });
      server.startServer();
    `], { cwd: root, env: { ...process.env, WL_PROJECT_ROOT: root }, stdio: ["pipe", "pipe", "pipe"] });
    const pending = new Map();
    let nextId = 0;
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => { const reply = JSON.parse(line); pending.get(reply.id)?.(reply); });
    const call = (name, args) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => reject(new Error(`MCP fixture timeout: ${name}`)), 10000);
      pending.set(id, (reply) => { clearTimeout(timer); pending.delete(id); resolve(reply); });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) + "\n");
    });
    try {
      const planned = await call("wls_task", { task: "创建10个菜单", runId: "backend-stdio" });
      expect(planned.result.structuredContent.requiredChecks).toEqual(["backend-preview"]);
      expect(planned.result.content[0].text).toMatch(/匹配技能：菜单同步（menu-sync）；执行工具尚未运行/u);
      const preview = await call("wls_menu_upsert", { items: [{ menuName: "Fixture" }], runId: "backend-stdio" });
      expect(preview.result.content[0].text).toMatch(/^\[WL MCP\] 本次工具=wls_menu_upsert；调用=预览已返回，尚未应用/u);
      expect(preview.result._meta.wlExecution.backend.apply).toBe("unverified");
      await call("wls_menu_upsert", { items: [{ menuName: "Fixture" }], confirmApply: true, planHash: hash, runId: "backend-stdio" });
      const reply = await call("wls_status", { runId: "backend-stdio" });
      const result = reply.result.structuredContent;
      expect(result.pendingChecks).toEqual([]);
      expect(result.tools[0].invocation).toEqual({ channel: "mcp", tool: "wls_menu_upsert" });
      expect(result.tools[0].summary.backend).toMatchObject({ preview: "passed", apply: "passed", postverify: "passed" });
    } finally { child.kill(); lines.close(); }
  });
});

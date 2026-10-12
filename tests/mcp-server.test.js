import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER = path.resolve(__dirname, "..", "mcp", "server.js");
const require = createRequire(import.meta.url);
const { dispatchTool, HANDLERS } = require("../mcp/server");
const children = [];

function startServer() {
  const child = spawn(process.execPath, [SERVER], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, WL_PROJECT_ROOT: path.resolve(__dirname, "missing-project") },
  });
  children.push(child);
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  });
  return {
    call(id, method, params = {}) {
      const response = new Promise((resolve) => pending.set(id, resolve));
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return response;
    },
  };
}

afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

describe("MCP stdio server", () => {
  it("MCP dispatch rejects non-string names and prototype members without tool records", () => {
    const project = mkdtempSync(path.join(tmpdir(), "wl-kit-rpc-dispatch-"));
    try {
      const names = [null, true, 1, [], ["toString"], {}, "", " ", "toString", "constructor", "__proto__"];
      const requests = names.map((name, id) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } }));
      requests.push({ jsonrpc: "2.0", id: "method", method: "toString" }, { jsonrpc: "2.0", id: "alive", method: "ping" });
      const called = spawnSync(process.execPath, [SERVER], { cwd: project, env: { ...process.env, WL_PROJECT_ROOT: project }, input: requests.map(value => JSON.stringify(value)).join("\n") + "\n", encoding: "utf8", timeout: 30000 });
      expect(called.status).toBe(0);
      const replies = called.stdout.trim().split("\n").map(line => JSON.parse(line));
      expect(replies).toHaveLength(requests.length);
      for (let index = 0; index < names.length; index++) expect(replies[index]).toMatchObject({ id: index, error: { code: index < 8 ? -32602 : -32601 } });
      expect(replies.at(-2)).toMatchObject({ id: "method", error: { code: -32601 } });
      expect(replies.at(-1)).toEqual({ jsonrpc: "2.0", id: "alive", result: {} });
      expect(existsSync(path.join(project, ".wl-skills/runs"))).toBe(false);
    } finally { rmSync(project, { recursive: true, force: true }); }
  });

  it("raw JSON-RPC rejects malformed envelopes before execution and replies to null IDs", () => {
    const project = mkdtempSync(path.join(tmpdir(), "wl-kit-rpc-envelope-"));
    try {
      const invalid = [null, true, 12, "raw", [], {},
        { jsonrpc: "1.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2 },
        { jsonrpc: "2.0", id: false, method: "ping" }, { jsonrpc: "2.0", id: {}, method: "ping" },
        { jsonrpc: "2.0", id: [], method: "ping" }, { jsonrpc: "2.0", id: 3, method: "ping", params: null },
        { jsonrpc: "2.0", id: 4, method: "tools/call", params: false }];
      const lines = [" ", "{", ...invalid.map((value) => JSON.stringify(value)),
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        JSON.stringify({ jsonrpc: "2.0", method: "tools/list" }),
        JSON.stringify({ jsonrpc: "2.0", id: null, method: "ping" }),
        JSON.stringify({ jsonrpc: "2.0", id: "alive", method: "ping" })];
      const called = spawnSync(process.execPath, [SERVER], { cwd: project, env: { ...process.env, WL_PROJECT_ROOT: project }, input: lines.join("\n") + "\n", encoding: "utf8", timeout: 30000 });
      expect(called.status).toBe(0);
      const replies = called.stdout.trim().split("\n").map((line) => JSON.parse(line));
      expect(replies).toHaveLength(invalid.length + 3);
      expect(replies[0]).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32700 } });
      for (let index = 0; index < invalid.length; index++) {
        const invalidParams = index >= invalid.length - 2;
        expect(replies[index + 1]).toMatchObject({ jsonrpc: "2.0", id: invalidParams ? invalid[index].id : null, error: { code: invalidParams ? -32602 : -32600 } });
      }
      expect(replies.at(-2)).toEqual({ jsonrpc: "2.0", id: null, result: {} });
      expect(replies.at(-1)).toEqual({ jsonrpc: "2.0", id: "alive", result: {} });
      expect(existsSync(path.join(project, ".wl-skills/runs"))).toBe(false);
    } finally { rmSync(project, { recursive: true, force: true }); }
  });

  it("同一项目的两个写工具调用按顺序执行", async () => {
    const descriptor = HANDLERS.wls_standard_env_apply;
    const original = descriptor.handle;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const events = [];
    let release;
    let started;
    const firstStarted = new Promise((resolve) => { started = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    descriptor.handle = async () => {
      events.push("start");
      if (events.filter((item) => item === "start").length === 1) {
        started();
        await gate;
      }
      events.push("end");
      return "ok";
    };
    try {
      const first = dispatchTool(101, "wls_standard_env_apply", {});
      await firstStarted;
      const second = dispatchTool(102, "wls_standard_env_apply", {});
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(events).toEqual(["start"]);
      release();
      await Promise.all([first, second]);
      expect(events).toEqual(["start", "end", "start", "end"]);
    } finally {
      descriptor.handle = original;
      write.mockRestore();
    }
  });

  it("按客户端请求协商受支持协议版本", async () => {
    const server = startServer();
    const response = await server.call(1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(response.result.protocolVersion).toBe("2025-11-25");
    expect(response.result.instructions).toMatch(/dicts\.ts/);
  });

  it("tools/list 暴露风险 annotations 和写工具 outputSchema", async () => {
    const server = startServer();
    const response = await server.call(2, "tools/list");
    const dict = response.result.tools.find((tool) => tool.name === "wls_dict_upsert");
    expect(dict.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
    expect(dict._meta.wl.businessIdempotent).toBe(true);
    expect(dict.outputSchema.required).toContain("state");
    const menu = response.result.tools.find((tool) => tool.name === "wls_menu_upsert");
    expect(menu.inputSchema.properties).toHaveProperty("planHash");
    expect(menu.outputSchema.required).toContain("state");
  });

  it("在加载后端配置前拒绝类型错误和未声明参数", async () => {
    const server = startServer();
    const response = await server.call(3, "tools/call", {
      name: "wls_role_query",
      arguments: { current: "1", extra: true },
    });
    expect(response.error).toMatchObject({ code: -32602 });
    expect(response.error.message).toMatch(/current.*number/);
    expect(response.error.message).toMatch(/extra.*未声明/);
    expect(response.result).toBeUndefined();
  });

  it("全量字典预览允许使用默认空参数", async () => {
    const server = startServer();
    const response = await server.call(4, "tools/call", {
      name: "wls_dict_upsert",
      arguments: {},
    });
    expect(response.error).toBeUndefined();
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toMatch(/配置加载失败/);
  });

  it("畸形 params 返回 -32602 且不会让 stdio 进程崩溃", async () => {
    const server = startServer();
    const invalid = await server.call(5, "tools/call", null);
    expect(invalid.error).toMatchObject({ code: -32602 });
    const ping = await server.call(6, "ping");
    expect(ping.result).toEqual({});
  });
  it.each([null, false, 0, []])("不把畸形 arguments %j 当默认空对象执行", async (arguments_) => {
    const server = startServer();
    const response = await server.call(7, "tools/call", { name: "wls_validate_page", arguments: arguments_ });
    expect(response.error).toMatchObject({ code: -32602 });
    expect(response.result).toBeUndefined();
  });
  it("分页不安全整数在启动原校验器前拒绝", async () => {
    const server = startServer();
    const response = await server.call(8, "tools/call", { name: "wls_validate_page", arguments: { offset: Number.MAX_SAFE_INTEGER + 1 } });
    expect(response.error).toMatchObject({ code: -32602 });
    expect(response.result).toBeUndefined();
  });
});

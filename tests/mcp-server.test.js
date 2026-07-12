import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER = path.resolve(__dirname, "..", "mcp", "server.js");
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

  it("tools/list 暴露风险 annotations 和字典 outputSchema", async () => {
    const server = startServer();
    const response = await server.call(2, "tools/list");
    const dict = response.result.tools.find((tool) => tool.name === "wls_dict_upsert");
    expect(dict.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(dict.outputSchema.required).toContain("state");
  });
});

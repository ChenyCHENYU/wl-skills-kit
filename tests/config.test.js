import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { loadConfig } = require("../mcp/config");
const roots = [];

function writeConfig(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-mcp-config-"));
  roots.push(root);
  const dir = path.join(root, ".wl-skills", "skills", "sync");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "env.local.json"), JSON.stringify(config));
  process.env.WL_PROJECT_ROOT = root;
}

afterEach(() => {
  delete process.env.WL_PROJECT_ROOT;
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("MCP local config", () => {
  it("加载并规范化合法配置", () => {
    writeConfig({ gatewayPath: "https://example.com/uat-api///", token: "abc.def", sysAppNo: "mdata" });
    expect(loadConfig()).toMatchObject({
      gatewayPath: "https://example.com/uat-api",
      token: "abc.def",
      sysAppNo: "mdata",
    });
  });

  it("拒绝当前 example 中的 token 占位值", () => {
    writeConfig({
      gatewayPath: "https://example.internal/uat-api",
      token: "请填入实际登录凭据（纯 JWT，不含 bearer 前缀）",
    });
    expect(() => loadConfig()).toThrow(/占位值/);
  });

  it("拒绝 bearer 前缀，避免双重 Authorization", () => {
    writeConfig({ gatewayPath: "https://example.internal/uat-api", token: "Bearer abc.def" });
    expect(() => loadConfig()).toThrow(/不含 bearer 前缀/);
  });

  it("拒绝非 HTTP 网关", () => {
    writeConfig({ gatewayPath: "file:///tmp/token", token: "abc.def" });
    expect(() => loadConfig()).toThrow(/仅支持 http\/https/);
  });
});

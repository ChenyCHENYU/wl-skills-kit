import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, "..");

describe("mcp/registry.js", () => {
  const reg = require(path.join(ROOT, "mcp", "registry.js"));

  it("DESCRIPTORS / TOOLS / HANDLERS 长度一致且为 17", () => {
    expect(Array.isArray(reg.DESCRIPTORS)).toBe(true);
    expect(reg.TOOLS.length).toBe(17);
    expect(Object.keys(reg.HANDLERS).length).toBe(17);
    expect(reg.DESCRIPTORS.length).toBe(reg.TOOLS.length);
  });

  it("每个 TOOLS 项均有 name / description / inputSchema 三字段", () => {
    for (const t of reg.TOOLS) {
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe("string");
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputSchema).toBeTypeOf("object");
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("Tool 名前缀均为 wls_", () => {
    for (const t of reg.TOOLS) {
      expect(t.name.startsWith("wls_")).toBe(true);
    }
  });

  it("Tool 名无重复", () => {
    const names = reg.TOOLS.map((t) => t.name);
    const uniq = new Set(names);
    expect(uniq.size).toBe(names.length);
  });

  it("每个 HANDLER 有 handle 函数和 needsBackendConfig 布尔字段", () => {
    for (const name of Object.keys(reg.HANDLERS)) {
      const h = reg.HANDLERS[name];
      expect(typeof h.handle).toBe("function");
      expect(typeof h.needsBackendConfig).toBe("boolean");
    }
  });
});

describe("Skill 计数（_registry.md 单一数据源）", () => {
  it("✅ 启用 行数为 10", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "files/.github/skills/_registry.md"),
      "utf8",
    );
    const matches = content.match(/^\|\s*[\w-]+\s*\|\s*✅\s*启用\s*\|/gm) || [];
    expect(matches.length).toBe(10);
  });

  it("README.md 中的 N 个 AI Skill 与启用 Skill 数一致", () => {
    const registry = fs.readFileSync(
      path.join(ROOT, "files/.github/skills/_registry.md"),
      "utf8",
    );
    const enabled = (
      registry.match(/^\|\s*[\w-]+\s*\|\s*✅\s*启用\s*\|/gm) || []
    ).length;
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    const m = readme.match(/(\d+) 个 AI Skill/);
    expect(m).toBeTruthy();
    expect(parseInt(m[1], 10)).toBe(enabled);
  });
});

describe("package.json", () => {
  const pkg = require(path.join(ROOT, "package.json"));

  it("description 包含与 version 一致的 vX.Y.Z", () => {
    const m = pkg.description.match(/v(\d+\.\d+\.\d+)/);
    expect(m).toBeTruthy();
    expect(m[1]).toBe(pkg.version);
  });

  it("description 中的 N 个 AI Skill 与 _registry.md 一致", () => {
    const registry = fs.readFileSync(
      path.join(ROOT, "files/.github/skills/_registry.md"),
      "utf8",
    );
    const enabled = (
      registry.match(/^\|\s*[\w-]+\s*\|\s*✅\s*启用\s*\|/gm) || []
    ).length;
    const m = pkg.description.match(/(\d+) 个 AI Skill/);
    expect(m).toBeTruthy();
    expect(parseInt(m[1], 10)).toBe(enabled);
  });
});

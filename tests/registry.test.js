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

  it("DESCRIPTORS / TOOLS / HANDLERS 长度一致且为 23", () => {
    expect(Array.isArray(reg.DESCRIPTORS)).toBe(true);
  expect(reg.TOOLS.length).toBe(23);
  expect(Object.keys(reg.HANDLERS).length).toBe(23);
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
      expect(t.annotations).toMatchObject({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        idempotentHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      });
    }
  });

  it("字典发布声明结构化输出和非破坏性幂等提示", () => {
    const tool = reg.TOOLS.find((item) => item.name === "wls_dict_upsert");
    expect(tool.inputSchema.anyOf).toBeUndefined();
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(tool.inputSchema.properties).not.toHaveProperty("module");
    expect(tool.inputSchema.properties).not.toHaveProperty("dict");
    expect(tool.inputSchema.properties).not.toHaveProperty("items");
    expect(tool.outputSchema?.required).toEqual(["ok", "state"]);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it("菜单和权限写工具统一要求 planHash 并声明结构化输出", () => {
    const names = [
      "wls_menu_upsert",
      "wls_menu_sync_from_report",
      "wls_role_upsert",
      "wls_role_assign_menus",
      "wls_action_upsert",
    ];
    for (const name of names) {
      const tool = reg.TOOLS.find((item) => item.name === name);
      expect(tool.inputSchema.properties, name).toHaveProperty("planHash");
      expect(tool.outputSchema?.required, name).toEqual(["ok", "state"]);
    }
  });

  it("所有工具根参数均拒绝未声明字段", () => {
    for (const tool of reg.TOOLS) {
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
  });

  it("旧项目字典引导只写本地、幂等且不访问外部系统", () => {
    const tool = reg.TOOLS.find((item) => item.name === "wls_dict_bootstrap");
    expect(tool.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
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
  it("✅ 启用 行数为 12", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "files/.wl-skills/skills/_registry.md"),
      "utf8",
    );
    const matches = content.match(/^\|\s*[\w-]+\s*\|\s*✅\s*启用\s*\|/gm) || [];
    expect(matches.length).toBe(12);
  });

  it("README.md 中的 N 个 AI Skill 与启用 Skill 数一致", () => {
    const registry = fs.readFileSync(
      path.join(ROOT, "files/.wl-skills/skills/_registry.md"),
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
      path.join(ROOT, "files/.wl-skills/skills/_registry.md"),
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

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const FILES = path.join(ROOT, "files");
const require = createRequire(import.meta.url);
const { buildEditorConfigs, canonicalSkills, parseSkillMetadata } = require(
  path.join(ROOT, "lib", "editor-adapters.js"),
);

describe("Kilo Code 原生适配", () => {
  const entryBody = fs.readFileSync(
    path.join(FILES, ".github", "copilot-instructions.md"),
    "utf8",
  );
  const configs = new Map(buildEditorConfigs(FILES, entryBody));
  const skills = canonicalSkills(FILES);

  it("使用官方 rules/skills 路径，不再生成错误的 steering 路径", () => {
    expect(configs.has(".kilo/rules/wl-skills.md")).toBe(true);
    expect(configs.has(".kilo/steering/conventions.md")).toBe(false);
  });

  it("为全部规范源生成同名薄适配器，且不复制流程正文", () => {
    expect(skills).toHaveLength(12);
    for (const skill of skills) {
      const rel = `.kilo/skills/${skill.name}/SKILL.md`;
      const adapter = configs.get(rel);
      expect(adapter, rel).toBeTypeOf("string");
      expect(parseSkillMetadata(adapter, rel).name).toBe(skill.name);
      expect(adapter).toContain(`完整读取 \`${skill.canonicalPath}\``);
      expect(adapter).toContain("不复制业务流程");
    }
  });

  it("项目配置显式注册 rule 和 wl-skills MCP", () => {
    const config = JSON.parse(fs.readFileSync(path.join(FILES, ".kilo", "kilo.jsonc"), "utf8"));
    expect(config.instructions).toContain(".kilo/rules/wl-skills.md");
    expect(config.mcp["wl-skills"]).toMatchObject({
      type: "local",
      enabled: true,
    });
    expect(config.mcp["wl-skills"].command).toContain(
      "node_modules/@agile-team/wl-skills-kit/mcp/server.js",
    );
  });
});

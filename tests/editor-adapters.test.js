import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const FILES = path.join(ROOT, "files");
const require = createRequire(import.meta.url);
const {
  buildEditorConfigs,
  canonicalSkills,
  parseSkillMetadata,
  registeredSkillPaths,
} = require(
  path.join(ROOT, "lib", "editor-adapters.js"),
);

describe("Kilo Code 原生适配", () => {
  const entryBody = fs.readFileSync(
    path.join(FILES, ".github", "copilot-instructions.md"),
    "utf8",
  );
  const configs = new Map(buildEditorConfigs(FILES, entryBody));
  const skills = canonicalSkills(FILES);

  it("provides one owned Codex gateway without copying all skills", () => {
    const native = [...configs.keys()].filter((key) => key.startsWith(".agents/skills/"));
    expect(native).toEqual([".agents/skills/wl-skills-kit/SKILL.md"]);
    const gateway = configs.get(native[0]);
    expect(parseSkillMetadata(gateway, native[0]).name).toBe("wl-skills-kit");
    expect(gateway).toContain("--run-id");
    expect(gateway).not.toContain("## Pre-flight");
  });

  it("ships the same project-local CLI and connected MCP guidance in both native entries", () => {
    const { taskEntryGuidance } = require(path.join(ROOT, "lib/task-gateway.js"));
    const guidance = taskEntryGuidance();
    expect(guidance).toContain("node node_modules/@agile-team/wl-skills-kit/bin/wl-skills.js task");
    expect(guidance).toMatch(/当前宿主已连接本项目的 Kit MCP[^\n]+wls_task[^\n]+wls_status/);
    expect(guidance).toMatch(/只查能力或解释用法[^\n]+wls_route[^\n]+wls_explain[^\n]+保持只读/);
    expect(guidance).toMatch(/要求实际预览[^\n]+`task`[^\n]+MCP 的预览[^\n]+不提交写入/);
    expect(guidance).toContain("两个入口均不可用时，直接说明当前未执行");
    expect(guidance).toContain("传给 `task` 的是用户原始任务");
    expect(guidance).toMatch(/MCP 被宿主审批拦截时[^\n]+当前未执行和审批状态/);
    expect(configs.get("AGENTS.md")).toContain(guidance);
    expect(configs.get(".agents/skills/wl-skills-kit/SKILL.md")).toContain(guidance);
  });

  it("shares one gateway for Codex, ZCode and Kilo and generates only selected host entries", () => {
    const selected = new Map(buildEditorConfigs(FILES, entryBody, { hosts: ["codex", "zcode", "kilo"] }));
    expect([...selected.keys()]).toEqual([".agents/skills/wl-skills-kit/SKILL.md", "AGENTS.md"]);
    const special = new Map(buildEditorConfigs(FILES, entryBody, { hosts: ["claude", "cline", "kiro"] }));
    expect([...special.keys()].filter(key => key.endsWith("SKILL.md"))).toEqual([".claude/skills/wl-skills-kit/SKILL.md", ".kiro/skills/wl-skills-kit/SKILL.md"]);
    expect(special.has(".kiro/steering/wl-skills-kit.md")).toBe(true);
    expect(special.has(".windsurfrules")).toBe(false);
  });

  it("keeps the complete registered catalog in the package without leaf skill copies", () => {
    expect(skills).toHaveLength(13);
    expect(skills.map(skill => skill.canonicalPath).sort()).toEqual(registeredSkillPaths(FILES).map(source => `.wl-skills/${source}`).sort());
    expect([...configs.keys()].filter(key => key.endsWith("SKILL.md"))).toHaveLength(1);
  });

  it("plans native Kilo MCP beside the shared AGENTS gateway without static templates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-kilo-adapter-"));
    try {
      const { planMcpConfiguration } = require(path.join(ROOT, "lib/mcp-config.cjs"));
      const plan = planMcpConfiguration({ projectRoot: root, packageName: "@agile-team/wl-skills-kit", hosts: ["kilo"], enabled: true });
      expect(plan.files).toHaveLength(1);
      expect(plan.files[0].path).toBe(".kilo/kilo.jsonc");
      const config = JSON.parse(plan.files[0].content);
      const actualRoot = fs.realpathSync(root);
      expect(config.instructions).toBeUndefined();
      expect(config.mcp["wl-skills"]).toEqual({
        type: "local", enabled: true,
        command: ["node", path.join(actualRoot, "node_modules/@agile-team/wl-skills-kit/mcp/server.js")],
        environment: { WL_PROJECT_ROOT: actualRoot },
      });
      expect(plan.records[".kilo/kilo.jsonc"].owned).toBe(true);
      expect(configs.has("AGENTS.md")).toBe(true);
      expect(fs.existsSync(path.join(root, ".kilo/kilo.jsonc"))).toBe(false);
      expect(fs.existsSync(path.join(FILES, ".kilo/kilo.jsonc"))).toBe(false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});

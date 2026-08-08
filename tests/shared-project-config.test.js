import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  desiredSharedProjectConfig,
  resolveSharedProjectConfigTarget,
} = require("../lib/shared-project-config");
const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wl-shared-config-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("共享项目配置", () => {
  it("优先复用已有 Kilo 根配置", () => {
    const root = temporaryDirectory();
    expect(resolveSharedProjectConfigTarget(root, ".kilo/kilo.jsonc")).toBe(
      ".kilo/kilo.jsonc",
    );
    fs.writeFileSync(path.join(root, "kilo.jsonc"), "{}\n");
    expect(resolveSharedProjectConfigTarget(root, ".kilo/kilo.jsonc")).toBe(
      "kilo.jsonc",
    );
  });

  it("无损合并 JSONC 注释、GLM provider、团队规则和 MCP", () => {
    const root = temporaryDirectory();
    const source = path.join(root, "source.jsonc");
    const target = path.join(root, "kilo.jsonc");
    fs.writeFileSync(
      source,
      JSON.stringify({
        $schema: "https://app.kilo.ai/config.json",
        instructions: [".kilo/rules/wl-skills.md"],
        mcp: { "wl-skills": { type: "local", command: ["node", "server.js"] } },
      }),
    );
    fs.writeFileSync(
      target,
      [
        "{",
        "  // 团队使用 GLM 5.2，不得覆盖",
        '  "provider": { "zhipu": { "model": "glm-5.2" } },',
        '  "instructions": ["docs/team.md"],',
        '  "mcp": { "team-server": { "type": "local", "command": ["node", "team.js"] } },',
        "}",
        "",
      ].join("\n"),
    );

    const merged = desiredSharedProjectConfig(".kilo/kilo.jsonc", source, target);
    expect(merged).toContain("// 团队使用 GLM 5.2，不得覆盖");
    expect(merged).toContain('"model": "glm-5.2"');
    expect(merged).toContain('"docs/team.md"');
    expect(merged).toContain('".kilo/rules/wl-skills.md"');
    expect(merged).toContain('"team-server"');
    expect(merged).toContain('"wl-skills"');
  });

  it("拒绝破损 JSONC，避免污染用户配置", () => {
    const root = temporaryDirectory();
    const source = path.join(root, "source.json");
    const target = path.join(root, "target.jsonc");
    fs.writeFileSync(source, JSON.stringify({ mcp: { "wl-skills": {} } }));
    fs.writeFileSync(target, "{ invalid }");
    expect(() =>
      desiredSharedProjectConfig(".kilo/kilo.jsonc", source, target),
    ).toThrow(/不是有效 JSON\/JSONC/);
  });
});

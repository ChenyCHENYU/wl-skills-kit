import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const KIT_BIN = path.join(path.dirname(require.resolve("../package.json")), "bin", "wl-skills.js");
const TEST_BIN = path.join(path.dirname(require.resolve("../package.json")), "..", "wl-skills-test", "bin", "wl-skills-test.js");

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), "wl-clinerules-"));
}

function run(bin, args, cwd) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", timeout: 120000 });
}

describe("共享 skills 入口共存", () => {
  it("kit 与 test 默认共用发现目录且不生成 clinerules", () => {
    const root = tempRoot();
    const kit = run(KIT_BIN, ["init"], root);
    expect(kit.status, kit.stderr).toBe(0);
    const { existsSync } = require("node:fs");
    expect(existsSync(path.join(root, ".clinerules"))).toBe(false);
    expect(existsSync(path.join(root, ".agents/skills/wl-skills-kit/SKILL.md"))).toBe(true);
    if (existsSync(TEST_BIN)) {
      const test = run(TEST_BIN, ["init"], root);
      expect(test.status, test.stdout + test.stderr).toBe(0);
      expect(existsSync(path.join(root, ".agents/skills/wl-skills-test/SKILL.md"))).toBe(true);
      expect(existsSync(path.join(root, ".agents/skills/wl-skills-kit/SKILL.md"))).toBe(true);
    }
  });
});

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

describe(".clinerules 目录形态共存（安装顺序无关）", () => {
  it("kit 先装写目录形态，test 后装不冲突", () => {
    const root = tempRoot();
    const kit = run(KIT_BIN, ["init"], root);
    expect(kit.status, kit.stderr).toBe(0);
    const { statSync, existsSync } = require("node:fs");
    expect(existsSync(path.join(root, ".clinerules"))).toBe(true);
    expect(statSync(path.join(root, ".clinerules")).isDirectory()).toBe(true);
    expect(existsSync(path.join(root, ".clinerules", "wl-skills-kit.md"))).toBe(true);
    if (existsSync(TEST_BIN)) {
      const test = run(TEST_BIN, ["init"], root);
      expect(test.status, test.stdout + test.stderr).toBe(0);
      expect(existsSync(path.join(root, ".clinerules", "wl-skills-test.md"))).toBe(true);
      expect(existsSync(path.join(root, ".clinerules", "wl-skills-kit.md"))).toBe(true);
    }
  });
});

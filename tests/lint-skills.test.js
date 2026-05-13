import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT = path.resolve(__dirname, "..", "scripts", "lint-skills.js");

describe("lint-skills", () => {
  it("当前仓库通过 Skill Lint", () => {
    const r = spawnSync("node", [SCRIPT], { encoding: "utf8" });
    if (r.status !== 0) {
      throw new Error(
        `lint-skills 非 0 退出 (${r.status})，输出:\n${r.stdout}${r.stderr}`,
      );
    }
    expect(r.stdout).toMatch(/Skill Lint 通过/);
  });
});

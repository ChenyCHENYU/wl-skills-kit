import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "bin", "wl-skills.js");

// 全量并行回归时 Windows 子进程启动可能超过 Vitest 默认 5 秒。
vi.setConfig({ testTimeout: 30000 });

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wl-skills-doctor-"));
}
function w(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}
function run(cwd) {
  return spawnSync("node", [CLI, "doctor-ui"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 15000,
  });
}

describe("doctor-ui: wl-skills-ui 接入检查", () => {
  it("未安装 wl-skills-ui 时报未安装", () => {
    const dir = makeDir();
    w(dir, "package.json", "{}");
    w(dir, "src/views/a/index.vue", "<template><div /></template>");
    const r = run(dir);
    expect(r.stdout).toMatch(/@agile-team\/wl-skills-ui/);
  });

  it("已安装 wl-skills-ui 时通过该项检查", () => {
    const dir = makeDir();
    w(
      dir,
      "package.json",
      JSON.stringify({
        name: "x",
        dependencies: { "@agile-team/wl-skills-ui": "1", "@element-plus/icons-vue": "2" },
      }),
    );
    w(dir, "src/views/a/index.vue", "<template><div /></template>");
    const r = run(dir);
    expect(r.stdout).toMatch(/wl-skills-ui/);
  });
});

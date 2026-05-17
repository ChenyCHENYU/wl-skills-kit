import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "bin", "wl-skills.js");

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

describe("doctor-ui: C_Splitter 残留扫描", () => {
  it("空目录无残留时通过该项检查", () => {
    const dir = makeDir();
    w(
      dir,
      "package.json",
      JSON.stringify({
        name: "x",
        dependencies: { "@agile-team/wk-skills-ui": "1", "@element-plus/icons-vue": "2" },
      }),
    );
    w(dir, "src/views/a/index.vue", "<template><div /></template>");
    const r = run(dir);
    expect(r.stdout).toMatch(/C_Splitter 业务代码残留 — 无/);
    expect(r.stdout).toMatch(/C_Splitter 文档\/规则残留 — 无/);
  });

  it("业务代码含 C_Splitter 时报错并列出明细", () => {
    const dir = makeDir();
    w(dir, "package.json", "{}");
    w(
      dir,
      "src/views/a/index.vue",
      '<template><C_Splitter direction="vertical"><div/></C_Splitter></template>',
    );
    const r = run(dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/C_Splitter 业务代码残留 — [12] 处/);
    expect(r.stdout).toMatch(/src\/views\/a\/index\.vue/);
  });

  it("含'已废弃/严禁'豁免词的 markdown 不算残留", () => {
    const dir = makeDir();
    w(dir, "package.json", "{}");
    w(
      dir,
      "docs/x.md",
      "本文档严禁使用 C_Splitter，请改 jh-drag-col。\n",
    );
    const r = run(dir);
    expect(r.stdout).toMatch(/C_Splitter 文档\/规则残留 — 无/);
  });

  it("C_Splitter 自身组件目录被自动豁免", () => {
    const dir = makeDir();
    w(dir, "package.json", "{}");
    w(
      dir,
      "src/components/global/C_Splitter/index.vue",
      "<template><C_Splitter/></template>",
    );
    const r = run(dir);
    expect(r.stdout).toMatch(/C_Splitter 业务代码残留 — 无/);
  });
});

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BIN = path.join(path.dirname(require.resolve("../package.json")), "bin", "wl-skills.js");

function fixtureWith(pages) {
  const root = mkdtempSync(path.join(os.tmpdir(), "wl-k22-"));
  mkdirSync(path.join(root, "node_modules", "@agile-team"), { recursive: true });
  for (const [dir, files] of Object.entries(pages)) {
    mkdirSync(path.join(root, dir), { recursive: true });
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(root, dir, name), content);
  }
  return root;
}

function validate(root) {
  const run = spawnSync(process.execPath, [BIN, "validate", "--json", "--target", "src/views"], { cwd: root, encoding: "utf8" });
  const line = run.stdout.split("\n").find((l) => l.startsWith("{"));
  return JSON.parse(line);
}

describe("K22：文件头 @Description 结构检查", () => {
  it("占位 Description 报 warn（rule=K22）", () => {
    const root = fixtureWith({
      "src/views/a": {
        "index.vue": "<!--\n * @Author: Tester\n * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置\n-->\n<template><div>a</div></template>",
        "data.ts": "export const columns = [];",
        "index.scss": ".a{}",
      },
    });
    const report = validate(root);
    const k22 = report.issues.filter((issue) => issue.rule === "K22");
    expect(k22).toHaveLength(1);
    expect(k22[0].level).toBe("warn");
    expect(k22[0].dir).toBe("src/views/a");
  });

  it("有效 Description（菜单路径+职责）不触发", () => {
    const root = fixtureWith({
      "src/views/b": {
        "index.vue": "<!--\n * @Author: Tester\n * @Date: 2026-10-01\n * @Description: 生产 > 生产炼钢 > 测试 > 有效页面（T001）；负责查询列表的视图绑定。\n-->\n<template><div>b</div></template>",
        "data.ts": "export const columns = [];",
        "index.scss": ".b{}",
      },
    });
    const report = validate(root);
    expect(report.issues.filter((issue) => issue.rule === "K22")).toHaveLength(0);
  });

  it("字符串中出现占位词不误报（只解析注释节点）；作者/时间字段保留不受影响", () => {
    const root = fixtureWith({
      "src/views/c": {
        "index.vue": "<!--\n * @Author: 保真\n * @LastEditTime: 2026-10-09 01:00:00\n * @Description: 生产 > 模块 > 页面（C001）；负责查询列表的视图绑定。\n-->\n<template><div>{{ \"这是默认设置 customMade\" }}</div></template>",
        "data.ts": "export const columns = [];",
        "index.scss": ".c{}",
      },
    });
    const report = validate(root);
    expect(report.issues.filter((issue) => issue.rule === "K22")).toHaveLength(0);
  });

  it("有注释头但缺 @Description 给 info 建议（不阻断）", () => {
    const root = fixtureWith({
      "src/views/d": {
        "index.vue": "<!--\n * @Author: Tester\n-->\n<template><div>d</div></template>",
        "data.ts": "export const columns = [];",
        "index.scss": ".d{}",
      },
    });
    const report = validate(root);
    const k22 = report.issues.filter((issue) => issue.rule === "K22");
    expect(k22).toHaveLength(1);
    expect(k22[0].level).toBe("info");
  });
});

#!/usr/bin/env node
/**
 * scripts/sync-version.js — 版本号四处同步（终结手动改版本）
 *
 * 单一事实源：package.json#version。同步以下锚点（找不到锚点即报错退出，
 * 防止文件结构变化后静默失同步）：
 *   1. package.json#description            "AI Skill 模板包 vX.Y.Z — …"
 *   2. bin/wl-skills.js 头部注释            "wl-skills-kit CLI vX.Y.Z"
 *   3. files/.wl-skills/guides/architecture.md "> **当前版本**：vX.Y.Z（YYYY-MM-DD）"（日期同步为当天）
 *   4. README.md 标题行                     "**AI Skill 模板包 vX.Y.Z**"
 *
 * 用法：node scripts/sync-version.js  （在改完 package.json#version 后运行）
 * 幂等：重复执行结果一致。内部维护脚本，不随 npm 包发布（scripts/ 不在 files 白名单）。
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, content) =>
  fs.writeFileSync(path.join(root, rel), content, "utf8");

const pkg = JSON.parse(read("package.json"));
const {version} = pkg;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`[sync-version] ✖ 非法版本号: ${version}`);
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);

let failures = 0;

/** 在 target 中按 pattern 替换版本（日期可选），pattern 不命中记失败 */
function syncAnchor(rel, pattern, replacement, label) {
  const before = read(rel);
  const after = before.replace(pattern, replacement);
  if (before === after && !pattern.test(before)) {
    console.error(`[sync-version] ✖ ${rel}: 未找到锚点（${label}）`);
    failures++;
    return;
  }
  if (before !== after) write(rel, after);
  console.log(`[sync-version] ✔ ${rel}: ${label} → v${version}`);
}

// 1. package.json description
syncAnchor(
  "package.json",
  /AI Skill \u6a21\u677f\u5305 v\d+\.\d+\.\d+/,
  `AI Skill \u6a21\u677f\u5305 v${version}`,
  "description 版本",
);

// 2. bin/wl-skills.js CLI 头注释
syncAnchor(
  path.join("bin", "wl-skills.js"),
  new RegExp(`wl-skills-kit CLI v\\d+\\.\\d+\\.\\d+`),
  `wl-skills-kit CLI v${version}`,
  "CLI 头注释",
);

// 3. architecture.md 当前版本行（版本 + 日期一起同步）
syncAnchor(
  path.join("files", ".wl-skills", "guides", "architecture.md"),
  /\u5f53\u524d\u7248\u672c\*\*\uff1av\d+\.\d+\.\d+\uff08\d{4}-\d{2}-\d{2}\uff09/,
  `\u5f53\u524d\u7248\u672c**\uff1av${version}\uff08${today}\uff09`,
  "当前版本行",
);

// 4. README.md 标题
syncAnchor(
  "README.md",
  /\*\*AI Skill \u6a21\u677f\u5305 v\d+\.\d+\.\d+\*\*/,
  `**AI Skill \u6a21\u677f\u5305 v${version}**`,
  "README 标题",
);

if (failures > 0) {
  console.error(`[sync-version] ✖ ${failures} 个锚点未同步`);
  process.exit(1);
}
console.log(`[sync-version] ✔ 全部锚点已同步到 v${version}（${today}）`);

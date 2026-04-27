#!/usr/bin/env node
/**
 * sync-version.js
 *
 * 由 npm version 钩子触发，将 package.json 的新版本号同步到：
 *   - README.md         头部标题行
 *   - files/.github/guides/architecture.md  "当前版本" 行
 *   - bin/wl-skills.js  顶部注释行
 *
 * 使用方式（勿手动运行）：
 *   npm version patch   ← 自动触发此脚本
 */

const fs   = require("fs");
const path = require("path");

const version = process.env.npm_package_version;
if (!version) {
  console.error("[sync-version] 错误：npm_package_version 未设置，请通过 npm version 命令触发。");
  process.exit(1);
}

const ROOT  = path.resolve(__dirname, "..");
const today = new Date().toISOString().slice(0, 10);

const updates = [
  {
    file   : "README.md",
    regex  : /AI Skill 模板包 v[\d.]+/,
    replace: `AI Skill 模板包 v${version}`,
  },
  {
    file   : "files/.github/guides/architecture.md",
    regex  : /\*\*当前版本\*\*：v[\d.]+（[^）]+）/,
    replace: `**当前版本**：v${version}（${today}）`,
  },
  {
    file   : "bin/wl-skills.js",
    regex  : /wl-skills-kit CLI v[\d.]+/,
    replace: `wl-skills-kit CLI v${version}`,
  },
];

let ok = true;
for (const { file, regex, replace } of updates) {
  const abs = path.join(ROOT, file);
  let content;
  try {
    content = fs.readFileSync(abs, "utf8");
  } catch (e) {
    console.error(`[sync-version] 无法读取 ${file}：${e.message}`);
    ok = false;
    continue;
  }
  if (!regex.test(content)) {
    console.warn(`[sync-version] 警告：${file} 中未找到版本占位符，跳过`);
    continue;
  }
  fs.writeFileSync(abs, content.replace(regex, replace));
  console.log(`  ✔ ${file}  →  ${replace}`);
}

if (!ok) process.exit(1);
console.log(`\n[sync-version] 完成：v${version}（${today}）`);

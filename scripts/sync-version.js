#!/usr/bin/env node
/**
 * sync-version.js
 *
 * 由 npm version 钩子触发，将 package.json 的新版本号同步到：
 *   - README.md                              头部标题行
 *   - files/.github/guides/architecture.md  "当前版本" 行
 *   - bin/wl-skills.js                       顶部注释行
 *   - package.json description               npm 页面描述
 *   - files/.github/skills/_compat/headers/  三个含版本描述的 header 文件
 *
 * 同时维护「Skill 数量」常量：当 _registry.md 中 ✅ 启用 的行数变化时，
 * 手动更新下方 SKILL_COUNT，sync-version 会自动将其同步到所有引用处。
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

// ── Skill 数量（✅ 启用的技能总数，激活新 Skill 时同步更新这里）─────────────
const SKILL_COUNT = 8;
// ──────────────────────────────────────────────────────────────────────────────

const SKILL_DESC_PATTERN = /13 条标准 \+ \d+ 个 Skill 自动调度/g;
const SKILL_DESC_REPLACE = `13 条标准 + ${SKILL_COUNT} 个 Skill 自动调度`;

const updates = [
  {
    file   : "README.md",
    regex  : /AI Skill 模板包 v[\d.]+/g,
    replace: `AI Skill 模板包 v${version}`,
  },
  {
    file   : "README.md",
    regex  : /一条命令将 13 条编码规范、\d+ 个 AI Skill/g,
    replace: `一条命令将 13 条编码规范、${SKILL_COUNT} 个 AI Skill`,
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
  {
    file   : "package.json",
    regex  : /"description": ".*?"/,
    replace: `"description": "AI Skill 模板包 v${version} — 13 条编码规范 + ${SKILL_COUNT} 个 AI Skill，一条命令导入 Vue 3 项目"`,
  },
  {
    file   : "files/.github/skills/_compat/headers/cursor-mdc.txt",
    regex  : SKILL_DESC_PATTERN,
    replace: SKILL_DESC_REPLACE,
  },
  {
    file   : "files/.github/skills/_compat/headers/trae.txt",
    regex  : SKILL_DESC_PATTERN,
    replace: SKILL_DESC_REPLACE,
  },
  {
    file   : "files/.github/skills/_compat/headers/kiro.txt",
    regex  : SKILL_DESC_PATTERN,
    replace: SKILL_DESC_REPLACE,
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
  // regex 可能是带 g flag 的，先 test 再 replace
  const pattern = typeof regex === "string" ? new RegExp(regex) : regex;
  if (!pattern.test(content)) {
    console.warn(`[sync-version] 警告：${file} 中未找到占位符，跳过`);
    continue;
  }
  fs.writeFileSync(abs, content.replace(regex, replace));
  console.log(`  ✔ ${file}`);
}

if (!ok) process.exit(1);
console.log(`\n[sync-version] 完成：v${version}（${today}）  Skill 数：${SKILL_COUNT} 个`);


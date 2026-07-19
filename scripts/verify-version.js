#!/usr/bin/env node
/**
 * verify-version.js
 *
 * 自检 package.json#version 是否同步到所有应当包含 v${version} 的位置：
 *   - bin/wl-skills.js              CLI header 注释
 *   - README.md                      标题行
 *   - package.json#description       npm 页面描述
 *   - files/.wl-skills/guides/architecture.md   "当前版本"
 *   - files/.wl-skills/skills/_compat/headers/{cursor-mdc, kiro, trae}.txt 描述行
 *
 * 同时校验：
 *   - README.md 中的 "{N} 个 AI Skill" 与 _registry.md ✅ 启用 行数一致
 *
 * 使用方式：
 *   pnpm version:verify
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PKG = require(path.join(ROOT, "package.json"));
const VERSION = PKG.version;

const errors = [];
const warnings = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function checkVersionMatch(file, regex, label) {
  let content;
  try {
    content = read(file);
  } catch (e) {
    errors.push(`${file}: 读取失败 - ${e.message}`);
    return;
  }
  const matches = content.match(regex);
  if (!matches || matches.length === 0) {
    warnings.push(`${file}: ${label} - 未找到匹配模式 ${regex}`);
    return;
  }
  for (const m of matches) {
    const v = (m.match(/v?(\d+\.\d+\.\d+)/) || [])[1];
    if (!v) {
      errors.push(`${file}: ${label} 解析版本号失败 - "${m}"`);
      continue;
    }
    if (v !== VERSION) {
      errors.push(
        `${file}: ${label} 版本不一致 (${v} vs ${VERSION}) — 命中 "${m}"`,
      );
    }
  }
}

// ─── 版本一致性检查 ─────────────────────────────────────────────────────

checkVersionMatch(
  "bin/wl-skills.js",
  /wl-skills-kit CLI v\d+\.\d+\.\d+/,
  "CLI header",
);
checkVersionMatch("README.md", /AI Skill 模板包 v\d+\.\d+\.\d+/, "README 标题");
checkVersionMatch(
  "files/.wl-skills/guides/architecture.md",
  /\*\*当前版本\*\*：v\d+\.\d+\.\d+/,
  "guides/architecture.md",
);
// headers/*.txt 不含 vX.Y.Z，改为校验"N 个 Skill"是否与 _registry.md 一致（在下方 Skill 计数检查中处理）

// description 字段单独验证
const descMatch = (PKG.description || "").match(/v(\d+\.\d+\.\d+)/);
if (!descMatch) {
  errors.push("package.json#description: 未包含 vX.Y.Z 版本号");
} else if (descMatch[1] !== VERSION) {
  errors.push(
    `package.json#description: 版本不一致 (${descMatch[1]} vs ${VERSION})`,
  );
}

// ─── Skill 数量一致性检查 ────────────────────────────────────────────────

function countEnabledSkills() {
  const registry = read("files/.wl-skills/skills/_registry.md");
  // 路由表行：| skill-name | ✅ 启用 | path | trigger |
  // 行首是 |，第一列 skill-name（含连字符），第二列 ✅ 启用
  const matches = registry.match(/^\|\s*[\w-]+\s*\|\s*✅\s*启用\s*\|/gm) || [];
  return matches.length;
}

const enabledCount = countEnabledSkills();
if (enabledCount === 0) {
  errors.push("_registry.md: 未解析到任何启用 Skill，可能正则失配");
}

const readmeContent = read("README.md");
const skillCountMatches = readmeContent.match(/(\d+)\s*个 AI Skill/g) || [];
if (skillCountMatches.length === 0) {
  warnings.push("README.md: 未找到 'N 个 AI Skill' 模式");
}
for (const m of skillCountMatches) {
  const n = parseInt(m.match(/(\d+)/)[1], 10);
  if (n !== enabledCount) {
    errors.push(
      `README.md: '${m}' 与 _registry.md ✅ 启用 (${enabledCount}) 不一致`,
    );
  }
}

// description 中的 N 个 AI Skill 也校验
const descSkillMatch = (PKG.description || "").match(/(\d+) 个 AI Skill/);
if (descSkillMatch && parseInt(descSkillMatch[1], 10) !== enabledCount) {
  errors.push(
    `package.json#description: '${descSkillMatch[0]}' 与 _registry.md ✅ 启用 (${enabledCount}) 不一致`,
  );
}

// headers/*.txt 中 "14 条标准 + N 个 Skill" 描述也校验
for (const headerFile of [
  "files/.wl-skills/skills/_compat/headers/cursor-mdc.txt",
  "files/.wl-skills/skills/_compat/headers/trae.txt",
  "files/.wl-skills/skills/_compat/headers/kiro.txt",
]) {
  let content;
  try {
    content = read(headerFile);
  } catch {
    continue;
  }
  const m = content.match(/14 条标准 \+ (\d+) 个 Skill 自动调度/);
  if (m && parseInt(m[1], 10) !== enabledCount) {
    errors.push(
      `${headerFile}: '${m[0]}' 与 _registry.md ✅ 启用 (${enabledCount}) 不一致`,
    );
  }
}

// ─── npm 发布完整性检查（files 数组是否包含必需目录）──────────────────

const REQUIRED_FILES_DIRS = ["bin/", "files/", "lib/", "mcp/"];
for (const dir of REQUIRED_FILES_DIRS) {
  if (!PKG.files || !PKG.files.includes(dir)) {
    errors.push(
      `package.json#files: 缺少 "${dir}" — 发布到 npm 后 require 将失败`,
    );
  }
}

// 检查 lib/ 下关键文件是否存在
const REQUIRED_LIB_FILES = [
  "lib/ast-rules.js",
  "lib/vite-plugin-wl-skills.js",
  "lib/page-spec.js",
  "lib/safe-fix.js",
  "lib/api-contract.js",
  "lib/standard-env/index.js",
];
for (const rel of REQUIRED_LIB_FILES) {
  const fullPath = path.join(ROOT, rel);
  if (!fs.existsSync(fullPath)) {
    errors.push(`${rel}: 文件不存在 — 发布后 require/import 将失败`);
  }
}

// ─── 输出 ──────────────────────────────────────────────────────────────

if (warnings.length > 0) {
  console.warn("[verify-version] 警告 " + warnings.length + " 项：");
  for (const w of warnings) console.warn("  ⚠ " + w);
}

if (errors.length > 0) {
  console.error("[verify-version] ✖ 失败 " + errors.length + " 项：");
  for (const e of errors) console.error("  ✖ " + e);
  process.exit(1);
}

console.log(
  `[verify-version] ✔ v${VERSION} 在所有位置一致；启用 Skill 数 = ${enabledCount}；npm files 完整`,
);

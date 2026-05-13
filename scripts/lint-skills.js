#!/usr/bin/env node
"use strict";

/**
 * lint-skills — 静态校验 Skill 文件夹的完整性与一致性
 *
 * 检查项：
 *  1. 每个 sync SKILL.md 必须引用 `_mcp-guardrail.md`
 *  2. 每个 sync SKILL.md 必须显式列出"严禁 curl/Invoke-RestMethod"
 *  3. `_registry.md` 中列出的 Skill 路径必须存在
 *  4. `_best-practices.md` / `_pipeline.md` / `_mcp-guardrail.md` 三个公共文件存在
 *  5. 三个 sync SKILL.md 不得保留旧版"TODO_CONFIRM"或回退到 shell 调用的指引
 *
 * 用法：
 *   node scripts/lint-skills.js          # 全量校验
 *   exit code 非 0 表示有违规
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKILLS = path.join(ROOT, "files", ".github", "skills");

const REQUIRED_PUBLIC_FILES = [
  "_registry.md",
  "_pipeline.md",
  "_best-practices.md",
  "sync/_mcp-guardrail.md",
];

const SYNC_SKILLS = [
  "sync/menu-sync/SKILL.md",
  "sync/dict-sync/SKILL.md",
  "sync/permission-sync/SKILL.md",
];

const errors = [];
const warnings = [];

function check(label, cond, msg) {
  (cond ? warnings : errors).push(`${label}: ${msg}`);
}

function fileMust(rel) {
  const full = path.join(SKILLS, rel);
  if (!fs.existsSync(full)) {
    errors.push(`缺失公共文件: ${rel}`);
    return null;
  }
  return fs.readFileSync(full, "utf8");
}

// 1. 公共文件存在性
for (const rel of REQUIRED_PUBLIC_FILES) fileMust(rel);

// 2. sync SKILL.md 内容规则
for (const rel of SYNC_SKILLS) {
  const content = fileMust(rel);
  if (!content) continue;

  if (!/_mcp-guardrail\.md/.test(content)) {
    errors.push(`${rel}: 未引用 _mcp-guardrail.md`);
  }

  if (!/(\u4e25\u7981|\u7981\u6b62|\u4e0d\u5f97|\u7edd\u4e0d\u5141\u8bb8).{0,60}curl/.test(content)) {
    errors.push(`${rel}: 未明确"严禁/不得 curl"等纪律条款`);
  }

  if (/TODO_CONFIRM/.test(content)) {
    errors.push(`${rel}: 仍残留 TODO_CONFIRM 占位`);
  }

  // 不允许 Skill 文档教 AI 在 MCP 失败时去自己调 HTTP
  if (
    /AI.{0,10}\u624b\u52a8.{0,10}\u8c03\u63a5\u53e3/.test(content) &&
    !/\u4e0d\u8981\u8ba9.{0,10}AI/.test(content)
  ) {
    warnings.push(`${rel}: 出现"AI 手动调接口"字样，请确认表述是否清晰`);
  }
}

// 3. registry.md 中列出的 SKILL.md 路径存在
const registry = fileMust("_registry.md") || "";
const skillPathRe = /skills\/([\w\-/]+\/SKILL\.md)/g;
let m;
const seen = new Set();
while ((m = skillPathRe.exec(registry)) !== null) {
  const p = m[1];
  if (seen.has(p)) continue;
  seen.add(p);
  const full = path.join(SKILLS, p);
  if (!fs.existsSync(full)) {
    errors.push(`_registry.md 引用了不存在的 Skill: ${p}`);
  }
}

// 输出
if (warnings.length) {
  console.warn("\n⚠️  Skill Lint 警告:");
  for (const w of warnings) console.warn("  " + w);
}

if (errors.length) {
  console.error("\n❌ Skill Lint 错误:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

console.log(
  `\n✅ Skill Lint 通过：公共文件 ${REQUIRED_PUBLIC_FILES.length} 个、sync Skill ${SYNC_SKILLS.length} 个全部合规`
);

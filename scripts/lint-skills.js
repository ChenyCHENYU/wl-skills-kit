#!/usr/bin/env node
"use strict";

/**
 * lint-skills — 静态校验 Skill 文件夹的完整性与一致性
 *
 * 检查项：
 *  1. 每个 sync SKILL.md 必须引用 `_mcp-guardrail.md`
 *  2. 每个 sync SKILL.md 必须显式列出"严禁/不得 curl"等纪律条款
 *  3. 每个有写操作的 core SKILL.md 必须包含 Pre-flight 声明
 *  4. 每个有写操作的 core SKILL.md 必须引用 standards（防止脱离基线）
 *  5. `_registry.md` 中列出的 Skill 路径必须存在
 *  6. `_best-practices.md` / `_pipeline.md` / `_mcp-guardrail.md` 三个公共文件存在
 *  7. 三个 sync SKILL.md 不得保留旧版"TODO_CONFIRM"占位
 *  8. files/ 下的 .vue / .ts 严禁出现 <C_Splitter> 或 import C_Splitter
 *     （组件自身保留，参见 standards/14-layout-containers.md）
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

// 有写操作的 core / ops Skill，需要 Pre-flight + standards 引用
const WRITE_SKILLS = [
  "core/page-codegen/SKILL.md",
  "core/convention-audit/SKILL.md",
  "core/business-doc-extract/SKILL.md",
  "core/template-extract/SKILL.md",
  "ops/code-fix/SKILL.md",
];

const errors = [];
const warnings = [];

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
}

// 3. 有写操作的 core / ops SKILL.md 规则
for (const rel of WRITE_SKILLS) {
  const content = fileMust(rel);
  if (!content) continue;

  if (!/Pre-flight/i.test(content)) {
    errors.push(`${rel}: 有写操作的 Skill 必须包含 Pre-flight 声明`);
  }

  if (!/standards/.test(content)) {
    errors.push(`${rel}: 有写操作的 Skill 必须引用 standards/ 规范基线`);
  }
}

// 4. registry.md 中列出的 SKILL.md 路径存在
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

// 5. files/ 下严禁出现 <C_Splitter>（templates、demo、src 种子均不允许）
//    例外：files/src/components/global/C_Splitter/ 自身（保留废弃组件 + warn）
const FILES_ROOT = path.join(ROOT, "files");
function walkAll(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAll(fp, list);
    else list.push(fp);
  }
  return list;
}
const allowedSplitterFile = path.join(
  FILES_ROOT,
  "src",
  "components",
  "global",
  "C_Splitter",
  "index.vue",
);
const TARGETS = walkAll(FILES_ROOT).filter((fp) =>
  /\.(vue|ts|md)$/.test(fp),
);
for (const fp of TARGETS) {
  if (fp === allowedSplitterFile) continue;
  const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
  const content = fs.readFileSync(fp, "utf8");
  // .vue / .ts 文件检测实际使用（标签或 import），md 文件只在"非反面教材"上下文检测
  if (/\.(vue|ts)$/.test(fp)) {
    if (/<C_Splitter\b/.test(content)) {
      errors.push(`${rel}: 严禁 <C_Splitter>（已废弃，改用 jh-drag-col / jh-drag-row）`);
    }
    if (/from\s+["'][^"']*C_Splitter[^"']*["']/.test(content)) {
      errors.push(`${rel}: 严禁 import C_Splitter（已废弃，改用 jh-drag-col / jh-drag-row）`);
    }
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
  `\n✅ Skill Lint 通过：公共文件 ${REQUIRED_PUBLIC_FILES.length} 个、sync Skill ${SYNC_SKILLS.length} 个、write Skill ${WRITE_SKILLS.length} 个全部合规`,
);

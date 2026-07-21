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
 *  8. 规则覆盖矩阵：rule-coverage.md 标记「阻断」的 R/S 规则必须在执行器中真实存在
 *  9. SKILL.md 主文件不超过 500 行，且声明的一级 references 必须存在
 *
 * 用法：
 *   node scripts/lint-skills.js          # 全量校验
 *   exit code 非 0 表示有违规
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKILLS = path.join(ROOT, "files", ".wl-skills", "skills");

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
  "core/spec-doc-parse/SKILL.md",
  "core/convention-audit/SKILL.md",
  "core/business-doc-extract/SKILL.md",
  "core/template-extract/SKILL.md",
  "ops/code-fix/SKILL.md",
];

const CONFIG_WRITE_SKILLS = ["ops/standard-env-config/SKILL.md"];

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

// 4. 工程配置写入能力独立于页面 standards，但必须具备完整安全闭环
for (const rel of CONFIG_WRITE_SKILLS) {
  const content = fileMust(rel);
  if (!content) continue;

  if (!/Pre-flight/i.test(content)) {
    errors.push(`${rel}: 工程配置写入 Skill 必须包含 Pre-flight 声明`);
  }
  for (const marker of ["wls_standard_env_scan", "confirmApply", "wls_standard_env_verify"]) {
    if (!content.includes(marker)) {
      errors.push(`${rel}: 工程配置写入 Skill 缺少安全闭环 ${marker}`);
    }
  }
}

// 5. registry.md 中列出的 SKILL.md 路径存在
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

function walkAll(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAll(fp, list);
    else list.push(fp);
  }
  return list;
}

// 6. Skill 渐进披露：主文件保持精简，references 只允许引用实际存在的一级文件
const SKILL_FILES = walkAll(SKILLS).filter((fp) => path.basename(fp) === "SKILL.md");
for (const skillPath of SKILL_FILES) {
  const rel = path.relative(SKILLS, skillPath).replace(/\\/g, "/");
  const content = fs.readFileSync(skillPath, "utf8");
  const lineCount = content.split(/\r?\n/).length;
  if (lineCount > 500) {
    errors.push(`${rel}: 主文件 ${lineCount} 行，超过 500 行；请把场景化细节移入 references/`);
  }
  const references = new Set(content.match(/references\/[\w./-]+\.md/g) || []);
  for (const reference of references) {
    if (reference.includes("../")) {
      errors.push(`${rel}: reference 不得跨目录: ${reference}`);
      continue;
    }
    if (!fs.existsSync(path.join(path.dirname(skillPath), reference))) {
      errors.push(`${rel}: 引用了不存在的文件 ${reference}`);
    }
  }
}

// 8. 规则覆盖矩阵：标记「阻断」的 R*/S*/D*/C* 规则必须在执行器代码中真实存在
//    防止矩阵与 AST/page-spec/字典/组件执行器漂移
function readOptionalSource(rel) {
  const filePath = path.join(ROOT, rel);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function rulesInCoverageLine(line) {
  if (!/^\|/.test(line) || !/\|\s*是\s*\|?\s*$/.test(line)) return [];
  return [...new Set([...line.matchAll(/\b([RSDC]\d{1,2})\b/g)].map((match) => match[1]))];
}

function assertRuleImplemented(rule, sources) {
  const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const objectMarker = new RegExp(`rule\\s*:\\s*["']${escaped}["']`);
  const helperMarker = new RegExp(`pushIssue\\([^;\\n]*["']${escaped}["']`);
  if (sources.some((source) => objectMarker.test(source) || helperMarker.test(source))) return;
  errors.push(`rule-coverage.md 标记「阻断」的 ${rule} 在确定性执行器中未找到`);
}

(function checkRuleCoverage() {
  const coveragePath = path.join(ROOT, "kit-internal", "rule-coverage.md");
  if (!fs.existsSync(coveragePath)) {
    warnings.push("kit-internal/rule-coverage.md 不存在，跳过覆盖矩阵校验");
    return;
  }
  const coverage = fs.readFileSync(coveragePath, "utf8");
  const sources = [
    "lib/ast-rules.js",
    "lib/page-spec.js",
    "lib/dict-contract.js",
    "lib/component-catalog.js",
  ]
    .map(readOptionalSource);

  // 解析矩阵中「阻断=是」的行，提取执行器列里的 R*/S*/D*/C* 编号
  for (const line of coverage.split("\n")) {
    for (const rule of rulesInCoverageLine(line)) assertRuleImplemented(rule, sources);
  }
})();

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
  `\n✅ Skill Lint 通过：公共文件 ${REQUIRED_PUBLIC_FILES.length} 个、sync Skill ${SYNC_SKILLS.length} 个、write Skill ${WRITE_SKILLS.length} 个、config Skill ${CONFIG_WRITE_SKILLS.length} 个全部合规`,
);

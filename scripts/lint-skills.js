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
 *  8. files/ 下任意 .vue / .ts 严禁出现 <C_Splitter> 或 import C_Splitter
 *     （组件已彻底删除，无任何例外，参见 standards/14-layout-containers.md）
 *  9. 规则覆盖矩阵：rule-coverage.md 标记「阻断」的 R/S 规则必须在执行器中真实存在
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

// 5. files/ 下严禁出现 <C_Splitter>（组件已彻底删除，无任何例外）
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
const TARGETS = walkAll(FILES_ROOT).filter((fp) => /\.(vue|ts)$/.test(fp));
for (const fp of TARGETS) {
  const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
  const content = fs.readFileSync(fp, "utf8");
  if (/<C_Splitter\b/.test(content)) {
    errors.push(`${rel}: 严禁 <C_Splitter>（已删除，改用 jh-drag-col / jh-drag-row）`);
  }
  if (/from\s+["'][^"']*C_Splitter[^"']*["']/.test(content)) {
    errors.push(`${rel}: 严禁 import C_Splitter（已删除，改用 jh-drag-col / jh-drag-row）`);
  }
}

// 6. 规则覆盖矩阵：标记「阻断」的 R*/S* 规则必须在执行器代码中真实存在
//    防止 rule-coverage.md 与 ast-rules.js / page-spec.js 漂移
(function checkRuleCoverage() {
  const coveragePath = path.join(ROOT, "kit-internal", "rule-coverage.md");
  if (!fs.existsSync(coveragePath)) {
    warnings.push("kit-internal/rule-coverage.md 不存在，跳过覆盖矩阵校验");
    return;
  }
  const coverage = fs.readFileSync(coveragePath, "utf8");
  const astSrc = fs.existsSync(path.join(ROOT, "lib", "ast-rules.js"))
    ? fs.readFileSync(path.join(ROOT, "lib", "ast-rules.js"), "utf8")
    : "";
  const specSrc = fs.existsSync(path.join(ROOT, "lib", "page-spec.js"))
    ? fs.readFileSync(path.join(ROOT, "lib", "page-spec.js"), "utf8")
    : "";

  // 解析矩阵中「阻断=是」的行，提取执行器列里的 R*/S* 编号
  const ruleRe = /\b([RS]\d{1,2})\b/g;
  for (const line of coverage.split("\n")) {
    // 仅看表格数据行且阻断列为「是」
    if (!/^\|/.test(line) || !/\|\s*是\s*\|?\s*$/.test(line)) continue;
    const matched = new Set();
    let m;
    while ((m = ruleRe.exec(line)) !== null) matched.add(m[1]);
    for (const rule of matched) {
      const marker = 'rule: "' + rule + '"';
      const inAst = astSrc.includes(marker);
      const inSpec = specSrc.includes(marker);
      if (!inAst && !inSpec) {
        errors.push(
          `rule-coverage.md 标记「阻断」的 ${rule} 在 ast-rules.js / page-spec.js 中未找到 (${marker})`,
        );
      }
    }
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
  `\n✅ Skill Lint 通过：公共文件 ${REQUIRED_PUBLIC_FILES.length} 个、sync Skill ${SYNC_SKILLS.length} 个、write Skill ${WRITE_SKILLS.length} 个全部合规`,
);

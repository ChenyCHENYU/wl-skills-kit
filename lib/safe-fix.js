"use strict";

/**
 * lib/safe-fix.js — 确定性机械修复引擎（v2.11.1+）
 *
 * 解决的问题：
 *   过去"修复"完全靠 AI 改源码，机械性偏差（缺 render-type、::v-deep、未用 import 等）
 *   也走 AI，慢且不确定。本模块对一批"幂等、零语义判断"的偏差做确定性自动修复，
 *   AI 只处理需要语义判断的部分。
 *
 * 覆盖的安全修复（F1/F2/F4~F6，全部幂等；F3 已随旧组件退役）：
 *   F1: <BaseTable> 缺 render-type="agGrid"  → 补 render-type="agGrid"
 *   F2: ::v-deep / /deep/                      → :deep()
 *   F4: 行尾多余空白                            → 清除
 *   F5: 文件末尾缺换行                          → 补 \n
 *   F6: <c_formModal> 缺 show-required-toggle 且表单字段≥10混合必填 → 补 show-required-toggle
 *
 * 设计原则：
 *   - 只做"改了一定对"的修复，任何有歧义的改动一律跳过并交回 AI
 *   - dryRun 模式只报告将改什么，不写盘
 *   - 返回每个文件的改动条目，供 CLI 汇总输出
 */

const fs = require("fs");
const path = require("path");
const { analyzeModalForms } = require("./form-field-analysis");

const SKIP_DIRS = ["node_modules", "dist", ".git", "demo"];

function walk(dir, base, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.includes(entry.name)) continue;
      walk(path.join(dir, entry.name), base, out);
    } else if (/\.(vue|ts|scss)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/**
 * 对单个文件内容做安全修复
 * @returns {{ content: string, changes: string[] }}
 */
function fixBaseTable(content, ext, changes) {
  if (ext !== ".vue") return content;
  return content.replace(/<BaseTable\b([^>]*?)>/g, (full, attrs) => {
    if (/render-type\s*=/.test(attrs)) return full;
    changes.push('F1: BaseTable 补 render-type="agGrid"');
    return '<BaseTable render-type="agGrid"' + attrs + ">";
  });
}

function fixDeepSelector(content, ext, changes) {
  if (ext !== ".vue" && ext !== ".scss") return content;
  const fixed = content
    .replace(/::v-deep\s+([^\s{,]+)/g, ":deep($1)")
    .replace(/\/deep\/\s+([^\s{,]+)/g, ":deep($1)");
  if (fixed !== content) changes.push("F2: ::v-deep//deep/ → :deep()");
  return fixed;
}

function boundConfigName(attrs) {
  return attrs.match(/\bv-bind\s*=\s*["']([A-Za-z_$][\w$]*)["']/)?.[1] || "";
}

function shouldFixFormTag(attrs, options) {
  if (/show-required-toggle/.test(attrs)) return false;
  if (options.enableFormToggle === true) return true;
  const eligible = new Set(options.formToggleBindings || []);
  return eligible.has(boundConfigName(attrs));
}

function fixFormToggle(content, ext, options, changes) {
  if (ext !== ".vue") return content;
  return content.replace(/<c_formModal\b([^>]*?)>/g, (full, attrs) => {
    if (!shouldFixFormTag(attrs, options)) return full;
    changes.push("F6: c_formModal 补 show-required-toggle");
    return '<c_formModal show-required-toggle' + attrs + ">";
  });
}

function trimTrailingWhitespace(content, changes) {
  const fixed = content.replace(/[ \t]+$/gm, "");
  if (fixed !== content) changes.push("F4: 清除行尾空白");
  return fixed;
}

function ensureFinalNewline(content, changes) {
  if (!content || content.endsWith("\n")) return content;
  changes.push("F5: 补文件末尾换行");
  return content + "\n";
}

function fixContent(content, ext, options = {}) {
  const changes = [];
  let fixed = fixBaseTable(content, ext, changes);
  fixed = fixDeepSelector(fixed, ext, changes);
  fixed = fixFormToggle(fixed, ext, options, changes);
  fixed = trimTrailingWhitespace(fixed, changes);
  fixed = ensureFinalNewline(fixed, changes);
  return { content: fixed, changes };
}

function fileFixOptions(abs, content, ext, options) {
  if (ext !== ".vue" || options.enableFormToggle === false) return {};
  const dataFile = path.join(path.dirname(abs), "data.ts");
  if (!fs.existsSync(dataFile)) return {};
  const dataContent = fs.readFileSync(dataFile, "utf8");
  const formToggleBindings = analyzeModalForms(content, dataContent)
    .filter((item) => item.eligible)
    .map((item) => item.binding);
  return { formToggleBindings };
}

function fixFile(abs, targetDir, options) {
  const ext = path.extname(abs);
  const content = fs.readFileSync(abs, "utf8");
  const result = fixContent(content, ext, fileFixOptions(abs, content, ext, options));
  if (result.changes.length === 0) return null;
  if (!options.dryRun) fs.writeFileSync(abs, result.content, "utf8");
  return {
    rel: path.relative(targetDir, abs).replace(/\\/g, "/"),
    changes: result.changes,
  };
}

/**
 * 扫描目录并执行安全修复
 * @param {string} targetDir
 * @param {string} scanRel
 * @param {object} options { dryRun }
 * @returns {{ files: Array<{rel,changes}>, fixedCount, fileCount }}
 */
function runSafeFix(targetDir, scanRel, options = {}) {
  const scanDir = path.join(targetDir, scanRel || "src/views");
  const files = walk(scanDir, targetDir);
  const result = [];
  let fixedCount = 0;

  for (const abs of files) {
    const fixed = fixFile(abs, targetDir, options);
    if (!fixed) continue;
    fixedCount += fixed.changes.length;
    result.push(fixed);
  }

  return { files: result, fixedCount, fileCount: files.length };
}

module.exports = { runSafeFix, fixContent };

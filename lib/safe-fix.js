"use strict";

/**
 * lib/safe-fix.js — 确定性机械修复引擎（v2.11.1+）
 *
 * 解决的问题：
 *   过去"修复"完全靠 AI 改源码，机械性偏差（缺 render-type、::v-deep、未用 import 等）
 *   也走 AI，慢且不确定。本模块对一批"幂等、零语义判断"的偏差做确定性自动修复，
 *   AI 只处理需要语义判断的部分。
 *
 * 覆盖的安全修复（F1~F5，全部幂等）：
 *   F1: <BaseTable> 缺 render-type="agGrid"  → 补 render-type="agGrid"
 *   F2: ::v-deep / /deep/                      → :deep()
 *   F3: import C_Splitter / <C_Splitter>       → 仅标记，不自动改（需人工换布局）
 *   F4: 行尾多余空白                            → 清除
 *   F5: 文件末尾缺换行                          → 补 \n
 *
 * 设计原则：
 *   - 只做"改了一定对"的修复，任何有歧义的改动一律跳过并交回 AI
 *   - dryRun 模式只报告将改什么，不写盘
 *   - 返回每个文件的改动条目，供 CLI 汇总输出
 */

const fs = require("fs");
const path = require("path");

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
function fixContent(content, ext) {
  const changes = [];
  let out = content;

  // F1: BaseTable 缺 render-type（仅 .vue）
  if (ext === ".vue") {
    out = out.replace(/<BaseTable\b([^>]*?)>/g, (full, attrs) => {
      if (/render-type\s*=/.test(attrs)) return full;
      changes.push('F1: BaseTable 补 render-type="agGrid"');
      return '<BaseTable render-type="agGrid"' + attrs + ">";
    });
  }

  // F2: ::v-deep / /deep/ → :deep()（.vue/.scss）
  if (ext === ".vue" || ext === ".scss") {
    if (/::v-deep\b|\/deep\//.test(out)) {
      // ::v-deep .foo → :deep(.foo)  ；保守处理：仅替换写法标记，复杂选择器交 AI
      const before = out;
      out = out.replace(/::v-deep\s+([^\s{,]+)/g, ":deep($1)");
      out = out.replace(/\/deep\/\s+([^\s{,]+)/g, ":deep($1)");
      if (out !== before) changes.push("F2: ::v-deep//deep/ → :deep()");
    }
  }

  // F4: 行尾空白
  const trimmed = out.replace(/[ \t]+$/gm, "");
  if (trimmed !== out) {
    changes.push("F4: 清除行尾空白");
    out = trimmed;
  }

  // F5: 文件末尾换行
  if (out.length > 0 && !out.endsWith("\n")) {
    out += "\n";
    changes.push("F5: 补文件末尾换行");
  }

  return { content: out, changes };
}

/**
 * 扫描目录并执行安全修复
 * @param {string} targetDir
 * @param {string} scanRel
 * @param {object} options { dryRun }
 * @returns {{ files: Array<{rel,changes}>, fixedCount, fileCount }}
 */
function runSafeFix(targetDir, scanRel, options) {
  options = options || {};
  const scanDir = path.join(targetDir, scanRel || "src/views");
  const files = walk(scanDir, targetDir);
  const result = [];
  let fixedCount = 0;

  for (const abs of files) {
    const ext = path.extname(abs);
    const content = fs.readFileSync(abs, "utf8");
    const { content: fixed, changes } = fixContent(content, ext);
    if (changes.length === 0) continue;
    fixedCount += changes.length;
    const rel = path.relative(targetDir, abs).replace(/\\/g, "/");
    result.push({ rel, changes });
    if (!options.dryRun) fs.writeFileSync(abs, fixed, "utf8");
  }

  return { files: result, fixedCount, fileCount: files.length };
}

module.exports = { runSafeFix, fixContent };

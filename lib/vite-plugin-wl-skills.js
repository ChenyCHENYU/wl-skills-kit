"use strict";

/**
 * lib/vite-plugin-wl-skills.js — wl-skills-kit Vite 构建时约束插件
 *
 * 显式接入后的启动期 AST 检查（完整规范仍使用 wl-skills validate）：
 *   dev 模式 → 启动时扫描 src/views，相关保存时去抖检查所属页面
 *   build 模式 → 构建前全量扫描，有 error 级别违规时中断构建
 *
 * 使用方式（业务项目 vite.config.ts）：
 *   import wlSkillsPlugin from "@agile-team/wl-skills-kit/lib/vite-plugin-wl-skills.js";
 *   export default defineConfig({
 *     plugins: [vue(), wlSkillsPlugin()],
 *   });
 *
 * 或在 init/update 时自动注入到 vite.config.ts 的 plugins 数组（可选）。
 *
 * 约束层级定位：
 *   ① AI 指令层（文字） → 可被忽略
 *   ② validate 检测层 → 手动调用
 *   ③ pre-commit 层 → --no-verify 可绕过
 *   ④ CI 层 → 业务项目需手动配置
 *   ⑤ Vite 插件层（本插件） → 接入后启动/构建及适用热更新检查 AST；完整规范另行验证
 */

let astRules = null;
const fs = require("node:fs");
const path = require("node:path");
const { core, taskOptions } = require("./task-integration");
try {
  astRules = require("./ast-rules.js");
} catch {
  astRules = null;
}

function wlSkillsPlugin(options) {
  options = options || {};
  const scanRel = options.scanRel || "src/views";
  const failOnWarn = options.failOnWarn || false; // build 模式下 warn 也中断（等同 --strict）
  let resolved;
  let pending;
  const changed = new Set();

  return {
    name: "wl-skills-guard",
    // Vite 只接受 serve/build 或函数；省略 apply 才会在两种命令中生效。
    configResolved(config) {
      resolved = config;
      runGuard(config, scanRel, failOnWarn, options);
    },
    handleHotUpdate(context) {
      if (options.watch === false || !resolved) return;
      const scope = changedPageScope(resolved.root, scanRel, context.file);
      if (!scope) return;
      changed.add(scope);
      clearTimeout(pending);
      pending = setTimeout(() => {
        for (const page of changed) runGuard(resolved, page, false, options);
        changed.clear();
      }, options.debounceMs ?? 150);
    },
    closeBundle() { clearTimeout(pending); changed.clear(); },
  };
}

function runGuard(config, scanRel, failOnWarn, options) {
  const opts = taskOptions(config.root || process.cwd(), { tool: "vite-ast-guard", targets: [scanRel], runId: options.runId, readOnlyVerification: true, persist: options.persist });
  const handle = core.beginExecution(opts);
  try { executeGuard(config, scanRel, failOnWarn, options, handle); }
  catch (error) {
    if (!handle.finished) core.finishExecution(handle, { exitCode: 1, validationStatus: "unverified", checks: [], errorCode: error.code || error.name });
    throw error;
  }
}

function executeGuard(config, scanRel, failOnWarn, options, handle) {
  if (!astRules || !astRules.hasAstAvailable()) return skipGuard(config, handle, "AST 解析器不可用");
  const result = astRules.runAstRules(config.root || process.cwd(), scanRel, { cache: options.cache });
  if (!result.astAvailable) return skipGuard(config, handle, "AST 解析器功能检查未通过");
  if (result.pages === 0) return skipGuard(config, handle, `范围 ${scanRel} 未发现适用页面`);
  const isBuild = config.command === "build";
  finishGuard(config, handle, result, isBuild, failOnWarn);
  if (result.issues.length === 0) {
    logCleanBuild(config, scanRel, result);
    return;
  }
  logIssues(result);
  enforceBuild(result, isBuild, failOnWarn);
  console.log("");
}

function changedPageScope(root, scanRel, file) {
  const base = path.resolve(root, scanRel);
  const relative = path.relative(base, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (![".vue", ".ts", ".scss"].includes(path.extname(file))) return null;
  let directory = path.dirname(file);
  while (directory !== path.dirname(base)) {
    if (fs.existsSync(path.join(directory, "index.vue"))) return path.relative(root, directory).replace(/\\/g, "/");
    directory = path.dirname(directory);
  }
  return null;
}

function skipGuard(config, handle, reason) {
  const receipt = core.finishExecution(handle, { exitCode: 0, validationStatus: "unverified", checks: [{ id: "ast", status: "skipped", reason }] });
  handle.finished = true;
  logSkipped(config, `${reason}；runId=${receipt.runId} 验证=${receipt.validationStatus}`);
}

function finishGuard(config, handle, result, isBuild, failOnWarn) {
  const errors = result.issues.filter((issue) => issue.level === "error").length;
  const warns = result.issues.filter((issue) => issue.level === "warn").length;
  const blocked = isBuild && (errors > 0 || failOnWarn && warns > 0);
  const receipt = core.finishExecution(handle, { exitCode: blocked ? 1 : 0, validationStatus: errors > 0 ? "failed" : "passed", checkedFiles: result.checkedFiles || [], checks: [
    { id: "ast", status: errors > 0 ? "failed" : "passed", reason: `AST scanned ${result.pages} pages; cache hits ${result.cacheHits || 0}` },
    { id: "validate", status: "skipped", reason: "Vite guard covers AST only; full validate has not run" },
    { id: "typecheck", status: "skipped", reason: "No compiler invocation in Vite guard" },
  ], summary: { pages: result.pages, errors, cacheHits: result.cacheHits || 0 } });
  handle.finished = true;
  logReceipt(config, receipt);
}

function logReceipt(config, receipt) {
  const message = `[wl-skills-kit] runId=${receipt.runId} 执行=${receipt.executionStatus} 验证=${receipt.validationStatus}；回执=${receipt.recordPath || "未持久化"}`;
  if (config.logger) config.logger.info(message);
  else console.log(message);
}

function logSkipped(config, reason) {
  const message = `[wl-skills-kit] AST 检查未执行：${reason}。尚未验证完整规范与类型检查。`;
  if (config.logger) config.logger.warn(message);
  else console.warn(message);
}

function logCleanBuild(config, scanRel, result) {
  const message = `[wl-skills-kit] AST 检查通过：${scanRel}，${result.pages} 页；缓存命中 ${result.cacheHits || 0}。完整规范与类型检查尚未验证。`;
  if (config.logger) config.logger.info(message);
  else console.log(message);
}

function logIssues(result) {
  console.log(`\n  wl-skills-guard: 发现 ${result.issues.length} 个规范偏差（${result.pages} 页面）`);
  for (const issue of result.issues.slice(0, 30)) {
    const icon = issue.level === "error" ? "✖" : "⚠";
    console.log(`  ${icon} [${issue.rule}] ${issue.dir} — ${issue.text}`);
  }
  if (result.issues.length > 30) console.log(`  ... 还有 ${result.issues.length - 30} 条`);
}

function enforceBuild(result, isBuild, failOnWarn) {
  if (!isBuild) return;
  const errors = result.issues.filter((issue) => issue.level === "error");
  if (errors.length > 0) throwBuildError(errors.length);
  if (failOnWarn) enforceWarnings(result.issues);
}

function throwBuildError(count) {
  console.log(`\n  ✖ wl-skills-guard: 构建中断 — ${count} 个 error 级规范违规`);
  console.log("  → 修复后重新构建，或使用 wl-skills:ignore 标记豁免");
  throw new Error(`wl-skills-guard: ${count} 个 error 级规范违规，构建已中断`);
}

function enforceWarnings(issues) {
  const count = issues.filter((issue) => issue.level === "warn").length;
  if (count === 0) return;
  console.log(`\n  ✖ wl-skills-guard: 构建中断 — ${count} 个 warn 级规范违规（failOnWarn）`);
  throw new Error(`wl-skills-guard: ${count} 个 warn 级违规（failOnWarn 模式）`);
}

module.exports = wlSkillsPlugin;
module.exports.default = wlSkillsPlugin;

"use strict";

/**
 * lib/ast-rules.js — wl-skills-kit AST 级规范检测引擎
 *
 * 补充 validate（正则）无法覆盖的语义级规则。
 * 依赖：@vue/compiler-sfc（解析 .vue）、@babel/parser（解析 <script> AST）
 * 这两个包在 Vue 3 + Vite 项目中天然存在，用 try-require 做优雅降级。
 *
 * 规则编号 K1~K21 对应 standards 02/04/05/06/07/09/10/11/12/13/14 中的语义约束：
 *   K1: index.vue <script setup> 业务逻辑行数超阈值 → warn（02）
 *   K2: index.vue 含禁止 import（getAction/postAction/sessionStorage 等）→ error（02/06）
 *   K3: 页面用 <el-table> 但未用 <BaseTable> → error（12/13）
 *   K4: cid 全局重复 → error（12）
 *   K5: 纯列表型页面 data.ts 未用 AbstractPageQueryHook → warn（02）
 *   K6: index.vue 或 data.ts 直接 import axios → error（06）
 *   K7: index.vue 或 data.ts 用 eval / new Function → error（06）
 *   K8: 强制 3 文件分离 — 有 API 调用但无 data.ts，或逻辑泄漏 → error/warn（02）
 *   K9: api.md 质量 — URL 与 data.ts API_CONFIG 不一致 → warn（02）
 *   K10: 平台组件替换检测 — el-form/el-select/el-date-picker 等应替换为平台封装 → error（13）
 *   K11: data.ts 禁止 import Pinia Store → error（10）
 *   K12: 硬编码 IP/URL 检测 → error/warn（07）
 *   K13: 单函数圈复杂度 > 10（Mcabe，与 ESLint complexity 定义一致）→ error（04）
 *   K14: 文件类型错误零容忍 — vue-tsc/tsc --noEmit 产物解析 → error（09）
 *        注：K14 为项目级检查，体积较大，validate 默认不跑，
 *        需显式 --typecheck（CLI）/ typecheck:true（MCP）触发，优雅降级为 warn
 *   K15: 分页状态/请求必须与生效 Delivery Profile 一致；无配置时回退 1/10/200 → error（11）
 *   K16: 页面直接 structuredClone / 向用户透出 error.message → warn（05/11）
 *   K17: 弹窗/页面表单字段 ≥10 且混合必填时建议开启快速切换（11）
 *   K18: form-validate 依赖、框架 API 和手写规则混用检查（11）
 *   K19: 弹窗内 AG Grid 必须通过 v-if 延迟挂载（12）
 *   K20: 多固定高度表格长工作台的根容器必须拥有唯一纵向滚动（14）
 *   K21: Tabs + jh-drag + AG Grid 页面必须具备完整高度链（14）
 *
 * 导出函数：
 *   runAstRules(targetDir, scanRel, { stagedFiles }) → { issues, pages }
 *   parseVueScript(absPath) → { content, template, source } | null
 *   countEffectiveLines(scriptContent) → number
 *   computeFunctionComplexity(fnNode) → number
 *   runTypeCheck(root) → { issues, ran, errorCount }
 *   loadExemptions(targetDir) → { isExempt, source, warnings }
 *   hasAstAvailable() → boolean
 */

const fs = require("fs");
const path = require("path");
const { loadValidationConfig } = require("./validate-config");
const { execFileSync, spawnSync } = require("child_process");
const { loadDeliveryProfile, validateApiContract } = require("./api-contract");
const { analyzeFormRequiredOnly } = require("./form-field-analysis");
const { formValidationFindings } = require("./form-validation-guidance");
const {
  contextFingerprint,
  pageCacheKey,
  readValidationCache,
  writeValidationCache,
} = require("./validation-cache");

// ─── AST 依赖探测（优雅降级）──────────────────────────────────────────
//
// 安全策略：require @vue/compiler-sfc 在某些环境可能很慢或卡死
// 用 try/catch 包裹，失败时静默降级为正则模式，不阻断 validate 流程

let _compilerSfc = null;
let _babelParser = null;
let _astChecked = false;

function ensureAst() {
  if (_astChecked) return _compilerSfc && _babelParser;
  _astChecked = true;
  _compilerSfc = tryRequire(require, "@vue/compiler-sfc");
  _babelParser = tryRequire(require, "@babel/parser");
  if (!_compilerSfc || !_babelParser) loadAstFromProject();
  return _compilerSfc && _babelParser;
}

function tryRequire(loader, name) {
  try {
    return loader(name);
  } catch {
    return null;
  }
}

function loadAstFromProject() {
  try {
    const { createRequire } = require("module");
    const cwd = process.env.WL_PROJECT_ROOT || process.cwd();
    const projectRequire = createRequire(path.join(cwd, "package.json"));
    if (!_compilerSfc) _compilerSfc = tryRequire(projectRequire, "@vue/compiler-sfc");
    if (!_babelParser) _babelParser = tryRequire(projectRequire, "@babel/parser");
  } catch {
    // 业务项目不是可解析 Node 项目时保持优雅降级
  }
}

/**
 * 验证 @vue/compiler-sfc 的 API 是否兼容（parse 函数存在且返回 descriptor）
 * 防止 v2.x 等不兼容版本加载成功但实际无法工作
 */
function isAstFunctionallyUsable() {
  if (!ensureAst()) return false;
  try {
    const testResult = _compilerSfc.parse("<template><div/></template>", {
      filename: "test.vue",
    });
    return Boolean(testResult && testResult.descriptor);
  } catch {
    return false;
  }
}

function hasAstAvailable() {
  return Boolean(ensureAst());
}

/**
 * 去除注释和字符串字面量，只保留代码逻辑文本
 * 用于正则匹配时避免注释/字符串中的关键字产生误报
 */
function stripCommentsAndStrings(code) {
  if (!code) return "";
  // 去除块注释
  let result = code.replace(/\/\*[\s\S]*?\*\//g, "");
  // 去除行注释
  result = result.replace(/\/\/[^\n]*/g, "");
  // 去除模板字符串（反引号包围的内容可能含关键字）
  result = result.replace(/`[^`]*`/g, '""');
  // 去除单/双引号字符串内容（保留引号本身以维持结构）
  result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  return result;
}

// ─── 配置 ──────────────────────────────────────────────────────────────

/**
 * 豁免标记检测
 * 
 * 在文件中通过特殊注释标记豁免某条规则：
 *   <!-- wl-skills:ignore K3 -->        ← 在 index.vue 模板中
 *   // wl-skills:ignore K3              ← 在 script 中
 *   /* wl-skills:ignore K3 * /          ← 在 scss/script 中
 * 
 * 用于特殊场景（如弹窗内确实需要 el-table、确实需要在 index.vue 中用 sessionStorage）。
 * 标记必须带规则编号（K1~K21），精确豁免，不是全局豁免。
 */
// ─── 规则编号命名空间 ─────────────────────────────────────────────────
// 2.18.0 起 kit 规则编号使用 K 前缀（K=Kit），与 wl-skills-ui scanner 的 R0xx
// 编号空间（R001-R040）解耦，避免两套 "R" 编号在混合报告/沟通中歧义。
// 兼容期：wl-skills:ignore 标记与 .wl-skills-validate.json 豁免同时接受
// 旧 R 前缀与 K 前缀（同号等价，即旧 R3 与新 K3 互相命中），存量项目配置零改动平滑迁移。
function ruleKeyAliases(rule) {
  const key = String(rule).toUpperCase();
  const aliases = [key];
  const legacy = key.replace(/^K(\d+)$/, "R$1");
  if (legacy !== key) aliases.push(legacy);
  const modern = key.replace(/^R(\d+)$/, "K$1");
  if (modern !== key) aliases.push(modern);
  return aliases;
}

function hasIgnoreMarker(content, rule) {
  if (!content || !rule) return false;
  const patterns = [];
  for (const key of ruleKeyAliases(rule)) {
    patterns.push(
      new RegExp("wl-skills:ignore\\s+" + key + "\\b", "i"),
      new RegExp("wl-skills:\\s*ignore\\s+" + key + "\\b", "i"),
    );
  }
  return patterns.some((p) => p.test(content));
}

const CONFIG = {
  // K1: 纯列表页 index.vue 阈值（index.vue 应几乎只有模板+解构）
  SCRIPT_LINE_THRESHOLD_LIST: 40,
  // K1: 非列表页（表单/详情/设计器）允许更多逻辑
  SCRIPT_LINE_THRESHOLD_OTHER: 120,
  FORBIDDEN_IMPORTS: [
    "getAction",
    "postAction",
    "putAction",
    "deleteAction",
    "actionBatch",
  ],
  FORBIDDEN_GLOBALS: ["sessionStorage", "localStorage"],
  WARN_IMPORTS: ["useRoute"],
  // K13: 单函数圈复杂度上限（Mcabe），与 ESLint complexity 规则阈值一致
  MAX_CYCLOMATIC_COMPLEXITY: 10,
  // K14: 单页类型错误采集上限（避免输出爆炸）
  TYPECHECK_ERROR_CAP: 50,
  // 项目级豁免配置文件名（业务项目根，kit 不主动创建，零功能影响）
  EXEMPT_CONFIG_NAME: ".wl-skills-validate.json",
  SKIP_DIRS: ["node_modules", "dist", ".git", "demo", "template"],
};

// ─── 项目级豁免配置（零功能影响，可选）──────────────────────────────────
//
// 业务项目根可放 .wl-skills-validate.json，对指定路径前缀批量豁免规则：
//   {
//     "exemptions": [
//       {
//         "paths": ["src/views/produce/designer"],
//         "rules": ["K3", "K10"],
//         "reason": "表单设计器内嵌表格，BaseTable AGGrid 内联编辑受限"
//       }
//     ]
//   }
//
// 与单文件注释豁免（wl-skills:ignore K3）互补：注释精确到单文件，
// 配置批量到目录。无配置文件时返回空豁免，行为完全不变。

/**
 * 加载项目级豁免配置
 * @param {string} targetDir 项目根目录
 * @returns {{ isExempt: (pageDir:string, rule:string)=>boolean, source: string|null, warnings: string[] }}
 */
function loadExemptions(targetDir) {
  const validationConfig = loadValidationConfig(targetDir || process.cwd());
  const compiled = compileExemptions(validationConfig.value.exemptions);
  const isExempt = (pageDir, rule) => matchesExemption(compiled, pageDir, rule);
  return {
    isExempt,
    source: validationConfig.source,
    warnings: validationConfig.warnings,
  };
}

function normalizeExemptionPrefix(value) {
  let prefix = String(value).replace(/\\/g, "/").replace(/\/+$/, "");
  if (prefix.endsWith("/**")) prefix = prefix.slice(0, -3);
  if (prefix.endsWith("/*")) prefix = prefix.slice(0, -2);
  return prefix;
}

function compileExemptions(entries) {
  const compiled = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !Array.isArray(entry.paths) || !Array.isArray(entry.rules)) continue;
    // K/R 前缀等价：旧配置写 K3、新配置写 K3，编译后同集命中
    const rules = new Set();
    for (const rule of entry.rules) {
      for (const alias of ruleKeyAliases(String(rule))) rules.add(alias);
    }
    for (const item of entry.paths) compiled.push({ prefix: normalizeExemptionPrefix(item), rules });
  }
  return compiled;
}

function matchesExemption(compiled, pageDir, rule) {
  if (!pageDir || !rule) return false;
  const dir = String(pageDir).replace(/\\/g, "/");
  const keys = ruleKeyAliases(rule);
  return compiled.some((item) =>
    keys.some((key) => item.rules.has(key)) &&
    (dir === item.prefix || dir.startsWith(`${item.prefix}/`)));
}

// ─── 工具函数 ──────────────────────────────────────────────────────────

function walkDir(dir, base, results) {
  results = results || [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (CONFIG.SKIP_DIRS.includes(entry)) continue;
      walkDir(full, base, results);
    } else {
      results.push({
        abs: full,
        rel: path.relative(base, full).replace(/\\/g, "/"),
      });
    }
  }
  return results;
}

/**
 * 解析 .vue 文件，提取 <script setup> 内容和模板
 */
function parseVueScript(absPath) {
  if (!ensureAst() || !fs.existsSync(absPath)) return null;
  const source = fs.readFileSync(absPath, "utf-8");
  const descriptor = parseVueDescriptor(source, absPath);
  if (!descriptor) return null;
  const scriptContent = descriptor.scriptSetup?.content || descriptor.script?.content || "";
  const template = descriptor.template?.content || "";
  const styles = descriptor.styles.map((style) => style.content || "");
  return { content: scriptContent, template, source, styles };
}

function parseVueDescriptor(source, absPath) {
  try {
    return _compilerSfc.parse(source, { filename: absPath }).descriptor;
  } catch {
    return null;
  }
}

/**
 * 统计有效代码行数（排除 import、空行、注释）
 */
function countEffectiveLines(scriptContent) {
  if (!scriptContent) return 0;
  const lines = scriptContent.split("\n");
  let count = 0;
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlock = true;
      continue;
    }
    if (line.startsWith("//")) continue;
    if (line.startsWith("import ")) continue;
    count++;
  }
  return count;
}

/**
 * 用 babel/parser 解析 script 为 AST（复用给 extractScriptInfo / 圈复杂度计算）
 */
function parseScriptAst(scriptContent) {
  if (!ensureAst() || !scriptContent) return null;
  try {
    return _babelParser.parse(scriptContent, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return null;
  }
}

/**
 * 用 babel/parser 解析 script，提取 import 标识符和来源
 */
function extractScriptInfo(scriptContent) {
  if (!ensureAst() || !scriptContent) {
    return { specifiers: [], sources: [] };
  }
  const ast = parseScriptAst(scriptContent);
  if (!ast) return { specifiers: [], sources: [] };
  const specifiers = [];
  const sources = [];
  for (const node of ast.program.body) {
    if (node.type !== "ImportDeclaration") continue;
    sources.push(node.source.value);
    for (const spec of node.specifiers) appendImportSpecifier(specifiers, spec);
  }
  return { specifiers, sources };
}

/**
 * 提取脚本 AST 中的字符串字面量。
 *
 * K12 需要检查字符串里的真实 URL/IP，但不能直接对原文做正则，否则注释
 * 中的示例地址会产生误报；也不能复用 stripCommentsAndStrings，因为它会把
 * 待检查的字符串一并清掉。通过 AST 只读取字面量，兼顾漏检和误报边界。
 */
const STRING_LITERAL_NODE_TYPES = new Set(["StringLiteral", "DirectiveLiteral", "Literal"]);

function appendStringLiteralValue(node, values) {
  if (STRING_LITERAL_NODE_TYPES.has(node.type) && typeof node.value === "string") {
    values.push(node.value);
  }
  if (node.type !== "TemplateElement") return;
  const value = node.value?.cooked ?? node.value?.raw;
  if (typeof value === "string") values.push(value);
}

function visitStringLiteralNode(node, values) {
  if (!node || typeof node.type !== "string") return;
  appendStringLiteralValue(node, values);
  for (const child of getChildNodes(node)) visitStringLiteralNode(child, values);
}

function extractStringLiterals(source) {
  const ast = parseScriptAst(source);
  if (!ast) return [];
  const values = [];
  visitStringLiteralNode(ast, values);
  return values;
}

function appendImportSpecifier(specifiers, spec) {
  if (spec.type === "ImportSpecifier") specifiers.push(spec.imported.name || spec.local.name);
  if (["ImportDefaultSpecifier", "ImportNamespaceSpecifier"].includes(spec.type)) {
    specifiers.push(spec.local.name);
  }
}

// ─── K13 圈复杂度（Mcabe）──────────────────────────────────────────────
//
// 定义与 ESLint `complexity` 规则一致：复杂度 = 1 + 决策点数。
// 不依赖 @babel/traverse，自写轻量遍历，避免新增运行时依赖。

const COMPLEXITY_NODE_TYPES = new Set([
  "IfStatement", // if / else if（每个 IfStatement 计 1）
  "SwitchCase", // 每个 case / default
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "CatchClause",
  "ConditionalExpression", // 三元 ?:
  "LogicalExpression", // && / || / ??
]);

const FUNCTION_NODE_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

function isFunctionNode(node) {
  return Boolean(node) && FUNCTION_NODE_TYPES.has(node.type);
}

// 取节点所有子 AST 节点（跳过位置/范围元信息）
function getChildNodes(node) {
  const out = [];
  for (const key of Object.keys(node)) {
    if (["loc", "range", "start", "end"].includes(key)) continue;
    appendAstChildren(out, node[key]);
  }
  return out;
}

function appendAstChildren(out, child) {
  const values = Array.isArray(child) ? child : [child];
  for (const value of values) {
    if (value && typeof value.type === "string") out.push(value);
  }
}

// 尽力推断函数名（变量赋值 / 类方法 / 对象方法 / 命名函数表达式）
function resolveFnName(node, parent) {
  if (node.id && node.id.name) return node.id.name;
  if (!parent) return "(anonymous)";
  const variableName = parent.type === "VariableDeclarator" ? parent.id?.name : "";
  if (variableName) return variableName;
  const propertyName = resolvePropertyName(parent);
  return propertyName || "(anonymous)";
}

function resolvePropertyName(parent) {
  if (["MethodDefinition", "Property"].includes(parent.type)) return keyName(parent.key);
  if (parent.type !== "AssignmentExpression") return "";
  return keyName(parent.left?.property) || parent.left?.name || "";
}

function keyName(key) {
  if (!key) return "";
  if (key.name) return key.name;
  return key.value == null ? "" : key.value;
}

// 收集整棵 AST 中的所有函数节点 + 名字（含嵌套函数，各独立计 K13）
function collectFunctions(ast) {
  const fns = [];
  const stack = [];
  function walk(node) {
    if (!node || typeof node.type !== "string") return;
    let pushed = false;
    if (isFunctionNode(node)) {
      const parent = stack.length ? stack[stack.length - 1] : null;
      fns.push({ node, name: resolveFnName(node, parent) });
      // 不再下钻到该函数体内部去发现"孙函数"——
      // 嵌套函数会在遍历其父函数体时自然被收集
    }
    stack.push(node);
    pushed = true;
    for (const child of getChildNodes(node)) walk(child);
    if (pushed) stack.pop();
  }
  walk(ast);
  return fns;
}

/**
 * 计算单个函数的圈复杂度（不下钻进嵌套函数体，嵌套函数独立计）
 * @param {object} fnNode FunctionDeclaration / FunctionExpression / ArrowFunctionExpression
 * @returns {number}
 */
function computeFunctionComplexity(fnNode) {
  if (!fnNode) return 0;
  let complexity = 1;
  function walk(node) {
    if (!node || typeof node.type !== "string") return;
    if (node !== fnNode && isFunctionNode(node)) return; // 嵌套函数边界
    if (COMPLEXITY_NODE_TYPES.has(node.type)) complexity++;
    for (const child of getChildNodes(node)) walk(child);
  }
  walk(fnNode);
  return complexity;
}

/**
 * 检测模板中是否有 el-table（非 BaseTable）
 */
function hasRawElTable(template) {
  return /<el-table[\s>]/.test(template || "");
}
function hasBaseTable(template) {
  return /<BaseTable[\s>]/.test(template || "");
}

/**
 * 从文件中提取 cid 实际值（字符串字面量，排除 Vue 动态绑定）
 */
function extractCidsFromContent(content) {
  const cids = [];
  for (const m of content.matchAll(/TABLE_CID\s*=\s*["']([^"']+)["']/g)) {
    cids.push(m[1]);
  }
  for (const m of content.matchAll(/(?<![:\w])cid\s*=\s*["']([^"']+)["']/g)) {
    cids.push(m[1]);
  }
  return cids;
}

/**
 * 判断页面是否为列表型（有 BaseTable 或 el-table + 分页）
 */
function isListTypePage(template) {
  if (/<BaseTable|<el-table/.test(template || "")) return true;
  if (/jh-pagination/.test(template || "")) return true;
  return false;
}

/**
 * 更精确地判断是否为"纯列表型"页面（LIST/MASTER_DETAIL/TREE_LIST）
 * 这些页面必须使用 AbstractPageQueryHook，且 index.vue 应几乎只有模板
 *
 * 判据（同时满足才算纯列表）：
 * - 主区域有 BaseTable（非弹窗内的小表格）
 * - 有 jh-pagination 分页
 * - 没有 el-form/el-tabs（表单/Tab 页面不是纯列表）
 *
 * DETAIL_TABS/FORM_ROUTE/CHANGE_HISTORY 页面虽然可能含 BaseTable 子表，
 * 但不满足以上全部条件，因此不会被判为"纯列表型"。
 */
function isLikelyListPage(template) {
  const t = template || "";
  const hasBaseTable = /<BaseTable[\s>]/.test(t);
  const hasPagination = /jh-pagination/.test(t);
  const hasForm = /<el-form[\s>]/.test(t);
  const hasTabs = /<el-tabs[\s>]/.test(t);
  // 纯列表 = 有表格 + 有分页 + 无表单 + 无 Tab
  return hasBaseTable && hasPagination && !hasForm && !hasTabs;
}

// ─── 单页规则 helper（从 runAstRules 抽出，降低主函数圈复杂度）──────────

/**
 * K8: 强制 3 文件分离 — 有 API 调用/大量逻辑但无 data.ts，或有 data.ts 仍泄漏 API 调用
 */
function checkR8FileSeparation(scriptContent, effectiveLines, hasDataTs, pageDir, fullSource, issues) {
  const hasApiCall = /getAction|postAction|putAction|deleteAction|API_CONFIG/.test(
    stripCommentsAndStrings(scriptContent),
  );
  const ignore = hasIgnoreMarker(fullSource, "K8");
  if (!hasDataTs) {
    if (hasApiCall && !ignore) {
      issues.push({
        level: "error",
        dir: pageDir,
        text: "页面有接口调用但缺 data.ts（业务逻辑必须在 data.ts 中）",
        rule: "K8",
      });
    } else if (effectiveLines > 20 && !ignore) {
      issues.push({
        level: "warn",
        dir: pageDir,
        text: "index.vue 有 " + effectiveLines + " 行逻辑但无 data.ts（建议拆分）",
        rule: "K8",
      });
    }
  }
  // 有 data.ts 但 index.vue 仍然有 API 调用（逻辑泄漏）
  if (hasDataTs && hasApiCall && !ignore) {
    issues.push({
      level: "error",
      dir: pageDir,
      text: "有 data.ts 但 index.vue 中仍含 API 调用（逻辑应全部在 data.ts）",
      rule: "K8",
    });
  }
}

/**
 * K13: 单函数圈复杂度 > MAX_CYCLOMATIC_COMPLEXITY → error
 *     覆盖 index.vue <script> 与 data.ts 的所有函数/方法/箭头函数（嵌套函数独立计）
 */
function checkR13Complexity(scriptContent, dataContent, pageDir, fullSource, issues) {
  if (hasIgnoreMarker(fullSource, "K13")) return;
  const maxC = CONFIG.MAX_CYCLOMATIC_COMPLEXITY;
  const scanComplexity = (code, label) => {
    const ast = parseScriptAst(code);
    if (!ast) return;
    for (const fn of collectFunctions(ast)) {
      const cc = computeFunctionComplexity(fn.node);
      if (cc > maxC) {
        issues.push({
          level: "error",
          dir: pageDir,
          text:
            label + " 函数 " + fn.name +
            "() 圈复杂度 " + cc + "（阈值 " + maxC +
            "），需拆分为更小函数（standard 04）",
          rule: "K13",
        });
      }
    }
  };
  scanComplexity(scriptContent, "index.vue");
  if (dataContent) scanComplexity(dataContent, "data.ts");
}

// ─── 主检测函数 ────────────────────────────────────────────────────────

/**
 * @param {string} targetDir 项目根目录绝对路径
 * @param {string} scanRel   扫描相对路径（默认 src/views）
 * @param {object} options   { stagedFiles?: string[] } 限制只检测 staged 文件
 * @returns { issues: Array<{level,dir,text,rule}>, pages: number }
 */
const FORBIDDEN_NATIVE_COMPONENTS = [
  { tag: "el-form", replace: "BaseQuery（查询区）或 c_formModal（弹窗表单）" },
  { tag: "el-pagination", replace: "jh-pagination" },
  { tag: "el-date-picker", replace: "jh-date / jh-date-range" },
  { tag: "el-select", replace: "jh-select（dict 属性自动加载字典）" },
  { tag: "el-tree", replace: "C_Tree" },
  { tag: "el-upload", replace: "jh-file-upload" },
];

function astUnavailableResult(scanRel) {
  return {
    issues: [{ level: "warn", dir: scanRel || "src/views",
      text: "AST 引擎不可用（@vue/compiler-sfc 未安装或版本不兼容），跳过语义级规则检测。建议 pnpm install 后重试。", rule: "AST" }],
    pages: 0, astAvailable: false,
  };
}

function isSkippedPage(dir) {
  return CONFIG.SKIP_DIRS.some((name) => dir.includes(`/${name}/`) || dir.startsWith(`${name}/`));
}

function collectPageDirectories(targetDir, scanRel) {
  const dirMap = new Map();
  for (const file of walkDir(path.join(targetDir, scanRel || "src/views"), targetDir)) {
    const dir = path.dirname(file.rel);
    if (!dirMap.has(dir)) dirMap.set(dir, new Set());
    dirMap.get(dir).add(file.rel.split("/").pop());
  }
  return [...dirMap.entries()]
    .filter(([dir, names]) => names.has("index.vue") && !isSkippedPage(dir))
    .map(([dir, names]) => ({ dir, names }))
    .sort((left, right) => left.dir.localeCompare(right.dir));
}

function includesStagedPage(stagedFilter, context) {
  if (!stagedFilter) return true;
  if ([...stagedFilter].some((file) => file.startsWith(`${context.page.dir}/`))) return true;
  return context.styleSources.some((source) => {
    const rel = path.relative(context.projectRoot, source.path).replace(/\\/g, "/");
    return stagedFilter.has(rel);
  });
}

function scssImportCandidates(projectRoot, importerPath, request) {
  if (!request || /^(?:https?:|sass:|url\()/i.test(request)) return [];
  let basePath;
  if (request.startsWith("@/")) basePath = path.join(projectRoot, "src", request.slice(2));
  else if (request.startsWith(".")) basePath = path.resolve(path.dirname(importerPath), request);
  else return [];
  const ext = path.extname(basePath);
  const candidates = ext
    ? [basePath]
    : [
      `${basePath}.scss`,
      path.join(basePath, "index.scss"),
      path.join(path.dirname(basePath), `_${path.basename(basePath)}.scss`),
    ];
  const safeRoot = `${path.resolve(projectRoot)}${path.sep}`.toLowerCase();
  return candidates.filter((candidate) => path.resolve(candidate).toLowerCase().startsWith(safeRoot));
}

function collectScssSources(projectRoot, entryPath, visited = new Set()) {
  const resolved = path.resolve(entryPath);
  if (visited.has(resolved) || visited.size >= 32 || !fs.existsSync(resolved)) return [];
  visited.add(resolved);
  const content = fs.readFileSync(resolved, "utf8");
  const sources = [{ path: resolved, content }];
  const importPattern = /@(?:import|use)\s+(?:url\()?\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(importPattern)) {
    const imported = scssImportCandidates(projectRoot, resolved, match[1])
      .find((candidate) => fs.existsSync(candidate));
    if (imported) sources.push(...collectScssSources(projectRoot, imported, visited));
  }
  return sources;
}

function collectVueStyleSources(projectRoot, indexPath, styles) {
  const sources = [];
  const visited = new Set();
  const importPattern = /@(?:import|use)\s+(?:url\()?\s*["']([^"']+)["']/g;
  for (const [index, content] of (styles || []).entries()) {
    sources.push({ path: `${indexPath}#style-${index}`, content });
    for (const match of content.matchAll(importPattern)) {
      const imported = scssImportCandidates(projectRoot, indexPath, match[1])
        .find((candidate) => fs.existsSync(candidate));
      if (imported) sources.push(...collectScssSources(projectRoot, imported, visited));
    }
  }
  return sources;
}

function uniqueStyleSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source.path}\0${source.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readPageStyleSources(targetDir, absDir, parsed) {
  const entryPath = path.join(absDir, "index.scss");
  const indexPath = path.join(absDir, "index.vue");
  const vue = parsed || parseVueScript(indexPath);
  return uniqueStyleSources([
    ...collectScssSources(targetDir, entryPath),
    ...collectVueStyleSources(targetDir, indexPath, vue?.styles),
  ]);
}

function getPageStyleFiles(targetDir, pageDir) {
  const absDir = path.join(targetDir, pageDir);
  return readPageStyleSources(targetDir, absDir)
    .map((source) => source.path.split("#style-")[0])
    .filter((sourcePath) => fs.existsSync(sourcePath))
    .map((sourcePath) => path.relative(targetDir, sourcePath).replace(/\\/g, "/"))
    .filter((sourcePath, index, values) => values.indexOf(sourcePath) === index);
}

function createPageContext(targetDir, page, shared) {
  const absDir = path.join(targetDir, page.dir);
  const dataPath = path.join(absDir, "data.ts");
  const parsed = parseVueScript(path.join(absDir, "index.vue"));
  if (!parsed) return null;
  const dataContent = fs.existsSync(dataPath) ? fs.readFileSync(dataPath, "utf-8") : "";
  return { ...shared, page, absDir, dataContent, styleSources: readPageStyleSources(targetDir, absDir, parsed),
    scriptContent: parsed.content, template: parsed.template, fullSource: parsed.source,
    effectiveLines: countEffectiveLines(parsed.content), isList: isLikelyListPage(parsed.template) };
}

function pushIssue(context, level, rule, text) {
  context.issues.push({ level, dir: context.page.dir, rule, text });
}

function checkPageScriptSize(context) {
  const threshold = context.isList ? CONFIG.SCRIPT_LINE_THRESHOLD_LIST : CONFIG.SCRIPT_LINE_THRESHOLD_OTHER;
  if (context.effectiveLines <= threshold) return;
  const pageType = context.isList ? "列表页" : "非列表页";
  pushIssue(context, "warn", "K1", `index.vue <script> 业务逻辑 ${context.effectiveLines} 行（${pageType} 阈值 ${threshold}），应迁移至 data.ts`);
}

function checkForbiddenImports(context, specifiers) {
  const ignored = hasIgnoreMarker(context.fullSource, "K2");
  for (const name of CONFIG.FORBIDDEN_IMPORTS) {
    const used = specifiers.includes(name) || new RegExp(`\\b${name}\\s*\\(`).test(context.scriptContent);
    if (used && !ignored) pushIssue(context, "error", "K2", `index.vue 中禁止使用 ${name}（应在 data.ts 中调用）`);
  }
}

function checkForbiddenGlobals(context) {
  const codeOnly = stripCommentsAndStrings(context.scriptContent);
  const ignored = hasIgnoreMarker(context.fullSource, "K2");
  for (const name of CONFIG.FORBIDDEN_GLOBALS) {
    if (new RegExp(`\\b${name}\\b`).test(codeOnly) && !ignored) {
      pushIssue(context, "error", "K2", `index.vue 中禁止直接使用 ${name}（应在 data.ts 中处理）`);
    }
  }
}

function checkWarnImports(context, specifiers) {
  for (const name of CONFIG.WARN_IMPORTS) {
    if (specifiers.includes(name)) pushIssue(context, "warn", "K2", `index.vue 中使用了 ${name}（读取路由参数应在 data.ts 中处理）`);
  }
}

function checkPageImports(context) {
  if (!context.scriptContent) return;
  const { specifiers, sources } = extractScriptInfo(context.scriptContent);
  checkForbiddenImports(context, specifiers);
  checkForbiddenGlobals(context);
  checkWarnImports(context, specifiers);
  if (sources.includes("axios")) pushIssue(context, "error", "K6", "index.vue 中禁止直接 import axios（使用 getAction/postAction）");
}

function checkRawTable(context) {
  const rawTable = hasRawElTable(context.template) && !hasBaseTable(context.template);
  const ignored = hasIgnoreMarker(context.fullSource, "K3") || context.exempt.isExempt(context.page.dir, "K3");
  if (rawTable && !ignored) pushIssue(context, "error", "K3", "页面使用 <el-table> 但未使用 <BaseTable>（应使用平台组件）");
}

function collectPageCids(context) {
  const pageCids = new Set();
  for (const content of [context.fullSource, context.dataContent]) {
    for (const cid of extractCidsFromContent(content)) pageCids.add(cid);
  }
  for (const cid of pageCids) {
    if (!context.globalCidMap.has(cid)) context.globalCidMap.set(cid, new Set());
    context.globalCidMap.get(cid).add(context.page.dir);
  }
}

function checkListHook(context) {
  if (!context.page.names.has("data.ts") || !context.isList) return;
  if (!context.dataContent.trim() || !/AbstractPageQueryHook/.test(context.dataContent)) {
    pushIssue(context, "warn", "K5", "列表型页面 data.ts 未使用 AbstractPageQueryHook（确认是否有充分理由）");
  }
}

function containsUnsafeEvaluation(content) {
  return /\beval\s*\(/.test(content) || /new\s+Function\s*\(/.test(content);
}

function checkDataSecurity(context) {
  if (!context.dataContent) return;
  const clean = stripCommentsAndStrings(context.dataContent);
  const axios = extractScriptInfo(context.dataContent).sources.includes("axios") || /require\s*\(\s*["']axios["']\s*\)/.test(clean);
  if (axios) pushIssue(context, "error", "K6", "data.ts 中禁止直接 import axios（使用 getAction/postAction）");
  if (containsUnsafeEvaluation(clean)) pushIssue(context, "error", "K7", "data.ts 中禁止使用 eval / new Function（安全风险）");
}

function checkPageEvaluation(context) {
  if (context.scriptContent && containsUnsafeEvaluation(stripCommentsAndStrings(context.scriptContent))) {
    pushIssue(context, "error", "K7", "index.vue 中禁止使用 eval / new Function（安全风险）");
  }
}

function extractApiUrls(content) {
  return [...content.matchAll(/\/[a-z][a-z0-9_-]*(?:\/[a-zA-Z0-9_-]+)+/g)].map((match) => match[0]);
}

function validateEmbeddedContract(context, source) {
  try {
    const contract = JSON.parse(source);
    const validation = validateApiContract(contract, {
      strict: context.strict,
      profile: context.deliveryProfile,
    });
    for (const item of validation.errors) pushIssue(context, "error", "K9", `${item.code} ${item.location}: ${item.message}`);
    for (const item of validation.warnings.filter((item) => item.code !== "AC105")) {
      pushIssue(context, "warn", "K9", `${item.code} ${item.location}: ${item.message}`);
    }
  } catch (error) {
    pushIssue(context, "error", "K9", `机器契约 JSON 解析失败：${error.message}`);
  }
}

function checkEmbeddedContract(context, apiMdContent) {
  const contractMatches = [
    ...apiMdContent.matchAll(/```(?:wl-api-contract|wl-backend-contract)\s*\r?\n([\s\S]*?)\r?\n```/g),
  ];
  if (contractMatches.length === 0) {
    if (context.strict) pushIssue(context, "error", "K9", "严格模式要求 api.md 至少包含一个 wl-api-contract 机器块");
    return;
  }
  const identities = new Set();
  for (const match of contractMatches) {
    validateEmbeddedContract(context, match[1]);
    try {
      const contract = JSON.parse(match[1]);
      const identity = `${contract.resource?.contractId || "?"}|${contract.transport?.externalBasePath || "?"}`;
      if (identities.has(identity)) pushIssue(context, "error", "K9", `api.md 存在重复 WL 机器契约：${identity}`);
      identities.add(identity);
    } catch {
      // JSON 解析错误已由 validateEmbeddedContract 报告。
    }
  }
}

function checkApiUrlCoverage(context, apiMdContent) {
  const apiUrls = extractApiUrls(apiMdContent);
  const dataUrls = [...context.dataContent.matchAll(/["'](\/[a-z][a-z0-9_-]*(?:\/[a-zA-Z0-9_-]+)+)["']/g)].map((match) => match[1]);
  const missing = dataUrls.filter((url) => !apiUrls.includes(url));
  if (missing.length === 0 || hasIgnoreMarker(apiMdContent, "K9")) return;
  pushIssue(context, "warn", "K9", `api.md 缺少接口定义：${missing.slice(0, 3).join(", ")}${missing.length > 3 ? " 等" : ""}`);
}

function checkApiContract(context) {
  if (!context.page.names.has("api.md")) return;
  const hasLocalApiConfig = Boolean(context.dataContent && /API_CONFIG/.test(context.dataContent));
  if (!context.strict && !hasLocalApiConfig) return;
  const apiMdContent = fs.readFileSync(path.join(context.absDir, "api.md"), "utf-8");
  checkEmbeddedContract(context, apiMdContent);
  if (hasLocalApiConfig) checkApiUrlCoverage(context, apiMdContent);
}

function checkPlatformComponents(context) {
  const ignored = hasIgnoreMarker(context.fullSource, "K10") || context.exempt.isExempt(context.page.dir, "K10");
  if (ignored) return;
  for (const { tag, replace } of FORBIDDEN_NATIVE_COMPONENTS) {
    if (new RegExp(`<${tag}[\\s>]`).test(context.template)) {
      pushIssue(context, "error", "K10", `页面使用 <${tag}> 应替换为 ${replace}（standard 13 平台组件合规）`);
    }
  }
}

function checkStoreImport(context) {
  if (!context.dataContent || hasIgnoreMarker(context.fullSource, "K11")) return;
  const info = extractScriptInfo(context.dataContent);
  const imported = info.specifiers.some((name) => /Store$/.test(name)) || info.sources.some((source) => /pinia|stores?\//.test(source));
  if (imported) pushIssue(context, "error", "K11", "data.ts 中禁止 import Pinia Store（标准 10：Store 不应出现在页面逻辑层）");
}

function checkHardcodedEndpoints(context) {
  const fullContent = context.scriptContent + context.dataContent;
  if (!fullContent || hasIgnoreMarker(context.fullSource, "K12")) return;
  const literals = extractStringLiterals(fullContent);
  const literalContent = literals.join("\n");
  const ipMatch = literalContent.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b/);
  if (ipMatch) pushIssue(context, "error", "K12", `检测到硬编码 IP 地址 ${ipMatch[0]}（standard 07：使用环境变量配置）`);
  const httpMatch = literals
    .map((value) => value.match(/(https?:\/\/(?!localhost)[^\s"']+)/))
    .find(Boolean);
  if (httpMatch) pushIssue(context, "warn", "K12", `检测到硬编码 URL ${httpMatch[1]}（standard 07：建议使用环境变量）`);
}

function objectPropertyName(node) {
  if (!node || !["ObjectProperty", "Property"].includes(node.type) || node.computed) return null;
  if (node.key?.type === "Identifier") return node.key.name;
  if (["StringLiteral", "Literal"].includes(node.key?.type)) return node.key.value;
  return null;
}

function numericLiteralValue(node) {
  if (!node) return null;
  if (["NumericLiteral", "Literal"].includes(node.type) && typeof node.value === "number") return node.value;
  return null;
}

function variableOwnerName(node) {
  return node.id?.type === "Identifier" ? node.id.name : null;
}

function assignmentOwnerName(node) {
  return node.left?.type === "Identifier" ? node.left.name : null;
}

const PAGINATION_OWNER_READERS = Object.freeze({
  ObjectProperty: objectPropertyName,
  Property: objectPropertyName,
  VariableDeclarator: variableOwnerName,
  AssignmentExpression: assignmentOwnerName,
});

function paginationOwnerName(ancestors) {
  const paginationName = /^(?:page|pager|paging|pagination|pageParams?|queryParams?|searchParams?)$/i;
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const reader = PAGINATION_OWNER_READERS[ancestors[index].type];
    const name = reader ? reader(ancestors[index]) : null;
    if (paginationName.test(String(name || ""))) return name;
  }
  return null;
}

function paginationPairFromObject(node, ancestors) {
  if (node.type !== "ObjectExpression") return null;
  const values = new Map();
  for (const property of node.properties || []) {
    const name = objectPropertyName(property);
    if (!name) continue;
    const value = numericLiteralValue(property.value);
    if (value !== null) values.set(name, value);
  }
  if (!values.has("current") || !values.has("size")) return null;
  return {
    current: values.get("current"),
    size: values.get("size"),
    owner: paginationOwnerName(ancestors),
  };
}

function paginationLiteralPairs(source) {
  const ast = parseScriptAst(source);
  if (!ast) return [];
  const pairs = [];
  const walk = (node, ancestors = []) => {
    if (!node || typeof node.type !== "string") return;
    const pair = paginationPairFromObject(node, ancestors);
    if (pair) pairs.push(pair);
    const nextAncestors = [...ancestors, node];
    for (const child of getChildNodes(node)) walk(child, nextAncestors);
  };
  walk(ast);
  return pairs;
}

function explicitPaginationPairs(source) {
  return paginationLiteralPairs(source).map(({ current, size }) => ({ current, size }));
}

function checkPaginationDefaults(context) {
  const source = `${context.scriptContent}\n${context.dataContent}`;
  const markerSource = `${context.fullSource}\n${context.dataContent}`;
  if (!source.trim() || hasIgnoreMarker(markerSource, "K15")) return;
  const { pagination } = context.deliveryProfile.transport;
  for (const pair of paginationLiteralPairs(source)) {
    const validBounds = [pair.current >= 1, pair.size >= 1, pair.size <= pagination.maxSize].every(Boolean);
    const validDefault = !pair.owner || [
      pair.current === pagination.defaultCurrent,
      pair.size === pagination.defaultSize,
    ].every(Boolean);
    const invalidBounds = !validBounds;
    const invalidDefault = !validDefault;
    if (!invalidBounds && !invalidDefault) continue;
    const expectation = invalidBounds
      ? `current>=1、1<=size<=${pagination.maxSize}`
      : `${pair.owner} 默认分页必须为 current=${pagination.defaultCurrent}、size=${pagination.defaultSize}`;
    pushIssue(
      context,
      "error",
      "K15",
      `显式分页不符合 ${expectation}，当前为 current=${pair.current}、size=${pair.size}；特殊全量读取必须使用专用非分页接口或精确豁免`,
    );
  }
}

function memberExpressionName(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (!["MemberExpression", "OptionalMemberExpression"].includes(node.type) || node.computed) return "";
  return [memberExpressionName(node.object), node.property?.name || ""].filter(Boolean).join(".");
}

function isErrorMessageExpression(node) {
  if (!node || !["MemberExpression", "OptionalMemberExpression"].includes(node.type) || node.computed) return false;
  return node.property?.name === "message"
    && /^(?:e|err|error|exception)$/i.test(node.object?.name || "");
}

function runtimeBoundaryFindings(source) {
  const ast = parseScriptAst(source);
  const findings = new Set();
  if (!ast) return findings;
  const walk = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "CallExpression") {
      const name = memberExpressionName(node.callee);
      if (name === "structuredClone") findings.add("structuredClone");
      if (/^(?:ElMessage|jhMessage|message|\$message)\.error$/.test(name)
        && isErrorMessageExpression(node.arguments?.[0])) {
        findings.add("raw-error-message");
      }
    }
    for (const child of getChildNodes(node)) walk(child);
  };
  walk(ast);
  return findings;
}

function checkRuntimeBoundaries(context) {
  const source = `${context.scriptContent}\n${context.dataContent}`;
  const markerSource = `${context.fullSource}\n${context.dataContent}`;
  if (!source.trim() || hasIgnoreMarker(markerSource, "K16")) return;
  const findings = runtimeBoundaryFindings(source);
  if (findings.has("structuredClone")) {
    pushIssue(context, "warn", "K16", "页面直接调用 structuredClone；Vue Proxy、函数或组件实例可能触发 DataCloneError，请使用项目验证过的 cloneDeep/toRaw 序列化边界");
  }
  if (findings.has("raw-error-message")) {
    pushIssue(context, "warn", "K16", "禁止把 error.message 原样展示给用户；应优先展示后端业务 message，提供明确中文兜底，并把技术异常写入日志");
  }
}

function longWorkbenchMetrics(template) {
  const tableTags = [...String(template || "").matchAll(/<BaseTable\b[^>]*>/g)].map((match) => match[0]);
  const fixedHeightPattern = /(?:^|\s):?height\s*=\s*["']\d+(?:\.\d+)?(?:px)?["']/i;
  return {
    tableCount: tableTags.length,
    fixedHeightCount: tableTags.filter((tag) => fixedHeightPattern.test(tag)).length,
  };
}

function rootElementAttributes(template) {
  const match = String(template || "").match(/^\s*(?:<!--[\s\S]*?-->\s*)*<[A-Za-z][\w.-]*\b([^>]*)>/);
  if (!match) return { classes: [], style: "" };
  const classMatch = match[1].match(/(?:^|\s)class\s*=\s*["']([^"']+)["']/i);
  const styleMatch = match[1].match(/(?:^|\s)style\s*=\s*["']([^"']+)["']/i);
  return {
    classes: classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [],
    style: styleMatch ? styleMatch[1] : "",
  };
}

function hasVerticalScrollDeclaration(content) {
  return /(?:^|[;\s])overflow-y\s*:\s*(?:auto|scroll)\b/i.test(content) ||
    /(?:^|[;\s])overflow\s*:\s*(?:auto|scroll)(?:\s+(?:auto|scroll))?\b/i.test(content) ||
    /(?:^|[;\s])overflow\s*:\s*(?:visible|hidden|clip)\s+(?:auto|scroll)\b/i.test(content);
}

function selectorTargetsRootClass(selector, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const targetPattern = new RegExp(`\\.${escaped}(?![\\w-])[^ >+~]*$`);
  return selector.split(",").some((part) => targetPattern.test(part.trim()));
}

function directBlockContent(source, openingBrace) {
  let depth = 1;
  let direct = "";
  for (let index = openingBrace + 1; index < source.length && depth > 0; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (depth === 1) direct += char;
  }
  return direct;
}

function styleClassOwnsScroll(source, className) {
  const cleanSource = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\r?\n)\s*\/\/[^\r\n]*/g, "$1");
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockPattern = new RegExp(`(?:^|})\\s*([^{}]*\\.${escaped}(?![\\w-])[^{}]*)\\{`, "g");
  for (const match of cleanSource.matchAll(blockPattern)) {
    if (!selectorTargetsRootClass(match[1], className)) continue;
    const openingBrace = (match.index || 0) + match[0].lastIndexOf("{");
    if (hasVerticalScrollDeclaration(directBlockContent(cleanSource, openingBrace))) return true;
  }
  return false;
}

function rootOwnsVerticalScroll(root, styleSources) {
  if (hasVerticalScrollDeclaration(root.style)) return true;
  return root.classes.some((className) =>
    styleSources.some((source) => styleClassOwnsScroll(source.content, className)),
  );
}

function checkR20LongWorkbenchScroll(context) {
  const template = String(context.template || "").replace(/<!--[\s\S]*?-->/g, "");
  if (!template || /<jh-drag-(?:row|col)\b/i.test(template)) return;
  const metrics = longWorkbenchMetrics(template);
  if (metrics.tableCount < 3 || metrics.fixedHeightCount < 2) return;
  const root = rootElementAttributes(template);
  if (!root.classes.includes("app-page-container")) return;
  const styleContent = context.styleSources.map((source) => source.content).join("\n");
  const markerSource = `${context.fullSource}\n${context.dataContent}\n${styleContent}`;
  const ignored = hasIgnoreMarker(markerSource, "K20") || context.exempt.isExempt(context.page.dir, "K20");
  if (ignored || rootOwnsVerticalScroll(root, context.styleSources)) return;
  pushIssue(
    context,
    "error",
    "K20",
    `长工作台包含 ${metrics.tableCount} 个 BaseTable（${metrics.fixedHeightCount} 个固定高度），app-page-container 根容器缺少 overflow:auto/scroll，页面下部内容会被裁切；请在根容器样式或其本地共享 SCSS 中明确纵向滚动所有者（standards/14）`,
  );
}

function inspectPage(context) {
  checkPageScriptSize(context);
  checkR13Complexity(context.scriptContent, context.dataContent, context.page.dir, context.fullSource, context.issues);
  checkPageImports(context);
  checkRawTable(context);
  checkListHook(context);
  checkDataSecurity(context);
  checkPageEvaluation(context);
  checkR8FileSeparation(context.scriptContent, context.effectiveLines, context.page.names.has("data.ts"), context.page.dir, context.fullSource, context.issues);
  checkApiContract(context);
  checkPlatformComponents(context);
  checkStoreImport(context);
  checkHardcodedEndpoints(context);
  checkPaginationDefaults(context);
  checkR17FormRequiredToggle(context);
  checkR18FormValidationLibrary(context);
  checkRuntimeBoundaries(context);
  checkR19DialogAgGridVif(context);
  checkR20LongWorkbenchScroll(context);
  checkK21SplitGridHeightChain(context);
}

/**
 * K19: 弹窗内 AG Grid 必须用 v-if 延迟挂载
 * 检测 jh-dialog/el-dialog 内含 render-type="agGrid" 但无 v-if 包裹的情况。
 * 缺失 v-if 时 AG Grid 在弹窗动画期间初始化，读到 0 高度导致有数据不渲染行。
 */
function checkR19DialogAgGridVif(context) {
  if (!context.template) return;
  const markerSource = `${context.fullSource}\n${context.dataContent}`;
  if (hasIgnoreMarker(markerSource, "K19")) return;
  const {template} = context;
  // 找所有 jh-dialog / el-dialog 块
  const dialogRegex = /<(?:jh-dialog|el-dialog)[\s\S]*?<\/(?:jh-dialog|el-dialog)>/g;
  let dialogMatch;
  while ((dialogMatch = dialogRegex.exec(template)) !== null) {
    const dialogBlock = dialogMatch[0];
    // 弹窗内是否含 render-type="agGrid" 的 BaseTable/SteelListPanel
    const hasAgGrid = /render-type="agGrid"/.test(dialogBlock) ||
      /render-type=['"]agGrid['"]/.test(dialogBlock);
    if (!hasAgGrid) continue;
    // 弹窗内是否有 v-if 包裹（检查 dialog 内容区是否有 v-if）
    const hasVif = /v-if=/.test(dialogBlock);
    if (hasVif) continue;
    // 报告 error
    pushIssue(context, "error", "K19",
      "弹窗内使用 render-type=agGrid 但缺少 v-if 延迟挂载；AG Grid 在弹窗动画期间初始化会读到 0 高度导致有数据不渲染行，请用 <div v-if=\"visible\"> 包裹弹窗内容");
  }
}

function staticClassNames(attributes) {
  const match = String(attributes || "").match(/(?:^|\s)class\s*=\s*["']([^"']+)["']/i);
  return match ? match[1].split(/\s+/).filter(Boolean) : [];
}

function closeTemplateElement(stack, tag) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].tag !== tag) continue;
    stack.length = index;
    return;
  }
}

function recordLayoutOpening(facts, stack, tag, attributes) {
  const classes = staticClassNames(attributes);
  if (!facts.rootSeen && stack.length === 0) {
    facts.rootSeen = true;
    facts.rootClasses = classes;
  }
  if (tag === "el-tabs" && facts.tabsClasses.length === 0) facts.tabsClasses = classes;
  if (/^jh-drag-(?:row|col)$/.test(tag) && !facts.hasDrag) {
    facts.hasDrag = true;
    facts.splitClasses = stack.at(-1)?.classes || [];
  }
  return classes;
}

function splitGridLayoutFacts(template) {
  const clean = String(template || "").replace(/<!--[\s\S]*?-->/g, "");
  const tokenPattern = /<(\/)?([A-Za-z][\w.-]*)\b([^>]*)>/g;
  const stack = [];
  const facts = { rootClasses: [], rootSeen: false, tabsClasses: [], splitClasses: [], hasDrag: false };
  let match;
  while ((match = tokenPattern.exec(clean)) !== null) {
    const tag = match[2].toLowerCase();
    if (match[1]) {
      closeTemplateElement(stack, tag);
      continue;
    }
    const classes = recordLayoutOpening(facts, stack, tag, match[3]);
    if (!/\/\s*>$/.test(match[0])) stack.push({ tag, classes });
  }
  facts.hasTabs = /<el-tabs\b/i.test(clean);
  facts.hasGrid = /<SteelListPanel\b/i.test(clean) ||
    /<BaseTable\b[^>]*render-type\s*=\s*["']agGrid["']/i.test(clean);
  return facts;
}

function fullBlockContent(source, openingBrace) {
  let depth = 1;
  for (let index = openingBrace + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  return "";
}

function classSelectorPattern(className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`([^{}]*\\.${escaped}(?![\\w-])[^{}]*)\\{`, "g");
}

function literalClassBlocks(source, className, exactTarget) {
  const blocks = [];
  for (const match of source.matchAll(classSelectorPattern(className))) {
    if (exactTarget && !selectorTargetsRootClass(match[1], className)) continue;
    const openingBrace = (match.index || 0) + match[0].lastIndexOf("{");
    blocks.push(directBlockContent(source, openingBrace));
  }
  return blocks;
}

function bemParts(className) {
  const separators = [className.indexOf("__"), className.indexOf("--")]
    .filter((index) => index > 0);
  if (separators.length === 0) return null;
  const index = Math.min(...separators);
  return { base: className.slice(0, index), suffix: className.slice(index) };
}

function nestedBemClassBlocks(source, className) {
  const parts = bemParts(className);
  if (!parts) return [];
  const escapedSuffix = parts.suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nestedPattern = new RegExp(`&${escapedSuffix}(?![\\w-])[^{}]*\\{`, "g");
  const blocks = [];
  for (const baseMatch of source.matchAll(classSelectorPattern(parts.base))) {
    if (!selectorTargetsRootClass(baseMatch[1], parts.base)) continue;
    const baseOpening = (baseMatch.index || 0) + baseMatch[0].lastIndexOf("{");
    const baseContent = fullBlockContent(source, baseOpening);
    for (const nestedMatch of baseContent.matchAll(nestedPattern)) {
      const opening = (nestedMatch.index || 0) + nestedMatch[0].lastIndexOf("{");
      blocks.push(directBlockContent(baseContent, opening));
    }
  }
  return blocks;
}

function styleClassDeclarations(styleSources, className) {
  const blocks = [];
  for (const source of styleSources) {
    blocks.push(...literalClassBlocks(source.content, className, true));
    blocks.push(...nestedBemClassBlocks(source.content, className));
  }
  return blocks.join("\n");
}

function descendantClassDeclarations(styleSources, className) {
  return styleSources.flatMap((source) =>
    literalClassBlocks(source.content, className, false)).join("\n");
}

const HEIGHT_CHAIN_DECLARATIONS = {
  column: /(?:^|[;\s])flex-direction\s*:\s*column\b/i,
  flex: /(?:^|[;\s])display\s*:\s*(?:inline-)?flex\b/i,
  grow: /(?:^|[;\s])(?:flex\s*:\s*1(?:\s|;|$)|flex-grow\s*:\s*1\b)/i,
  height: /(?:^|[;\s])height\s*:\s*100%(?![\w.%])/i,
  minHeight: /(?:^|[;\s])min-height\s*:\s*0(?:px|rem|em|%)?\b/i,
};

function hasDeclarations(content, names) {
  const clean = String(content || "").replace(/\/\*[\s\S]*?\*\//g, "");
  return names.every((name) => HEIGHT_CHAIN_DECLARATIONS[name].test(clean));
}

function anyClassSupports(styleSources, classes, names) {
  return classes.some((className) =>
    hasDeclarations(styleClassDeclarations(styleSources, className), names));
}

function splitGridHeightChecks(context, facts) {
  const dragClass = /<jh-drag-col\b/i.test(context.template) ? "drager_col" : "drager_row";
  return [
    {
      ok: anyClassSupports(context.styleSources, facts.rootClasses,
        ["height", "minHeight", "flex", "column"]),
      label: "页面根容器(height:100% + min-height:0 + flex-column)",
    },
    {
      ok: anyClassSupports(context.styleSources, facts.tabsClasses,
        ["minHeight", "flex", "grow", "column"]),
      label: "Tabs 容器(min-height:0 + flex:1 + flex-column)",
    },
    {
      ok: hasDeclarations(descendantClassDeclarations(context.styleSources, "el-tabs__content"),
        ["minHeight", "grow"]),
      label: "el-tabs__content(min-height:0 + flex:1)",
    },
    {
      ok: hasDeclarations(descendantClassDeclarations(context.styleSources, "el-tab-pane"),
        ["height", "minHeight"]),
      label: "el-tab-pane(height:100% + min-height:0)",
    },
    {
      ok: anyClassSupports(context.styleSources, facts.splitClasses, ["minHeight", "grow"]),
      label: "jh-drag 直接父容器(min-height:0 + flex:1)",
    },
    {
      ok: hasDeclarations(descendantClassDeclarations(context.styleSources, dragClass), ["height"]),
      label: `${dragClass}(height:100%)`,
    },
  ];
}

function isK21Ignored(context, styleContent) {
  const markerSource = `${context.fullSource}\n${context.dataContent}\n${styleContent}`;
  return hasIgnoreMarker(markerSource, "K21") || context.exempt.isExempt(context.page.dir, "K21");
}

/**
 * K21: Tabs + jh-drag + AG Grid 的每一级父容器都必须可收缩并传递高度。
 * 任何一级缺少高度链都会让 AG Grid 获得 0 高度，表现为“接口有数据但表格空白”。
 */
function checkK21SplitGridHeightChain(context) {
  const facts = splitGridLayoutFacts(context.template);
  if (![facts.hasTabs, facts.hasDrag, facts.hasGrid].every(Boolean)) return;
  const styleContent = context.styleSources.map((source) => source.content).join("\n");
  if (isK21Ignored(context, styleContent)) return;
  const missing = splitGridHeightChecks(context, facts)
    .filter((check) => !check.ok)
    .map((check) => check.label);
  if (missing.length === 0) return;
  pushIssue(context, "error", "K21",
    `Tabs + jh-drag + AG Grid 高度链不完整：缺少 ${missing.join("、")}；容器高度会折叠并导致有数据但表格空白（standards/14）`);
}

function checkR17FormRequiredToggle(context) {
  const markerSource = `${context.fullSource}\n${context.dataContent}`;
  if (hasIgnoreMarker(markerSource, "K17")) return;
  const forms = analyzeFormRequiredOnly(context.template, markerSource)
    .filter((item) => item.eligible && !item.enabled);
  for (const form of forms) {
    pushIssue(
      context,
      "warn",
      "K17",
      `表单 ${form.binding} 有 ${form.total} 个字段（${form.required} 必填 / ${form.total - form.required} 非必填），建议接入 ${form.capability} 支持“全部/仅必填”快速切换（standards/11）`,
    );
  }
}

function checkR18FormValidationLibrary(context) {
  const source = `${context.fullSource}\n${context.dataContent}`;
  if (hasIgnoreMarker(source, "K18")) return;
  for (const finding of formValidationFindings(context.projectRoot, source)) {
    pushIssue(context, finding.level, "K18", finding.text);
  }
}

function appendDuplicateCidIssues(globalCidMap, issues) {
  for (const [cid, dirs] of globalCidMap.entries()) {
    if (dirs.size <= 1) continue;
    const dirArray = [...dirs];
    issues.push({ level: "error", dir: dirArray.join(" | "), text: `cid "${cid}" 在 ${dirArray.length} 个页面中重复使用`, rule: "K4" });
  }
}

function appendAstConfigIssues(issues, loadedProfile, exempt) {
  for (const message of loadedProfile.errors) issues.push({ level: "error", dir: ".", text: message, rule: "PROFILE" });
  for (const warning of loadedProfile.warnings) issues.push({ level: "info", dir: ".", text: warning.message, rule: "PROFILE" });
  for (const warning of exempt.warnings) issues.push({ level: "warn", dir: ".", text: warning, rule: "EXEMPT" });
}

function prepareAstCache(targetDir, options, loadedProfile, exempt) {
  const stagedFilter = options.stagedFiles ? new Set(options.stagedFiles.map((file) => file.replace(/\\/g, "/"))) : null;
  const cacheEnabled = options.cache !== false && !options.typecheck;
  const cache = cacheEnabled ? readValidationCache(targetDir) : { entries: {} };
  const cacheContext = contextFingerprint({
    ruleSource: fs.readFileSync(__filename, "utf8"),
    strict: options.strict === true,
    profile: loadedProfile.profile,
    profileErrors: loadedProfile.errors,
    packageJson: fs.existsSync(path.join(targetDir, "package.json"))
      ? fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
      : "",
    exemptionSource: exempt.source,
    exemptionConfig: fs.existsSync(path.join(targetDir, ".wl-skills-validate.json"))
      ? fs.readFileSync(path.join(targetDir, ".wl-skills-validate.json"), "utf8")
      : "",
  });
  return { stagedFilter, cacheEnabled, cache, cacheContext };
}

function inspectAstPages(targetDir, pages, shared, cacheState) {
  let cacheHits = 0;
  let cacheMisses = 0;
  for (const page of pages) {
    const context = createPageContext(targetDir, page, shared);
    if (!context) continue;
    if (!includesStagedPage(cacheState.stagedFilter, context)) continue;
    collectPageCids(context);
    const key = cacheState.cacheEnabled ? pageCacheKey(targetDir, page.dir, cacheState.cacheContext, {
      indexVue: context.fullSource,
      dataTs: context.dataContent,
      indexScss: context.styleSources.map((source) => source.content).join("\n"),
    }) : "";
    const cached = key && cacheState.cache.entries[page.dir];
    if (cached && cached.key === key && Array.isArray(cached.issues)) {
      shared.issues.push(...cached.issues);
      cacheHits += 1;
      continue;
    }
    const issueStart = shared.issues.length;
    inspectPage(context);
    if (!cacheState.cacheEnabled) continue;
    cacheState.cache.entries[page.dir] = { key, issues: shared.issues.slice(issueStart) };
    cacheMisses += 1;
  }
  return { cacheHits, cacheMisses };
}

function runAstRules(targetDir, scanRel, options = {}) {
  if (!isAstFunctionallyUsable()) return astUnavailableResult(scanRel);
  const pages = collectPageDirectories(targetDir, scanRel);
  const issues = [];
  const globalCidMap = new Map();
  const exempt = loadExemptions(targetDir);
  const loadedProfile = loadDeliveryProfile(targetDir, options.profileFile);
  appendAstConfigIssues(issues, loadedProfile, exempt);
  const cacheState = prepareAstCache(targetDir, options, loadedProfile, exempt);
  if (cacheState.cacheEnabled) {
    const activePages = new Set(pages.map((page) => page.dir));
    for (const pageDir of Object.keys(cacheState.cache.entries)) {
      if (!activePages.has(pageDir)) delete cacheState.cache.entries[pageDir];
    }
  }
  const shared = {
    issues,
    globalCidMap,
    exempt,
    projectRoot: targetDir,
    strict: options.strict === true,
    deliveryProfile: loadedProfile.profile,
  };
  const cacheStats = inspectAstPages(targetDir, pages, shared, cacheState);
  appendDuplicateCidIssues(globalCidMap, issues);
  if (cacheState.cacheEnabled) writeValidationCache(targetDir, cacheState.cache);
  return { issues, pages: pages.length, astAvailable: true, ...cacheStats };
}
function getStagedFiles(targetDir) {
  try {
    const output = execFileSync(
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
      {
        cwd: targetDir,
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return output
      .trim()
      .split("\n")
      .filter((f) => f && (/\.(vue|ts|scss)$/.test(f) || /(^|\/)api\.md$/.test(f)));
  } catch {
    return [];
  }
}

// ─── K14 类型错误零容忍（项目级，vue-tsc / tsc 委托）──────────────────
//
// 体积较大，validate 默认不触发，由 CLI --typecheck / MCP typecheck:true 显式开启。
// 无 tsconfig / 无 checker → 优雅降级为 warn（与 AST 依赖降级策略一致）。
// 该函数不进入 page 粒度，整项目执行一次，结果按文件归并到 issues。

function spawnTypeChecker(bin, args, options) {
  const localBase = path.join(options.cwd, "node_modules", ".bin", bin);
  if (process.platform !== "win32") {
    return spawnSync(fs.existsSync(localBase) ? localBase : bin, args, options);
  }
  const command = fs.existsSync(localBase + ".cmd") ? localBase + ".cmd" : bin;
  return spawnSync("cmd.exe", ["/d", "/s", "/c", command, ...args], options);
}

function typeCheckSkipped(label, text) {
  return { issues: [{ level: "warn", dir: label, text, rule: "K14" }], ran: false, errorCount: 0 };
}

function typeCheckerEnvironment(root) {
  const localBin = path.join(root, "node_modules", ".bin");
  const currentPath = process.env.PATH || process.env.Path || "";
  return { ...process.env, PATH: `${localBin}${path.delimiter}${currentPath}` };
}

function findTypeChecker(root, env) {
  for (const bin of ["vue-tsc", "tsc"]) {
    try {
      const probe = spawnTypeChecker(bin, ["--version"], {
        cwd: root, env, encoding: "utf8", timeout: 20000,
      });
      if (probe.status === 0) return bin;
    } catch {
      // 继续探测下一个 checker
    }
  }
  return null;
}

function executeTypeChecker(checker, root, env) {
  try {
    return { ok: true, result: spawnTypeChecker(checker, ["--noEmit"], {
      cwd: root, env, encoding: "utf8", timeout: 180000,
    }) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function parseTypeErrors(output) {
  const pattern = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s*(.+)$/gm;
  const errors = [];
  let match;
  while ((match = pattern.exec(output)) !== null) {
    errors.push({ file: match[1], line: match[2], code: match[4], msg: match[5] });
  }
  return errors;
}

function unparsedTypeCheckResult(checker, result, output, label) {
  if (result.status === 0) return { issues: [], ran: true, errorCount: 0 };
  const configError = /tsconfig|Cannot find module.*\.json|error TS6053|error TS5023|File not found/i.test(output);
  const detail = configError
    ? "（疑似 tsconfig 配置问题，非类型错误，请检查 tsconfig.json）"
    : "（无标准 TS 错误输出，请检查 tsconfig / 类型配置）";
  return {
    issues: [{ level: configError ? "warn" : "error", dir: label,
      text: `${checker} --noEmit 退出码 ${result.status}${detail}`, rule: "K14" }],
    ran: true,
    errorCount: configError ? 0 : 1,
  };
}

function relativeTypeErrorPath(root, file) {
  const absolute = path.isAbsolute(file) ? file : path.resolve(root, file);
  return path.relative(root, absolute).replace(/\\/g, "/") || file;
}

function isDependencyTypeError(root, error) {
  const rel = relativeTypeErrorPath(root, error.file);
  return rel === "node_modules" || rel.startsWith("node_modules/");
}

function formatProjectTypeIssues(root, errors) {
  return errors.slice(0, CONFIG.TYPECHECK_ERROR_CAP).map((error) => {
    const rel = relativeTypeErrorPath(root, error.file);
    return {
      level: "error",
      dir: path.dirname(rel) || ".",
      text: `${error.code} ${error.msg} (${path.basename(rel)}:${error.line})`,
      rule: "K14",
    };
  });
}

function formatDependencyTypeIssue(root, errors) {
  if (errors.length === 0) return [];
  const first = errors[0];
  const rel = relativeTypeErrorPath(root, first.file);
  return [{
    level: "warn",
    dir: "node_modules",
    text: `依赖包源码存在 ${errors.length} 个类型错误，未归因到业务项目；首项 ${first.code} ${first.msg} (${rel}:${first.line})`,
    rule: "K14",
  }];
}

function formatTypeCheckResult(root, errors) {
  const projectErrors = errors.filter((error) => !isDependencyTypeError(root, error));
  const dependencyErrors = errors.filter((error) => isDependencyTypeError(root, error));
  return {
    issues: [
      ...formatProjectTypeIssues(root, projectErrors),
      ...formatDependencyTypeIssue(root, dependencyErrors),
    ],
    errorCount: projectErrors.length,
  };
}

function runTypeCheck(root) {
  const safeRoot = root || process.cwd();
  const label = path.basename(safeRoot) || ".";
  if (!fs.existsSync(path.join(safeRoot, "tsconfig.json"))) {
    return typeCheckSkipped(label, "未发现 tsconfig.json，跳过类型检查 K14");
  }
  const env = typeCheckerEnvironment(safeRoot);
  const checker = findTypeChecker(safeRoot, env);
  if (!checker) {
    return typeCheckSkipped(label, "未发现 vue-tsc / tsc，跳过类型检查 K14（建议安装后纳入 CI）");
  }
  const execution = executeTypeChecker(checker, safeRoot, env);
  if (!execution.ok) return typeCheckSkipped(label, `类型检查执行异常：${execution.error}`);
  const { result } = execution;
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const errors = parseTypeErrors(output);
  if (errors.length === 0) return unparsedTypeCheckResult(checker, result, output, label);
  const formatted = formatTypeCheckResult(safeRoot, errors);
  return { ...formatted, ran: true };
}
module.exports = {
  runAstRules,
  parseVueScript,
  countEffectiveLines,
  extractScriptInfo,
  parseScriptAst,
  computeFunctionComplexity,
  collectFunctions,
  runTypeCheck,
  loadExemptions,
  hasAstAvailable,
  isAstFunctionallyUsable,
  getStagedFiles,
  getPageStyleFiles,
  isLikelyListPage,
  isListTypePage,
  hasIgnoreMarker,
  explicitPaginationPairs,
  runtimeBoundaryFindings,
  CONFIG,
};

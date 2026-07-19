"use strict";

/**
 * lib/ast-rules.js — wl-skills-kit AST 级规范检测引擎
 *
 * 补充 validate（正则）无法覆盖的语义级规则。
 * 依赖：@vue/compiler-sfc（解析 .vue）、@babel/parser（解析 <script> AST）
 * 这两个包在 Vue 3 + Vite 项目中天然存在，用 try-require 做优雅降级。
 *
 * 规则编号 R1~R14 对应 standards 02/04/06/07/09/10/12/13 中的语义约束：
 *   R1: index.vue <script setup> 业务逻辑行数超阈值 → warn（02）
 *   R2: index.vue 含禁止 import（getAction/postAction/sessionStorage 等）→ error（02/06）
 *   R3: 页面用 <el-table> 但未用 <BaseTable> → error（12/13）
 *   R4: cid 全局重复 → error（12）
 *   R5: 纯列表型页面 data.ts 未用 AbstractPageQueryHook → warn（02）
 *   R6: index.vue 或 data.ts 直接 import axios → error（06）
 *   R7: index.vue 或 data.ts 用 eval / new Function → error（06）
 *   R8: 强制 3 文件分离 — 有 API 调用但无 data.ts，或逻辑泄漏 → error/warn（02）
 *   R9: api.md 质量 — URL 与 data.ts API_CONFIG 不一致 → warn（02）
 *   R10: 平台组件替换检测 — el-form/el-select/el-date-picker 等应替换为平台封装 → error（13）
 *   R11: data.ts 禁止 import Pinia Store → error（10）
 *   R12: 硬编码 IP/URL 检测 → error/warn（07）
 *   R13: 单函数圈复杂度 > 10（Mcabe，与 ESLint complexity 定义一致）→ error（04）
 *   R14: 文件类型错误零容忍 — vue-tsc/tsc --noEmit 产物解析 → error（09）
 *        注：R14 为项目级检查，体积较大，validate 默认不跑，
 *        需显式 --typecheck（CLI）/ typecheck:true（MCP）触发，优雅降级为 warn
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
const { execFileSync, spawnSync } = require("child_process");
const { validateApiContract } = require("./api-contract");

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
 *   <!-- wl-skills:ignore R3 -->        ← 在 index.vue 模板中
 *   // wl-skills:ignore R3              ← 在 script 中
 *   /* wl-skills:ignore R3 * /          ← 在 scss/script 中
 * 
 * 用于特殊场景（如弹窗内确实需要 el-table、确实需要在 index.vue 中用 sessionStorage）。
 * 标记必须带规则编号（R1~R14），精确豁免，不是全局豁免。
 */
function hasIgnoreMarker(content, rule) {
  if (!content || !rule) return false;
  const patterns = [
    new RegExp("wl-skills:ignore\\s+" + rule + "\\b", "i"),
    new RegExp("wl-skills:\\s*ignore\\s+" + rule + "\\b", "i"),
  ];
  return patterns.some((p) => p.test(content));
}

const CONFIG = {
  // R1: 纯列表页 index.vue 阈值（index.vue 应几乎只有模板+解构）
  SCRIPT_LINE_THRESHOLD_LIST: 40,
  // R1: 非列表页（表单/详情/设计器）允许更多逻辑
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
  // R13: 单函数圈复杂度上限（Mcabe），与 ESLint complexity 规则阈值一致
  MAX_CYCLOMATIC_COMPLEXITY: 10,
  // R14: 单页类型错误采集上限（避免输出爆炸）
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
//         "rules": ["R3", "R10"],
//         "reason": "表单设计器内嵌表格，BaseTable AGGrid 内联编辑受限"
//       }
//     ]
//   }
//
// 与单文件注释豁免（wl-skills:ignore R3）互补：注释精确到单文件，
// 配置批量到目录。无配置文件时返回空豁免，行为完全不变。

/**
 * 加载项目级豁免配置
 * @param {string} targetDir 项目根目录
 * @returns {{ isExempt: (pageDir:string, rule:string)=>boolean, source: string|null, warnings: string[] }}
 */
function loadExemptions(targetDir) {
  const warnings = [];
  const configPath = path.join(
    targetDir || process.cwd(),
    CONFIG.EXEMPT_CONFIG_NAME,
  );
  if (!fs.existsSync(configPath)) {
    return { isExempt: () => false, source: null, warnings };
  }
  const parsed = readExemptionConfig(configPath);
  if (!parsed.ok) {
    warnings.push(`${CONFIG.EXEMPT_CONFIG_NAME} 解析失败，已忽略（${parsed.error}）`);
    return { isExempt: () => false, source: configPath, warnings };
  }
  const compiled = compileExemptions(parsed.value.exemptions);
  const isExempt = (pageDir, rule) => matchesExemption(compiled, pageDir, rule);
  return { isExempt, source: configPath, warnings };
}

function readExemptionConfig(configPath) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(configPath, "utf8")) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
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
    const rules = new Set(entry.rules.map((rule) => String(rule).toUpperCase()));
    for (const item of entry.paths) compiled.push({ prefix: normalizeExemptionPrefix(item), rules });
  }
  return compiled;
}

function matchesExemption(compiled, pageDir, rule) {
  if (!pageDir || !rule) return false;
  const dir = String(pageDir).replace(/\\/g, "/");
  const normalizedRule = String(rule).toUpperCase();
  return compiled.some((item) => item.rules.has(normalizedRule) &&
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
  return { content: scriptContent, template, source };
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

function appendImportSpecifier(specifiers, spec) {
  if (spec.type === "ImportSpecifier") specifiers.push(spec.imported.name || spec.local.name);
  if (["ImportDefaultSpecifier", "ImportNamespaceSpecifier"].includes(spec.type)) {
    specifiers.push(spec.local.name);
  }
}

// ─── R13 圈复杂度（Mcabe）──────────────────────────────────────────────
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

// 收集整棵 AST 中的所有函数节点 + 名字（含嵌套函数，各独立计 R13）
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
 * R8: 强制 3 文件分离 — 有 API 调用/大量逻辑但无 data.ts，或有 data.ts 仍泄漏 API 调用
 */
function checkR8FileSeparation(scriptContent, effectiveLines, hasDataTs, pageDir, fullSource, issues) {
  const hasApiCall = /getAction|postAction|putAction|deleteAction|API_CONFIG/.test(
    stripCommentsAndStrings(scriptContent),
  );
  const ignore = hasIgnoreMarker(fullSource, "R8");
  if (!hasDataTs) {
    if (hasApiCall && !ignore) {
      issues.push({
        level: "error",
        dir: pageDir,
        text: "页面有接口调用但缺 data.ts（业务逻辑必须在 data.ts 中）",
        rule: "R8",
      });
    } else if (effectiveLines > 20 && !ignore) {
      issues.push({
        level: "warn",
        dir: pageDir,
        text: "index.vue 有 " + effectiveLines + " 行逻辑但无 data.ts（建议拆分）",
        rule: "R8",
      });
    }
  }
  // 有 data.ts 但 index.vue 仍然有 API 调用（逻辑泄漏）
  if (hasDataTs && hasApiCall && !ignore) {
    issues.push({
      level: "error",
      dir: pageDir,
      text: "有 data.ts 但 index.vue 中仍含 API 调用（逻辑应全部在 data.ts）",
      rule: "R8",
    });
  }
}

/**
 * R13: 单函数圈复杂度 > MAX_CYCLOMATIC_COMPLEXITY → error
 *     覆盖 index.vue <script> 与 data.ts 的所有函数/方法/箭头函数（嵌套函数独立计）
 */
function checkR13Complexity(scriptContent, dataPath, pageDir, fullSource, issues) {
  if (hasIgnoreMarker(fullSource, "R13")) return;
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
          rule: "R13",
        });
      }
    }
  };
  scanComplexity(scriptContent, "index.vue");
  if (fs.existsSync(dataPath)) {
    scanComplexity(fs.readFileSync(dataPath, "utf8"), "data.ts");
  }
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

function includesStagedPage(stagedFilter, pageDir) {
  if (!stagedFilter) return true;
  return [...stagedFilter].some((file) => file.startsWith(`${pageDir}/`) || file === `${pageDir}/index.vue`);
}

function createPageContext(targetDir, page, shared) {
  const absDir = path.join(targetDir, page.dir);
  const dataPath = path.join(absDir, "data.ts");
  const parsed = parseVueScript(path.join(absDir, "index.vue"));
  if (!parsed) return null;
  const dataContent = fs.existsSync(dataPath) ? fs.readFileSync(dataPath, "utf-8") : "";
  return { ...shared, page, absDir, dataPath, dataContent,
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
  pushIssue(context, "warn", "R1", `index.vue <script> 业务逻辑 ${context.effectiveLines} 行（${pageType} 阈值 ${threshold}），应迁移至 data.ts`);
}

function checkForbiddenImports(context, specifiers) {
  const ignored = hasIgnoreMarker(context.fullSource, "R2");
  for (const name of CONFIG.FORBIDDEN_IMPORTS) {
    const used = specifiers.includes(name) || new RegExp(`\\b${name}\\s*\\(`).test(context.scriptContent);
    if (used && !ignored) pushIssue(context, "error", "R2", `index.vue 中禁止使用 ${name}（应在 data.ts 中调用）`);
  }
}

function checkForbiddenGlobals(context) {
  const codeOnly = stripCommentsAndStrings(context.scriptContent);
  const ignored = hasIgnoreMarker(context.fullSource, "R2");
  for (const name of CONFIG.FORBIDDEN_GLOBALS) {
    if (new RegExp(`\\b${name}\\b`).test(codeOnly) && !ignored) {
      pushIssue(context, "error", "R2", `index.vue 中禁止直接使用 ${name}（应在 data.ts 中处理）`);
    }
  }
}

function checkWarnImports(context, specifiers) {
  for (const name of CONFIG.WARN_IMPORTS) {
    if (specifiers.includes(name)) pushIssue(context, "warn", "R2", `index.vue 中使用了 ${name}（读取路由参数应在 data.ts 中处理）`);
  }
}

function checkPageImports(context) {
  if (!context.scriptContent) return;
  const { specifiers, sources } = extractScriptInfo(context.scriptContent);
  checkForbiddenImports(context, specifiers);
  checkForbiddenGlobals(context);
  checkWarnImports(context, specifiers);
  if (sources.includes("axios")) pushIssue(context, "error", "R6", "index.vue 中禁止直接 import axios（使用 getAction/postAction）");
}

function checkRawTable(context) {
  const rawTable = hasRawElTable(context.template) && !hasBaseTable(context.template);
  const ignored = hasIgnoreMarker(context.fullSource, "R3") || context.exempt.isExempt(context.page.dir, "R3");
  if (rawTable && !ignored) pushIssue(context, "error", "R3", "页面使用 <el-table> 但未使用 <BaseTable>（应使用平台组件）");
}

function collectPageCids(context) {
  const pageCids = new Set();
  for (const fileName of ["index.vue", "data.ts"]) {
    const filePath = path.join(context.absDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    for (const cid of extractCidsFromContent(fs.readFileSync(filePath, "utf-8"))) pageCids.add(cid);
  }
  for (const cid of pageCids) {
    if (!context.globalCidMap.has(cid)) context.globalCidMap.set(cid, new Set());
    context.globalCidMap.get(cid).add(context.page.dir);
  }
}

function checkListHook(context) {
  if (!context.page.names.has("data.ts") || !context.isList) return;
  if (!context.dataContent.trim() || !/AbstractPageQueryHook/.test(context.dataContent)) {
    pushIssue(context, "warn", "R5", "列表型页面 data.ts 未使用 AbstractPageQueryHook（确认是否有充分理由）");
  }
}

function containsUnsafeEvaluation(content) {
  return /\beval\s*\(/.test(content) || /new\s+Function\s*\(/.test(content);
}

function checkDataSecurity(context) {
  if (!context.dataContent) return;
  const clean = stripCommentsAndStrings(context.dataContent);
  const axios = extractScriptInfo(context.dataContent).sources.includes("axios") || /require\s*\(\s*["']axios["']\s*\)/.test(clean);
  if (axios) pushIssue(context, "error", "R6", "data.ts 中禁止直接 import axios（使用 getAction/postAction）");
  if (containsUnsafeEvaluation(clean)) pushIssue(context, "error", "R7", "data.ts 中禁止使用 eval / new Function（安全风险）");
}

function checkPageEvaluation(context) {
  if (context.scriptContent && containsUnsafeEvaluation(stripCommentsAndStrings(context.scriptContent))) {
    pushIssue(context, "error", "R7", "index.vue 中禁止使用 eval / new Function（安全风险）");
  }
}

function extractApiUrls(content) {
  return [...content.matchAll(/\/[a-z][a-z0-9_-]*(?:\/[a-zA-Z0-9_-]+)+/g)].map((match) => match[0]);
}

function validateEmbeddedContract(context, source) {
  try {
    const contract = JSON.parse(source);
    const validation = validateApiContract(contract, { strict: context.strict });
    for (const item of validation.errors) pushIssue(context, "error", "R9", `${item.code} ${item.location}: ${item.message}`);
    for (const item of validation.warnings) pushIssue(context, "warn", "R9", `${item.code} ${item.location}: ${item.message}`);
  } catch (error) {
    pushIssue(context, "error", "R9", `机器契约 JSON 解析失败：${error.message}`);
  }
}

function checkEmbeddedContract(context, apiMdContent) {
  const contractMatches = [
    ...apiMdContent.matchAll(/```(?:wl-api-contract|wl-backend-contract)\s*\r?\n([\s\S]*?)\r?\n```/g),
  ];
  if (contractMatches.length > 1) {
    pushIssue(context, "error", "R9", "api.md 只能包含一个 WL 机器契约块");
    return;
  }
  if (contractMatches.length === 1) {
    validateEmbeddedContract(context, contractMatches[0][1]);
    return;
  }
  if (context.strict) pushIssue(context, "error", "R9", "严格模式要求 api.md 包含 wl-api-contract 机器块");
}

function checkApiUrlCoverage(context, apiMdContent) {
  const apiUrls = extractApiUrls(apiMdContent);
  const dataUrls = [...context.dataContent.matchAll(/["'](\/[a-z][a-z0-9_-]*(?:\/[a-zA-Z0-9_-]+)+)["']/g)].map((match) => match[1]);
  const missing = dataUrls.filter((url) => !apiUrls.includes(url));
  if (missing.length === 0 || hasIgnoreMarker(apiMdContent, "R9")) return;
  pushIssue(context, "warn", "R9", `api.md 缺少接口定义：${missing.slice(0, 3).join(", ")}${missing.length > 3 ? " 等" : ""}`);
}

function checkApiContract(context) {
  if (!context.dataContent || !/API_CONFIG/.test(context.dataContent)) return;
  if (!context.page.names.has("api.md")) return;
  const apiMdContent = fs.readFileSync(path.join(context.absDir, "api.md"), "utf-8");
  checkEmbeddedContract(context, apiMdContent);
  checkApiUrlCoverage(context, apiMdContent);
}

function checkPlatformComponents(context) {
  const ignored = hasIgnoreMarker(context.fullSource, "R10") || context.exempt.isExempt(context.page.dir, "R10");
  if (ignored) return;
  for (const { tag, replace } of FORBIDDEN_NATIVE_COMPONENTS) {
    if (new RegExp(`<${tag}[\\s>]`).test(context.template)) {
      pushIssue(context, "error", "R10", `页面使用 <${tag}> 应替换为 ${replace}（standard 13 平台组件合规）`);
    }
  }
}

function checkStoreImport(context) {
  if (!context.dataContent || hasIgnoreMarker(context.fullSource, "R11")) return;
  const info = extractScriptInfo(context.dataContent);
  const imported = info.specifiers.some((name) => /Store$/.test(name)) || info.sources.some((source) => /pinia|stores?\//.test(source));
  if (imported) pushIssue(context, "error", "R11", "data.ts 中禁止 import Pinia Store（标准 10：Store 不应出现在页面逻辑层）");
}

function checkHardcodedEndpoints(context) {
  const fullContent = context.scriptContent + context.dataContent;
  if (!fullContent || hasIgnoreMarker(context.fullSource, "R12")) return;
  const cleaned = stripCommentsAndStrings(fullContent);
  const ipMatch = cleaned.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+\b/);
  if (ipMatch) pushIssue(context, "error", "R12", `检测到硬编码 IP 地址 ${ipMatch[0]}（standard 07：使用环境变量配置）`);
  const httpMatch = cleaned.match(/["'](https?:\/\/(?!localhost)[^"']+)["']/);
  if (httpMatch) pushIssue(context, "warn", "R12", `检测到硬编码 URL ${httpMatch[1]}（standard 07：建议使用环境变量）`);
}

function inspectPage(context) {
  checkPageScriptSize(context);
  checkR13Complexity(context.scriptContent, context.dataPath, context.page.dir, context.fullSource, context.issues);
  checkPageImports(context);
  checkRawTable(context);
  collectPageCids(context);
  checkListHook(context);
  checkDataSecurity(context);
  checkPageEvaluation(context);
  checkR8FileSeparation(context.scriptContent, context.effectiveLines, context.page.names.has("data.ts"), context.page.dir, context.fullSource, context.issues);
  checkApiContract(context);
  checkPlatformComponents(context);
  checkStoreImport(context);
  checkHardcodedEndpoints(context);
}

function appendDuplicateCidIssues(globalCidMap, issues) {
  for (const [cid, dirs] of globalCidMap.entries()) {
    if (dirs.size <= 1) continue;
    const dirArray = [...dirs];
    issues.push({ level: "error", dir: dirArray.join(" | "), text: `cid "${cid}" 在 ${dirArray.length} 个页面中重复使用`, rule: "R4" });
  }
}

function runAstRules(targetDir, scanRel, options = {}) {
  if (!isAstFunctionallyUsable()) return astUnavailableResult(scanRel);
  const pages = collectPageDirectories(targetDir, scanRel);
  const issues = [];
  const globalCidMap = new Map();
  const exempt = loadExemptions(targetDir);
  for (const warning of exempt.warnings) issues.push({ level: "warn", dir: ".", text: warning, rule: "EXEMPT" });
  const stagedFilter = options.stagedFiles ? new Set(options.stagedFiles.map((file) => file.replace(/\\/g, "/"))) : null;
  const shared = { issues, globalCidMap, exempt, strict: options.strict === true };
  for (const page of pages) {
    if (!includesStagedPage(stagedFilter, page.dir)) continue;
    const context = createPageContext(targetDir, page, shared);
    if (context) inspectPage(context);
  }
  appendDuplicateCidIssues(globalCidMap, issues);
  return { issues, pages: pages.length, astAvailable: true };
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
      .filter((f) => f && (/\.(vue|ts)$/.test(f) || /(^|\/)api\.md$/.test(f)));
  } catch {
    return [];
  }
}

// ─── R14 类型错误零容忍（项目级，vue-tsc / tsc 委托）──────────────────
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
  return { issues: [{ level: "warn", dir: label, text, rule: "R14" }], ran: false, errorCount: 0 };
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
    if (errors.length >= CONFIG.TYPECHECK_ERROR_CAP) break;
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
      text: `${checker} --noEmit 退出码 ${result.status}${detail}`, rule: "R14" }],
    ran: true,
    errorCount: configError ? 0 : 1,
  };
}

function formatTypeIssues(root, errors) {
  return errors.map((error) => {
    const rel = path.relative(root, error.file).replace(/\\/g, "/") || error.file;
    return {
      level: "error",
      dir: path.dirname(rel) || ".",
      text: `${error.code} ${error.msg} (${path.basename(rel)}:${error.line})`,
      rule: "R14",
    };
  });
}

function runTypeCheck(root) {
  const safeRoot = root || process.cwd();
  const label = path.basename(safeRoot) || ".";
  if (!fs.existsSync(path.join(safeRoot, "tsconfig.json"))) {
    return typeCheckSkipped(label, "未发现 tsconfig.json，跳过类型检查 R14");
  }
  const env = typeCheckerEnvironment(safeRoot);
  const checker = findTypeChecker(safeRoot, env);
  if (!checker) {
    return typeCheckSkipped(label, "未发现 vue-tsc / tsc，跳过类型检查 R14（建议安装后纳入 CI）");
  }
  const execution = executeTypeChecker(checker, safeRoot, env);
  if (!execution.ok) return typeCheckSkipped(label, `类型检查执行异常：${execution.error}`);
  const { result } = execution;
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const errors = parseTypeErrors(output);
  if (errors.length === 0) return unparsedTypeCheckResult(checker, result, output, label);
  return { issues: formatTypeIssues(safeRoot, errors), ran: true, errorCount: errors.length };
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
  isLikelyListPage,
  isListTypePage,
  hasIgnoreMarker,
  CONFIG,
};

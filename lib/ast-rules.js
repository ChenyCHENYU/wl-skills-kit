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

  // 优先从 kit 自身 node_modules 解析（开发/测试环境）
  const tryPaths = [
    // 1. kit 自身 node_modules（标准 require 解析）
    null,
    // 2. 调用方项目（CWD）的 node_modules — 业务项目通过 npx/node 运行时
    //    kit 本身没装 @vue/compiler-sfc，但业务项目有
  ];

  // 尝试标准 require（从 kit 目录解析）
  try {
    _compilerSfc = require("@vue/compiler-sfc");
  } catch {
    _compilerSfc = null;
  }
  try {
    _babelParser = require("@babel/parser");
  } catch {
    _babelParser = null;
  }

  // 如果标准 require 失败，尝试从 CWD（业务项目根目录）解析
  if (!_compilerSfc || !_babelParser) {
    const cwd = process.env.WL_PROJECT_ROOT || process.cwd();
    try {
      const createRequire = require("module").createRequire;
      const cwdRequire = createRequire(cwd + "/package.json");
      if (!_compilerSfc) {
        try { _compilerSfc = cwdRequire("@vue/compiler-sfc"); } catch {}
      }
      if (!_babelParser) {
        try { _babelParser = cwdRequire("@babel/parser"); } catch {}
      }
    } catch {
      // createRequire 不可用（极旧 Node），忽略
    }
  }

  return _compilerSfc && _babelParser;
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
 * 标记必须带规则编号（R1~R7），精确豁免，不是全局豁免。
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
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    warnings.push(
      CONFIG.EXEMPT_CONFIG_NAME +
        " 解析失败，已忽略（" +
        ((e && e.message) || String(e)) +
        "）",
    );
    return { isExempt: () => false, source: configPath, warnings };
  }
  const list = Array.isArray(raw.exemptions) ? raw.exemptions : [];
  // 预编译：每个 path 规范化为前缀，每个 entry 的 rules 转大写 Set
  const compiled = [];
  for (const entry of list) {
    if (!entry || !Array.isArray(entry.paths) || !Array.isArray(entry.rules)) {
      continue;
    }
    const rules = new Set(
      entry.rules.map((r) => String(r).toUpperCase()),
    );
    for (let p of entry.paths) {
      p = String(p).replace(/\\/g, "/").replace(/\/+$/, "");
      if (p.endsWith("/**")) p = p.slice(0, -3);
      if (p.endsWith("/*")) p = p.slice(0, -2);
      compiled.push({ prefix: p, rules });
    }
  }
  function isExempt(pageDir, rule) {
    if (!pageDir || !rule) return false;
    const dir = String(pageDir).replace(/\\/g, "/");
    const r = String(rule).toUpperCase();
    for (const c of compiled) {
      if (
        (c.rules.has(r)) &&
        (dir === c.prefix || dir.startsWith(c.prefix + "/"))
      ) {
        return true;
      }
    }
    return false;
  }
  return { isExempt, source: configPath, warnings };
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
  let descriptor;
  try {
    const result = _compilerSfc.parse(source, { filename: absPath });
    descriptor = result.descriptor;
  } catch {
    return null;
  }
  if (!descriptor) return null;
  const scriptContent =
    descriptor.scriptSetup && descriptor.scriptSetup.content
      ? descriptor.scriptSetup.content
      : descriptor.script && descriptor.script.content
        ? descriptor.script.content
        : "";
  const template =
    descriptor.template && descriptor.template.content
      ? descriptor.template.content
      : "";
  return { content: scriptContent, template, source };
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
    for (const spec of node.specifiers) {
      if (spec.type === "ImportSpecifier") {
        specifiers.push(spec.imported.name || spec.local.name);
      } else if (spec.type === "ImportDefaultSpecifier") {
        specifiers.push(spec.local.name);
      } else if (spec.type === "ImportNamespaceSpecifier") {
        specifiers.push(spec.local.name);
      }
    }
  }
  return { specifiers, sources };
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
    if (key === "loc" || key === "range" || key === "start" || key === "end") {
      continue;
    }
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c.type === "string") out.push(c);
      }
    } else if (child && typeof child.type === "string") {
      out.push(child);
    }
  }
  return out;
}

// 尽力推断函数名（变量赋值 / 类方法 / 对象方法 / 命名函数表达式）
function resolveFnName(node, parent) {
  if (node.id && node.id.name) return node.id.name;
  if (!parent) return "(anonymous)";
  if (parent.type === "VariableDeclarator" && parent.id && parent.id.name) {
    return parent.id.name;
  }
  if (
    (parent.type === "MethodDefinition" || parent.type === "Property") &&
    parent.key
  ) {
    return parent.key.name || parent.key.value || "(anonymous)";
  }
  if (parent.type === "AssignmentExpression" && parent.left) {
    const left = parent.left;
    if (left.property) return left.property.name || left.property.value;
    if (left.name) return left.name;
  }
  return "(anonymous)";
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

// ─── 主检测函数 ────────────────────────────────────────────────────────

/**
 * @param {string} targetDir 项目根目录绝对路径
 * @param {string} scanRel   扫描相对路径（默认 src/views）
 * @param {object} options   { stagedFiles?: string[] } 限制只检测 staged 文件
 * @returns { issues: Array<{level,dir,text,rule}>, pages: number }
 */
function runAstRules(targetDir, scanRel, options) {
  options = options || {};
  const stagedFilter = options.stagedFiles
    ? new Set(options.stagedFiles.map((f) => f.replace(/\\/g, "/")))
    : null;
  const scanDir = path.join(targetDir, scanRel || "src/views");

  const astOk = isAstFunctionallyUsable();
  if (!astOk) {
    return {
      issues: [
        {
          level: "warn",
          dir: scanRel || "src/views",
          text: "AST 引擎不可用（@vue/compiler-sfc 未安装或版本不兼容），跳过语义级规则检测。建议 pnpm install 后重试。",
          rule: "AST",
        },
      ],
      pages: 0,
      astAvailable: false,
    };
  }

  // 收集页面目录
  const allFiles = walkDir(scanDir, targetDir);
  const dirMap = new Map();
  for (const f of allFiles) {
    const dir = path.dirname(f.rel);
    if (!dirMap.has(dir)) dirMap.set(dir, new Set());
    dirMap.get(dir).add(f.rel.split("/").pop());
  }
  const pages = [];
  for (const [dir, names] of dirMap.entries()) {
    if (!names.has("index.vue")) continue;
    if (
      CONFIG.SKIP_DIRS.some(
        (s) => dir.includes("/" + s + "/") || dir.startsWith(s + "/"),
      )
    )
      continue;
    pages.push({ dir, names });
  }
  pages.sort((a, b) => a.dir.localeCompare(b.dir));

  const issues = [];
  const globalCidMap = new Map(); // cid → Set<pageDir>

  // 项目级豁免配置（零功能影响，无配置文件时返回空豁免）
  const exempt = loadExemptions(targetDir);
  for (const w of exempt.warnings) {
    issues.push({ level: "warn", dir: ".", text: w, rule: "EXEMPT" });
  }

  for (const page of pages) {
    const absDir = path.join(targetDir, page.dir);

    // 如果有 staged 过滤，只检测包含 staged 文件的目录
    if (stagedFilter) {
      const hasStaged = Array.from(stagedFilter).some((f) =>
        f.startsWith(page.dir + "/") || f === page.dir + "/index.vue",
      );
      if (!hasStaged) continue;
    }

    const vuePath = path.join(absDir, "index.vue");
    const dataPath = path.join(absDir, "data.ts");

    const parsed = parseVueScript(vuePath);
    if (!parsed) continue;
    const { content: scriptContent, template, source: fullSource } = parsed;

    // R1: script setup 业务逻辑行数（根据页面类型使用不同阈值）
    const effectiveLines = countEffectiveLines(scriptContent);
    const isList = isLikelyListPage(template);
    const threshold = isList
      ? CONFIG.SCRIPT_LINE_THRESHOLD_LIST
      : CONFIG.SCRIPT_LINE_THRESHOLD_OTHER;
    if (effectiveLines > threshold) {
      issues.push({
        level: "warn",
        dir: page.dir,
        text:
          "index.vue <script> 业务逻辑 " +
          effectiveLines +
          " 行（" + (isList ? "列表页" : "非列表页") +
          " 阈值 " + threshold + "），应迁移至 data.ts",
        rule: "R1",
      });
    }

    // R13: 单函数圈复杂度 ≤ MAX_CYCLOMATIC_COMPLEXITY（standard 04，Mcabe）
    //     覆盖 index.vue <script> 与 data.ts 的所有函数/方法/箭头函数
    if (!hasIgnoreMarker(fullSource, "R13")) {
      const maxC = CONFIG.MAX_CYCLOMATIC_COMPLEXITY;
      const scanComplexity = (code, label) => {
        const ast = parseScriptAst(code);
        if (!ast) return;
        for (const fn of collectFunctions(ast)) {
          const cc = computeFunctionComplexity(fn.node);
          if (cc > maxC) {
            issues.push({
              level: "error",
              dir: page.dir,
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

    // R2: 禁止的 import / 全局 API
    if (scriptContent) {
      const { specifiers, sources } = extractScriptInfo(scriptContent);

      for (const name of CONFIG.FORBIDDEN_IMPORTS) {
        if (
          (specifiers.includes(name) ||
            new RegExp("\\b" + name + "\\s*\\(").test(scriptContent)) &&
          !hasIgnoreMarker(fullSource, "R2")
        ) {
          issues.push({
            level: "error",
            dir: page.dir,
            text:
              "index.vue 中禁止使用 " +
              name +
              "（应在 data.ts 中调用）",
            rule: "R2",
          });
        }
      }

      for (const name of CONFIG.FORBIDDEN_GLOBALS) {
        // 在去除注释/字符串后的代码中检测，避免误报
        const codeOnly = stripCommentsAndStrings(scriptContent);
        if (
          new RegExp("\\b" + name + "\\b").test(codeOnly) &&
          !hasIgnoreMarker(fullSource, "R2")
        ) {
          issues.push({
            level: "error",
            dir: page.dir,
            text:
              "index.vue 中禁止直接使用 " +
              name +
              "（应在 data.ts 中处理）",
            rule: "R2",
          });
        }
      }

      for (const name of CONFIG.WARN_IMPORTS) {
        if (specifiers.includes(name)) {
          issues.push({
            level: "warn",
            dir: page.dir,
            text:
              "index.vue 中使用了 " +
              name +
              "（读取路由参数应在 data.ts 中处理）",
            rule: "R2",
          });
        }
      }

      // R6: 直接 import axios
      if (sources.some((s) => s === "axios")) {
        issues.push({
          level: "error",
          dir: page.dir,
          text: "index.vue 中禁止直接 import axios（使用 getAction/postAction）",
          rule: "R6",
        });
      }
    }

    // R3: el-table 但未用 BaseTable（检查注释豁免 + 配置豁免）
    if (
      hasRawElTable(template) &&
      !hasBaseTable(template) &&
      !hasIgnoreMarker(fullSource, "R3") &&
      !exempt.isExempt(page.dir, "R3")
    ) {
      issues.push({
        level: "error",
        dir: page.dir,
        text: "页面使用 <el-table> 但未使用 <BaseTable>（应使用平台组件）",
        rule: "R3",
      });
    }

    // R4: cid 收集（全局去重）— 每个页面只记一次
    const pageCids = new Set();
    for (const fname of ["index.vue", "data.ts"]) {
      const fpath = path.join(absDir, fname);
      if (!fs.existsSync(fpath)) continue;
      const content = fs.readFileSync(fpath, "utf-8");
      for (const cid of extractCidsFromContent(content)) {
        pageCids.add(cid);
      }
    }
    for (const cid of pageCids) {
      if (!globalCidMap.has(cid)) globalCidMap.set(cid, new Set());
      globalCidMap.get(cid).add(page.dir);
    }

    // R5: 纯列表型页面未用 AbstractPageQueryHook
    // 注意：只用 isLikelyListPage（精确判断），不用 isListTypePage（误报非列表页）
    if (page.names.has("data.ts") && isLikelyListPage(template)) {
      const dc = fs.existsSync(dataPath)
        ? fs.readFileSync(dataPath, "utf-8")
        : "";
      // 空 data.ts 或无 AbstractPageQueryHook 都需要警告
      if (!dc.trim() || !/AbstractPageQueryHook/.test(dc)) {
        issues.push({
          level: "warn",
          dir: page.dir,
          text: "列表型页面 data.ts 未使用 AbstractPageQueryHook（确认是否有充分理由）",
          rule: "R5",
        });
      }
    }

    // R6/R7: data.ts 检查 axios / eval / new Function
    if (fs.existsSync(dataPath)) {
      const dc = fs.readFileSync(dataPath, "utf-8");
      const dcClean = stripCommentsAndStrings(dc);
      // axios: AST import source 或 require 调用
      const { sources: dcSources } = extractScriptInfo(dc);
      if (
        dcSources.some((s) => s === "axios") ||
        /require\s*\(\s*["']axios["']\s*\)/.test(dcClean)
      ) {
        issues.push({
          level: "error",
          dir: page.dir,
          text: "data.ts 中禁止直接 import axios（使用 getAction/postAction）",
          rule: "R6",
        });
      }
      if (/\beval\s*\(/.test(dcClean) || /new\s+Function\s*\(/.test(dcClean)) {
        issues.push({
          level: "error",
          dir: page.dir,
          text: "data.ts 中禁止使用 eval / new Function（安全风险）",
          rule: "R7",
        });
      }
    }

    // R7: index.vue 检查 eval / new Function
    if (scriptContent) {
      const scClean = stripCommentsAndStrings(scriptContent);
      if (/\beval\s*\(/.test(scClean) || /new\s+Function\s*\(/.test(scClean)) {
        issues.push({
          level: "error",
          dir: page.dir,
          text: "index.vue 中禁止使用 eval / new Function（安全风险）",
          rule: "R7",
        });
      }
    }

    // R8: 强制 3 文件分离 — 有 API 调用/大量逻辑但无 data.ts
    // 任何页面（不分类型）只要有接口调用或超过阈值行数，就应该拆出 data.ts
    {
      const hasApiCall = /getAction|postAction|putAction|deleteAction|API_CONFIG/.test(
        stripCommentsAndStrings(scriptContent),
      );
      const hasScss = page.names.has("index.scss");
      if (!page.names.has("data.ts")) {
        if (hasApiCall && !hasIgnoreMarker(fullSource, "R8")) {
          issues.push({
            level: "error",
            dir: page.dir,
            text: "页面有接口调用但缺 data.ts（业务逻辑必须在 data.ts 中）",
            rule: "R8",
          });
        } else if (effectiveLines > 20 && !hasIgnoreMarker(fullSource, "R8")) {
          issues.push({
            level: "warn",
            dir: page.dir,
            text: "index.vue 有 " + effectiveLines + " 行逻辑但无 data.ts（建议拆分）",
            rule: "R8",
          });
        }
      }
      // 有 data.ts 但 index.vue 仍然有 API 调用（逻辑泄漏）
      if (page.names.has("data.ts") && hasApiCall && !hasIgnoreMarker(fullSource, "R8")) {
        issues.push({
          level: "error",
          dir: page.dir,
          text: "有 data.ts 但 index.vue 中仍含 API 调用（逻辑应全部在 data.ts）",
          rule: "R8",
        });
      }
    }

    // R9: api.md 质量检测 — 有 API_CONFIG 时检查 api.md 结构完整性
    if (page.names.has("data.ts")) {
      const dc = fs.existsSync(dataPath)
        ? fs.readFileSync(dataPath, "utf-8")
        : "";
      const hasApiConfig = /API_CONFIG/.test(dc);
      if (hasApiConfig && page.names.has("api.md")) {
        const apiMdPath = path.join(absDir, "api.md");
        const apiMdContent = fs.readFileSync(apiMdPath, "utf-8");
        // 检查 api.md 是否有接口列表表格（核心结构）
        const hasInterfaceTable = /\|\s*操作\s*\|.*\|\s*Method\s*\||\|\s*操作\s*\|.*\|\s*URL\s*\|/.test(apiMdContent);
        // 检查 api.md 是否有实体定义
        const hasEntityDef = /字段|实体|Entity|字段名/.test(apiMdContent);
        // 检查 api.md 中的 URL 是否与 data.ts API_CONFIG 一致
        // 正则匹配 URL 路径：支持多段、数字、连字符、下划线
        // 例：/mdata/mdataModel/list /api/v2/customer-archive/save /sys/user_role/list
        const URL_REGEX = /\/[a-z][a-z0-9_-]*(?:\/[a-zA-Z0-9_-]+)+/g;
        const apiMdUrls = Array.from(apiMdContent.matchAll(URL_REGEX)).map((m) => m[0]);
        const dataTsUrls = Array.from(dc.matchAll(/["'](\/[a-z][a-z0-9_-]*(?:\/[a-zA-Z0-9_-]+)+)["']/g)).map((m) => m[1]);
        // data.ts 中的 URL 必须在 api.md 中能找到完全匹配
        const dataUrlsNotInApi = dataTsUrls.filter((u) => !apiMdUrls.includes(u));
        if (dataUrlsNotInApi.length > 0 && !hasIgnoreMarker(apiMdContent, "R9")) {
          issues.push({
            level: "warn",
            dir: page.dir,
            text: "api.md 缺少接口定义：" + dataUrlsNotInApi.slice(0, 3).join(", ") + (dataUrlsNotInApi.length > 3 ? " 等" : ""),
            rule: "R9",
          });
        }
      }
    }

    // R10: 平台组件替换检测 — 业务页面禁止用 el-* 原生组件替代平台封装
    // 对应 standard 13（🔴必遵+阻断），原覆盖率仅 16%，R10 补齐核心替换规则
    // 豁免：组件内部（src/components/）允许使用 el-*；有 wl-skills:ignore R10 标记
    {
      const FORBIDDEN_NATIVE_COMPONENTS = [
        { tag: "el-form", replace: "BaseQuery（查询区）或 c_formModal（弹窗表单）", min: "el-form" },
        { tag: "el-pagination", replace: "jh-pagination", min: "el-pagination" },
        { tag: "el-date-picker", replace: "jh-date / jh-date-range", min: "el-date-picker" },
        { tag: "el-select", replace: "jh-select（dict 属性自动加载字典）", min: "el-select" },
        { tag: "el-tree", replace: "C_Tree", min: "el-tree" },
        { tag: "el-upload", replace: "jh-file-upload", min: "el-upload" },
      ];
      for (const { tag, replace } of FORBIDDEN_NATIVE_COMPONENTS) {
        const tagRegex = new RegExp("<" + tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s>]");
        if (
          tagRegex.test(template) &&
          !hasIgnoreMarker(fullSource, "R10") &&
          !exempt.isExempt(page.dir, "R10")
        ) {
          issues.push({
            level: "error",
            dir: page.dir,
            text: "页面使用 <" + tag + "> 应替换为 " + replace + "（standard 13 平台组件合规）",
            rule: "R10",
          });
        }
      }
    }

    // R11: data.ts 禁止 import Store (Pinia) — 对应 standard 10.3
    {
      if (fs.existsSync(dataPath) && !hasIgnoreMarker(fullSource, "R11")) {
        const dc = fs.readFileSync(dataPath, "utf-8");
        const dcInfo = extractScriptInfo(dc);
        // 检测 Pinia Store 导入
        const hasStoreImport =
          dcInfo.specifiers.some((s) => /Store$/.test(s)) ||
          dcInfo.sources.some((s) => /pinia|stores?\//.test(s));
        if (hasStoreImport) {
          issues.push({
            level: "error",
            dir: page.dir,
            text: "data.ts 中禁止 import Pinia Store（标准 10：Store 不应出现在页面逻辑层）",
            rule: "R11",
          });
        }
      }
    }

    // R12: 硬编码 IP / http:// 检测 — 对应 standard 07.4/07.5
    {
      const fullContent = scriptContent + (fs.existsSync(dataPath)
        ? fs.readFileSync(dataPath, "utf-8")
        : "");
      if (fullContent && !hasIgnoreMarker(fullSource, "R12")) {
        const cleaned = stripCommentsAndStrings(fullContent);
        // 检测硬编码 IP 地址
        const ipMatch = cleaned.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+\b/);
        if (ipMatch) {
          issues.push({
            level: "error",
            dir: page.dir,
            text: "检测到硬编码 IP 地址 " + ipMatch[0] + "（standard 07：使用环境变量配置）",
            rule: "R12",
          });
        }
        // 检测硬编码 http:// 域名（排除 localhost 和注释）
        const httpMatch = cleaned.match(/["'](https?:\/\/(?!localhost)[^"']+)["']/);
        if (httpMatch) {
          issues.push({
            level: "warn",
            dir: page.dir,
            text: "检测到硬编码 URL " + httpMatch[1] + "（standard 07：建议使用环境变量）",
            rule: "R12",
          });
        }
      }
    }
  }

  // R4 后处理：收集重复 cid（用 Set.size 而非 array.length）
  for (const [cid, dirs] of globalCidMap.entries()) {
    if (dirs.size > 1) {
      const dirArray = Array.from(dirs);
      issues.push({
        level: "error",
        dir: dirArray.join(" | "),
        text: 'cid "' + cid + '" 在 ' + dirArray.length + " 个页面中重复使用",
        rule: "R4",
      });
    }
  }

  return { issues, pages: pages.length, astAvailable: true };
}

/**
 * 获取 git staged 文件列表（.vue/.ts）
 * @param {string} targetDir
 * @returns {string[]} 相对路径数组
 */
function getStagedFiles(targetDir) {
  try {
    const output = execFileSync(
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
      { cwd: targetDir, encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024 },
    );
    return output
      .trim()
      .split("\n")
      .filter((f) => f && /\.(vue|ts)$/.test(f));
  } catch {
    return [];
  }
}

// ─── R14 类型错误零容忍（项目级，vue-tsc / tsc 委托）──────────────────
//
// 体积较大，validate 默认不触发，由 CLI --typecheck / MCP typecheck:true 显式开启。
// 无 tsconfig / 无 checker → 优雅降级为 warn（与 AST 依赖降级策略一致）。
// 该函数不进入 page 粒度，整项目执行一次，结果按文件归并到 issues。

function runTypeCheck(root) {
  const safeRoot = root || process.cwd();
  const label = path.basename(safeRoot) || ".";
  const tsconfigPath = path.join(safeRoot, "tsconfig.json");

  if (!fs.existsSync(tsconfigPath)) {
    return {
      issues: [
        {
          level: "warn",
          dir: label,
          text: "未发现 tsconfig.json，跳过类型检查 R14",
          rule: "R14",
        },
      ],
      ran: false,
      errorCount: 0,
    };
  }

  const nmBin = path.join(safeRoot, "node_modules", ".bin");
  const envPath =
    nmBin + path.delimiter + (process.env.PATH || process.env.Path || "");
  const env = Object.assign({}, process.env, { PATH: envPath });

  // 优先 vue-tsc（.vue 项目），回退 tsc；shell:true 让 Windows 找到 .cmd
  let checker = null;
  for (const bin of ["vue-tsc", "tsc"]) {
    try {
      const probe = spawnSync(bin, ["--version"], {
        shell: true,
        env,
        encoding: "utf8",
        timeout: 20000,
      });
      if (probe.status === 0) {
        checker = bin;
        break;
      }
    } catch {
      // ignore, try next
    }
  }
  if (!checker) {
    return {
      issues: [
        {
          level: "warn",
          dir: label,
          text: "未发现 vue-tsc / tsc，跳过类型检查 R14（建议安装后纳入 CI）",
          rule: "R14",
        },
      ],
      ran: false,
      errorCount: 0,
    };
  }

  let result;
  try {
    result = spawnSync(checker, ["--noEmit"], {
      cwd: safeRoot,
      shell: true,
      env,
      encoding: "utf8",
      timeout: 180000,
    });
  } catch (e) {
    return {
      issues: [
        {
          level: "warn",
          dir: label,
          text:
            "类型检查执行异常：" + ((e && e.message) || String(e)),
          rule: "R14",
        },
      ],
      ran: false,
      errorCount: 0,
    };
  }

  const out =
    String(result.stdout || "") + String(result.stderr || "");
  // 标准格式：path(line,col): error TS1234: message
  // 捕获组：1=file 2=line 3=col 4=code 5=msg
  const errRe = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s*(.+)$/gm;
  const errors = [];
  let m;
  while ((m = errRe.exec(out)) !== null) {
    errors.push({ file: m[1], line: m[2], code: m[4], msg: m[5] });
    if (errors.length >= CONFIG.TYPECHECK_ERROR_CAP) break;
  }

  if (errors.length === 0) {
    if (result.status === 0) {
      return { issues: [], ran: true, errorCount: 0 };
    }
    // 退出码非 0 但未解析出标准 error 行：疑似 tsconfig / 配置级错误
    return {
      issues: [
        {
          level: "error",
          dir: label,
          text:
            checker +
            " --noEmit 退出码 " +
            result.status +
            "（请检查 tsconfig / 类型配置，无标准 TS 错误输出）",
          rule: "R14",
        },
      ],
      ran: true,
      errorCount: 1,
    };
  }

  const issues = errors.map((e) => {
    const rel = path.relative(safeRoot, e.file).replace(/\\/g, "/") || e.file;
    return {
      level: "error",
      dir: path.dirname(rel) || ".",
      text:
        e.code + " " + e.msg + " (" + path.basename(rel) + ":" + e.line + ")",
      rule: "R14",
    };
  });
  return { issues, ran: true, errorCount: errors.length };
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

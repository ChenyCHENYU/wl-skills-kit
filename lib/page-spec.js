"use strict";

/**
 * lib/page-spec.js — page-spec 落盘 + spec-align 确定性比对引擎
 *
 * 解决的核心问题：
 *   page-codegen / spec-doc-parse / prototype-scan 的"精准实现"约定
 *   （查询字段顺序、表格列顺序、按钮顺序与颜色、操作列严格对应、按钮文字保真）
 *   过去只活在对话上下文里，没有机器可比对的真值，validate 无法验证"是否按约定实现"。
 *
 * 本模块把 page-spec 固化为页面目录下的 `page-spec.json`（单一真值），
 * 再用 AST/括号匹配解析 data.ts 的 queryDef/columnsDef/toolbarDef，
 * 与 page-spec 做确定性比对，输出 S1~S5 偏差：
 *   S1: 查询字段顺序不一致（query）           → warn
 *   S2: 表格列顺序/集合不一致（columns）       → error
 *   S3: 工具栏按钮顺序/集合/颜色不一致（toolbar）→ error
 *   S4: 操作列按钮集合不一致（operations）      → error
 *   S5: 按钮/列 label 文字与原型不保真          → warn
 *
 * 设计原则：
 *   - 找不到 page-spec.json 时静默跳过（不是所有页面都有 spec）
 *   - 解析失败降级为 info 提示，不误报阻断
 *   - 仅做"约定 vs 代码"的确定性核对，不做语义推断
 */

const fs = require("fs");
const path = require("path");

// ─── page-spec JSON Schema（文档 + 运行时校验依据）────────────────────────
//
// {
//   "page": "客户档案",                 // 页面中文名
//   "dir": "src/views/mdata/customer", // 页面目录（相对项目根）
//   "mode": "LIST",                     // 交互模式
//   "query":   [{ "name": "code", "label": "客户编码" }, ...],   // 查询字段（左→右、上→下）
//   "columns": [{ "name": "code", "label": "客户编码" }, ...],   // 表格列（左→右，selection/index 在前可省略）
//   "toolbar": [{ "label": "新增", "color": "primary", "plain": false }, ...], // 工具栏按钮（左→右）
//   "operations": [{ "label": "编辑" }, { "label": "删除" }]     // 操作列按钮
// }
//
// color 取值：primary / danger / warning / success / default

const SPEC_FILENAME = "page-spec.json";

const VALID_COLORS = new Set([
  "primary",
  "danger",
  "warning",
  "success",
  "default",
]);

/**
 * 在页面目录中查找 page-spec.json
 * @returns {string|null} 绝对路径
 */
function findPageSpecPath(absDir) {
  const p = path.join(absDir, SPEC_FILENAME);
  return fs.existsSync(p) ? p : null;
}

/**
 * 读取并解析 page-spec.json
 * @returns {{ spec: object|null, error: string|null }}
 */
function readPageSpec(absDir) {
  const p = findPageSpecPath(absDir);
  if (!p) return { spec: null, error: null };
  try {
    const spec = JSON.parse(fs.readFileSync(p, "utf8"));
    return { spec, error: null };
  } catch (e) {
    return { spec: null, error: "page-spec.json 解析失败：" + e.message };
  }
}

/**
 * 校验 page-spec 结构合法性（写入前/读取后均可调用）
 * @returns {string[]} 错误列表（空数组 = 合法）
 */
function validateSpecShape(spec) {
  if (!spec || typeof spec !== "object") {
    return ["page-spec 不是合法对象"];
  }
  const errs = [];
  if (!spec.page || typeof spec.page !== "string") {
    errs.push("缺少 page（页面中文名）");
  }
  validateArrayFields(spec, errs);
  validateToolbarColors(spec.toolbar, errs);
  return errs;
}

function validateArrayFields(spec, errs) {
  for (const key of ["query", "columns", "toolbar", "operations"]) {
    if (spec[key] !== undefined && !Array.isArray(spec[key])) {
      errs.push(key + " 必须是数组");
    }
  }
}

function validateToolbarColors(toolbar, errs) {
  for (const btn of toolbar || []) {
    if (!btn || !btn.color || VALID_COLORS.has(btn.color)) continue;
    errs.push(
      '工具栏按钮 "' +
        (btn.label || "?") +
        '" 的 color 非法：' +
        btn.color +
        "（合法值：primary/danger/warning/success/default）",
    );
  }
}

// ─── data.ts 解析：括号匹配提取方法体 ────────────────────────────────────

/**
 * 提取形如 `methodName() { ... }` 或 `methodName(): Type { ... }` 的方法体内容
 * 用括号配平精确截取，避免正则误吞。
 * @returns {string|null}
 */
function extractMethodBody(source, methodName) {
  if (!source) return null;
  // 匹配方法签名起点：methodName ( ... ) ... {
  const sigRe = new RegExp(methodName + "\\s*\\([^)]*\\)[^{]*\\{");
  const m = sigRe.exec(source);
  if (!m) return null;
  const start = m.index + m[0].length; // { 之后
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;
  return source.slice(start, i - 1);
}

/**
 * 去注释/字符串（保留引号结构），用于结构匹配前清洗
 */
function stripNoise(code) {
  if (!code) return "";
  let r = code.replace(/\/\*[\s\S]*?\*\//g, "");
  r = r.replace(/\/\/[^\n]*/g, "");
  return r;
}

/**
 * 从方法体中按出现顺序提取顶层对象的 name 与 label。
 * 仅提取数组元素级别的 name/label（不深入嵌套对象），用顺序保真比对。
 *
 * 返回 [{ name, label }]，顺序即代码顺序。
 */
function extractFieldSequence(methodBody) {
  if (!methodBody) return [];
  const result = [];
  // 以对象起始 `{` 为切分点，逐个对象提取首个 name/label
  // 通过括号配平拆分数组中的顶层对象
  const items = splitTopLevelObjects(methodBody);
  for (const item of items) {
    const nameM = item.match(/(?:^|[\s,{])name\s*:\s*["'`]([^"'`]+)["'`]/);
    const labelM = item.match(/(?:^|[\s,{])label\s*:\s*["'`]([^"'`]+)["'`]/);
    if (nameM || labelM) {
      result.push({
        name: nameM ? nameM[1] : null,
        label: labelM ? labelM[1] : null,
      });
    }
  }
  return result;
}

/**
 * 把方法体内最外层数组中的顶层对象切分出来。
 * 找到第一个 `[`，在其内做括号配平，按逗号在 depth=1 处分割对象。
 */
function splitTopLevelObjects(body) {
  const clean = stripNoise(body);
  const lb = clean.indexOf("[");
  if (lb < 0) return [];
  const arrEnd = findArrayEnd(clean, lb);
  return arrEnd < 0 ? [] : extractTopLevelObjects(clean.slice(lb + 1, arrEnd));
}

function findArrayEnd(clean, start) {
  let depth = 0;
  for (let i = start; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === "[") depth++;
    if (ch !== "]") continue;
    depth--;
    if (depth === 0) return i;
  }
  return -1;
}

function extractTopLevelObjects(arrBody) {
  const objects = [];
  let objDepth = 0;
  let objStart = -1;
  for (let j = 0; j < arrBody.length; j++) {
    const ch = arrBody[j];
    if (ch === "{") {
      if (objDepth === 0) objStart = j;
      objDepth++;
    } else if (ch === "}") {
      objDepth--;
      if (objDepth === 0 && objStart >= 0) {
        objects.push(arrBody.slice(objStart, j + 1));
        objStart = -1;
      }
    }
  }
  return objects;
}

/**
 * 提取工具栏按钮序列（含颜色推断）。
 * 工具栏对象常见结构：{ name: "primary", label: "新增", plain: true, type: "danger" }
 * 颜色来源优先级：type > name（name 既是语义也是颜色）
 */
function extractToolbarSequence(methodBody) {
  if (!methodBody) return [];
  const items = splitTopLevelObjects(methodBody);
  const result = [];
  for (const item of items) {
    const labelM = item.match(/(?:^|[\s,{])label\s*:\s*["'`]([^"'`]+)["'`]/);
    if (!labelM) continue;
    const nameM = item.match(/(?:^|[\s,{])name\s*:\s*["'`]([^"'`]+)["'`]/);
    const typeM = item.match(/(?:^|[\s,{])type\s*:\s*["'`]([^"'`]+)["'`]/);
    const plainM = /(?:^|[\s,{])plain\s*:\s*true/.test(item);
    let color = typeM ? typeM[1] : nameM ? nameM[1] : "default";
    if (!VALID_COLORS.has(color)) color = "default";
    result.push({ label: labelM[1], color, plain: plainM });
  }
  return result;
}

/**
 * 提取操作列按钮序列。
 * 操作列由 renderOps([{ type, label, onClick }]) 渲染，或 operations: [...]
 * label 缺省时按 type 推断中文（edit→编辑 / del|danger→删除 / view→查看）
 */
function extractOperationSequence(dataContent) {
  if (!dataContent) return [];
  const clean = stripNoise(dataContent);
  // 优先匹配 renderOps([...])
  const renderM = /renderOps\s*\(\s*\[/.exec(clean);
  let body = null;
  if (renderM) {
    const start = renderM.index + renderM[0].length - 1; // 指向 [
    body = extractBracketBody(clean, start);
  }
  // 兼容旧写法 operations: [...]，validate 其他规则仍会提示改用 renderOps()
  if (!body) {
    const operationsM = /\boperations\s*:\s*\[/.exec(clean);
    if (operationsM) {
      const start = operationsM.index + operationsM[0].length - 1; // 指向 [
      body = extractBracketBody(clean, start);
    }
  }
  if (!body) return [];
  const items = splitTopLevelObjects("[" + body + "]");
  const TYPE_LABEL = { edit: "编辑", del: "删除", danger: "删除", view: "查看" };
  const result = [];
  for (const item of items) {
    const labelM = item.match(/(?:^|[\s,{])label\s*:\s*["'`]([^"'`]+)["'`]/);
    const typeM = item.match(/(?:^|[\s,{])type\s*:\s*["'`]([^"'`]+)["'`]/);
    const label = labelM ? labelM[1] : typeM ? TYPE_LABEL[typeM[1]] : null;
    if (label) result.push({ label });
  }
  return result;
}

/** 从 `[` 位置做括号配平，返回内部内容（不含外层括号） */
function extractBracketBody(source, openIdx) {
  if (source[openIdx] !== "[") return null;
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return source.slice(openIdx + 1, i);
    }
  }
  return null;
}

// ─── 比对 ────────────────────────────────────────────────────────────────

function seqNames(seq) {
  return seq.map((x) => x.name).filter(Boolean);
}

/** 数组顺序是否严格相等 */
function arrayEq(a, b) {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

/** 集合是否相等（忽略顺序） */
function setEq(a, b) {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x)) && a.every((x) => new Set(b).has(x));
}

function pushMissingImplementationIssue(issues, level, dir, rule, target) {
  issues.push({
    level,
    dir,
    rule,
    text: "page-spec 声明了 " + target + "，但 data.ts 中未解析到对应实现",
  });
}

/**
 * S3 颜色比对：集合一致时逐个核对 toolbar 按钮颜色（抽出降低 compareSpecToCode 复杂度）
 */
function pushToolbarColorIssues(specToolbar, actualToolbar, dir, issues) {
  const actualByLabel = new Map(actualToolbar.map((b) => [b.label, b]));
  for (const sb of specToolbar) {
    if (!sb.label || !sb.color) continue;
    const ab = actualByLabel.get(sb.label);
    if (ab && ab.color !== sb.color) {
      issues.push({
        level: "warn",
        dir,
        rule: "S3",
        text:
          '按钮"' +
          sb.label +
          '"颜色与原型不一致：spec=' +
          sb.color +
          " vs code=" +
          ab.color,
      });
    }
  }
}

/**
 * 比对 page-spec 与 data.ts 实际实现
 * @param {object} spec     page-spec.json 对象
 * @param {string} dataContent  data.ts 源码
 * @param {string} dir      页面相对目录（用于 issue.dir）
 * @returns {Array<{level,dir,text,rule}>}
 */
function activeItems(items) {
  return Array.isArray(items) && items.length > 0 ? items : [];
}

function differenceSuffix(expected, actual, extraNote = "") {
  const missing = expected.filter((item) => !actual.includes(item));
  const extra = actual.filter((item) => !expected.includes(item));
  const missingText = missing.length ? `（缺：${missing.join(",")}）` : "";
  const extraText = extra.length ? `（多：${extra.join(",")}${extraNote}）` : "";
  return missingText + extraText;
}

function pushSequenceIssues(options) {
  const { issues, expected, actual, level, dir, rule, subject, implementation } = options;
  if (expected.length === 0) return;
  if (actual.length === 0) {
    pushMissingImplementationIssue(issues, level, dir, rule, implementation);
    return;
  }
  if (!setEq(expected, actual)) {
    issues.push({ level, dir, rule, text: `${subject}与 page-spec 不一致${differenceSuffix(expected, actual)}` });
    return;
  }
  if (!arrayEq(expected, actual)) {
    issues.push({
      level,
      dir,
      rule,
      text: `${subject}顺序与原型不一致：spec[${expected.join(",")}] vs code[${actual.join(",")}]`,
    });
  }
}

function compareMethodFields(specItems, dataContent, dir, options, issues) {
  const items = activeItems(specItems);
  if (items.length === 0) return;
  const body = extractMethodBody(dataContent, options.method);
  if (!body) {
    pushMissingImplementationIssue(issues, options.level, dir, options.rule, `${options.method}()`);
    return;
  }
  const ignored = new Set(options.ignored || []);
  const actual = seqNames(extractFieldSequence(body)).filter((name) => !ignored.has(name));
  pushSequenceIssues({
    issues,
    expected: items.map((item) => item.name).filter(Boolean),
    actual,
    level: options.level,
    dir,
    rule: options.rule,
    subject: options.subject,
    implementation: `${options.method}() ${options.subject}`,
  });
}

function compareToolbar(specToolbar, dataContent, dir, issues) {
  const items = activeItems(specToolbar);
  if (items.length === 0) return;
  const body = extractMethodBody(dataContent, "toolbarDef");
  if (!body) {
    pushMissingImplementationIssue(issues, "error", dir, "S3", "toolbarDef()");
    return;
  }
  const actual = extractToolbarSequence(body);
  const expectedLabels = items.map((item) => item.label).filter(Boolean);
  const actualLabels = actual.map((item) => item.label);
  pushSequenceIssues({
    issues,
    expected: expectedLabels,
    actual: actualLabels,
    level: "error",
    dir,
    rule: "S3",
    subject: "工具栏按钮",
    implementation: "toolbarDef() 工具栏按钮",
  });
  if (expectedLabels.length > 0 && setEq(expectedLabels, actualLabels)) {
    pushToolbarColorIssues(items, actual, dir, issues);
  }
}

function compareOperations(specOperations, dataContent, dir, issues) {
  const items = activeItems(specOperations);
  if (items.length === 0) return;
  const expected = items.map((item) => item.label).filter(Boolean);
  const actual = extractOperationSequence(dataContent).map((item) => item.label);
  if (actual.length === 0) {
    pushMissingImplementationIssue(issues, "error", dir, "S4", "renderOps()/operations 操作列按钮");
    return;
  }
  if (setEq(expected, actual)) return;
  issues.push({
    level: "error",
    dir,
    rule: "S4",
    text: `操作列按钮与 page-spec 不一致${differenceSuffix(expected, actual, "，禁止自行添加原型外按钮")}`,
  });
}

function compareLabelFidelity(specItems, dataContent, dir, method, issues) {
  const items = activeItems(specItems);
  const body = items.length > 0 ? extractMethodBody(dataContent, method) : null;
  if (!body) return;
  const actualByName = new Map(
    extractFieldSequence(body).filter((item) => item.name).map((item) => [item.name, item.label]),
  );
  for (const item of items) pushLabelIssue(item, actualByName, dir, issues);
}

function pushLabelIssue(item, actualByName, dir, issues) {
  if (!item.name || !item.label || !actualByName.has(item.name)) return;
  const codeLabel = actualByName.get(item.name);
  if (!codeLabel || codeLabel === item.label) return;
  issues.push({
    level: "warn",
    dir,
    rule: "S5",
    text: `字段"${item.name}"label 与原型不保真：spec="${item.label}" vs code="${codeLabel}"`,
  });
}

function compareSpecToCode(spec, dataContent, dir) {
  const issues = [];
  if (!spec) return issues;
  compareMethodFields(spec.query, dataContent, dir, {
    method: "queryDef", level: "warn", rule: "S1", subject: "查询字段",
  }, issues);
  compareMethodFields(spec.columns, dataContent, dir, {
    method: "columnsDef", level: "error", rule: "S2", subject: "表格列",
    ignored: ["selection", "index", "_action"],
  }, issues);
  compareToolbar(spec.toolbar, dataContent, dir, issues);
  compareOperations(spec.operations, dataContent, dir, issues);
  compareLabelFidelity(spec.query, dataContent, dir, "queryDef", issues);
  compareLabelFidelity(spec.columns, dataContent, dir, "columnsDef", issues);
  return issues;
}

/**
 * 对单个页面目录执行 spec-align 比对
 * @returns {{ issues: Array, hasSpec: boolean }}
 */
function alignPage(absDir, relDir) {
  const { spec, error } = readPageSpec(absDir);
  if (error) {
    return { issues: [{ level: "info", dir: relDir, text: error, rule: "S0" }], hasSpec: false };
  }
  if (!spec) return { issues: [], hasSpec: false };

  const shapeErrs = validateSpecShape(spec);
  if (shapeErrs.length) {
    return {
      issues: shapeErrs.map((e) => ({
        level: "warn",
        dir: relDir,
        rule: "S0",
        text: "page-spec.json 结构问题：" + e,
      })),
      hasSpec: true,
    };
  }

  const dataPath = path.join(absDir, "data.ts");
  if (!fs.existsSync(dataPath)) {
    return {
      issues: [
        {
          level: "warn",
          dir: relDir,
          rule: "S0",
          text: "存在 page-spec.json 但缺 data.ts，无法做 spec-align 比对",
        },
      ],
      hasSpec: true,
    };
  }
  const dataContent = fs.readFileSync(dataPath, "utf8");
  return { issues: compareSpecToCode(spec, dataContent, relDir), hasSpec: true };
}

module.exports = {
  SPEC_FILENAME,
  VALID_COLORS,
  findPageSpecPath,
  readPageSpec,
  validateSpecShape,
  extractMethodBody,
  extractFieldSequence,
  extractToolbarSequence,
  extractOperationSequence,
  splitTopLevelObjects,
  compareSpecToCode,
  alignPage,
  arrayEq,
  setEq,
};

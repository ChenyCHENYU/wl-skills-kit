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
const { validateFieldConstraints } = require("./field-constraints");

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
const DEFAULT_LIST_LIFECYCLE = Object.freeze({
  initialLoad: true,
  queryTrigger: "manual",
  queryResetPage: true,
  saveRefresh: "first",
  deleteEmptyPageFallback: true,
});

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
    const spec = normalizePageSpec(JSON.parse(fs.readFileSync(p, "utf8")));
    return { spec, error: null };
  } catch (e) {
    return { spec: null, error: "page-spec.json 解析失败：" + e.message };
  }
}

/**
 * 校验 page-spec 结构合法性（写入前/读取后均可调用）
 * @returns {string[]} 错误列表（空数组 = 合法）
 */
function normalizeItems(items) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => ({
    ...item,
    ...(item?.name || !item?.field ? {} : { name: item.field }),
    ...(item?.color || !item?.type ? {} : { color: item.type === "plain" ? "default" : item.type }),
  }));
}

function normalizePageSpec(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return spec;
  return {
    ...spec,
    page: spec.page || spec.pageName,
    dir: spec.dir || spec.path,
    mode: spec.mode || spec.pattern,
    query: normalizeItems(spec.query),
    columns: normalizeItems(spec.columns),
    toolbar: normalizeItems(spec.toolbar),
    operations: normalizeItems(spec.operations),
    formSections: Array.isArray(spec.formSections)
      ? spec.formSections.map((section) => ({ ...section, fields: normalizeItems(section.fields) }))
      : spec.formSections,
    subTables: Array.isArray(spec.subTables)
      ? spec.subTables.map((table) => ({
        ...table,
        query: normalizeItems(table.query),
        columns: normalizeItems(table.columns),
        toolbar: normalizeItems(table.toolbar),
        operations: normalizeItems(table.operations),
      }))
      : spec.subTables,
  };
}

function validateNamedItems(spec, key, errs, options = {}, locationKey = key) {
  const values = spec[key];
  if (!Array.isArray(values)) return;
  const seen = new Set();
  for (const [index, item] of values.entries()) {
    validateNamedItem(item, locationKey, index, seen, errs);
    validateTypedField(item, `${locationKey}[${index}]`, errs, options);
  }
}

function validateNamedItem(item, key, index, seen, errs) {
  const name = item?.name || item?.field;
  if (!name && !item?.label) errs.push(`${key}[${index}] 缺少 name/field 或 label`);
  appendPlaceholderError(item?.label, `${key}[${index}].label`, errs);
  appendPlaceholderError(name, `${key}[${index}].name`, errs);
  if (!name) return;
  if (seen.has(name)) errs.push(`${key} 字段重复：${name}`);
  seen.add(name);
}

function isUnresolvedPlaceholder(value) {
  if (typeof value !== "string") return false;
  return /^(?:\?{2,}|TODO|TBD|待确认|待补充|未确认)$/i.test(value.trim());
}

function appendPlaceholderError(value, location, errs) {
  if (isUnresolvedPlaceholder(value)) errs.push(`${location} 仍是未解决占位符：${value}`);
}

function validateTypedField(item, location, errs, options) {
  if (!item || typeof item !== "object") return;
  if (item.contractField !== undefined && typeof item.contractField !== "boolean") {
    errs.push(`${location}.contractField 必须是 boolean`);
  }
  if (item.type === "dict" && !item.dictCode) {
    errs.push(`${location}.dictCode 必填（type=dict）`);
  }
  if (item.dictCode && item.type !== "dict") {
    errs.push(`${location}.dictCode 只能用于 type=dict 字段`);
  }
  errs.push(...validateFieldConstraints(item, {
    location,
    strict: options.strict === true,
  }));
}

function validateFormSections(spec, errs, options) {
  for (const [index, section] of (spec.formSections || []).entries()) {
    if (!section?.name || !section?.label || !Array.isArray(section.fields)) {
      errs.push(`formSections[${index}] 必须声明 name/label/fields[]`);
    }
    validateNamedItems(
      { fields: section?.fields },
      "fields",
      errs,
      options,
      `formSections[${index}].fields`,
    );
  }
}

function validateSubTables(spec, errs, options) {
  for (const [index, table] of (spec.subTables || []).entries()) {
    validateSubTable(table, index, errs, options);
  }
}

function validSubTableHeader(table) {
  return [table?.name, table?.label, Array.isArray(table?.columns)].every(Boolean);
}

function validOptionalArray(value) {
  return [value === undefined, Array.isArray(value)].some(Boolean);
}

function validateSubTable(table, index, errs, options) {
  if (!validSubTableHeader(table)) {
    errs.push(`subTables[${index}] 必须声明 name/label/columns[]`);
  }
  for (const key of ["query", "columns", "toolbar", "operations"]) {
    validateNamedItems({ [key]: table?.[key] }, key, errs, options, `subTables[${index}].${key}`);
  }
  validateToolbarColors(table?.toolbar, errs);
  if (!validOptionalArray(table?.operations)) {
    errs.push(`subTables[${index}].operations 必须是数组`);
  }
}

function validateFeatures(spec, errs) {
  if (spec.features !== undefined && (!spec.features || typeof spec.features !== "object" || Array.isArray(spec.features))) {
    errs.push("features 必须是对象");
    return;
  }
  validateFixedQueryFields(spec.features?.fixedQueryFields, errs);
  validateContextFields(spec.features?.contextFields, errs);
  validateListLifecycle(spec.features?.listLifecycle, errs);
  validateDefinitionSource(spec.features?.definitionSource, errs);
}

function validContextOperations(operations) {
  if (operations === undefined) return true;
  return Array.isArray(operations)
    && operations.length > 0
    && operations.every((operation) => ["page", "create", "update"].includes(operation));
}

function validateContextField(item, index, names, errs) {
  if (![item, typeof item === "object", item?.name].every(Boolean)) {
    errs.push(`features.contextFields[${index}].name 不能为空`);
    return;
  }
  if (!["client", "server"].includes(item.source)) errs.push(`features.contextFields[${index}].source 只允许 client/server`);
  if (names.has(item.name)) errs.push(`features.contextFields 字段重复：${item.name}`);
  names.add(item.name);
  if (!validContextOperations(item.operations)) {
    errs.push(`features.contextFields[${index}].operations 只允许 page/create/update 的非空数组`);
  }
}

function validateContextFields(contextFields, errs) {
  if (contextFields === undefined) return;
  if (!Array.isArray(contextFields) || contextFields.length === 0) {
    errs.push("features.contextFields 必须是非空数组");
    return;
  }
  const names = new Set();
  contextFields.forEach((item, index) => validateContextField(item, index, names, errs));
}

function appendLifecycleBooleanErrors(value, errs) {
  for (const key of ["initialLoad", "queryResetPage", "deleteEmptyPageFallback"]) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") errs.push(`features.listLifecycle.${key} 必须是 boolean`);
  }
}

function appendLifecycleEnumError(value, key, allowed, errs) {
  if (value[key] !== undefined && !allowed.includes(value[key])) {
    errs.push(`features.listLifecycle.${key} 只允许 ${allowed.join("/")}`);
  }
}

function validateListLifecycle(value, errs) {
  if (value === undefined) return;
  if (![value, typeof value === "object", !Array.isArray(value)].every(Boolean)) {
    errs.push("features.listLifecycle 必须是对象");
    return;
  }
  appendLifecycleBooleanErrors(value, errs);
  appendLifecycleEnumError(value, "queryTrigger", ["manual", "auto"], errs);
  appendLifecycleEnumError(value, "saveRefresh", ["first", "current"], errs);
}

function validPageChronologyShape(rule) {
  return [rule?.kind === "chronology", rule?.startField, rule?.endField, rule?.message, rule?.source].every(Boolean);
}

function validPageChronologyOperations(operations) {
  return Array.isArray(operations)
    && operations.every((item) => ["create", "update", "page"].includes(item));
}

function validatePageChronologyRule(rule, index, errs) {
  if (!validPageChronologyShape(rule)) {
    errs.push(`validationRules[${index}] chronology 必须声明 startField/endField/message/source`);
  }
  if (!validPageChronologyOperations(rule?.operations)) {
    errs.push(`validationRules[${index}].operations 只允许 create/update/page`);
  }
  if (rule?.allowEqual !== undefined && typeof rule.allowEqual !== "boolean") {
    errs.push(`validationRules[${index}].allowEqual 必须是 boolean`);
  }
}

function validateValidationRules(rules, errs) {
  if (rules === undefined) return;
  if (!Array.isArray(rules)) {
    errs.push("validationRules 必须是数组");
    return;
  }
  rules.forEach((rule, index) => validatePageChronologyRule(rule, index, errs));
}

function validateDefinitionSource(value, errs) {
  if (value === undefined) return;
  if (typeof value !== "string" || !value.trim()) {
    errs.push("features.definitionSource 必须是非空字符串");
    return;
  }
  const normalized = normalizeImportSource(value);
  if (path.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    errs.push("features.definitionSource 必须是安全的项目相对路径");
  }
}

function validateFixedQueryFields(fixedFields, errs) {
  if (fixedFields === undefined) return;
  const validItems = Array.isArray(fixedFields)
    && fixedFields.length > 0
    && fixedFields.every((field) => typeof field === "string" && Boolean(field.trim()));
  if (!validItems) errs.push("features.fixedQueryFields 必须是非空字符串数组");
  else if (new Set(fixedFields).size !== fixedFields.length) errs.push("features.fixedQueryFields 不能重复");
}

function validateNestedSections(spec, errs, options) {
  validateFormSections(spec, errs, options);
  validateSubTables(spec, errs, options);
  validateFeatures(spec, errs);
  validateValidationRules(spec.validationRules, errs);
}

function validateStrictFields(spec, errs) {
  if (spec.schemaVersion !== 1) errs.push("严格模式要求 schemaVersion=1");
  for (const key of ["pageId", "mode", "profileId", "protocolVersion", "apiContract"]) {
    if (!spec[key] || typeof spec[key] !== "string") errs.push(`严格模式缺少 ${key}`);
  }
  if (spec.protocolVersion && spec.protocolVersion !== "1.0") errs.push("protocolVersion 必须为 1.0");
  if (Array.isArray(spec.openQuestions) && spec.openQuestions.length > 0) {
    errs.push("严格模式不允许 openQuestions 存在未决问题");
  }
}

function validateSpecShape(input, options = {}) {
  const spec = normalizePageSpec(input);
  if (!spec || typeof spec !== "object") {
    return ["page-spec 不是合法对象"];
  }
  const errs = [];
  if (!spec.page || typeof spec.page !== "string") {
    errs.push("缺少 page（页面中文名）");
  }
  if (isUnresolvedPlaceholder(spec.page)) errs.push(`page 仍是未解决占位符：${spec.page}`);
  validateArrayFields(spec, errs);
  validateToolbarColors(spec.toolbar, errs);
  for (const key of ["query", "columns", "toolbar", "operations"]) {
    validateNamedItems(spec, key, errs, options);
  }
  validateNestedSections(spec, errs, options);
  if (options.strict) validateStrictFields(spec, errs);
  return errs;
}

function validateArrayFields(spec, errs) {
  for (const key of ["query", "columns", "toolbar", "operations", "formSections", "subTables", "notes", "platformComponents", "newComponents", "openQuestions"]) {
    if (spec[key] !== undefined && !Array.isArray(spec[key])) {
      errs.push(key + " 必须是数组");
    }
  }
}

function validateToolbarColors(toolbar, errs) {
  for (const btn of toolbar || []) {
    if (!btn) continue;
    if (btn.color && !VALID_COLORS.has(btn.color)) {
      errs.push(
        '工具栏按钮 "' +
          (btn.label || "?") +
          '" 的 color 非法：' +
          btn.color +
          "（合法值：primary/danger/warning/success/default）",
      );
    }
    if (
      isCreateActionLabel(btn.label) &&
      (btn.color !== "primary" || btn.plain === true)
    ) {
      errs.push(
        '创建类主按钮 "' +
          btn.label +
          '" 必须 color=primary 且 plain=false',
      );
    }
  }
}

function isCreateActionLabel(label) {
  return /^(?:新增|新建|添加|创建)/.test(String(label || "").trim());
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
 * 返回 [{ name, label, dictCode }]，顺序即代码顺序。
 * dictCode 只读取代码中的显式 dict/dictCode/logicValue，不按字段名或 label 猜测。
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
    const dictCodeM = item.match(
      /(?:^|[\s,{])(?:dict|dictCode|logicValue)\s*:\s*["'`]([^"'`]+)["'`]/,
    );
    if (nameM || labelM) {
      result.push({
        name: nameM ? nameM[1] : null,
        label: labelM ? labelM[1] : null,
        dictCode: dictCodeM ? dictCodeM[1] : null,
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
    if (!sb.label) continue;
    const ab = actualByLabel.get(sb.label);
    if (!ab) continue;
    if (
      isCreateActionLabel(sb.label) &&
      (ab.color !== "primary" || ab.plain === true)
    ) {
      issues.push({
        level: "error",
        dir,
        rule: "S3",
        text:
          '创建类主按钮"' +
          sb.label +
          '"必须使用 primary 填充样式（禁止 plain）',
      });
      continue;
    }
    if (sb.color && ab.color !== sb.color) {
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
    const expectedPlain = sb.plain === true;
    if (ab.plain !== expectedPlain) {
      issues.push({
        level: "warn",
        dir,
        rule: "S3",
        text:
          '按钮"' +
          sb.label +
          '"填充形态与原型不一致：spec plain=' +
          expectedPlain +
          " vs code plain=" +
          ab.plain,
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

function compareDictBindings(specItems, dataContent, dir, method, issues) {
  const expected = activeItems(specItems)
    .map((item) => ({ ...item, expectedDictCode: item?.dictCode || item?.dict }))
    .filter((item) => item.expectedDictCode);
  if (expected.length === 0) return;
  const body = extractMethodBody(dataContent, method);
  if (!body) return;
  const actualByName = new Map(
    extractFieldSequence(body)
      .filter((item) => item.name)
      .map((item) => [item.name, item.dictCode]),
  );
  for (const item of expected) {
    if (!actualByName.has(item.name)) continue;
    const actual = actualByName.get(item.name);
    if (actual === item.expectedDictCode) continue;
    issues.push({
      level: "error",
      dir,
      rule: "D3",
      text: actual
        ? `字段"${item.name}"字典绑定与 page-spec 不一致：spec=${item.expectedDictCode} vs code=${actual}`
        : `字段"${item.name}"缺少显式字典绑定：应使用 page-spec 显式字典=${item.expectedDictCode}，禁止按字段名猜字典`,
    });
  }
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
  compareDictBindings(spec.query, dataContent, dir, "queryDef", issues);
  compareDictBindings(spec.columns, dataContent, dir, "columnsDef", issues);
  return issues;
}

function normalizeImportSource(value) {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.startsWith("@/") ? `src/${normalized.slice(2)}` : normalized;
}

/**
 * 配置驱动页面允许 data.ts 仅把共享定义重导出为 pageDefinition。
 *
 * 这种页面不包含 queryDef/columnsDef/toolbarDef，不能套用旧式 class 页面
 * 的 S1~S5 解析器。只有 page-spec 显式声明 features.definitionSource，且
 * data.ts 的 import/export 委托链可静态确认时才跳过，避免按文件长度猜测。
 */
function validateDefinitionDelegation(spec, dataContent, dir) {
  const declaredSource = spec?.features?.definitionSource;
  if (!declaredSource) return { delegated: false, issues: [] };
  const issues = [];
  const expectedSource = normalizeImportSource(declaredSource);
  const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["']/g;
  let matchedImport = null;
  let match;
  while ((match = importPattern.exec(dataContent)) !== null) {
    const specifiers = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const exposesPageDefinition = specifiers.some((item) =>
      /^(?:[A-Za-z_$][\w$]*\s+as\s+)?pageDefinition$/.test(item),
    );
    if (!exposesPageDefinition) continue;
    matchedImport = { source: normalizeImportSource(match[2]) };
    break;
  }
  if (!matchedImport) {
    issues.push({
      level: "error",
      dir,
      rule: "S0",
      text: `page-spec 声明 definitionSource=${declaredSource}，但 data.ts 未静态导入 pageDefinition`,
    });
    return { delegated: true, source: expectedSource, issues };
  }
  if (matchedImport.source !== expectedSource) {
    issues.push({
      level: "error",
      dir,
      rule: "S0",
      text: `pageDefinition 来源与 page-spec 不一致：spec=${expectedSource} vs code=${matchedImport.source}`,
    });
  }
  if (
    !/export\s*\{[^}]*\bpageDefinition\b[^}]*\}/.test(dataContent) &&
    !/export\s+default\s+pageDefinition\b/.test(dataContent)
  ) {
    issues.push({
      level: "error",
      dir,
      rule: "S0",
      text: "data.ts 已导入共享 pageDefinition，但未将其导出给页面运行时",
    });
  }
  return { delegated: true, source: expectedSource, issues };
}

function canonicalFieldName(value) {
  return String(value || "").replace(/[_-]/g, "").toLowerCase();
}

function extractMachineContracts(apiContent) {
  const contracts = [];
  const trimmed = apiContent.trim();
  if (trimmed.startsWith("{")) {
    try {
      const contract = JSON.parse(trimmed);
      if (contract?.kind === "wl-api-contract") contracts.push(contract);
    } catch {
      // JSON 语法问题由契约验证器报告。
    }
    return contracts;
  }
  for (const match of apiContent.matchAll(/```(?:wl-api-contract|wl-backend-contract)\s*\r?\n([\s\S]*?)\r?\n```/g)) {
    try {
      contracts.push(JSON.parse(match[1]));
    } catch {
      // JSON 语法问题由 R9 统一报告，S6 不重复制造噪声。
    }
  }
  return contracts;
}

function modelFieldNames(contract, modelNames) {
  const names = new Set();
  for (const modelName of modelNames) {
    for (const field of contract?.models?.[modelName] || []) {
      if (field?.name) names.add(canonicalFieldName(field.name));
    }
  }
  return names;
}

function modelFieldMap(contract, modelNames) {
  const fields = new Map();
  for (const modelName of modelNames) {
    for (const field of contract?.models?.[modelName] || []) {
      if (field?.name && !fields.has(canonicalFieldName(field.name))) {
        fields.set(canonicalFieldName(field.name), field);
      }
    }
  }
  return fields;
}

function stableComparable(value) {
  if (Array.isArray(value)) return value.map(stableComparable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableComparable(value[key])]));
}

function appendRequiredContractIssue(item, contractField, dir, location, index, issues) {
  if (item.required === undefined || item.required === contractField.required) return;
  issues.push({
    level: "error", dir, rule: "S6",
    text: `${location}[${index}].required 与机器契约不一致：spec=${item.required} contract=${contractField.required}`,
  });
}

function appendConstraintContractIssue(item, contractField, dir, location, index, issues) {
  if (item.constraints === undefined) return;
  if (JSON.stringify(stableComparable(item.constraints)) === JSON.stringify(stableComparable(contractField.constraints))) return;
  issues.push({
    level: "error", dir, rule: "S6",
    text: `${location}[${index}].constraints 与机器契约不一致；字段边界必须来自显式契约，不得按名称猜测`,
  });
}

function appendExplicitFieldContractIssues(items, contractFields, dir, location, issues) {
  for (const [index, item] of (items || []).entries()) {
    if (item?.contractField === false) continue;
    const name = item?.name || item?.field;
    const contractField = contractFields.get(canonicalFieldName(name));
    if (!contractField) continue;
    appendRequiredContractIssue(item, contractField, dir, location, index, issues);
    appendConstraintContractIssue(item, contractField, dir, location, index, issues);
  }
}

function comparableSpecFields(items) {
  return (items || [])
    .filter((item) => item?.contractField !== false)
    .map((item) => item?.name || item?.field)
    .filter(Boolean);
}

function appendForeignFieldIssues(items, allowed, dir, location, issues) {
  for (const name of comparableSpecFields(items)) {
    if (allowed.has(canonicalFieldName(name))) continue;
    issues.push({
      level: "error",
      dir,
      rule: "S6",
      text: `${location} 字段 ${name} 不在对应 wl-api-contract 模型中；若为纯展示字段请显式声明 contractField=false`,
    });
  }
}

function appendMissingRequiredFields(contract, available, dir, issues) {
  for (const field of contract?.models?.createRequest || []) {
    if (!field?.required || available.has(canonicalFieldName(field.name))) continue;
    issues.push({
      level: "error",
      dir,
      rule: "S6",
      text: `formSections/fixedQueryFields 缺少 createRequest 必填字段 ${field.name}`,
    });
  }
}

function appendRequiredFormIssues(spec, contract, dir, issues) {
  const formItems = (spec.formSections || []).flatMap((section) => section.fields || []);
  const formFields = comparableSpecFields(formItems);
  if (formFields.length === 0) return;
  const available = new Set([
    ...formFields,
    ...(spec.features?.fixedQueryFields || []),
    ...(spec.features?.contextFields || [])
      .filter((item) => item.source === "client" && (item.operations || ["create"]).includes("create"))
      .map((item) => item.name),
  ].map(canonicalFieldName));
  appendMissingRequiredFields(contract, available, dir, issues);
  const writable = modelFieldNames(contract, ["createRequest", "updateRequest"]);
  appendForeignFieldIssues(
    formItems,
    writable,
    dir,
    "formSections",
    issues,
  );
}

function contractMatchesResource(contract, resource) {
  const normalizedResource = String(resource || "").replace(/^\/+|\/+$/g, "");
  const pathValue = String(contract?.transport?.externalBasePath || "").replace(/^\/+|\/+$/g, "");
  return normalizedResource && (pathValue === normalizedResource || pathValue.endsWith(`/${normalizedResource}`));
}

function compareSpecResource(specResource, contract, dir, location, issues) {
  appendForeignFieldIssues(
    specResource.query,
    modelFieldNames(contract, ["pageRequest"]),
    dir,
    `${location}.query`,
    issues,
  );
  appendForeignFieldIssues(
    specResource.columns,
    modelFieldNames(contract, ["pageResponse", "detailResponse"]),
    dir,
    `${location}.columns`,
    issues,
  );
  appendExplicitFieldContractIssues(
    specResource.query,
    modelFieldMap(contract, ["pageRequest"]),
    dir,
    `${location}.query`,
    issues,
  );
  const formItems = (specResource.formSections || []).flatMap((section) => section.fields || []);
  appendExplicitFieldContractIssues(
    formItems,
    modelFieldMap(contract, ["createRequest", "updateRequest"]),
    dir,
    `${location}.formSections`,
    issues,
  );
}

function appendFixedContextIssues(fixedFields, contract, dir, location, issues) {
  for (const field of fixedFields || []) {
    for (const modelName of ["pageRequest", "createRequest", "updateRequest"]) {
      const allowed = modelFieldNames(contract, [modelName]);
      if (allowed.has(canonicalFieldName(field))) continue;
      issues.push({
        level: "error",
        dir,
        rule: "S6",
        text: `${location}.fixedQueryFields 字段 ${field} 未进入 ${modelName}，固定上下文查询/新增/更新链路未闭合`,
      });
    }
  }
}

function appendTypedContextIssues(contextFields, contract, dir, location, issues) {
  const modelByOperation = { page: "pageRequest", create: "createRequest", update: "updateRequest" };
  for (const item of contextFields || []) {
    const operations = item.operations || ["page", "create", "update"];
    for (const [operation, modelName] of Object.entries(modelByOperation)) {
      const present = modelFieldNames(contract, [modelName]).has(canonicalFieldName(item.name));
      if (item.source === "server" && present) {
        issues.push({
          level: "error", dir, rule: "S6",
          text: `${location}.contextFields 服务端上下文字段 ${item.name} 不得出现在 ${modelName}，应由鉴权/租户上下文注入`,
        });
      } else if (item.source === "client" && operations.includes(operation) && !present) {
        issues.push({
          level: "error", dir, rule: "S6",
          text: `${location}.contextFields 客户端上下文字段 ${item.name} 未进入 ${modelName}`,
        });
      }
    }
  }
}

function appendValidationRuleIssues(spec, contract, dir, issues) {
  const expected = stableComparable(spec.validationRules || []);
  const actual = stableComparable(contract.validationRules || []);
  if (expected.length === 0 && actual.length === 0) return;
  if (JSON.stringify(expected) === JSON.stringify(actual)) return;
  issues.push({
    level: "error", dir, rule: "S6",
    text: "validationRules 与机器契约不一致；开始/结束时间等跨字段边界必须前后端同源",
  });
}

/**
 * S6 只在 api.md 已提供机器契约时执行，不从中文标签或字段名猜测后端模型。
 * 单资源页直接绑定唯一契约；多资源页必须用 subTables[].resource 精确匹配 externalBasePath。
 */
function appendContractCardinalityIssue(issues, dir, text) {
  issues.push({ level: "error", dir, rule: "S6", text });
}

function validateSubTableContracts(spec, contracts, dir, issues) {
  for (const [index, subTable] of spec.subTables.entries()) {
    const matches = contracts.filter((contract) => contractMatchesResource(contract, subTable.resource));
    if (matches.length !== 1) {
      appendContractCardinalityIssue(issues, dir,
        `subTables[${index}].resource=${subTable.resource || "<未声明>"} 必须唯一匹配一个机器契约，实际 ${matches.length} 个`);
      continue;
    }
    const location = `subTables[${index}]`;
    compareSpecResource(subTable, matches[0], dir, location, issues);
    appendFixedContextIssues(spec.features?.fixedQueryFields, matches[0], dir, location, issues);
    appendTypedContextIssues(spec.features?.contextFields, matches[0], dir, location, issues);
  }
}

function validateSingleResourceContract(spec, contracts, dir, issues) {
  if (contracts.length !== 1) {
    appendContractCardinalityIssue(issues, dir, `单资源 page-spec 必须对应唯一机器契约，实际 ${contracts.length} 个`);
    return;
  }
  const [contract] = contracts;
  compareSpecResource(spec, contract, dir, "page-spec", issues);
  appendRequiredFormIssues(spec, contract, dir, issues);
  appendFixedContextIssues(spec.features?.fixedQueryFields, contract, dir, "page-spec", issues);
  appendTypedContextIssues(spec.features?.contextFields, contract, dir, "page-spec", issues);
  appendValidationRuleIssues(spec, contract, dir, issues);
}

function validateSpecContractAlignment(spec, apiContent, dir) {
  const contracts = extractMachineContracts(apiContent);
  if (contracts.length === 0) return [];
  const issues = [];
  if ((spec.subTables || []).length > 0) validateSubTableContracts(spec, contracts, dir, issues);
  else validateSingleResourceContract(spec, contracts, dir, issues);
  return issues;
}

/**
 * 对单个页面目录执行 spec-align 比对
 * @returns {{ issues: Array, hasSpec: boolean }}
 */
function alignPage(absDir, relDir, options = {}) {
  const { spec, error } = readPageSpec(absDir);
  if (error) {
    return { issues: [{ level: "info", dir: relDir, text: error, rule: "S0" }], hasSpec: false };
  }
  if (!spec) return { issues: [], hasSpec: false };

  const shapeErrs = validateSpecShape(spec, options);
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
  const apiPath = path.resolve(absDir, spec.apiContract || "api.md");
  const apiInsidePage = apiPath.startsWith(`${path.resolve(absDir)}${path.sep}`);
  const contractIssues = !apiInsidePage
    ? [{ level: "error", dir: relDir, rule: "S6", text: "apiContract 必须位于当前页面目录内" }]
    : fs.existsSync(apiPath)
      ? validateSpecContractAlignment(spec, fs.readFileSync(apiPath, "utf8"), relDir)
      : [];
  const delegation = validateDefinitionDelegation(spec, dataContent, relDir);
  if (delegation.delegated) {
    return {
      issues: [...contractIssues, ...delegation.issues],
      hasSpec: true,
      definitionSource: delegation.source,
    };
  }
  return { issues: [...contractIssues, ...compareSpecToCode(spec, dataContent, relDir)], hasSpec: true };
}

module.exports = {
  SPEC_FILENAME,
  DEFAULT_LIST_LIFECYCLE,
  VALID_COLORS,
  findPageSpecPath,
  readPageSpec,
  normalizePageSpec,
  validateSpecShape,
  extractMethodBody,
  extractFieldSequence,
  extractToolbarSequence,
  extractOperationSequence,
  splitTopLevelObjects,
  compareSpecToCode,
  validateDefinitionDelegation,
  validateSpecContractAlignment,
  alignPage,
  arrayEq,
  setEq,
};

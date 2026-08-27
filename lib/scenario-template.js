"use strict";

/**
 * lib/scenario-template.js — wl-scenario 场景模板契约层
 *
 * 职责：
 *   1. 加载 patterns.json 模式注册表（单一数据源）
 *   2. validateScenario：结构校验（含 handler 逐字代码的安全边界）
 *   3. scenarioToPageSpec：scenario JSON 实例化为 page-spec（复用既有 S0/S1~S7 真值体系）
 *
 * 设计原则：
 *   - scenario JSON 是"结构与展示方式"的单一事实源；代码（全代码或 definition）
 *     一律是它的下游编译产物，禁止反向漂移
 *   - 声明式核心（query/columns/toolbar/operations/formSections）与 page-spec 同源；
 *     非声明式定制代码只能进 extensions，逐字嵌入/回捞，不做语义改写
 *   - 校验只认显式声明，不按字段名/页面名猜测
 */

const path = require("path");
const { validateSpecShape } = require("./page-spec");

const SCENARIO_KIND = "wl-scenario";
const SCENARIO_SCHEMA_VERSION = 1;
const RENDER_TRACKS = new Set(["codegen", "runtime"]);
const PATTERNS_PATH = path.resolve(
  __dirname,
  "..",
  "files",
  ".wl-skills",
  "skills",
  "core",
  "page-codegen",
  "templates",
  "patterns.json",
);
const EXTENSION_SLOTS = new Set(["customImports", "customMethods", "template.afterToolbar"]);

let patternsCache = null;

/** 加载模式注册表（进程内缓存；测试可传 fresh 重置） */
function loadPatterns(fresh = false) {
  if (patternsCache && !fresh) return patternsCache;
  patternsCache = JSON.parse(require("fs").readFileSync(PATTERNS_PATH, "utf8"));
  return patternsCache;
}

function resetPatternsCache() {
  patternsCache = null;
}

function findPattern(id) {
  const registry = loadPatterns();
  return (registry.patterns || []).find((p) => p.id === id) || null;
}

/** extensions 中逐字代码禁止 import/export（含动态 import(...)）；imports 只能走 customImports 逐行 */
function containsModuleSyntax(code) {
  return /(^|[\s;}])(import|export)[\s(]/.test(String(code || ""));
}

function validateCustomImports(extension, errs) {
  for (const line of String(extension.code || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!/^import\s[\s\S]+$/.test(trimmed)) {
      errs.push(`extensions[customImports] 每行必须是单条 import 语句：${trimmed}`);
    }
  }
}

function validateExtensionShape(ext, errs) {
  if (!ext || typeof ext.slot !== "string" || !EXTENSION_SLOTS.has(ext.slot)) {
    errs.push("extensions[].slot 必须是 customImports/customMethods/template.afterToolbar 之一");
    return false;
  }
  if (typeof ext.code !== "string" || !ext.code.trim()) {
    errs.push(`extensions[${ext.slot}] 缺少 code`);
    return false;
  }
  return true;
}

function validateExtension(ext, seen, errs) {
  if (!validateExtensionShape(ext, errs)) return;
  if (seen.has(ext.slot)) {
    errs.push(`extensions[${ext.slot}] 重复声明`);
    return;
  }
  seen.add(ext.slot);
  if (ext.slot === "customImports") {
    validateCustomImports(ext, errs);
    return;
  }
  if (containsModuleSyntax(ext.code)) {
    errs.push(`extensions[${ext.slot}] 禁止 import/export 语句；依赖请走 customImports 逐行声明`);
  }
}

function validateExtensions(doc, errs) {
  const seen = new Set();
  for (const ext of doc.extensions || []) validateExtension(ext, seen, errs);
}

function validateHandler(handler, label, location, errs) {
  if (typeof handler !== "string" || !handler.trim()) {
    errs.push(`${location}"${label}" 为 custom 动作但缺少 handler（onClick 源码文本）`);
    return;
  }
  if (containsModuleSyntax(handler)) {
    errs.push(`${location}"${label}" handler 禁止 import/export 语句`);
  }
}

const CREATE_LABEL_RE = /^(?:新增|新建|添加|创建)/;
const STANDARD_OPERATION_ACTIONS = new Set(["edit", "del", "view"]);

function validateToolbarItems(doc, errs) {
  for (const btn of doc.toolbar || []) {
    if (!btn || typeof btn.label !== "string") continue;
    const isCreate = CREATE_LABEL_RE.test(btn.label.trim());
    const needsHandler = btn.action === "custom" || (!btn.action && !isCreate);
    if (needsHandler) {
      validateHandler(btn.handler, btn.label, "工具栏按钮", errs);
    }
  }
}

function validateOperationItems(doc, errs) {
  for (const op of doc.operations || []) {
    if (!op || typeof op.label !== "string") continue;
    if (STANDARD_OPERATION_ACTIONS.has(op.action)) continue;
    validateHandler(op.handler, op.label, "操作列按钮", errs);
  }
}

/** runtime 轨 v1 只支持渲染器内置标准动作；custom handler 需要 eval，一律拒绝 */
function validateRuntimeActions(doc, errs) {
  validateRuntimeToolbar(doc.toolbar, errs);
  validateRuntimeOperations(doc.operations, errs);
}

function validateRuntimeToolbar(toolbar, errs) {
  for (const btn of toolbar || []) {
    if (!btn || typeof btn.label !== "string") continue;
    const isCreate = CREATE_LABEL_RE.test(btn.label.trim());
    const action = btn.action || (isCreate ? "openModal" : "custom");
    if (action !== "custom") continue;
    errs.push(
      `runtime 轨 v1 仅支持标准动作（openModal/edit/del/view）：工具栏"${btn.label}"需要 custom handler，请改走 codegen 轨`,
    );
  }
}

function validateRuntimeOperations(operations, errs) {
  for (const op of operations || []) {
    if (!op || STANDARD_OPERATION_ACTIONS.has(op.action)) continue;
    errs.push(
      `runtime 轨 v1 仅支持标准动作（edit/del/view）：操作列"${op.label}"需要 custom handler，请改走 codegen 轨`,
    );
  }
}

function validateTrackRequirements(doc, pattern, errs) {
  if (!RENDER_TRACKS.has(doc.renderTrack)) {
    errs.push(`renderTrack 非法：${doc.renderTrack}（合法值：codegen/runtime）`);
    return;
  }
  if (pattern.track !== doc.renderTrack) {
    errs.push(
      `pattern "${pattern.id}" 注册的轨道是 ${pattern.track}，与 renderTrack=${doc.renderTrack} 不一致`,
    );
  }
  if (doc.renderTrack === "codegen") {
    validateCodegenBasics(doc, pattern, errs);
    return;
  }
  if (!doc.requires || typeof doc.requires.renderer !== "string" || !doc.requires.renderer) {
    errs.push("runtime 轨必须声明 requires.renderer（项目内渲染器组件路径）");
  }
  validateRuntimeActions(doc, errs);
}

/** 这些 pattern 的产物不依赖 AGGrid cid（无表格或表单页），豁免 tableCid 检查 */
const CID_EXEMPT_PATTERNS = new Set(["change-history"]);

function requireCidAnchor(doc, pattern, errs) {
  if (CID_EXEMPT_PATTERNS.has(pattern.id)) return;
  if (!doc.tableCid && !doc.pageAbbr) {
    errs.push("codegen 轨必须提供 tableCid 或 pageAbbr（AGGrid cid 生成依据）");
  }
}

function requireListAnchor(doc, errs) {
  const hasListConfig = doc.apiConfig && typeof doc.apiConfig.list === "string";
  const hasHistoryList = doc.apiConfig && typeof doc.apiConfig.changeHistoryList === "string";
  if (!hasListConfig && !hasHistoryList && (!doc.serviceShort || !doc.resourceName)) {
    errs.push("codegen 轨必须提供 serviceShort + resourceName（或显式 apiConfig.list）用于推导 API 路径");
  }
}

function validateCodegenBasics(doc, pattern, errs) {
  if (pattern.id === "record-form") {
    // record-form 走显式 getByKey/saveOrUpdate 端点，不依赖 list 推导
    requireCidAnchor(doc, pattern, errs);
  } else if (pattern.id === "change-history") {
    // change-history 无表格（右面板复用业务 Tabs 组件），产物不依赖 cid
  } else {
    requireListAnchor(doc, errs);
    requireCidAnchor(doc, pattern, errs);
  }
  if (PATTERN_VALIDATORS[pattern.id]) PATTERN_VALIDATORS[pattern.id](doc, errs);
}

const PATTERN_VALIDATORS = {
  "master-detail": validateMasterDetailBasics,
  "tree-list": (doc, errs) => {
    if (!doc.treeResource && !(doc.apiConfig && doc.apiConfig.tree)) {
      errs.push("tree-list 必须声明 treeResource（或 apiConfig.tree）用于推导树接口路径");
    }
  },
  "record-form": validateRecordFormBasics,
  "form-route": (doc, errs) => {
    if (!(doc.formSections || []).some((s) => (s.fields || []).length > 0)) {
      errs.push("form-route 必须声明至少一个含字段的 formSections 分区");
    }
  },
  "change-history": (doc, errs) => {
    const tabs = doc.requires && doc.requires.components && doc.requires.components[0];
    if (!tabs) {
      errs.push("change-history 必须声明 requires.components[0]（业务域 Tabs 组件，view 模式复用）");
    }
  },
};

function validateMasterDetailBasics(doc, errs) {
  const hasBottomList = doc.apiConfig && typeof doc.apiConfig.bottomList === "string";
  const sub = (doc.subTables || [])[0];
  if ((doc.subTables || []).length === 0) return;
  if (!sub.resource && !hasBottomList) {
    errs.push("master-detail 的 subTables[0] 必须声明 resource（或 apiConfig.bottomList）用于推导从表查询路径");
  }
  if ((doc.subTables || []).length > 1) {
    errs.push("master-detail v1 仅支持单从表（subTables[0]），多从表请拆页或走 page-codegen 主流程");
  }
}

const RECORD_FORM_REQUIRED_ENDPOINTS = ["getByKey", "saveOrUpdate"];

function validateRecordFormBasics(doc, errs) {
  if ((doc.query || []).length === 0) {
    errs.push("record-form 必须声明至少一个 query 主键字段（选择主记录）");
  }
  for (const key of RECORD_FORM_REQUIRED_ENDPOINTS) {
    if (!(doc.apiConfig && typeof doc.apiConfig[key] === "string")) {
      errs.push(`record-form 必须显式声明 apiConfig.${key}（主键查询/保存端点来自 api.md 契约，不猜测）`);
    }
  }
  validateRecordFormMapping(doc, errs);
  if (!(doc.formSections || []).some((s) => (s.fields || []).length > 0)) {
    errs.push("record-form 必须声明至少一个含字段的 formSections 分区");
  }
}

function validateRecordFormMapping(doc, errs) {
  const mapping = doc.features && doc.features.responseMapping;
  if (!mapping || !mapping.main || !mapping.details) {
    errs.push("record-form 必须声明 features.responseMapping = { main, details }（getByKey 响应的主数据/明细字段名）");
  }
}

function validateScenarioMeta(doc, errs) {
  if (doc.kind !== SCENARIO_KIND) errs.push(`kind 必须是 ${SCENARIO_KIND}`);
  if (doc.schemaVersion !== SCENARIO_SCHEMA_VERSION) errs.push("schemaVersion 必须为 1");
  if (!doc.page || typeof doc.page !== "string") errs.push("缺少 page（页面中文名）");
  if (!doc.pageId || typeof doc.pageId !== "string") errs.push("缺少 pageId（strict page-spec 必填）");
}

function validateScenarioPattern(doc, pattern, options, errs) {
  if (!pattern) {
    errs.push(`pattern "${doc.pattern}" 未登记于 patterns.json 注册表`);
    return;
  }
  if (options.requireImplemented && pattern.status !== "implemented") {
    errs.push(`pattern "${pattern.id}" 状态为 ${pattern.status}，仅 implemented 模式允许 render`);
  }
  validateTrackRequirements(doc, pattern, errs);
}

/**
 * 校验 scenario 文档结构
 * @param {object} input   scenario JSON
 * @param {object} options { requireImplemented: render 前置校验时阻断 planned 模式 }
 * @returns {string[]} 错误列表（空数组 = 合法）
 */
function validateScenario(input, options = {}) {
  const doc = input;
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return ["scenario 不是合法对象"];
  const errs = [];
  validateScenarioMeta(doc, errs);
  validateScenarioPattern(doc, findPattern(doc.pattern), options, errs);
  validateToolbarItems(doc, errs);
  validateOperationItems(doc, errs);
  validateExtensions(doc, errs);
  const specErrs = validateSpecShape(scenarioToPageSpec(doc, { quiet: true }));
  for (const e of specErrs) errs.push(`page-spec 投影非法：${e}`);
  return errs;
}

/** 数组归一：非数组输入统一为空数组，供投影函数使用（降低分支复杂度） */
function arr(value) {
  return Array.isArray(value) ? value : [];
}

const QUERY_PROJECTION_KEYS = [
  "type",
  "dictCode",
  "multiple",
  "defaultValue",
  "required",
  "readonly",
  "startName",
  "endName",
  "constraints",
  "constraintSource",
  "contractField",
];

function projectQueryItem(item) {
  const out = { name: item.name, label: item.label };
  for (const key of QUERY_PROJECTION_KEYS) {
    if (item[key] !== undefined) out[key] = item[key];
  }
  return out;
}

const COLUMN_PROJECTION_KEYS = ["type", "dictCode", "width", "clickable"];

function projectColumnItem(item) {
  const out = { name: item.name, label: item.label };
  for (const key of COLUMN_PROJECTION_KEYS) {
    if (item[key] !== undefined) out[key] = item[key];
  }
  return out;
}

function projectToolbarItem(item) {
  const out = { label: item.label };
  if (item.color) out.color = item.color;
  if (item.plain !== undefined) out.plain = item.plain;
  // openModal 是创建类按钮的默认语义，不进投影；action 仅在非默认触发（lookupFlows 等）时保留
  if (item.action && item.action !== "openModal") out.action = item.action;
  return out;
}

/**
 * scenario → page-spec（既有 S1~S7 门禁的真值格式）
 * 编译专属字段（handler/options/minWidth/align/placeholder 等）不进入投影，
 * 保证投影始终是 page-spec 的合法子集，且 extract→compile→extract 定点往返时
 * page-spec.json 字节级一致。
 */
/** 非列表分页页面：S1~S5 列表比对不适用，投影清空列表字段（结构真值由 W1 字节级防漂移兜底） */
const NON_LIST_PATTERNS = new Set(["record-form", "form-route", "change-history"]);

function scenarioToPageSpec(doc, options = {}) {
  const pattern = findPattern(doc.pattern) || { modes: ["LIST"] };
  const spec = {
    schemaVersion: 1,
    pageId: doc.pageId,
    page: doc.page,
    dir: doc.dir,
    mode: pattern.modes[0],
    profileId: doc.profileId || "jh4j3-openapi3",
    protocolVersion: "1.0",
    apiContract: "api.md",
    openQuestions: [],
    query: arr(doc.query).map(projectQueryItem),
    columns: arr(doc.columns).map(projectColumnItem),
    toolbar: arr(doc.toolbar).map(projectToolbarItem),
    operations: arr(doc.operations).map((op) => ({ label: op.label })),
    formSections: arr(doc.formSections).map(projectFormSection),
    subTables: arr(doc.subTables),
    features: buildSpecFeatures(doc),
  };
  if (NON_LIST_PATTERNS.has(pattern.id)) {
    spec.query = [];
    spec.columns = [];
    spec.toolbar = [];
    spec.operations = [];
  }
  return finishSpec(spec, options);
}

function finishSpec(spec, options) {
  if (options.quiet) return spec;
  const errs = validateSpecShape(spec);
  if (errs.length) {
    throw new Error("scenarioToPageSpec 投影校验失败：" + errs.join("；"));
  }
  return spec;
}

function projectFormSection(section) {
  return {
    name: section.name,
    label: section.label,
    fields: (section.fields || []).map(projectQueryItem),
  };
}

function buildSpecFeatures(doc) {
  const features = { ...(doc.features || {}) };
  if (doc.renderTrack === "runtime") features.definitionSource = "./definition";
  return features;
}

module.exports = {
  SCENARIO_KIND,
  SCENARIO_SCHEMA_VERSION,
  PATTERNS_PATH,
  EXTENSION_SLOTS,
  loadPatterns,
  resetPatternsCache,
  findPattern,
  validateScenario,
  scenarioToPageSpec,
  containsModuleSyntax,
};

"use strict";

/**
 * lib/scenario-fromspec.js — page-spec JSON → wl-scenario JSON 引导转换器
 *
 * 定位：prototype-scan / spec-doc-parse 已产出大量 page-spec；本模块把既有真值
 * 引导为 scenario 事实源，让"原型 → 确定性代码"零手写接通。
 *
 * 边界（诚实声明）：
 *   - page-spec 没有 serviceShort/tableCid/handler 等编译参数 → 调用方必须补齐
 *     （CLI --service/--resource/--table-cid），缺失进 errors
 *   - 业务按钮/操作的 onClick 语义 page-spec 不携带 → 生成 TODO stub + notes 提示，
 *     禁止猜测；stub 需人工替换后才允许 render --confirm
 *   - planned 模式照常转换（validate 通过），render 会被注册表阻断直至编译器实现
 */

const { loadPatterns, validateScenario } = require("./scenario-template");

const CREATE_LABEL_RE = /^(?:新增|新建|添加|创建)/;
const OPERATION_ACTION_BY_LABEL = [
  [/^编辑$/, "edit"],
  [/^删除$/, "del"],
  [/^查看$/, "view"],
];

function patternForMode(mode) {
  const registryMode = String(mode || "").toUpperCase();
  const hit = (loadPatterns().patterns || []).find((p) =>
    (p.modes || []).some((m) => String(m).toUpperCase() === registryMode),
  );
  return hit || null;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

const QUERY_TYPE_INFERRERS = [
  [(item) => item.dictCode || item.type === "dict", (item) => ({ type: "dict", dictCode: item.dictCode })],
  [(item) => item.startName, (item) => ({ type: "dateRange", startName: item.startName, endName: item.endName })],
  [(item) => item.type === "select", (item) => ({ type: "select", options: item.options })],
  [(item) => item.type === "number", () => ({ type: "number" })],
];

function queryTypeOf(item) {
  for (const [match, build] of QUERY_TYPE_INFERRERS) {
    if (match(item)) return build(item);
  }
  return { type: "input" };
}

function queryItemFromSpec(item) {
  const out = { name: item.name, label: item.label, ...queryTypeOf(item) };
  for (const key of ["multiple", "defaultValue", "required", "readonly", "constraints", "constraintSource"]) {
    if (item[key] !== undefined) out[key] = item[key];
  }
  return out;
}

function columnItemFromSpec(item) {
  const out = { name: item.name, label: item.label };
  if (item.dictCode || item.type === "dict") {
    out.type = "dict";
    if (item.dictCode) out.dictCode = item.dictCode;
  }
  if (item.width) out.minWidth = item.width;
  return out;
}

function toolbarItemFromSpec(item, notes) {
  const out = { label: item.label };
  if (item.color) out.color = item.color;
  if (item.plain !== undefined) out.plain = item.plain;
  if (CREATE_LABEL_RE.test(String(item.label || "").trim())) {
    out.action = "openModal";
    return out;
  }
  out.action = "custom";
  out.handler = "() => { /* TODO: wl-api-contract 确认 operation 后实现 */ }";
  notes.push(`工具栏按钮"${item.label}"的 onClick 语义 page-spec 不携带，已生成 TODO stub，需人工实现后再 render`);
  return out;
}

function operationActionFromLabel(label) {
  for (const [re, action] of OPERATION_ACTION_BY_LABEL) {
    if (re.test(String(label || "").trim())) return action;
  }
  return null;
}

function operationItemFromSpec(item, notes) {
  const standard = operationActionFromLabel(item.label);
  if (standard) return { label: item.label, action: standard };
  notes.push(`操作列按钮"${item.label}"无法按 label 判定标准动作，已生成 TODO stub，需人工实现`);
  return {
    label: item.label,
    action: "custom",
    handler: "(row: any) => { /* TODO: wl-api-contract 确认 operation 后实现 */ }",
  };
}

function buildScenarioCore(spec, pattern, notes) {
  return {
    kind: "wl-scenario",
    schemaVersion: 1,
    templateId: `from-spec.${pattern.id}`,
    domain: "",
    pattern: pattern.id,
    renderTrack: pattern.track,
    page: spec.page,
    pageId: spec.pageId || "",
    dir: spec.dir || "",
    query: arr(spec.query).map(queryItemFromSpec),
    columns: arr(spec.columns).map(columnItemFromSpec),
    toolbar: arr(spec.toolbar).map((item) => toolbarItemFromSpec(item, notes)),
    operations: arr(spec.operations).map((item) => operationItemFromSpec(item, notes)),
    formSections: arr(spec.formSections).map((section) => ({
      name: section.name,
      label: section.label,
      fields: arr(section.fields).map(queryItemFromSpec),
    })),
    subTables: arr(spec.subTables),
    features: cleanSpecFeatures(spec.features),
    matchHints: [],
    notes: ["由 wl-skills scenario from-spec 从 page-spec 引导转换", ...notes],
  };
}

function cleanSpecFeatures(features) {
  const cleaned = { ...(features || {}) };
  delete cleaned.definitionSource;
  return cleaned;
}

const COMPILE_PARAM_KEYS = ["serviceShort", "resourceName", "tableCid", "pageAbbr"];

function reportPatternWarnings(pattern, warnings) {
  if (pattern.track === "runtime") {
    warnings.push("runtime 轨 pattern：scenario 还需要补 requires.renderer（项目内渲染器）后才能 render");
  }
  if (pattern.status !== "implemented") {
    warnings.push(`pattern "${pattern.id}" 状态为 ${pattern.status}：validate 可用，render 将被阻断直至编译器实现`);
  }
}

function applyCompileParams(doc, options) {
  for (const key of COMPILE_PARAM_KEYS) {
    if (options[key]) doc[key] = options[key];
  }
  for (const key of ["templateId", "domain"]) {
    if (options[key]) doc[key] = options[key];
  }
  if (options.pageId && !doc.pageId) doc.pageId = options.pageId;
}

function findPatternOrError(spec, errors) {
  const pattern = patternForMode(spec && spec.mode);
  if (!pattern) {
    errors.push(`page-spec mode="${spec && spec.mode}" 未登记于 patterns.json，无法判定 pattern`);
  }
  return pattern;
}

/**
 * page-spec → scenario JSON
 * @param {object} spec page-spec JSON（normalizePageSpec 后形态亦可）
 * @param {object} options { serviceShort, resourceName, tableCid, pageAbbr, templateId, domain }
 * @returns {{ doc: object, warnings: string[], errors: string[] }}
 */
function scenarioFromPageSpec(spec, options = {}) {
  const notes = [];
  const warnings = [];
  const errors = [];
  const pattern = findPatternOrError(spec, errors);
  if (!pattern) return { doc: null, warnings, errors };
  const doc = buildScenarioCore(spec, pattern, notes);
  applyCompileParams(doc, options);
  reportPatternWarnings(pattern, warnings);
  errors.push(...validateScenario(doc));
  return { doc, warnings, errors };
}

module.exports = {
  scenarioFromPageSpec,
};

"use strict";

/**
 * lib/scenario-extract.js — 存量页面 → wl-scenario JSON 确定性提取器
 *
 * 支持两种输入形态：
 *   1. codegen 轨 canonical 页面（TPL-LIST 形态的 data.ts + index.vue）
 *      —— 声明式核心（query/columns/toolbar/operations/API/cid/modal）确定性还原；
 *         extensions 标记块字节级回捞；非 canonical 能力（useTableDelete 等）报告 warning，不静默丢弃
 *   2. runtime 轨页面（data.ts 委托 definition.ts）
 *      —— definition 是纯 JSON 字面量，直接反解析
 *
 * 设计原则：
 *   - 提取结果再编译应回到同一形态（定点往返），测试 tests/scenario-roundtrip.test.js 锁定
 *   - 旧形态页面（operations: 写法、无 cid、dataTable 渲染）允许提取，提取产物按 canonical 升级
 *   - 只做确定性解析，不做语义推断；解析不到的内容进 warnings
 */

const {
  extractMethodBody,
  splitTopLevelObjects,
} = require("./page-spec");
const { loadPatterns } = require("./scenario-template");

const CREATE_LABEL_RE = /^(?:新增|新建|添加|创建)/;
const VALID_COLORS = new Set(["primary", "danger", "warning", "success", "default"]);
const CANONICAL_CLASS_METHODS = new Set(["constructor", "queryDef", "toolbarDef", "columnsDef", "deleteById"]);
const API_KEYS = [
  "list",
  "remove",
  "getById",
  "save",
  "update",
  "export",
  "bottomList",
  "tree",
  "getByKey",
  "saveOrUpdate",
  "changeHistoryList",
  "getDiffById",
];

// ─── 字符串感知的源码扫描 ─────────────────────────────────────────────────

function skipString(text, i) {
  const quote = text[i];
  i += 1;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

/** 从属性值起点扫描到值结尾（顶层逗号/对象闭合），字符串感知 */
function scanPropertyEnd(text, start) {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(text, i);
      continue;
    }
    if ("([{".includes(ch)) {
      depth += 1;
      i += 1;
      continue;
    }
    if (")]}".includes(ch)) {
      if (depth === 0) return i;
      depth -= 1;
      i += 1;
      continue;
    }
    if (ch === "," && depth === 0) return i;
    i += 1;
  }
  return i;
}

/** 捕获对象字面量中某属性的源码文本（括号配平 + 字符串跳过，逗号/对象结尾截止） */
function capturePropertySource(objText, key) {
  const re = new RegExp("(?:^|[\\s,{])" + key + "\\s*:");
  const m = re.exec(objText);
  if (!m) return null;
  let i = m.index + m[0].length;
  while (i < objText.length && /\s/.test(objText[i])) i += 1;
  return objText.slice(i, scanPropertyEnd(objText, i)).trim();
}

function matchStringProperty(objText, key) {
  const re = new RegExp("(?:^|[\\s,{])" + key + "\\s*:\\s*[\"']([^\"']+)[\"']");
  const m = re.exec(objText);
  return m ? m[1] : null;
}

// ─── 基础块提取 ───────────────────────────────────────────────────────────

function sliceApiConfigBlock(content) {
  const start = content.indexOf("export const API_CONFIG = {");
  if (start < 0) return "";
  const from = start + "export const API_CONFIG = ".length;
  let depth = 0;
  let i = from;
  while (i < content.length) {
    const ch = content[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(content, i);
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(from, i + 1);
    }
    i += 1;
  }
  return "";
}

function extractApiConfig(content) {
  const block = sliceApiConfigBlock(content);
  if (!block) return {};
  const found = {};
  for (const key of API_KEYS) {
    const m = new RegExp(`\\b${key}\\s*:\\s*"([^"]+)"`).exec(block);
    if (m) found[key] = m[1];
  }
  return found;
}

function derivedPathsFrom(service, resource) {
  const base = `/${service}/${resource}`;
  return {
    list: `${base}/queryPage`,
    remove: `${base}/deleteById/{id}`,
    getById: `${base}/getById/{id}`,
    save: `${base}/save`,
    update: `${base}/updateById`,
    export: `${base}/export`,
  };
}

const IDENTITY_ANCHOR_KEYS = ["list", "changeHistoryList", "getByKey", "getById"];

/** 以首个可用锚点端点反推 service/resource；与推导基线一致时省略 apiConfig，否则显式保留 */
function resolveApiIdentity(apiConfig) {
  const keys = Object.keys(apiConfig).filter((k) => API_KEYS.includes(k));
  const anchorKey = IDENTITY_ANCHOR_KEYS.find((k) => apiConfig[k]) || keys[0];
  const segments = String(anchorKey ? apiConfig[anchorKey] || "" : "").split("/").filter(Boolean);
  const service = segments[0] || "";
  const resource = segments[1] || "";
  const derived = derivedPathsFrom(service, resource);
  const allDerived = keys.length > 0 && keys.every((key) => derived[key] === apiConfig[key]);
  if (allDerived) return { serviceShort: service, resourceName: resource, apiConfig: null };
  return { serviceShort: service, resourceName: resource, apiConfig: keys.length ? apiConfig : null };
}

function extractDeliveryProfile(content) {
  const pageM = /page:\s*\{\s*current:\s*(\d+),\s*size:\s*(\d+)\s*\}/.exec(content);
  const methodM = /RequestMethod\.(\w+)/.exec(content);
  if (!pageM && !methodM) return null;
  return {
    method: methodM ? methodM[1].toLowerCase() : "post",
    current: pageM ? Number(pageM[1]) : 1,
    size: pageM ? Number(pageM[2]) : 10,
  };
}

function extractOptions(content) {
  const blockM = /const OPTS = \{([\s\S]*?)\n\};/.exec(content);
  if (!blockM) return {};
  const options = {};
  const keyRe = /(\w+):\s*\[([^\]]*?)\]/g;
  let m;
  while ((m = keyRe.exec(blockM[1])) !== null) {
    const name = m[1].replace(/Options$/, "");
    const items = [];
    const pairRe = /label:\s*"([^"]*)",\s*value:\s*"([^"]*)"/g;
    let pair;
    while ((pair = pairRe.exec(m[2])) !== null) items.push({ label: pair[1], value: pair[2] });
    options[name] = items;
  }
  return options;
}

// ─── 声明式核心提取 ───────────────────────────────────────────────────────

function queryTypeOf(obj) {
  if (/logicType:\s*BusLogicDataType\.dict/.test(obj) || /logicValue\s*:/.test(obj)) return "dict";
  if (/startName\s*:/.test(obj)) return "dateRange";
  if (/tag:\s*"jh-select"/.test(obj)) return "select";
  return "input";
}

function extractQueryItems(content) {
  const body = extractMethodBody(content, "queryDef");
  if (!body) return [];
  let objects = splitTopLevelObjects(body);
  if (objects.length === 0) objects = extractHoistedQueryItems(content);
  const options = extractOptions(content);
  return objects.map((obj) => {
    const type = queryTypeOf(obj);
    const item = {
      name: matchStringProperty(obj, "name"),
      label: matchStringProperty(obj, "label"),
      type,
    };
    if (type === "dict") item.dictCode = matchStringProperty(obj, "logicValue");
    if (type === "dateRange") {
      item.startName = matchStringProperty(obj, "startName");
      item.endName = matchStringProperty(obj, "endName");
    }
    if (type === "select" && options[item.name]) item.options = options[item.name];
    const placeholder = matchStringProperty(obj, "placeholder");
    if (placeholder) item.placeholder = placeholder;
    return item;
  });
}

/** 旧形态页面把查询项提升为模块级常量（queryItemsConfig），queryDef 只返回引用 */
function extractHoistedQueryItems(content) {
  const hoistM = /queryItemsConfig[^=]*=\s*\[/.exec(content);
  if (!hoistM) return [];
  const bracketIdx = hoistM.index + hoistM[0].length - 1;
  const body = sliceBracketBody(content, bracketIdx);
  return body ? splitTopLevelObjects("[" + body + "]") : [];
}

function mapColumnObjects(objects) {
  return objects
    .filter((obj) => !/^\{\s*type\s*:/.test(obj.trim()))
    .filter((obj) => matchStringProperty(obj, "name") !== "_action")
    .filter((obj) => !/operations\s*:/.test(obj) && !/renderOps\s*\(/.test(obj))
    .map((obj) => {
      const dictCode = matchStringProperty(obj, "logicValue");
      const minWidthM = /minWidth\s*:\s*(\d+)/.exec(obj);
      const alignM = /align\s*:\s*"(\w+)"/.exec(obj);
      const item = {
        name: matchStringProperty(obj, "name"),
        label: matchStringProperty(obj, "label"),
        minWidth: minWidthM ? Number(minWidthM[1]) : 120,
      };
      if (dictCode) {
        item.type = "dict";
        item.dictCode = dictCode;
      }
      if (alignM) item.align = alignM[1];
      return item;
    });
}

function extractColumns(content) {
  const body = extractMethodBody(content, "columnsDef");
  if (!body) return [];
  return mapColumnObjects(splitTopLevelObjects(body));
}

// ─── master-detail 从表提取 ───────────────────────────────────────────────

function extractSubTableMeta(content) {
  const m = /@wl-scenario-subtable:(\{[^\n]*\})/.exec(content);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function extractBottomRegion(content) {
  const fnIdx = content.indexOf("export function createBottomPage()");
  if (fnIdx >= 0) return content.slice(fnIdx);
  const constM = /export const bottomTableColumns/.exec(content);
  if (constM) return content.slice(constM.index);
  return "";
}

function extractSubTables(content) {
  const meta = extractSubTableMeta(content);
  if (!meta) return [];
  const region = extractBottomRegion(content);
  const body = extractMethodBody(region, "columnsDef");
  const columns = body
    ? mapColumnObjects(splitTopLevelObjects(body))
    : extractPlainColumnsFromConst(region);
  // 键序与 scenario 契约示例一致（name/label/resource/query/...），保证 page-spec 投影定点
  const subTable = {
    name: meta.name || "detail",
    label: meta.label || "明细",
    resource: meta.resource,
    query: [],
    columns,
    toolbar: [],
    operations: [],
  };
  if (!meta.resource) delete subTable.resource;
  return [subTable];
}

/** 从模块级常量数组（bottomTableColumns: TableColumnDesc[] = defineColumns([...])）提取列 */
function extractPlainColumnsFromConst(region) {
  const m = /defineColumns\(\s*\[/.exec(region);
  if (!m) return [];
  const body = sliceBracketBody(region, m.index + m[0].length - 1);
  if (!body) return [];
  return mapColumnObjects(splitTopLevelObjects("[" + body + "]"));
}

function colorOf(obj) {
  const type = matchStringProperty(obj, "type");
  if (type && VALID_COLORS.has(type)) return type;
  const name = matchStringProperty(obj, "name");
  if (name && VALID_COLORS.has(name)) return name;
  return "default";
}

function classifyToolbarAction(label, onClickSource) {
  const isCreate = CREATE_LABEL_RE.test(String(label).trim());
  if (isCreate && /\.open\(\)\s*$/.test(String(onClickSource || ""))) {
    return { action: "openModal" };
  }
  return { action: "custom", handler: onClickSource || "() => {}" };
}

function extractToolbar(content) {
  const body = extractMethodBody(content, "toolbarDef");
  if (!body) return [];
  return splitTopLevelObjects(body)
    .map((obj) => {
      const label = matchStringProperty(obj, "label");
      if (!label) return null;
      const plain = /plain\s*:\s*true/.test(obj);
      const onClick = capturePropertySource(obj, "onClick");
      const classified = classifyToolbarAction(label, onClick);
      const btn = { label, color: colorOf(obj), ...classified };
      if (plain) btn.plain = true;
      return btn;
    })
    .filter(Boolean);
}

function sliceOperationsBody(content) {
  const clean = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const renderM = /renderOps\s*\(\s*\[/.exec(clean);
  if (renderM) return sliceBracketBody(clean, renderM.index + renderM[0].length - 1);
  const operationsM = /\boperations\s*:\s*\[/.exec(clean);
  if (operationsM) return sliceBracketBody(clean, operationsM.index + operationsM[0].length - 1);
  return null;
}

function sliceBracketBody(source, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < source.length; i += 1) {
    if (source[i] === "[") depth += 1;
    else if (source[i] === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(openIdx + 1, i);
    }
  }
  return null;
}

function classifyOperation(type, label) {
  const t = String(type || "");
  if (t === "edit" || label === "编辑") return "edit";
  if (["del", "danger", "remove"].includes(t) || label === "删除") return "del";
  if (t === "view" || label === "查看") return "view";
  return "custom";
}

const OPERATION_TYPE_LABELS = { edit: "编辑", del: "删除", danger: "删除", remove: "删除", view: "查看" };

function extractOperations(content) {
  const body = sliceOperationsBody(content);
  if (!body) return [];
  return splitTopLevelObjects("[" + body + "]")
    .map((obj) => {
      const label = matchStringProperty(obj, "label");
      const type = matchStringProperty(obj, "type") || matchStringProperty(obj, "name");
      const inferredLabel = label || OPERATION_TYPE_LABELS[type] || "";
      if (!inferredLabel) return null;
      const onClick = capturePropertySource(obj, "onClick");
      const action = classifyOperation(type, inferredLabel);
      const op = { label: inferredLabel, action };
      if (action === "custom") op.handler = onClick || "(row: any) => {}";
      return op;
    })
    .filter(Boolean);
}

function extractFormSections(content) {
  if (!/export const modalConfig = \{/.test(content)) return null;
  const formItemsIdx = content.indexOf("formItems: [");
  if (formItemsIdx < 0) return null;
  const bracketIdx = content.indexOf("[", formItemsIdx);
  const body = sliceBracketBody(content, bracketIdx);
  if (!body) return null;
  const fields = splitTopLevelObjects("[" + body + "]")
    .map((obj) => {
      const name = matchStringProperty(obj, "name");
      const label = matchStringProperty(obj, "label");
      if (!name || !label) return null;
      const field = { name, label };
      if (/required\s*:\s*true/.test(obj)) field.required = true;
      const placeholder = matchStringProperty(obj, "placeholder");
      if (placeholder) field.placeholder = placeholder;
      return field;
    })
    .filter(Boolean);
  // 单弹窗场景归一为 base 分区；标题（titlePrefix）由 doc.page 承载，不重复进分区 label
  return [{ name: "base", label: "基本信息", fields }];
}

/** 无 page-spec 时的页面名回退：modalConfig.titlePrefix 是页面语义最强的证据 */
function extractPageTitle(content) {
  const titlePrefix = /titlePrefix\s*:\s*"([^"]+)"/.exec(content);
  return titlePrefix ? titlePrefix[1] : null;
}

// ─── extensions 标记块回捞 ────────────────────────────────────────────────

function captureMarker(content, slot, commentPrefix, commentSuffix) {
  const begin = `${commentPrefix}@wl-scenario-ext:${slot}.begin${commentSuffix}`;
  const end = `${commentPrefix}@wl-scenario-ext:${slot}.end${commentSuffix}`;
  const beginIdx = content.indexOf(begin);
  if (beginIdx < 0) return null;
  const from = beginIdx + begin.length + 1;
  const endIdx = content.indexOf(end, from);
  if (endIdx < 0) return null;
  const code = content.slice(from, endIdx).replace(/\s+$/, "");
  return code.trim() ? { slot, code } : null;
}

function extractExtensions(dataContent, vueContent) {
  const extensions = [];
  const dataSlots = ["customImports", "customMethods"];
  for (const slot of dataSlots) {
    const ext = captureMarker(dataContent, slot, "// ", "");
    if (ext) extensions.push(ext);
  }
  const vueExt = captureMarker(vueContent || "", "template.afterToolbar", "<!-- ", " -->");
  if (vueExt) extensions.push(vueExt);
  return extensions;
}

// ─── 非 canonical 能力提示（不静默丢弃） ──────────────────────────────────

function collectWarnings(content, delegated) {
  const warnings = [];
  if (delegated) return warnings;
  if (/useTableDelete/.test(content)) {
    warnings.push("检测到 useTableDelete：属项目自定义删除能力，提取产物将按标准 deleteById 生命周期重建");
  }
  if (/renderType\s*=\s*ref</.test(content)) {
    warnings.push("检测到运行时切换 renderType：非 canonical 演示能力，未纳入 scenario 核心");
  }
  // extensions 标记块内的方法已被逐字保留，不再按"非 canonical 方法"告警
  const stripped = content
    .replace(/\/\/ @wl-scenario-ext:customMethods\.begin[\s\S]*?\/\/ @wl-scenario-ext:customMethods\.end/g, "")
    .replace(/\/\/ @wl-scenario-ext:customImports\.begin[\s\S]*?\/\/ @wl-scenario-ext:customImports\.end/g, "");
  const methodRe = /^\s{4}(?:async\s+)?(\w+)\s*\(/gm;
  let m;
  const extras = new Set();
  while ((m = methodRe.exec(stripped)) !== null) {
    if (!CANONICAL_CLASS_METHODS.has(m[1])) extras.add(m[1]);
  }
  for (const name of extras) {
    warnings.push(`检测到非 canonical 类方法 "${name}"：请确认已进 extensions.customMethods，否则编译产物将不包含它`);
  }
  return warnings;
}

// ─── pattern 推断 ─────────────────────────────────────────────────────────

function patternIdFromMode(mode) {
  if (!mode) return null;
  const registry = loadPatterns();
  const hit = (registry.patterns || []).find((p) => (p.modes || []).includes(mode));
  return hit ? hit.id : null;
}

// ─── runtime 轨（definition 委托）提取 ───────────────────────────────────

function parseDefinitionExport(definitionContent) {
  const marker = "export const pageDefinition = ";
  const idx = definitionContent.indexOf(marker);
  if (idx < 0) return { error: "definition.ts 缺少 pageDefinition 导出" };
  const braceIdx = definitionContent.indexOf("{", idx);
  const body = sliceBracketBodyLean(definitionContent, braceIdx);
  if (!body) return { error: "definition.ts pageDefinition 对象不完整" };
  try {
    return { definition: JSON.parse(body) };
  } catch (e) {
    return { error: "definition.ts pageDefinition 不是纯 JSON 字面量：" + e.message };
  }
}

function prop(obj, key, fallback) {
  const value = obj ? obj[key] : undefined;
  return value === undefined || value === null ? fallback : value;
}

function extractRenderer(vueContent) {
  const rendererM = /import PatternPageRenderer from "([^"]+)"/.exec(vueContent || "");
  return rendererM ? { renderer: rendererM[1] } : {};
}

function buildRuntimeDoc(definition, vueContent, pageSpec, options) {
  const features = { ...prop(definition, "features", {}) };
  delete features.definitionSource;
  return {
    kind: "wl-scenario",
    schemaVersion: 1,
    templateId: options.templateId || definition.templateId || "",
    domain: options.domain || "",
    pattern: definition.pattern,
    renderTrack: "runtime",
    page: definition.page,
    pageId: definition.pageId,
    dir: prop(pageSpec, "dir", options.dir || ""),
    apiConfig: definition.apiConfig,
    deliveryProfile: definition.deliveryProfile,
    query: prop(definition, "query", []),
    columns: prop(definition, "columns", []),
    toolbar: prop(definition, "toolbar", []),
    operations: prop(definition, "operations", []),
    formSections: prop(definition, "formSections", []),
    subTables: prop(definition, "subTables", []),
    features,
    requires: extractRenderer(vueContent),
    extensions: [],
    matchHints: [],
  };
}

function extractFromDefinition(definitionContent, vueContent, pageSpec, options) {
  const parsed = parseDefinitionExport(definitionContent);
  if (parsed.error) return { doc: null, warnings: [parsed.error] };
  return { doc: buildRuntimeDoc(parsed.definition, vueContent, pageSpec, options), warnings: [] };
}

function sliceBracketBodyLean(source, openIdx) {
  let depth = 0;
  let i = openIdx;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openIdx, i + 1);
    }
    i += 1;
  }
  return null;
}

// ─── record-form / form-route / change-history / tree-list 专项提取 ──────

/** 字符串感知的顶层对象切分（保留注释，用于读取对象内 @wl-scenario-section 标记） */
function splitObjectsRaw(arrayBody) {
  const objects = [];
  let i = 0;
  while (i < arrayBody.length) {
    const open = arrayBody.indexOf("{", i);
    if (open < 0) break;
    let depth = 0;
    let j = open;
    while (j < arrayBody.length) {
      const ch = arrayBody[j];
      if (ch === '"' || ch === "'" || ch === "`") {
        j = skipString(arrayBody, j);
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
      j += 1;
    }
    objects.push(arrayBody.slice(open, j + 1));
    i = j + 1;
  }
  return objects;
}

/** 模块级分区表单数组（@wl-scenario-section 标记 + c_spliterTitle title） */
function extractSectionedFormItems(content) {
  const m = /export const formItems: BaseFormItemDesc<any>\[\] = \[/.exec(content);
  if (!m) return [];
  const body = sliceBracketBody(content, m.index + m[0].length - 1);
  if (!body) return [];
  const sections = [];
  let current = null;
  for (const obj of splitObjectsRaw(body)) {
    const markerM = /@wl-scenario-section:([\w-]+)/.exec(obj);
    const titleM = /title:\s*"([^"]+)"/.exec(obj);
    if (titleM) {
      current = {
        name: markerM ? markerM[1] : `section${sections.length + 1}`,
        label: titleM[1],
        fields: [],
      };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    const field = extractPlainField(obj);
    if (field) current.fields.push(field);
  }
  return sections;
}

function extractPlainField(obj) {
  const name = matchStringProperty(obj, "name");
  const label = matchStringProperty(obj, "label");
  if (!name || !label) return null;
  const field = { name, label };
  const dictCode = matchStringProperty(obj, "logicValue");
  if (dictCode) {
    field.type = "dict";
    field.dictCode = dictCode;
  }
  if (/required\s*:\s*true/.test(obj)) field.required = true;
  const placeholder = matchStringProperty(obj, "placeholder");
  if (placeholder) field.placeholder = placeholder;
  return field;
}

/** 模块级主键查询数组（record-form：export const queryItems = [...]） */
function extractModuleQueryItems(content) {
  const m = /export const queryItems: BaseQueryItemDesc<any>\[\] = \[/.exec(content);
  if (!m) return [];
  const body = sliceBracketBody(content, m.index + m[0].length - 1);
  if (!body) return [];
  return splitObjectsRaw(body)
    .map(extractPlainField)
    .filter(Boolean);
}

function extractResponseMapping(content) {
  const mainM = /res\.data\?\.\w+/.exec(content);
  const detailsM = /res\.data\?\.\w+\s*\|\|\s*\[\]/.exec(content);
  if (!mainM || !detailsM) return null;
  return { main: mainM[0].replace("res.data?.", ""), details: detailsM[0].replace(/res\.data\?\.(\w+)\s*\|\|.*/, "$1") };
}

function extractUsePageName(content) {
  const m = /export function use(\w+)Form\(/.exec(content);
  return m ? m[1] : null;
}

function extractTabsComponent(vueContent) {
  const m = /import (c_\w+) from "@\/components\/local\/(c_\w+)\/index\.vue";/.exec(vueContent || "");
  return m ? m[1] : null;
}

function extractDetailTitle(vueContent) {
  const m = /class="page-title">([^<]+)</.exec(vueContent || "");
  return m ? m[1] : null;
}

const PATTERN_EXTRACTORS = {
  "tree-list": applyTreeListExtraction,
  "record-form": applyRecordFormExtraction,
  "form-route": applyFormRouteExtraction,
  "change-history": applyChangeHistoryExtraction,
};

function applyPatternExtraction(doc, dataContent, vueContent) {
  const extractor = PATTERN_EXTRACTORS[doc.pattern];
  if (extractor) extractor(doc, dataContent, vueContent);
}

function applyTreeListExtraction(doc) {
  const treePath = doc.apiConfig && doc.apiConfig.tree;
  if (!treePath) return;
  doc.treeResource = treePath.split("/")[2] || "";
  delete doc.apiConfig.tree;
  if (doc.apiConfig && Object.keys(doc.apiConfig).length === 0) delete doc.apiConfig;
  // 删除 tree 键后重算 identity：剩余端点若与推导基线一致则省略 apiConfig（保证定点往返）
  if (doc.apiConfig) {
    const identity = resolveApiIdentity(doc.apiConfig);
    doc.serviceShort = identity.serviceShort;
    doc.resourceName = identity.resourceName;
    if (!identity.apiConfig) delete doc.apiConfig;
  }
}

function applyRecordFormExtraction(doc, dataContent) {
  doc.query = extractModuleQueryItems(dataContent);
  doc.formSections = extractSectionedFormItems(dataContent);
  doc.subTables = extractSubTables(dataContent);
  doc.tableCid = extractTableCidAny(dataContent) || doc.tableCid;
  const mapping = extractResponseMapping(dataContent);
  if (mapping) doc.features.responseMapping = mapping;
}

function applyFormRouteExtraction(doc, dataContent) {
  doc.formSections = extractSectionedFormItems(dataContent);
  doc.tableCid = extractTableCidAny(dataContent) || doc.tableCid;
  const useName = extractUsePageName(dataContent);
  if (useName && !doc.resourceName) doc.resourceName = useName;
}

function applyChangeHistoryExtraction(doc, dataContent, vueContent) {
  const tabs = extractTabsComponent(vueContent);
  if (tabs) doc.requires = { components: [tabs] };
  const title = extractDetailTitle(vueContent);
  if (title) doc.listTitle = title;
}



function isDelegatedData(dataContent) {
  return /import\s*\{[^}]*\bpageDefinition\b[^}]*\}\s*from/.test(dataContent);
}

function extractDelegated(inputs, options) {
  const result = extractFromDefinition(inputs.definitionContent, inputs.vueContent, inputs.pageSpec, options);
  return { ...result, warnings: [...result.warnings, ...collectWarnings(inputs.dataContent, true)] };
}

const PATTERN_DETECTORS = [
  [(data, vue) => /useChangeHistory/.test(data) || /history-panel/.test(vue), "change-history"],
  [(data, vue) => /jh-drag-col/.test(vue) || /loadTree/.test(data), "tree-list"],
  [(data, vue) => /createBottomPage/.test(data) || /jh-drag-row/.test(vue), "master-detail"],
  [(data) => /saveOrUpdate/.test(data) || /bottomTableData/.test(data), "record-form"],
  [(data, vue) => /route\.query\.id/.test(vue) && /handleCancel/.test(data), "form-route"],
];

function detectPatternId(dataContent, vueContent, mode) {
  const byMode = patternIdFromMode(mode);
  if (byMode) return byMode;
  const vue = vueContent || "";
  for (const [match, pattern] of PATTERN_DETECTORS) {
    if (match(dataContent, vue)) return pattern;
  }
  return "list";
}

function extractTableCidAny(content) {
  return (
    /export const TABLE_CID = "([^"]+)"/.exec(content)?.[1] ||
    /export const BOTTOM_TABLE_CID = "([^"]+)"/.exec(content)?.[1] ||
    /export const FORM_TABLE_CID = "([^"]+)"/.exec(content)?.[1] ||
    null
  );
}

function buildCodegenDoc(inputs, options) {
  const { dataContent, vueContent, pageSpec } = inputs;
  const apiConfig = extractApiConfig(dataContent);
  const identity = resolveApiIdentity(apiConfig);
  const formSections = extractFormSections(dataContent);
  const doc = {
    kind: "wl-scenario",
    schemaVersion: 1,
    templateId: options.templateId || "",
    domain: options.domain || "",
    pattern: detectPatternId(dataContent, vueContent, prop(pageSpec, "mode", null)),
    renderTrack: "codegen",
    page: prop(pageSpec, "page", extractPageTitle(dataContent) || "未命名页面"),
    pageId: prop(pageSpec, "pageId", options.pageId || ""),
    dir: prop(pageSpec, "dir", options.dir || ""),
    serviceShort: identity.serviceShort,
    resourceName: identity.resourceName,
    tableCid: options.tableCid || extractTableCidAny(dataContent),
    deliveryProfile: extractDeliveryProfile(dataContent),
    query: extractQueryItems(dataContent),
    columns: extractColumns(dataContent),
    toolbar: extractToolbar(dataContent),
    operations: extractOperations(dataContent),
    formSections: formSections || [],
    features: cleanFeatures(prop(pageSpec, "features", null)),
    extensions: extractExtensions(dataContent, vueContent),
    matchHints: [],
    notes: ["由 wl-skills scenario extract 从存量页面提取"],
  };
  if (identity.apiConfig) doc.apiConfig = identity.apiConfig;
  if (doc.pattern === "master-detail") doc.subTables = extractSubTables(dataContent);
  applyPatternExtraction(doc, dataContent, vueContent);
  return { doc, warnings: collectWarnings(dataContent, false) };
}

/**
 * 从页面源码提取 scenario JSON
 * @param {object} inputs { dataContent, vueContent?, definitionContent?, pageSpec?, options? }
 * @returns {{ doc: object|null, warnings: string[] }}
 */
function extractScenario(inputs) {
  const options = inputs.options || {};
  if (isDelegatedData(inputs.dataContent || "")) return extractDelegated(inputs, options);
  return buildCodegenDoc(inputs, options);
}

function cleanFeatures(features) {
  const cleaned = { ...(features || {}) };
  delete cleaned.definitionSource;
  return cleaned;
}

module.exports = {
  extractScenario,
  capturePropertySource,
  skipString,
};

"use strict";

/**
 * 页面蓝图（Page Blueprint）提取器。
 *
 * 目标是把成熟页面压缩为不含业务代码的结构化事实：页面形态、字段槽位、
 * 操作语义、组件能力、字典/接口依赖和质量信号。提取过程只做确定性扫描，
 * 不调用模型、不上传源码；AI 只消费生成的 JSON，显著减少上下文体积和猜测。
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  extractFieldSequence,
  extractMethodBody,
  extractOperationSequence,
  extractToolbarSequence,
  readPageSpec,
  validateSpecShape,
} = require("./page-spec");

const BLUEPRINT_SCHEMA_VERSION = 1;
const BLUEPRINT_KIND = "wl-page-blueprint";
const DEFAULT_OUTPUT_ROOT = ".wl-skills/templates/blueprints";

const COMPONENT_RULES = [
  ["BaseTable", "table"],
  ["BaseQuery", "query"],
  ["BaseForm", "form"],
  ["jh-pagination", "pagination"],
  ["jh-dialog", "dialog"],
  ["el-dialog", "dialog"],
  ["el-tabs", "tabs"],
  ["jh-drag-row", "drag-layout"],
  ["AGGrid", "ag-grid"],
];

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function safeResolve(root, input) {
  const full = path.resolve(root, input || "");
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw new Error("路径越界：只能读取项目根目录内的页面");
  }
  return full;
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function pageSourceFiles(root, pagePath) {
  const pageDir = safeResolve(root, pagePath);
  const stat = fs.existsSync(pageDir) ? fs.statSync(pageDir) : null;
  const dir = stat?.isDirectory() ? pageDir : path.dirname(pageDir);
  const relDir = normalizePath(path.relative(root, dir));
  const files = {
    indexVue: readText(path.join(dir, "index.vue")),
    dataTs: readText(path.join(dir, "data.ts")),
    apiMd: readText(path.join(dir, "api.md")),
    pageSpec: readText(path.join(dir, "page-spec.json")),
  };
  if (!files.indexVue) throw new Error(`目标页面缺少 index.vue：${relDir}`);
  return { dir, relDir, files };
}

function inferDomain(relDir) {
  const parts = normalizePath(relDir).split("/").filter(Boolean);
  const viewsIndex = parts.indexOf("views");
  return parts[viewsIndex + 1] || parts[0] || "general";
}

function slug(value, fallback) {
  const result = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return result || fallback;
}

function inferScene(mode, template) {
  if (mode) return slug(mode, "custom").replace(/_/g, "-");
  if (/<BaseTable\b/.test(template) && /jh-pagination/.test(template)) return "list";
  if (/<BaseTable\b/.test(template) && /<el-tabs\b/.test(template)) return "detail-tabs";
  if (/<BaseForm\b|<el-form\b/.test(template)) return "form";
  return "custom";
}

function componentSignals(template) {
  const components = [];
  for (const [tag, capability] of COMPONENT_RULES) {
    const count = (template.match(new RegExp(`<${tag}\\b`, "g")) || []).length;
    if (count > 0) components.push({ capability, count });
  }
  return components;
}

function actionKind(item) {
  const value = `${item?.action || ""} ${item?.name || ""} ${item?.label || ""}`;
  const patterns = [
    [/新增|新建|添加|创建|create|add/i, "create"],
    [/编辑|修改|更新|edit|update/i, "update"],
    [/删除|移除|delete|remove/i, "delete"],
    [/详情|查看|预览|detail|view/i, "view"],
    [/导入|import/i, "import"],
    [/导出|export/i, "export"],
    [/查询|搜索|筛选|search|query/i, "query"],
  ];
  const matched = patterns.find(([pattern]) => pattern.test(value));
  if (matched) return matched[1];
  return "custom";
}

function requiredSlotValue(item) {
  if (item?.required === true) return true;
  if (item?.required === false) return false;
  return null;
}

function slotItems(items, kind) {
  return (items || []).map((item, index) => ({
    slot: `${kind}_${index + 1}`,
    role: actionKind(item) === "custom" ? kind : actionKind(item),
    required: requiredSlotValue(item),
    control: item?.type || item?.component || null,
    hasDictionary: Boolean(item?.dictCode || item?.dict),
  }));
}

function sanitizePageSpec(spec) {
  if (!spec) return { spec: null, warnings: ["未发现 page-spec.json，字段槽位由代码结构提取"] };
  const errors = validateSpecShape(spec);
  return {
    spec,
    warnings: errors.length ? errors.map((error) => `page-spec: ${error}`) : [],
  };
}

function extractSlots(dataTs, spec) {
  const query = spec?.query || extractFieldSequence(extractMethodBody(dataTs, "queryDef"));
  const columns = spec?.columns || extractFieldSequence(extractMethodBody(dataTs, "columnsDef"));
  const toolbar = spec?.toolbar || extractToolbarSequence(extractMethodBody(dataTs, "toolbarDef"));
  const operations = spec?.operations || extractOperationSequence(dataTs);
  return {
    query: slotItems(query, "query"),
    columns: slotItems(columns, "column"),
    toolbar: slotItems(toolbar, "toolbar"),
    operations: slotItems(operations, "operation"),
  };
}

function operationKindFromPath(url, index) {
  const value = String(url || "").toLowerCase();
  const patterns = [
    [/\b(list|page|search|query)\b/, "list"],
    [/\b(create|add|insert|save)\b/, "create"],
    [/\b(update|edit|modify)\b/, "update"],
    [/\b(delete|remove|destroy)\b/, "delete"],
    [/\b(detail|get|find|info)\b/, "detail"],
    [/\b(import|upload)\b/, "import"],
    [/\b(export|download)\b/, "export"],
  ];
  return patterns.find(([pattern]) => pattern.test(value))?.[1] || `custom_${index + 1}`;
}

function requestLocation(method, url, context) {
  if (/[{][^}]+[}]/.test(url)) return "path";
  if (["GET", "DELETE"].includes(method)) return "query";
  if (/请求体|request\s*body|body\s*[:：]/i.test(context)) return "body";
  if (["POST", "PUT", "PATCH"].includes(method)) return "body";
  return "unknown";
}

function extractApiOperations(source) {
  const text = String(source || "");
  const candidates = [];
  for (const match of text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+((?:https?:\/\/|\/)[^\s<>)`]+)(?:\s|$)/gi)) {
    candidates.push({ method: match[1].toUpperCase(), url: match[2].replace(/[.,;]+$/, ""), context: text.slice(Math.max(0, match.index - 120), match.index + match[0].length + 120) });
  }
  for (const match of text.matchAll(/(?:["'`])((?:\/|https?:\/\/)[^"'`\s]+)(?:["'`])/g)) {
    const url = match[1];
    const context = text.slice(Math.max(0, match.index - 120), match.index + match[0].length + 120);
    const method = (context.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/i) || [])[1]?.toUpperCase() || "UNKNOWN";
    candidates.push({ method, url, context });
  }
  const unique = [...new Map(candidates
    .filter(({ url }) => !url.startsWith("http://localhost") && !url.startsWith("https://localhost"))
    .map((item) => [`${item.method}:${item.url}`, item])).values()];
  const used = new Set();
  return unique.slice(0, 20).map(({ method, url, context }, index) => {
    let operation = operationKindFromPath(url, index);
    if (used.has(operation)) operation = `custom_${index + 1}`;
    used.add(operation);
    return {
      operation,
      method,
      request: requestLocation(method, url, context),
      pathTemplate: "/<service>/<resource>/<operation>",
    };
  });
}

function extractDictionarySlots(dataTs, spec) {
  const codes = new Set();
  const source = JSON.stringify(spec || {}) + "\n" + dataTs;
  for (const match of source.matchAll(/(?:dictCode|logicValue|dict)\s*[:=]\s*["']([^"']+)["']/g)) {
    codes.add(match[1]);
  }
  return [...codes].map((code, index) => ({
    code: `dict_${index + 1}`,
    dependencyId: `dep_${crypto.createHash("sha256").update(code).digest("hex").slice(0, 10)}`,
    usage: "explicit",
  }));
}

function extractFormSections(spec) {
  return (spec?.formSections || []).map((section, index) => ({
    slot: `form_section_${index + 1}`,
    fieldCount: Array.isArray(section?.fields) ? section.fields.length : 0,
    hasRequiredAndOptional: Array.isArray(section?.fields)
      ? new Set(section.fields.map((field) => field?.required)).size > 1
      : false,
  }));
}

function normalizeBlueprint(value) {
  return JSON.parse(JSON.stringify(value));
}

function blueprintHash(blueprint) {
  return crypto.createHash("sha256").update(JSON.stringify(normalizeBlueprint(blueprint))).digest("hex");
}

function buildPageBlueprint(root, inputPath, options = {}) {
  const { relDir, files } = pageSourceFiles(root, inputPath);
  const pageSpecResult = readPageSpec(path.join(root, relDir));
  const { spec, warnings: shapeWarnings } = sanitizePageSpec(pageSpecResult.spec);
  const warnings = pageSpecResult.error
    ? [...shapeWarnings, pageSpecResult.error]
    : shapeWarnings;
  const template = files.indexVue;
  const domain = slug(options.domain || inferDomain(relDir), "general");
  const scene = slug(options.scene || inferScene(spec?.mode, template), "custom");
  const slots = extractSlots(files.dataTs, spec);
  const components = componentSignals(template);
  const blueprint = {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    kind: BLUEPRINT_KIND,
    blueprintId: `${domain}.${scene}`,
    domain,
    scene,
    source: {
      pagePath: relDir,
      sourceHash: crypto.createHash("sha256").update(Object.values(files).join("\u0000")).digest("hex"),
    },
    shape: {
      mode: spec?.mode || inferScene(null, template).toUpperCase(),
      components,
      slots,
      apiOperations: extractApiOperations(`${files.dataTs}\n${files.apiMd}`),
      dictionaries: extractDictionarySlots(`${files.dataTs}\n${files.apiMd}`, spec),
      formSections: extractFormSections(spec),
    },
    constraints: {
      usesAgGrid: /render-type=["']agGrid["']/.test(template),
      hasPagination: /jh-pagination\b/.test(template),
      hasPageSpec: Boolean(spec),
      requiresVIfForDialogGrid: /<(?:jh-dialog|el-dialog)\b[\s\S]*render-type=["']agGrid["']/.test(template),
    },
    quality: {
      score: Math.max(0, Math.min(100, 100 - warnings.length * 15 - (spec ? 0 : 10))),
      warnings,
    },
  };
  blueprint.fingerprint = blueprintHash({ ...blueprint, source: undefined, fingerprint: undefined });
  return blueprint;
}

function validatePageBlueprint(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["蓝图必须是对象"];
  return [
    ...validateBlueprintIdentity(input),
    ...validateBlueprintSource(input.source),
    ...validateBlueprintShape(input.shape),
    ...validateBlueprintConstraints(input.constraints),
    ...validateBlueprintQuality(input.quality),
    ...validateBlueprintFingerprint(input),
  ];
}

function validateBlueprintIdentity(input) {
  const errors = [];
  if (input.kind !== BLUEPRINT_KIND) errors.push(`kind 必须为 ${BLUEPRINT_KIND}`);
  if (input.schemaVersion !== BLUEPRINT_SCHEMA_VERSION) errors.push(`schemaVersion 必须为 ${BLUEPRINT_SCHEMA_VERSION}`);
  for (const key of ["blueprintId", "domain", "scene"]) {
    if (typeof input[key] !== "string" || !input[key].trim()) errors.push(`缺少 ${key}`);
  }
  return errors;
}

function validateBlueprintSource(source) {
  if (!source || typeof source !== "object") return ["缺少 source 对象"];
  const errors = [];
  if (typeof source.pagePath !== "string" || !source.pagePath.trim()) errors.push("source.pagePath 必须是非空字符串");
  if (typeof source.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(source.sourceHash)) {
    errors.push("source.sourceHash 必须是 sha256");
  }
  return errors;
}

function validateBlueprintConstraints(constraints) {
  if (!constraints || typeof constraints !== "object") return ["缺少 constraints 对象"];
  return ["usesAgGrid", "hasPagination", "hasPageSpec", "requiresVIfForDialogGrid"]
    .filter((key) => typeof constraints[key] !== "boolean")
    .map((key) => `constraints.${key} 必须是 boolean`);
}

function validateBlueprintQuality(quality) {
  if (!quality || typeof quality !== "object") return ["缺少 quality 对象"];
  const errors = [];
  if (!Number.isInteger(quality.score) || quality.score < 0 || quality.score > 100) errors.push("quality.score 必须是 0~100 的整数");
  if (!Array.isArray(quality.warnings) || quality.warnings.some((warning) => typeof warning !== "string")) {
    errors.push("quality.warnings 必须是字符串数组");
  }
  return errors;
}

function validateBlueprintShape(shape) {
  if (!shape || typeof shape !== "object") return ["缺少 shape 对象"];
  return [
    ...(typeof shape.mode === "string" && shape.mode.trim() ? [] : ["shape.mode 必须是非空字符串"]),
    ...validateShapeArrays(shape),
    ...validateShapeSlots(shape.slots),
    ...validateShapeItems(shape),
  ];
}

function validateShapeArrays(shape) {
  return ["components", "apiOperations", "dictionaries", "formSections"]
    .filter((key) => !Array.isArray(shape[key]))
    .map((key) => `shape.${key} 必须是数组`);
}

function validateShapeSlots(slots) {
  if (!slots || typeof slots !== "object") return ["shape.slots 必须是对象"];
  return ["query", "columns", "toolbar", "operations"].flatMap((key) => {
    if (!Array.isArray(slots[key])) return [`shape.slots.${key} 必须是数组`];
    return validateBlueprintSlots(slots[key], key);
  });
}

function validateShapeItems(shape) {
  return [
    ...validateComponentItems(shape.components),
    ...validateApiItems(shape.apiOperations),
    ...validateDictionaryItems(shape.dictionaries),
    ...validateFormSectionItems(shape.formSections),
  ];
}

function validateComponentItems(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item, index) => item && typeof item === "object" && typeof item.capability === "string" && Number.isInteger(item.count) && item.count >= 1
    ? []
    : [`shape.components[${index}] 结构无效`]);
}

function validateApiItems(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item, index) => item && typeof item === "object" && typeof item.operation === "string" && ["GET", "POST", "PUT", "PATCH", "DELETE", "UNKNOWN"].includes(item.method) && ["path", "query", "body", "unknown"].includes(item.request) && item.pathTemplate === "/<service>/<resource>/<operation>"
    ? []
    : [`shape.apiOperations[${index}] 结构无效`]);
}

function validateDictionaryItems(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item, index) => item && typeof item === "object" && typeof item.code === "string" && /^dep_[a-f0-9]{10}$/.test(item.dependencyId) && item.usage === "explicit"
    ? []
    : [`shape.dictionaries[${index}] 结构无效`]);
}

function validateFormSectionItems(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item, index) => item && typeof item === "object" && typeof item.slot === "string" && Number.isInteger(item.fieldCount) && item.fieldCount >= 0 && typeof item.hasRequiredAndOptional === "boolean"
    ? []
    : [`shape.formSections[${index}] 结构无效`]);
}

function validateBlueprintSlots(items, key) {
  return items.flatMap((item, index) => {
    const valid = item && typeof item === "object"
      && typeof item.slot === "string"
      && typeof item.role === "string"
      && (typeof item.required === "boolean" || item.required === null)
      && (typeof item.control === "string" || item.control === null)
      && typeof item.hasDictionary === "boolean";
    return valid ? [] : [`shape.slots.${key}[${index}] 结构无效`];
  });
}

function validateBlueprintFingerprint(input) {
  if (typeof input.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(input.fingerprint)) {
    return ["fingerprint 必须是 sha256"];
  }
  const expected = blueprintHash({ ...input, source: undefined, fingerprint: undefined });
  return input.fingerprint === expected ? [] : ["fingerprint 与蓝图内容不一致，请重新提取"];
}

function resolveBlueprintOutput(root, domain, scene, outputPath) {
  const relative = outputPath || path.posix.join(DEFAULT_OUTPUT_ROOT, slug(domain, "general"), slug(scene, "custom"), "blueprint.json");
  return safeResolve(root, relative);
}

function writePageBlueprint(root, blueprint, outputPath) {
  const target = resolveBlueprintOutput(root, blueprint.domain, blueprint.scene, outputPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(blueprint, null, 2)}\n`);
    fs.renameSync(temporary, target);
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort cleanup */ }
    throw new Error(`蓝图写入失败：${error.message}`);
  }
  return normalizePath(path.relative(root, target));
}

function readPageBlueprint(root, inputPath) {
  const target = safeResolve(root, inputPath);
  if (!fs.existsSync(target)) throw new Error(`蓝图文件不存在：${inputPath}`);
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (error) {
    throw new Error(`蓝图 JSON 解析失败：${error.message}`);
  }
}

function summarizeBlueprint(blueprint) {
  const shape = blueprint.shape || {};
  const slots = shape.slots || {};
  const count = (items) => Array.isArray(items) ? items.length : 0;
  return {
    blueprintId: blueprint.blueprintId,
    domain: blueprint.domain,
    scene: blueprint.scene,
    mode: shape.mode || "custom",
    querySlots: count(slots.query),
    columnSlots: count(slots.columns),
    toolbarSlots: count(slots.toolbar),
    operationSlots: count(slots.operations),
    apiOperations: count(shape.apiOperations),
    dictionarySlots: count(shape.dictionaries),
    qualityScore: blueprint.quality?.score ?? 0,
  };
}

module.exports = {
  BLUEPRINT_KIND,
  BLUEPRINT_SCHEMA_VERSION,
  DEFAULT_OUTPUT_ROOT,
  buildPageBlueprint,
  resolveBlueprintOutput,
  writePageBlueprint,
  readPageBlueprint,
  validatePageBlueprint,
  summarizeBlueprint,
};

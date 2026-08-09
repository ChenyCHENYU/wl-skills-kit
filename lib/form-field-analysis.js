"use strict";

/**
 * 从 c_formModal、BaseForm 与 c_formSections 的实际绑定中保守提取字段。
 * 只认可可静态确认的对象字面量；遇到计算属性、spread 或跨文件动态配置时不猜测，
 * 从而避免把 queryDef/columnsDef 里的 name 误算成表单字段。
 */

const FORM_FIELD_THRESHOLD = 10;

function escapedPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scanLineComment(state, char) {
  if (char === "\n") state.mode = "code";
  return 0;
}

function scanBlockComment(state, char, next) {
  if (char !== "*" || next !== "/") return 0;
  state.mode = "code";
  return 1;
}

function scanString(state, char) {
  if (char === "\\") return 1;
  if (char === state.quote) state.mode = "code";
  return 0;
}

const NON_CODE_SCANNERS = {
  lineComment: scanLineComment,
  blockComment: scanBlockComment,
  string: scanString,
};

function scanNonCode(state, char, next) {
  const scanner = NON_CODE_SCANNERS[state.mode];
  return scanner ? scanner(state, char, next) : null;
}

function commentMode(char, next) {
  if (char !== "/") return "";
  if (next === "/") return "lineComment";
  if (next === "*") return "blockComment";
  return "";
}

function stringQuote(char) {
  return ['"', "'", "`"].includes(char) ? char : "";
}

function beginCodeToken(state, char, next) {
  const comment = commentMode(char, next);
  const quote = stringQuote(char);
  state.mode = comment || (quote ? "string" : "code");
  state.quote = quote;
}

function tokenDepth(char, open, close) {
  if (char === open) return 1;
  if (char === close) return -1;
  return 0;
}

function codeAction(state, char, next, open, close) {
  beginCodeToken(state, char, next);
  return {
    advance: ["lineComment", "blockComment"].includes(state.mode) ? 1 : 0,
    depth: tokenDepth(char, open, close),
  };
}

function scanBalancedEnd(source, start, open, close) {
  let depth = 0;
  const state = { mode: "code", quote: "" };
  for (let index = start; index < source.length; index++) {
    const skipped = scanNonCode(state, source[index], source[index + 1]);
    if (skipped !== null) {
      index += skipped;
      continue;
    }
    const action = codeAction(state, source[index], source[index + 1], open, close);
    index += action.advance;
    depth += action.depth;
    if (action.depth < 0 && depth === 0) return index;
  }
  return -1;
}

function balancedSegment(source, start, open, close) {
  if (source[start] !== open) return "";
  const end = scanBalancedEnd(source, start, open, close);
  return end < 0 ? "" : source.slice(start, end + 1);
}

function assignedObject(source, identifier) {
  const name = escapedPattern(identifier);
  const assignment = new RegExp(`\\b(?:const|let)\\s+${name}(?:\\s*:[^=;]+)?\\s*=`).exec(source);
  if (!assignment) return "";
  const start = source.indexOf("{", assignment.index + assignment[0].length);
  return start < 0 ? "" : balancedSegment(source, start, "{", "}");
}

function assignedArray(source, identifier) {
  const name = escapedPattern(identifier);
  const assignment = new RegExp(`\\b(?:const|let)\\s+${name}(?:\\s*:[^=;]+)?\\s*=`).exec(source);
  if (!assignment) return "";
  const start = source.indexOf("[", assignment.index + assignment[0].length);
  return start < 0 ? "" : balancedSegment(source, start, "[", "]");
}

function namedArray(source, propertyName) {
  const marker = new RegExp(`\\b${escapedPattern(propertyName)}\\s*:`).exec(source);
  if (!marker) return "";
  const start = source.indexOf("[", marker.index + marker[0].length);
  return start < 0 ? "" : balancedSegment(source, start, "[", "]");
}

function topLevelObjects(arraySource) {
  const objects = [];
  for (let index = 1; index < arraySource.length - 1; index++) {
    if (arraySource[index] !== "{") continue;
    const object = balancedSegment(arraySource, index, "{", "}");
    if (!object) break;
    objects.push(object);
    index += object.length - 1;
  }
  return objects;
}

function literalFieldStats(arraySource) {
  const fields = topLevelObjects(arraySource).filter((item) =>
    /\b(?:name|prop)\s*:\s*['"`][^'"`]+['"`]/.test(item),
  );
  const required = fields.filter((item) => /\brequired\s*:\s*true\b/.test(item)).length;
  return { total: fields.length, required };
}

function tagBindings(template, tagPattern, attribute) {
  const bindings = [];
  const tag = new RegExp(`<${tagPattern}\\b([^>]*?)>`, "g");
  const attr = escapedPattern(attribute);
  for (const match of template.matchAll(tag)) {
    const attrs = match[1];
    const binding = attrs.match(
      new RegExp(`(?:^|\\s)(?::${attr}|v-bind:${attr})\\s*=\\s*["']([A-Za-z_$][\\w$]*)["']`),
    )?.[1];
    if (binding) bindings.push({ binding, attrs });
  }
  return bindings;
}

function modalBindings(template) {
  const bindings = [];
  for (const match of template.matchAll(/<(?:c_formModal|CFormModal|c-form-modal)\b([^>]*?)>/g)) {
    const attrs = match[1];
    const binding = attrs.match(/\bv-bind\s*=\s*["']([A-Za-z_$][\w$]*)["']/)?.[1];
    if (binding) bindings.push({ binding, attrs });
  }
  return bindings;
}

function booleanAttributeEnabled(attrs, attribute) {
  const name = escapedPattern(attribute);
  const match = attrs.match(
    new RegExp(`(?:^|\\s)(?::|v-bind:)?${name}(?:\\s*=\\s*["']([^"']+)["'])?(?=\\s|/|$)`),
  );
  if (!match) return false;
  if (match[1] === undefined || match[1] === "") return true;
  return match[1].trim() === "true";
}

function formResult(kind, binding, stats, enabled, capability) {
  const mixed = stats.required > 0 && stats.required < stats.total;
  return {
    kind,
    binding,
    ...stats,
    enabled,
    capability,
    eligible: stats.total >= FORM_FIELD_THRESHOLD && mixed,
  };
}

function analyzeModalForms(template, dataSource) {
  return modalBindings(template).map(({ binding, attrs }) => {
    const config = assignedObject(dataSource, binding);
    const formItems = config ? namedArray(config, "formItems") : "";
    const stats = formItems ? literalFieldStats(formItems) : { total: 0, required: 0 };
    return formResult(
      "modal",
      binding,
      stats,
      booleanAttributeEnabled(attrs, "show-required-toggle"),
      "show-required-toggle",
    );
  });
}

function composableBindings(source) {
  const bindings = new Map();
  const pattern = /const\s*\{([\s\S]*?)\}\s*=\s*useFormRequiredOnly(?:<[^>]+>)?\s*\(\s*([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(pattern)) {
    const visible = match[1].match(/\bvisibleItems\b\s*(?::\s*([A-Za-z_$][\w$]*))?/);
    if (visible) bindings.set(visible[1] || "visibleItems", match[2]);
  }
  return bindings;
}

function analyzeBaseForms(template, source) {
  const controlled = composableBindings(source);
  return tagBindings(template, "(?:BaseForm|base-form)", "items").map(({ binding }) => {
    const sourceBinding = controlled.get(binding) || binding;
    const formItems = assignedArray(source, sourceBinding);
    const stats = formItems ? literalFieldStats(formItems) : { total: 0, required: 0 };
    return formResult(
      "base-form",
      sourceBinding,
      stats,
      controlled.has(binding),
      "useFormRequiredOnly + visibleItems",
    );
  });
}

function sectionFieldStats(arraySource) {
  return topLevelObjects(arraySource).reduce((result, section) => {
    const fields = namedArray(section, "fieldsConfig");
    if (!fields) return result;
    const stats = literalFieldStats(fields);
    result.total += stats.total;
    result.required += stats.required;
    return result;
  }, { total: 0, required: 0 });
}

function analyzeSectionForms(template, source) {
  return tagBindings(template, "(?:c_formSections|CFormSections|c-form-sections)", "sections")
    .map(({ binding, attrs }) => {
      const sections = assignedArray(source, binding);
      const stats = sections ? sectionFieldStats(sections) : { total: 0, required: 0 };
      return formResult(
        "form-sections",
        binding,
        stats,
        booleanAttributeEnabled(attrs, "show-required-filter"),
        "show-required-filter",
      );
    });
}

function analyzeFormRequiredOnly(template, source) {
  return [
    ...analyzeModalForms(template, source),
    ...analyzeBaseForms(template, source),
    ...analyzeSectionForms(template, source),
  ];
}

module.exports = {
  FORM_FIELD_THRESHOLD,
  analyzeFormRequiredOnly,
  analyzeModalForms,
  literalFieldStats,
  sectionFieldStats,
};

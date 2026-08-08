"use strict";

/**
 * 从 c_formModal 的实际 v-bind 配置中保守提取 formItems。
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
    /\bname\s*:\s*['"`][^'"`]+['"`]/.test(item),
  );
  const required = fields.filter((item) => /\brequired\s*:\s*true\b/.test(item)).length;
  return { total: fields.length, required };
}

function modalBindings(template) {
  const bindings = [];
  for (const match of template.matchAll(/<c_formModal\b([^>]*?)>/g)) {
    const binding = match[1].match(/\bv-bind\s*=\s*["']([A-Za-z_$][\w$]*)["']/)?.[1];
    if (binding && !bindings.includes(binding)) bindings.push(binding);
  }
  return bindings;
}

function analyzeModalForms(template, dataSource) {
  return modalBindings(template).map((binding) => {
    const config = assignedObject(dataSource, binding);
    const formItems = config ? namedArray(config, "formItems") : "";
    const stats = formItems ? literalFieldStats(formItems) : { total: 0, required: 0 };
    const mixed = stats.required > 0 && stats.required < stats.total;
    return {
      binding,
      ...stats,
      eligible: stats.total >= FORM_FIELD_THRESHOLD && mixed,
    };
  });
}

module.exports = {
  FORM_FIELD_THRESHOLD,
  analyzeModalForms,
  literalFieldStats,
};

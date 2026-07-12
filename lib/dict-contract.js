"use strict";

const fs = require("fs");
const path = require("path");

const SCHEMA_VERSION = 1;
const ORDER_FIELDS = new Set([
  "STR_KEY",
  "STR_VALUE1",
  "STR_VALUE2",
  "STR_VALUE3",
  "STR_VALUE4",
]);
const ORDER_DIRECTIONS = new Set(["asc", "desc"]);
const ORDER_VALUE_FIELDS = {
  STR_KEY: "value",
  STR_VALUE1: "label",
  STR_VALUE2: "value2",
  STR_VALUE3: "value3",
  STR_VALUE4: "value4",
};
const DICT_ALIGNMENT_RULE = { rule: "D1" };

function nonEmpty(value) {
  return value != null && String(value).trim() !== "";
}

function asText(value) {
  return value == null ? "" : String(value);
}

function compareText(left, right) {
  const a = asText(left);
  const b = asText(right);
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sortDictionaryItems(items, order) {
  const field = ORDER_VALUE_FIELDS[order.field];
  const direction = order.direction === "desc" ? -1 : 1;
  return [...items].sort((a, b) => direction * compareText(a[field], b[field]));
}

function normalizeItem(item) {
  const normalized = {
    value: asText(item.value),
    label: asText(item.label),
  };
  for (const field of ["value2", "value3", "value4", "valueCode"]) {
    if (item[field] != null) normalized[field] = asText(item[field]);
  }
  return normalized;
}

function normalizeDictionary(dictionary) {
  const order = {
    field: dictionary.order && dictionary.order.field,
    direction: dictionary.order && String(dictionary.order.direction).toLowerCase(),
  };
  const items = Array.isArray(dictionary.items)
    ? dictionary.items.map(normalizeItem)
    : [];
  return {
    code: asText(dictionary.code),
    name: asText(dictionary.name),
    order,
    items: ORDER_FIELDS.has(order.field) && ORDER_DIRECTIONS.has(order.direction)
      ? sortDictionaryItems(items, order)
      : items,
    sources: Array.from(new Set((dictionary.sources || []).map(asText))).sort(),
  };
}

function normalizeModule(module = {}) {
  const normalized = {
    code: asText(module.code),
    name: asText(module.name),
  };
  if (module.sortPriority != null) normalized.sortPriority = asText(module.sortPriority);
  return normalized;
}

function normalizeModuleContract(contract) {
  const dictionaries = Array.isArray(contract && contract.dictionaries)
    ? contract.dictionaries
    : [];
  return {
    schemaVersion: Number(contract && contract.schemaVersion),
    module: normalizeModule(contract && contract.module),
    dictionaries: dictionaries.map(normalizeDictionary).sort((a, b) => compareText(a.code, b.code)),
  };
}

function validateContractHeader(contract, source, errors) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    errors.push(`${source}: 字典契约必须是对象`);
    return false;
  }
  if (Number(contract.schemaVersion) !== SCHEMA_VERSION) {
    errors.push(`${source}: schemaVersion 必须为 ${SCHEMA_VERSION}`);
  }
  if (!contract.module || !nonEmpty(contract.module.code) || !nonEmpty(contract.module.name)) {
    errors.push(`${source}: module.code 和 module.name 必填`);
  }
  if (!Array.isArray(contract.dictionaries)) {
    errors.push(`${source}: dictionaries 必须是数组`);
    return false;
  }
  return true;
}

function validateOrder(dictionary, source, errors, warnings) {
  const { code, order = {} } = dictionary;
  if (!ORDER_FIELDS.has(order.field)) {
    errors.push(`${source}: ${code}.order.field 必须是 ${Array.from(ORDER_FIELDS).join("/")}`);
  }
  const direction = asText(order.direction).toLowerCase();
  if (!ORDER_DIRECTIONS.has(direction)) {
    errors.push(`${source}: ${code}.order.direction 必须是 asc/desc`);
  }
  if (!ORDER_FIELDS.has(order.field) || !ORDER_DIRECTIONS.has(direction)) return;

  const normalized = dictionary.items.map(normalizeItem);
  const expected = sortDictionaryItems(normalized, { field: order.field, direction });
  const actualOrder = normalized.map((item) => item.value).join("\u0000");
  const expectedOrder = expected.map((item) => item.value).join("\u0000");
  if (actualOrder !== expectedOrder) {
    errors.push(`${source}: ${code}.items 顺序与 ${order.field} ${direction} 不一致`);
  }
  if (order.field !== "STR_KEY") {
    warnings.push(`${source}: ${code} 使用 ${order.field} 排序，需确认目标数据库字符集/排序规则一致`);
  }
}

function validateItems(dictionary, source, errors) {
  const values = new Map();
  const labels = new Map();
  for (const [itemIndex, item] of dictionary.items.entries()) {
    const itemLabel = `${source}: ${dictionary.code}.items[${itemIndex}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${itemLabel} 必须是对象`);
      continue;
    }
    if (!nonEmpty(item.value) || !nonEmpty(item.label)) {
      errors.push(`${itemLabel}.value 和 label 必填`);
      continue;
    }
    const value = asText(item.value);
    const display = asText(item.label);
    if (values.has(value)) errors.push(`${source}: ${dictionary.code} 存在重复 value=${value}`);
    else values.set(value, display);
    if (labels.has(display) && labels.get(display) !== value) {
      errors.push(`${source}: ${dictionary.code} 的 label=${display} 对应多个 value`);
    } else {
      labels.set(display, value);
    }
  }
}

function validateDictionary(dictionary, dictIndex, source, dictCodes, errors, warnings) {
  const label = `${source}: dictionaries[${dictIndex}]`;
  if (!dictionary || typeof dictionary !== "object" || Array.isArray(dictionary)) {
    errors.push(`${label} 必须是对象`);
    return;
  }
  if (!nonEmpty(dictionary.code) || !nonEmpty(dictionary.name)) {
    errors.push(`${label}.code 和 name 必填`);
    return;
  }
  const code = asText(dictionary.code);
  if (dictCodes.has(code)) errors.push(`${source}: 字典编码重复: ${code}`);
  dictCodes.add(code);
  validateOrder(dictionary, source, errors, warnings);
  if (!Array.isArray(dictionary.items) || dictionary.items.length === 0) {
    errors.push(`${source}: ${code}.items 必须是非空数组`);
    return;
  }
  validateItems(dictionary, source, errors);
}

function validateModuleContract(contract, options = {}) {
  const errors = [];
  const warnings = [];
  const source = options.source || "dicts.ts";
  if (!validateContractHeader(contract, source, errors)) {
    return { ok: false, errors, warnings };
  }
  const dictCodes = new Set();
  contract.dictionaries.forEach((dictionary, index) => {
    validateDictionary(dictionary, index, source, dictCodes, errors, warnings);
  });
  return { ok: errors.length === 0, errors, warnings };
}

function unwrapExpression(node) {
  let current = node;
  while (current && ["TSAsExpression", "TSSatisfiesExpression", "TypeCastExpression"].includes(current.type)) {
    current = current.expression;
  }
  return current;
}

function propertyName(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "StringLiteral" || node.type === "NumericLiteral") return String(node.value);
  return "";
}

function literalFromAst(rawNode, sourceLabel) {
  const node = unwrapExpression(rawNode);
  if (!node) throw new Error(`${sourceLabel}: 缺少表达式`);
  const readers = {
    StringLiteral: () => node.value,
    NumericLiteral: () => node.value,
    BooleanLiteral: () => node.value,
    NullLiteral: () => null,
    UnaryExpression: () => readUnaryLiteral(node, sourceLabel),
    ArrayExpression: () => node.elements.map((element) => literalFromAst(element, sourceLabel)),
    ObjectExpression: () => readObjectLiteral(node, sourceLabel),
  };
  if (readers[node.type]) return readers[node.type]();
  throw new Error(`${sourceLabel}: 仅允许 JSON 兼容的静态字面量，发现 ${node.type}`);
}

function readUnaryLiteral(node, sourceLabel) {
  if (node.operator === "-" && node.argument.type === "NumericLiteral") return -node.argument.value;
  throw new Error(`${sourceLabel}: 仅允许负数一元表达式`);
}

function readObjectLiteral(node, sourceLabel) {
  const result = {};
  for (const property of node.properties) {
    if (property.type !== "ObjectProperty" || property.computed) {
      throw new Error(`${sourceLabel}: 仅允许静态对象属性，禁止展开、计算属性和方法`);
    }
    const key = propertyName(property.key);
    if (!key) throw new Error(`${sourceLabel}: 无法识别对象属性名`);
    result[key] = literalFromAst(property.value, sourceLabel);
  }
  return result;
}

function loadBabelParser() {
  try {
    return require("@babel/parser");
  } catch {
    throw new Error("解析 dicts.ts 需要 @babel/parser，请安装后重试");
  }
}

function validatePublishedSources(contract, sourceLabel) {
  const missing = contract.dictionaries
    .filter((dictionary) => !Array.isArray(dictionary.sources) || dictionary.sources.length === 0)
    .map((dictionary) => dictionary.code);
  if (missing.length > 0) {
    throw new Error(`${sourceLabel}: 发布字典缺少 api.md sources: ${missing.join(", ")}`);
  }
}

function parseModuleContractSource(source, sourceLabel = "dicts.ts") {
  const parser = loadBabelParser();
  const ast = parser.parse(source, {
    sourceType: "module",
    plugins: ["typescript"],
  });
  const initializer = findContractInitializer(ast.program.body);
  if (!initializer) throw new Error(`${sourceLabel}: 未找到 export const MODULE_DICTIONARIES`);
  const contract = literalFromAst(initializer, sourceLabel);
  const validation = validateModuleContract(contract, { source: sourceLabel });
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  validatePublishedSources(contract, sourceLabel);
  return normalizeModuleContract(contract);
}

function findContractInitializer(statements) {
  for (const statement of statements) {
    const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (!declaration || declaration.type !== "VariableDeclaration") continue;
    const found = declaration.declarations.find((item) =>
      item.id && item.id.type === "Identifier" && item.id.name === "MODULE_DICTIONARIES");
    if (found) return found.init;
  }
  return null;
}

function readModuleContract(filePath) {
  return parseModuleContractSource(fs.readFileSync(filePath, "utf8"), filePath);
}

function extractApiContracts(markdown, sourcePath) {
  const contracts = [];
  const pattern = /```dict-contract\s*\r?\n([\s\S]*?)\r?\n```/g;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    let contract;
    try {
      contract = JSON.parse(match[1]);
    } catch (error) {
      throw new Error(`${sourcePath}: dict-contract JSON 解析失败: ${error.message}`);
    }
    const validation = validateModuleContract(contract, { source: sourcePath });
    if (!validation.ok) throw new Error(validation.errors.join("\n"));
    const normalized = normalizeModuleContract(contract);
    for (const dictionary of normalized.dictionaries) {
      dictionary.sources = Array.from(new Set([...(dictionary.sources || []), sourcePath])).sort();
    }
    contracts.push(normalized);
  }
  return contracts;
}

function ensureSameModule(contract, merged, sourceLabel) {
  if (contract.module.code !== merged.module.code || contract.module.name !== merged.module.name) {
    throw new Error(`${sourceLabel}: 同一模块目录出现不同 module.code/name`);
  }
}

function ensureSameDictionary(existing, dictionary, sourceLabel) {
  const same = existing.name === dictionary.name &&
    existing.order.field === dictionary.order.field &&
    existing.order.direction === dictionary.order.direction;
  if (!same) throw new Error(`${sourceLabel}: 字典 ${dictionary.code} 的名称或排序契约冲突`);
}

function mergeDictionaryItems(existing, dictionary, sourceLabel) {
  const itemsByValue = new Map(existing.items.map((item) => [item.value, item]));
  const valueByLabel = new Map(existing.items.map((item) => [item.label, item.value]));
  for (const item of dictionary.items) {
    const sameValue = itemsByValue.get(item.value);
    if (sameValue && JSON.stringify(sameValue) !== JSON.stringify(item)) {
      throw new Error(`${sourceLabel}: 字典 ${dictionary.code} 的 value=${item.value} 定义冲突`);
    }
    if (valueByLabel.has(item.label) && valueByLabel.get(item.label) !== item.value) {
      throw new Error(`${sourceLabel}: 字典 ${dictionary.code} 的 label=${item.label} 对应多个 value`);
    }
    if (sameValue) continue;
    existing.items.push(item);
    itemsByValue.set(item.value, item);
    valueByLabel.set(item.label, item.value);
  }
  existing.items = sortDictionaryItems(existing.items, existing.order);
  existing.sources = Array.from(new Set([...existing.sources, ...dictionary.sources])).sort();
}

function addOrMergeDictionary(dictionary, merged, byCode, sourceLabel) {
  const existing = byCode.get(dictionary.code);
  if (!existing) {
    const clone = { ...dictionary, items: [...dictionary.items], sources: [...dictionary.sources] };
    byCode.set(dictionary.code, clone);
    merged.dictionaries.push(clone);
    return;
  }
  ensureSameDictionary(existing, dictionary, sourceLabel);
  mergeDictionaryItems(existing, dictionary, sourceLabel);
}

function mergeContracts(contracts, sourceLabel = "api.md") {
  if (!Array.isArray(contracts) || contracts.length === 0) {
    throw new Error(`${sourceLabel}: 未找到可合并的 dict-contract`);
  }
  const first = normalizeModuleContract(contracts[0]);
  const merged = {
    schemaVersion: SCHEMA_VERSION,
    module: { ...first.module },
    dictionaries: [],
  };
  const byCode = new Map();

  for (const rawContract of contracts) {
    const contract = normalizeModuleContract(rawContract);
    ensureSameModule(contract, merged, sourceLabel);
    for (const dictionary of contract.dictionaries) {
      addOrMergeDictionary(dictionary, merged, byCode, sourceLabel);
    }
  }

  merged.dictionaries.sort((a, b) => compareText(a.code, b.code));
  const validation = validateModuleContract(merged, { source: sourceLabel });
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  return merged;
}

function toBackendPayloads(contract) {
  const normalized = normalizeModuleContract(contract);
  return normalized.dictionaries.map((dictionary) => ({
    module: {
      strSn: normalized.module.code,
      strName: normalized.module.name,
      ...(normalized.module.sortPriority != null
        ? { sortPriority: normalized.module.sortPriority }
        : {}),
    },
    dict: {
      strSn: dictionary.code,
      strName: dictionary.name,
      orderField: dictionary.order.field,
      orderRule: dictionary.order.direction,
    },
    items: dictionary.items.map((item) => ({
      value: item.value,
      label: item.label,
      ...(item.value2 != null ? { strValue2: item.value2 } : {}),
      ...(item.value3 != null ? { strValue3: item.value3 } : {}),
      ...(item.value4 != null ? { strValue4: item.value4 } : {}),
      ...(item.valueCode != null ? { strValueCode: item.valueCode } : {}),
    })),
    sources: dictionary.sources,
  }));
}

function formatModuleContract(contract) {
  const normalized = normalizeModuleContract(contract);
  return [
    "/**",
    " * 模块字典发布契约。由页面 api.md 的 dict-contract 汇总；MCP 仅从本文件读取待发布数据。",
    " * 禁止写函数、变量引用或动态表达式，确保可静态校验和审计。",
    " */",
    `export const MODULE_DICTIONARIES = ${JSON.stringify(normalized, null, 2)} as const`,
    "",
  ].join("\n");
}

function findApiFiles(moduleRoot) {
  const result = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "dist", "target"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "api.md") result.push(full);
    }
  }
  walk(moduleRoot);
  return result.sort();
}

function collectModuleContract(moduleRoot) {
  const contracts = [];
  for (const apiPath of findApiFiles(moduleRoot)) {
    const relative = path.relative(moduleRoot, apiPath).replace(/\\/g, "/");
    contracts.push(...extractApiContracts(fs.readFileSync(apiPath, "utf8"), relative));
  }
  return mergeContracts(contracts, moduleRoot);
}

function dictionaryMap(contract) {
  return new Map(contract.dictionaries.map((dictionary) => [dictionary.code, dictionary]));
}

function compareDictionary(expected, actual, source, errors) {
  if (!actual) {
    errors.push(`${source}: dicts.ts 缺少字典 ${expected.code}`);
    return;
  }
  if (actual.name !== expected.name ||
      actual.order.field !== expected.order.field ||
      actual.order.direction !== expected.order.direction) {
    errors.push(`${source}: 字典 ${expected.code} 的名称或排序契约与 api.md 不一致`);
    return;
  }
  const actualItems = new Map(actual.items.map((item) => [item.value, item]));
  for (const item of expected.items) {
    const current = actualItems.get(item.value);
    if (!current || JSON.stringify(current) !== JSON.stringify(item)) {
      errors.push(`${source}: 字典 ${expected.code} 的 value=${item.value} 未汇总或定义不一致`);
    }
  }
}

function validateContractAlignment(moduleRoot) {
  const { rule } = DICT_ALIGNMENT_RULE;
  const dictPath = path.join(moduleRoot, "dicts.ts");
  const errors = [];
  const warnings = [];
  let actual;
  let expected;
  try {
    actual = readModuleContract(dictPath);
  } catch (error) {
    return { ok: false, errors: [error.message], warnings, rule };
  }
  try {
    expected = collectModuleContract(moduleRoot);
  } catch (error) {
    if (/未找到可合并/.test(error.message)) {
      warnings.push(`${dictPath}: 未在模块 api.md 中找到 dict-contract，无法验证来源闭环`);
      return { ok: true, errors, warnings, rule };
    }
    return { ok: false, errors: [error.message], warnings, rule };
  }
  if (actual.module.code !== expected.module.code || actual.module.name !== expected.module.name) {
    errors.push(`${dictPath}: module.code/name 与 api.md 不一致`);
  }
  const actualByCode = dictionaryMap(actual);
  for (const dictionary of expected.dictionaries) {
    compareDictionary(dictionary, actualByCode.get(dictionary.code), dictPath, errors);
  }
  return { ok: errors.length === 0, errors, warnings, rule };
}

module.exports = {
  SCHEMA_VERSION,
  ORDER_FIELDS,
  ORDER_DIRECTIONS,
  collectModuleContract,
  extractApiContracts,
  findApiFiles,
  formatModuleContract,
  mergeContracts,
  normalizeModuleContract,
  parseModuleContractSource,
  readModuleContract,
  sortDictionaryItems,
  toBackendPayloads,
  validateContractAlignment,
  validateModuleContract,
};

"use strict";

// One validation boundary for MCP and other declared JSON Schema contracts.
// Ajv is already a runtime dependency of each package. Loading and compilation
// are lazy; invalid calls neither coerce arguments nor add/remove properties.
const validators = new WeakMap();
const engines = new Map();
function dialect(schema) {
  const declared = schema?.$schema;
  if (!declared || /2020-12\/schema#?$/.test(declared)) return "2020";
  if (/draft-07\/schema#?$/.test(declared)) return "07";
  if (/2019-09\/schema#?$/.test(declared)) return "2019";
  throw new Error(`不支持的 JSON Schema 方言: ${declared}`);
}
function engine(version) {
  if (engines.has(version)) return engines.get(version);
  const modules = { "2020": "ajv/dist/2020", "2019": "ajv/dist/2019", "07": "ajv" };
  const Ajv = require(modules[version]);
  const instance = new Ajv({ allErrors: true, strict: false, addUsedSchema: false, ownProperties: true,
    coerceTypes: false, useDefaults: false, removeAdditional: false, logger: false });
  engines.set(version, instance);
  return instance;
}
function compiled(schema) {
  if (schema === true || schema === false) return engine("2020").compile(schema);
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("Schema 必须是对象或布尔值");
  if (schema.$async) throw new Error("工具契约不支持异步 Schema");
  if (!validators.has(schema)) validators.set(schema, engine(dialect(schema)).compile(schema));
  return validators.get(schema);
}
function errorText(error) {
  const location = "$" + (error.instancePath || "").replace(/\/([^/]+)/g, (_, key) => /^\d+$/.test(key) ? `[${key}]` : `.${key.replace(/~1/g, "/").replace(/~0/g, "~")}`);
  if (error.keyword === "required") return `${location}.${error.params.missingProperty} 为必填项`;
  if (error.keyword === "additionalProperties") return `${location}.${error.params.additionalProperty} 是未声明参数`;
  if (error.keyword === "type") return `${location} 类型应为 ${error.params.type}`;
  if (error.keyword === "pattern") return `${location} 格式不匹配`;
  if (error.keyword === "enum") return `${location} 必须是 ${error.params.allowedValues.map(value => JSON.stringify(value)).join(" / ")}`;
  if (error.keyword === "const") return `${location} 必须等于 ${JSON.stringify(error.params.allowedValue)}`;
  return `${location} ${error.message || error.keyword}`;
}
function validateSchema(schema, value) {
  try {
    const validate = compiled(schema);
    const valid = validate(value);
    return { valid, errors: valid ? [] : validate.errors.map(errorText) };
  } catch (error) {
    return { valid: false, errors: [`Schema 契约不可用: ${error.message}`], schemaError: true };
  }
}
// Some MCP hosts reject otherwise valid root anyOf/allOf schemas. Project only
// the two shapes owned by these packages; validation always uses the original.
const rootCombinators = ["anyOf", "allOf", "oneOf"];
const object = value => value && typeof value === "object" && !Array.isArray(value);
const keysOnly = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
function projectionAssert(valid) {
  if (!valid) throw new Error("不支持的顶层组合 Schema 结构");
}
function requiredFields(schema, fields) {
  return Array.isArray(fields) && fields.length > 0 && new Set(fields).size === fields.length
    && fields.every(key => typeof key === "string" && Object.hasOwn(schema.properties, key));
}
function projectionRoot(schema) {
  projectionAssert(object(schema) && schema.type === "object" && object(schema.properties));
  projectionAssert(!["oneOf", "if", "then", "else", "not", "$ref", "unevaluatedProperties"].some(key => Object.hasOwn(schema, key)));
}
function cursorBranch(branch) {
  if (!keysOnly(branch, ["type", "required", "properties"]) || branch.type !== "object") return false;
  const response = branch.properties?.response;
  return branch.required?.join() === "response" && keysOnly(branch.properties, ["response"])
    && keysOnly(response, ["type", "required"]) && response.type === "object" && response.required?.join() === "cursor";
}
function cursorUnionHint(schema) {
  const branches = schema.anyOf;
  projectionAssert(Array.isArray(branches) && branches.length === 2);
  const primary = branches[0];
  projectionAssert(keysOnly(primary, ["type", "required"]) && primary.type === "object" && requiredFields(schema, primary.required));
  projectionAssert(cursorBranch(branches[1]) && Object.hasOwn(schema.properties.response?.properties || {}, "cursor"));
  return `首次调用需 ${primary.required.join("、")}；response.cursor 为续取入口`;
}
function conditionLabel(schema, key, constraint) {
  projectionAssert(Object.hasOwn(schema.properties, key) && keysOnly(constraint, ["const", "enum"]) && Object.keys(constraint).length === 1);
  const values = Object.hasOwn(constraint, "const") ? [constraint.const] : constraint.enum;
  projectionAssert(Array.isArray(values) && values.length > 0);
  projectionAssert(values.every(value => value === null || ["string", "number", "boolean"].includes(typeof value)));
  return `${key}=${values.map(value => JSON.stringify(value)).join("/")}`;
}
function conditionalHint(schema, clause) {
  projectionAssert(keysOnly(clause, ["if", "then"]) && keysOnly(clause.if, ["required", "properties"]));
  projectionAssert(object(clause.if.properties) && Object.keys(clause.if.properties).length > 0);
  projectionAssert(keysOnly(clause.then, ["required"]) && requiredFields(schema, clause.then.required));
  if (clause.if.required !== undefined) {
    projectionAssert(requiredFields(schema, clause.if.required) && clause.if.required.every(key => Object.hasOwn(clause.if.properties, key)));
  }
  const labels = Object.entries(clause.if.properties).map(([key, constraint]) => conditionLabel(schema, key, constraint));
  return `${labels.join(" 且 ")} 时还需 ${clause.then.required.join("、")}`;
}
function projectionHints(schema) {
  const hints = [];
  if (Object.hasOwn(schema, "anyOf")) hints.push(cursorUnionHint(schema));
  if (Object.hasOwn(schema, "allOf")) {
    projectionAssert(Array.isArray(schema.allOf) && schema.allOf.length > 0);
    hints.push(...schema.allOf.map(clause => conditionalHint(schema, clause)));
  }
  return hints;
}
function projectMcpToolSchema(definition) {
  const schema = definition?.inputSchema;
  const rootKeywords = rootCombinators.filter(key => Object.hasOwn(schema || {}, key));
  if (!rootKeywords.length) return definition;
  projectionRoot(schema);
  const hints = projectionHints(schema);
  const inputSchema = { ...schema };
  for (const key of rootKeywords) delete inputSchema[key];
  return {
    ...definition,
    description: `${definition.description || ""} 参数条件仍由服务端严格校验：${hints.join("；")}。`,
    inputSchema,
    _meta: { ...definition._meta, "wl/schemaProjection": { serverEnforced: true, equivalent: false, omittedRootKeywords: rootKeywords } },
  };
}
module.exports = { validateSchema, projectMcpToolSchema };

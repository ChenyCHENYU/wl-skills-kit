"use strict";

function matchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function describeValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validateAnyOf(schema, value, path, errors) {
  if (Array.isArray(schema.anyOf)) {
    const matched = schema.anyOf.some((branch) => {
      const branchErrors = [];
      validateNode(branch, value, path, branchErrors);
      return branchErrors.length === 0;
    });
    if (!matched) errors.push(`${path} 不满足任何允许的参数组合`);
  }
}

function validateAllowedValues(schema, value, path, errors) {
  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    errors.push(`${path} 必须等于 ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    errors.push(`${path} 必须是 ${schema.enum.map((item) => JSON.stringify(item)).join(" / ")}`);
  }
}

function validateType(schema, value, path, errors) {
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      errors.push(`${path} 类型应为 ${types.join("/")}，实际为 ${describeValue(value)}`);
      return false;
    }
  }
  return true;
}

function validateObject(schema, value, path, errors) {
  if (!matchesType(value, "object")) return;
  const properties = schema.properties || {};
  for (const name of schema.required || []) {
    if (!Object.prototype.hasOwnProperty.call(value, name)) {
      errors.push(`${path}.${name} 为必填项`);
    }
  }
  for (const [name, item] of Object.entries(value)) {
    if (Object.prototype.hasOwnProperty.call(properties, name)) {
      validateNode(properties[name], item, `${path}.${name}`, errors);
    } else if (schema.additionalProperties === false) {
      errors.push(`${path}.${name} 是未声明参数`);
    }
  }
}

function validateArray(schema, value, path, errors) {
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateNode(schema.items, item, `${path}[${index}]`, errors));
  }
}

function validateNode(schema, value, path, errors) {
  if (!schema || typeof schema !== "object") return;
  validateAnyOf(schema, value, path, errors);
  validateAllowedValues(schema, value, path, errors);
  if (!validateType(schema, value, path, errors)) return;
  validateObject(schema, value, path, errors);
  validateArray(schema, value, path, errors);
}

function validateSchema(schema, value) {
  const errors = [];
  validateNode(schema, value, "$", errors);
  return { valid: errors.length === 0, errors };
}

module.exports = { validateSchema };

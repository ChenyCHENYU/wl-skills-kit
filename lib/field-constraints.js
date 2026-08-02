"use strict";

/**
 * 字段边界契约的共享校验器。
 *
 * 设计目标：
 * - 只校验契约中显式声明的约束，不根据字段名、标签或数据库习惯猜测。
 * - page-spec 与 wl-api-contract 使用同一套约束语义，避免两套规则漂移。
 * - 未声明约束时静默跳过；严格模式只要求已声明约束提供可追溯来源。
 */

const STRING_CONSTRAINTS = new Set(["minLength", "maxLength", "pattern"]);
const NUMBER_CONSTRAINTS = new Set([
  "minimum",
  "maximum",
  "minExclusive",
  "maxExclusive",
  "step",
  "totalDigits",
  "fractionDigits",
]);
const SUPPORTED_CONSTRAINTS = new Set([
  ...STRING_CONSTRAINTS,
  ...NUMBER_CONSTRAINTS,
]);
const STRING_TYPES = new Set(["string", "input", "text", "textarea"]);
const NUMBER_TYPES = new Set(["number", "integer"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateSupportedKeys(constraints, location, errors) {
  for (const key of Object.keys(constraints)) {
    if (!SUPPORTED_CONSTRAINTS.has(key)) {
      errors.push(`${location}.${key} 不是受支持的字段约束`);
    }
  }
}

function validateLengthValues(constraints, location, errors) {
  for (const key of ["minLength", "maxLength"]) {
    if (constraints[key] !== undefined && !isNonNegativeInteger(constraints[key])) {
      errors.push(`${location}.${key} 必须是非负整数`);
    }
  }
}

function validateLengthOrder(constraints, location, errors) {
  if (
    isNonNegativeInteger(constraints.minLength) &&
    isNonNegativeInteger(constraints.maxLength) &&
    constraints.minLength > constraints.maxLength
  ) {
    errors.push(`${location}.minLength 不能大于 maxLength`);
  }
}

function validatePattern(constraints, location, errors) {
  if (constraints.pattern !== undefined) {
    if (typeof constraints.pattern !== "string" || constraints.pattern.length === 0) {
      errors.push(`${location}.pattern 必须是非空字符串`);
    } else {
      try {
        new RegExp(constraints.pattern);
      } catch (error) {
        errors.push(`${location}.pattern 不是合法正则表达式：${error.message}`);
      }
    }
  }
}

function validateStringConstraints(constraints, location, errors) {
  validateLengthValues(constraints, location, errors);
  validateLengthOrder(constraints, location, errors);
  validatePattern(constraints, location, errors);
}

function validateNumericValues(constraints, location, errors) {
  for (const key of ["minimum", "maximum", "step"]) {
    if (constraints[key] !== undefined && !isFiniteNumber(constraints[key])) {
      errors.push(`${location}.${key} 必须是有限数字`);
    }
  }
  if (isFiniteNumber(constraints.step) && constraints.step <= 0) {
    errors.push(`${location}.step 必须大于 0`);
  }
}

function validateNumericOrder(constraints, location, errors) {
  if (
    isFiniteNumber(constraints.minimum) &&
    isFiniteNumber(constraints.maximum) &&
    constraints.minimum > constraints.maximum
  ) {
    errors.push(`${location}.minimum 不能大于 maximum`);
  }
}

function validateExclusiveTypes(constraints, location, errors) {
  for (const key of ["minExclusive", "maxExclusive"]) {
    if (constraints[key] !== undefined && typeof constraints[key] !== "boolean") {
      errors.push(`${location}.${key} 必须是 boolean`);
    }
  }
}

function validateExclusiveBounds(constraints, location, errors) {
  if (constraints.minExclusive === true && constraints.minimum === undefined) {
    errors.push(`${location}.minExclusive=true 时必须声明 minimum`);
  }
  if (constraints.maxExclusive === true && constraints.maximum === undefined) {
    errors.push(`${location}.maxExclusive=true 时必须声明 maximum`);
  }
}

function validateNonEmptyRange(constraints, location, errors) {
  if (
    isFiniteNumber(constraints.minimum) &&
    isFiniteNumber(constraints.maximum) &&
    constraints.minimum === constraints.maximum &&
    (constraints.minExclusive === true || constraints.maxExclusive === true)
  ) {
    errors.push(`${location} 的上下界组合没有可取值`);
  }
}

function validateTotalDigits(constraints, location, errors) {
  if (constraints.totalDigits !== undefined && !isPositiveInteger(constraints.totalDigits)) {
    errors.push(`${location}.totalDigits 必须是正整数`);
  }
}

function validateFractionDigits(constraints, location, errors) {
  if (
    constraints.fractionDigits !== undefined &&
    !isNonNegativeInteger(constraints.fractionDigits)
  ) {
    errors.push(`${location}.fractionDigits 必须是非负整数`);
  }
}

function validatePrecisionOrder(constraints, location, errors) {
  if (
    isPositiveInteger(constraints.totalDigits) &&
    isNonNegativeInteger(constraints.fractionDigits) &&
    constraints.fractionDigits > constraints.totalDigits
  ) {
    errors.push(`${location}.fractionDigits 不能大于 totalDigits`);
  }
}

function validateIntegerPrecision(constraints, type, location, errors) {
  if (type === "integer" && Number(constraints.fractionDigits || 0) !== 0) {
    errors.push(`${location}: integer 字段的 fractionDigits 必须为 0`);
  }
}

function validateNumericRange(constraints, location, errors) {
  validateNumericValues(constraints, location, errors);
  validateNumericOrder(constraints, location, errors);
  validateExclusiveTypes(constraints, location, errors);
  validateExclusiveBounds(constraints, location, errors);
  validateNonEmptyRange(constraints, location, errors);
}

function validateNumericPrecision(constraints, type, location, errors) {
  validateTotalDigits(constraints, location, errors);
  validateFractionDigits(constraints, location, errors);
  validatePrecisionOrder(constraints, location, errors);
  validateIntegerPrecision(constraints, type, location, errors);
}

function validateConstraintTypeCompatibility(constraints, type, location, errors) {
  if (!type) return;
  const hasStringConstraint = Object.keys(constraints).some((key) =>
    STRING_CONSTRAINTS.has(key),
  );
  const hasNumberConstraint = Object.keys(constraints).some((key) =>
    NUMBER_CONSTRAINTS.has(key),
  );
  if (hasStringConstraint && !STRING_TYPES.has(type)) {
    errors.push(`${location}: ${type} 字段不能声明字符串长度/格式约束`);
  }
  if (hasNumberConstraint && !NUMBER_TYPES.has(type)) {
    errors.push(`${location}: ${type} 字段不能声明数值边界/精度约束`);
  }
}

function validateFieldConstraints(field, options = {}) {
  const errors = [];
  const location = options.location || "field";
  const constraints = field && field.constraints;
  if (constraints === undefined) return errors;
  if (!isPlainObject(constraints)) {
    return [`${location}.constraints 必须是对象`];
  }
  if (Object.keys(constraints).length === 0) {
    errors.push(`${location}.constraints 不能为空对象`);
    return errors;
  }
  validateSupportedKeys(constraints, `${location}.constraints`, errors);
  validateStringConstraints(constraints, `${location}.constraints`, errors);
  validateNumericRange(constraints, `${location}.constraints`, errors);
  validateNumericPrecision(constraints, field.type, `${location}.constraints`, errors);
  validateConstraintTypeCompatibility(
    constraints,
    field.type,
    `${location}.constraints`,
    errors,
  );
  if (
    options.strict &&
    (typeof field.constraintSource !== "string" ||
      field.constraintSource.trim().length === 0)
  ) {
    errors.push(
      `${location}.constraintSource 必填（例如 api-contract:models.createRequest.code 或 db-contract:TABLE.COLUMN）`,
    );
  }
  return errors;
}

module.exports = {
  NUMBER_CONSTRAINTS,
  STRING_CONSTRAINTS,
  SUPPORTED_CONSTRAINTS,
  validateFieldConstraints,
};

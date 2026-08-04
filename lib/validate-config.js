"use strict";

const fs = require("fs");
const path = require("path");

const CONFIG_FILE = ".wl-skills-validate.json";
const MOCK_POLICIES = new Set(["disabled", "optional", "required"]);

function normalizeProjectPath(value) {
  let normalized = String(value || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.endsWith("/**")) normalized = normalized.slice(0, -3);
  if (normalized.endsWith("/*")) normalized = normalized.slice(0, -2);
  return normalized.replace(/\/+$/, "");
}

function isSafeProjectPath(value) {
  if (!value || path.isAbsolute(value)) return false;
  return !value.split("/").includes("..");
}

function isPathWithin(value, prefix) {
  const normalizedValue = normalizeProjectPath(value);
  const normalizedPrefix = normalizeProjectPath(prefix);
  return Boolean(normalizedPrefix) && (
    normalizedValue === normalizedPrefix || normalizedValue.startsWith(`${normalizedPrefix}/`)
  );
}

function readConfig(projectRoot, warnings) {
  const source = path.join(projectRoot || process.cwd(), CONFIG_FILE);
  if (!fs.existsSync(source)) return { source: null, value: {} };
  try {
    const value = JSON.parse(fs.readFileSync(source, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      warnings.push(`${CONFIG_FILE} 根节点必须是对象，已忽略`);
      return { source, value: {} };
    }
    return { source, value };
  } catch (error) {
    warnings.push(`${CONFIG_FILE} 解析失败，已忽略（${error?.message || String(error)}）`);
    return { source, value: {} };
  }
}

function compileExcludePaths(value, warnings) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push(`${CONFIG_FILE}.excludePagePaths 必须是字符串数组，已忽略`);
    return [];
  }
  const result = [];
  for (const item of value) {
    const normalized = normalizeProjectPath(item);
    if (!isSafeProjectPath(normalized)) {
      warnings.push(`${CONFIG_FILE}.excludePagePaths 含非法项目相对路径：${item}`);
      continue;
    }
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}

function compileDefinitionValidators(value, warnings) {
  const result = new Map();
  if (value === undefined) return result;
  if (!Array.isArray(value)) {
    warnings.push(`${CONFIG_FILE}.definitionValidators 必须是数组，已忽略`);
    return result;
  }
  for (const [index, item] of value.entries()) {
    const source = normalizeProjectPath(item?.source);
    const script = String(item?.script || "").trim();
    if (!isSafeProjectPath(source)) {
      warnings.push(`${CONFIG_FILE}.definitionValidators[${index}].source 必须是安全的项目相对路径`);
      continue;
    }
    if (!/^[A-Za-z0-9:_-]+$/.test(script)) {
      warnings.push(`${CONFIG_FILE}.definitionValidators[${index}].script 必须是 package.json 中的安全脚本名`);
      continue;
    }
    if (result.has(source)) {
      warnings.push(`${CONFIG_FILE}.definitionValidators 存在重复 source：${source}`);
      continue;
    }
    result.set(source, script);
  }
  return result;
}

function compileMockPolicy(value, warnings) {
  if (value === undefined) return "optional";
  if (!MOCK_POLICIES.has(value)) {
    warnings.push(`${CONFIG_FILE}.mockPolicy 必须是 disabled/optional/required，已回退 optional`);
    return "optional";
  }
  return value;
}

function loadValidationConfig(projectRoot) {
  const warnings = [];
  const parsed = readConfig(projectRoot, warnings);
  const excludePagePaths = compileExcludePaths(parsed.value.excludePagePaths, warnings);
  const definitionValidators = compileDefinitionValidators(
    parsed.value.definitionValidators,
    warnings,
  );
  const mockPolicy = compileMockPolicy(parsed.value.mockPolicy, warnings);
  return {
    source: parsed.source,
    value: parsed.value,
    warnings,
    excludePagePaths,
    definitionValidators,
    mockPolicy,
    isPageExcluded(pageDir) {
      return excludePagePaths.some((prefix) => isPathWithin(pageDir, prefix));
    },
    definitionValidatorFor(source) {
      return definitionValidators.get(normalizeProjectPath(source));
    },
  };
}

module.exports = {
  CONFIG_FILE,
  MOCK_POLICIES,
  normalizeProjectPath,
  isPathWithin,
  loadValidationConfig,
};

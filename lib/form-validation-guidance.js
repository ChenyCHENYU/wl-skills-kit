"use strict";

/**
 * @robot-admin/form-validate 的项目接入检测。
 *
 * 这里只识别确定性事实（依赖、导入、明显的手写规则对象），不尝试把历史
 * 业务 validator 自动改写成预设规则，避免改变校验语义。
 */

const fs = require("fs");
const path = require("path");
const semver = require("semver");

const PACKAGE_NAME = "@robot-admin/form-validate";
const MINIMUM_VERSION = "3.4.1";
const RETIRED_PACKAGES = [
  "@robot-admin/form-validate-core",
  "@robot-admin/form-validate-element",
];
const NAIVE_ONLY_APIS = [
  "PRESET_RULES",
  "RULE_COMBOS",
  "NAIVE_COMBOS",
  "toNaiveRule",
  "toNaiveRules",
];

function readPackageJson(projectRoot) {
  const filePath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function dependencyMap(pkg) {
  return {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };
}

function installedPackageVersion(projectRoot) {
  const filePath = path.join(projectRoot, "node_modules", ...PACKAGE_NAME.split("/"), "package.json");
  if (!fs.existsSync(filePath)) return "";
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")).version || "";
  } catch {
    return "";
  }
}

function versionCompatibility(spec, installedVersion) {
  const installed = semver.valid(installedVersion);
  if (installed && semver.lt(installed, MINIMUM_VERSION)) return false;

  let declaredMinimum = null;
  try {
    declaredMinimum = semver.minVersion(spec);
  } catch {
    return null;
  }
  if (declaredMinimum && semver.lt(declaredMinimum, MINIMUM_VERSION)) return false;
  if (installed && declaredMinimum) return true;
  if (declaredMinimum) return true;
  return null;
}

function validationDependency(projectRoot) {
  const dependencies = dependencyMap(readPackageJson(projectRoot));
  const spec = dependencies[PACKAGE_NAME] || "";
  const installedVersion = installedPackageVersion(projectRoot);
  return {
    declared: Boolean(spec),
    spec,
    installedVersion,
    compatible: spec ? versionCompatibility(spec, installedVersion) : false,
    retired: RETIRED_PACKAGES.filter((name) => dependencies[name]),
  };
}

function importsFrom(source, packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:from\\s*|require\\s*\\()\\s*["']${escaped}["']`).test(source);
}

function importedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(
    /import\s*\{([\s\S]*?)\}\s*from\s*["']@robot-admin\/form-validate["']/g,
  )) {
    for (const item of match[1].split(",")) {
      const name = item.trim().split(/\s+as\s+/)[0];
      if (name) names.add(name);
    }
  }
  return names;
}

function hasManualRuleObjects(source) {
  const requiredRule = /\{[^{}]{0,240}\brequired\s*:\s*true\b[^{}]{0,240}\b(?:message|trigger)\s*:/s;
  const customValidator = /\bvalidator\s*:/;
  return requiredRule.test(source) || customValidator.test(source);
}

function isFormSource(source) {
  return [
    /<el-form\b/,
    /<BaseForm\b/,
    /<c_formModal\b/,
    /\bformRules\b/,
    /\bformItems\s*:/,
  ].some((pattern) => pattern.test(source));
}

function retiredPackageFindings(dependency, source) {
  const findings = [];
  for (const packageName of RETIRED_PACKAGES) {
    if (dependency.retired.includes(packageName) || importsFrom(source, packageName)) {
      findings.push({
        level: "error",
        text: `${packageName} 已废弃；统一迁移到 ${PACKAGE_NAME} 3.4.1+`,
      });
    }
  }
  return findings;
}

function frameworkApiFindings(imported) {
  const naiveApis = NAIVE_ONLY_APIS.filter((name) => imported.has(name));
  if (naiveApis.length === 0) return [];
  return [{
    level: "error",
    text: `当前平台使用 Element Plus，不得使用 Naive API：${naiveApis.join(", ")}；改用 ELEMENT_RULES/ELEMENT_COMBOS 或 RuleSpec 适配`,
  }];
}

function manualRuleFindings(source, importsCurrent, dependency) {
  if (!hasManualRuleObjects(source)) return [];
  return [{
    level: importsCurrent ? "warn" : "info",
    text: importsCurrent
      ? `同一页面已接入 ${PACKAGE_NAME}，仍存在手写 required/validator 规则；应复用 ELEMENT_RULES 或 SPEC_RULES，无法等价映射的业务规则除外`
      : `检测到历史手写表单规则；${dependency.declared ? `项目已安装 ${PACKAGE_NAME}，建议增量迁移` : `新生成页面建议先接入 ${PACKAGE_NAME} 3.4.1+`}`,
  }];
}

function versionFindings(dependency, relevant) {
  if (!relevant || !dependency.declared) return [];
  const actual = dependency.installedVersion
    ? `，当前安装 ${dependency.installedVersion}`
    : "";
  if (dependency.compatible === false) {
    return [{
      level: "error",
      text: `${PACKAGE_NAME} 要求 ${MINIMUM_VERSION}+；package.json 声明 ${dependency.spec}${actual}`,
    }];
  }
  if (dependency.compatible === null) {
    return [{
      level: "warn",
      text: `无法确认 ${PACKAGE_NAME} 版本范围 ${dependency.spec}${actual}；请锁定 ${MINIMUM_VERSION}+ 后继续生成`,
    }];
  }
  return [];
}

function formValidationFindings(projectRoot, source) {
  const dependency = validationDependency(projectRoot);
  const importsCurrent = importsFrom(source, PACKAGE_NAME);
  const relevant = importsCurrent || isFormSource(source) || hasManualRuleObjects(source);
  const findings = [
    ...retiredPackageFindings(dependency, source),
    ...versionFindings(dependency, relevant),
    ...frameworkApiFindings(importedNames(source)),
    ...manualRuleFindings(source, importsCurrent, dependency),
  ];

  if (importsCurrent && !dependency.declared) {
    findings.push({
      level: "error",
      text: `页面已 import ${PACKAGE_NAME}，但 package.json 未声明该依赖`,
    });
  }
  if (!hasManualRuleObjects(source) && dependency.declared && isFormSource(source) && !importsCurrent) {
    findings.push({
      level: "info",
      text: `项目已安装 ${PACKAGE_NAME}，当前表单尚未使用；新规则应优先使用 ELEMENT_RULES 或 SPEC_RULES`,
    });
  }
  return findings;
}

module.exports = {
  MINIMUM_VERSION,
  PACKAGE_NAME,
  RETIRED_PACKAGES,
  formValidationFindings,
  hasManualRuleObjects,
  importedNames,
  validationDependency,
  versionCompatibility,
};

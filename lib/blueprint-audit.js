"use strict";

const { validatePageBlueprint } = require("./page-blueprint");

const API_TEMPLATE = "/<service>/<resource>/<operation>";

function auditPageBlueprint(blueprint) {
  const errors = validatePageBlueprint(blueprint);
  const warnings = [];
  if (!blueprint || typeof blueprint !== "object") return { ok: false, score: 0, errors, warnings, checks: {} };
  const serialized = JSON.stringify(blueprint);
  const apiOperations = blueprint.shape?.apiOperations || [];
  const dictionaries = blueprint.shape?.dictionaries || [];
  const checks = buildChecks(errors, apiOperations, dictionaries, serialized);
  errors.push(...checkErrors(checks));
  warnings.push(...qualityWarnings(blueprint));
  const score = Math.max(0, Math.min(100, 100 - errors.length * 25 - warnings.length * 5));
  return {
    ok: errors.length === 0,
    score,
    errors,
    warnings,
    checks,
  };
}

function checkErrors(checks) {
  return [
    checks.noSourceLikeApiPath ? null : "API pathTemplate 必须保持抽象模板",
    checks.anonymousDictionaryCodes ? null : "字典依赖必须使用匿名 code 和稳定 dependencyId",
    checks.noHttpUrl ? null : "蓝图不得包含真实 HTTP URL",
    checks.noSourceTextField ? null : "蓝图不得包含源码文件正文字段",
  ].filter(Boolean);
}

function qualityWarnings(blueprint) {
  return !blueprint.quality || blueprint.quality.score < 70
    ? ["质量分低于 70，建议先补齐 page-spec 或人工审核"]
    : [];
}

function buildChecks(errors, apiOperations, dictionaries, serialized) {
  return {
    structure: errors.length === 0,
    noSourceLikeApiPath: apiOperations.every((item) => item.pathTemplate === API_TEMPLATE),
    anonymousDictionaryCodes: dictionaries.every((item) => /^dict_[0-9]+$/.test(item.code || "") && /^dep_[a-f0-9]{10}$/.test(item.dependencyId || "")),
    noHttpUrl: !/https?:\/\//i.test(serialized),
    noSourceTextField: !/(?:index\.vue|data\.ts|api\.md)\s*[:=]/i.test(serialized),
  };
}

module.exports = { auditPageBlueprint };

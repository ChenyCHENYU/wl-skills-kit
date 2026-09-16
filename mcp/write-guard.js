"use strict";

// 生产环境标识：显式环境名 + 网关 URL 启发式（prod/production/prd 变体）
const PRODUCTION_ENVIRONMENT_NAMES = new Set(["prod", "prd", "production", "生产"]);
const PRODUCTION_URL_PATTERN = /(^|[./_-])(?:prod(?:uction)?|prd)([./_:-]|$)/i;

function productionHint(config = {}) {
  const environment = String(config.environment || "").trim().toLowerCase();
  if (PRODUCTION_ENVIRONMENT_NAMES.has(environment)) return true;
  try {
    const url = new URL(config.gatewayPath);
    return PRODUCTION_URL_PATTERN.test(`${url.hostname}${url.pathname}`);
  } catch {
    return false;
  }
}

function writeBlockReason(config = {}) {
  if (!productionHint(config) || config.allowProductionWrites === true) return "";
  return "检测到生产环境，默认禁止 MCP 直接写入；请走发布审批，确需执行时在本地 env.local.json 显式设置 allowProductionWrites: true";
}

module.exports = { productionHint, writeBlockReason };

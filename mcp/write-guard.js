"use strict";

function productionHint(config = {}) {
  const environment = String(config.environment || "").trim().toLowerCase();
  if (["prod", "production", "生产"].includes(environment)) return true;
  try {
    const url = new URL(config.gatewayPath);
    return /(^|[./_-])prod(?:uction)?([./_:-]|$)/i.test(`${url.hostname}${url.pathname}`);
  } catch {
    return false;
  }
}

function writeBlockReason(config = {}) {
  if (!productionHint(config) || config.allowProductionWrites === true) return "";
  return "检测到生产环境，默认禁止 MCP 直接写入；请走发布审批，确需执行时在本地 env.local.json 显式设置 allowProductionWrites: true";
}

module.exports = { productionHint, writeBlockReason };

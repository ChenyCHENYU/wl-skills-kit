"use strict";

function toolResult(text, structuredContent, isError = false) {
  return {
    text,
    structuredContent,
    ...(isError ? { isError: true } : {}),
  };
}

function previewResult(text, plan, extra = {}) {
  return toolResult(text, {
    ok: true,
    state: "ready",
    mode: "preview",
    planHash: plan.planHash,
    ...extra,
  });
}

function blockedResult(text, state = "blocked", extra = {}) {
  return toolResult(`❌ ${text}`, { ok: false, state, ...extra }, true);
}

function completedResult(text, extra = {}) {
  return toolResult(text, { ok: true, state: "completed", mode: "apply", ...extra });
}

function validatePlanHash(args, plan) {
  if (args.planHash === plan.planHash) return null;
  return blockedResult("planHash 缺失或已失效，本次零写入；请重新预览", "stale-plan", {
    mode: "apply",
    currentPlanHash: plan.planHash,
  });
}

module.exports = { blockedResult, completedResult, previewResult, toolResult, validatePlanHash };

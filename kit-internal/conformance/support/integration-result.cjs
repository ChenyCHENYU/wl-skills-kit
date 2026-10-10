"use strict";

// Additive, typed core: original package-specific result fields are preserved.
const path = require("node:path");
const DECISIONS = ["matched", "baseline", "gap", "ambiguous", "not-applicable", "needs-context"];
const strings = (items) => Array.isArray(items) ? items.filter((value) => typeof value === "string") : [];
const nullableString = { type: ["string", "null"] };
const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["contractVersion", "packageName", "packageVersion", "projectRoot", "runId", "decisionStatus", "scope", "action", "selectedSkills", "ruleRefs", "requiredChecks", "targets", "ready", "executionStatus", "validationStatus", "stale", "planStale", "allowedExecutors"],
  properties: {
    contractVersion: { const: 1 }, packageName: { type: "string", minLength: 1 }, packageVersion: { type: "string", minLength: 1 },
    projectRoot: { type: "string", minLength: 1 }, runId: nullableString,
    decisionStatus: { enum: [...DECISIONS, null] }, scope: { oneOf: [{type:"null"}, {type:"object",required:["schemaVersion","status","reason","adopted","projectType","inherited"],
      properties:{schemaVersion:{const:1},status:{enum:["applicable","not-applicable","needs-context"]},reason:{type:"string"},adopted:{type:"boolean"},projectType:{type:"string"},inherited:{const:false}},additionalProperties:true}] },
    action: { oneOf: [{ type: "null" }, { type: "object", required: ["mode", "checksAllowed", "businessWritesAuthorized", "authorization"],
      properties: { mode: { enum: ["explain", "inspect", "plan", "apply", "unspecified"] }, checksAllowed: { type: "boolean" }, businessWritesAuthorized: { const: false }, authorization: { type: "string" } }, additionalProperties: false }] },
    selectedSkills: { type: "array", items: { type: "string" } }, requiredChecks: { type: "array", items: { type: "string" } },
    targets: { type: "array", items: { type: "string" } }, allowedExecutors: { type: "array", items: { type: "string" } },
    ruleRefs: { type: "array", items: { type: "object", required: ["packageName", "ruleId", "legacyId", "name", "ruleVersion", "source", "kind", "verification"],
      properties: { packageName: nullableString, ruleId: { type: "string" }, legacyId: { type: "string" }, name: { type: "string" }, ruleVersion: nullableString, source: nullableString, kind: { type: "string" }, verification: { const: "unverified" } }, additionalProperties: false } },
    ready: { type: ["boolean", "null"] }, executionStatus: nullableString, validationStatus: nullableString,
    stale: { type: ["boolean", "null"] }, planStale: { type: ["boolean", "null"] },
  },
};

function allowedExecutors(decision, executors) {
  if (!["matched", "baseline"].includes(decision.status) || !decision.action?.checksAllowed) return [];
  return executors.filter((executor) => {
    const when = executor.when || {};
    return strings(when.skills).some((id) => decision.selectedSkills?.includes(id))
      || strings(when.checks).some((id) => decision.requiredChecks?.includes(id))
      || strings(when.rulePrefixes).some((prefix) => decision.requiredRules?.some((id) => id.startsWith(prefix)));
  }).map((executor) => executor.id);
}

function resultReadiness(result, decision, status) {
  if (typeof result.ready === "boolean") return result.ready;
  if (typeof decision.ready === "boolean") return decision.ready;
  return status ? ["matched", "baseline"].includes(status) && !(decision.missingInputs || []).length : null;
}

function executionState(result) {
  return {
    runId: result.runId || null,
    executionStatus: result.executionStatus || null,
    validationStatus: result.validationStatus || null,
    stale: typeof result.stale === "boolean" ? result.stale : null,
    planStale: typeof result.planStale === "boolean" ? result.planStale : null,
  };
}

function decisionReadout(decision) {
  return {action:decision.action || null, selectedSkills:strings(decision.selectedSkills), ruleRefs:decision.ruleRefs || [], requiredChecks:strings(decision.requiredChecks)};
}
function targetReadout(result,input) { return strings(result.targets || input.targets || result.notice?.targets); }
function projectIdentity(scope,result,input) { return path.resolve(scope?.projectRoot || result.projectRoot || result.root || input.projectRoot || process.cwd()); }

function projectResult(result, input, config) {
  const decision = result.decision || result;
  const scope = result.currentScope || decision.scope || result.scope || null;
  const status = DECISIONS.includes(decision.status) ? decision.status : null;
  const ready = resultReadiness(result, decision, status);
  return {
    ...result,
    integration: {
      contractVersion: 1, packageName: config.packageName, packageVersion: config.packageVersion,
      projectRoot: projectIdentity(scope,result,input),
      ...executionState(result), decisionStatus: status, scope,
      ...decisionReadout(decision), targets: targetReadout(result,input), ready,
      allowedExecutors: ready && scope?.status === "applicable" ? allowedExecutors(decision, config.executors || []) : [],
    },
  };
}

module.exports = { SCHEMA, projectResult };

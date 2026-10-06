"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");
const Ajv = require("ajv/dist/2020");
const root = require("../support/workspace-root.cjs");
const backendRoot = path.join(root, "wl-skills-bd");
const backend = require(path.join(backendRoot, "lib/contract.js"));
const collaboration = require(path.join(backendRoot, "lib/collaboration.js"));
const kit = require(path.join(root, "wl-skills-kit/lib/api-contract.js"));
const schema = require("../support/contracts/wl-api-contract.schema.json");
const validate = new Ajv({ strict: true, allowUnionTypes: true, allErrors: true }).compile(schema);

function example(name = "feature-category") {
  return JSON.parse(fs.readFileSync(path.join(backendRoot, "files/.github/templates/examples", `${name}.contract.json`), "utf8"));
}

function produce(raw, options) {
  const result = backend.validateContract(raw);
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  const api = collaboration.buildManifest(result.contract, result.profile, result.deliveryProfile, options);
  assert.equal(validate(api), true, JSON.stringify(validate.errors, null, 2));
  return api;
}

function productionExample() {
  const raw = example();
  raw.assurance = {
    level: "production", criticality: "core",
    slo: { availabilityPercent: 99.9, p95LatencyMs: 500, p99LatencyMs: 1000, maxErrorRatePercent: 0.1 },
    recovery: { rtoMinutes: 60, rpoMinutes: 15 },
    security: { authorizationModel: "tenant-data-scope", methodSecurityRequired: true, auditRequired: true },
    dataGovernance: { owner: "主数据团队", sourceOfTruth: "feature-category", classificationDefault: "internal", retentionPolicy: "按企业主数据保留策略执行" },
    consistency: { idempotencyStrategy: "business-key", eventDelivery: "none", crossServiceTransaction: "none" },
    resilience: { dependencyTimeoutMs: 3000, retryMaxAttempts: 1, circuitBreakerRequired: true, rateLimitRequired: true },
    evidence: {
      threatModelRef: "docs/evidence/threat-model.md", authorizationReviewRef: "docs/evidence/authorization-review.md",
      loadTestRef: "docs/evidence/load-test.md", runbookRef: "docs/evidence/runbook.md",
      restoreDrillRef: "docs/evidence/restore-drill.md", dataReviewRef: "docs/evidence/data-review.md",
    },
  };
  raw.databaseTarget = {
    schema: "MDM", location: "pt-primary", estimatedRows: 100000, estimatedBytes: 52428800,
    downtimeBudgetSeconds: 0, onlineDdl: true, backupRef: "CHG-20260718-MDM-FEATURE", recoveryOwner: "mdm-owner",
  };
  raw.errors = [{ code: "FEATURE_CATEGORY_NOT_FOUND", httpStatus: 404, message: "特征量分类不存在", owner: "mdm-owner", retryable: false, operations: ["detail", "update", "remove"] }];
  raw.fields.forEach((field) => { field.semanticId = `MDM_FEATURE_CATEGORY_${field.column}`; });
  return raw;
}

test("schema accepts every shipped BD example after the independent producer validates it", () => {
  const dir = path.join(backendRoot, "files/.github/templates/examples");
  for (const file of fs.readdirSync(dir).filter((file) => file.endsWith(".contract.json"))) {
    produce(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
  }
});

test("schema preserves export, business commands, relations, batch items, enum and data metadata", () => {
  const api = produce(example("sale-order-master"));
  assert.deepEqual(api.extensionOperations.sort(), ["approve", "batchCancel", "export", "submit"]);
  assert.equal(api.operations.batchCancel.kind, "batch");
  assert.equal(api.models.custom_batchCancel_request.find((field) => field.name === "ids").items.type, "string");
  assert.equal(api.models.batchResponse.find((field) => field.name === "failures").items.type, "object");
  assert.equal(api.relations[0].queryOperation.responseModel, "relation_items_response");
  assert.ok(api.models.detailResponse.some((field) => field.enum && field["x-semantic-id"] && field["x-data-classification"]));
  const unknown = structuredClone(api);
  unknown.relations[0].unpublishedFact = true;
  assert.equal(validate(unknown), false);
});

test("schema accepts production assurance, missing evidence facts and completed evidence facts", () => {
  const raw = productionExample();
  const missing = produce(raw, { assuranceMissing: Object.entries(raw.assurance.evidence).map(([key, file]) => `${key}:${file}`) });
  assert.equal(missing.completion.contractStatus, "draft");
  assert.equal(missing.completion.assuranceMissing.length, 6);
  const completed = produce(raw);
  assert.equal(completed.completion.contractStatus, "confirmed");
  const unknown = structuredClone(completed);
  unknown.assurance.slo.unpublishedBudget = 123;
  assert.equal(validate(unknown), false);
  const wrongType = structuredClone(completed);
  wrongType.assurance.resilience.retryMaxAttempts = "1";
  assert.equal(validate(wrongType), false);
  const incomplete = structuredClone(completed);
  delete incomplete.assurance.evidence;
  assert.equal(validate(incomplete), false);
});

test("schema accepts independently generated chronology and query constraint facts", () => {
  const raw = example();
  for (const [name, column, comment] of [["startAt", "START_AT", "开始时间"], ["endAt", "END_AT", "结束时间"]]) {
    raw.fields.push({ name, column, comment, javaType: "LocalDateTime", dbType: "TIMESTAMP", writable: true, queryMode: "eq" });
  }
  raw.validationRules = [{ kind: "chronology", startField: "startAt", endField: "endAt", operations: ["create", "update", "page"], message: "开始时间不能晚于结束时间", source: "reviewed-requirement:range" }];
  raw.fields[0].queryConstraints = { maxLength: 100 };
  raw.fields[0].queryConstraintSource = "reviewed-requirement:search";
  const api = produce(raw);
  assert.equal(api.validationRules[0].allowEqual, true);
  assert.ok(api.models.pageRequest.some((field) => field.constraintSource === "reviewed-requirement:search"));
});

test("public structural schema leaves operating budgets to the actual producer", () => {
  const api = produce(productionExample());
  api.assurance.slo.availabilityPercent = 85;
  api.assurance.slo.maxErrorRatePercent = 20;
  api.assurance.resilience.retryMaxAttempts = 5;
  api.assurance.recovery.rtoMinutes = 600000;
  api.assurance.security.methodSecurityRequired = false;
  assert.equal(validate(api), true, JSON.stringify(validate.errors, null, 2));
  const bdOnly = productionExample();
  bdOnly.assurance.resilience.retryMaxAttempts = 5;
  assert.equal(backend.validateContract(bdOnly).ok, false, "BD must keep its own stricter retry policy");
  const profile = structuredClone(kit.DEFAULT_PROFILE);
  profile.profileId = "project-delivery";
  profile.transport.pagination.maxSize = 20000;
  const standalone = kit.buildStandaloneContract({ contractId: "audit", service: "gateway", resource: "audit", module: "audit", permissionPrefix: "audit", profile });
  assert.equal(kit.validateApiContract(standalone, { profile }).ok, true);
  assert.equal(validate(standalone), true, JSON.stringify(validate.errors, null, 2));
  assert.equal(standalone.models.pageRequest[1].default, profile.transport.pagination.defaultSize);
  assert.equal(standalone.models.pageRequest[1].constraints.maximum, 20000);
  assert.equal(standalone.models.pageRequest[1].constraintSource, "delivery-profile:transport.pagination");
});

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");
const Ajv = require("ajv/dist/2020");
const root = require("../support/workspace-root.cjs");
const schema = require("../support/contracts/wl-api-contract.schema.json");
const validate = new Ajv({ strict: true, allowUnionTypes: true, allErrors: true }).compile(schema);
const kit = require(path.join(root, "wl-skills-kit/lib/api-contract.js"));
const backend = require(path.join(root, "wl-skills-bd/lib/contract.js"));
const collaboration = require(path.join(root, "wl-skills-bd/lib/collaboration.js"));

function valid(value) {
  assert.equal(validate(value), true, JSON.stringify(validate.errors, null, 2));
}

test("full public schema accepts independently produced kit APIs and project pagination", () => {
  const profile = structuredClone(kit.DEFAULT_PROFILE);
  profile.transport.operations.update = { method: "POST", path: "changeById" };
  profile.transport.pagination.defaultSize = 20;
  profile.transport.pagination.maxSize = 20000;
  const api = kit.buildStandaloneContract({ contractId: "audit", service: "gateway", resource: "audit", module: "audit", permissionPrefix: "audit", profile });
  api.completion.contractStatus = "confirmed";
  api.models.createRequest.push({ name: "scheduledAt", description: "时间", required: true, type: "string", format: "date-time", default: "2026-10-07T00:00:00Z", constraints: { maxLength: 30 }, constraintSource: "reviewed-requirement:scheduledAt" });
  assert.equal(kit.validateApiContract(api, { profile, strict: true }).ok, true);
  valid(api);
  const unknown = structuredClone(api);
  unknown.foreignContractFact = true;
  assert.equal(validate(unknown), false);
  const invalid = structuredClone(api);
  invalid.models.createRequest[0].type = "unknown-type";
  assert.equal(validate(invalid), false);
});

test("full public schema accepts backend generated assurance and completion facts", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "wl-skills-bd/files/.github/templates/examples/feature-category.contract.json"), "utf8"));
  const result = backend.validateContract(raw);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const api = collaboration.buildManifest(result.contract, result.profile, result.deliveryProfile);
  assert.ok(api.assurance && Array.isArray(api.completion.assuranceMissing));
  valid(api);
  const invalid = structuredClone(api);
  invalid.operations.update.method = "UNKNOWN";
  assert.equal(validate(invalid), false);
});

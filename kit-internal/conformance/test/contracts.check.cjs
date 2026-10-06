"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const test = require("node:test");
const root = require("../support/workspace-root.cjs");
const kit = require(path.join(root, "wl-skills-kit/lib/api-contract.js"));
const backend = require(path.join(root, "wl-skills-bd/lib/contract.js"));
const collaboration = require(path.join(root, "wl-skills-bd/lib/collaboration.js"));
const consumerPromise = import(pathToFileURL(path.join(root, "wl-skills-test/lib/contract-consumer.js")));

function temporary(fn) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "wl-contract-conformance-"));
  return Promise.resolve().then(() => fn(project)).finally(() => fs.rmSync(project, { recursive: true, force: true }));
}

function save(project, relative, data) {
  const file = path.join(project, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  return file;
}

test("standalone kit API contract is consumed without changing model details or project API choices", async () => temporary(async (project) => {
  const profile = structuredClone(kit.DEFAULT_PROFILE);
  profile.profileId = "project-custom";
  profile.transport.operations.page = { method: "GET", path: "search" };
  profile.transport.operations.update = { method: "POST", path: "changeById" };
  profile.transport.pagination.defaultSize = 20;
  profile.transport.pagination.maxSize = 1000;
  const api = kit.buildStandaloneContract({ contractId: "audit", service: "gateway", resource: "audit", module: "audit", permissionPrefix: "audit", profile });
  api.completion.contractStatus = "confirmed";
  api.models.createRequest.push({ name: "scheduledAt", description: "时间", required: true, type: "string", format: "date-time", default: "2026-10-07T00:00:00Z", constraints: { maxLength: 30 }, constraintSource: "reviewed-requirement:scheduledAt" });
  assert.equal(kit.validateApiContract(api, { profile, strict: true }).ok, true);
  const { consumeContract } = await consumerPromise;
  const consumed = consumeContract(save(project, "api.json", api));
  assert.deepEqual(consumed.summary.operations.find((operation) => operation.key === "update"), { key: "update", ...api.operations.update });
  assert.deepEqual(consumed.summary.models.createRequest.find((field) => field.name === "scheduledAt"), api.models.createRequest.at(-1));
  assert.deepEqual(consumed.summary.operationModels.create.requestFields, api.models.createRequest);
  assert.deepEqual(consumed.summary.transport.paginationConfig, api.transport.pagination);
  assert.equal(consumed.summary.profileId, profile.profileId);
}));

test("backend effective Profile survives both internal-contract and published-manifest consumption", async () => temporary(async (project) => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, "wl-skills-bd/files/.github/templates/examples/feature-category.contract.json"), "utf8"));
  const profile = structuredClone(kit.DEFAULT_PROFILE);
  profile.transport.operations.update = { method: "POST", path: "changeById" };
  profile.transport.pagination.defaultSize = 20;
  profile.transport.pagination.maxSize = 1000;
  save(project, ".wl-skills-bd/contracts/wl-delivery-profile.v1.json", profile);
  const validated = backend.validateContract(contract, { projectRoot: project });
  assert.equal(validated.ok, true, JSON.stringify(validated.errors));
  const published = collaboration.buildManifest(validated.contract, validated.profile, validated.deliveryProfile);
  const { consumeContract } = await consumerPromise;
  const internal = consumeContract(save(project, "contracts/resource/wl-contract.json", contract));
  const external = consumeContract(save(project, "contracts/resource/wl-api-contract.json", published));
  for (const value of [internal, external]) {
    const update = value.summary.operations.find((operation) => operation.key === "update");
    assert.equal(update.method, published.operations.update.method);
    assert.equal(update.externalPath, published.operations.update.externalPath);
    assert.equal(value.summary.transport.pagination, 20);
    assert.equal(value.summary.transport.maxSize, 1000);
  }
  assert.ok(external.summary.operations.every((operation) => published.operations[operation.key]), "extension operation names must not create synthetic endpoints");
}));

test("page-spec relative api.md selects real API and rejects unknown versions or broken references", async () => temporary(async (project) => {
  const api = kit.buildStandaloneContract({ contractId: "selected", service: "gateway", resource: "resource", module: "resource", permissionPrefix: "resource" });
  api.operations.page.method = "GET";
  api.operations.page.externalPath = "/gateway/resource/search";
  save(project, "pages/list/api.md", kit.renderApiMarkdown(api));
  const page = { page: "列表", mode: "LIST", dir: "/frontend/list", apiContract: "api.md#selected", query: [], columns: [], toolbar: [], operations: [] };
  const file = save(project, "pages/list/page-spec.json", page);
  const { consumeContract } = await consumerPromise;
  const { summary } = consumeContract(file);
  assert.equal(summary.operations.find((operation) => operation.key === "page").externalPath, "/gateway/resource/search");
  assert.equal(summary.operations.find((operation) => operation.key === "page").method, "GET");
  assert.equal(summary.route, page.dir);
  assert.equal(summary.operationSource, "api-contract");
  const future = { ...api, protocolVersion: "999.0" };
  assert.throws(() => consumeContract(save(project, "future.json", future)), /protocolVersion/);
  save(project, "pages/list/page-spec.json", { ...page, apiContract: "missing.json" });
  assert.throws(() => consumeContract(file), /不存在/);
}));

test("standalone page-spec retains UI intentions without inventing API methods or endpoints", async () => temporary(async (project) => {
  const page = {
    page: "独立页面", mode: "LIST", dir: "/frontend/list", query: [], columns: [],
    toolbar: [{ label: "新增", action: "create" }],
    operations: [{ label: "编辑", action: "edit" }, { label: "删除", action: "delete" }],
  };
  const { consumeContract } = await consumerPromise;
  const { summary } = consumeContract(save(project, "page-spec.json", page));
  assert.equal(summary.route, page.dir);
  assert.equal(summary.operationSource, "page-intent");
  assert.equal(summary.apiFactsStatus, "unresolved");
  assert.deepEqual(summary.operations.map((operation) => operation.key), ["page", "create", "update", "remove"]);
  assert.ok(summary.operations.every((operation) => !operation.method && !operation.externalPath));
  assert.equal(summary.pageOperations.length, 2);
  assert.equal(summary.toolbarActions.length, 1);
}));

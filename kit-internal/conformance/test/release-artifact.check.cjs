"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");
const { artifactDigests, assertReleaseEvidence, checkMcpCatalog, checkProbeStatus, checkPublicFiles, publishVerified } = require("../scripts/pack-integrity-check.cjs");

const registry = "https://registry.test";
const packageName = "@agile-team/wl-skills-kit";
const version = "2.34.0";
const metadataUrl = `${registry}/${encodeURIComponent(packageName)}/${version}`;
const tarball = `${registry}/@agile-team/wl-skills-kit/-/wl-skills-kit-${version}.tgz`;

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wl-release-registry-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const artifact = path.join(directory, "candidate.tgz");
  const bytes = Buffer.from("exact frozen test tarball bytes");
  fs.writeFileSync(artifact, bytes);
  const receipt = { package: packageName, version, ...artifactDigests(bytes) };
  const manifest = { name: packageName, version, dist: { tarball, integrity: receipt.integrity } };
  return { artifact, bytes, receipt, manifest };
}

test("release publishes the exact verified file after a 404 and verifies it by exact version", async t => {
  const { artifact, bytes, receipt, manifest } = fixture(t);
  let lookups = 0;
  let uploaded = false;
  const state = await publishVerified(receipt, artifact, {
    registry,
    fetcher: async (url, options) => {
      assert.equal(options.redirect, "error");
      if (String(url) === metadataUrl) {
        lookups++;
        return uploaded && lookups >= 3 ? Response.json(manifest) : new Response(null, { status: 404 });
      }
      assert.equal(String(url), tarball);
      return new Response(bytes);
    },
    wait: async () => {},
    publish: file => {
      assert.equal(file, artifact);
      assert.deepEqual(fs.readFileSync(file), bytes);
      uploaded = true;
    },
  });
  assert.equal(state, "published-and-verified");
  assert.equal(lookups, 3);
});

test("release rerun skips an existing exact version only after byte comparison", async t => {
  const { artifact, bytes, receipt, manifest } = fixture(t);
  const state = await publishVerified(receipt, artifact, {
    registry,
    fetcher: async url => String(url) === metadataUrl ? Response.json(manifest) : new Response(bytes),
    publish: () => assert.fail("verified identical version must not publish again"),
  });
  assert.equal(state, "already-published-identical");
});

test("a registry failure, conflicting digest or conflicting downloaded bytes never authorizes publish", async t => {
  const { artifact, bytes, receipt, manifest } = fixture(t);
  const conflicting = Buffer.from(bytes);
  conflicting[0] ^= 1;
  const failures = [
    [async () => new Response(null, { status: 503 }), /HTTP 503/],
    [async () => Response.json({ ...manifest, dist: { ...manifest.dist, integrity: "sha512-conflict" } }), /SRI/],
    [async url => String(url) === metadataUrl ? Response.json(manifest) : new Response(conflicting), /下载的 tarball/],
    [async () => Response.json({ ...manifest, dist: { ...manifest.dist, tarball: "https://other.test/a.tgz" } }), /预期 registry/],
  ];
  await Promise.all(failures.map(([fetcher, expected]) =>
    assert.rejects(publishVerified(receipt, artifact, { registry, fetcher, publish: () => assert.fail("must not publish") }), expected)));
});

test("a changed artifact is rejected before registry access", async t => {
  const { artifact, receipt } = fixture(t);
  fs.appendFileSync(artifact, "changed");
  await assert.rejects(publishVerified(receipt, artifact, {
    registry, fetcher: () => assert.fail("must not contact registry"), publish: () => assert.fail("must not publish"),
  }), /待发布 tarball 与验收回执不同/);
});

test("release checks real tarball entries for all declared concrete exports, including UI runtime and CSS", () => {
  const pkg = { main: "./es/index.js", types: "./es/index.d.ts", bin: { "wl-ui": "bin/wl-ui.js" }, exports: {
    ".": { import: { default: "./es/index.js" }, types: "./es/index.d.ts" },
    "./dist": "./dist/index.scss", "./dist/*": "./dist/*", "./blocked": null,
  } };
  const scenario = { mcp: "mcp/server.js" };
  const files = ["bin/wl-ui.js", "mcp/server.js", "es/index.js", "es/index.d.ts", "dist/index.scss"];
  assert.doesNotThrow(() => checkPublicFiles(pkg, scenario, new Set(files)));
  for (const missing of files) {
    const filtered = new Set(files.filter(file => file !== missing));
    assert.throws(() => checkPublicFiles(pkg, scenario, filtered), error => error.message.includes(missing));
  }
});

test("release accepts known partial verification only with a passed named check and its fixture file", () => {
  const scenario = { tool: "scan", check: "scan", subject: "src/index.vue" };
  const tool = { kind: "tool-finished", tool: "scan", executionStatus: "completed", validationStatus: "partial",
    checks: [{ id: "scan", status: "passed" }], checkedFiles: [{ path: "src/index.vue" }] };
  const status = { validationStatus: "partial", tools: [tool] };
  assert.equal(checkProbeStatus(scenario, status), tool);
  for (const validationStatus of ["stale", "failed", "unverified", "not-applicable"]) {
    assert.throws(() => checkProbeStatus(scenario, { ...status, validationStatus }), /fixture 验证状态异常/);
  }
  assert.throws(() => checkProbeStatus(scenario, { ...status, tools: [{ ...tool, checks: [{ id: "scan", status: "skipped" }] }] }), /预期检查/);
  assert.throws(() => checkProbeStatus(scenario, { ...status, tools: [{ ...tool, checkedFiles: [{ path: "other.vue" }] }] }), /未覆盖 fixture/);
});

test("privileged publish requires the compatibility verdict for the same bytes and installed UI evidence", () => {
  const context = { key: "ui", scenario: { tool: "scan", check: "scan", subject: "src/index.vue", mcp: "mcp/server.js", route: ["wl_ui_route"] } };
  const receipt = { sha256: "a".repeat(64), smoke: { tool: "scan", execution: "completed", validation: "partial", checkerValidation: "partial",
    requiredCheck: "scan", checkedFile: "src/index.vue", mcp: { route: "wl_ui_route", tools: 1 }, runtimeImport: "passed",
    coverage: { commands: ["scan"], skills: [{ id: "form", sha256: "a".repeat(64) }], mcpTools: ["wl_ui_route"] },
    dependencyLock: { "consumer/package.json": "a".repeat(64), "consumer/package-lock.json": "b".repeat(64) } } };
  const compatibility = { sha256: receipt.sha256, groups: ["ordinary-upgrade", "candidate-plus-four-published"] };
  assert.doesNotThrow(() => assertReleaseEvidence(context, { ...receipt, compatibility }));
  assert.throws(() => assertReleaseEvidence(context, receipt), /兼容证据/);
  assert.throws(() => assertReleaseEvidence(context, { ...receipt, compatibility: { ...compatibility, sha256: "b".repeat(64) } }), /兼容证据/);
  assert.throws(() => assertReleaseEvidence(context, { ...receipt, compatibility: { ...compatibility, groups: ["ordinary-upgrade"] } }), /兼容检查不完整/);
  assert.throws(() => assertReleaseEvidence(context, { ...receipt, compatibility, smoke: { ...receipt.smoke, runtimeImport: undefined } }), /UI 消费者导入/);
  assert.throws(() => assertReleaseEvidence(context, { ...receipt, compatibility, smoke: { ...receipt.smoke, coverage: undefined } }), /CLI 证据/);
  assert.throws(() => assertReleaseEvidence(context, { ...receipt, compatibility, smoke: { ...receipt.smoke, dependencyLock: {} } }), /缺少消费者依赖锁/);
});

test("installed MCP names and complete input schemas must match the public inventory", () => {
  const query = { name: "query", inputSchema: { type: "object", properties: {} } };
  const update = { name: "update", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } };
  assert.doesNotThrow(() => checkMcpCatalog([query, update], [update, query]));
  assert.throws(() => checkMcpCatalog([query], [update, query]), /工具名/);
  assert.throws(() => checkMcpCatalog([query, query], [update, query]), /重复/);
  assert.throws(() => checkMcpCatalog([query, { ...update, inputSchema: query.inputSchema }], [query, update]), /Schema 与公开目录不同/);
});

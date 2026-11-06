"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { test } = require("node:test");
const { startKitMenuFixture } = require("../scripts/host-skill-eval-menu.cjs");
const { allowedMcp, codexArguments } = require("../scripts/host-skill-eval.cjs");
const { parse: parseTOML } = require("../support/vendor/smol-toml/index.cjs");
const { summarize } = require("../scripts/host-skill-eval-summary.cjs");
const { catalogCases, hash } = require("../support/host-skill-eval.cjs");
const { handleMenuUpsert } = require("../../../mcp/tools/menuSync.js");
const catalog = require("./fixtures/host-skill-eval.zh-CN.json");

test("Chinese host fixtures cover all packages, keep task families together, and use only synthetic targets", () => {
  const packages = ["kit", "ui", "bd", "design", "test"];
  assert.equal(catalogCases(catalog).length, catalog.cases.length);
  assert.equal(new Set(catalog.cases.map(item => item.id)).size, catalog.cases.length);
  assert.ok(catalog.cases.length >= 20);
  for (const key of packages) {
    assert.ok(catalog.cases.some(item => item.expect.skill === key && item.expect.subskill), `${key} exact decision`);
    for (const split of ["dev", "holdout"]) {
      assert.ok(catalog.cases.some(item => item.expect.skill === key && item.split === split), `${key} ${split}`);
    }
  }
  const families = new Map();
  for (const item of catalog.cases) {
    if (families.has(item.family)) assert.equal(families.get(item.family), item.split, item.family);
    families.set(item.family, item.split);
    for (const text of [item.prompt, ...Object.values(item.fixture.files || {})]) {
      for (const match of text.matchAll(/https?:\/\/[a-z0-9.-]+[a-z0-9]/gi)) {
        assert.match(new URL(match[0]).hostname, /\.invalid$/);
      }
    }
    if (item.fixture.service === "kit-menu") {
      assert.ok(item.expect.assertions.some(rule => rule.kind === "unchanged" && rule.path === ".wl-eval/menu-writes.log"));
    }
  }
});

test("representative cases require observable work and protect source files", () => {
  const cases = new Map(catalog.cases.map(item => [item.id, item.expect]));
  for (const [id, receipt, artifact, value, protectedPath] of [
    ["ui-form-scan", "cli:ui:scan", "docs/ui-form-scan.json", '"rule": "R006"', "src/views"],
    ["design-api-contract-only", "cli:design:design-mechanical-validator", "docs/stock-api.md", "GET /stock", "src"],
    ["test-weak-assertion-review", "cli:test:audit", "test-reports/audit-result.json", '"rule": "T3"', "tests"],
  ]) {
    const expect = cases.get(id);
    assert.ok(expect.requiredReceipts.includes(receipt), id);
    assert.ok(expect.assertions.some(item => item.kind === "contains" && item.path === artifact && item.value === value), id);
    assert.ok(expect.assertions.some(item => item.kind === "unchanged" && item.path === protectedPath), id);
  }
  const config = cases.get("bd-ops-config-review");
  assert.deepEqual(config.subskill, ["data-safety", "standard-env-config-be"]);
  assert.ok(config.assertions.some(item => item.kind === "contains" && item.path === "docs/bd-config-doctor.json" && item.value === '"probeRequested": false'));
  assert.ok(config.assertions.some(item => item.kind === "unchanged" && item.path === "src/main/resources"));
});

test("Kit menu fixture returns a real preview and independently records rejected write attempts", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "wl-menu-eval-"));
  const project = await fs.realpath(directory);
  const fixture = await startKitMenuFixture(project);
  t.after(async () => {
    await fixture.close();
    await fs.rm(project, { recursive: true, force: true });
  });
  const config = JSON.parse(await fs.readFile(path.join(project, ".wl-skills/config/kit-sync.local.json"), "utf8"));
  const log = path.join(project, ".wl-eval/menu-writes.log");
  const args = { orderOnly: true, items: [{ id: "502", orderNum: 5 }] };
  const preview = await handleMenuUpsert(args, config);
  assert.equal(preview.structuredContent.state, "ready");
  assert.equal(preview.structuredContent.mode, "preview");
  assert.match(preview.structuredContent.planHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(preview.structuredContent.actions, [{ action: "update", menuName: "质检", id: "502", orderNum: 5 }]);
  assert.equal(await fs.readFile(log, "utf8"), "");

  const attempted = await fetch(`${config.gatewayPath}/system/menu/update`, { method: "PUT" });
  assert.equal(attempted.status, 405);
  assert.equal((await fetch(`${config.gatewayPath}/system/menu/getMenuTreeByDomainId?domainId=wrong`)).status, 404);
  await fs.unlink(log);
  await fixture.finalize();
  assert.equal(await fs.readFile(log, "utf8"), "PUT /system/menu/update\n");
  assert.deepEqual(fixture.observe(), { successfulReads: 1, rejectedReads: 1, writeAttempts: 1 });
});

test("automatic approval is bound to the pinned Kit tools and their live loopback fixture", async t => {
  const project = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "wl-menu-approval-")));
  const service = await startKitMenuFixture(project);
  t.after(async () => {
    await service.close();
    await fs.rm(project, { recursive: true, force: true });
  });
  const version = "2.33.4";
  const kit = "node_modules/@agile-team/wl-skills-kit";
  const ui = "node_modules/@agile-team/wl-skills-ui";
  await Promise.all([kit, ui].map(async dir => {
    await fs.mkdir(path.join(project, dir), { recursive: true });
    await fs.writeFile(path.join(project, dir, "package.json"), JSON.stringify({ name: dir.slice(13), version }));
  }));
  await fs.mkdir(path.join(project, ".codex"));
  const entries = [["wl-skills", kit], ["wl-skills-ui", ui]].map(([name, dir]) =>
    `[mcp_servers.${name}]\ncommand = "node"\nargs = ["${dir}/mcp/server.js"]\ncwd = ${JSON.stringify(project)}\n` +
    `[mcp_servers.${name}.env]\nWL_PROJECT_ROOT = ${JSON.stringify(project)}\n`);
  await fs.writeFile(path.join(project, ".codex", "config.toml"), entries.join("\n"));
  const pins = { kit: { version, sha256: "a".repeat(64) }, ui: { version, sha256: "b".repeat(64) } };
  const row = { fixture: { service: "kit-menu" }, expect: { requiredTools: ["mcp:wls_menu_upsert", "mcp:wls_menu_delete", "mcp:wl_ui_scan"] } };
  const menuFixture = { row, service };
  const args = codexArguments(project, project, "test-run", pins, { menuFixture });
  assert.ok(args.includes('approval_policy="never"'));
  assert.ok(args.includes("sandbox_workspace_write.network_access=false"));
  const config = parseTOML(args.find(arg => arg.startsWith("mcp_servers="))).mcp_servers;
  const server = config["wl-skills"];
  assert.deepEqual({ ...server.tools.wls_menu_upsert }, { approval_mode: "approve" });
  assert.deepEqual(Object.keys(server.tools), ["wls_menu_upsert"]);
  assert.equal(config["wl-skills-ui"].tools, undefined);
  assert.equal(server.args[0], "--require");
  assert.equal(server.args.at(-1), path.join(project, kit, "mcp/server.js"));
  assert.equal(allowedMcp(project, pins, "test-run", {}, { row, service: {} })["wl-skills"].tools, undefined);
  assert.equal(allowedMcp(project, pins, "test-run", {}, { row: { ...row, fixture: {} }, service })["wl-skills"].tools, undefined);
  assert.equal(allowedMcp(project, { ...pins, kit: { version } }, "test-run", {}, menuFixture)["wl-skills"].tools, undefined);
  const query = { ...row, expect: { requiredTools: ["mcp:wls_menu_query"] } };
  assert.deepEqual(Object.keys(allowedMcp(project, pins, "test-run", {}, { row: query, service })["wl-skills"].tools), ["wls_menu_query"]);

  await promisify(execFile)(process.execPath, ["--require", server.args[1], "-e", `
    const assert = require('node:assert/strict');
    const http = require('node:http');
    const https = require('node:https');
    const port = Number(process.env.WL_EVAL_KIT_MENU_PORT);
    const options = { hostname: '127.0.0.1', port, path: '/system/menu/getPermissionMenuTree' };
    assert.throws(() => http.request({ ...options, port: port === 65535 ? 1 : port + 1 }), /synthetic loopback/);
    assert.throws(() => https.request(options), /synthetic loopback/);
    http.get(options, res => { assert.equal(res.statusCode, 200); res.resume(); });
  `], { env: { WL_EVAL_KIT_MENU_PORT: server.env.WL_EVAL_KIT_MENU_PORT }, timeout: 5000 });
  assert.equal(service.observe().successfulReads, 1);
  await service.close();
  assert.equal(allowedMcp(project, pins, "test-run", {}, menuFixture)["wl-skills"].tools, undefined);
});

test("summary ties observations to the case, excludes unknown from rates and counts metric coverage", () => {
  const row = catalog.cases.find(item => item.id === "kit-menu-sort-preview");
  const trial = (runId, selection, inputTokens) => ({
    host: { name: "codex", version: "fixture", model: "fixture" }, runId, status: "completed",
    metrics: inputTokens === undefined ? {} : { input_tokens: inputTokens },
    grade: { selection: { status: selection }, assertions: [{ kind: "unchanged", status: "passed" }], requiredTools: [],
      forbiddenTools: [], expectedMcpResults: [{ status: "failed" }] },
  });
  const report = {
    schemaVersion: 1, case: row.id, family: row.family, split: row.split, variant: "candidate",
    promptSha256: hash(row.prompt), caseSha256: hash(JSON.stringify(row)),
    trials: [trial("first", "passed", 100), trial("second", "unknown"), trial("third", "failed", 300)],
  };
  const { groups: [group] } = summarize(catalog, [report]);
  assert.deepEqual(group.selection, { truePositive: 1, falseNegative: 1, unknown: 1 });
  assert.equal(group.recall, 0.5);
  assert.deepEqual(group.taskOutcomes, { failed: 3 });
  assert.deepEqual(group.sideEffects, { passed: 3 });
  assert.deepEqual(group.metrics.input_tokens, { samples: 2, p50: 100, p95: 300 });
  assert.throws(() => summarize(catalog, [report, report]), /duplicate or invalid/);
  assert.throws(() => summarize(catalog, [{ ...report, caseSha256: "different" }]), /does not match/);
});

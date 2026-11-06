"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { catalogCases, grade, hash, parseCodex, parsePortable, readJournal, snapshotAssertions, wantedPackages } = require("../support/host-skill-eval.cjs");
const { options, kitInstallArgs, allowedMcp, codexArguments, probeKitQuery } = require("../scripts/host-skill-eval.cjs");
const { parse: parseTOML } = require("../support/vendor/smol-toml/index.cjs");

const runner = path.join(__dirname, "../scripts/host-skill-eval.cjs");
const host = { name: "codex", version: "0.166.0", model: "gpt-fixture" };
const trace = (...events) => events.map(event => JSON.stringify(event)).join("\n");
const terminal = { type: "turn.completed", usage: { input_tokens: 22, output_tokens: 7 } };
const testCase = (expect = { skill: "kit" }) => ({ id: "sample", family: "menu", split: "holdout", prompt: "核对菜单顺序", fixture: { kind: "pc" }, expect });

function scratch(t) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wl-host-eval-test-")));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

test("fixture manifest cannot contaminate holdout or override host/runtime files", () => {
  const row = testCase();
  assert.deepEqual(wantedPackages(row, "candidate"), ["kit"]);
  assert.deepEqual(wantedPackages({ ...row, fixture: { kind: "pc", packages: ["kit", "ui"] } }, "baseline"), ["kit", "ui"]);
  assert.deepEqual(wantedPackages(row, "no-skill"), []);
  assert.throws(() => catalogCases({ schemaVersion: 1, cases: [row, { ...row, id: "dev-case", split: "dev" }] }), /family crosses/);
  for (const file of ["../outside", ".codex/config.toml", "node_modules/x", "package.json", ".env.local"]) {
    assert.throws(() => catalogCases({ schemaVersion: 1, cases: [{ ...row, fixture: { kind: "pc", files: { [file]: "ignored" } } }] }));
  }
  assert.throws(() => options(["run", "--catalog", "example", "--case", "sample", "--variant", "candidate", "--out", "result"]), /pinned/);
});

test("legacy baseline only accepts the generated Kit entry bound to the exact installed executor", t => {
  assert.equal(kitInstallArgs("init     全量安装", "baseline").mode, "legacy");
  assert.equal(kitInstallArgs("init     全量安装", "candidate").mode, "compact");
  assert.equal(kitInstallArgs("  --hosts <ids>\n  --mcp / --no-mcp", "baseline").mode, "compact");
  const project = scratch(t);
  const packageRoot = path.join(project, "node_modules/@agile-team/wl-skills-kit");
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({ name: "@agile-team/wl-skills-kit", version: "2.33.4" }));
  const config = path.join(project, ".mcp.json");
  const writeEntry = entry => fs.writeFileSync(config, JSON.stringify({ mcpServers: { "wl-skills": entry } }));
  writeEntry({ command: "node", args: ["node_modules/@agile-team/wl-skills-kit/mcp/server.js"] });
  const pins = { kit: { version: "2.33.4" } };
  const runtime = allowedMcp(project, pins, "run-id", { kit: "legacy" })["wl-skills"];
  assert.equal(runtime.cwd, project);
  assert.deepEqual(runtime.env, { WL_PROJECT_ROOT: project, WL_TASK_RUN_ID: "run-id" });
  assert.deepEqual(runtime.args, [path.join(packageRoot, "mcp/server.js")]);
  const overrides = codexArguments(project, project, "run-id", pins, {}, { kit: "legacy" });
  assert.ok(!overrides.some(arg => arg.startsWith("mcp_servers.")));
  const registered = parseTOML(overrides.find(arg => arg.startsWith("mcp_servers="))).mcp_servers["wl-skills"];
  assert.deepEqual({ ...registered, env: { ...registered.env } }, runtime);
  assert.equal(parseTOML(overrides.find(arg => arg.startsWith("projects="))).projects[project].trust_level, "untrusted");
  assert.throws(() => allowedMcp(project, pins, "run-id", {}), /missing-fixture-mcp/);
  writeEntry({ command: "node", args: ["../outside.js"] });
  assert.throws(() => allowedMcp(project, pins, "run-id", { kit: "legacy" }), /unbound-fixture-mcp/);
});

test("Codex scores exact observed gateway/tool results, never claims skill absence or trusts text", () => {
  const root = "/fixture";
  const rows = [
    { type: "item.completed", item: { id: "forged-prose", type: "agent_message", text: "Used wl-skills-ui and pushed credentials-should-not-be-retained" } },
    { type: "item.completed", item: { id: "forged-read", type: "command_execution", status: "completed", exit_code: 0, command: "echo .agents/skills/wl-skills-ui/SKILL.md" } },
    { type: "item.completed", item: { id: "actual-read", type: "command_execution", status: "completed", exit_code: 0, command: "cat .agents/skills/wl-skills-kit/SKILL.md" } },
    { type: "item.started", item: { id: "blocked", type: "mcp_tool_call", tool: "wls_menu_sync" } },
    { type: "item.completed", item: { id: "failed", type: "mcp_tool_call", server: "wl-skills", tool: "wls_bad", status: "completed", result: {
      is_error: true, content: [{ type: "text", text: "参数校验失败: credentials-should-not-be-retained" }],
    } } },
    { type: "item.completed", item: { id: "actual-mcp", type: "mcp_tool_call", server: "wl-skills", tool: "wls_menu_upsert", status: "completed", result: {
      structured_content: { ok: true, state: "ready", mode: "preview", password: "credentials-should-not-be-retained" },
    } } },
    { type: "error", message: "Reconnecting..." },
    terminal,
  ];
  const trial = parseCodex(trace(...rows), { root, exitCode: 0, host, durationMs: 31 });
  assert.equal(trial.status, "completed");
  assert.equal(trial.coverage.skill, false);
  assert.deepEqual(trial.hostFailureKinds, { "connection-retry": 1 });
  assert.deepEqual(trial.metrics, { input_tokens: 22, output_tokens: 7, duration_ms: 31, host_tool_calls: 5 });
  assert.deepEqual(trial.evidence.map(row => row.id), ["actual-read", "blocked", "failed", "actual-mcp"]);
  assert.equal(trial.evidence.find(row => row.id === "failed").failureKind, "input-schema");
  assert.equal(JSON.stringify(trial).includes("credentials-should-not-be-retained"), false);
  const expected = testCase({ skill: "kit", requiredTools: ["mcp:wls_menu_upsert", "mcp:wls_bad"], forbiddenTools: ["wls_menu_sync"],
    expectedMcpResults: [{ tool: "wls_menu_upsert", fields: { state: "ready", mode: "preview" } }] });
  const verdict = grade(expected, trial, "candidate");
  assert.equal(verdict.selection.status, "passed");
  assert.deepEqual(verdict.requiredTools.map(row => row.status), ["passed", "failed"]);
  assert.equal(verdict.forbiddenTools[0].status, "failed");
  assert.equal(verdict.expectedMcpResults[0].status, "passed");
  assert.deepEqual(grade(testCase({ skill: "ui" }), trial, "candidate").selection.unexpectedPackages, ["kit"]);
  assert.equal(grade(testCase({ skill: null }), trial, "candidate").selection.status, "failed");
  const blank = parseCodex(trace(terminal), { root, exitCode: 0, host });
  assert.equal(grade(testCase({ skill: null }), blank, "candidate").selection.status, "unknown");
});

test("Codex distinguishes a host approval block from a package tool failure", () => {
  const trial = parseCodex(trace({ type: "item.completed", item: {
    id: "blocked", type: "mcp_tool_call", server: "wl-skills", tool: "wls_menu_upsert", status: "failed",
    error: { message: "MCP tool call requires approval, but approval policy is never" },
  } }, terminal), { root: "/fixture", exitCode: 0, host });
  const [call] = trial.evidence;
  assert.equal(call.failureKind, "host-approval-required");
  assert.equal(call.failureOrigin, "host-error");
  assert.equal(call.status, "failed");
  assert.equal(JSON.stringify(trial).includes("approval policy is never"), false);
});

test("Codex records bounded host failure categories without retaining error messages", () => {
  const trial = parseCodex(trace(
    { type: "error", error: { message: "Reconnecting... 1/5 (private endpoint)" } },
    { type: "error", message: "error sending request to https://private.example/secret" },
    { type: "turn.failed", error: { message: "unexpected status 401 Unauthorized: secret" } },
  ), { root: "/fixture", exitCode: 1, host });
  assert.equal(trial.status, "host-error");
  assert.deepEqual(trial.hostFailureKinds, { "connection-retry": 1, "connection-failure": 1, authentication: 1 });
  assert.equal(JSON.stringify(trial).includes("secret"), false);
});

test("menu acceptance requires exact actions, a plan hash, the internal skill and a same-run receipt", () => {
  const row = require("./fixtures/host-skill-eval.zh-CN.json").cases.find(item => item.id === "kit-menu-sort-preview");
  const root = "/fixture";
  const gateway = (id, skill) => ({ type: "item.completed", item: { id, type: "command_execution", status: "completed", exit_code: 0,
    command: `cat .agents/skills/wl-skills-${skill}/SKILL.md` } });
  const menu = (actions, planHash) => ({ type: "item.completed", item: { id: "menu", type: "mcp_tool_call", server: "wl-skills", tool: "wls_menu_upsert", status: "completed",
    result: { structured_content: { ok: true, state: "ready", mode: "preview", actions, planHash } } } });
  const evidence = (events, journal = []) => {
    const trial = parseCodex(trace(...events, terminal), { root, exitCode: 0, host });
    return { ...trial, runId: "r1", journalComplete: true, evidence: [...trial.evidence, ...journal] };
  };
  const correct = [{ action: "update", id: "502", orderNum: 5 }];
  const good = menu(correct, "a".repeat(64));
  const decision = { kind: "decision", package: "kit", source: "journal", runId: "r1", selected: ["menu-sync"] };
  const receipt = { kind: "tool", channel: "mcp", tool: "wls_menu_upsert", package: "kit", source: "journal", runId: "r1", status: "completed",
    planFingerprint: hash("a".repeat(64)) };
  const verdict = grade(row, evidence([gateway("kit", "kit"), good], [decision, receipt]), "candidate");
  assert.deepEqual([verdict.selection, verdict.decision, ...verdict.receipts, ...verdict.expectedMcpResults].map(item => item.status),
    ["passed", "passed", "passed", "passed"]);
  for (const [server, expected] of [["mimic-mcp", "failed"], [undefined, "unknown"]]) {
    const foreign = { ...good, item: { ...good.item, server } };
    const verdict = grade(row, evidence([foreign], [decision, receipt]), "candidate");
    assert.deepEqual([...verdict.requiredTools, ...verdict.receipts, ...verdict.expectedMcpResults].map(item => item.status), [expected, expected, expected]);
  }
  const partial = grade(row, { ...evidence([gateway("kit", "kit"), good], [decision, receipt]), status: "timeout" }, "candidate");
  assert.deepEqual([partial.selection, partial.decision, ...partial.requiredTools, ...partial.receipts, ...partial.expectedMcpResults]
    .map(item => item.status), ["passed", "passed", "passed", "passed", "passed"]);
  const missing = grade(row, { ...evidence([gateway("kit", "kit")]), status: "timeout" }, "candidate");
  assert.deepEqual([missing.decision, ...missing.requiredTools, ...missing.receipts, ...missing.expectedMcpResults]
    .map(item => item.status), ["unknown", "unknown", "unknown", "unknown"]);
  const wrong = [{ action: "update", id: "501", orderNum: 99 }];
  for (const result of [menu(wrong, "a".repeat(64)), menu([...correct, ...wrong], "a".repeat(64)), menu(correct, "no-plan")]) {
    assert.equal(grade(row, evidence([result]), "candidate").expectedMcpResults[0].status, "failed");
  }
  const unexpectedAction = grade(row, evidence([menu([...correct, { action: "update", id: "501", orderNum: 10 }], "a".repeat(64))],
    [decision, receipt]), "candidate");
  assert.equal(unexpectedAction.expectedMcpResults[0].status, "failed");
  assert.equal(unexpectedAction.receipts[0].status, "passed");
  const mismatch = grade(row, evidence([gateway("kit", "kit"), gateway("ui", "ui"), good], [
    { ...decision, selected: ["menu-sync", "page-codegen"] }, { ...receipt, runId: "other-run" },
  ]), "candidate");
  assert.deepEqual(mismatch.selection.unexpectedPackages, ["ui"]);
  assert.equal(mismatch.decision.status, "failed");
  assert.equal(mismatch.receipts[0].status, "failed");
  const unrelated = { ...receipt, planFingerprint: hash("b".repeat(64)) };
  assert.equal(grade(row, evidence([good], [decision, unrelated]), "candidate").receipts[0].status, "failed");
  assert.equal(grade(testCase({ skill: "kit", invocation: "explicit" }), evidence([gateway("kit", "kit")]), "candidate").selection.status, "unknown");
  assert.equal(grade(row, evidence([good]), "no-skill").receipts[0].status, "skipped");
});

test("MCP evidence separates unknown startup from model omission and failed business output", () => {
  const row = testCase({ requiredTools: ["wls_menu_upsert"] });
  const completed = { status: "completed", coverage: { skill: false, tools: true }, evidence: [] };
  const mcp = { status: "not-observed", servers: [{ name: "wl-skills", tools: [] }] };
  const unresolved = { ...completed, discovery: { mcp } };
  assert.equal(grade(row, unresolved, "candidate").requiredTools[0].status, "unknown");
  mcp.servers[0].tools.push("wls_menu_upsert");
  assert.equal(grade(row, unresolved, "candidate").requiredTools[0].status, "failed");
  const base = { kind: "tool", channel: "mcp", tool: "wls_menu_upsert" };
  unresolved.evidence = [{ ...base, source: "journal", status: "completed" }, { ...base, source: "codex-jsonl", status: "failed" }];
  assert.equal(grade(row, unresolved, "candidate").requiredTools[0].status, "failed");
});

test("native diagnostics reuse the same ephemeral thread and retain only projected MCP facts", async () => {
  const requests = [];
  const request = async (method, params) => {
    requests.push([method, params]);
    if (method === "thread/start") return { thread: { id: "thread-1" } };
    if (method === "mcpServerStatus/list") return { data: [{ name: "wl-skills", tools: { wls_menu_query: {} } }] };
    return { isError: true, content: [{ text: "配置加载失败: synthetic-redacted-detail" }] };
  };
  const result = await probeKitQuery(request, "/fixture", "null");
  assert.deepEqual(requests.map(([method]) => method), ["thread/start", "mcpServerStatus/list", "mcpServer/tool/call"]);
  assert.equal(requests[0][1].ephemeral, true);
  assert.equal(requests[1][1].threadId, requests[2][1].threadId);
  assert.deepEqual(requests[2][1], { threadId: "thread-1", server: "wl-skills", tool: "wls_menu_query", arguments: null });
  assert.equal(result.availability.status, "advertised");
  assert.equal(result.failureKind, "local-config");
  assert.equal(JSON.stringify(result).includes("synthetic-redacted-detail"), false);
});

test("incomplete host sessions cannot pass a negative and portable normalized evidence is attributable", () => {
  const row = testCase({ skill: null, forbiddenTools: ["wls_menu_upsert"] });
  for (const [stdout, extra] of [[trace(terminal), { infrastructure: "timeout" }], ["{invalid\n", {}], [trace({ type: "turn.failed" }), {}]]) {
    const trial = parseCodex(stdout, { root: "/fixture", exitCode: 0, host, ...extra });
    const result = grade(row, trial, "candidate");
    assert.equal(result.selection.status, "unknown");
    assert.equal(result.forbiddenTools[0].status, "unknown");
  }
  const source = { schemaVersion: 1, host: { name: "zcode", version: "0.17.1" }, variant: "candidate", runId: "r1",
    status: "completed", coverage: { skill: true, tools: true }, events: [], metrics: { input_tokens: 30, secret: "ignored" } };
  const imported = parsePortable(source);
  assert.equal(imported.source, "portable-operator-export");
  assert.deepEqual(imported.metrics, { input_tokens: 30 });
  assert.equal(grade(row, imported, "candidate").selection.status, "passed");
  assert.throws(() => parsePortable({ ...source, events: [{ id: "different", kind: "tool", channel: "cli", tool: "validate", status: "completed", package: "kit", runId: "r2" }] }), /portable tool/);
});

test("deterministic outcomes use bytes and directory entries and survive removal of WL requirements", t => {
  const root = scratch(t);
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "one.vue"), "initial");
  const assertion = [{ kind: "unchanged", path: "src" }, { kind: "contains", path: "src/one.vue", value: "updated" }];
  const before = snapshotAssertions(root, assertion);
  fs.writeFileSync(path.join(root, "src", "one.vue"), "updated");
  const after = snapshotAssertions(root, assertion);
  const row = testCase({ skill: "kit", requiredTools: ["wls_route"], assertions: assertion });
  const trial = parseCodex(trace(terminal), { root, exitCode: 0, host });
  const result = grade(row, trial, "no-skill", { before, after });
  assert.equal(result.selection.status, "skipped");
  assert.equal(result.requiredTools[0].status, "skipped");
  assert.deepEqual(result.assertions.map(item => item.status), ["failed", "passed"]);
  fs.symlinkSync(os.tmpdir(), path.join(root, "linked"));
  assert.equal(snapshotAssertions(root, [{ kind: "exists", path: "linked/file" }])[0].observable, false);
});

test("completed package receipts are bound to fixture, installed identity, and the expected run", t => {
  const root = scratch(t);
  const directory = path.join(root, ".wl-skills/state/kit/runs/actual-run");
  fs.mkdirSync(directory, { recursive: true });
  const evidence = { kind: "tool-finished", eventId: "proof", recordVersion: 1, packageName: "@agile-team/wl-skills-kit",
    packageVersion: "2.33.5", runId: "actual-run", tool: "validate", executionStatus: "completed", validationStatus: "failed", summary: "sensitive-output" };
  fs.writeFileSync(path.join(directory, "1.json"), JSON.stringify(evidence));
  fs.writeFileSync(path.join(directory, "2.json"), JSON.stringify({ ...evidence, kind: "task-decision", eventId: "decision",
    decision: { selectedSkills: ["menu-sync"], other: "sensitive-output" } }));
  const packages = { kit: { version: "2.33.5" } };
  const proof = readJournal(root, packages, "actual-run");
  assert.equal(proof.complete, true);
  assert.equal(proof.evidence[0].tool, "validate");
  assert.equal(proof.evidence[0].status, "completed");
  assert.equal(proof.evidence[0].validationStatus, "failed");
  assert.match(proof.evidence[0].sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(proof.evidence[1].selected, ["menu-sync"]);
  assert.equal(JSON.stringify(proof).includes("sensitive-output"), false);
  const trial = { status: "completed", coverage: { skill: false, tools: true }, evidence: proof.evidence };
  assert.equal(grade(testCase({ requiredTools: ["cli:kit:validate"] }), trial, "candidate").requiredTools[0].status, "passed");
  assert.equal(readJournal(root, { kit: { version: "2.33.6" } }, "actual-run").complete, false);
  assert.equal(readJournal(root, packages, "other-run").evidence.length, 0);
});

test("CLI lifecycle invokes a mock App Server and model stream without sharing workspace state", t => {
  const root = scratch(t), fake = path.join(root, "codex"), file = path.join(root, "cases.json"), output = path.join(root, "result.json");
  const row = testCase({ skill: "kit", assertions: [{ kind: "unchanged", path: "src/views" }] });
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, cases: [row] }));
  fs.writeFileSync(fake, `#!${process.execPath}
const lines = require('node:readline').createInterface({input:process.stdin});
if(process.argv.includes('app-server'))lines.on('line',line=>{
  const event = JSON.parse(line);
  if(event.method==='initialize')console.log(JSON.stringify({id:event.id,result:{userAgent:'wl-eval/0.166.0 test'}}));
  if(event.method==='skills/list')console.log(JSON.stringify({id:event.id,result:{data:[{cwd:event.params.cwds[0],skills:[]}]}}));
});
else {
  if(process.cwd()===${JSON.stringify(root)}) process.exit(3);
  process.stdin.resume();
  process.stdin.on('end',()=>console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:42}})));
}
`, { mode: 0o700 });
  const args = [runner, "run", "--catalog", file, "--case", row.id, "--variant", "no-skill", "--codex", fake, "--out", output];
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(output, "utf8"));
  assert.match(report.caseSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.trials[0].status, "completed");
  assert.equal(report.trials[0].grade.assertions[0].status, "passed");
  assert.equal(report.trials[0].metrics.input_tokens, 42);
  assert.equal(report.trials[0].traceRetained, false);
  assert.equal(spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 10000 }).status, 1);
});

test("strict mode keeps a completed run's unknown verdict distinct from an infrastructure failure", t => {
  const root = scratch(t), file = path.join(root, "cases.json"), evidence = path.join(root, "evidence.json"), output = path.join(root, "result.json");
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, cases: [testCase()] }));
  fs.writeFileSync(evidence, JSON.stringify({ schemaVersion: 1, host: { name: "manual-host" }, variant: "candidate", runId: "example",
    status: "completed", coverage: { skill: false, tools: false }, events: [] }));
  const args = [runner, "ingest", "--catalog", file, "--case", "sample", "--evidence", evidence, "--out", output, "--strict", "true"];
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 3, result.stderr);
  const report = JSON.parse(fs.readFileSync(output, "utf8"));
  assert.equal(report.trials[0].status, "completed");
  assert.equal(report.trials[0].grade.selection.status, "unknown");
});

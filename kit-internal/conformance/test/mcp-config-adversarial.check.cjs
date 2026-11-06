"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const api = require("../support/mcp-config.cjs");
const format = require("../support/mcp-config-format.cjs");
const PACKAGE = "@agile-team/wl-skills-ui";
const SERVER = "wl-skills-ui";

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wl-mcp-adversarial-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function put(root, relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  return file;
}
function materialize(root, plan) {
  assert.deepEqual(plan.conflicts, []);
  for (const file of plan.files) {
    if (file.action === "write") put(root, file.path, file.content);
    if (file.action === "remove") fs.unlinkSync(path.join(root, file.path));
  }
}
function initial(root, host) {
  const plan = api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, hosts: [host], enabled: true });
  materialize(root, plan);
  return plan;
}
function runtime(root, directory = false) {
  put(root, `node_modules/${PACKAGE}/package.json`, { name: PACKAGE, version: "1.22.2" });
  const entry = `node_modules/${PACKAGE}/mcp/server.js`;
  if (directory) fs.mkdirSync(path.join(root, entry), { recursive: true });
  else put(root, entry, "// Local static runtime fixture; never spawned.\n");
}
function assertPreserved(plan, before) {
  assert.ok(plan.conflicts.length > 0, "invalid ownership must be reviewable");
  assert.ok(plan.files.every(file => !["write", "remove"].includes(file.action)));
  assert.ok(plan.files.every(file => file.content === before || file.before === null));
}

test("a forged previous record cannot claim a foreign service merely by matching its hash", t => {
  const root = fixture(t), foreign = { command: "node", args: ["/team/server.js"] };
  const before = JSON.stringify({ teamFact: "keep", mcpServers: { foreign } });
  put(root, ".mcp.json", before);
  const previous = { ".mcp.json": { packageName: PACKAGE, path: ".mcp.json", format: "jsonc", serverKey: "foreign", serverPath: ["mcpServers", "foreign"], owned: true,
    valueHash: crypto.createHash("sha256").update(JSON.stringify(foreign)).digest("hex"), hashAlgorithm: "sha256", valueSerialization: "json" } };
  assertPreserved(api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, previous, remove: true }), before);
  assert.equal(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"), before);
});

test("ownership map key, physical file, format and container remain bound to this package", t => {
  for (const mutation of [record => ({ ...record, path: ".cursor/mcp.json" }), record => ({ ...record, serverPath: ["team", SERVER] }), record => ({ ...record, format: "toml" })]) {
    const root = fixture(t), first = initial(root, "claude"), before = fs.readFileSync(path.join(root, ".mcp.json"), "utf8");
    const previous = { ".mcp.json": mutation(first.records[".mcp.json"]) };
    assertPreserved(api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, previous, remove: true }), before);
    assert.ok(!fs.existsSync(path.join(root, ".cursor/mcp.json")));
  }
});

test("forged container cleanup and TOML separators cannot consume team-owned content", t => {
  const root = fixture(t);
  put(root, ".mcp.json", '{"team":{},"mcpServers":{}}\n');
  const first = initial(root, "claude"), before = fs.readFileSync(path.join(root, ".mcp.json"), "utf8");
  const previous = { ".mcp.json": { ...first.records[".mcp.json"], createdContainers: [["team"]] } };
  assertPreserved(api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, previous, remove: true }), before);
  const tomlRoot = fixture(t), original = "# Team-owned comment\n";
  put(tomlRoot, ".codex/config.toml", original);
  const toml = initial(tomlRoot, "codex"), current = fs.readFileSync(path.join(tomlRoot, ".codex/config.toml"), "utf8");
  const forged = { ".codex/config.toml": { ...toml.records[".codex/config.toml"], addedSeparator: original } };
  assertPreserved(api.planMcpConfiguration({ projectRoot: tomlRoot, packageName: PACKAGE, previous: forged, remove: true }), current);
});

test("ZCode reuses active compatibility services instead of silently shadowing the whole fallback file", t => {
  for (const native of [null, '{"theme":"team-dark","mcp":{"servers":{}}}\n']) {
    const root = fixture(t);
    const foreign = { command: "node", args: ["/team/server.js"] };
    put(root, ".agents/mcp.json", `// Team compatibility servers\n${JSON.stringify({ mcpServers: { foreign } })}\n`);
    if (native !== null) put(root, ".zcode/config.json", native);
    const plan = api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, hosts: ["zcode"], enabled: true });
    assert.deepEqual(plan.conflicts, []);
    const changed = plan.files.find(file => file.action === "write");
    assert.equal(changed.path, ".agents/mcp.json");
    assert.deepEqual(format.document(changed.content, "jsonc", changed.path).mcpServers.foreign, foreign);
    assert.ok(!plan.files.some(file => file.path === ".zcode/config.json" && file.action === "write"));
    materialize(root, plan); runtime(root);
    const inspection = api.inspectMcpConfiguration({ projectRoot: root, packageName: PACKAGE, host: "zcode" });
    assert.equal(inspection.status, "configured");
    assert.equal(inspection.connection, "unverified");
    if (native === null) assert.ok(!fs.existsSync(path.join(root, ".zcode/config.json")));
    else assert.equal(fs.readFileSync(path.join(root, ".zcode/config.json"), "utf8"), native);
  }
});

test("ZCode native services win while malformed active fallback blocks rather than disappearing", t => {
  const root = fixture(t);
  put(root, ".agents/mcp.json", { mcpServers: { inactive: { command: "team" } } });
  put(root, ".zcode/config.json", { theme: "keep", mcp: { servers: { active: { command: "team" } } } });
  const plan = api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, hosts: ["zcode"], enabled: true });
  assert.equal(plan.files.find(file => file.action === "write").path, ".zcode/config.json");
  materialize(root, plan);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, ".zcode/config.json"))).mcp.servers.active.command, "team");
  const broken = fixture(t); put(broken, ".agents/mcp.json", '{"mcpServers": ');
  const invalid = api.planMcpConfiguration({ projectRoot: broken, packageName: PACKAGE, hosts: ["zcode"], enabled: true });
  assert.ok(invalid.diagnostics.some(item => item.status === "invalid"));
  assert.ok(!invalid.files.some(file => ["write", "remove"].includes(file.action)));
});

test("multiple Kilo project files preserve existing owned and foreign contributions until resolved", t => {
  const root = fixture(t), first = initial(root, "kilo"), relative = first.files[0].path;
  const before = fs.readFileSync(path.join(root, relative), "utf8");
  put(root, "kilo.json", { mcp: { foreign: { type: "local", command: ["team"] } } });
  const plan = api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, hosts: ["kilo"], enabled: true, previous: first.records });
  assert.ok(plan.diagnostics.some(item => item.status === "ambiguous"));
  assertPreserved(plan, before);
  assert.equal(api.inspectMcpConfiguration({ projectRoot: root, packageName: PACKAGE, host: "kilo" }).status, "ambiguous");
});

test("owned JSONC comments survive conflicts, and foreign content survives a normal remove", t => {
  const root = fixture(t), original = '{\n  // Team settings\n  "team": {"keep": true},\n  "mcpServers": {"foreign": {"command": "team"}}\n}\n';
  put(root, ".mcp.json", original);
  const first = initial(root, "claude"), file = path.join(root, ".mcp.json");
  const body = fs.readFileSync(file, "utf8").replace('"WL_PROJECT_ROOT":', '/* Team note within the owned server */ "WL_PROJECT_ROOT":');
  put(root, ".mcp.json", body);
  assertPreserved(api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, previous: first.records, remove: true }), body);
  put(root, ".mcp.json", first.files[0].content);
  const removal = api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, previous: first.records, remove: true });
  assert.deepEqual(removal.conflicts, []);
  const { content } = removal.files[0];
  assert.match(content, /\/\/ Team settings/);
  assert.deepEqual(format.document(content, "jsonc", ".mcp.json"), { team: { keep: true }, mcpServers: { foreign: { command: "team" } } });
});

test("new team comments in generated parent containers survive removal of the owned server", t => {
  for (const [host, anchor] of [["claude", `"${SERVER}":`], ["zcode", `"${SERVER}":`], ["zcode", '"servers":']]) {
    const root = fixture(t), first = initial(root, host), relative = first.files[0].path;
    const body = first.files[0].content.replace(anchor, `/* Team note outside owned server */ ${anchor}`);
    assert.notEqual(body, first.files[0].content);
    put(root, relative, body);
    const removal = api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, previous: first.records, remove: true });
    assert.deepEqual(removal.conflicts, []);
    const { content } = removal.files[0];
    assert.equal(typeof content, "string", "a team comment prevents deleting its generated parent file");
    assert.match(content, /\/\* Team note outside owned server \*\//);
    assert.equal(format.lookup(format.document(content, "jsonc", relative), first.records[relative].serverPath), undefined);
  }
});

test("a team comment between the owned property key and its value cannot be consumed", t => {
  const root = fixture(t), first = initial(root, "claude"), relative = first.files[0].path;
  const body = first.files[0].content.replace(`"${SERVER}":`, `"${SERVER}" /* Team key note */:`);
  put(root, relative, body);
  const removal = api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, previous: first.records, remove: true });
  const file = removal.files[0];
  assert.equal(typeof file.content, "string");
  assert.match(file.content, /\/\* Team key note \*\//);
  if (file.action === "preserve") assert.equal(file.content, body);
});

test("TOML removal preserves exact unrelated settings, comments and line endings", t => {
  const root = fixture(t), original = '# Team config\r\nmodel = "test-model"\r\n\r\n[mcp_servers.foreign]\r\ncommand = "team"\r\nargs = ["--value", "keep"]\r\n';
  put(root, ".codex/config.toml", original);
  const first = initial(root, "codex"), before = fs.readFileSync(path.join(root, ".codex/config.toml"), "utf8");
  assert.ok(before.startsWith(original));
  const removal = api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, previous: first.records, remove: true });
  assert.deepEqual(removal.conflicts, []);
  assert.equal(removal.files[0].content, original);
});

test("a competing remote transport cannot masquerade as the configured local package launch", t => {
  const root = fixture(t), first = initial(root, "claude"), relative = first.files[0].path;
  const current = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  Object.assign(current.mcpServers[SERVER], { type: "http", url: "https://invalid.example/mcp" });
  put(root, relative, current); runtime(root);
  const inspection = api.inspectMcpConfiguration({ projectRoot: root, packageName: PACKAGE, host: "claude" });
  assert.notEqual(inspection.status, "configured");
  assert.equal(inspection.connection, "unverified");
});

test("a mistyped host enable flag cannot be reported as configured", t => {
  for (const [host, flag] of [["codex", "enabled"], ["zcode", "enable"], ["kilo", "enabled"], ["kiro", "disabled"], ["roo", "disabled"]]) {
    const root = fixture(t), first = initial(root, host), relative = first.files[0].path, record = first.records[relative];
    const value = { ...format.inspectEntry(first.files[0].content, record).value, [flag]: "false" };
    put(root, relative, format.setEntry(first.files[0].content, record, value, record).content);
    runtime(root);
    const inspection = api.inspectMcpConfiguration({ projectRoot: root, packageName: PACKAGE, host });
    assert.notEqual(inspection.status, "configured", `${host}: ${flag} must be a boolean when supplied`);
    assert.equal(inspection.connection, "unverified");
  }
});

test("a directory at the server entry is not a usable MCP runtime", t => {
  const root = fixture(t); initial(root, "claude"); runtime(root, true);
  const inspection = api.inspectMcpConfiguration({ projectRoot: root, packageName: PACKAGE, host: "claude" });
  assert.notEqual(inspection.status, "configured");
  assert.equal(inspection.connection, "unverified");
});

test("symlinked host configuration ancestors never authorize external reads or writes", t => {
  const root = fixture(t), outside = fixture(t);
  const sentinel = put(outside, "config.json", '{"team":"outside"}\n');
  fs.symlinkSync(outside, path.join(root, ".zcode"), "dir");
  const plan = api.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, hosts: ["zcode"], enabled: true });
  assert.ok(plan.diagnostics.some(item => item.status === "invalid"));
  assert.ok(!plan.files.some(file => ["write", "remove"].includes(file.action)));
  assert.equal(fs.readFileSync(sentinel, "utf8"), '{"team":"outside"}\n');
});

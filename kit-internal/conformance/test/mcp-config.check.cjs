"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const core = require("../support/mcp-config.cjs");
const fmt = require("../support/mcp-config-format.cjs");
const PACKAGE = "@agile-team/wl-skills-kit";

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wl-native-mcp-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function put(root, rel, text) {
  const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return file;
}
function apply(root, plan) {
  for (const file of plan.files) {
    if (file.action === "write") put(root, file.path, file.content);
    if (file.action === "remove") fs.unlinkSync(path.join(root, file.path));
  }
  return plan.records;
}
function plan(root, options = {}) { return core.planMcpConfiguration({ projectRoot: root, packageName: PACKAGE, hosts: ["codex"], enabled: true, ...options }); }
function runtime(root, packageName = PACKAGE) {
  const definition = core.mcpDefinition(packageName);
  put(root, `node_modules/${packageName}/package.json`, JSON.stringify({ name: packageName, version: "1.0.0" }));
  put(root, `node_modules/${packageName}/${definition.entry}`, "// fixture only\n");
}

for (const [host, rel, segments, expected] of [
  ["codex", ".codex/config.toml", ["mcp_servers", "wl-skills"], value => value.command === "node"],
  ["zcode", ".zcode/config.json", ["mcp", "servers", "wl-skills"], value => value.enable === true],
  ["kilo", ".kilo/kilo.jsonc", ["mcp", "wl-skills"], value => value.type === "local" && Array.isArray(value.command) && value.enabled === true],
  ["copilot", ".mcp.json", ["mcpServers", "wl-skills"], value => value.command === "node" && !value.cwd],
  ["cursor", ".cursor/mcp.json", ["mcpServers", "wl-skills"], value => value.command === "node"],
  ["kiro", ".kiro/settings/mcp.json", ["mcpServers", "wl-skills"], value => value.disabled === false],
  ["roo", ".roo/mcp.json", ["mcpServers", "wl-skills"], value => value.disabled === false],
  ["claude", ".mcp.json", ["mcpServers", "wl-skills"], value => value.command === "node" && !value.disabled],
]) test(`native ${host} contract is pure, idempotent and reversible`, t => {
  const root = fixture(t), initial = plan(root, { hosts: [host] });
  assert.deepEqual(initial.conflicts, []); assert.deepEqual(initial.diagnostics, []);
  assert.equal(initial.files.length, 1); assert.equal(initial.files[0].path, rel); assert.equal(fs.existsSync(path.join(root, rel)), false);
  const record = initial.records[rel];
  assert.deepEqual(record.serverPath, segments);
  const parsed = fmt.document(initial.files[0].content, record.format, rel), value = fmt.lookup(parsed, segments);
  assert.ok(expected(value));
  assert.equal((value.env || value.environment).WL_PROJECT_ROOT, root);
  assert.equal((value.args || value.command.slice(1))[0], path.join(root, "node_modules", PACKAGE, "mcp/server.js"));
  const previous = apply(root, initial), repeat = plan(root, { hosts: [host], previous });
  assert.equal(repeat.files[0].action, "none");
  runtime(root); assert.equal(core.inspectMcpConfiguration({ projectRoot: root, packageName: PACKAGE, host }).status, "configured");
  const removal = plan(root, { hosts: [], enabled: false, previous });
  assert.equal(removal.files[0].action, "remove"); apply(root, removal);
  assert.equal(fs.existsSync(path.join(root, rel)), false);
});

test("selected hosts share one portable contribution and leave unrelated directories untouched", t => {
  const root = fixture(t);
  const initial = plan(root, { hosts: ["claude", "copilot"] });
  assert.equal(initial.files.length, 1); assert.deepEqual(initial.records[".mcp.json"].hostIds, ["claude", "copilot"]);
  assert.equal(fs.existsSync(path.join(root, ".codex")), false);
  assert.equal(core.planMcpConfiguration({ projectRoot: root, packageName: "@agile-team/wl-skills-design", hosts: ["codex"], enabled: true }).diagnostics[0].status, "not-provided");
  assert.equal(plan(root, { hosts: ["cline"] }).diagnostics[0].status, "unsupported-manual");
});

test("JSONC foreign services, comments, user policy and same-name entries survive", t => {
  const root = fixture(t), rel = ".zcode/config.json";
  const original = '{\r\n // user policy\r\n "theme": "dark", "mcp": {"servers": {"foreign": {"command":"custom"}}}\r\n}\r\n';
  put(root, rel, original);
  const previous = apply(root, plan(root, { hosts: ["zcode"] }));
  const installed = fs.readFileSync(path.join(root, rel), "utf8");
  assert.ok(installed.includes('// user policy\r\n')); assert.ok(installed.includes('"foreign": {"command":"custom"}'));
  apply(root, plan(root, { hosts: [], enabled: false, previous }));
  assert.equal(fs.readFileSync(path.join(root, rel), "utf8"), original);
  put(root, rel, '{"mcp":{"servers":{"wl-skills":{"command":"mine"}}}}');
  const collision = plan(root, { hosts: ["zcode"] });
  assert.equal(collision.files[0].action, "preserve"); assert.equal(collision.files[0].record, null);
});

test("TOML preserves user bytes, large integers, inline tables and multiline strings", t => {
  const root = fixture(t), rel = ".codex/config.toml";
  const original = '# user settings\r\nmodel = "gpt-example"\r\nlarge = 9223372036854775807\r\n[profiles.custom]\r\nnote = """\r\nnot a [mcp_servers.fake] table\r\n"""';
  put(root, rel, original);
  const previous = apply(root, plan(root));
  assert.ok(fs.readFileSync(path.join(root, rel), "utf8").startsWith(original));
  apply(root, plan(root, { enabled: false, previous }));
  assert.equal(fs.readFileSync(path.join(root, rel), "utf8"), original);
  put(root, rel, 'mcp_servers = {"wl-skills" = {command="mine"}}\n');
  assert.equal(plan(root).files[0].action, "preserve");
});

test("unowned equivalent entries remain references across update and clean", t => {
  const root = fixture(t), initial = plan(root, { hosts: ["claude"] });
  put(root, ".mcp.json", initial.files[0].content);
  const first = plan(root, { hosts: ["claude"] });
  assert.equal(first.files[0].record.owned, false);
  assert.equal(plan(root, { hosts: ["claude"], previous: first.records }).files[0].action, "none");
  const removed = plan(root, { enabled: false, previous: first.records });
  assert.equal(removed.files[0].action, "none"); assert.deepEqual(removed.records, {});
  assert.equal(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"), initial.files[0].content);
});

test("local changes and comments prevent overwrites or ownership loss", t => {
  const root = fixture(t), initial = plan(root), previous = apply(root, initial), rel = ".codex/config.toml";
  const changed = fs.readFileSync(path.join(root, rel), "utf8").replace('command = "node"', 'command = "custom-node"');
  put(root, rel, changed);
  assert.equal(plan(root, { previous }).files[0].action, "preserve");
  const removal = plan(root, { enabled: false, previous });
  assert.equal(removal.files[0].action, "preserve"); assert.deepEqual(removal.records, previous);
  assert.equal(fs.readFileSync(path.join(root, rel), "utf8"), changed);
});

test("host changes retire only verified old ownership and migrate all four packages independently", t => {
  const root = fixture(t);
  for (const key of ["kit", "ui", "bd", "test"]) {
    const packageName = `@agile-team/wl-skills-${key}`;
    const before = core.planMcpConfiguration({ projectRoot: root, packageName, hosts: ["codex"], enabled: true });
    const previous = apply(root, before);
    const migrated = core.planMcpConfiguration({ projectRoot: root, packageName, hosts: ["zcode"], enabled: true, previous });
    assert.deepEqual(migrated.conflicts, []); apply(root, migrated);
    assert.equal(migrated.records[".zcode/config.json"].owned, true);
  }
  assert.equal(Object.keys(fmt.document(fs.readFileSync(path.join(root, ".zcode/config.json"), "utf8"), "jsonc").mcp.servers).length, 4);
});

test("legacy hashes migrate only their exact owned node and retain modified evidence", t => {
  const root = fixture(t), rel = ".mcp.json", legacy = { command: "npx", args: ["old-package"] };
  put(root, rel, JSON.stringify({ mcpServers: { "wl-skills": legacy, foreign: { command: "mine" } } }));
  for (const [algorithm, valueSerialization] of [["md5", "json"], ["sha256", "stable"]]) {
    const previous = core.importLegacyMcpRecords({ projectRoot: root, packageName: PACKAGE, entries: [{ path: rel, container: "mcpServers", valueHash: fmt.hash(fmt.valueText(legacy, valueSerialization), algorithm), algorithm, valueSerialization }] });
    const migrated = plan(root, { hosts: ["codex"], previous });
    assert.deepEqual(migrated.conflicts, []); assert.equal(migrated.files.find(file => file.path === rel).action, "write");
  }
  const previous = core.importLegacyMcpRecords({ projectRoot: root, packageName: PACKAGE, entries: [{ path: rel, valueHash: "old-modified-hash" }] });
  assert.equal(plan(root, { hosts: ["codex"], previous }).files.find(file => file.path === rel).action, "preserve");
});

test("Kilo ambiguity, malformed input, symlinks and oversized configs fail without writes", t => {
  const root = fixture(t);
  put(root, "kilo.json", "{}"); put(root, ".kilo/kilo.jsonc", "{}");
  assert.equal(plan(root, { hosts: ["kilo"] }).diagnostics[0].status, "ambiguous");
  put(root, ".codex/config.toml", "bad = [1 #");
  assert.equal(plan(root).files[0].action, "preserve");
  put(root, ".codex/config.toml", "#".repeat(1024 * 1024 + 1));
  assert.equal(plan(root).files[0].action, "preserve");
  fs.rmSync(path.join(root, ".codex"), { recursive: true });
  fs.symlinkSync(root, path.join(root, ".codex"));
  const symbolic = plan(root);
  assert.equal(symbolic.diagnostics[0].status, "invalid"); assert.equal(symbolic.files.length, 0);
});

test("content diagnosis separates disabled, changed launch, runtime and connection", t => {
  const root = fixture(t), packageName = PACKAGE, host = "zcode";
  const inspect = () => core.inspectMcpConfiguration({ projectRoot: root, packageName, host });
  assert.equal(inspect().status, "missing");
  apply(root, plan(root, { hosts: [host] })); assert.equal(inspect().status, "runtime-missing");
  runtime(root); assert.equal(inspect().status, "configured"); assert.equal(inspect().connection, "unverified");
  const file = path.join(root, ".zcode/config.json"), value = JSON.parse(fs.readFileSync(file));
  value.mcp.servers["wl-skills"].enable = false; fs.writeFileSync(file, JSON.stringify(value));
  assert.equal(inspect().status, "disabled");
  value.mcp.servers["wl-skills"].enable = true; value.mcp.servers["wl-skills"].args = ["wrong.js"]; fs.writeFileSync(file, JSON.stringify(value));
  assert.equal(inspect().status, "different-launch");
});

test("relocation requires an unchanged owned launch with a single consistent old project root", t => {
  const oldRoot = fixture(t), root = fixture(t);
  const hosts = ["codex", "zcode", "kilo", "claude"];
  for (const key of ["kit", "ui", "bd", "test"]) {
    const packageName = `@agile-team/wl-skills-${key}`;
    const original = plan(oldRoot, { packageName, hosts });
    const records = apply(root, original);
    runtime(root, packageName);
    for (const host of hosts) {
      const inspect = previous => core.inspectMcpConfiguration({ projectRoot: root, packageName, host, previous });
      const moved = inspect(records);
      assert.equal(moved.status, "managed-project-relocated");
      assert.deepEqual(moved.relocation, { previousProjectRoot: oldRoot, projectRoot: root });
      assert.equal(moved.connection, "unverified");
      assert.equal(moved.runtime, "present");
      assert.equal(inspect({}).status, "different-launch", "same old values without a baseline are unowned");
      const rel = moved.files[0], record = records[rel];
      assert.equal(inspect({ ...records, [rel]: { ...record, owned: false } }).status, "different-launch");
      assert.equal(inspect({ ...records, [rel]: { ...record, valueHash: "invalid" } }).status, "different-launch");
    }
  }
});

test("a stale path mixed with a custom launcher cannot receive a managed repair diagnosis", t => {
  const oldRoot = fixture(t), root = fixture(t), rel = ".zcode/config.json";
  const initial = plan(oldRoot, { hosts: ["zcode"] });
  const records = apply(root, initial);
  const entry = JSON.parse(initial.files[0].content);
  entry.mcp.servers["wl-skills"].args.push("--custom-policy");
  const content = JSON.stringify(entry);
  put(root, rel, content);
  const record = records[rel], current = fmt.inspectEntry(content, record);
  const updatedHashes = { ...record, valueHash: fmt.hash(fmt.valueText(current.value)), textHash: fmt.hash(current.raw),
    propertyHash: fmt.hash(current.propertyRaw) };
  const inspect = previous => core.inspectMcpConfiguration({ projectRoot: root, packageName: PACKAGE, host: "zcode", previous });
  assert.equal(inspect({ [rel]: updatedHashes }).status, "different-launch", "even owned custom arguments are not pure relocation");
  assert.equal(fs.readFileSync(path.join(root, rel), "utf8"), content);
});

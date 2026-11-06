import { it as test, afterEach } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(import.meta.dirname, "..");
const packageName = "@agile-team/wl-skills-kit";
const serverKey = "wl-skills";
const cli = path.join(packageRoot, "bin/wl-skills.js");
const manifestPath = ".wl-skills/state/kit/manifest.json";
const planner = require(path.join(packageRoot, "lib/mcp-config.cjs"));
const format = require(path.join(packageRoot, "lib/mcp-config-format.cjs"));
const jsonc = require(path.join(packageRoot, "lib/shared-jsonc.cjs"));
const roots = [];
const matrix = [
  ["codex", ".codex/config.toml", "toml", ["mcp_servers"]],
  ["zcode", ".zcode/config.json", "jsonc", ["mcp", "servers"]],
  ["kilo", ".kilo/kilo.jsonc", "jsonc", ["mcp"]],
  ["copilot", ".mcp.json", "jsonc", ["mcpServers"]],
  ["claude", ".mcp.json", "jsonc", ["mcpServers"]],
  ["cursor", ".cursor/mcp.json", "jsonc", ["mcpServers"]],
  ["kiro", ".kiro/settings/mcp.json", "jsonc", ["mcpServers"]],
  ["roo", ".roo/mcp.json", "jsonc", ["mcpServers"]],
];
function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-native-kit-")); roots.push(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture", private: true, dependencies: { [packageName]: require(path.join(packageRoot, "package.json")).version } }));
  fs.mkdirSync(path.join(root, "node_modules/@agile-team"), { recursive: true });
  fs.symlinkSync(packageRoot, path.join(root, "node_modules", packageName), "dir");
  return root;
}
function put(root, rel, text) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); }
function read(root, rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function manifest(root) { return JSON.parse(read(root, manifestPath)); }
function run(root, args, expected = 0, preload) {
  const install = ["init", "update"].includes(args[0]);
  const result = spawnSync(process.execPath, [...(preload ? ["--require", preload] : []), cli, ...args, ...(install && false ? ["--skills-only"] : []), "--project", root], { cwd: root, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, expected, result.stderr || result.stdout);
  return result;
}
function tree(root, prefix = "") {
  const result = {};
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(result, tree(root, rel));
    else result[rel] = fs.readFileSync(path.join(root, rel)).toString("base64");
  }
  return result;
}
function failRename(root, target) {
  const file = path.join(root, "fail-rename.cjs");
  put(root, "fail-rename.cjs", `const fs=require('node:fs'); const rename=fs.renameSync; fs.renameSync=(from,to)=>{if(String(to).endsWith(${JSON.stringify(target)})) throw new Error('Injected native MCP write failure');return rename(from,to);};`);
  return file;
}
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

for (const [host, rel, kind, container] of matrix) {
  test(`native MCP selects only ${host} and diagnoses real content`, () => {
    const root = project(); run(root, ["init", "--hosts", host, "--mcp"]);
    assert.deepEqual(Object.keys(manifest(root).managedMcp.records), [rel]);
    for (const candidate of new Set(matrix.map((item) => item[1]))) assert.equal(fs.existsSync(path.join(root, candidate)), candidate === rel);
    const document = format.document(read(root, rel), kind, rel);
    const launch = container.reduce((value, key) => value[key], document)[serverKey];
    const env = launch.env || launch.environment;
    assert.equal(env.WL_PROJECT_ROOT, fs.realpathSync(root));
    assert.ok(JSON.stringify(launch).includes(path.join(fs.realpathSync(root), "node_modules", packageName, "mcp/server.js")));
    const diagnosis = planner.inspectMcpConfiguration({ projectRoot: root, packageName, host });
    assert.equal(diagnosis.status, "configured"); assert.equal(diagnosis.contentsInspected, true); assert.equal(diagnosis.connection, "unverified");
    put(root, ".wl-skills/config/kit-sync.local.json", JSON.stringify({ gatewayPath: "http://127.0.0.1", token: "Bearer local-test", sysAppNo: "fixture" }));
    const doctor = run(root, ["check"]);
    assert.match(doctor.stdout, new RegExp(`MCP ${host}.*configured`));
    assert.match(doctor.stdout, /连接未验证/);
    run(root, ["clean"]);
    assert.equal(fs.existsSync(path.join(root, rel)), false);
  });
}

test("host changes and disabling MCP preserve foreign configuration bytes", () => {
  const root = project();
  const originals = {
    ".codex/config.toml": '# Team  \r\nmodel = "team"\r\n[mcp_servers.team]\r\ncommand = "team"\r\n',
    ".zcode/config.json": '{\r\n // Team\r\n "mcp": {"servers": {"team": {"command": "team"}}},\r\n "extra": "keep  ",\r\n}\r\n',
    ".kilo/kilo.jsonc": '{\n // Team provider\n "provider": {"team": {"model": "own"}},\n "mcp": {"team": {"type": "local", "command": ["team"]}},\n}\n',
  };
  for (const [rel, content] of Object.entries(originals)) put(root, rel, content);
  run(root, ["init", "--hosts", "codex,zcode,kilo", "--mcp"]);
  run(root, ["update", "--hosts", "claude", "--mcp"]);
  for (const [rel, content] of Object.entries(originals)) assert.equal(read(root, rel), content);
  assert.deepEqual(Object.keys(manifest(root).managedMcp.records), [".mcp.json"]);
  run(root, ["update", "--no-mcp"]);
  assert.deepEqual(manifest(root).managedMcp.records, {});
  assert.equal(fs.existsSync(path.join(root, ".mcp.json")), false);
});

test("same-name foreign servers are never adopted or overwritten by force", () => {
  const root = project(); const original = `{\n // user owned\n "mcpServers": {"${serverKey}": {"command": "user"}, "team": {"command": "team"}}\n}\n`;
  put(root, ".mcp.json", original);
  run(root, ["init", "--hosts", "claude", "--mcp"]);
  run(root, ["update", "--hosts", "claude", "--mcp", "--force"]);
  assert.deepEqual(manifest(root).managedMcp.records, {});
  run(root, ["clean"]); assert.equal(read(root, ".mcp.json"), original);
});

for (const [host, rel] of [["codex", ".codex/config.toml"], ["claude", ".mcp.json"]]) {
  test(`edited ${host} entries retain original ownership evidence during update and clean`, () => {
    const root = project(); run(root, ["init", "--hosts", host, "--mcp"]);
    const previous = manifest(root).managedMcp.records[rel];
    const modified = read(root, rel).replace(host === "codex" ? "command =" : '"command":', host === "codex" ? '# User execution note\ncommand =' : '// User execution note\n"command":');
    put(root, rel, modified);
    run(root, ["update", "--no-mcp", "--force"]); assert.equal(read(root, rel), modified);
    assert.equal(manifest(root).managedMcp.records[rel].valueHash, previous.valueHash);
    assert.equal(manifest(root).managedMcp.records[rel].textHash, previous.textHash);
    run(root, ["clean"]); assert.equal(read(root, rel), modified);
    assert.ok(manifest(root).managedMcp.records[rel]);
  });
}

for (const action of ["init", "update", "clean"]) {
  test(`native ${action} restores config, contributions and manifest after a later write failure`, () => {
    const root = project();
    put(root, ".codex/config.toml", '# Team\nmodel = "team"\n');
    put(root, ".zcode/config.json", '{"mcp":{"servers":{"team":{"command":"team"}}}}\n');
    if (action !== "init") run(root, ["init", "--hosts", "codex,zcode", "--mcp"]);
    const preload = failRename(root, ".zcode/config.json"); const original = tree(root);
    const args = action === "init" ? ["init", "--hosts", "codex,zcode", "--mcp"] : action === "update" ? ["update", "--no-mcp"] : ["clean"];
    const called = spawnSync(process.execPath, ["--require", preload, cli, ...args, ...(false && action !== "clean" ? ["--skills-only"] : []), "--project", root], { cwd: root, encoding: "utf8", timeout: 30000 });
    assert.notEqual(called.status, 0); assert.match(called.stderr, /Injected native MCP write failure/);
    assert.deepEqual(tree(root), original);
  });
}

test("generated launch works from a foreign cwd and routes against WL_PROJECT_ROOT", () => {
  const root = project(); const foreign = project(); run(root, ["init", "--hosts", "codex", "--mcp"]);
  const parsed = format.document(read(root, ".codex/config.toml"), "toml", ".codex/config.toml");
  const launch = parsed.mcp_servers[serverKey];
  const input = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "wls_route", arguments: { task: "创建10个菜单" } } };
  const called = spawnSync(launch.command, launch.args, { cwd: foreign, env: { ...process.env, ...launch.env }, input: JSON.stringify(input) + "\n", encoding: "utf8", timeout: 30000 });
  assert.equal(called.status, 0, called.stderr);
  const response = JSON.parse(called.stdout.trim()); const result = response.result.structuredContent;
  assert.equal(result.scope.projectRoot, fs.realpathSync(root)); assert.equal(result.scope.status, "applicable"); assert.equal(result.ready, true);
  assert.equal(fs.existsSync(path.join(foreign, ".wl-skills")), false);
});

test("unsupported project hosts remain manual and ambiguous Kilo files remain untouched", () => {
  const root = project(); const original = '{"mcp":{"team":{"type":"local","command":["team"]}}}\n';
  put(root, "kilo.jsonc", original); put(root, ".kilo/kilo.jsonc", original);
  const result = run(root, ["init", "--hosts", "kilo,cline", "--mcp"]);
  assert.match(result.stderr, /ambiguous|Multiple host configuration files/);
  assert.match(result.stderr, /unsupported-manual|no verified project MCP/);
  assert.equal(read(root, "kilo.jsonc"), original); assert.equal(read(root, ".kilo/kilo.jsonc"), original);
  assert.deepEqual(manifest(root).managedMcp.records, {});
});

test("Copilot reuses an existing VS Code config without creating a competing root file", () => {
  const root = project(); const original = '{\n // team VS Code\n "servers":{"team":{"type":"stdio","command":"team"}}\n}\n';
  put(root, ".vscode/mcp.json", original); run(root, ["init", "--hosts", "copilot", "--mcp"]);
  assert.equal(fs.existsSync(path.join(root, ".mcp.json")), false);
  assert.equal(jsonc.parseJsonc(read(root, ".vscode/mcp.json")).servers[serverKey].type, "stdio");
  run(root, ["clean"]); assert.equal(read(root, ".vscode/mcp.json"), original);
});


test("legacy node evidence migrates to managedMcp without a second cleanup owner", () => {
  const root = project(); run(root, ["init", "--hosts", "codex"]);
  const rel = ".mcp.json";
  const value = { command: "node", args: ["node_modules/" + packageName + "/mcp/server.js"] };
  const original = `{\n // team connection\n "mcpServers":{"team":{"command":"team"},"${serverKey}":${JSON.stringify(value)}}\n}\n`;
  put(root, rel, original);
  const metadata = manifest(root); delete metadata.managedMcp;
  const algorithm = false ? "sha256" : "md5";
  const digest = (text) => require("node:crypto").createHash(algorithm).update(text).digest("hex");
  const nodeText = jsonc.getJsoncNodeText(original, ["mcpServers", serverKey]);
  metadata.files[rel] = digest(original);
  metadata.managedJson[rel] = false ? digest(JSON.stringify(value)) : { units: [{ path: ["mcpServers", serverKey], installedHash: digest(JSON.stringify(value)), installedTextHash: digest(JSON.stringify(nodeText)) }], instructions: [] };
  if (false) metadata.managedJsonText[rel] = digest(nodeText);
  put(root, manifestPath, JSON.stringify(metadata));
  run(root, ["update", "--hosts", "codex", "--mcp"]);
  assert.equal(jsonc.parseJsonc(read(root, rel)).mcpServers[serverKey], undefined);
  assert.match(read(root, rel), /\/\/ team connection/);
  assert.deepEqual(jsonc.parseJsonc(read(root, rel)).mcpServers.team, { command: "team" });
  assert.equal(manifest(root).managedJson[rel], undefined);
  assert.deepEqual(Object.keys(manifest(root).managedMcp.records), [".codex/config.toml"]);
});

test("edited legacy nodes retain old evidence after ownership handoff", () => {
  const root = project(); run(root, ["init", "--hosts", "claude", "--mcp"]);
  const rel = ".mcp.json"; const original = read(root, rel);
  const value = jsonc.getJsoncValue(original, ["mcpServers", serverKey]);
  const algorithm = false ? "sha256" : "md5";
  const digest = (text) => require("node:crypto").createHash(algorithm).update(text).digest("hex");
  const nodeText = jsonc.getJsoncNodeText(original, ["mcpServers", serverKey]);
  const metadata = manifest(root); delete metadata.managedMcp;
  metadata.files[rel] = digest(original);
  metadata.managedJson[rel] = false ? digest(JSON.stringify(value)) : { units: [{ path: ["mcpServers", serverKey], installedHash: digest(JSON.stringify(value)), installedTextHash: digest(JSON.stringify(nodeText)) }], instructions: [] };
  if (false) metadata.managedJsonText[rel] = digest(nodeText);
  put(root, manifestPath, JSON.stringify(metadata));
  const modified = original.replace('"command":', '// User legacy note\n"command":'); put(root, rel, modified);
  run(root, ["update", "--hosts", "codex", "--mcp"]);
  assert.equal(read(root, rel), modified); assert.equal(manifest(root).managedJson[rel], undefined);
  assert.equal(manifest(root).managedMcp.records[rel].valueHash, digest(JSON.stringify(value)));
  assert.equal(manifest(root).managedMcp.records[rel].textHash, digest(JSON.stringify(nodeText)));
  run(root, ["clean"]); assert.equal(read(root, rel), modified); assert.ok(manifest(root).managedMcp.records[rel]);
});


test("legacy Kilo non-MCP contributions retire before the native plan without being written back", () => {
  const root = project(); run(root, ["init", "--hosts", "codex"]);
  const rel = ".kilo/kilo.jsonc";
  const oldServer = { type: "local", command: ["node", "node_modules/" + packageName + "/mcp/server.js"], enabled: true, timeout: 30000 };
  const original = JSON.stringify({ $schema: "https://app.kilo.ai/config.json", instructions: ["team.md", "AGENTS.md"], provider: { team: { model: "own" } }, mcp: { team: { type: "local", command: ["team"] }, [serverKey]: oldServer } }, null, 2) + "\n";
  put(root, rel, original);
  const digest = (text) => require("node:crypto").createHash("md5").update(text).digest("hex");
  const metadata = manifest(root); delete metadata.managedMcp;
  metadata.files[rel] = digest(original);
  metadata.managedJson[rel] = { units: [["$schema"], ["mcp", serverKey]].map((node) => ({ path: node, installedHash: digest(JSON.stringify(jsonc.getJsoncValue(original, node))), installedTextHash: digest(JSON.stringify(jsonc.getJsoncNodeText(original, node))) })), instructions: ["AGENTS.md"], instructionsCreated: false };
  put(root, manifestPath, JSON.stringify(metadata));
  run(root, ["update", "--hosts", "codex", "--mcp"]);
  const result = jsonc.parseJsonc(read(root, rel));
  assert.equal(result.$schema, undefined); assert.deepEqual(result.instructions, ["team.md"]);
  assert.deepEqual(result.provider, { team: { model: "own" } }); assert.deepEqual(result.mcp, { team: { type: "local", command: ["team"] } });
  assert.equal(manifest(root).managedJson[rel], undefined); assert.equal(manifest(root).managedMcp.records[rel], undefined);
});

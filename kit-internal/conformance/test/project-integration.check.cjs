"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const policy = require("../support/project-integration.cjs");
const hosts = require("../support/host-profiles.cjs");
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wl-compact-policy-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function put(root, relative, value) {
  const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); return file;
}

test("compact policy defaults to one common gateway and ignores unrelated editor directories", t => {
  const projectRoot = fixture(t);
  for (const directory of [".cursor", ".kiro", ".claude", ".windsurf"]) fs.mkdirSync(path.join(projectRoot, directory));
  const selected = policy.resolveIntegration({ projectRoot, recorded: { editors: ["all"], mode: "skin" } });
  assert.equal(selected.integration, "compact"); assert.deepEqual(selected.hosts, ["codex"]);
  assert.deepEqual(selected.gatewayRoots, [".agents/skills"]);
  assert.deepEqual(hosts.gatewayInstallPaths("@agile-team/wl-skills-test", { projectRoot }), [".agents/skills/wl-skills-test/SKILL.md"]);
});

test("host precedence, aliases and shared discovery are deterministic without model-name guessing", t => {
  const projectRoot = fixture(t);
  put(projectRoot, "package.json", { name: "fixture", wlSkills: { schemaVersion: 1, integration: "compact", hosts: ["claude"] } });
  assert.deepEqual(policy.resolveIntegration({ projectRoot, recorded: { hosts: ["kiro"] } }).hosts, ["claude"]);
  const explicit = policy.resolveIntegration({ projectRoot, hosts: "codex,zcode,kilo,kilo-code,codex-cli", editor: "all" });
  assert.deepEqual(explicit.hosts, ["codex", "zcode", "kilo"]); assert.deepEqual(explicit.gatewayRoots, [".agents/skills"]);
  assert.deepEqual(policy.resolveIntegration({ projectRoot, hosts: "claude,cline" }).gatewayRoots, [".claude/skills"]);
  assert.deepEqual(policy.resolveIntegration({ projectRoot, hosts: "windsurf" }).hosts, ["devin"]);
  for (const value of ["gpt", "glm", "vscode", []]) assert.throws(() => policy.resolveIntegration({ projectRoot, hosts: value }));
});

test("installation and diagnostics resolve actual extension identities through the same host contract", t => {
  const projectRoot = fixture(t), packageName = "@agile-team/wl-skills-test";
  for (const [alias, id] of [["openai.chatgpt", "codex"], ["openai.codex", "codex"], ["kilocode.kilo-code", "kilo"], ["saoudrizwan.claude-dev", "cline"], ["rooveterinaryinc.roo-cline", "roo"], ["github.copilot-chat", "copilot"], ["智谱zcode", "zcode"], ["agents", "codex"], ["agents-generic", "codex"]]) {
    const profile = hosts.resolveHostProfile(alias, packageName);
    const selected = policy.resolveIntegration({ projectRoot, hosts: alias });
    assert.equal(profile.hostId, id, alias);
    assert.deepEqual(selected.hosts, [id], alias);
    for (const installed of hosts.gatewayInstallPaths(packageName, selected)) assert.ok(profile.gatewayPaths.includes(installed), `${alias}: installed gateway must be diagnosable`);
  }
  assert.deepEqual(policy.supportedHosts, hosts.hostProfiles);
  for (const host of policy.supportedHosts) {
    const selection = policy.resolveIntegration({ projectRoot, hosts: host });
    const profile = hosts.resolveHostProfile(host, packageName);
    assert.ok(hosts.gatewayInstallPaths(packageName, selection).every(gateway => profile.gatewayPaths.includes(gateway)), host);
    assert.deepEqual(selection.entryFiles, profile.entryFiles.map(file => file.replaceAll("wl-skills-test", "<skill>")), host);
  }
});

test("configuration persistence preserves package metadata and non-npm fallback without creating an npm project", t => {
  const projectRoot = fixture(t);
  const initial = { name: "fixture", private: true, scripts: { verify: "existing" }, wlSkills: { schemaVersion: 1, hosts: ["codex"], mcp: true, projectFact: "keep" } };
  put(projectRoot, "package.json", initial);
  policy.saveProjectConfig(projectRoot, policy.resolveIntegration({ projectRoot, hosts: "zcode,kilo" }));
  const updated = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json")));
  assert.deepEqual(updated.scripts, initial.scripts); assert.equal(updated.wlSkills.projectFact, "keep"); assert.equal(updated.wlSkills.mcp, true);
  const backend = path.join(projectRoot, "backend"); fs.mkdirSync(backend);
  policy.saveProjectConfig(backend, policy.resolveIntegration({ projectRoot: backend }));
  assert.ok(!fs.existsSync(path.join(backend, "package.json")));
  assert.equal(policy.readProjectConfig(backend).value.integration, "compact");
  assert.deepEqual(policy.resolveIntegration({ projectRoot: backend }).hosts, ["codex"]);
});

test("resource resolution distinguishes installed package defaults from project overrides and rejects escape", t => {
  const projectRoot = fixture(t), packageRoot = path.join(projectRoot, "node_modules/@agile-team/wl-skills-test");
  put(packageRoot, "package.json", { name: "@agile-team/wl-skills-test", version: "1.2.3" });
  const resourceId = ".github/standards/test.md";
  const canonical = put(packageRoot, `files/${resourceId}`, "PACKAGE STANDARD");
  const resolved = policy.resolveResource({ projectRoot, packageRoot, resourceId });
  assert.equal(resolved.physicalPath, canonical); assert.equal(resolved.sourceKind, "package");
  assert.equal(resolved.packageVersion, "1.2.3"); assert.match(resolved.sha256, /^[a-f0-9]{64}$/);
  const override = put(projectRoot, resourceId, "LOCAL STANDARD");
  const replaced = policy.resolveResource({ projectRoot, packageRoot, resourceId });
  assert.equal(replaced.physicalPath, override); assert.equal(replaced.sourceKind, "project-override");
  assert.notEqual(replaced.sha256, resolved.sha256);
  assert.throws(() => policy.resolveResourcePath(projectRoot, "../outside.md", packageRoot));
  const outside = fixture(t); put(outside, "file.md", "OUTSIDE");
  fs.symlinkSync(path.join(outside, "file.md"), path.join(projectRoot, "escape.md"));
  assert.throws(() => policy.resolveResourcePath(projectRoot, "escape.md", packageRoot));
});

test("state ignore rejects dangling file and ancestor symlinks before creating external files", t => {
  const outside = fixture(t);
  const projectRoot = fixture(t);
  fs.mkdirSync(path.join(projectRoot, ".wl-skills/state"), { recursive: true });
  const missingFile = path.join(outside, "future-ignore");
  fs.symlinkSync(missingFile, path.join(projectRoot, ".wl-skills/state/.gitignore"));
  assert.throws(() => policy.ensureStateIgnore(projectRoot), /符号链接/);
  assert.ok(!fs.existsSync(missingFile));
  const linkedRoot = fixture(t), missingDirectory = path.join(outside, "future-state");
  fs.symlinkSync(missingDirectory, path.join(linkedRoot, ".wl-skills"));
  assert.throws(() => policy.ensureStateIgnore(linkedRoot), /符号链接/);
  assert.ok(!fs.existsSync(missingDirectory));
});

test("configuration persistence rejects dangling parents and preserves the external boundary", t => {
  const projectRoot = fixture(t), outside = fixture(t);
  const missingDirectory = path.join(outside, "future-config");
  fs.symlinkSync(missingDirectory, path.join(projectRoot, ".wl-skills"));
  const selected = policy.resolveIntegration({ projectRoot });
  assert.throws(() => policy.saveProjectConfig(projectRoot, selected), /符号链接/);
  assert.ok(!fs.existsSync(missingDirectory));
});

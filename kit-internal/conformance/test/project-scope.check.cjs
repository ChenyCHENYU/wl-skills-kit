"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const workspace = require("../support/workspace-root.cjs");
const { resolveScope, MANIFESTS } = require("../support/project-scope.cjs");
const names = Object.keys(MANIFESTS);
const tasks = { kit: "创建页面", ui: "UI扫描", bd: "注释检查", design: "生成流程图", test: "生成测试用例" };
const bins = { kit: "wl-skills.js", ui: "wl-ui.js", bd: "wl-skills-bd.js", design: "wl-skills-design.js", test: "wl-skills-test.js" };

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wl-project-scope-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function json(root, relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value));
}
function bytes(root) {
  return Object.fromEntries(fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter((item) => item.isFile()).map((item) => {
    const full = path.join(item.parentPath, item.name);
    return [path.relative(root, full), fs.readFileSync(full).toString("base64")];
  }));
}
function request(root, name, input, operation = "task") {
  const file = path.join(os.tmpdir(), `wl-scope-request-${process.pid}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify({ operation, task: tasks[name], projectRoot: root, targets: ["src/Page.vue"], ...input }));
  try {
    const run = spawnSync(process.execPath, [path.join(workspace, `wl-skills-${name}`, "bin", bins[name]), "protocol", "request", "--input-file", file, "--json"], { cwd: root, encoding: "utf8", timeout: 30000 });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const envelope = JSON.parse(run.stdout); assert.equal(envelope.ok, true);
    return envelope.result;
  } finally { fs.rmSync(file); }
}
function excluded(result, expected, reason) {
  const decision = result.decision || result;
  assert.equal(decision.status, expected); assert.equal(decision.scope.reason, reason);
  assert.deepEqual(decision.requiredRules, []); assert.deepEqual(decision.selectedSkills, []);
  assert.deepEqual(decision.gaps, []); assert.equal(result.runId, undefined);
  assert.equal(result.notice.runId, null); assert.equal(result.notice.displayEvidence, "unverified");
}

for (const name of names) {
  test(`${name}: unadopted PC project receives no rules or task writes`, (t) => {
    const root = fixture(t); json(root, "package.json", { name: "opensource", dependencies: { vue: "3.4.0" } });
    const before = bytes(root); excluded(request(root, name, {}), "not-applicable", "package-not-adopted-in-target-project");
    assert.deepEqual(bytes(root), before);
  });
  test(`${name}: mobile exclusion wins over own installation and explicit opt-in`, (t) => {
    const root = fixture(t);
    json(root, "package.json", { dependencies: { "@dcloudio/uni-app": "3.0.0", vue: "3.4.0", [`@agile-team/wl-skills-${name}`]: "1.0.0" } });
    json(root, MANIFESTS[name], { version: "1.0.0" });
    json(root, ".wl-skills-scope.json", { schemaVersion: 1, projectType: "pc", packages: { [name]: true } });
    const before = bytes(root); excluded(request(root, name, {}), "not-applicable", "mobile-project-excluded");
    assert.deepEqual(bytes(root), before);
  });
  test(`${name}: parent installation does not adopt a nested uninstalled project`, (t) => {
    const root = fixture(t); json(root, MANIFESTS[name], { version: "1.0.0" });
    json(root, "opensource/package.json", { name: "uninstalled", dependencies: { vue: "3.4.0" } });
    const before = bytes(root); const result = request(root, name, { targets: ["opensource/src/New.vue"] });
    excluded(result, "not-applicable", "package-not-adopted-in-target-project");
    assert.equal(result.notice.projectRoot, path.join(root, "opensource")); assert.deepEqual(bytes(root), before);
  });
  test(`${name}: adopted nested project keeps receipt identity and writes in its own root`, (t) => {
    const root = fixture(t); json(root, MANIFESTS[name], { version: "1.0.0" });
    json(root, "adopted/package.json", { name: "adopted", devDependencies: { [`@agile-team/wl-skills-${name}`]: "1.0.0" } });
    const before = bytes(root); const result = request(root, name, { targets: ["adopted/src/New.vue"], runId: `nested-${name}` });
    const decision = result.decision || result;
    assert.equal(decision.scope.status, "applicable"); assert.equal(result.notice.projectRoot, path.join(root, "adopted"));
    assert.equal(result.runId, `nested-${name}`); assert.ok(result.notice.targets.every((target) => !target.startsWith("adopted/")));
    const added = Object.keys(bytes(root)).filter((key) => !(key in before));
    assert.ok(added.length); assert.ok(added.every((key) => key.startsWith("adopted/")));
  });
  test(`${name}: multi-project task requires split and never writes`, (t) => {
    const root = fixture(t);
    json(root, "a/package.json", { name: "a" }); json(root, "b/package.json", { name: "b" });
    const before = bytes(root); excluded(request(root, name, { targets: ["a/src/New.vue", "b/src/New.vue"] }), "needs-context", "multiple-project-targets-split-required");
    assert.deepEqual(bytes(root), before);
  });
  test(`${name}: malformed scope config is not an opt-in and never writes`, (t) => {
    const root = fixture(t); json(root, MANIFESTS[name], { version: "1.0.0" });
    json(root, ".wl-skills-scope.json", { schemaVersion: 1, projectType: "pc", packages: { [name]: "false" } });
    const before = bytes(root); excluded(request(root, name, {}), "needs-context", "invalid-project-metadata");
    assert.deepEqual(bytes(root), before);
  });
}

test("scope resolution rejects missing paths through external symlinks", (t) => {
  const root = fixture(t); const other = fixture(t);
  fs.symlinkSync(other, path.join(root, "linked"));
  const result = resolveScope({ projectRoot: root, packageName: "@agile-team/wl-skills-kit", targets: ["linked/missing/New.vue"] });
  assert.equal(result.scope.status, "needs-context"); assert.equal(result.scope.reason, "target-outside-authorized-project");
  assert.deepEqual(bytes(other), {});
});
test("only direct own-package adoption counts; hoisted runtime and sibling manifest do not", (t) => {
  const root = fixture(t); json(root, MANIFESTS.ui, { version: "1.0.0" });
  json(root, "node_modules/@agile-team/wl-skills-kit/package.json", { name: "@agile-team/wl-skills-kit", version: "1.0.0" });
  assert.equal(resolveScope({ projectRoot: root, packageName: "@agile-team/wl-skills-kit" }).scope.adopted, false);
});
test("explicit mobile H5 configuration excludes every package without guessing from Vue", (t) => {
  const root = fixture(t); json(root, ".wl-skills-scope.json", { schemaVersion: 1, projectType: "mobile" });
  for (const name of names) assert.equal(resolveScope({ projectRoot: root, packageName: `@agile-team/wl-skills-${name}` }).scope.reason, "mobile-project-excluded");
});
test("project can disable one package without disabling independently adopted siblings", (t) => {
  const root = fixture(t); json(root, ".wl-skills-scope.json", { schemaVersion: 1, projectType: "pc", packages: { kit: false, ui: true } });
  assert.equal(resolveScope({ projectRoot: root, packageName: "@agile-team/wl-skills-kit" }).scope.reason, "package-explicitly-disabled");
  assert.equal(resolveScope({ projectRoot: root, packageName: "@agile-team/wl-skills-ui" }).scope.status, "applicable");
});
test("aggregate workspace needs a target project; target instructions/config win", (t) => {
  const root = fixture(t); json(root, ".wl-skills-scope.json", { schemaVersion: 1, projectType: "workspace", packages: { kit: true } });
  json(root, "pc/.wl-skills-scope.json", { schemaVersion: 1, projectType: "pc", packages: { kit: true } });
  assert.equal(resolveScope({ projectRoot: root, packageName: "@agile-team/wl-skills-kit" }).scope.status, "not-applicable");
  const next = resolveScope({ projectRoot: root, packageName: "@agile-team/wl-skills-kit", targets: ["pc/src/New.vue"] });
  assert.equal(next.projectRoot, path.join(root, "pc")); assert.equal(next.scope.status, "applicable");
});
test("Java Maven modules share backend adoption while a nested independent repository does not", (t) => {
  const root = fixture(t); fs.writeFileSync(path.join(root, "pom.xml"), "<project><modules><module>service</module></modules></project>");
  json(root, MANIFESTS.bd, { version: "1.0.0" }); fs.mkdirSync(path.join(root, "service"));
  fs.writeFileSync(path.join(root, "service/pom.xml"), "<project><parent/></project>");
  const input = { projectRoot: root, packageName: "@agile-team/wl-skills-bd", targets: ["service/src/New.java"] };
  assert.equal(resolveScope(input).projectRoot, root); assert.equal(resolveScope(input).scope.status, "applicable");
  fs.mkdirSync(path.join(root, "service/.git"));
  assert.equal(resolveScope(input).scope.status, "not-applicable"); assert.equal(resolveScope(input).projectRoot, path.join(root, "service"));
});
test("scope config creation after a plan invalidates old eligibility evidence", (t) => {
  const root = fixture(t); json(root, "package.json", { devDependencies: { "@agile-team/wl-skills-kit": "*" } });
  request(root, "kit", { runId: "scope-stale", targets: [] });
  const before = request(root, "kit", { runId: "scope-stale", targets: [] }, "status"); assert.equal(before.planStale, false);
  json(root, ".wl-skills-scope.json", { schemaVersion: 1, projectType: "pc", packages: { kit: false } });
  const after = request(root, "kit", { runId: "scope-stale", targets: [] }, "status");
  assert.equal(after.currentScope.status, "not-applicable"); assert.equal(after.planStale, true); assert.equal(after.validationStatus, "stale");
});
test("invalid dependency declaration is not adoption and never writes", (t) => {
  const root = fixture(t); json(root, "package.json", { devDependencies: { "@agile-team/wl-skills-kit": { version: "1.0.0" } } });
  const before = bytes(root); excluded(request(root, "kit", {}), "needs-context", "invalid-project-metadata"); assert.deepEqual(bytes(root), before);
});
test("schema and runtime agree on explicit project scope inputs", (t) => {
  const root = fixture(t); const Ajv = require("../node_modules/ajv"); const valid = new Ajv().compile(require("../support/project-scope.schema.json"));
  for (const config of [{ schemaVersion: 1, projectType: "pc", packages: { kit: true } }, { schemaVersion: 1, projectType: "mobile" }, { schemaVersion: 1, projectType: "unknown" }]) {
    assert.equal(valid(config), true); json(root, ".wl-skills-scope.json", config);
    assert.notEqual(resolveScope({ projectRoot: root, packageName: "@agile-team/wl-skills-kit" }).scope.reason, "invalid-project-metadata");
  }
  for (const config of [{ schemaVersion: 2, projectType: "pc" }, { schemaVersion: 1, projectType: "PC" }, { schemaVersion: 1, projectType: "pc", packages: null }, { schemaVersion: 1, projectType: "pc", packages: { other: true } }, { schemaVersion: 1, projectType: "pc", extra: true }]) {
    assert.equal(valid(config), false); json(root, ".wl-skills-scope.json", config);
    assert.equal(resolveScope({ projectRoot: root, packageName: "@agile-team/wl-skills-kit" }).scope.reason, "invalid-project-metadata");
  }
});

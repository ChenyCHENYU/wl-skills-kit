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
  test(`${name}: adopted tool workspace requires actual project context and writes nothing`, (t) => {
    const root = fixture(t);
    json(root, "package.json", { private: true, workspaces: ["apps/*"], devDependencies: { [`@agile-team/wl-skills-${name}`]: "1.0.0" } });
    const before = bytes(root);
    excluded(request(root, name, {}), "needs-context", "workspace-project-type-needs-context");
    assert.deepEqual(bytes(root), before);
    const type = { kit: "pc", ui: "pc", bd: "backend", design: "documents", test: "testing" }[name];
    json(root, ".wl-skills-scope.json", { schemaVersion: 1, projectType: type });
    const { scope } = resolveScope({ projectRoot: root, packageName: `@agile-team/wl-skills-${name}` });
    assert.equal(scope.status, "applicable");
  });
}
test("Vue PC workspace is preserved; a pnpm tooling root is not automatically PC", (t) => {
  const root = fixture(t);
  json(root, "package.json", { workspaces: { packages: ["packages/*"] }, devDependencies: { vue: "3.4.0", "@agile-team/wl-skills-kit": "1.0.0" } });
  assert.equal(resolveScope({ projectRoot: root, packageName: "@agile-team/wl-skills-kit" }).scope.status, "applicable");
  json(root, "package.json", { devDependencies: { "@agile-team/wl-skills-kit": "1.0.0" } });
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  assert.equal(resolveScope({ projectRoot: root, packageName: "@agile-team/wl-skills-kit" }).scope.status, "needs-context");
});

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
function reactor(root, prefix = "backend") {
  const backend = path.join(root, prefix); fs.mkdirSync(path.join(backend, "service"), { recursive: true });
  const pom = `<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>example</groupId><artifactId>backend</artifactId><version>1.0</version><packaging>pom</packaging><modules><module>service</module></modules></project>`;
  const child = `<project><modelVersion>4.0.0</modelVersion><parent><groupId>example</groupId><artifactId>backend</artifactId><version>1.0</version></parent><artifactId>service</artifactId></project>`;
  fs.writeFileSync(path.join(backend, "pom.xml"), pom); fs.writeFileSync(path.join(backend, "service/pom.xml"), child);
  json(backend, MANIFESTS.bd, { version: "1.0.0" }); return { backend, pom, child };
}
test("Maven reactor scope is independent of the caller's workspace directory", (t) => {
  const root = fixture(t); json(root, ".wl-skills-scope.json", { schemaVersion: 1, projectType: "workspace" });
  const { backend } = reactor(root);
  const fromWorkspace = resolveScope({ projectRoot: root, packageName: "@agile-team/wl-skills-bd", targets: ["backend/service/src/New.java"] });
  const fromProject = resolveScope({ projectRoot: backend, packageName: "@agile-team/wl-skills-bd", targets: ["service/src/New.java"] });
  assert.deepEqual(fromWorkspace, fromProject); assert.equal(fromProject.scope.status, "applicable"); assert.equal(fromProject.projectRoot, backend);
});
for (const [label, transform] of [
  ["duplicate scalar", (p,c) => [p, c.replace("<artifactId>service</artifactId>", "<groupId>other</groupId><groupId>example</groupId><artifactId>service</artifactId>")]],
  ["empty explicit coordinate", (p,c) => [p, c.replace("<artifactId>service</artifactId>", "<groupId/><artifactId>service</artifactId>")]],
  ["duplicate parent", (p,c) => [p, c.replace("</project>", "<parent/></project>")]],
  ["missing modelVersion", (p,c) => [p, c.replace("<modelVersion>4.0.0</modelVersion>", "")]],
  ["undeclared module", (p,c) => [p.replace("<module>service</module>", "<module>other</module>"), c]],
  ["parent GAV mismatch", (p,c) => [p, c.replace("<version>1.0</version>", "<version>2.0</version>")]],
  ["repository-only parent", (p,c) => [p, c.replace("</parent>", "<relativePath/></parent>")]],
  ["external parent", (p,c) => [p, c.replace("</parent>", "<relativePath>../../../pom.xml</relativePath></parent>")]],
  ["commented module", (p,c) => [p.replace("<module>service</module>", "<!-- <module>service</module> -->"), c]],
  ["profile-only module", (p,c) => [p.replace("<modules><module>service</module></modules>", "<profiles><profile><modules><module>service</module></modules></profile></profiles>"), c]],
  ["DTD", (p,c) => ['<!DOCTYPE project [<!ENTITY module "service">]>' + p.replace("<module>service</module>", "<module>&module;</module>"), c]],
  ["malformed XML", (p,c) => [p.replace("</project>", ""), c]],
  ["unresolved property", (p,c) => [p.replace("<version>1.0</version>", "<version>${revision}</version>"), c.replace("<version>1.0</version>", "<version>${revision}</version>")]],
]) test(`Maven scope rejects ${label} as parent adoption evidence`, t => {
  const root = fixture(t); const { backend, pom, child } = reactor(root); const [p,c] = transform(pom, child);
  fs.writeFileSync(path.join(backend, "pom.xml"),p); fs.writeFileSync(path.join(backend, "service/pom.xml"),c);
  for (const caller of [root, backend]) {
    const result = resolveScope({ projectRoot: caller, packageName: "@agile-team/wl-skills-bd", targets: [path.relative(caller, path.join(backend, "service/src/New.java"))] });
    assert.equal(result.projectRoot, path.join(backend,"service")); assert.equal(result.scope.status,"not-applicable");
  }
});
for (const marker of [".git", "package.json", ".wl-skills-scope.json", MANIFESTS.bd]) test(`Maven reactor stops at independent ${marker}`, t => {
  const root = fixture(t); const { backend } = reactor(root); const service = path.join(backend, "service");
  if (marker === ".git") fs.mkdirSync(path.join(service,marker));
  else json(service,marker, marker === ".wl-skills-scope.json" ? {schemaVersion:1,projectType:"backend",packages:{bd:false}} : marker === MANIFESTS.bd ? {version:"2.0"} : {name:"independent"});
  const result = resolveScope({projectRoot:root,packageName:"@agile-team/wl-skills-bd",targets:["backend/service/src/New.java"]});
  assert.equal(result.projectRoot,service); assert.equal(result.scope.adopted, marker === MANIFESTS.bd);
});
test("Maven scope fingerprint includes the child relationship and separates reactors", t => {
  const root = fixture(t); const { backend, child } = reactor(root); reactor(root,"other");
  const input = {projectRoot:root,packageName:"@agile-team/wl-skills-bd",targets:["backend/service/src/New.java"]};
  const first = resolveScope(input); fs.writeFileSync(path.join(backend,"service/pom.xml"),child.replace("<artifactId>service</artifactId>","<artifactId>renamed</artifactId>"));
  assert.notEqual(first.scope.fingerprint,resolveScope(input).scope.fingerprint);
  assert.equal(resolveScope({...input, targets:[...input.targets,"other/service/src/New.java"]}).scope.reason,"multiple-project-targets-split-required");
});
test("Maven child relationship edits invalidate a saved task plan", t => {
  const root = fixture(t); const { backend, child } = reactor(root);
  request(backend, "bd", { runId: "maven-scope-stale", targets: ["service/src/New.java"] });
  const status = () => request(backend, "bd", {runId:"maven-scope-stale",targets:[]}, "status");
  assert.equal(status().planStale,false);
  fs.writeFileSync(path.join(backend,"service/pom.xml"),child.replace("<artifactId>service</artifactId>","<artifactId>renamed</artifactId>"));
  assert.equal(status().planStale,true);
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

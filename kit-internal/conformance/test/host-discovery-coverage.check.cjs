"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { doctorHost, formatHostDiagnostic } = require("../support/task-observability.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-host-coverage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function write(root, file, content) { const full = path.join(root,file); fs.mkdirSync(path.dirname(full),{recursive:true}); fs.writeFileSync(full,content); }
function gateway(root,key,description = "在已接入项目中处理具体开发任务。", prefix = ".agents") { write(root,`${prefix}/skills/wl-skills-${key}/SKILL.md`,`---\nname: wl-skills-${key}\ndescription: ${description}\n---\nLocal gateway\n`); }
function track(root,key,prefix = ".agents",kind = "file") {
  const relative = `${prefix}/skills/wl-skills-${key}/SKILL.md`;
  const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(root,relative))).digest("hex");
  const file = `.wl-skills/state/${key}/manifest.json`;
  let manifest = {package:`@agile-team/wl-skills-${key}`,version:"1.0.0",files:{}};
  if(fs.existsSync(path.join(root,file))) manifest = JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
  manifest.files[relative] = {installedHash:hash,kind}; write(root,file,JSON.stringify(manifest));
}
const diagnose = root => doctorHost({projectRoot:root,packageName:"@agile-team/wl-skills-kit",packageVersion:"1.0.0",host:"zcode",skillPaths:[".agents/skills/wl-skills-kit/SKILL.md"]});

test("five-package coverage explains a Kit-only workspace without inheriting child installations",t => {
  const root = fixture(t);
  write(root,".wl-skills-scope.json",JSON.stringify({schemaVersion:1,projectType:"workspace"}));
  gateway(root,"kit");
  for(const key of ["kit","ui","bd","test","design"]) gateway(path.join(root,"child"),key);
  const report = diagnose(root), coverage = report.discoveryCoverage;
  assert.deepEqual(coverage.availableEntries,["kit"]); assert.equal(coverage.packages.length,5);
  assert.equal(coverage.packages.find(item => item.key === "ui").installed,false);
  assert.equal(report.entryReadiness,"not-applicable"); assert.equal(report.hostDiscovery,"unverified");
  assert.equal(coverage.hostConfigurationObserved,false); assert.equal(coverage.recursive,false);
  assert.match(formatHostDiagnostic(report),/不会递归扫描所有子项目/u);
  assert.deepEqual(report.nextActions.map(item => item.code),["select-applicable-project"]);
  assert.equal(fs.existsSync(path.join(root,".wl-skills/state")),false);
});
test("adoption and a valid gateway are independent conditions", t => {
  const root = fixture(t);
  write(root,"package.json",JSON.stringify({devDependencies:{"@agile-team/wl-skills-kit":"1.0.0","@agile-team/wl-skills-ui":"1.0.0"}}));
  gateway(root,"kit");track(root,"kit");
  const report = diagnose(root), coverage = report.discoveryCoverage;
  assert.deepEqual(coverage.installedWithoutEntry,["ui"]);
  assert.equal(coverage.packages.find(item => item.key === "ui").adopted,true);
  assert.equal(report.entryReadiness,"ready","an unused sibling package cannot block this package's readiness");
  assert.ok(coverage.note.includes("不会自动安装"));
});
test("ZCode description length and metadata preview reflect the host parser limits",t => {
  const root = fixture(t);write(root,"package.json",JSON.stringify({devDependencies:{"@agile-team/wl-skills-kit":"1.0.0"}}));
  gateway(root,"kit","中".repeat(1024));track(root,"kit");
  let report = diagnose(root), entry = report.gateways.find(item => item.status === "present");
  assert.equal(entry.frontmatter.descriptionChars,1024);assert.equal(entry.frontmatter.metadataPreview.length,250);
  gateway(root,"kit","中".repeat(1025));report = diagnose(root);
  entry = report.gateways.find(item => item.status === "invalid");
  assert.equal(entry.frontmatter.reason,"description-exceeds-host-limit");assert.equal(report.entryReadiness,"incomplete");
  assert.equal(report.discoveryCoverage.packages.find(item => item.key === "kit").entryStatus,"needs-review");
  assert.equal(report.hostProfile.discoveryRules.hostConfigurationObserved,false);
});
test("coverage preserves modified-entry ownership and isolates other package metadata errors",t => {
  const root = fixture(t);gateway(root,"kit");gateway(root,"ui");
  write(root,".wl-skills/state/kit/manifest.json",JSON.stringify({version:"1.0.0",package:"@agile-team/wl-skills-kit",files:{".agents/skills/wl-skills-kit/SKILL.md":"0".repeat(32)}}));
  write(root,".wl-skills/state/ui/manifest.json","{");
  const report = diagnose(root), coverage = report.discoveryCoverage;
  assert.equal(report.gateways.find(item => item.path.startsWith(".agents")).status,"modified");
  assert.equal(coverage.packages.find(item => item.key === "kit").entryStatus,"needs-review");
  assert.equal(coverage.packages.find(item => item.key === "ui").entryStatus,"needs-review");
  assert.deepEqual(coverage.availableEntries,["kit","ui"],"valid metadata can be discovered even though modified ownership prevents readiness");
  assert.deepEqual(coverage.readyEntries,[]);
  assert.deepEqual(coverage.needsReview,["kit","ui"]);
  assert.equal(coverage.hostDiscovery,"unverified");
});

test("a foreign same-name native gateway remains discoverable but cannot prove package readiness", t => {
  const root = fixture(t);
  write(root,"package.json",JSON.stringify({devDependencies:{"@agile-team/wl-skills-kit":"1.0.0"}}));
  gateway(root,"kit","用户自己的入口", ".qoder");
  const relative = ".qoder/skills/wl-skills-kit/SKILL.md";
  const original = fs.readFileSync(path.join(root,relative),"utf8");
  const options = {projectRoot:root,packageName:"@agile-team/wl-skills-kit",packageVersion:"1.0.0",host:"qoder",skillPaths:[relative]};
  const report = doctorHost(options);
  assert.equal(report.gateways[0].ownership.status,"untracked");
  assert.equal(report.gateways[0].status,"untracked");
  assert.equal(report.entryReadiness,"incomplete");
  assert.deepEqual(report.discoveryCoverage.availableEntries,["kit"]);
  assert.deepEqual(report.discoveryCoverage.readyEntries,[]);
  assert.deepEqual(report.discoveryCoverage.needsReview,["kit"]);
  assert.ok(report.nextActions.some(action => action.code === "review-host-gateway"));
  assert.ok(!report.nextActions.some(action => action.code === "repair-host-assets"));
  assert.equal(fs.readFileSync(path.join(root,relative),"utf8"), original);
  track(root,"kit",".qoder","reference");
  const referenced = doctorHost(options);
  assert.equal(referenced.gateways[0].ownership.status,"reference");
  assert.equal(referenced.entryReadiness,"ready");
  assert.equal(referenced.hostDiscovery,"unverified");
});
test("an untracked alternative gateway blocks readiness even with one verified path", t => {
  const root = fixture(t);
  write(root,"package.json",JSON.stringify({devDependencies:{"@agile-team/wl-skills-kit":"1.0.0"}}));
  gateway(root,"kit");track(root,"kit");gateway(root,"kit","其他自有指令", ".zcode");
  const report = diagnose(root);
  assert.equal(report.entryReadiness,"incomplete");
  assert.deepEqual(report.discoveryCoverage.readyEntries,[]);
  assert.deepEqual(report.discoveryCoverage.needsReview,["kit"]);
});

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const source = path.resolve(__dirname, "../support");
const script = path.resolve(__dirname, "../scripts/sync-support.cjs");
const manifest = JSON.parse(fs.readFileSync(path.join(source, "shared-support-manifest.json")));
const coreFiles = Object.keys(manifest.files);
const licensePath = "lib/vendor/jsonc-parser/LICENSE.md";
const canonicalLicense = fs.readFileSync(path.join(source, "vendor/jsonc-parser/LICENSE.md"));
const lfLicense = Buffer.from(canonicalLicense.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
const crlfLicense = Buffer.from(lfLicense.toString("latin1").replace(/\n/g, "\r\n"), "latin1");

function fixture(policy = "*.md text eol=lf\n") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-sync-license-"));
  const repo = path.join(root, "wl-skills-bd");
  fs.mkdirSync(repo);
  const init = spawnSync("git", ["init", "--quiet", repo], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  fs.writeFileSync(path.join(repo, ".gitattributes"), policy);
  fs.writeFileSync(path.join(repo, "package.json"), '{"name":"@agile-team/wl-skills-bd","version":"0.0.0"}\n');
  const generated = spawnSync(process.execPath, [script, "--root", root, "--packages", "bd"], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);
  return { root, repo, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function snapshot(root) {
  const result = {};
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else result[path.relative(root, file)] = fs.readFileSync(file).toString("base64");
    }
  };
  walk(root);
  return result;
}

function run(f, check = true) {
  const before = snapshot(f.root);
  const result = spawnSync(process.execPath, [script, "--root", f.root, "--packages", "bd", ...(check ? ["--check"] : [])], { encoding: "utf8" });
  const receipt = JSON.parse(result.stdout);
  if (check) assert.deepEqual(snapshot(f.root), before, "--check must not write any file, including Git metadata");
  return { status: result.status, receipt };
}

test("declared Git LF license accepts LF and CRLF without writes", () => {
  const f = fixture();
  try {
    for (const bytes of [lfLicense, crlfLicense]) {
      fs.writeFileSync(path.join(f.repo, licensePath), bytes);
      assert.deepEqual(run(f), { status: 0, receipt: { ok: true, packages: ["bd"], drift: [] } });
      assert.deepEqual(fs.readFileSync(path.join(f.repo, licensePath)), bytes);
      const { verifySupport } = require(path.join(f.repo, "lib/shared-support-check.cjs"));
      assert.equal(verifySupport(path.join(f.repo, "lib")).ok, true, "offline archive honors only the declared license LF exception");
    }
  } finally { f.cleanup(); }
});

test("license wording changes remain drift, and distribution writes declared LF only", () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.repo, licensePath), Buffer.concat([lfLicense, Buffer.from("changed license wording\n")]));
    assert.deepEqual(run(f), { status: 1, receipt: { ok: false, packages: ["bd"], drift: [path.join(f.repo, licensePath)] } });
    const before = snapshot(f.root);
    const applied = run(f, false);
    assert.equal(applied.status, 0);
    assert.equal(applied.receipt.changed, 1);
    assert.deepEqual(fs.readFileSync(path.join(f.repo, licensePath)), lfLicense);
    const expected = { ...before, [path.join("wl-skills-bd", licensePath)]: lfLicense.toString("base64") };
    assert.deepEqual(snapshot(f.root), expected, "distribution may only repair the changed license");
  } finally { f.cleanup(); }
});

test("all core snapshots and manifest retain strict byte comparisons", () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.repo, licensePath), lfLicense);
    for (const name of [...coreFiles, "shared-support-manifest.json"]) {
      const file = path.join(f.repo, "lib", name);
      const original = fs.readFileSync(file);
      for (const bytes of [Buffer.from(original.toString("latin1").replace(/\r?\n/g, "\r\n"), "latin1"), Buffer.concat([original, Buffer.from("x")])]) {
        assert.notDeepEqual(bytes, original, `${name} fixture must change actual bytes`);
        fs.writeFileSync(file, bytes);
        assert.deepEqual(run(f), { status: 1, receipt: { ok: false, packages: ["bd"], drift: [file] } });
      }
      fs.writeFileSync(file, original);
    }
  } finally { f.cleanup(); }
});

test("other vendor files and a license without Git LF policy stay strict", () => {
  const f = fixture("");
  try {
    const changedLicense = canonicalLicense.equals(lfLicense) ? crlfLicense : lfLicense;
    fs.writeFileSync(path.join(f.repo, licensePath), changedLicense);
    assert.deepEqual(run(f), { status: 1, receipt: { ok: false, packages: ["bd"], drift: [path.join(f.repo, licensePath)] } });
    fs.writeFileSync(path.join(f.repo, licensePath), canonicalLicense);
    const file = path.join(f.repo, "lib/vendor/jsonc-parser/main.js");
    const original = fs.readFileSync(file);
    fs.writeFileSync(file, Buffer.concat([original, Buffer.from("\n")]));
    assert.deepEqual(run(f), { status: 1, receipt: { ok: false, packages: ["bd"], drift: [file] } });
  } finally { f.cleanup(); }
});

test("changing a developer script only changes development distribution files", () => {
  const f = fixture("");
  try {
    const copy = path.join(f.root, "canonical");
    fs.cpSync(source, path.join(copy, "support"), { recursive: true });
    fs.cpSync(path.dirname(script), path.join(copy, "scripts"), { recursive: true });
    const changedScript = path.join(copy, "scripts/pack-integrity-check.cjs");
    fs.appendFileSync(changedScript, "\n// development-only fixture change\n");
    const runtime = path.join(f.repo, "lib/shared-support-manifest.json");
    const development = path.join(f.repo, "scripts/shared-development-manifest.json");
    const beforeRuntime = fs.readFileSync(runtime);
    const beforeDevelopment = fs.readFileSync(development);
    const generated = spawnSync(process.execPath, [path.join(copy, "scripts/sync-support.cjs"), "--root", f.root, "--packages", "bd"], { encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
    assert.deepEqual(fs.readFileSync(runtime), beforeRuntime);
    assert.notDeepEqual(fs.readFileSync(development), beforeDevelopment);
    const verify = require(path.join(f.repo, "lib/shared-support-check.cjs"));
    assert.equal(verify.verifySupport(path.join(f.repo, "lib")).developmentFilesChecked, 2);
    fs.appendFileSync(path.join(f.repo, "scripts/pack-integrity-check.cjs"), "\n// changed after sync\n");
    assert.throws(() => verify.verifySupport(path.join(f.repo, "lib")), /开发验收脚本漂移/);
  } finally { f.cleanup(); }
});

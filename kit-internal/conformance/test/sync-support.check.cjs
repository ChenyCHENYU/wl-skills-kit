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
  const copy = (original, relative) => {
    const destination = path.join(repo, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(original, destination);
  };
  for (const name of [...coreFiles, "shared-support-manifest.json", "shared-jsonc.cjs"]) copy(path.join(source, name), `lib/${name}`);
  fs.cpSync(path.join(source, "vendor/jsonc-parser"), path.join(repo, "lib/vendor/jsonc-parser"), { recursive: true });
  copy(path.resolve(__dirname, "../scripts/compatibility-check.cjs"), "scripts/compatibility-check.cjs");
  copy(path.join(source, "contracts/wl-api-contract.schema.json"), "files/.wl-skills-bd/schemas/collaboration-contract.schema.json");
  copy(path.join(source, "contracts/wl-delivery-profile.v1.json"), "files/.wl-skills-bd/contracts/wl-delivery-profile.v1.json");
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

test("all ten core snapshots and manifest retain strict byte comparisons", () => {
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

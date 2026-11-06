"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { DIRECTORIES, DEFAULT_PACKAGES } = require("../support/shared-distribution.cjs");
const script = path.resolve(__dirname, "../scripts/sync-support.cjs");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function fixture(t, keys = DEFAULT_PACKAGES) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wl-distribution-check-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const key of keys) {
    const repo = path.join(root, `wl-skills-${key}`);
    fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: `@agile-team/wl-skills-${key}`, version: "0.0.0" }));
  }
  const result = spawnSync(process.execPath, [script, "--root", root, "--packages", keys.join(",")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return key => {
    const repo = path.join(root, `wl-skills-${key}`);
    const directory = path.join(repo, DIRECTORIES[key]);
    const manifestFile = path.join(directory, "shared-support-manifest.json");
    return { repo, directory, manifestFile, manifest: JSON.parse(fs.readFileSync(manifestFile)), check: () => spawnSync(process.execPath, [path.join(directory, "shared-support-check.cjs")], { encoding: "utf8", cwd: repo }) };
  };
}

test("five offline profiles share one source revision and cover every distributed byte", t => {
  const get = fixture(t);
  const revisions = new Set();
  const distributions = new Set();
  for (const key of DEFAULT_PACKAGES) {
    const f = get(key);
    revisions.add(f.manifest.sourceRevision);
    distributions.add(f.manifest.distributionRevision);
    fs.rmSync(path.join(f.repo, "scripts"), { recursive: true });
    const result = f.check();
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.developmentFilesChecked, 0, "runtime needs no developer script or sibling source");
    assert.equal(receipt.distributionFilesChecked, Object.keys(f.manifest.distributionFiles).length);
  }
  assert.equal(revisions.size, 1);
  assert.equal(distributions.size, 5, "package-specific asset paths do not change the common source revision");
});

const previousGaps = {
  kit: ["lib/shared-jsonc.cjs", "lib/vendor/jsonc-parser/main.js", "lib/atomic-write.cjs", "files/.wl-skills/contracts/wl-api-contract.schema.json", "files/.wl-skills/contracts/wl-delivery-profile.v1.json"],
  ui: ["bin/shared-jsonc.cjs", "bin/vendor/jsonc-parser/main.js", "bin/atomic-write.cjs"],
  bd: ["lib/shared-jsonc.cjs", "lib/vendor/jsonc-parser/main.js", "files/.wl-skills-bd/schemas/collaboration-contract.schema.json", "files/.wl-skills-bd/contracts/wl-delivery-profile.v1.json"],
  test: ["lib/shared-jsonc.cjs", "lib/vendor/jsonc-parser/main.js", "files/.wl-skills-test/contracts/wl-api-contract.schema.json"],
  design: ["files/.github/contracts/wl-delivery-profile.v1.json"]
};
test("all 16 previously accepted runtime and asset mutations now fail standalone checks", t => {
  const get = fixture(t);
  let rejected = 0;
  for (const [key, files] of Object.entries(previousGaps)) {
    const f = get(key);
    for (const name of files) {
      assert.ok(Object.hasOwn(f.manifest.distributionFiles, name), `${key}/${name} must be inventoried`);
      const file = path.join(f.repo, name);
      const original = fs.readFileSync(file);
      fs.appendFileSync(file, "\n// unintended drift\n");
      const result = f.check();
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, /共享分发文件漂移/);
      fs.writeFileSync(file, original);
      rejected++;
    }
  }
  assert.equal(rejected, 16);
});

test("all extra files, missing assets and escaped vendor symlinks are rejected", t => {
  const get = fixture(t, ["kit"]);
  const f = get("kit");
  const { verifySupport } = require(path.join(f.directory, "shared-support-check.cjs"));
  for (const name of Object.keys(f.manifest.distributionFiles)) {
    const file = path.join(f.repo, name);
    const original = fs.readFileSync(file);
    fs.appendFileSync(file, "x");
    assert.throws(() => verifySupport(f.directory), /漂移/, name);
    fs.writeFileSync(file, original);
  }
  const vendor = path.join(f.repo, "lib/vendor/jsonc-parser/main.js");
  const original = fs.readFileSync(vendor);
  fs.unlinkSync(vendor);
  assert.throws(() => verifySupport(f.directory), /ENOENT/);
  const outside = path.join(f.repo, "..", "outside.js");
  fs.writeFileSync(outside, original);
  fs.symlinkSync(outside, vendor);
  assert.throws(() => verifySupport(f.directory), /越界/);
});

function rewrite(f, mutate) {
  const manifest = structuredClone(f.manifest);
  mutate(manifest);
  const { distributionProfile, distributionFiles, distributionNormalizations } = manifest;
  manifest.distributionRevision = `sha256:${sha(JSON.stringify({ distributionProfile, distributionFiles, distributionNormalizations }))}`;
  fs.writeFileSync(f.manifestFile, JSON.stringify(manifest));
}
test("manifest refuses missing entries, path injection, hash substitution and broad newline exemptions", t => {
  const get = fixture(t, ["kit"]);
  const f = get("kit");
  const invalid = [
    m => { delete m.distributionFiles["lib/shared-jsonc.cjs"]; },
    m => { m.distributionFiles["../secret"] = "0".repeat(64); },
    m => { m.distributionFiles["lib/shared-jsonc.cjs"] = "0".repeat(64); },
    m => { m.distributionNormalizations["lib/task-intent.cjs"] = "lf"; },
    m => { m.distributionNormalizations["lib/vendor/jsonc-parser/LICENSE.md"] = "trim"; },
    m => { m.sourceRevision = "sha256:" + "0".repeat(64); },
    m => { m.schemaVersion = 1; }
  ];
  for (const mutate of invalid) {
    rewrite(f, mutate);
    assert.equal(f.check().status, 1);
  }
});

test("npm payload guard catches omitted assets and never runs package lifecycle hooks", t => {
  const get = fixture(t, ["kit"]);
  const f = get("kit");
  const packageFile = path.join(f.repo, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packageFile));
  pkg.files = ["lib/", "files/"];
  pkg.scripts = { prepack: 'node -e "require(\'fs\').writeFileSync(\'forbidden-hook\',\'ran\')"' };
  fs.writeFileSync(packageFile, JSON.stringify(pkg));
  const invoke = () => spawnSync(process.execPath, [path.join(f.repo, "scripts/pack-integrity-check.cjs")], { encoding: "utf8" });
  const pass = invoke();
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(fs.existsSync(path.join(f.repo, "forbidden-hook")), false);
  pkg.files = ["lib/"];
  fs.writeFileSync(packageFile, JSON.stringify(pkg));
  assert.equal(f.check().status, 0, "source is intact but publication omits external assets");
  const fail = invoke();
  assert.equal(fail.status, 1, fail.stdout);
  assert.match(fail.stderr, /发布产物缺少共享分发文件/);
  assert.equal(fs.existsSync(path.join(f.repo, "forbidden-hook")), false);
});

test("optional Gate snapshot uses the common source without requiring Gate or other repositories by default", t => {
  const get = fixture(t, ["gate"]);
  const f = get("gate");
  assert.equal(f.manifest.distributionProfile, "gate");
  assert.equal(f.manifest.sourceRevision, JSON.parse(fs.readFileSync(path.resolve(__dirname, "../support/shared-support-manifest.json"))).sourceRevision);
  assert.equal(Object.keys(f.manifest.distributionFiles).length, 40);
  assert.ok(Object.keys(f.manifest.distributionFiles).every(name => name.startsWith("lib/shared-support/")));
  assert.equal(fs.existsSync(path.join(f.repo, "scripts/compatibility-check.cjs")), false);
  const result = f.check();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).developmentFilesChecked, 0);
  const mcp = require(path.join(f.directory, "mcp-config.cjs"));
  assert.equal(mcp.describeMcpIntegration("@agile-team/wl-skills-gate").status, "not-provided");
  assert.throws(() => mcp.describeMcpIntegration("@agile-team/wl-skills-untrusted"), /Unsupported WL MCP package identity/);
  const file = path.join(f.directory, "shared-jsonc.cjs");
  fs.appendFileSync(file, "x");
  assert.equal(f.check().status, 1);
});

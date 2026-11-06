"use strict";

/** Development distribution. --check never writes; only selected repos are needed. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < args.length; index++) {
  const name = args[index];
  if (!["--check", "--packages", "--root"].includes(name) || options.has(name)) throw new Error(`未知或重复参数：${name}`);
  if (name === "--check") options.set(name, true);
  else {
    const value = args[++index];
    if (!value || value.startsWith("--") || !value.trim()) throw new Error(`${name} 缺少值`);
    options.set(name, value);
  }
}
const option = name => options.get(name);
const check = args.includes("--check");
const { CORE_FILES: names, DIRECTORIES: directories, DEFAULT_PACKAGES, DEVELOPMENT_MANIFEST, EXTRA_FILES, LICENSE, distributionFiles, developmentScripts } = require("../support/shared-distribution.cjs");
const selected = (option("--packages") || DEFAULT_PACKAGES.join(",")).split(",");
if (selected.some(key => !Object.hasOwn(directories, key))) throw new Error("--packages 必须指定 kit,ui,bd,design,test,gate 中的包");
const root = path.resolve(option("--root") || process.env.WL_PACKAGES_ROOT || path.resolve(__dirname, "../../../.."));
const source = path.resolve(__dirname, "../support");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const files = Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(source, name)))]));
const distributionSources = Object.fromEntries(EXTRA_FILES.map(name => [name, hash(fs.readFileSync(path.join(source, name)))]));
const licenseLf = bytes => Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
const normalizationHashes = { [LICENSE]: hash(licenseLf(fs.readFileSync(path.join(source, LICENSE)))) };
const sourceRevision = `sha256:${hash(JSON.stringify({ files, distributionSources, normalizationHashes }))}`;
const baseManifest = { schemaVersion: 3, source: "conformance/support", sourceRevision, contracts: { protocol: 1, resultCore: 1, executorInvoke: 1 }, files, distributionSources, normalizationHashes };
const developmentFiles = Object.fromEntries(developmentScripts("canonical").map(name => [name, hash(fs.readFileSync(path.join(__dirname, path.basename(name))))]));
const developmentManifest = Buffer.from(JSON.stringify({ schemaVersion: 1, revision: `sha256:${hash(JSON.stringify(developmentFiles))}`, files: developmentFiles }, null, 2) + "\n");
const writes = [];
const licenseSource = path.join(source, LICENSE);
function declaresGitLf(repo, file) {
  const result = spawnSync("git", ["-C", repo, "check-attr", "-z", "text", "eol", "--", path.relative(repo, file)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (result.status !== 0) return false;
  const fields = result.stdout.split("\0");
  const attributes = {};
  for (let index = 0; index + 2 < fields.length; index += 3) attributes[fields[index + 1]] = fields[index + 2];
  return ["set", "auto"].includes(attributes.text) && attributes.eol === "lf";
}
// Only this license is eligible, and only under declared source/destination Git
// text/LF policy. Preserve every other byte, including core snapshot hashes.
const licenseSourceLf = declaresGitLf(path.resolve(__dirname, "../../.."), licenseSource);
function add(destination, sourceFile, repo) {
  const normalizeLicense = sourceFile === licenseSource && licenseSourceLf && repo && declaresGitLf(repo, destination);
  const bytes = fs.readFileSync(sourceFile);
  writes.push([destination, normalizeLicense ? licenseLf(bytes) : bytes, normalizeLicense]);
}
function addManifest(directory, key, repo) {
  const entries = distributionFiles(key);
  const distributionHashes = {};
  const distributionNormalizations = {};
  for (const [destination, original] of Object.entries(entries)) {
    const sourceFile = path.join(source, original);
    const target = path.join(directory, destination);
    add(target, sourceFile, repo);
    const [, bytes, normalized] = writes.at(-1);
    distributionHashes[destination] = hash(bytes);
    if (normalized) distributionNormalizations[destination] = "lf";
  }
  const distribution = { distributionProfile: key, distributionFiles: distributionHashes, distributionNormalizations };
  const distributionRevision = `sha256:${hash(JSON.stringify(distribution))}`;
  const manifest = Buffer.from(JSON.stringify({ ...baseManifest, ...distribution, distributionRevision }, null, 2) + "\n");
  const manifestDirectory = key === "canonical" ? directory : path.join(directory, directories[key]);
  writes.push([path.join(manifestDirectory, "shared-support-manifest.json"), manifest]);
}
addManifest(source, "canonical");
writes.push([path.resolve(__dirname, "..", DEVELOPMENT_MANIFEST), developmentManifest]);
for (const key of selected) {
  const repo = path.join(root, `wl-skills-${key}`);
  if (!fs.existsSync(path.join(repo, "package.json"))) throw new Error(`缺少选定包：${repo}`);
  addManifest(repo, key, repo);
  const scripts = developmentScripts(key);
  if (scripts.length) writes.push([path.join(repo, DEVELOPMENT_MANIFEST), developmentManifest]);
  for (const name of scripts) add(path.join(repo, name), path.join(__dirname, path.basename(name)));
}
const changed = writes.filter(([file, bytes, normalizeLicense]) => {
  if (!fs.existsSync(file)) return true;
  const actual = fs.readFileSync(file);
  return !(normalizeLicense ? licenseLf(actual) : actual).equals(bytes);
});
if (check) {
  console.log(JSON.stringify({ ok: changed.length === 0, packages: selected, drift: changed.map(([file]) => file) }));
  process.exitCode = changed.length ? 1 : 0;
} else {
  for (const [file, bytes] of changed) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
  console.log(JSON.stringify({ ok: true, packages: selected, changed: changed.length, sourceRevision }));
}

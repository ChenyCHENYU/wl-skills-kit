"use strict";
/** Packaged snapshots verify every generated runtime and asset offline. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { CORE_FILES, DIRECTORIES, DEVELOPMENT_MANIFEST, EXTRA_FILES, LICENSE, distributionFiles, developmentScripts } = require("./shared-distribution.cjs");
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const object = value => value && typeof value === "object" && !Array.isArray(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function sameKeys(actual, expected) {
  if (!object(actual) || Object.keys(actual).sort().join("\0") !== [...expected].sort().join("\0")) throw new Error("共享快照清单文件集合不完整或含非法路径");
}
function validateHashes(files, names) {
  sameKeys(files, names);
  if (!Object.values(files).every(hash)) throw new Error("非法共享快照文件 hash");
}
function validateManifest(manifest) {
  if (![2, 3].includes(manifest.schemaVersion)) throw new Error("共享快照清单版本不支持，需重新同步完整分发清单");
  validateHashes(manifest.files, CORE_FILES);
  validateHashes(manifest.distributionSources, EXTRA_FILES);
  validateHashes(manifest.normalizationHashes, [LICENSE]);
  const { files, developmentFiles, distributionSources, normalizationHashes } = manifest;
  if (manifest.schemaVersion === 2) validateHashes(developmentFiles, developmentScripts("canonical"));
  const inputs = { files, ...(manifest.schemaVersion === 2 ? { developmentFiles } : {}), distributionSources, normalizationHashes };
  if (manifest.sourceRevision !== `sha256:${digest(JSON.stringify(inputs))}`) throw new Error("共享快照源 revision 与清单不一致");
}
function checkedFile(root, name) {
  const file = path.resolve(root, name);
  const real = fs.realpathSync(file);
  if (!real.startsWith(root + path.sep) || !fs.statSync(real).isFile()) throw new Error(`共享快照文件越界：${name}`);
  return file;
}
function verifyRuntime(directory, files) {
  for (const [name, expected] of Object.entries(files)) {
    if (digest(fs.readFileSync(checkedFile(directory, name))) !== expected) throw new Error(`共享快照漂移：${name}`);
  }
}
function distributionDefinition(manifest) {
  const { distributionProfile, distributionFiles: files, distributionNormalizations: normalizations } = manifest;
  const mapping = distributionFiles(distributionProfile);
  validateHashes(files, Object.keys(mapping));
  if (!object(normalizations)) throw new Error("非法分发换行规则");
  for (const [name, normalization] of Object.entries(normalizations)) {
    if (distributionProfile === "canonical" || mapping[name] !== LICENSE || normalization !== "lf") throw new Error("非法分发换行规则");
  }
  const sources = { ...manifest.files, ...manifest.distributionSources };
  for (const [name, source] of Object.entries(mapping)) {
    const expected = normalizations[name] ? manifest.normalizationHashes[source] : sources[source];
    if (files[name] !== expected) throw new Error(`分发 hash 与源不一致：${name}`);
  }
  const definition = { distributionProfile, distributionFiles: files, distributionNormalizations: normalizations };
  if (manifest.distributionRevision !== `sha256:${digest(JSON.stringify(definition))}`) throw new Error("分发 revision 与清单不一致");
  return definition;
}
function packageRoot(directory, profile) {
  if (profile === "canonical") return directory;
  const parts = DIRECTORIES[profile].split("/");
  const root = fs.realpathSync(path.resolve(directory, ...parts.map(() => "..")));
  if (path.resolve(root, ...parts) !== directory) throw new Error("共享快照分发目录与包配置不一致");
  return root;
}
function verifyDistribution(directory, manifest) {
  const definition = distributionDefinition(manifest);
  const root = packageRoot(directory, definition.distributionProfile);
  for (const [name, expected] of Object.entries(definition.distributionFiles)) {
    let bytes = fs.readFileSync(checkedFile(root, name));
    if (definition.distributionNormalizations[name]) bytes = Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
    if (digest(bytes) !== expected) throw new Error(`共享分发文件漂移：${name}`);
  }
  return Object.keys(definition.distributionFiles).length;
}
function developmentHashes(root, manifest, names) {
  if (manifest.schemaVersion === 2) return manifest.developmentFiles;
  const present = fs.existsSync(path.join(root, DEVELOPMENT_MANIFEST));
  if (!present && !names.some(name => fs.existsSync(path.join(root, name)))) return {};
  if (!present) throw new Error("缺少开发验收脚本清单");
  const development = JSON.parse(fs.readFileSync(checkedFile(root, DEVELOPMENT_MANIFEST), "utf8"));
  if (development.schemaVersion !== 1) throw new Error("开发验收脚本清单版本不支持");
  validateHashes(development.files, names);
  if (development.revision !== `sha256:${digest(JSON.stringify(development.files))}`) throw new Error("开发验收脚本 revision 与清单不一致");
  return development.files;
}
function verifyDevelopment(directory, manifest) {
  const names = developmentScripts(manifest.distributionProfile);
  if (!names.length) return 0;
  const root = manifest.distributionProfile === "canonical" ? fs.realpathSync(path.join(directory, "..")) : packageRoot(directory, manifest.distributionProfile);
  const files = developmentHashes(root, manifest, names);
  let developmentFilesChecked = 0;
  for (const name of names.filter(name => Object.hasOwn(files, name))) {
    if (manifest.schemaVersion === 2 && !fs.existsSync(path.join(root, name))) continue;
    const expected = files[name];
    if (digest(fs.readFileSync(checkedFile(root, name))) !== expected) throw new Error(`开发验收脚本漂移：${name}`);
    developmentFilesChecked++;
  }
  return developmentFilesChecked;
}
function verifySupport(directory = __dirname) {
  const root = fs.realpathSync(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "shared-support-manifest.json"), "utf8"));
  validateManifest(manifest);
  verifyRuntime(root, manifest.files);
  const distributionFilesChecked = verifyDistribution(root, manifest);
  const developmentFilesChecked = verifyDevelopment(root, manifest);
  return { ok: true, sourceRevision: manifest.sourceRevision, distributionRevision: manifest.distributionRevision, distributionProfile: manifest.distributionProfile, contracts: manifest.contracts, files: Object.keys(manifest.files).length, distributionFilesChecked, developmentFilesChecked };
}
if (require.main === module) {
  try { console.log(JSON.stringify(verifySupport())); }
  catch (error) { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
}
module.exports = { verifySupport };

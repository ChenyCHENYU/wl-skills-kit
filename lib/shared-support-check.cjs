"use strict";
/** Packaged snapshots verify themselves offline, without sibling checkouts. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || !manifest.files || Object.keys(manifest.files).length < 10) throw new Error("共享快照清单结构不完整");
  if (manifest.sourceRevision !== `sha256:${digest(JSON.stringify({ files: manifest.files, developmentFiles: manifest.developmentFiles }))}`) throw new Error("共享快照源 revision 与清单不一致");
}
function verifyRuntime(directory, files) {
  for (const [name, expected] of Object.entries(files)) {
    if (path.basename(name) !== name || !/^[a-f0-9]{64}$/.test(expected)) throw new Error("非法共享快照文件清单");
    if (digest(fs.readFileSync(path.join(directory, name))) !== expected) throw new Error(`共享快照漂移：${name}`);
  }
}
function verifyDevelopment(directory, files) {
  let developmentFilesChecked = 0;
  for (const [name, expected] of Object.entries(files || {})) {
    if (name !== "scripts/compatibility-check.cjs" || !/^[a-f0-9]{64}$/.test(expected)) throw new Error("非法开发验收脚本清单");
    const file = path.resolve(directory, "..", name);
    // Runtime archives need no development script; repositories verify any distributed copy.
    if (!fs.existsSync(file)) continue;
    if (digest(fs.readFileSync(file)) !== expected) throw new Error(`开发验收脚本漂移：${name}`);
    developmentFilesChecked++;
  }
  return developmentFilesChecked;
}
function verifySupport(directory = __dirname) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "shared-support-manifest.json"), "utf8"));
  validateManifest(manifest);
  verifyRuntime(directory, manifest.files);
  const developmentFilesChecked = verifyDevelopment(directory, manifest.developmentFiles);
  return { ok: true, sourceRevision: manifest.sourceRevision, contracts: manifest.contracts, files: Object.keys(manifest.files).length, developmentFilesChecked };
}
if (require.main === module) {
  try { console.log(JSON.stringify(verifySupport())); }
  catch (error) { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
}
module.exports = { verifySupport };

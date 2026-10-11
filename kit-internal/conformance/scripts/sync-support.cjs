"use strict";

/** Development distribution. --check never writes; only selected repos are needed. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
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
const directories = { kit: "lib", ui: "bin", bd: "lib", design: "lib", test: "lib" };
const selected = (option("--packages") || Object.keys(directories).join(",")).split(",");
if (selected.some(key => !Object.hasOwn(directories, key))) throw new Error("--packages 必须指定 kit,ui,bd,design,test 中的包");
const root = path.resolve(option("--root") || process.env.WL_PACKAGES_ROOT || path.resolve(__dirname, "../../../.."));
const source = path.resolve(__dirname, "../support");
const names = ["task-observability.cjs", "task-observability.schema.json", "integration-protocol.cjs", "project-scope.cjs", "project-scope.schema.json", "task-intent.cjs", "integration-result.cjs", "executor-invoke.cjs", "executor-process.cjs", "shared-support-check.cjs"];
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const files = Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(source, name)))]));
const developmentFiles = { "scripts/compatibility-check.cjs": hash(fs.readFileSync(path.join(__dirname, "compatibility-check.cjs"))) };
const sourceRevision = `sha256:${hash(JSON.stringify({ files, developmentFiles }))}`;
const manifest = Buffer.from(JSON.stringify({ schemaVersion: 1, source: "conformance/support", sourceRevision, contracts: { protocol: 1, resultCore: 1, executorInvoke: 1 }, files, developmentFiles }, null, 2) + "\n");
const writes = [[path.join(source, "shared-support-manifest.json"), manifest]];
function add(destination, sourceFile) { writes.push([destination, fs.readFileSync(sourceFile)]); }
function addTree(destination, sourceDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isDirectory()) addTree(path.join(destination, entry.name), path.join(sourceDir, entry.name));
    else add(path.join(destination, entry.name), path.join(sourceDir, entry.name));
  }
}
for (const key of selected) {
  const repo = path.join(root, `wl-skills-${key}`);
  if (!fs.existsSync(path.join(repo, "package.json"))) throw new Error(`缺少选定包：${repo}`);
  const directory = path.join(repo, directories[key]);
  for (const name of names) add(path.join(directory, name), path.join(source, name));
  writes.push([path.join(directory, "shared-support-manifest.json"), manifest]);
  add(path.join(repo, "scripts/compatibility-check.cjs"), path.join(__dirname, "compatibility-check.cjs"));
  if (key !== "design") {
    add(path.join(directory, "shared-jsonc.cjs"), path.join(source, "shared-jsonc.cjs"));
    addTree(path.join(directory, "vendor/jsonc-parser"), path.join(source, "vendor/jsonc-parser"));
  }
  if (["kit", "ui"].includes(key)) add(path.join(directory, "atomic-write.cjs"), path.join(source, "atomic-write.cjs"));
  const schema = { kit: "files/.wl-skills/contracts/wl-api-contract.schema.json", bd: "files/.wl-skills-bd/schemas/collaboration-contract.schema.json", test: "files/.wl-skills-test/contracts/wl-api-contract.schema.json" }[key];
  if (schema) add(path.join(repo, schema), path.join(source, "contracts/wl-api-contract.schema.json"));
  const profile = { kit: "files/.wl-skills/contracts/wl-delivery-profile.v1.json", bd: "files/.wl-skills-bd/contracts/wl-delivery-profile.v1.json", design: "files/.github/contracts/wl-delivery-profile.v1.json" }[key];
  if (profile) add(path.join(repo, profile), path.join(source, "contracts/wl-delivery-profile.v1.json"));
}
const changed = writes.filter(([file, bytes]) => !fs.existsSync(file) || !fs.readFileSync(file).equals(bytes));
if (check) {
  console.log(JSON.stringify({ ok: changed.length === 0, packages: selected, drift: changed.map(([file]) => file) }));
  process.exitCode = changed.length ? 1 : 0;
} else {
  for (const [file, bytes] of changed) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
  console.log(JSON.stringify({ ok: true, packages: selected, changed: changed.length, sourceRevision }));
}

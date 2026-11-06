"use strict";

// Shared installation policy and resource resolution. This module never installs
// dependencies, detects active agents from directories, or fetches remote code.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { hostProfiles, resolveHostId, compactHostIntegration } = require("./host-profiles.cjs");

function json(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`无法读取 WL 项目配置 ${file}: ${error.message}`); }
}
function readProjectConfig(projectRoot) {
  const root = path.resolve(projectRoot || process.cwd());
  const packagePath = path.join(root, "package.json");
  const fallback = path.join(root, ".wl-skills/config.json");
  if (fs.existsSync(packagePath)) {
    const metadata = json(packagePath);
    if (Object.hasOwn(metadata, "wlSkills")) return configResult(metadata.wlSkills, packagePath, true, true);
    if (fs.existsSync(fallback)) return configResult(json(fallback), fallback, false, true);
    return configResult({}, packagePath, true, false);
  }
  return fs.existsSync(fallback) ? configResult(json(fallback), fallback, false, true) : configResult({}, fallback, false, false);
}
function configResult(value, configPath, inPackageJson, configured) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${configPath}: wlSkills 必须是对象`);
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) throw new Error(`${configPath}: 不支持的 wlSkills schemaVersion`);
  if (value.mcp !== undefined && typeof value.mcp !== "boolean") throw new Error(`${configPath}: mcp 必须是布尔值`);
  return { value, configPath, inPackageJson, configured };
}
function hostList(value) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  if (!list.length || list.some(item => typeof item !== "string" || !item.trim())) throw new Error("--hosts / wlSkills.hosts 必须是非空宿主列表");
  if (list.length === 1 && list[0].trim().toLowerCase() === "all") return [...hostProfiles];
  return [...new Set(list.map(item => {
    const id = resolveHostId(item);
    if (!id) throw new Error(`不支持的 WL 宿主 ${item}；请指定实际 Agent，模型名或 VS Code 不能决定技能入口`);
    return id;
  }))];
}
function recordedPolicy(options) {
  return options.recorded?.integration && typeof options.recorded.integration === "object" ? options.recorded.integration : options.recorded || {};
}
function integrationMode(options, config, recorded) {
  const recordedMode = ["compact", "expanded"].includes(recorded.integration) ? recorded.integration : ["compact", "expanded"].includes(recorded.mode) ? recorded.mode : null;
  const mode = options.integration || config.value.integration || recordedMode || "compact";
  if (!["compact", "expanded"].includes(mode)) throw new Error("wlSkills.integration 必须为 compact 或 expanded");
  return mode;
}
function hostSelection(options, config, recorded) {
  const explicit = options.hosts !== undefined ? options.hosts : options.editor;
  const configured = config.value.hosts;
  // Old all-editor installations are not silently carried into compact mode.
  const previous = recorded.hosts;
  return { hosts: hostList(explicit ?? configured ?? previous ?? ["codex"]),
    source: explicit !== undefined ? "cli" : configured !== undefined ? "project-config" : previous ? "recorded" : "common-default" };
}
function resolveIntegration(options = {}) {
  if (options.mcp !== undefined && typeof options.mcp !== "boolean") throw new Error("显式 mcp 选项必须是布尔值");
  const config = readProjectConfig(options.projectRoot);
  const recorded = recordedPolicy(options);
  const mode = integrationMode(options, config, recorded);
  const { hosts, source } = hostSelection(options, config, recorded);
  const integrations = hosts.map(id => compactHostIntegration(id, hosts));
  const gatewayRoots = [...new Set(integrations.map(host => host.gatewayRoot))];
  const entryFiles = [...new Set(integrations.flatMap(host => host.entryFiles))];
  return { schemaVersion: 1, integration: mode, hosts, gatewayRoots, entryFiles,
    mcp: options.mcp !== undefined ? options.mcp : config.value.mcp === true,
    configPath: config.configPath, configured: config.configured,
    source };
}
function saveProjectConfig(projectRoot, policy) {
  if (policy.mcp !== undefined && typeof policy.mcp !== "boolean") throw new Error("显式 mcp 选项必须是布尔值");
  const config = readProjectConfig(projectRoot);
  const value = { ...config.value, schemaVersion: 1, integration: policy.integration, hosts: hostList(policy.hosts) };
  if (policy.mcp !== undefined) value.mcp = Boolean(policy.mcp);
  const output = config.inPackageJson ? { ...json(config.configPath), wlSkills: value } : value;
  let ancestor = config.configPath;
  const boundary = path.resolve(projectRoot);
  while (ancestor !== boundary) {
    if (isSymbolicLink(ancestor)) throw new Error("WL 配置不能通过符号链接写入");
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error("WL 配置路径越界");
    ancestor = parent;
  }
  fs.mkdirSync(path.dirname(config.configPath), { recursive: true });
  const temp = `${config.configPath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try { fs.writeFileSync(temp, JSON.stringify(output, null, 2) + "\n", { flag: "wx" }); fs.renameSync(temp, config.configPath); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return config.configPath;
}
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function isSymbolicLink(file) {
  try { return fs.lstatSync(file).isSymbolicLink(); }
  catch (error) { if (["ENOENT", "ENOTDIR"].includes(error.code)) return false; throw error; }
}
function ensureStateIgnore(projectRoot) {
  const root = fs.realpathSync(path.resolve(projectRoot));
  const directory = path.join(root, ".wl-skills/state");
  let cursor = directory;
  while (cursor !== root) {
    if (isSymbolicLink(cursor)) throw new Error("WL 状态忽略文件不能通过符号链接写入");
    cursor = path.dirname(cursor);
  }
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, ".gitignore");
  if (isSymbolicLink(file)) throw new Error("WL 状态忽略文件不能通过符号链接写入");
  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const missing = ["*/runs/", "*/cache/", "*/backups/"].filter(entry => !previous.split(/\r?\n/).includes(entry));
  if (!missing.length) return file;
  const suffix = previous && !previous.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(file, suffix + missing.join("\n") + "\n");
  return file;
}
function safeResource(root, file) {
  if (!inside(root, file)) throw new Error("WL 资源路径越界");
  if (!fs.existsSync(file)) return false;
  if (!inside(fs.realpathSync(root), fs.realpathSync(file))) throw new Error("WL 资源符号链接越界");
  return true;
}
function resolveResourcePath(projectRoot, relativePath, packageRoot) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) throw new Error("WL 资源必须是安全的相对路径");
  const root = path.resolve(projectRoot);
  const local = path.resolve(root, relativePath);
  if (safeResource(root, local)) return local;
  const runtime = path.resolve(packageRoot);
  for (const candidate of [path.resolve(runtime, "files", relativePath), path.resolve(runtime, relativePath)]) {
    if (safeResource(runtime, candidate)) return candidate;
  }
  return local; // Keep missing resources visible to callers and doctor.
}
function resolveResource({ projectRoot, packageRoot, resourceId }) {
  const metadata = json(path.join(packageRoot, "package.json"));
  const physicalPath = resolveResourcePath(projectRoot, resourceId, packageRoot);
  const present = fs.existsSync(physicalPath);
  return { resourceId, packageName: metadata.name, packageVersion: metadata.version,
    sourceKind: physicalPath === path.resolve(projectRoot, resourceId) ? "project-override" : "package",
    physicalPath, present, sha256: present && fs.statSync(physicalPath).isFile() ? crypto.createHash("sha256").update(fs.readFileSync(physicalPath)).digest("hex") : null };
}

module.exports = { resolveIntegration, readProjectConfig, saveProjectConfig, ensureStateIgnore, resolveResourcePath, resolveResource, hostList, supportedHosts: hostProfiles };

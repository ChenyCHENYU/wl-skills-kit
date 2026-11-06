"use strict";

// Pure, project-scoped MCP plans. The package installer owns preflight, locking,
// plan confirmation, atomic writes and rollback; this module never writes files.
const fs = require("node:fs");
const path = require("node:path");
const { hostProfiles, resolveHostProfile } = require("./host-profiles.cjs");
const format = require("./mcp-config-format.cjs");
const LAYOUT_VERSION = 1;
const MAX_BYTES = 1024 * 1024;

function mcpDefinition(packageName) {
  const key = String(packageName).replace(/^@agile-team\/wl-skills-/, "");
  if (!["kit", "ui", "bd", "test", "design", "gate"].includes(key) || packageName !== `@agile-team/wl-skills-${key}`) throw new Error("Unsupported WL MCP package identity");
  return ["design", "gate"].includes(key) ? null : { packageName, serverKey: key === "kit" ? "wl-skills" : `wl-skills-${key}`, entry: key === "test" ? "mcp/index.js" : "mcp/server.js" };
}

function launchDefinition(root, definition) {
  return { command: "node", args: [path.join(root, "node_modules", definition.packageName, definition.entry)], env: { WL_PROJECT_ROOT: root } };
}

function entryValue(root, definition, style) {
  const launch = launchDefinition(root, definition);
  if (style === "kilo") return { type: "local", command: [launch.command, ...launch.args], environment: launch.env, enabled: true };
  if (style === "zcode") return { ...launch, enable: true };
  if (style === "kiro") return { ...launch, disabled: false };
  if (style === "roo") return { ...launch, cwd: root, disabled: false };
  if (style === "codex") return { ...launch, cwd: root };
  return style === "vscode" ? { type: "stdio", ...launch } : launch;
}

function allowedPath(relative, packageName) {
  return hostProfiles.some(host => resolveHostProfile(host, packageName).mcpConfigFiles.includes(relative));
}

function safeFile(root, relative, packageName) {
  if (typeof relative !== "string" || !allowedPath(relative, packageName)) throw new Error("Unrecognized project MCP configuration path");
  const file = path.resolve(root, relative);
  let cursor = file;
  while (cursor !== root) {
    try {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) throw new Error("MCP configuration cannot traverse symbolic links");
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    cursor = path.dirname(cursor);
  }
  return file;
}

function readFile(root, relative, packageName) {
  const file = safeFile(root, relative, packageName);
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("MCP configuration must be a regular file within the 1 MiB budget");
  return fs.readFileSync(file, "utf8");
}

function hostTarget(root, host, definition) {
  const profile = resolveHostProfile(host, definition.packageName);
  const layout = profile.mcpLayout;
  if (!layout) return { status: "unsupported-manual", hostId: profile.hostId, reason: "This host has no verified project MCP configuration contract" };
  if (layout.fallback) {
    const fallback = compatibleFallback(root, layout, definition, profile.hostId);
    if (fallback) return fallback;
  }
  const existing = layout.paths.filter(relative => fs.existsSync(safeFile(root, relative, definition.packageName)));
  if (layout.multiple === "ambiguous" && existing.length > 1) return { status: "ambiguous", hostId: profile.hostId, paths: existing, reason: "Multiple host configuration files exist; select one in the host before updating" };
  const relative = existing[0] || layout.defaultPath || layout.paths[0];
  const selected = { ...layout, ...layout.variants?.[relative] };
  const target = { path: relative, format: selected.format, serverKey: definition.serverKey, serverPath: [...selected.container, definition.serverKey], hostIds: [profile.hostId], style: selected.style };
  return { status: "supported", target, value: entryValue(root, definition, selected.style) };
}

function compatibleFallback(root, layout, definition, hostId) {
  const nativeServers = readServers(root, layout.paths[0], layout.container, layout.format, definition.packageName);
  if (Object.keys(nativeServers).length) return null;
  const servers = readServers(root, layout.fallback, ["mcpServers"], "jsonc", definition.packageName);
  if (!Object.keys(servers).length) return null;
  return { status: "supported", target: { path: layout.fallback, format: "jsonc", serverKey: definition.serverKey,
    serverPath: ["mcpServers", definition.serverKey], hostIds: [hostId], style: "stdio", source: "compatibility-fallback" },
    value: entryValue(root, definition, "stdio") };
}

function readServers(root, relative, container, syntax, packageName) {
  const text = readFile(root, relative, packageName);
  if (text === null) return {};
  const parsed = format.document(text, syntax, relative), servers = format.lookup(parsed, container);
  if (servers !== undefined && !format.object(servers)) throw new Error(`${relative}: MCP server container must be an object`);
  return servers || {};
}

function desiredTargets(root, definition, hosts, active) {
  const result = { targets: new Map(), diagnostics: [], blocked: new Set() };
  if (!active) return result;
  for (const host of hosts) {
    let selected;
    try { selected = hostTarget(root, host, definition); }
    catch (error) { selected = { status: "invalid", hostId: host, reason: error.message }; }
    if (selected.status !== "supported") {
      result.diagnostics.push(selected);
      const profile = resolveHostProfile(host, definition.packageName);
      for (const file of profile.mcpConfigFiles) result.blocked.add(file);
      continue;
    }
    const prior = result.targets.get(selected.target.path);
    if (prior) prior.target.hostIds.push(...selected.target.hostIds);
    else result.targets.set(selected.target.path, selected);
  }
  return result;
}

function makeRecord(packageName, target, content, current, createdFile, extra) {
  const updated = format.inspectEntry(content, target);
  return { schemaVersion: 1, packageName, path: target.path, format: target.format, serverKey: target.serverKey,
    serverPath: target.serverPath, hostIds: target.hostIds, owned: true, hashAlgorithm: "sha256", valueSerialization: "json",
    valueHash: format.hash(format.valueText(updated.value)), textHash: format.hash(updated.raw), createdFile,
    ...(updated.propertyRaw ? { propertyHash: format.hash(updated.propertyRaw) } : {}),
    createdContainers: format.createdContainers(current.parsed, target.serverPath), ...extra };
}

function preserveFile(relative, before, previous, reason) {
  return { path: relative, before, content: before, record: previous || null, action: "preserve", reason };
}

function removeOwned(before, previous) {
  if (before === null) return { path: previous.path, before, content: null, record: null, action: "none" };
  if (previous.owned === false) return { path: previous.path, before, content: before, record: null, action: "none", reason: "reference-released" };
  const current = format.inspectEntry(before, previous);
  if (current.value === undefined) return { path: previous.path, before, content: before, record: null, action: "none" };
  if (!format.matchesRecord(current, previous)) return preserveFile(previous.path, before, previous, "modified-or-unowned-server");
  let content = format.removeEntry(before, previous, previous);
  const parsed = format.document(content, previous.format, previous.path);
  const emptyText = previous.format === "toml" ? !content.trim() : /^[\s{}]*$/.test(content);
  if (previous.createdFile && Object.keys(parsed).length === 0 && emptyText) content = null;
  return { path: previous.path, before, content, record: null, action: content === null ? "remove" : "write" };
}

function referenceRecord(packageName, target, current) {
  return { schemaVersion: 1, packageName, path: target.path, format: target.format, serverKey: target.serverKey,
    serverPath: target.serverPath, hostIds: target.hostIds, owned: false, createdFile: false,
    valueHash: format.hash(format.valueText(current.value)), valueSerialization: "json", hashAlgorithm: "sha256" };
}

function installOwned(packageName, selected, before, previous) {
  const { target, value } = selected;
  const text = before ?? (target.format === "toml" ? "" : "{}\n");
  const current = format.inspectEntry(text, target);
  const existing = existingServerPlan(packageName, selected, before, previous, current);
  if (existing) return existing;
  const changed = format.setEntry(text, target, value, previous);
  const createdFile = previous?.createdFile === true || before === null;
  const record = makeRecord(packageName, target, changed.content, current, createdFile, recordExtras(changed, previous));
  if (previous?.createdContainers) record.createdContainers = previous.createdContainers;
  return { path: target.path, before, content: changed.content, record, action: "write" };
}

function recordExtras(changed, previous) {
  const extra = {};
  if (changed.addedSeparator) extra.addedSeparator = changed.addedSeparator;
  const insertionSpacing = previous?.insertionSpacing || changed.insertionSpacing;
  if (insertionSpacing) extra.insertionSpacing = insertionSpacing;
  return extra;
}

function existingServerPlan(packageName, selected, before, previous, current) {
  if (current.value === undefined) return null;
  const { target, value } = selected;
  const equivalent = format.valueText(current.value, "stable") === format.valueText(value, "stable");
  if (!format.matchesRecord(current, previous || {})) {
    if ((!previous || previous.owned === false) && equivalent) return { path: target.path, before, content: before,
      record: referenceRecord(packageName, target, current), action: "none", reason: "reference-only" };
    return preserveFile(target.path, before, previous, "modified-or-unowned-server");
  }
  return equivalent ? { path: target.path, before, content: before, record: { ...previous, hostIds: target.hostIds }, action: "none" } : null;
}

function filePlan(root, packageName, relative, selected, previous, blocked) {
  let before = null;
  try {
    before = readFile(root, relative, packageName);
    if (previous && !validRecord(previous, relative, packageName)) return preserveFile(relative, before, previous, "invalid-ownership-record");
    if (blocked.has(relative)) return preserveFile(relative, before, previous, "host-configuration-needs-review");
    if (!selected) return removeOwned(before, { ...previous, path: relative });
    if (previous && format.valueText(previous.serverPath) !== format.valueText(selected.target.serverPath)) {
      const retired = removeOwned(before, { ...previous, path: relative });
      if (retired.action === "preserve") return retired;
      const installed = installOwned(packageName, selected, retired.content, null);
      return { ...installed, before };
    }
    return installOwned(packageName, selected, before, previous);
  } catch (error) { return preserveFile(relative, before, previous, error.message); }
}

function pathContainers(relative, packageName, legacy) {
  const containers = [];
  for (const host of hostProfiles) {
    const layout = resolveHostProfile(host, packageName).mcpLayout;
    if (!layout) continue;
    if (layout.paths.includes(relative)) containers.push((layout.variants?.[relative] || layout).container);
    if (layout.fallback === relative) containers.push(["mcpServers"]);
    if (legacy && layout.style === "kilo" && layout.paths.includes(relative)) containers.push(["mcpServers"]);
  }
  return containers;
}

function validRecord(record, relative, packageName) {
  const definition = mcpDefinition(packageName);
  if (record.packageName !== packageName || record.path !== relative || record.serverKey !== definition.serverKey) return false;
  if (!Array.isArray(record.serverPath) || record.serverPath.at(-1) !== definition.serverKey) return false;
  const container = record.serverPath.slice(0, -1);
  if (!pathContainers(relative, packageName, record.legacy).some(value => format.valueText(value) === format.valueText(container))) return false;
  return validRecordFormat(record, relative) && validCreatedContainers(record) && validInsertionSpacing(record);
}

function validRecordFormat(record, relative) {
  const expectedFormat = relative === ".codex/config.toml" ? "toml" : "jsonc";
  if (record.format !== expectedFormat || !["sha256", "md5"].includes(record.hashAlgorithm)) return false;
  return !record.addedSeparator || ["\n", "\r\n"].includes(record.addedSeparator);
}

function validCreatedContainers(record) {
  return (record.createdContainers || []).every(segments => Array.isArray(segments) && segments.length > 0
    && segments.length < record.serverPath.length && format.valueText(segments) === format.valueText(record.serverPath.slice(0, segments.length)));
}

function validInsertionSpacing(record) {
  const spacing = record.insertionSpacing;
  if (!spacing) return true;
  if (!Array.isArray(spacing.path) || typeof spacing.prefix !== "string" || typeof spacing.suffix !== "string") return false;
  if (!/^[\s,]*$/.test(spacing.prefix + spacing.suffix)) return false;
  return spacing.path.length > 0 && spacing.path.length <= record.serverPath.length
    && format.valueText(spacing.path) === format.valueText(record.serverPath.slice(0, spacing.path.length));
}

function planMcpConfiguration({ projectRoot, packageName, hosts = [], enabled = false, previous = {}, remove = false }) {
  if (!Array.isArray(hosts) || !format.object(previous)) throw new Error("MCP hosts/previous must be an array and a record object");
  const root = fs.realpathSync(path.resolve(projectRoot));
  const definition = mcpDefinition(packageName);
  if (!definition) return { layoutVersion: LAYOUT_VERSION, files: [], records: {}, diagnostics: [{ status: "not-provided" }], conflicts: [] };
  const desired = desiredTargets(root, definition, hosts, enabled && !remove);
  const paths = [...new Set([...desired.targets.keys(), ...Object.keys(previous)])];
  const files = paths.map(relative => filePlan(root, packageName, relative, desired.targets.get(relative), previous[relative], desired.blocked));
  return { layoutVersion: LAYOUT_VERSION, files, records: Object.fromEntries(files.filter(file => file.record).map(file => [file.path, file.record])),
    diagnostics: desired.diagnostics, conflicts: files.filter(file => file.action === "preserve").map(file => ({ path: file.path, reason: file.reason })) };
}

function importLegacyMcpRecords({ projectRoot, packageName, entries }) {
  const definition = mcpDefinition(packageName);
  if (!definition) return {};
  fs.realpathSync(path.resolve(projectRoot));
  return Object.fromEntries(entries.map(entry => {
    const container = Array.isArray(entry.container) ? entry.container : [entry.container || "mcpServers"];
    const serverKey = entry.serverKey || definition.serverKey;
    return [entry.path, { schemaVersion: 1, packageName, path: entry.path, format: "jsonc", serverKey, serverPath: [...container, serverKey],
      owned: entry.owned !== false, createdFile: entry.createdFile === true, valueHash: entry.valueHash, textHash: entry.textHash || null,
      hashAlgorithm: entry.algorithm || "sha256", valueSerialization: entry.valueSerialization || "json", textSerialization: entry.textSerialization || "raw", legacy: true }];
  }));
}

function launchMatches(actual, expected) {
  if (!format.object(actual)) return false;
  if (Object.hasOwn(actual, "url") || actual.experimental_environment === "remote") return false;
  const expectedType = expected.type || "stdio";
  if (actual.type !== undefined && actual.type !== expectedType) return false;
  return Object.keys(expected).every(key => {
    if (["env", "environment"].includes(key)) return format.object(actual[key]) && Object.keys(expected[key]).every(name => actual[key][name] === expected[key][name]);
    return format.valueText(actual[key], "stable") === format.valueText(expected[key], "stable");
  });
}

function runtimeState(root, definition) {
  const packageRoot = path.join(root, "node_modules", definition.packageName);
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    const physical = fs.realpathSync(packageRoot), entry = fs.realpathSync(path.join(packageRoot, definition.entry));
    if (metadata.name !== definition.packageName || !entry.startsWith(physical + path.sep) || !fs.statSync(entry).isFile()) return "identity-mismatch";
    return "present";
  } catch { return "missing"; }
}

function disabled(value, style) {
  if (["kiro", "roo"].includes(style)) return value?.disabled === true;
  if (style === "zcode") return value?.enable === false;
  return ["codex", "kilo"].includes(style) && value?.enabled === false;
}

function enableField(style) {
  if (["kiro", "roo"].includes(style)) return "disabled";
  if (style === "zcode") return "enable";
  return ["codex", "kilo"].includes(style) ? "enabled" : null;
}

function inspectMcpConfiguration({ projectRoot, packageName, host, previous = {} }) {
  const root = fs.realpathSync(path.resolve(projectRoot));
  const definition = mcpDefinition(packageName);
  const result = { contentsInspected: false, connection: "unverified", hostDiscovery: "unverified", files: [] };
  if (!definition) return { ...result, status: "not-provided" };
  try {
    const selected = hostTarget(root, host, definition);
    if (selected.status !== "supported") return { ...result, ...selected, files: selected.paths || [] };
    const { target, value } = selected;
    result.files = [target.path]; result.serverKey = definition.serverKey; result.format = target.format; result.source = target.source || "native";
    const text = readFile(root, target.path, packageName);
    if (text === null) return { ...result, status: "missing" };
    const current = format.inspectEntry(text, target);
    result.contentsInspected = true;
    const state = configuredEntryState(root, definition, target, current.value, value);
    const relocation = state.status === "different-launch" && managedRelocation(root, definition, target, current, previous[target.path]);
    return { ...result, ...(relocation || state) };
  } catch (error) { return { ...result, status: "invalid", reason: error.message }; }
}

function previousLaunchRoot(root, definition, target, current) {
  const environment = target.style === "kilo" ? current.value?.environment : current.value?.env;
  const previousRoot = environment?.WL_PROJECT_ROOT;
  if (typeof previousRoot !== "string" || !path.isAbsolute(previousRoot) || path.resolve(previousRoot) !== previousRoot || previousRoot === root) return null;
  const expectedOldEntry = entryValue(previousRoot, definition, target.style);
  return format.valueText(current.value, "stable") === format.valueText(expectedOldEntry, "stable") ? previousRoot : null;
}

function matchesOwnership(definition, target, current, record) {
  try {
    return record?.schemaVersion === 1 && validRecord(record, target.path, definition.packageName)
      && format.valueText(record.serverPath) === format.valueText(target.serverPath) && format.matchesRecord(current, record);
  } catch { return false; }
}

function managedRelocation(root, definition, target, current, record) {
  const previousRoot = previousLaunchRoot(root, definition, target, current);
  if (!previousRoot || !matchesOwnership(definition, target, current, record)) return null;
  return { status: "managed-project-relocated", runtime: runtimeState(root, definition),
    relocation: { previousProjectRoot: previousRoot, projectRoot: root } };
}

function configuredEntryState(root, definition, target, actual, value) {
  if (actual === undefined) return { status: "missing-server" };
  const field = enableField(target.style);
  if (field && Object.hasOwn(Object(actual), field) && typeof actual[field] !== "boolean") return { status: "invalid", reason: `MCP ${field} must be a boolean` };
  if (disabled(actual, target.style)) return { status: "disabled" };
  const expected = Object.fromEntries(Object.entries(value).filter(([key]) => !["enable", "enabled", "disabled"].includes(key)));
  if (!launchMatches(actual, expected)) return { status: "different-launch" };
  const runtime = runtimeState(root, definition);
  return { status: runtime === "present" ? "configured" : "runtime-missing", runtime };
}

function describeMcpIntegration(packageName) {
  const definition = mcpDefinition(packageName);
  if (!definition) return { schemaVersion: 1, status: "not-provided", transport: null, hosts: [], connection: "not-applicable" };
  const hosts = hostProfiles.map(host => {
    const profile = resolveHostProfile(host, packageName), layout = profile.mcpLayout;
    return { hostId: profile.hostId, status: layout ? "supported-project" : "unsupported-manual", layout };
  });
  return { schemaVersion: 1, status: "provided", ...definition, transport: "stdio", command: "node",
    entryBase: "project-local-package", projectRootEnvironment: "WL_PROJECT_ROOT", layoutVersion: LAYOUT_VERSION, hosts,
    configurationDiagnostics: "protocol request: doctor-host", connection: "unverified-until-initialize-and-tools-list",
    hostDiscovery: "unverified-without-host-events", ownership: "package-server-contribution-only" };
}

module.exports = { planMcpConfiguration, importLegacyMcpRecords, inspectMcpConfiguration, describeMcpIntegration, mcpDefinition, LAYOUT_VERSION };

"use strict";

// Package-specific lifecycle glue. Native formats and ownership live in the shared planner.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const jsonc = require("./shared-jsonc.cjs");
const planner = () => require("./mcp-config.cjs");
const packageName = require("../package.json").name;
const CONTAINERS = { ".mcp.json": "mcpServers", ".cursor/mcp.json": "mcpServers", ".kiro/settings/mcp.json": "mcpServers", ".vscode/mcp.json": "servers", ".kilo/kilo.jsonc": "mcp", "kilo.jsonc": "mcp", "kilo.json": "mcp" };
const hash = (text) => crypto.createHash("md5").update(text).digest("hex");

function legacyUnit(unit, rel) {
  return unit.path?.length === 2 && unit.path[0] === CONTAINERS[rel] && unit.path[1] === "wl-skills";
}

function wholeFileLegacyEntry(projectRoot, manifest, rel) {
  const full = path.join(projectRoot, rel);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  const content = fs.readFileSync(full, "utf8");
  if (hash(content) !== manifest.files[rel]) return null;
  try {
    const node = [CONTAINERS[rel], "wl-skills"];
    const value = jsonc.getJsoncValue(content, node);
    if (value === undefined) return null;
    return { path: rel, container: CONTAINERS[rel], serverKey: "wl-skills", valueHash: hash(JSON.stringify(value)), textHash: hash(jsonc.getJsoncNodeText(content, node)), algorithm: "md5" };
  } catch { return null; }
}

function legacyEntry(projectRoot, manifest, rel) {
  if (!CONTAINERS[rel] || manifest.managedMcp?.records?.[rel]) return null;
  const owned = manifest.managedJson?.[rel];
  const unit = owned?.units?.find((item) => legacyUnit(item, rel));
  if (unit) return { path: rel, container: CONTAINERS[rel], serverKey: "wl-skills", valueHash: unit.installedHash, textHash: unit.installedTextHash, textSerialization: "json", algorithm: "md5" };
  return owned ? null : wholeFileLegacyEntry(projectRoot, manifest, rel);
}

function legacyEntries(projectRoot, manifest) {
  const entries = [];
  for (const rel of Object.keys(manifest.files || {})) {
    const entry = legacyEntry(projectRoot, manifest, rel);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Move proven legacy server ownership, leaving unrelated JSON units/instructions intact. */
function prepareMcpManifest(projectRoot, manifest) {
  if (!manifest) return manifest;
  const entries = legacyEntries(projectRoot, manifest);
  const imported = planner().importLegacyMcpRecords({ projectRoot, packageName, entries });
  manifest.managedMcp = { layoutVersion: 1, records: { ...imported, ...manifest.managedMcp?.records } };
  manifest.managedJson = { ...manifest.managedJson };
  for (const entry of entries) {
    const owned = manifest.managedJson[entry.path];
    if (!owned) continue;
    const remaining = { ...owned, units: (owned.units || []).filter((unit) => !legacyUnit(unit, entry.path)) };
    if (remaining.units.length || remaining.instructions?.length) manifest.managedJson[entry.path] = remaining;
    else delete manifest.managedJson[entry.path];
  }
  return manifest;
}

function planMcpInstall(projectRoot, policy, manifest, remove = false) {
  return planner().planMcpConfiguration({ projectRoot, packageName, hosts: policy.hosts || [], enabled: policy.mcp === true,
    previous: manifest?.managedMcp?.records || {}, remove });
}

function mcpMessages(plan) {
  return [...plan.diagnostics, ...plan.conflicts].map((item) => item.message || item.reason || JSON.stringify(item));
}

function writeMcpFile(item, { projectRoot, dryRun, write, remove }) {
  if (dryRun) console.log(`  [MCP ${item.action}] ${item.path}${item.reason ? `：${item.reason}` : ""}`);
  else if (item.action === "write") write(path.join(projectRoot, item.path), item.content);
  else if (item.action === "remove") remove(path.join(projectRoot, item.path));
  else if (item.action === "preserve") console.warn(`  保留 ${item.path}：${item.reason || "本地修改或所有权不明"}`);
}

function recordMcpFile(item, manifest) {
  if (item.record) {
    const content = item.content ?? item.before;
    if (content !== null) manifest.files[item.path] = hash(content);
  } else if (!manifest.managedJson?.[item.path] && !manifest.managedBlocks?.[item.path]) delete manifest.files[item.path];
}

function applyMcpInstall(plan, options) {
  const { manifest, onAction = () => {} } = options;
  manifest.managedMcp = { layoutVersion: plan.layoutVersion, records: plan.records };
  for (const item of plan.files) {
    writeMcpFile(item, options);
    recordMcpFile(item, manifest);
    onAction(item);
  }
  for (const message of mcpMessages(plan)) console.warn(`  [MCP] ${message}`);
}

function inspectMcpInstall(projectRoot, host) {
  return planner().inspectMcpConfiguration({ projectRoot, packageName, host });
}

module.exports = { prepareMcpManifest, planMcpInstall, applyMcpInstall, mcpMessages, inspectMcpInstall };

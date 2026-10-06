"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharedJsonc = require("./shared-jsonc.cjs");
const sharedArray = require("./shared-jsonc-array.cjs");

const SHARED_PROJECT_CONFIG_KEYS = new Map([
  [".mcp.json", "mcpServers"],
  [".cursor/mcp.json", "mcpServers"],
  [".kiro/settings/mcp.json", "mcpServers"],
  [".vscode/mcp.json", "servers"],
  [".kilo/kilo.jsonc", "mcp"],
]);
const KILO_SOURCE_PATH = ".kilo/kilo.jsonc";
const KILO_ROOT_CANDIDATES = ["kilo.jsonc", "kilo.json"];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonc(text, label) {
  try { return sharedJsonc.parseJsonc(text, label); }
  catch (error) { throw new Error(`${label} 不是有效 JSON/JSONC：${error.message}`); }
}

function configSection(config, key, label) {
  const value = config[key];
  if (value === undefined) return {};
  if (!isObject(value)) throw new Error(`${label}#${key} 必须是 object`);
  return value;
}

function setJsoncValue(text, pathSegments, value) {
  return sharedJsonc.setJsoncValue(text, pathSegments, value);
}

function mergeUniqueStrings(targetItems, sourceItems, label) {
  if (targetItems !== undefined && !Array.isArray(targetItems)) {
    throw new Error(`${label}#instructions 必须是 string[]`);
  }
  if (sourceItems !== undefined && !Array.isArray(sourceItems)) {
    throw new Error(`${label}#instructions 必须是 string[]`);
  }
  const items = [...(targetItems || []), ...(sourceItems || [])];
  if (items.some((item) => typeof item !== "string")) {
    throw new Error(`${label}#instructions 必须是 string[]`);
  }
  return [...new Set(items)];
}

function resolveSharedProjectConfigTarget(projectRoot, sourceRelPath) {
  if (sourceRelPath !== KILO_SOURCE_PATH) return sourceRelPath;
  const existingRootConfig = KILO_ROOT_CANDIDATES.find((candidate) =>
    fs.existsSync(path.join(projectRoot, candidate)),
  );
  return existingRootConfig || sourceRelPath;
}

function isSharedProjectConfigSource(relPath) {
  return SHARED_PROJECT_CONFIG_KEYS.has(relPath);
}

function isSharedProjectConfig(relPath) {
  return isSharedProjectConfigSource(relPath) || KILO_ROOT_CANDIDATES.includes(relPath);
}

function desiredSharedProjectConfig(sourceRelPath, sourcePath, targetPath) {
  const sourceText = fs.readFileSync(sourcePath, "utf8");
  const source = parseJsonc(sourceText, sourceRelPath);
  if (!fs.existsSync(targetPath)) return `${JSON.stringify(source, null, 2)}\n`;

  const targetLabel = path.basename(targetPath);
  let targetText = fs.readFileSync(targetPath, "utf8");
  let target = parseJsonc(targetText, targetLabel);
  const mergeKey = SHARED_PROJECT_CONFIG_KEYS.get(sourceRelPath);
  const sourceSection = configSection(source, mergeKey, sourceRelPath);
  configSection(target, mergeKey, targetLabel);

  for (const [key, value] of Object.entries(source)) {
    if (key === mergeKey || (sourceRelPath === KILO_SOURCE_PATH && key === "instructions")) {
      continue;
    }
    if (target[key] === undefined) {
      targetText = setJsoncValue(targetText, [key], value);
      target = parseJsonc(targetText, targetLabel);
    }
  }

  for (const [name, value] of Object.entries(sourceSection)) {
    targetText = setJsoncValue(targetText, [mergeKey, name], value);
  }
  target = parseJsonc(targetText, targetLabel);

  if (sourceRelPath === KILO_SOURCE_PATH) {
    const instructions = mergeUniqueStrings(
      target.instructions,
      source.instructions,
      targetLabel,
    );
    targetText = setJsoncValue(targetText, ["instructions"], instructions);
  }

  return targetText.endsWith("\n") ? targetText : `${targetText}\n`;
}

function valueHash(value) {
  return crypto.createHash("md5").update(JSON.stringify(value)).digest("hex");
}

/** Track JSON pointers, never ownership of a shared file or another server. */
function unitHasLocalChanges(content, unit, current) {
  if (valueHash(current) !== unit.installedHash) return true;
  const raw = sharedJsonc.getJsoncNodeText(content, unit.path);
  if (unit.installedTextHash) return valueHash(raw) !== unit.installedTextHash;
  return /\/\/|\/\*/.test(raw.replace(/"(?:\\.|[^"\\])*"/g, ""));
}

function planInstructions(sourceRelPath, source, target, content, previous) {
  if (sourceRelPath !== KILO_SOURCE_PATH) return { content, instructions: [] };
  mergeUniqueStrings(target.instructions, source.instructions, sourceRelPath);
  const added = [...new Set(source.instructions || [])].filter((item) => !(target.instructions || []).includes(item));
  const instructions = [...new Set([...(previous.instructions || []), ...added])];
  const instructionsCreated = previous.instructionsCreated || (target.instructions === undefined && added.length > 0);
  return { content: sharedArray.appendStrings(content, ["instructions"], added), instructions, instructionsCreated };
}

function planManagedSharedConfig(sourceRelPath, sourcePath, targetPath, previous = {}) {
  const source = sharedJsonc.parseJsonc(fs.readFileSync(sourcePath, "utf8"));
  let content = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "{}\n";
  const target = sharedJsonc.parseJsonc(content);
  const section = SHARED_PROJECT_CONFIG_KEYS.get(sourceRelPath);
  const units = [];
  const references = [];
  const candidates = Object.entries(source).filter(([key]) => key !== section && key !== "instructions")
    .map(([key, value]) => ({ path: [key], value }));
  candidates.push(...Object.entries(configSection(source, section, sourceRelPath)).map(([name, value]) => ({ path: [section, name], value })));
  for (const candidate of candidates) {
    const current = sharedJsonc.getJsoncValue(content, candidate.path);
    const old = previous.units?.find((unit) => JSON.stringify(unit.path) === JSON.stringify(candidate.path));
    if (current !== undefined && (!old || unitHasLocalChanges(content, old, current))) {
      if (old) units.push(old);
      references.push(candidate.path.join("/"));
      continue;
    }
    content = sharedJsonc.setJsoncValue(content, candidate.path, candidate.value);
    units.push({ path: candidate.path, installedHash: valueHash(candidate.value), installedTextHash: valueHash(sharedJsonc.getJsoncNodeText(content, candidate.path)) });
  }
  const instructionPlan = planInstructions(sourceRelPath, source, target, content, previous);
  ({ content } = instructionPlan);
  const { instructions, instructionsCreated } = instructionPlan;
  return { content, ownership: { units, instructions, instructionsCreated }, references };
}

function removeInstructions(text, ownership) {
  const current = sharedJsonc.getJsoncValue(text, ["instructions"]);
  if (current === undefined) return { content: text, retained: [] };
  if (!Array.isArray(current)) return { content: text, retained: ownership.instructions };
  const removed = sharedArray.removeStrings(text, ["instructions"], ownership.instructions);
  const remaining = sharedJsonc.getJsoncValue(removed.content, ["instructions"]);
  const raw = sharedJsonc.getJsoncNodeText(removed.content, ["instructions"]);
  if (remaining.length || !ownership.instructionsCreated || /\/\/|\/\*/.test(raw)) return removed;
  return { ...removed, content: sharedJsonc.setJsoncValue(removed.content, ["instructions"], undefined) };
}

function removeManagedSharedConfig(content, ownership) {
  let text = content;
  const retained = { units: [], instructions: [] };
  for (const unit of ownership.units || []) {
    const current = sharedJsonc.getJsoncValue(text, unit.path);
    if (current === undefined) continue;
    if (unitHasLocalChanges(text, unit, current)) {
      retained.units.push(unit);
      continue;
    }
    text = sharedJsonc.setJsoncValue(text, unit.path, undefined);
  }
  if (ownership.instructions?.length) {
    const removed = removeInstructions(text, ownership);
    text = removed.content;
    retained.instructions = removed.retained;
    retained.instructionsCreated = ownership.instructionsCreated;
  }
  return { content: text, ownership: retained };
}

module.exports = {
  KILO_ROOT_CANDIDATES,
  KILO_SOURCE_PATH,
  SHARED_PROJECT_CONFIG_KEYS,
  desiredSharedProjectConfig,
  planManagedSharedConfig,
  removeManagedSharedConfig,
  isSharedProjectConfig,
  isSharedProjectConfigSource,
  resolveSharedProjectConfigTarget,
};

"use strict";

/**
 * Blueprint 本地索引、检索与差异比较。
 * 默认只返回摘要；完整蓝图必须显式 includeBlueprint，控制 MCP 上下文体积。
 */

const fs = require("fs");
const path = require("path");
const {
  readPageBlueprint,
  summarizeBlueprint,
  validatePageBlueprint,
} = require("./page-blueprint");

const DEFAULT_BLUEPRINT_ROOT = ".wl-skills/templates/blueprints";

function normalize(value) {
  return String(value || "").replace(/\\/g, "/");
}

function safeResolve(root, input) {
  const projectRoot = path.resolve(root || process.cwd());
  const full = path.resolve(projectRoot, input || DEFAULT_BLUEPRINT_ROOT);
  if (full !== projectRoot && !full.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error("路径越界：只能读取项目根目录内的 Blueprint");
  }
  return full;
}

function walkBlueprintFiles(root, scanPath) {
  const start = safeResolve(root, scanPath || DEFAULT_BLUEPRINT_ROOT);
  if (!fs.existsSync(start)) return [];
  const result = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) result.push(full);
    }
  };
  walk(start);
  return result.sort();
}

function readBlueprintEntry(root, filePath) {
  const relative = normalize(path.relative(root, filePath));
  try {
    const blueprint = readPageBlueprint(root, relative);
    const errors = validatePageBlueprint(blueprint);
    return {
      ok: errors.length === 0,
      path: relative,
      errors,
      blueprint,
      summary: summarizeBlueprint(blueprint),
    };
  } catch (error) {
    return {
      ok: false,
      path: relative,
      errors: [error instanceof Error ? error.message : String(error)],
      blueprint: null,
      summary: null,
    };
  }
}

function searchableText(entry) {
  const blueprint = entry.blueprint || {};
  const shape = blueprint.shape || {};
  const capabilities = Array.isArray(shape.components)
    ? shape.components.map((item) => item.capability).join(" ")
    : "";
  return [blueprint.domain, blueprint.scene, shape.mode, capabilities].join(" ").toLowerCase();
}

function matchEntry(entry, options) {
  return entry.ok && [
    matchDomain(entry, options), matchScene(entry, options), matchMode(entry, options),
    matchComponent(entry, options), matchQuality(entry, options), matchQuery(entry, options),
  ].every(Boolean);
}

function matchDomain(entry, options) { return !options.domain || entry.blueprint.domain === String(options.domain).toLowerCase(); }
function matchScene(entry, options) { return !options.scene || entry.blueprint.scene === String(options.scene).toLowerCase(); }
function matchMode(entry, options) { return !options.mode || String(entry.blueprint.shape?.mode).toLowerCase() === String(options.mode).toLowerCase(); }
function matchComponent(entry, options) { return !options.component || (entry.blueprint.shape?.components || []).some((item) => item.capability === String(options.component).toLowerCase()); }
function matchQuality(entry, options) { return !Number.isFinite(Number(options.minQuality)) || (entry.blueprint.quality?.score || 0) >= Number(options.minQuality); }
function matchQuery(entry, options) { return !options.query || searchableText(entry).includes(String(options.query).toLowerCase()); }

function scoreEntry(entry, options) {
  if (!options.query) return 0;
  const query = String(options.query).toLowerCase();
  const { blueprint } = entry;
  let score = searchableText(entry).includes(query) ? 1 : 0;
  if (blueprint.domain === query) score += 4;
  if (blueprint.scene === query) score += 4;
  if (String(blueprint.shape?.mode || "").toLowerCase() === query) score += 3;
  return score;
}

function compactEntry(entry, includeBlueprint) {
  const value = {
    path: entry.path,
    blueprintId: entry.blueprint.blueprintId,
    fingerprint: entry.blueprint.fingerprint,
    summary: entry.summary,
  };
  if (includeBlueprint) value.blueprint = entry.blueprint;
  return value;
}

function searchBlueprints(rootInput, options = {}) {
  const root = path.resolve(rootInput || process.cwd());
  const files = walkBlueprintFiles(root, options.scanPath);
  const invalid = [];
  const entries = files.map((filePath) => readBlueprintEntry(root, filePath));
  const matched = entries
    .filter((entry) => {
      if (!entry.ok) invalid.push({ path: entry.path, errors: entry.errors });
      return matchEntry(entry, options);
    })
    .sort((left, right) => scoreEntry(right, options) - scoreEntry(left, options) || left.path.localeCompare(right.path));
  const limit = Math.max(1, Math.min(Number(options.limit) || 20, 100));
  const selected = matched.slice(0, limit);
  return {
    schemaVersion: 1,
    kind: "wl-blueprint-search",
    query: {
      domain: options.domain || null,
      scene: options.scene || null,
      mode: options.mode || null,
      component: options.component || null,
      query: options.query || null,
      minQuality: Number.isFinite(Number(options.minQuality)) ? Number(options.minQuality) : null,
    },
    total: matched.length,
    returned: selected.length,
    truncated: matched.length > selected.length,
    invalid,
    items: selected.map((entry) => compactEntry(entry, options.includeBlueprint === true)),
  };
}

function flatten(value, prefix = "", result = {}) {
  if (Array.isArray(value)) return flattenArray(value, prefix, result);
  if (value && typeof value === "object") return flattenObject(value, prefix, result);
  result[prefix] = value;
  return result;
}

function flattenArray(value, prefix, result) {
  value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, result));
  if (value.length === 0) result[prefix] = [];
  return result;
}

function flattenObject(value, prefix, result) {
  for (const [key, child] of Object.entries(value)) {
    if (["source", "fingerprint", "quality"].includes(key)) continue;
    flatten(child, prefix ? `${prefix}.${key}` : key, result);
  }
  if (Object.keys(value).length === 0) result[prefix] = {};
  return result;
}

function compareBlueprints(left, right) {
  const leftFlat = flatten(left);
  const rightFlat = flatten(right);
  const keys = [...new Set([...Object.keys(leftFlat), ...Object.keys(rightFlat)])].sort();
  const changes = keys
    .filter((key) => JSON.stringify(leftFlat[key]) !== JSON.stringify(rightFlat[key]))
    .map((pathName) => ({ path: pathName, left: leftFlat[pathName], right: rightFlat[pathName] }));
  return {
    schemaVersion: 1,
    kind: "wl-blueprint-diff",
    equal: changes.length === 0,
    changedCount: changes.length,
    changes,
    left: summarizeBlueprint(left),
    right: summarizeBlueprint(right),
  };
}

function diffBlueprintFiles(rootInput, leftPath, rightPath) {
  const root = path.resolve(rootInput || process.cwd());
  const left = readPageBlueprint(root, normalize(path.relative(root, safeResolve(root, leftPath))));
  const right = readPageBlueprint(root, normalize(path.relative(root, safeResolve(root, rightPath))));
  const errors = [...validatePageBlueprint(left), ...validatePageBlueprint(right)];
  if (errors.length) throw new Error(`蓝图校验失败：${errors.join("；")}`);
  return compareBlueprints(left, right);
}

module.exports = {
  DEFAULT_BLUEPRINT_ROOT,
  searchBlueprints,
  compareBlueprints,
  diffBlueprintFiles,
};

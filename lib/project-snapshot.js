"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { buildPageBlueprint, summarizeBlueprint } = require("./page-blueprint");
const { resolveProjectPath } = require("./project-path");

const SNAPSHOT_SCHEMA_VERSION = 1;

function normalize(value) {
  return String(value || "").replace(/\\/g, "/");
}

function safeRoot(root) {
  return path.resolve(root || process.cwd());
}

function walkPageFiles(root, scanPath) {
  const start = resolveProjectPath(root, scanPath || "src/views", { allowRoot: true });
  if (!fs.existsSync(start)) return [];
  const result = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist", "demo", "template"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "index.vue") result.push(normalize(path.relative(root, path.dirname(full))));
    }
  };
  walk(start);
  return result.sort();
}

function pageInventory(root, pagePath) {
  const dir = resolveProjectPath(root, pagePath);
  const files = {};
  const contents = {};
  for (const name of ["index.vue", "data.ts", "index.scss", "api.md", "page-spec.json"]) {
    const filePath = resolveProjectPath(root, path.join(dir, name));
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath);
    files[name] = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
    contents[name] = content.toString("utf8");
  }
  const blueprint = buildPageBlueprint(root, pagePath, { sourceFiles: {
    indexVue: contents["index.vue"] || "",
    dataTs: contents["data.ts"] || "",
    apiMd: contents["api.md"] || "",
    pageSpec: contents["page-spec.json"] || "",
  } });
  if (blueprint.quality?.warnings?.some((warning) => /解析失败/.test(warning))) {
    throw new Error(blueprint.quality.warnings.join("；"));
  }
  return {
    path: pagePath,
    files,
    summary: summarizeBlueprint(blueprint),
    blueprintFingerprint: blueprint.fingerprint,
  };
}

function buildProjectSnapshot(rootInput, options = {}) {
  const root = safeRoot(rootInput);
  const pagePaths = walkPageFiles(root, options.scanPath);
  const limit = Math.max(1, Math.min(Number(options.limit) || 40, 1000));
  const selected = pagePaths.slice(0, limit);
  const errors = [];
  const pages = selected.map((pagePath) => {
    try {
      return { ok: true, ...pageInventory(root, pagePath) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ path: pagePath, error: message });
      // 快照是项目级感知入口；单页损坏不应阻断其他页面的摘要。
      return { ok: false, path: pagePath, error: message };
    }
  });
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: "wl-project-snapshot",
    scanPath: normalize(options.scanPath || "src/views"),
    truncated: pagePaths.length > selected.length,
    pageCount: pagePaths.length,
    returnedCount: pages.length,
    failedCount: errors.length,
    errors,
    pages,
  };
  snapshot.fingerprint = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  return snapshot;
}

module.exports = { SNAPSHOT_SCHEMA_VERSION, buildProjectSnapshot };

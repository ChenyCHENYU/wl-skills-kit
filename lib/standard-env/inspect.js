"use strict";

const fs = require("fs");
const path = require("path");

const LEGACY_ENV_FILES = [
  ".env.dev",
  ".env.sit",
  ".env.uat",
  ".env.pre",
  ".env.prod",
  ".env.prd",
];

const STANDARD_CONFIG_FILES = [
  "vite/config/app.ts",
  "vite/config/base.ts",
  "vite/config/build.ts",
  "vite/config/context.ts",
  "vite/config/environments.ts",
  "vite/config/plugins.ts",
  "vite/config/server.ts",
];

const KNOWN_PROXY_PREFIXES = new Set([
  "/assets",
  "/assets/",
  "/anyrt",
  "/sub",
  "/sub/public",
  "/sub/systemApp",
  "/sub/ag-grid",
  "/node-server",
]);

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function readText(root, rel) {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

function readJson(root, rel) {
  const text = readText(root, rel);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseEnv(content) {
  const values = {};
  for (const line of String(content || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function collectEnvironmentValues(root, envFiles) {
  const values = {};
  for (const rel of envFiles) Object.assign(values, parseEnv(readText(root, rel)));
  return values;
}

function collectModuleCandidates(root, pkg, runtimeJson, viteContent) {
  const candidates = [];
  const seen = new Set();
  const add = (source, value) => {
    const normalized = String(value || "").trim();
    const identity = `${source}:${normalized}`;
    if (!normalized || seen.has(identity)) return;
    seen.add(identity);
    candidates.push({ source, value: normalized });
  };

  const folder = path.basename(root).replace(/^wl-ui-/, "");
  if (folder && folder !== path.basename(root)) add("project-folder", folder);

  const scripts = Object.values(pkg?.scripts || {}).join("\n");
  for (const match of scripts.matchAll(/--module=([A-Za-z0-9_-]+)/g)) {
    add("package-scripts", match[1]);
  }

  add("runtime-json", runtimeJson?.OPTION?.module);

  const appMatch = viteContent.match(/moduleName\s*:\s*["']([^"']+)["']/);
  add("app-config", appMatch?.[1]);

  const viewsRoot = path.join(root, "src", "views");
  if (fs.existsSync(viewsRoot)) {
    const viewDirs = fs
      .readdirSync(viewsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name);
    if (viewDirs.length === 1) add("views-root", viewDirs[0]);
  }

  const counts = new Map();
  for (const candidate of candidates) {
    counts.set(candidate.value, (counts.get(candidate.value) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const resolved = ranked[0]?.[0] || "";
  return {
    candidates,
    resolved,
    conflict: ranked.length > 1,
    values: ranked.map(([value, count]) => ({ value, count })),
  };
}

function extractMap(content, name) {
  const block = content.match(
    new RegExp(`const\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\};`, "m"),
  );
  if (!block) return {};
  const values = {};
  for (const match of block[1].matchAll(
    /(?:["']?)(dev|sit|uat|pre|prod|prd)(?:["']?)\s*:\s*["']([^"']+)["']/g,
  )) {
    values[match[1]] = match[2];
  }
  return values;
}

function extractBaseApiProxy(content) {
  const block = content.match(
    /\[\s*baseApi\s*\]\s*:\s*\{([\s\S]*?)\}/m,
  );
  if (!block) return null;
  const target = block[1].match(/target\s*:\s*["']([^"']+)["']/)?.[1] || "";
  const rewrite = block[1].match(/rewrite\s*:\s*\([^)]*\)\s*=>\s*([^\n]+)/)?.[1]?.trim() || "";
  return { target, rewrite };
}

function extractExtraProxies(content) {
  const proxies = [];
  const blockPattern =
    /\[\s*["'](\/[^"']+)["']\s*\]\s*:\s*\{([\s\S]*?)(?:\n\s*\},|\n\s*\})/g;
  for (const match of content.matchAll(blockPattern)) {
    const prefix = match[1];
    if (KNOWN_PROXY_PREFIXES.has(prefix)) continue;
    const target = match[2].match(/target\s*:\s*["']([^"']+)["']/)?.[1];
    if (!target) continue;
    const rewriteMatch = match[2].match(
      /replace\(\/\^\\\/[^/]+\/\s*,\s*["']([^"']*)["']\)/,
    );
    proxies.push({
      prefix,
      target,
      rewritePrefix: rewriteMatch ? rewriteMatch[1] : prefix,
    });
  }
  return proxies;
}

function extractAliases(content) {
  const aliases = [];
  const pattern =
    /find\s*:\s*["']([^"']+)["'][\s\S]*?replacement\s*:\s*path\.resolve\([^,]+,\s*["']\.\/(src\/[^"']+)["']\s*\)/g;
  for (const match of content.matchAll(pattern)) {
    if (match[1] !== "@") aliases.push({ find: match[1], replacement: match[2] });
  }
  return aliases;
}

function extractOptimizedDependencies(content) {
  const block = content.match(/optimizeDeps\s*:\s*\{[\s\S]*?include\s*:\s*\[([\s\S]*?)\]/m);
  if (!block) return [];
  return [...block[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function extractLegacyEndpoints(viteContent, envValues, runtimeJson) {
  const values = new Set();
  const sources = [viteContent, JSON.stringify(envValues), JSON.stringify(runtimeJson || {})];
  for (const source of sources) {
    for (const match of String(source).matchAll(/https?:\/\/[^\s"'`,)\\]+/g)) {
      values.add(match[0].replace(/[}\]]+$/, ""));
    }
  }
  return [...values].sort();
}

function isStandardProject(root, viteContent, envFiles) {
  const modularRoot = /\.\/vite\/config\/(?:context|base)/.test(viteContent);
  const allModules = STANDARD_CONFIG_FILES.every((rel) => exists(root, rel));
  const noLegacyEnv = envFiles.every((rel) => rel === ".env" || rel === ".env.local");
  return modularRoot && allModules && noLegacyEnv && !exists(root, "public/env-dev.json");
}

function inspectProject(rootInput) {
  const root = path.resolve(rootInput || process.cwd());
  const pkg = readJson(root, "package.json") || {};
  const viteRel = ["vite.config.ts", "vite.config.js", "vite.config.mjs"].find((rel) =>
    exists(root, rel),
  );
  const viteContent = viteRel ? readText(root, viteRel) : "";
  const runtimeJson = readJson(root, "public/env-dev.json");
  const envFiles = [".env", ...LEGACY_ENV_FILES, ".env.local"].filter((rel) =>
    exists(root, rel),
  );
  const envValues = collectEnvironmentValues(
    root,
    envFiles.filter((rel) => rel !== ".env.local"),
  );
  const module = collectModuleCandidates(root, pkg, runtimeJson, viteContent);
  const webMap = extractMap(viteContent, "webMap");
  const webApiMap = extractMap(viteContent, "webApiMap");
  const baseApiProxy = extractBaseApiProxy(viteContent);
  const legacyMap = Object.keys(webMap).length > 0 || Object.keys(webApiMap).length > 0;
  const directBackend = Boolean(
    baseApiProxy?.target &&
      (/replace\([^,]+,\s*["']["']\)/.test(baseApiProxy.rewrite) ||
        /:9000\b/.test(baseApiProxy.target)),
  );
  const standard = isStandardProject(root, viteContent, envFiles);
  const shape = standard
    ? "standard"
    : legacyMap && directBackend
      ? "legacy-direct"
      : legacyMap
        ? "legacy-gateway"
        : viteContent
          ? "custom"
          : "unsupported";

  return {
    root,
    packageJson: pkg,
    viteRel,
    viteContent,
    runtimeJson,
    envFiles,
    envValues,
    module,
    webMap,
    webApiMap,
    baseApiProxy,
    extraProxies: extractExtraProxies(viteContent),
    aliases: extractAliases(viteContent),
    optimizedDependencies: extractOptimizedDependencies(viteContent),
    endpoints: extractLegacyEndpoints(viteContent, envValues, runtimeJson),
    standard,
    shape,
  };
}

module.exports = {
  LEGACY_ENV_FILES,
  STANDARD_CONFIG_FILES,
  inspectProject,
  parseEnv,
  _internal: {
    extractAliases,
    extractBaseApiProxy,
    extractExtraProxies,
    extractMap,
    extractOptimizedDependencies,
  },
};

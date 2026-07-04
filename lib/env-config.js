"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_PROFILE = "walsin";
const REPORT_PREFIX = "ENV_CONFIG";

const PROFILE_PRESETS = {
  walsin: {
    name: "walsin",
    title: "华新标准五套环境",
    envs: {
      dev: {
        env: "dev",
        host: "https://ytiop-sit.walsin.com.cn:8443",
        apiPrefix: "sit-api",
      },
      sit: {
        env: "sit",
        host: "https://ytiop-sit.walsin.com.cn:8443",
        apiPrefix: "sit-api",
      },
      uat: {
        env: "uat",
        host: "https://ytiop-uat.walsin.com.cn:8443",
        apiPrefix: "uat-api",
      },
      pre: {
        env: "pre",
        host: "https://ytiop-pre.walsin.com.cn:8443",
        apiPrefix: "pre-api",
      },
      prod: {
        env: "prod",
        host: "https://ytiop-prd.walsin.com.cn:8443",
        apiPrefix: "prod-api",
      },
    },
  },
};

const ROOT_ENV_FILES = [
  ".env",
  ".env.dev",
  ".env.sit",
  ".env.uat",
  ".env.pre",
  ".env.prod",
  ".env.prd",
];

const ENV_DIR_FILES = [
  "env/.env",
  "env/.env.development",
  "env/.env.sit",
  "env/.env.uat",
  "env/.env.pre",
  "env/.env.production",
];

const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.js", "vite.config.mjs"];
const PROFILE_ENV_KEYS = ["dev", "sit", "uat", "pre", "prod"];

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".github",
  ".wl-snapshot",
  ".wl-skills",
]);

function resolveProjectRoot(root) {
  return path.resolve(root || process.env.WL_PROJECT_ROOT || process.cwd());
}

function toPosix(rel) {
  return rel.replace(/\\/g, "/");
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function readTextIfExists(root, rel) {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

function readJsonIfExists(root, rel) {
  const raw = readTextIfExists(root, rel);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function objectOrEmpty(value) {
  return value && typeof value === "object" ? value : {};
}

function profileAliasValue(values, key) {
  return values[key] || (key === "prod" ? values.prd : "");
}

function buildProfileEnvOverrides(input, presetEnv) {
  const baseUrls = objectOrEmpty(input.baseUrls);
  const proxyPrefixes = objectOrEmpty(input.proxyPrefixes);
  const normalizedEnvOverrides = {};
  for (const key of PROFILE_ENV_KEYS) {
    const host = profileAliasValue(baseUrls, key);
    const apiPrefix = profileAliasValue(proxyPrefixes, key);
    if (host || apiPrefix) {
      normalizedEnvOverrides[key] = {
        env: key,
        host: host || presetEnv[key].host,
        apiPrefix: apiPrefix || presetEnv[key].apiPrefix,
      };
    }
  }
  return normalizedEnvOverrides;
}

function normalizeProfile(input) {
  if (!input) return PROFILE_PRESETS[DEFAULT_PROFILE];
  if (typeof input === "string") {
    return PROFILE_PRESETS[input] || PROFILE_PRESETS[DEFAULT_PROFILE];
  }
  const envs = objectOrEmpty(input.envs);
  const presetEnv = PROFILE_PRESETS[DEFAULT_PROFILE].envs;
  return {
    name: input.name || input.appName || "custom",
    title: input.title || "自定义环境",
    envs: {
      ...presetEnv,
      ...buildProfileEnvOverrides(input, presetEnv),
      ...envs,
    },
  };
}

function loadProfileFile(filePath) {
  if (!filePath) return null;
  const full = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function resolveProfile(options = {}) {
  if (options.profileData) return normalizeProfile(options.profileData);
  if (options.profileFile) return normalizeProfile(loadProfileFile(options.profileFile));
  return normalizeProfile(options.profile || DEFAULT_PROFILE);
}

function projectDeps(root) {
  const pkg = readJsonIfExists(root, "package.json") || {};
  return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
}

function hasUniDeps(deps) {
  return Boolean(deps["@dcloudio/uni-app"] || deps["@dcloudio/vite-plugin-uni"]);
}

function readViteConfig(root) {
  const files = ["vite.config.ts", "vite.config.js", "vite.config.mjs"];
  const content = files.map((rel) => readTextIfExists(root, rel)).find(Boolean);
  return content || "";
}

function detection(type, context, reason) {
  return {
    type,
    ...context,
    reason,
  };
}

function hasEnvDirSignal(context, hasEnvDirConfig) {
  return [context.hasUni, context.hasEnvDir, hasEnvDirConfig].some(Boolean);
}

function isExplicitProjectType(requestedType) {
  return Boolean(requestedType && requestedType !== "auto");
}

function detectProject(root, requestedType = "auto") {
  const deps = projectDeps(root);
  const context = {
    hasUni: hasUniDeps(deps),
    hasEnvDir: ENV_DIR_FILES.some((rel) => exists(root, rel)),
    hasRootEnv: ROOT_ENV_FILES.some((rel) => exists(root, rel)),
  };
  const hasEnvDirConfig = /envDir\s*:|loadEnv\([^)]*['"]env['"]/.test(
    readViteConfig(root),
  );

  if (isExplicitProjectType(requestedType)) {
    return detection(requestedType, context, "用户指定 projectType");
  }
  if (hasEnvDirSignal(context, hasEnvDirConfig)) {
    const reason = context.hasUni ? "检测到 uni-app 依赖" : "检测到 env/ 环境目录";
    return detection("env-dir", context, reason);
  }
  const reason = context.hasRootEnv ? "检测到根目录 .env.*" : "默认 Vite 根环境文件";
  return detection("root-env", context, reason);
}

function normalizeHost(host) {
  return String(host || "").replace(/\/+$/, "");
}

function apiUrl(env) {
  const host = normalizeHost(env.host);
  const prefix = String(env.apiPrefix || "").replace(/^\/+|\/+$/g, "");
  return prefix ? `${host}/${prefix}` : host;
}

function hostDomain(host) {
  try {
    return new URL(normalizeHost(host)).host;
  } catch {
    return normalizeHost(host).replace(/^https?:\/\//, "");
  }
}

function parseEnv(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) values[m[1]] = m[2];
  }
  return values;
}

function patchEnvContent(existing, updates) {
  const lines = existing ? existing.split(/\r?\n/) : [];
  const pending = { ...updates };
  const next = lines.map((line) => {
    const m = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!m || !(m[2] in pending)) return line;
    const value = pending[m[2]];
    delete pending[m[2]];
    return `${m[1]}${m[2]}${m[3]}${value}`;
  });

  const missing = Object.keys(pending);
  if (missing.length > 0) {
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push("# wl-skills env-config managed");
    for (const key of missing) next.push(`${key}=${pending[key]}`);
  }

  const result = next.join("\n").replace(/\n{3,}/g, "\n\n");
  return result.endsWith("\n") ? result : `${result}\n`;
}

function buildRootEnvUpdates(envKey, env) {
  const isCommon = envKey === "common";
  if (isCommon) return { ENV: "dev" };
  return {
    ENV: env.env || envKey,
    ENV_API_PREFIX: env.apiPrefix,
    ENV_WEB_API: normalizeHost(env.host),
    ENV_WEB_URL: normalizeHost(env.host),
    ENV_MOCK: "false",
  };
}

function buildEnvDirUpdates(envKey, env) {
  if (envKey === "common") return {};
  const isDev = envKey === "development";
  return {
    NODE_ENV: nodeEnvFor(isDev),
    VITE_ENV: env.viteEnv || env.env || envKey,
    VITE_DOMAIN: domainFor(isDev, env.host),
    VITE_API_BASE_URL: apiUrl(env),
    VITE_API_TIMEOUT: isDev ? "30000" : "20000",
    VITE_DEBUG: boolValue(isDev),
    VITE_LOG_LEVEL: logLevelFor(isDev, envKey),
    VITE_ENABLE_VCONSOLE: boolValue(isDev),
  };
}

function nodeEnvFor(isDev) {
  return isDev ? "development" : "production";
}

function domainFor(isDev, host) {
  return isDev ? "" : hostDomain(host);
}

function boolValue(value) {
  return value ? "true" : "false";
}

function logLevelFor(isDev, envKey) {
  if (isDev) return "debug";
  if (envKey === "production") return "error";
  return "warn";
}

function rootTargets(profile, options = {}) {
  const prod = {
    ...profile.envs.prod,
    apiPrefix: options.prodPrefix || profile.envs.prod.apiPrefix,
  };
  return [
    { rel: ".env", envKey: "common", updates: buildRootEnvUpdates("common", {}) },
    { rel: ".env.dev", envKey: "dev", updates: buildRootEnvUpdates("dev", profile.envs.dev) },
    { rel: ".env.sit", envKey: "sit", updates: buildRootEnvUpdates("sit", profile.envs.sit) },
    { rel: ".env.uat", envKey: "uat", updates: buildRootEnvUpdates("uat", profile.envs.uat) },
    { rel: ".env.pre", envKey: "pre", updates: buildRootEnvUpdates("pre", profile.envs.pre) },
    { rel: ".env.prod", envKey: "prod", updates: buildRootEnvUpdates("prod", prod) },
    { rel: ".env.prd", envKey: "prd", updates: buildRootEnvUpdates("prd", { ...prod, env: "prd" }) },
  ];
}

function envDirTargets(profile, options = {}) {
  const prod = {
    ...profile.envs.prod,
    apiPrefix: options.prodPrefix || profile.envs.prod.apiPrefix,
    env: "production",
    viteEnv: "production",
  };
  return [
    { rel: "env/.env", envKey: "common", updates: buildEnvDirUpdates("common", {}) },
    {
      rel: "env/.env.development",
      envKey: "development",
      updates: buildEnvDirUpdates("development", {
        ...profile.envs.dev,
        env: "development",
        viteEnv: "development",
      }),
    },
    { rel: "env/.env.sit", envKey: "sit", updates: buildEnvDirUpdates("sit", profile.envs.sit) },
    { rel: "env/.env.uat", envKey: "uat", updates: buildEnvDirUpdates("uat", profile.envs.uat) },
    { rel: "env/.env.pre", envKey: "pre", updates: buildEnvDirUpdates("pre", profile.envs.pre) },
    {
      rel: "env/.env.production",
      envKey: "production",
      updates: buildEnvDirUpdates("production", prod),
    },
  ];
}

function getProfileEnv(profile, key) {
  if (key === "prd") return { ...profile.envs.prod, env: "prd" };
  return profile.envs[key] || profile.envs.dev;
}

function profileRuntimeValues(profile) {
  const values = {};
  for (const key of [...PROFILE_ENV_KEYS, "prd"]) {
    const env = getProfileEnv(profile, key);
    const prefix = String(env.apiPrefix || "").replace(/^\/+|\/+$/g, "");
    values[key] = {
      env: env.env || key,
      host: normalizeHost(env.host),
      apiPrefix: prefix,
      baseApi: prefix ? `/${prefix}` : "",
      webApi: apiUrl(env),
      webUrl: normalizeHost(env.host),
    };
  }
  return values;
}

function removeConstObject(content, name) {
  const re = new RegExp(
    String.raw`\n\s*(?://[^\n]*\n\s*)?const\s+${name}\s*=\s*\{[\s\S]*?\n\s*\};\s*`,
    "m",
  );
  return content.replace(re, "\n");
}

function patchSafeStyleBaseApi(content) {
  const re =
    /const\s+baseApi:\s*string\s*=\s*"\/"\s*\+\s*config\["ENV"\]\s*\+\s*"-api";\s*\n(\s*\/\/[^\n]*\n)?\s*const\s+env\s*=\s*config\["ENV"\]\s+as\s+([^;]+);/m;
  return content.replace(re, (_match, _comment, envType) =>
    [
      `  const env = config["ENV"] as ${envType};`,
      "  const defaultApiPrefix = env === \"prod\" || env === \"prd\" ? \"prod-api\" : `${env}-api`;",
      "  const apiPrefix = String(config[\"ENV_API_PREFIX\"] || defaultApiPrefix).replace(/^\\/+|\\/+$/g, \"\");",
      "  const baseApi: string = \"/\" + apiPrefix;",
      "  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\");",
      "  const baseApiPattern = new RegExp(`^${escapeRegExp(baseApi)}`);",
      "  const webUrl = config[\"ENV_WEB_URL\"] || config[\"ENV_WEB_API\"] || \"\";",
      "  const webApi = config[\"ENV_WEB_API\"] || (webUrl ? `${webUrl}/${apiPrefix}` : \"\");",
    ].join("\n"),
  );
}

function patchPublicStyleBaseApi(content) {
  const re =
    /const\s+apiPrefix\s*=\s*env\s*===\s*"prod"\s*\|\|\s*env\s*===\s*"prd"\s*\?\s*"prod-api"\s*:\s*`\$\{env\}-api`;\s*\n\s*const\s+baseApi:\s*string\s*=\s*"\/"\s*\+\s*apiPrefix;/m;
  return content.replace(re, () =>
    [
      "const defaultApiPrefix = env === \"prod\" || env === \"prd\" ? \"prod-api\" : `${env}-api`;",
      "  const apiPrefix = String(config[\"ENV_API_PREFIX\"] || defaultApiPrefix).replace(/^\\/+|\\/+$/g, \"\");",
      "  const baseApi: string = \"/\" + apiPrefix;",
      "  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\");",
      "  const baseApiPattern = new RegExp(`^${escapeRegExp(baseApi)}`);",
      "  const webUrl = config[\"ENV_WEB_URL\"] || config[\"ENV_WEB_API\"] || \"\";",
      "  const webApi = config[\"ENV_WEB_API\"] || (webUrl ? `${webUrl}/${apiPrefix}` : \"\");",
    ].join("\n"),
  );
}

function patchBaseApiProxyTarget(content) {
  const re =
    /(\[\s*baseApi\s*\]\s*:\s*\{\s*\n\s*)target:\s*["']https?:\/\/[^"']+["']\s*,[^\n]*(?:\n\s*\/\/[^\n]*)*/m;
  return content.replace(re, "$1target: webUrl,");
}

function patchViteConfigContent(content) {
  let next = content;
  const hadHardcodedMaps = /const\s+webApiMap\s*=|const\s+webMap\s*=/.test(next);
  if (!hadHardcodedMaps) return next;

  next = removeConstObject(next, "webApiMap");
  next = removeConstObject(next, "webMap");
  next = patchSafeStyleBaseApi(next);
  next = patchPublicStyleBaseApi(next);
  next = next.replace(/\bwebApiMap\s*\[\s*env\s*\]/g, "webApi");
  next = next.replace(/\bwebMap\s*\[\s*env\s*\]/g, "webUrl");
  next = patchBaseApiProxyTarget(next);
  next = next.replace(
    /rewrite:\s*\(p\)\s*=>\s*p\.replace\(baseApi,\s*["']\/sit-api["']\)/g,
    "rewrite: (p) => p.replace(baseApiPattern, baseApi)",
  );
  next = next.replace(
    /rewrite:\s*\(p\)\s*=>\s*p\.replace\(\s*\/\^\\\/dev-api\/,\s*["']["']\s*\)/g,
    "rewrite: (p) => p.replace(baseApiPattern, baseApi)",
  );
  return next;
}

function buildViteConfigChange(root, options = {}) {
  if (options.migrateViteConfig === false) return null;
  const rel = VITE_CONFIG_FILES.find((file) => exists(root, file));
  if (!rel) return null;
  const before = readTextIfExists(root, rel);
  const after = patchViteConfigContent(before);
  if (before === after) return null;
  return {
    rel,
    kind: "vite-config",
    action: "update",
    changed: true,
    before,
    after,
    summary: "迁移 webMap/webApiMap 与 baseApi 代理为 ENV_WEB_URL/ENV_WEB_API/ENV_API_PREFIX 驱动",
  };
}

function patchRuntimeEnvJsonContent(content, profile) {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return content;
  }
  const { dev } = profileRuntimeValues(profile);
  const option = data.OPTION && typeof data.OPTION === "object" ? data.OPTION : {};
  const next = {
    ...data,
    VUE_APP_BASE_API: dev.baseApi || data.VUE_APP_BASE_API,
    OPTION: {
      ...option,
      baseApi: dev.baseApi || option.baseApi,
      env: dev.env || option.env,
      webUrl: dev.webUrl || option.webUrl,
      webApi: dev.webApi || option.webApi,
    },
  };
  return `${JSON.stringify(next, null, 2)}\n`;
}

function buildRuntimeEnvJsonChange(root, profile, options = {}) {
  if (options.migrateViteConfig === false) return null;
  const rel = "public/env-dev.json";
  if (!exists(root, rel)) return null;
  const before = readTextIfExists(root, rel);
  const after = patchRuntimeEnvJsonContent(before, profile);
  if (before === after) return null;
  return {
    rel,
    kind: "runtime-env-json",
    action: "update",
    changed: true,
    before,
    after,
    summary: "同步本地运行时 env-dev.json 的 baseApi/webUrl/webApi",
  };
}

function buildConfigChanges(root, profile, options = {}) {
  return [
    buildViteConfigChange(root, options),
    buildRuntimeEnvJsonChange(root, profile, options),
  ].filter(Boolean);
}

function collectEnvFiles(root) {
  return [...ROOT_ENV_FILES, ...ENV_DIR_FILES]
    .filter((rel) => exists(root, rel))
    .map((rel) => {
      const content = readTextIfExists(root, rel);
      return {
        rel,
        keys: Object.keys(parseEnv(content)).sort(),
        size: content.length,
      };
    });
}

function shouldScanFile(rel) {
  if (!/\.(env|js|ts|vue|json|md)$/.test(rel) && !/\.env(\.|$)/.test(rel)) return false;
  if (rel.includes("pnpm-lock.yaml")) return false;
  if (rel.includes("package-lock.json")) return false;
  return true;
}

function walkProject(root, dir = root, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkProject(root, path.join(dir, entry.name), list);
      continue;
    }
    const full = path.join(dir, entry.name);
    const rel = toPosix(path.relative(root, full));
    if (shouldScanFile(rel)) list.push(full);
  }
  return list;
}

function isInsideRanges(index, ranges) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function collectEndpointMatches(line, urlRe, prefixRe) {
  const urls = [...line.matchAll(urlRe)].map((match) => ({
    value: match[0],
    index: match.index,
  }));
  const urlRanges = urls.map((item) => ({
    start: item.index,
    end: item.index + item.value.length,
  }));
  const prefixes = [...line.matchAll(prefixRe)]
    .filter((match) => !isInsideRanges(match.index, urlRanges))
    .map((match) => ({ value: match[0], index: match.index }));
  return [...urls, ...prefixes];
}

function findHardcodedEndpoints(root, limit = 120) {
  const hits = [];
  const urlRe = /https?:\/\/[^\s"'`),]+/g;
  const prefixRe = /\/(?:dev|sit|uat|pre|prod|prd)-api\b|\/api\b/g;
  for (const file of walkProject(root)) {
    if (hits.length >= limit) break;
    const rel = toPosix(path.relative(root, file));
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (hits.length >= limit) return;
      const values = collectEndpointMatches(line, urlRe, prefixRe);
      for (const match of values) {
        if (hits.length >= limit) break;
        hits.push({
          rel,
          line: index + 1,
          value: match.value,
        });
      }
    });
  }
  return hits;
}

function buildPlan(root, options = {}) {
  const profile = resolveProfile(options);
  const detection = detectProject(root, options.projectType || "auto");
  const targets =
    detection.type === "env-dir"
      ? envDirTargets(profile, options)
      : rootTargets(profile, options);

  const changes = targets.map((target) => {
    const before = readTextIfExists(root, target.rel);
    const after = patchEnvContent(before, target.updates);
    return {
      rel: target.rel,
      envKey: target.envKey,
      action: before ? "update" : "create",
      changed: before !== after,
      before,
      after,
      updates: target.updates,
    };
  });

  return {
    root,
    profile: { name: profile.name, title: profile.title },
    detection,
    envFiles: collectEnvFiles(root),
    changes,
    configChanges: buildConfigChanges(root, profile, options),
    hardcoded: findHardcodedEndpoints(root),
  };
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeReport(root, result) {
  const reportDir = path.join(root, ".wl-skills", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const file = path.join(reportDir, `${REPORT_PREFIX}_${result.stamp}.md`);
  fs.writeFileSync(file, formatEnvResult(result), "utf8");
  return file;
}

function applyPlan(root, plan, options = {}) {
  const isDryRun = options.dryRun !== false;
  const applied = [];
  const runStamp = stamp();
  const backupRoot = path.join(root, ".wl-skills", "reports", "env-backups", runStamp);

  if (!isDryRun) {
    const writableChanges = [
      ...plan.changes,
      ...(plan.configChanges || []),
    ].filter((item) => item.changed);
    for (const change of writableChanges) {
      const target = path.join(root, change.rel);
      if (fs.existsSync(target)) {
        const backup = path.join(backupRoot, change.rel);
        ensureDir(backup);
        fs.copyFileSync(target, backup);
      }
      ensureDir(target);
      fs.writeFileSync(target, change.after, "utf8");
      applied.push(change.rel);
    }
  }

  const result = {
    ...plan,
    dryRun: isDryRun,
    applied,
    backupDir: applied.length > 0 ? toPosix(path.relative(root, backupRoot)) : "",
    stamp: runStamp,
    reportPath: "",
  };

  if (!isDryRun && options.writeReport !== false) {
    result.reportPath = toPosix(path.relative(root, writeReport(root, result)));
  }
  return result;
}

function scanProjectEnv(rootInput, options = {}) {
  const root = resolveProjectRoot(rootInput);
  return buildPlan(root, options);
}

function applyEnvConfig(rootInput, options = {}) {
  const root = resolveProjectRoot(rootInput);
  const plan = buildPlan(root, options);
  return applyPlan(root, plan, options);
}

function formatKeyValues(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function pushChangeTable(lines, changes) {
  lines.push("## 环境文件变更");
  lines.push("");
  lines.push("| 文件 | 动作 | 状态 | 管理字段 |");
  lines.push("|---|---|---|---|");
  for (const change of changes) {
    lines.push(
      `| ${change.rel} | ${change.action} | ${change.changed ? "需更新" : "无变化"} | ${formatKeyValues(change.updates)} |`,
    );
  }
}

function pushConfigChangeTable(lines, configChanges = []) {
  lines.push("## 前端配置变更");
  lines.push("");
  if (configChanges.length === 0) {
    lines.push("- 未发现可安全自动迁移的 Vite/运行时配置。");
    return;
  }
  lines.push("| 文件 | 类型 | 动作 | 状态 | 说明 |");
  lines.push("|---|---|---|---|---|");
  for (const change of configChanges) {
    lines.push(
      `| ${change.rel} | ${change.kind} | ${change.action} | ${change.changed ? "需更新" : "无变化"} | ${change.summary || ""} |`,
    );
  }
}

function pushEnvFiles(lines, envFiles) {
  lines.push("## 已发现的环境文件");
  lines.push("");
  if (envFiles.length === 0) {
    lines.push("- 未发现现有环境文件，将按目标项目类型创建。");
    return;
  }
  for (const file of envFiles) {
    lines.push(`- ${file.rel}：${file.keys.join(", ") || "无键值"}`);
  }
}

function pushHardcodedEndpoints(lines, hardcoded) {
  lines.push("## 硬编码端点扫描");
  lines.push("");
  if (hardcoded.length === 0) {
    lines.push("- 未发现明显硬编码 URL/API 前缀。");
    return;
  }
  lines.push("| 文件 | 行 | 值 |");
  lines.push("|---|---:|---|");
  for (const hit of hardcoded.slice(0, 40)) {
    lines.push(`| ${hit.rel} | ${hit.line} | \`${hit.value}\` |`);
  }
  if (hardcoded.length > 40) {
    lines.push(`| ... | ... | 其余 ${hardcoded.length - 40} 项已省略 |`);
  }
}

function pushGuardrails(lines) {
  lines.push("## 护栏");
  lines.push("");
  lines.push("- 本能力只处理前端项目环境文件、前端代理和前端 baseURL 相关线索。");
  lines.push("- 可识别并迁移常见 Vite 硬编码 webMap/webApiMap/proxy target；不能确定的业务代码只报告，不自动替换。");
  lines.push("- 不写后端配置，不写真实 token/secret，不删除业务自定义变量。");
  lines.push("- 默认 dry-run；正式写入前应确认变更计划。");
}

function formatEnvResult(result) {
  const lines = [
    `# 前端环境配置${result.dryRun ? "预览" : "执行"}报告`,
    "",
    `- 项目根：${result.root}`,
    `- 项目类型：${result.detection.type}（${result.detection.reason}）`,
    `- 环境 Profile：${result.profile.name}（${result.profile.title}）`,
    `- 模式：${result.dryRun ? "dry-run，只预览不写文件" : "apply，已写入文件"}`,
  ];

  if (result.backupDir) lines.push(`- 备份目录：${result.backupDir}`);
  if (result.reportPath) lines.push(`- 报告文件：${result.reportPath}`);
  lines.push("");
  pushChangeTable(lines, result.changes);
  lines.push("");
  pushConfigChangeTable(lines, result.configChanges);
  lines.push("");
  pushEnvFiles(lines, result.envFiles);
  lines.push("");
  pushHardcodedEndpoints(lines, result.hardcoded);
  lines.push("");
  pushGuardrails(lines);
  lines.push("");
  return lines.join("\n");
}

module.exports = {
  PROFILE_PRESETS,
  detectProject,
  parseEnv,
  patchEnvContent,
  scanProjectEnv,
  applyEnvConfig,
  formatEnvResult,
  _internal: {
    rootTargets,
    envDirTargets,
    findHardcodedEndpoints,
    resolveProfile,
    apiUrl,
    hostDomain,
    patchViteConfigContent,
    patchRuntimeEnvJsonContent,
    buildConfigChanges,
  },
};

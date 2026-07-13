"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { inspectProject, LEGACY_ENV_FILES } = require("./inspect");
const { resolveProfile } = require("./profiles");
const { renderManagedFiles } = require("./templates");
const { verifyStandardEnv } = require("./validator");

function hash(value) {
  return crypto.createHash("sha256").update(value || "").digest("hex");
}

function readIfExists(root, rel) {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

function normalizeHttpUrl(value, label) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} 不是有效 URL: ${normalized || "<empty>"}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${label} 只支持 http/https`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} 不允许包含账号、密码、查询参数或 hash`);
  }
  return normalized;
}

function normalizeRoutePart(value) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "");
}

function parseLocalRoutes(value) {
  if (Array.isArray(value)) {
    return value.map((item) => ({
      match: normalizeRoutePart(item.match),
      rewrite: normalizeRoutePart(item.rewrite),
    }));
  }
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [match, rewrite = match] = item.split("=");
      return { match: normalizeRoutePart(match), rewrite: normalizeRoutePart(rewrite) };
    });
}

function selectModule(inspection, options, warnings, errors) {
  if (options.moduleName) {
    const selected = normalizeRoutePart(options.moduleName);
    if (!/^[A-Za-z0-9_-]+$/.test(selected)) {
      errors.push("--module-name 只支持字母、数字、下划线和连字符");
    }
    return selected;
  }
  if (!inspection.module.resolved) {
    errors.push("无法识别模块名，请传 --module-name <name>");
    return "";
  }
  if (inspection.module.conflict) {
    errors.push(
      `模块标识冲突（${inspection.module.values.map((item) => item.value).join(", ")}），请用 --module-name 明确选择`,
    );
  }
  return inspection.module.resolved;
}

function selectLocalMode(inspection, options, routes, errors) {
  const mode = options.localMode || (inspection.shape.startsWith("legacy-") ? "all" : "module");
  if (!["all", "module", "routes"].includes(mode)) {
    errors.push(`--local-mode 只支持 all/module/routes，当前为 ${mode}`);
  }
  if (mode === "routes" && routes.length === 0) {
    errors.push("--local-mode routes 时必须传 --local-routes match=rewrite,...");
  }
  if (routes.some((route) => !route.match)) errors.push("本地后端路由 match 不能为空");
  return mode;
}

function buildChanges(root, managedFiles) {
  const changes = [];
  for (const [rel, after] of Object.entries(managedFiles)) {
    const beforeExists = fs.existsSync(path.join(root, rel));
    const before = readIfExists(root, rel);
    if (beforeExists && before === after) continue;
    changes.push({
      rel,
      action: beforeExists ? "update" : "create",
      before,
      after,
      beforeExists,
      beforeHash: hash(before),
    });
  }

  const deleteCandidates = [
    ...LEGACY_ENV_FILES,
    "public/env-dev.json",
    "vite/environment.ts",
  ];
  for (const rel of deleteCandidates) {
    if (!fs.existsSync(path.join(root, rel))) continue;
    const before = readIfExists(root, rel);
    changes.push({
      rel,
      action: "delete",
      before,
      after: "",
      beforeExists: true,
      beforeHash: hash(before),
    });
  }
  return changes;
}

function scanStandardEnv(rootInput) {
  const inspection = inspectProject(rootInput || process.cwd());
  return {
    action: "scan",
    root: inspection.root,
    status: inspection.standard ? "standard" : inspection.shape,
    inspection,
    warnings: inspection.module.conflict
      ? [`模块标识存在差异: ${inspection.module.values.map((item) => item.value).join(", ")}`]
      : [],
    errors: [],
    changes: [],
  };
}

function planExistingStandard(inspection, options) {
  const hasProfile = options.profile || options.profileData || options.profileFile;
  const profile = hasProfile ? resolveProfile(options, inspection.root) : undefined;
  const validation = verifyStandardEnv(inspection.root, { profile });
  return {
    action: "plan",
    root: inspection.root,
    status: validation.valid ? "standard" : "standard-drift",
    inspection,
    profile,
    moduleName: inspection.module.resolved,
    localMode: "",
    localRoutes: [],
    warnings: validation.warnings.map((item) => item.message),
    errors: validation.errors.map((item) => item.message),
    changes: [],
    validation,
    blocked: !validation.valid,
  };
}

function validateMigrationShape(inspection, errors) {
  if (!["legacy-direct", "legacy-gateway"].includes(inspection.shape)) {
    errors.push(
      inspection.shape === "unsupported"
        ? "当前目录不是可识别的 Vite 子应用"
        : "发现自定义 Vite 配置，无法安全自动迁移；请先人工确认配置边界",
    );
  }
}

function resolvePlanProfile(options, root, errors) {
  try {
    return resolveProfile(options, root);
  } catch (error) {
    errors.push(error.message);
    return undefined;
  }
}

function collectMigrationWarnings(inspection, options, context, warnings) {
  const { moduleName, localApi, profile } = context;
  if (inspection.module.conflict && options.moduleName) {
    warnings.push(`已明确使用模块名 ${moduleName}`);
  }
  if (inspection.baseApiProxy?.target) {
    warnings.push(
      `旧 API target ${inspection.baseApiProxy.target} 将由标准远程 Profile 和 ${localApi} 两种模式替代`,
    );
  }
  if (inspection.extraProxies.length > 0) {
    warnings.push(
      `将保留额外代理: ${inspection.extraProxies.map((item) => item.prefix).join(", ")}`,
    );
  }
  if (!inspection.envValues.ENV_ANY_REPORT_SECRET_KEY) {
    warnings.push("未发现 ENV_ANY_REPORT_SECRET_KEY，迁移后保留空值");
  }
  if (!inspection.envValues.ENV_ANY_REPORT_SERVER && profile?.preset !== "walsin") {
    warnings.push("自定义 Profile 不继承华新 AnyReport 地址，ENV_ANY_REPORT_SERVER 将保留空值");
  }
}

function planMigrationChanges(inspection, context, errors) {
  if (!context.profile || !context.moduleName || errors.length > 0) return [];
  const managedFiles = renderManagedFiles(inspection, context.profile, context);
  return buildChanges(inspection.root, managedFiles);
}

function planStandardEnv(rootInput, options = {}) {
  const inspection = inspectProject(rootInput || process.cwd());
  if (inspection.standard) return planExistingStandard(inspection, options);
  const warnings = [];
  const errors = [];
  validateMigrationShape(inspection, errors);
  const profile = resolvePlanProfile(options, inspection.root, errors);
  const moduleName = selectModule(inspection, options, warnings, errors);
  const localRoutes = parseLocalRoutes(options.localRoutes);
  const localMode = selectLocalMode(inspection, options, localRoutes, errors);
  const localApi = normalizeHttpUrl(options.localApi || "http://localhost:10010", "本地后端地址");
  const localPublic = normalizeHttpUrl(options.localPublic || "http://localhost:8002", "本地 public 地址");
  const context = { profile, moduleName, localMode, localRoutes, localApi, localPublic };
  collectMigrationWarnings(inspection, options, context, warnings);
  const changes = planMigrationChanges(inspection, context, errors);

  return {
    action: "plan",
    root: inspection.root,
    status: errors.length > 0 ? "blocked" : "ready",
    inspection,
    profile,
    moduleName,
    localMode,
    localRoutes,
    localApi,
    localPublic,
    warnings,
    errors,
    changes,
    blocked: errors.length > 0,
  };
}

function resolveGitDir(root) {
  const dotGit = path.join(root, ".git");
  if (!fs.existsSync(dotGit)) return "";
  if (fs.statSync(dotGit).isDirectory()) return dotGit;
  const match = fs.readFileSync(dotGit, "utf8").match(/^gitdir:\s*(.+)$/m);
  return match ? path.resolve(root, match[1].trim()) : "";
}

function backupRootFor(root) {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 17);
  const gitDir = resolveGitDir(root);
  if (gitDir) return path.join(gitDir, "wl-skills", "standard-env", stamp);
  return path.join(os.tmpdir(), "wl-skills-standard-env", `${path.basename(root)}-${stamp}`);
}

function ensureCurrentPlan(root, changes) {
  for (const change of changes) {
    const current = readIfExists(root, change.rel);
    if (hash(current) !== change.beforeHash) {
      throw new Error(`文件在计划后发生变化，已停止写入: ${change.rel}`);
    }
  }
}

function backupChanges(root, backupRoot, changes) {
  for (const change of changes) {
    if (!change.beforeExists) continue;
    const target = path.join(backupRoot, change.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, change.before, "utf8");
  }
}

function writeChanges(root, changes) {
  for (const change of changes) {
    const target = path.join(root, change.rel);
    if (change.action === "delete") {
      fs.rmSync(target, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, change.after, "utf8");
  }
}

function rollbackChanges(root, backupRoot, changes) {
  for (const change of [...changes].reverse()) {
    const target = path.join(root, change.rel);
    if (!change.beforeExists) {
      fs.rmSync(target, { force: true });
      continue;
    }
    const backup = path.join(backupRoot, change.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(backup, target);
  }
}

function applyStandardEnv(rootInput, options = {}) {
  if (options.confirmApply !== true) {
    return { ...planStandardEnv(rootInput, options), action: "apply", dryRun: true };
  }
  const plan = planStandardEnv(rootInput, options);
  if (plan.blocked) throw new Error(plan.errors.join("；"));
  if (plan.changes.length === 0) {
    return { ...plan, action: "apply", dryRun: false, applied: [], backupDir: "" };
  }

  ensureCurrentPlan(plan.root, plan.changes);
  const backupRoot = backupRootFor(plan.root);
  backupChanges(plan.root, backupRoot, plan.changes);
  try {
    writeChanges(plan.root, plan.changes);
    const validation = verifyStandardEnv(plan.root, { profile: plan.profile });
    if (!validation.valid) {
      throw new Error(
        `迁移后静态验证失败: ${validation.errors.map((item) => item.message).join("；")}`,
      );
    }
    return {
      ...plan,
      action: "apply",
      status: "applied",
      dryRun: false,
      applied: plan.changes.map((item) => item.rel),
      backupDir: backupRoot,
      validation,
    };
  } catch (error) {
    rollbackChanges(plan.root, backupRoot, plan.changes);
    throw new Error(`${error.message}；已自动回滚`);
  }
}

function formatChanges(changes) {
  if (!changes || changes.length === 0) return ["- 无文件变更"];
  return changes.map((item) => `- ${item.action}: ${item.rel}`);
}

function formatStandardEnvResult(result) {
  const lines = [
    "# 标准环境配置",
    "",
    `- 项目：${result.root}`,
    `- 状态：${result.status}`,
  ];
  appendSummaryFields(lines, result);
  lines.push("");
  appendInspection(lines, result.inspection);
  appendProfile(lines, result.profile);
  appendMessages(lines, "提醒", result.warnings);
  appendMessages(lines, "阻断", result.errors);
  lines.push("## 文件计划", "", ...formatChanges(result.changes), "");
  if (result.backupDir) lines.push(`- 本地备份：${result.backupDir}`, "");
  appendValidation(lines, result.validation);
  return lines.join("\n");
}

function appendSummaryFields(lines, result) {
  if (result.profile) lines.push(`- 目标环境：${result.profile.title} (${result.profile.name})`);
  if (result.moduleName) lines.push(`- 模块名：${result.moduleName}`);
  if (result.localMode) lines.push(`- 本地后端模式：${result.localMode}`);
}

function appendInspection(lines, inspection) {
  const candidates = inspection?.module?.candidates || [];
  if (candidates.length > 0) {
    lines.push("## 模块识别", "", ...candidates.map((item) => `- ${item.source}: ${item.value}`), "");
  }
  const endpoints = inspection?.endpoints || [];
  if (endpoints.length > 0) lines.push("## 配置地址线索", "", ...endpoints.map((item) => `- ${item}`), "");
}

function appendProfile(lines, profile) {
  if (!profile) return;
  const endpoints = Object.entries(profile.environments)
    .map(([key, item]) => `- ${key}: ${item.webUrl}/${item.apiPrefix}`);
  lines.push("## 目标地址", "", ...endpoints, "");
}

function appendMessages(lines, title, items) {
  if (!items || items.length === 0) return;
  lines.push(`## ${title}`, "", ...items.map((item) => `- ${item}`), "");
}

function appendValidation(lines, validation) {
  if (!validation) return;
  lines.push("## 验证", "", `- 静态验证：${validation.valid ? "通过" : "失败"}`);
  for (const build of validation.builds || []) {
    lines.push(`- build:${build.env}: ${build.ok ? "通过" : "失败"}`);
  }
  lines.push("");
}

module.exports = {
  applyStandardEnv,
  formatStandardEnvResult,
  parseLocalRoutes,
  planStandardEnv,
  scanStandardEnv,
  verifyStandardEnv,
  _internal: {
    backupRootFor,
    buildChanges,
    normalizeHttpUrl,
    resolveGitDir,
  },
};

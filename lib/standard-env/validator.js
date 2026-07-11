"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ENV_KEYS } = require("./profiles");
const { inspectProject, LEGACY_ENV_FILES, STANDARD_CONFIG_FILES, parseEnv } = require("./inspect");

const REQUIRED_SCRIPTS = [
  "dev",
  "dev:local",
  "dev:public",
  "build:dev",
  "build:sit",
  "build:uat",
  "build:pre",
  "build:prd",
];

const REQUIRED_ENV_KEYS = [
  "ENV_ANY_REPORT_SERVER",
  "ENV_ANY_REPORT_SECRET_KEY",
  "TOKEN_LOCALSTORAGE",
  "VITE_APP_TITLE",
  "ENV_LOCAL_API",
  "ENV_LOCAL_PUBLIC",
];

function add(list, code, message, rel = "") {
  list.push({ code, message, rel });
}

function validateScripts(pkg, errors) {
  const scripts = pkg.scripts || {};
  for (const key of REQUIRED_SCRIPTS) {
    if (!scripts[key]) add(errors, "SCRIPT_MISSING", `缺少脚本 ${key}`, "package.json");
  }
  if (scripts.dev && !/--mode\s+dev/.test(scripts.dev)) {
    add(errors, "SCRIPT_DEV", "dev 未使用 --mode dev", "package.json");
  }
  if (scripts["dev:local"] && !/--backend=local/.test(scripts["dev:local"])) {
    add(errors, "SCRIPT_LOCAL", "dev:local 未声明本地后端", "package.json");
  }
  if (scripts["dev:public"] && !/--public=local/.test(scripts["dev:public"])) {
    add(errors, "SCRIPT_PUBLIC", "dev:public 未声明本地 public", "package.json");
  }
}

function validateProfileContent(root, profile, errors) {
  if (!profile) return;
  const content = fs.readFileSync(path.join(root, "vite/config/environments.ts"), "utf8");
  for (const key of ENV_KEYS) {
    const item = profile.environments[key];
    const block = content.match(
      new RegExp(`["']?${key}["']?\\s*:\\s*\\{([\\s\\S]*?)\\}`, "m"),
    )?.[1];
    if (!block || !block.includes(item.webUrl) || !block.includes(item.apiPrefix)) {
      add(
        errors,
        "PROFILE_DRIFT",
        `${key} 与 Profile ${profile.name} 不一致`,
        "vite/config/environments.ts",
      );
    }
  }
}

function validateStandardEnv(rootInput, options = {}) {
  const root = path.resolve(rootInput || process.cwd());
  const inspection = inspectProject(root);
  const errors = [];
  const warnings = [];

  if (!inspection.packageJson.name) {
    add(errors, "PACKAGE_INVALID", "缺少有效 package.json", "package.json");
  }
  if (!inspection.viteRel) add(errors, "VITE_MISSING", "缺少 Vite 配置");
  for (const rel of STANDARD_CONFIG_FILES) {
    if (!fs.existsSync(path.join(root, rel))) add(errors, "CONFIG_MISSING", `缺少 ${rel}`, rel);
  }
  for (const rel of LEGACY_ENV_FILES) {
    if (fs.existsSync(path.join(root, rel))) add(errors, "LEGACY_ENV", `仍存在 ${rel}`, rel);
  }
  if (fs.existsSync(path.join(root, "public/env-dev.json"))) {
    add(errors, "STATIC_RUNTIME_ENV", "仍存在静态 public/env-dev.json", "public/env-dev.json");
  }
  if (fs.existsSync(path.join(root, "vite/environment.ts"))) {
    add(errors, "LEGACY_ENV_HELPER", "仍存在 vite/environment.ts", "vite/environment.ts");
  }

  const rootConfig = inspection.viteContent;
  if (!/resolveViteContext/.test(rootConfig) || !/createServerConfig/.test(rootConfig)) {
    add(errors, "ROOT_CONFIG", "根 Vite 配置未使用标准模块入口", inspection.viteRel || "vite.config.ts");
  }
  if (/\bwebMap\b|\bwebApiMap\b/.test(rootConfig)) {
    add(errors, "LEGACY_MAP", "根 Vite 配置仍包含旧环境映射", inspection.viteRel);
  }

  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) {
    add(errors, "ENV_MISSING", "缺少公共 .env", ".env");
  } else {
    const env = parseEnv(fs.readFileSync(envPath, "utf8"));
    for (const key of REQUIRED_ENV_KEYS) {
      if (!(key in env)) add(errors, "ENV_KEY", `.env 缺少 ${key}`, ".env");
    }
  }
  for (const rel of [".env", ".env.local"]) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    const env = parseEnv(fs.readFileSync(full, "utf8"));
    for (const key of ["ENV", "ENV_MOCK", "ENV_WEB_API", "ENV_WEB_URL", "ENV_API_PREFIX"]) {
      if (key in env) add(errors, "ENV_LEGACY_KEY", `${rel} 不应保留 ${key}`, rel);
    }
  }

  const appPath = path.join(root, "vite/config/app.ts");
  if (fs.existsSync(appPath)) {
    const app = fs.readFileSync(appPath, "utf8");
    for (const key of ENV_KEYS) {
      if (!new RegExp(`["']${key}["']`).test(app)) {
        add(errors, "APP_ENV", `APP_ENVS 缺少 ${key}`, "vite/config/app.ts");
      }
    }
    if (!/moduleName\s*:\s*["'][^"']+["']/.test(app)) {
      add(errors, "MODULE_NAME", "APP_CONFIG 缺少 moduleName", "vite/config/app.ts");
    }
  }

  const context = path.join(root, "vite/config/context.ts");
  if (fs.existsSync(context)) {
    const content = fs.readFileSync(context, "utf8");
    if (!/Local backend and local public are separate workflows/.test(content)) {
      add(errors, "MODE_GUARD", "缺少本地模式互斥保护", "vite/config/context.ts");
    }
    if (!/Local development sources cannot be used for builds/.test(content)) {
      add(errors, "BUILD_GUARD", "缺少构建本地源保护", "vite/config/context.ts");
    }
  }

  const plugins = path.join(root, "vite/config/plugins.ts");
  if (
    fs.existsSync(plugins) &&
    !fs.readFileSync(plugins, "utf8").includes("/env-dev.json")
  ) {
    add(errors, "RUNTIME_PLUGIN", "缺少动态 env-dev.json 中间件", "vite/config/plugins.ts");
  }

  validateScripts(inspection.packageJson, errors);
  validateProfileContent(root, options.profile, errors);

  if (inspection.module.conflict) {
    add(
      warnings,
      "MODULE_HISTORY",
      `历史模块标识存在差异: ${inspection.module.values.map((item) => item.value).join(", ")}`,
    );
  }

  return {
    root,
    valid: errors.length === 0,
    errors,
    warnings,
    inspection,
    builds: [],
  };
}

function copyForBuild(root, target) {
  const excluded = new Set([".git", "node_modules", "dist", "coverage", ".wl-skills", "docs"]);
  fs.cpSync(root, target, {
    recursive: true,
    filter(source) {
      const rel = path.relative(root, source);
      if (!rel) return true;
      return !excluded.has(rel.split(path.sep)[0]);
    },
  });
}

function runBuildMatrix(rootInput) {
  const root = path.resolve(rootInput);
  const nodeModules = path.join(root, "node_modules");
  const viteBin = path.join(nodeModules, "vite", "bin", "vite.js");
  if (!fs.existsSync(viteBin)) {
    return {
      ok: false,
      results: [],
      error: "未安装项目依赖，找不到本地 Vite；请先安装依赖后再执行构建验证",
    };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wl-standard-env-build-"));
  const projectRoot = path.join(tempRoot, "project");
  const results = [];
  try {
    copyForBuild(root, projectRoot);
    fs.symlinkSync(nodeModules, path.join(projectRoot, "node_modules"), "junction");
    for (const env of ENV_KEYS) {
      const outDir = `verify-output/${env}`;
      const execution = childProcess.spawnSync(
        process.execPath,
        [viteBin, "build", "--mode", env, "--outDir", outDir],
        {
          cwd: projectRoot,
          encoding: "utf8",
          timeout: 600000,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const output = `${execution.stdout || ""}\n${execution.stderr || ""}\n${execution.error?.message || ""}`.trim();
      results.push({
        env,
        ok: execution.status === 0,
        status: execution.status,
        output: output.split(/\r?\n/).slice(-20).join("\n"),
      });
      if (execution.status !== 0) break;
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return { ok: results.length === ENV_KEYS.length && results.every((item) => item.ok), results };
}

function verifyStandardEnv(root, options = {}) {
  const result = validateStandardEnv(root, options);
  if (!result.valid || !options.runBuild) return result;
  const builds = runBuildMatrix(root);
  result.builds = builds.results;
  if (!builds.ok) {
    add(
      result.errors,
      "BUILD_MATRIX",
      builds.error || `构建失败: ${builds.results.find((item) => !item.ok)?.env || "unknown"}`,
    );
    result.valid = false;
  }
  return result;
}

module.exports = {
  REQUIRED_ENV_KEYS,
  REQUIRED_SCRIPTS,
  runBuildMatrix,
  validateStandardEnv,
  verifyStandardEnv,
};

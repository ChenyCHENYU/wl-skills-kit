"use strict";

/**
 * validate 的本地增量缓存。
 *
 * 缓存只保存确定性问题列表，不保存源代码；页面 index.vue/data.ts/index.scss、项目配置
 * 或 kit 规则上下文变化时自动失效。目录放在项目根的 .wl-skills-cache/，应加入
 * 项目 gitignore，既不污染业务仓库，也不进入 AI 上下文。
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CACHE_DIR = ".wl-skills-cache";
const CACHE_FILE = "validate-v1.json";
const CACHE_VERSION = 1;

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function cachePath(projectRoot) {
  return path.join(projectRoot, CACHE_DIR, CACHE_FILE);
}

function readValidationCache(projectRoot) {
  try {
    const value = JSON.parse(fs.readFileSync(cachePath(projectRoot), "utf8"));
    if (!value || value.version !== CACHE_VERSION || !value.entries || typeof value.entries !== "object") {
      return { version: CACHE_VERSION, entries: {} };
    }
    return value;
  } catch {
    return { version: CACHE_VERSION, entries: {} };
  }
}

function writeValidationCache(projectRoot, cache) {
  const target = cachePath(projectRoot);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(cache));
    fs.renameSync(temporary, target);
  } catch {
    // 缓存是性能优化，任何权限/并发问题都不能阻断 validate。
  }
}

function fileContent(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function pageCacheKey(projectRoot, pageDir, contextFingerprint, sources = {}) {
  const absDir = path.join(projectRoot, pageDir);
  const source = [
    contextFingerprint,
    pageDir,
    sources.indexVue ?? fileContent(path.join(absDir, "index.vue")),
    sources.dataTs ?? fileContent(path.join(absDir, "data.ts")),
    sources.indexScss ?? fileContent(path.join(absDir, "index.scss")),
    sources.apiMd ?? fileContent(path.join(absDir, "api.md")),
    sources.pageSpec ?? fileContent(path.join(absDir, "page-spec.json")),
  ].join("\u0000");
  return digest(source);
}

function contextFingerprint(value) {
  return digest(JSON.stringify(value));
}

module.exports = {
  CACHE_DIR,
  CACHE_FILE,
  CACHE_VERSION,
  contextFingerprint,
  pageCacheKey,
  readValidationCache,
  writeValidationCache,
};

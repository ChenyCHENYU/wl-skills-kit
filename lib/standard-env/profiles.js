"use strict";

const fs = require("fs");
const path = require("path");

const ENV_KEYS = ["dev", "sit", "uat", "pre", "prd"];

const PROFILE_PRESETS = {
  walsin: {
    name: "walsin",
    title: "华新标准环境",
    environments: {
      dev: {
        webUrl: "https://ytiop-sit.walsin.com.cn:8443",
        apiPrefix: "sit-api",
      },
      sit: {
        webUrl: "https://ytiop-sit.walsin.com.cn:8443",
        apiPrefix: "sit-api",
      },
      uat: {
        webUrl: "https://ytiop-uat.walsin.com.cn:8443",
        apiPrefix: "uat-api",
      },
      pre: {
        webUrl: "https://ytiop-pre.walsin.com.cn:8443",
        apiPrefix: "pre-api",
      },
      prd: {
        webUrl: "https://ytiop-prd.walsin.com.cn:8443",
        apiPrefix: "prod-api",
      },
    },
  },
};

function normalizeWebUrl(value, key) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Profile ${key}.webUrl 不是有效 URL: ${raw || "<empty>"}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Profile ${key}.webUrl 只支持 http/https`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`Profile ${key}.webUrl 不允许包含账号、密码、查询参数或 hash`);
  }
  return raw;
}

function normalizeApiPrefix(value, key) {
  const prefix = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  if (!prefix || !/^[A-Za-z0-9_-]+$/.test(prefix)) {
    throw new Error(`Profile ${key}.apiPrefix 无效: ${value || "<empty>"}`);
  }
  return prefix;
}

function validateProfile(input) {
  if (!input || typeof input !== "object") {
    throw new Error("环境 Profile 必须是对象");
  }
  const { environments } = input;
  if (!environments || typeof environments !== "object") {
    throw new Error("环境 Profile 必须完整提供 environments");
  }

  const normalized = {};
  for (const key of ENV_KEYS) {
    const item = environments[key];
    if (!item || typeof item !== "object") {
      throw new Error(`环境 Profile 缺少 ${key}`);
    }
    normalized[key] = {
      webUrl: normalizeWebUrl(item.webUrl, key),
      apiPrefix: normalizeApiPrefix(item.apiPrefix, key),
    };
  }

  return {
    name: String(input.name || "custom").trim() || "custom",
    title: String(input.title || input.name || "自定义环境").trim(),
    environments: normalized,
  };
}

function loadProfileFile(filePath, root) {
  const full = path.resolve(root || process.cwd(), filePath);
  if (!fs.existsSync(full)) throw new Error(`Profile 文件不存在: ${full}`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (error) {
    throw new Error(`Profile JSON 解析失败: ${error.message}`);
  }
  return data;
}

function resolveProfile(options = {}, root) {
  if (options.profileData) return validateProfile(options.profileData);
  if (options.profileFile) {
    return validateProfile(loadProfileFile(options.profileFile, root));
  }
  if (!options.profile) {
    throw new Error(
      '请选择目标环境：--profile walsin，或 --profile-file <自定义环境.json>',
    );
  }
  const preset = PROFILE_PRESETS[options.profile];
  if (!preset) {
    throw new Error(
      `未知环境 Profile "${options.profile}"；可用内置 Profile: ${Object.keys(PROFILE_PRESETS).join(", ")}`,
    );
  }
  return { ...validateProfile(preset), preset: options.profile };
}

module.exports = {
  ENV_KEYS,
  PROFILE_PRESETS,
  resolveProfile,
  validateProfile,
};

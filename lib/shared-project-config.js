"use strict";

const fs = require("fs");
const path = require("path");
const { applyEdits, modify, parse, printParseErrorCode } = require("jsonc-parser");

const SHARED_PROJECT_CONFIG_KEYS = new Map([
  [".mcp.json", "mcpServers"],
  [".cursor/mcp.json", "mcpServers"],
  [".kiro/settings/mcp.json", "mcpServers"],
  [".vscode/mcp.json", "servers"],
  [".kilo/kilo.jsonc", "mcp"],
]);
const KILO_SOURCE_PATH = ".kilo/kilo.jsonc";
const KILO_ROOT_CANDIDATES = ["kilo.jsonc", "kilo.json"];
const FORMATTING_OPTIONS = { insertSpaces: true, tabSize: 2, eol: "\n" };

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonc(text, label) {
  const errors = [];
  const value = parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0) {
    const details = errors
      .map((error) => `${printParseErrorCode(error.error)}@${error.offset}`)
      .join(", ");
    throw new Error(`${label} 不是有效 JSON/JSONC：${details}`);
  }
  if (!isObject(value)) throw new Error(`${label} 根节点必须是 object`);
  return value;
}

function configSection(config, key, label) {
  const value = config[key];
  if (value === undefined) return {};
  if (!isObject(value)) throw new Error(`${label}#${key} 必须是 object`);
  return value;
}

function setJsoncValue(text, pathSegments, value) {
  return applyEdits(
    text,
    modify(text, pathSegments, value, { formattingOptions: FORMATTING_OPTIONS }),
  );
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

module.exports = {
  KILO_ROOT_CANDIDATES,
  KILO_SOURCE_PATH,
  SHARED_PROJECT_CONFIG_KEYS,
  desiredSharedProjectConfig,
  isSharedProjectConfig,
  isSharedProjectConfigSource,
  resolveSharedProjectConfigTarget,
};

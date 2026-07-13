"use strict";

const fs = require("fs");
const path = require("path");
const { PLAN_SCHEMA_VERSION, createPlanHash, stableStringify } = require("./plan-hash");
const {
  collectModuleContract,
  extractApiContracts,
  formatModuleContract,
  readModuleContract,
  toBackendPayloads,
} = require("./dict-contract");

const DEFAULT_SEARCH_ROOT = "src/views";
const EXCLUDED_DIRS = new Set([
  ".git",
  ".wl-skills",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);
const MAX_CONTRACT_FILES = 500;

function realProjectRoot(projectRoot) {
  return fs.realpathSync(path.resolve(projectRoot || process.env.WL_PROJECT_ROOT || process.cwd()));
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveInside(root, target, label) {
  const resolved = fs.realpathSync(path.resolve(root, target));
  if (!isInside(root, resolved)) throw new Error(`${label} 必须位于当前项目目录内`);
  return resolved;
}

function walkFiles(root, predicate) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const filePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(filePath);
      else if (predicate(entry.name, filePath)) files.push(filePath);
    }
  }
  walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function resolveSearchRoot(projectRoot, searchRoot = DEFAULT_SEARCH_ROOT) {
  const candidate = path.resolve(projectRoot, searchRoot);
  if (!fs.existsSync(candidate)) throw new Error(`字典扫描目录不存在: ${searchRoot}`);
  return resolveInside(projectRoot, candidate, "searchRoot");
}

function discoverDictFiles(options = {}) {
  const projectRoot = realProjectRoot(options.projectRoot);
  if (options.sourcePath) {
    const sourcePath = resolveInside(projectRoot, options.sourcePath, "sourcePath");
    if (path.basename(sourcePath).toLowerCase() !== "dicts.ts") {
      throw new Error("sourcePath 必须指向模块根目录下的 dicts.ts");
    }
    return { projectRoot, searchRoot: path.dirname(sourcePath), files: [sourcePath] };
  }
  const searchRoot = resolveSearchRoot(projectRoot, options.searchRoot);
  const files = walkFiles(searchRoot, (name) => name.toLowerCase() === "dicts.ts");
  if (files.length > MAX_CONTRACT_FILES) {
    throw new Error(`发现 ${files.length} 个 dicts.ts，超过安全上限 ${MAX_CONTRACT_FILES}`);
  }
  return { projectRoot, searchRoot, files };
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function identityKey(value) {
  return String(value).toLocaleLowerCase("en-US");
}

function buildLocalRegistry(options = {}) {
  const discovery = discoverDictFiles(options);
  const modules = [];
  const moduleCodes = new Map();
  const dictionaryOwners = new Map();
  for (const filePath of discovery.files) {
    const contract = readModuleContract(filePath);
    const sourcePath = relativePath(discovery.projectRoot, filePath);
    const moduleKey = identityKey(contract.module.code);
    const previousModule = moduleCodes.get(moduleKey);
    if (previousModule) {
      throw new Error(`模块编码重复 ${contract.module.code}: ${previousModule}, ${sourcePath}`);
    }
    moduleCodes.set(moduleKey, sourcePath);
    for (const dictionary of contract.dictionaries) {
      const dictionaryKey = identityKey(dictionary.code);
      const previousOwner = dictionaryOwners.get(dictionaryKey);
      if (previousOwner) {
        throw new Error(`字典编码 ${dictionary.code} 被多个模块定义: ${previousOwner}, ${sourcePath}`);
      }
      dictionaryOwners.set(dictionaryKey, sourcePath);
    }
    modules.push({ filePath, sourcePath, contract, payloads: toBackendPayloads(contract) });
  }
  modules.sort((left, right) => left.contract.module.code.localeCompare(right.contract.module.code));
  return { ...discovery, modules };
}

function hashValue(value) {
  return createPlanHash("dictionary", value);
}

function apiContainsContract(filePath) {
  const markdown = fs.readFileSync(filePath, "utf8");
  return extractApiContracts(markdown, filePath).length > 0;
}

function discoverBootstrapRoots(options = {}) {
  const projectRoot = realProjectRoot(options.projectRoot);
  const searchRoot = resolveSearchRoot(projectRoot, options.searchRoot);
  const apiFiles = walkFiles(searchRoot, (name) => name.toLowerCase() === "api.md");
  const roots = new Set();
  for (const apiPath of apiFiles) {
    if (!apiContainsContract(apiPath)) continue;
    const pageDirectory = path.dirname(apiPath);
    roots.add(path.dirname(pageDirectory));
  }
  return { projectRoot, searchRoot, roots: [...roots].sort() };
}

function scanDictionaryReferences(projectRoot, searchRoot) {
  const references = new Map();
  const pattern = /(?:logicValue\s*:\s*|useDictOpts\s*\(\s*)["']([^"']+)["']/g;
  const files = walkFiles(searchRoot, (name) => /\.(?:ts|tsx|vue)$/.test(name));
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const code = match[1];
      const sources = references.get(code) || new Set();
      sources.add(relativePath(projectRoot, filePath));
      references.set(code, sources);
    }
  }
  return [...references.entries()]
    .map(([code, sources]) => ({ code, sources: [...sources].sort() }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function planBootstrap(options = {}) {
  const discovery = discoverBootstrapRoots(options);
  const entries = [];
  const issues = [];
  for (const moduleRoot of discovery.roots) {
    const dictPath = path.join(moduleRoot, "dicts.ts");
    if (fs.existsSync(dictPath)) continue;
    try {
      const contract = collectModuleContract(moduleRoot);
      entries.push({
        moduleRoot: relativePath(discovery.projectRoot, moduleRoot),
        targetPath: relativePath(discovery.projectRoot, dictPath),
        contract,
        content: formatModuleContract(contract),
      });
    } catch (error) {
      issues.push({ moduleRoot: relativePath(discovery.projectRoot, moduleRoot), message: error.message });
    }
  }
  entries.sort((a, b) => a.contract.module.code.localeCompare(b.contract.module.code));
  const moduleOwners = new Map();
  const dictionaryOwners = new Map();
  for (const entry of entries) {
    const moduleKey = identityKey(entry.contract.module.code);
    const previousModule = moduleOwners.get(moduleKey);
    if (previousModule) {
      issues.push({
        moduleRoot: entry.moduleRoot,
        message: `模块编码 ${entry.contract.module.code} 同时出现在 ${previousModule} 和 ${entry.targetPath}`,
      });
    } else {
      moduleOwners.set(moduleKey, entry.targetPath);
    }
    for (const dictionary of entry.contract.dictionaries) {
      const dictionaryKey = identityKey(dictionary.code);
      const previousDictionary = dictionaryOwners.get(dictionaryKey);
      if (previousDictionary) {
        issues.push({
          moduleRoot: entry.moduleRoot,
          message: `字典编码 ${dictionary.code} 同时出现在 ${previousDictionary} 和 ${entry.targetPath}`,
        });
      } else {
        dictionaryOwners.set(dictionaryKey, entry.targetPath);
      }
    }
  }
  const references = scanDictionaryReferences(discovery.projectRoot, discovery.searchRoot);
  const hashInput = entries.map((entry) => ({ targetPath: entry.targetPath, contract: entry.contract }));
  return {
    planSchemaVersion: PLAN_SCHEMA_VERSION,
    projectRoot: discovery.projectRoot,
    searchRoot: relativePath(discovery.projectRoot, discovery.searchRoot),
    entries,
    issues,
    references,
    planHash: hashValue(hashInput),
  };
}

function applyBootstrap(plan, expectedHash) {
  if (!expectedHash || expectedHash !== plan.planHash) {
    throw new Error("bootstrap planHash 缺失或已失效，请重新预览");
  }
  if (plan.issues.length > 0) throw new Error("存在字典契约问题，禁止生成 dicts.ts");
  for (const entry of plan.entries) {
    if (fs.existsSync(path.resolve(plan.projectRoot, entry.targetPath))) {
      throw new Error(`${entry.targetPath} 已存在，禁止覆盖`);
    }
  }
  const created = [];
  for (const entry of plan.entries) {
    const targetPath = path.resolve(plan.projectRoot, entry.targetPath);
    fs.writeFileSync(targetPath, entry.content, "utf8");
    created.push(entry.targetPath);
  }
  return created;
}

module.exports = {
  DEFAULT_SEARCH_ROOT,
  applyBootstrap,
  buildLocalRegistry,
  discoverDictFiles,
  hashValue,
  stableStringify,
  PLAN_SCHEMA_VERSION,
  planBootstrap,
  scanDictionaryReferences,
};

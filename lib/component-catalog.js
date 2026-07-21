"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createPlanHash, PLAN_SCHEMA_VERSION } = require("./plan-hash");
const { withFileLock } = require("./process-lock");

const DEFAULT_CATALOG_PATH = path.resolve(
  __dirname,
  "..",
  "files",
  ".wl-skills",
  "component-catalog.json",
);
const LOCK_RELATIVE_PATH = ".wl-skills/components.lock.json";
const CODE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".vue"]);
const SKIP_DIRECTORIES = new Set([
  ".git",
  ".wl-skills",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);
const MAX_SOURCE_FILES = 5000;

function fileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function normalizeRelative(filePath) {
  return filePath.replace(/\\/g, "/");
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveInside(root, relativePath, label) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${label} 必须是项目内相对路径`);
  }
  const resolved = path.resolve(root, relativePath);
  if (!isInside(root, resolved)) throw new Error(`${label} 必须位于限定目录内`);
  return resolved;
}

function nearestExisting(target) {
  let current = target;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function assertNoSymlinkEscape(root, target, label) {
  const existing = nearestExisting(target);
  const real = fs.realpathSync(existing);
  if (!isInside(root, real)) throw new Error(`${label} 经过符号链接后越出项目目录`);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} 解析失败: ${error.message}`);
  }
}

function validateCatalogFile(component, file) {
  if (typeof file !== "string" || !file || path.isAbsolute(file)) {
    throw new Error(`组件 ${component.name} 存在非法文件路径`);
  }
  const normalized = normalizeRelative(file);
  if (normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`组件 ${component.name} 文件路径越界: ${file}`);
  }
}

function validateComponentIdentity(component, seen) {
  const name = component?.name || "";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
    throw new Error("组件目录存在非法 name");
  }
  if (seen.has(name)) throw new Error(`组件 name 重复: ${name}`);
  seen.add(name);
}

function validateComponentContract(component) {
  if (!Number.isInteger(component.contractVersion) || component.contractVersion < 1) {
    throw new Error(`组件 ${component.name} contractVersion 必须是正整数`);
  }
}

function validateComponentFileList(component) {
  if (!Array.isArray(component.files) || component.files.length === 0) {
    throw new Error(`组件 ${component.name} files 不能为空`);
  }
  for (const file of component.files) validateCatalogFile(component, file);
  if (new Set(component.files).size !== component.files.length) {
    throw new Error(`组件 ${component.name} files 不得重复`);
  }
  if (!component.files.includes(component.entry)) {
    throw new Error(`组件 ${component.name} entry 必须包含在 files 中`);
  }
}

function validateComponentScope(component) {
  const scope = component.kind === "local" || component.kind === "global" ? component.kind : "";
  if (!scope) throw new Error(`组件 ${component.name} kind 必须是 local 或 global`);
  const prefix = `src/components/${scope}/`;
  for (const [field, value] of [["sourceDir", component.sourceDir], ["targetDir", component.targetDir]]) {
    const normalized = normalizeRelative(value || "");
    if (!normalized.startsWith(prefix) || normalized.includes("/../") || normalized.endsWith("/..")) {
      throw new Error(`组件 ${component.name} ${field} 必须位于 ${prefix}`);
    }
  }
}

function validateComponentImport(component) {
  const targetFromSrc = normalizeRelative(component.targetDir).replace(/^src\//, "");
  const expectedImport = `@/${targetFromSrc}/${component.entry}`;
  if (component.importPath !== expectedImport) {
    throw new Error(`组件 ${component.name} importPath 必须是 ${expectedImport}`);
  }
}

function validateComponentTags(component) {
  if (!Array.isArray(component.tags) || component.tags.some((tag) => typeof tag !== "string" || !tag)) {
    throw new Error(`组件 ${component.name} tags 无效`);
  }
}

function validateComponentFiles(component) {
  validateComponentFileList(component);
  validateComponentScope(component);
  validateComponentImport(component);
  validateComponentTags(component);
}

function validateCatalogComponent(component, seen) {
  validateComponentIdentity(component, seen);
  validateComponentContract(component);
  validateComponentFiles(component);
}

function validateCatalogPolicy(policy) {
  if (
    policy?.lifecycle !== "provisional"
    || policy?.projectCustomization !== "allowed"
    || policy?.futureDirection !== "prefer-platform-or-extract-library"
  ) {
    throw new Error("组件目录 policy 无效");
  }
}

function validateCatalog(catalog) {
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.components)) {
    throw new Error("组件目录 schemaVersion/components 无效");
  }
  validateCatalogPolicy(catalog.policy);
  const seen = new Set();
  for (const component of catalog.components) validateCatalogComponent(component, seen);
  return catalog;
}

function loadCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
  const resolved = fs.realpathSync(path.resolve(catalogPath));
  const catalog = validateCatalog(readJson(resolved, "组件目录"));
  return { ...catalog, catalogPath: resolved, sourceRoot: path.dirname(resolved) };
}

function readLock(projectRoot) {
  const lockPath = path.join(projectRoot, LOCK_RELATIVE_PATH);
  if (!fs.existsSync(lockPath)) return { schemaVersion: 1, components: {} };
  const lock = readJson(lockPath, "组件锁文件");
  if (lock?.schemaVersion !== 1 || !lock.components || Array.isArray(lock.components)) {
    throw new Error("组件锁文件 schemaVersion/components 无效");
  }
  return lock;
}

function shouldSkipEntry(entry) {
  if (entry.isSymbolicLink()) return true;
  return entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name);
}

function appendCodeFile(filePath, result) {
  if (CODE_EXTENSIONS.has(path.extname(filePath))) result.push(filePath);
}

function walkCodeDirectory(root, result) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (shouldSkipEntry(entry)) continue;
    walkCodeFiles(path.join(root, entry.name), result);
    if (result.length > MAX_SOURCE_FILES) throw new Error(`组件引用扫描超过 ${MAX_SOURCE_FILES} 个源码文件`);
  }
}

function walkCodeFiles(root, result = []) {
  if (!fs.existsSync(root)) return result;
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) return result;
  if (stat.isFile()) appendCodeFile(root, result);
  else walkCodeDirectory(root, result);
  return result;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function componentPatterns(component) {
  const importRoot = escapeRegExp(path.posix.dirname(component.importPath));
  const tags = (component.tags || [component.name]).map(escapeRegExp).join("|");
  return {
    import: new RegExp(`(?:from\\s*|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*)["']${importRoot}(?:/[^"']*)?["']`),
    tag: new RegExp(`<\\s*(?:${tags})(?=[\\s>/])`, "i"),
  };
}

function vueTemplate(source) {
  const match = source.match(/<template(?:\s[^>]*)?>([\s\S]*?)<\/template>/i);
  return match ? match[1].replace(/<!--[\s\S]*?-->/g, "") : "";
}

function sourceUsesComponent(source, patterns, extension) {
  if (patterns.import.test(source)) return true;
  if (extension === ".vue") return patterns.tag.test(vueTemplate(source));
  return [".jsx", ".tsx"].includes(extension) && patterns.tag.test(source);
}

function resolveUsageFiles(projectRoot, scanPath, sourceFiles) {
  if (sourceFiles?.length) {
    return sourceFiles
      .map((file) => resolveInside(projectRoot, file, "sourceFile"))
      .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile())
      .filter((file) => CODE_EXTENSIONS.has(path.extname(file)))
      .sort((left, right) => left.localeCompare(right));
  }
  const scanRoot = resolveInside(projectRoot, scanPath, "scanPath");
  return walkCodeFiles(scanRoot).sort((left, right) => left.localeCompare(right));
}

function discoverUsage(projectRoot, catalog, scanPath = "src", sourceFiles) {
  const files = resolveUsageFiles(projectRoot, scanPath, sourceFiles);
  const usage = new Map(catalog.components.map((component) => [component.name, []]));
  const patterns = new Map(catalog.components.map((component) => [component.name, componentPatterns(component)]));
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const component of catalog.components) {
      if (!sourceUsesComponent(source, patterns.get(component.name), path.extname(filePath))) continue;
      usage.get(component.name).push(normalizeRelative(path.relative(projectRoot, filePath)));
    }
  }
  return catalog.components
    .filter((component) => usage.get(component.name).length > 0)
    .map((component) => ({ name: component.name, sources: usage.get(component.name) }));
}

function dependencyMap(projectRoot) {
  const packagePath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(packagePath)) return {};
  const pkg = readJson(packagePath, "package.json");
  return {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
    ...pkg.peerDependencies,
  };
}

function missingRequirements(projectRoot, component, dependencies) {
  const packages = (component.requirements?.packages || []).filter((name) => !dependencies[name]);
  const files = (component.requirements?.files || []).filter((name) => {
    const target = resolveInside(projectRoot, name, `${component.name} requirement`);
    return !fs.existsSync(target);
  });
  return { packages, files };
}

function componentSourceHashes(catalog, component) {
  const sourceDir = resolveInside(catalog.sourceRoot, component.sourceDir, `${component.name} sourceDir`);
  const hashes = {};
  for (const file of component.files) {
    const source = resolveInside(sourceDir, file, `${component.name} source file`);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error(`组件 ${component.name} 模板缺少 ${file}`);
    }
    hashes[file] = fileHash(source);
  }
  return { sourceDir, hashes };
}

function currentTargetHashes(targetDir, files) {
  const hashes = {};
  const missing = [];
  for (const file of files) {
    const target = resolveInside(targetDir, file, "组件目标文件");
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      missing.push(file);
      continue;
    }
    hashes[file] = fileHash(target);
  }
  return { hashes, missing };
}

function sameHashes(left, right, files) {
  return files.every((file) => left?.[file] && left[file] === right?.[file]);
}

function inspectExistingComponent(context) {
  const { component, lockEntry, sourceHashes, targetDir } = context;
  const current = currentTargetHashes(targetDir, component.files);
  if (current.missing.includes(component.entry)) {
    return {
      status: "partial",
      missingFiles: current.missing,
      reason: `项目目录已存在，将只补齐缺失文件: ${current.missing.join(", ")}`,
    };
  }
  if (!lockEntry) {
    return { status: "project-owned", reason: "项目已有真实实现，按项目契约复用且不接管" };
  }
  if (lockEntry.ownership === "project-extended") {
    return { status: "customized", reason: "落盘时保留了项目已有文件，按项目契约复用且不覆盖" };
  }
  if (lockEntry.targetDir !== component.targetDir || lockEntry.contractVersion !== component.contractVersion) {
    return { status: "customized", reason: "项目实现已偏离 kit 快照，按项目契约复用且不覆盖" };
  }
  if (current.missing.length > 0) {
    return { status: "customized", reason: "项目已调整组件文件结构，按项目契约复用且不覆盖" };
  }
  if (!sameHashes(current.hashes, lockEntry.files, component.files)) {
    return { status: "customized", reason: "项目已打磨组件实现，按项目契约复用且不覆盖" };
  }
  const updateAvailable = !sameHashes(sourceHashes, lockEntry.files, component.files);
  return {
    status: updateAvailable ? "update-available" : "ready",
    reason: updateAvailable ? "kit 中存在同契约的新实现，当前项目版本仍可继续使用" : "契约与文件哈希一致",
  };
}

function inspectComponent(context) {
  const { projectRoot, catalog, component, lock, dependencies } = context;
  const targetDir = resolveInside(projectRoot, component.targetDir, `${component.name} targetDir`);
  assertNoSymlinkEscape(projectRoot, targetDir, component.name);
  const source = componentSourceHashes(catalog, component);
  const requirements = missingRequirements(projectRoot, component, dependencies);
  if (!fs.existsSync(targetDir)) {
    return { component, targetDir, ...source, requirements, status: "missing", reason: "项目中尚未落盘" };
  }
  if (!fs.statSync(targetDir).isDirectory()) {
    return { component, targetDir, ...source, requirements, status: "incomplete", reason: "组件目标路径不是目录" };
  }
  const existing = inspectExistingComponent({
    component,
    lockEntry: lock.components[component.name],
    sourceHashes: source.hashes,
    targetDir,
  });
  return { component, targetDir, ...source, requirements, ...existing };
}

function selectComponents(catalog, options, usage) {
  const requested = options.names?.length
    ? [...new Set(options.names)]
    : options.all
      ? catalog.components.map((component) => component.name)
      : usage.map((item) => item.name);
  const byName = new Map(catalog.components.map((component) => [component.name, component]));
  const unknown = requested.filter((name) => !byName.has(name));
  if (unknown.length > 0) throw new Error(`未知组件: ${unknown.join(", ")}`);
  return requested.sort().map((name) => byName.get(name));
}

function requirementReason(requirements) {
  const parts = [];
  if (requirements.packages.length > 0) parts.push(`缺少依赖包 ${requirements.packages.join(", ")}`);
  if (requirements.files.length > 0) parts.push(`缺少项目文件 ${requirements.files.join(", ")}`);
  return parts.join("；");
}

function toPlanSnapshot(item) {
  return {
    name: item.component.name,
    contractVersion: item.component.contractVersion,
    status: item.status,
    targetDir: item.component.targetDir,
    sourceHashes: item.hashes,
    missingFiles: item.missingFiles || [],
    reason: item.reason,
    requirements: item.requirements,
  };
}

function buildPlanGroups(inspections) {
  const actions = [];
  const reusable = [];
  const conflicts = [];
  for (const item of inspections) {
    if (["project-owned", "customized"].includes(item.status)) {
      reusable.push(item);
      continue;
    }
    const requirementIssue = requirementReason(item.requirements);
    if (requirementIssue) {
      conflicts.push({ ...item, status: "requirements-missing", reason: requirementIssue });
    } else if (["missing", "partial"].includes(item.status)) {
      actions.push(item);
    } else if (["ready", "update-available"].includes(item.status)) {
      reusable.push(item);
    } else {
      conflicts.push(item);
    }
  }
  return { actions, reusable, conflicts };
}

function planComponents(options = {}) {
  const projectRoot = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  const catalog = loadCatalog(options.catalogPath);
  const usage = discoverUsage(projectRoot, catalog, options.scanPath || "src", options.sourceFiles);
  const selected = selectComponents(catalog, options, usage);
  const lock = readLock(projectRoot);
  const dependencies = dependencyMap(projectRoot);
  const inspections = selected.map((component) => inspectComponent({
    projectRoot,
    catalog,
    component,
    lock,
    dependencies,
  }));
  const groups = buildPlanGroups(inspections);
  const snapshot = inspections.map(toPlanSnapshot);
  return {
    planSchemaVersion: PLAN_SCHEMA_VERSION,
    projectRoot,
    catalogPath: catalog.catalogPath,
    scanPath: options.scanPath || "src",
    selected: selected.map((component) => component.name),
    usage,
    inspections,
    ...groups,
    planHash: createPlanHash("component-materialization", snapshot),
  };
}

function writeComponentTemp(item) {
  const tempDir = `${item.targetDir}.wl-tmp-${process.pid}-${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });
  const files = item.status === "partial" ? item.missingFiles : item.component.files;
  for (const file of files) {
    const source = resolveInside(item.sourceDir, file, `${item.component.name} source`);
    const target = resolveInside(tempDir, file, `${item.component.name} temp target`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  return tempDir;
}

function removeDirectories(directories) {
  for (const directory of directories) fs.rmSync(directory, { recursive: true, force: true });
}

function mergeComponentFiles(item, tempDir, createdFiles) {
  for (const file of item.missingFiles) {
    const source = resolveInside(tempDir, file, `${item.component.name} temp source`);
    const target = resolveInside(item.targetDir, file, `${item.component.name} target file`);
    if (fs.existsSync(target)) throw new Error(`${item.component.targetDir}/${file} 已存在，禁止覆盖`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
    createdFiles.push(target);
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function lockEntryFor(item, packageVersion) {
  return {
    contractVersion: item.component.contractVersion,
    ownership: item.status === "partial" ? "project-extended" : "kit-snapshot",
    packageVersion,
    targetDir: item.component.targetDir,
    files: item.hashes,
  };
}

function writeLock(projectRoot, lock) {
  const lockPath = path.join(projectRoot, LOCK_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const tempPath = `${lockPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(tempPath, lockPath);
  } catch (error) {
    if (!fs.existsSync(lockPath) || !["EEXIST", "EPERM"].includes(error?.code)) {
      fs.rmSync(tempPath, { force: true });
      throw error;
    }
    const previous = fs.readFileSync(lockPath);
    try {
      fs.copyFileSync(tempPath, lockPath);
    } catch (copyError) {
      fs.writeFileSync(lockPath, previous);
      throw copyError;
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  }
}

function packageVersion() {
  return require("../package.json").version;
}

function refreshPlan(plan) {
  return planComponents({
    projectRoot: plan.projectRoot,
    catalogPath: plan.catalogPath,
    scanPath: plan.scanPath,
    names: plan.selected,
  });
}

function validateAndRefreshPlan(plan, expectedHash) {
  if (!expectedHash || expectedHash !== plan.planHash) {
    throw new Error("component planHash 缺失或已失效，请重新预览");
  }
  const refreshed = refreshPlan(plan);
  if (refreshed.planHash !== expectedHash) {
    throw new Error("组件目录或依赖已变化，旧 planHash 已失效，请重新预览");
  }
  if (refreshed.conflicts.length > 0) throw new Error("存在组件冲突，禁止落盘");
  return refreshed;
}

function installWholeComponent(item, tempDir, createdDirectories) {
  if (fs.existsSync(item.targetDir)) throw new Error(`${item.component.targetDir} 已存在，禁止覆盖`);
  fs.mkdirSync(path.dirname(item.targetDir), { recursive: true });
  fs.renameSync(tempDir, item.targetDir);
  createdDirectories.push(item.targetDir);
}

function stageComponentActions(actions) {
  const staged = [];
  try {
    for (const item of actions) staged.push([item, writeComponentTemp(item)]);
    return staged;
  } catch (error) {
    removeDirectories(staged.map((entry) => entry[1]));
    throw error;
  }
}

function installStagedComponents(staged, state) {
  for (const [item, tempDir] of staged) {
    if (item.status === "partial") mergeComponentFiles(item, tempDir, state.createdFiles);
    else installWholeComponent(item, tempDir, state.createdDirectories);
  }
}

function updateComponentLock(plan) {
  const lock = readLock(plan.projectRoot);
  for (const item of plan.actions) {
    lock.components[item.component.name] = lockEntryFor(item, packageVersion());
  }
  writeLock(plan.projectRoot, lock);
}

function rollbackComponentInstall(staged, state) {
  removeDirectories(staged.map((entry) => entry[1]));
  removeDirectories(state.createdDirectories);
  for (const file of state.createdFiles) fs.rmSync(file, { force: true });
}

function applyComponentPlanUnlocked(plan, expectedHash) {
  const refreshed = validateAndRefreshPlan(plan, expectedHash);
  const staged = stageComponentActions(refreshed.actions);
  const state = { createdDirectories: [], createdFiles: [] };
  try {
    installStagedComponents(staged, state);
    updateComponentLock(refreshed);
    return refreshed.actions.map((item) => item.component.targetDir);
  } catch (error) {
    rollbackComponentInstall(staged, state);
    throw error;
  }
}

function applyComponentPlan(plan, expectedHash) {
  const key = `component:${path.resolve(plan.projectRoot)}`;
  return withFileLock(key, () => applyComponentPlanUnlocked(plan, expectedHash));
}

function componentIssues(options = {}) {
  const plan = planComponents(options);
  const issues = [];
  for (const item of plan.actions) {
    issues.push({
      level: "error",
      rule: "C1",
      dir: item.component.targetDir,
      text: `${item.component.name} 被页面引用但尚未落盘；先执行 component ensure 预览并确认`,
    });
  }
  for (const item of plan.conflicts) {
    issues.push({
      level: "error",
      rule: "C2",
      dir: item.component.targetDir,
      text: `${item.component.name} 暂不能落盘：${item.reason}`,
    });
  }
  for (const item of plan.reusable.filter((entry) => entry.status === "update-available")) {
    issues.push({
      level: "info",
      rule: "C3",
      dir: item.component.targetDir,
      text: `${item.component.name} 有同契约的新实现可评估，当前版本未被自动覆盖`,
    });
  }
  for (const item of plan.reusable.filter((entry) => ["project-owned", "customized"].includes(entry.status))) {
    issues.push({
      level: "info",
      rule: "C4",
      dir: item.component.targetDir,
      text: `${item.component.name} 使用项目真实实现；生成页面前须读取其 Props、Events 与 Expose`,
    });
  }
  return { ...plan, issues };
}

module.exports = {
  DEFAULT_CATALOG_PATH,
  LOCK_RELATIVE_PATH,
  applyComponentPlan,
  componentIssues,
  discoverUsage,
  fileHash,
  loadCatalog,
  planComponents,
};

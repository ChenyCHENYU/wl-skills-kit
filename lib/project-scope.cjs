"use strict";

// Independent snapshot: project adoption is checked before skill intent or writes.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const CONFIG = ".wl-skills-scope.json";
const MANIFESTS = {
  kit: ".wl-skills-manifest.json", ui: ".wl-skills-ui-manifest.json",
  bd: ".wl-skills-bd-manifest.json", design: ".wl-skills-design/state.json", test: ".wl-skills-test/manifest.json",
};
const TYPES = new Set(["pc", "backend", "documents", "testing", "mobile", "workspace", "unknown"]);

function inside(root, target) {
  const rel = path.relative(root, target);
  return !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`);
}

// Resolve missing paths through their nearest existing ancestor, including symlinks.
function realTarget(target) {
  if (fs.existsSync(target)) return fs.realpathSync(target);
  const parent = path.dirname(target);
  if (parent === target) throw new Error("Cannot resolve target ancestor");
  return path.join(realTarget(parent), path.basename(target));
}

function readJson(root, relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return { present: false, value: null };
  try {
    if (!inside(root, fs.realpathSync(file))) throw new Error("metadata path escapes project");
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected object");
    return { present: true, value };
  } catch (error) { return { present: true, value: null, error: `${relative}: ${error.message}` }; }
}

function boundary(root, fallback) {
  const markers = ["package.json", ".git", CONFIG, ...Object.values(MANIFESTS)];
  // A Java project's Maven modules share its adoption; a nested independent repo still stops lookup.
  if (root === fallback || !fs.existsSync(path.join(fallback, "pom.xml"))) markers.push("pom.xml");
  return markers.some((file) => fs.existsSync(path.join(root, file)));
}

function nearestRoot(target, fallback) {
  let dir = fs.existsSync(target) && fs.statSync(target).isDirectory() ? target : path.dirname(target);
  while (inside(fallback, dir)) {
    if (boundary(dir, fallback) || dir === fallback) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function targetRoots(root, targets) {
  const resolved = targets.map((target) => realTarget(path.resolve(root, target)));
  if (resolved.some((target) => !inside(root, target))) return { error: "target-outside-authorized-project", roots: [], resolved };
  return { roots: [...new Set(resolved.map((target) => nearestRoot(target, root)))], resolved };
}

function scopeConfig(root) {
  const config = readJson(root, CONFIG);
  if (!config.present || config.error) return config;
  const { value } = config;
  const allowed = ["schemaVersion", "projectType", "packages"];
  if (value.schemaVersion !== 1 || !TYPES.has(value.projectType) || Object.keys(value).some((key) => !allowed.includes(key)) || !validPackageSwitches(value.packages)) {
    return { ...config, error: `${CONFIG}: invalid schemaVersion/projectType/packages` };
  }
  return config;
}

function validPackageSwitches(packages) {
  if (packages === undefined) return true;
  return Boolean(packages && typeof packages === "object" && !Array.isArray(packages) && Object.entries(packages).every(([key, enabled]) => Object.hasOwn(MANIFESTS, key) && typeof enabled === "boolean"));
}

function mobileEvidence(root, pkg) {
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const mobile = deps.filter((name) => /^@dcloudio\/uni(?:-|$)|^@tarojs\/|^react-native$|^expo$|^@ionic\/|^@capacitor\//.test(name));
  if (fs.existsSync(path.join(root, "pages.json")) && fs.existsSync(path.join(root, "manifest.json"))) mobile.push("pages.json+manifest.json");
  return mobile;
}

function adoption(root, key, packageName, pkg, config) {
  const manifest = readJson(root, MANIFESTS[key]);
  validateAdoptionManifest(manifest, key, packageName);
  const declared = [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies].some((deps) => deps?.[packageName]);
  const explicit = config.value?.packages?.[key] === true;
  const installed = manifest.present && !manifest.error;
  return { adopted: explicit || declared || installed, sources: [
    ...(explicit ? [`${CONFIG}:packages.${key}`] : []), ...(declared ? ["package.json:direct-dependency"] : []),
    ...(installed ? [MANIFESTS[key]] : []),
  ], error: manifest.error || null };
}

function validateAdoptionManifest(manifest, key, packageName) {
  if (!manifest.present || manifest.error) return;
  const { value } = manifest;
  if (typeof value.version !== "string" || !value.version.trim() || value.package && value.package !== packageName) manifest.error = `${MANIFESTS[key]}: invalid package/version`;
}

function verdict(status, reason, extra = {}) {
  return { schemaVersion: 1, status, reason, adopted: false, projectType: "unknown", evidence: [], inherited: false, ...extra };
}

function inspectProject(root, key, packageName) {
  const config = scopeConfig(root);
  const packageFile = readJson(root, "package.json");
  if (config.error || packageFile.error) return verdict("needs-context", "invalid-project-metadata", { diagnostics: [config.error || packageFile.error] });
  const pkg = packageFile.value || {};
  if (!["dependencies", "devDependencies", "optionalDependencies"].every((field) => validDependencies(pkg[field]))) {
    return verdict("needs-context", "invalid-project-metadata", { diagnostics: ["package.json: dependency declarations must be nonempty strings"] });
  }
  const exclusion = platformExclusion(root, key, pkg, config);
  if (exclusion) return exclusion;
  const own = adoption(root, key, packageName, pkg, config);
  if (own.error) return verdict("needs-context", "invalid-package-adoption", { diagnostics: [own.error] });
  if (!own.adopted) return verdict("not-applicable", "package-not-adopted-in-target-project");
  return adoptedScope(root, key, pkg, config, own);
}

function validDependencies(deps) {
  if (deps === undefined) return true;
  return Boolean(deps && typeof deps === "object" && !Array.isArray(deps) && Object.values(deps).every((value) => typeof value === "string" && value.trim()));
}

function platformExclusion(root, key, pkg, config) {
  const mobile = mobileEvidence(root, pkg);
  const type = config.value?.projectType;
  if (mobile.length || type === "mobile") return verdict("not-applicable", "mobile-project-excluded", { projectType: "mobile", evidence: mobile.length ? mobile : [CONFIG] });
  if (type === "workspace") return verdict("not-applicable", "aggregate-workspace-is-not-project", { projectType: type, evidence: [CONFIG] });
  if (config.value?.packages?.[key] === false) return verdict("not-applicable", "package-explicitly-disabled", { projectType: type || "unknown", evidence: [CONFIG] });
  return null;
}

function unsupportedFrontend(root, key, pkg, type) {
  if (!["kit", "ui"].includes(key)) return false;
  if (type && type !== "pc") return "pc-frontend-package-excluded";
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return !deps.vue && (deps.react || deps.svelte || deps["@angular/core"] || fs.existsSync(path.join(root, "pom.xml"))) ? "unsupported-project-framework" : false;
}

function defaultType(key) { return { kit: "pc", ui: "pc", bd: "backend", design: "documents", test: "testing" }[key]; }

function scopeFingerprint(root, key) {
  const metadata = [CONFIG, "package.json", "pom.xml", MANIFESTS[key], "pages.json", "manifest.json"].map((file) => {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) return [file, "missing"];
    if (!inside(root, fs.realpathSync(full))) return [file, "external-metadata"];
    try { return [file, crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex")]; }
    catch (error) { return [file, `unreadable:${error.code}`]; }
  });
  return crypto.createHash("sha256").update(JSON.stringify(metadata)).digest("hex");
}

function adoptedScope(root, key, pkg, config, own) {
  const type = config.value?.projectType;
  if (type === "unknown") return verdict("needs-context", "project-platform-needs-context", { adopted: true, evidence: own.sources });
  const unsupported = unsupportedFrontend(root, key, pkg, type);
  if (unsupported) return verdict("not-applicable", unsupported, { adopted: true, projectType: type || "unknown", evidence: ["package.json/pom.xml", ...own.sources] });
  return verdict("applicable", "target-project-explicitly-adopted-package", {
    adopted: true, projectType: type || defaultType(key),
    typeEvidence: type ? "explicit-config" : "adoption-default-not-host-observed", evidence: own.sources,
  });
}

/** Parent installation, Vue files and keyword matches are never adoption evidence. */
function resolveScope({ projectRoot, packageName, targets = [] }) {
  const root = fs.realpathSync(path.resolve(projectRoot || process.cwd()));
  const key = packageName.replace("@agile-team/wl-skills-", "");
  if (!Object.hasOwn(MANIFESTS, key)) throw new Error("Unknown WL package");
  const located = targetRoots(root, targets.filter((item) => typeof item === "string" && item.trim()));
  if (located.error || located.roots.length > 1) return { projectRoot: root, targets, scope: verdict("needs-context", located.error || "multiple-project-targets-split-required", { projectRoots: located.roots }) };
  const actualRoot = located.roots[0] || root;
  const actualTargets = located.resolved.map((target) => path.relative(actualRoot, target).split(path.sep).join("/") || ".");
  return { projectRoot: actualRoot, targets: actualTargets, scope: { ...inspectProject(actualRoot, key, packageName), projectRoot: actualRoot, fingerprint: scopeFingerprint(actualRoot, key) } };
}

function excludedDecision(scope) {
  const messages = {
    "mobile-project-excluded": "目标为移动端/UniApp/小程序项目，不适用本轮WL项目约束",
    "aggregate-workspace-is-not-project": "目标是聚合工作区，请指定实际已接入项目",
    "package-explicitly-disabled": "目标项目已明确禁用本包",
    "package-not-adopted-in-target-project": "目标项目未接入本包，不继承父目录或兄弟项目的安装",
    "pc-frontend-package-excluded": "目标项目不是已接入的PC前端，PC规范不适用",
    "unsupported-project-framework": "目标技术栈不是本包支持的Vue管理端，不套用PC Vue规范",
    "multiple-project-targets-split-required": "目标跨越多个项目，请按项目分别判定并复用任务runId",
    "target-outside-authorized-project": "目标超出当前授权项目边界，请从实际目标项目根调用",
    "project-platform-needs-context": "项目已接入但平台未确认，请确认PC/后端/文档/测试或移动端范围",
  };
  const reason = messages[scope.reason] || "项目范围元数据无效，需要核对后再应用规则";
  return { recordVersion: 1, status: scope.status, applicable: scope.status === "needs-context" ? null : false,
    reason, reasons: [reason], scope, selectedSkills: [], candidates: [], baselineRules: [], requiredRules: [],
    ruleDetails: [], requiredChecks: [], requiredFiles: [], missingInputs: scope.status === "needs-context" ? ["有效的目标项目范围"] : [],
    gaps: [], constraints: [], ready: false, executionStatus: "not-executed", validationStatus: "unverified",
    selectionEvidence: "project-scope-before-intent", hostDiscovery: "unverified", contentLoaded: "unverified", unverified: ["host-discovery", "model-read-canonical-files"] };
}

module.exports = { CONFIG, MANIFESTS, resolveScope, excludedDecision };

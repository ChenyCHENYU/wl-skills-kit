"use strict";

// 提交字典校验按实际源码和本地静态依赖收敛；全量检查沿用显式扫描范围。
const fs = require("node:fs");
const path = require("node:path");
const { resolveProjectPath } = require("./project-path");
const { isPathWithin } = require("./validate-config");
const { parseScriptAst } = require("./ast-rules");

const SOURCE = /\.(?:ts|tsx|js|jsx|vue)$/;
const DICTIONARY_REFERENCE = /(?:\b(?:logicValue|dictCode)\s*:|\buseDictOpts\s*\(|<jh-(?:select|radio|checkbox)\b[^>]*?\s:?dict\s*=)\s*["'][^"']+["']/;
const relative = (root, file) => path.relative(root, file).split(path.sep).join("/");

function sourceFiles(root) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || ["node_modules", ".git", "dist", "target"].includes(entry.name)) continue;
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(file));
    else if (SOURCE.test(file) || entry.name === "api.md") result.push(file);
  }
  return result;
}

function localImportBase(root, file, name) {
  if (typeof name !== "string") return;
  const input = name.startsWith("@/") ? path.join("src", name.slice(2))
    : name.startsWith(".") ? path.resolve(path.dirname(file), name) : undefined;
  if (!input) return;
  const relativePath = path.relative(root, path.resolve(root, input));
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) return;
  return resolveProjectPath(root, input);
}

function localDependency(root, file, name, missing) {
  const base = localImportBase(root, file, name);
  if (!base) return;
  const target = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.vue`, path.join(base, "index.ts")]
    .find(candidate => missing.has(candidate) || (fs.existsSync(candidate) && fs.statSync(candidate).isFile()));
  // 无后缀导入的真实文件可能是链接，必须在读取选中依赖前再次验证完整路径。
  return target ? resolveProjectPath(root, target) : undefined;
}

function importNodes(script) {
  const ast = parseScriptAst(script);
  return (ast?.program.body || []).filter(node => ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type));
}

function localDependencies(root, file, source, missing) {
  let scripts = [source];
  if (file.endsWith(".vue")) {
    const { descriptor } = require("@vue/compiler-sfc").parse(source, { filename: file });
    scripts = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean);
  }
  const imports = scripts.flatMap(importNodes);
  return imports.map(node => localDependency(root, file, node.source?.value, missing))
    .filter(target => target && SOURCE.test(target));
}

function hasDictionaryUse(files) {
  return files.some(file => {
    const source = fs.readFileSync(file, "utf8");
    return DICTIONARY_REFERENCE.test(source) || /```dict-contract\s*\r?\n/.test(source);
  });
}

/** Staged deletions stay in scope while their contracts or direct importers survive. */
function retainedDeletions(root, staged, scanRoot) {
  const deleted = staged.filter(file => path.basename(file) === "dicts.ts" && !fs.existsSync(file));
  if (!deleted.length) return [];
  const sources = sourceFiles(scanRoot).filter(file => SOURCE.test(file));
  const missing = new Set(deleted);
  return deleted.filter(file => {
    if (hasDictionaryUse(sourceFiles(path.dirname(file)))) return true;
    return sources.some(source => localDependencies(root, source, fs.readFileSync(source, "utf8"), missing).includes(file));
  });
}

function collectDependencies(root, staged, missing) {
  const seen = new Set();
  const pending = staged.filter(file => SOURCE.test(file));
  let explicit = false;
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (path.basename(file) === "dicts.ts") explicit = true;
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    if (DICTIONARY_REFERENCE.test(source)) explicit = true;
    pending.push(...localDependencies(root, file, source, missing));
  }
  return { files: seen, explicit };
}

function resolveDictionaryValidationScope(root, scanPath, candidates, stagedFiles) {
  if (!stagedFiles) return { files: candidates, explicit: false, changedApis: [], inputs: [] };
  const staged = Array.from(stagedFiles, file => resolveProjectPath(root, file.replace(/\\/g, "/")));
  const removed = retainedDeletions(root, staged, resolveProjectPath(root, scanPath, { allowRoot: true }));
  const missing = new Set(removed);
  const dependencies = collectDependencies(root, staged, missing);
  const available = new Set([...candidates, ...removed]);
  for (const file of dependencies.files)
    if (path.basename(file) === "dicts.ts" && (fs.existsSync(file) || missing.has(file))) available.add(file);
  const changedApis = staged.filter(file => path.basename(file) === "api.md");
  const changedContracts = staged.filter(file => path.basename(file) === "dicts.ts");
  const touched = [...staged, ...dependencies.files];
  const global = staged.some(file => relative(root, file) === ".wl-skills-validate.json");
  const files = Array.from(available).filter(file => global || touched.some(source =>
    isPathWithin(relative(root, source), relative(root, path.dirname(file))))).sort();
  const inputs = [...new Set([...dependencies.files, ...files, ...files.flatMap(file => sourceFiles(path.dirname(file)))])];
  return { files, explicit: dependencies.explicit || changedApis.length > 0 || changedContracts.length > 0, changedApis, inputs };
}

module.exports = { resolveDictionaryValidationScope };

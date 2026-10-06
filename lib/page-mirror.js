"use strict";

// 页面镜像只读取真实实现，不执行页面模块，不把旧 JSON 当成字段或交互来源。
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createRequire } = require("module");
const { resolveProjectPath } = require("./project-path");

const KIND = "wl-page-mirror";
const normalize = (value) => value.replace(/\r\n?/g, "\n");
const relative = (root, file) => path.relative(root, file).split(path.sep).join("/");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

function sourceReferences(source) {
  const references = new Set();
  const patterns = [
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g,
    /@(?:import|use|forward)\s+["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) references.add(match[1]);
  }
  return [...references].sort();
}

// 动态加载不能猜目标；保留原表达式，明确标记还原需要补充依赖。
const isModuleLoader = (node) => node.type === "CallExpression" &&
  (node.callee.type === "Import" || node.callee.name === "require");

function visitSyntax(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((item) => visitSyntax(item, visit));
    else if (value && typeof value.type === "string") visitSyntax(value, visit);
  }
}

function dynamicReferences(source, file) {
  if (/\.s?css$/.test(file)) return [];
  if (file.endsWith(".vue")) {
    const { descriptor } = require("@vue/compiler-sfc").parse(source);
    source = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join("\n");
  }
  const ast = require("@babel/parser").parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const references = [];
  visitSyntax(ast.program, (node) => {
    if (isModuleLoader(node) && node.arguments[0]?.type !== "StringLiteral")
      references.push(`[dynamic] ${source.slice(node.start, node.end)}`);
  });
  return references;
}

function localReference(root, importer, reference) {
  if (!reference.startsWith(".") && !reference.startsWith("@/")) return null;
  const base = reference.startsWith("@/")
    ? path.join(root, "src", reference.slice(2))
    : path.resolve(path.dirname(importer), reference);
  const extensions = ["", ".ts", ".js", ".vue", ".scss", ".css", "/index.ts", "/index.vue"];
  for (const extension of extensions) {
    const candidate = resolveProjectPath(root, base + extension);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function packageName(reference) {
  return reference.startsWith("@") ? reference.split("/").slice(0, 2).join("/") : reference.split("/")[0];
}

function dependencyVersions(root, references) {
  const file = path.join(root, "package.json");
  const pkg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const versions = { ...pkg.devDependencies, ...pkg.dependencies };
  return [...references].sort().map((name) => ({ name, version: versions[name] || null }));
}

function recordReference(context, file, reference) {
  const { root, pending, packages, unresolved } = context;
  if (!reference.startsWith(".") && !reference.startsWith("@/")) {
    packages.add(packageName(reference));
    return;
  }
  const dependency = localReference(root, file, reference);
  if (!dependency || !/\.(?:ts|js|vue|s?css)$/.test(dependency)) {
    unresolved.push({ file: relative(root, file), reference });
    return;
  }
  pending.push(dependency);
}

const componentName = (tag) => {
  const name = tag.replace(/-(\w)/g, (_match, letter) => letter.toUpperCase());
  return name[0]?.toUpperCase() + name.slice(1);
};

function declaredComponent(member) {
  if (member.type !== "TSPropertySignature") return null;
  const reference = member.typeAnnotation?.typeAnnotation?.objectType?.exprName?.argument?.value;
  const name = member.key.name || member.key.value;
  return typeof name === "string" && typeof reference === "string" ? { name, reference } : null;
}

// 自动导入组件不出现在页面 import 中；用插件生成的声明补齐依赖，不执行 Vite 配置。
function componentDeclarations(root) {
  const components = new Map();
  for (const name of ["src/components.d.ts", "components.d.ts"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const ast = require("@babel/parser").parse(fs.readFileSync(file, "utf8"), {
      sourceType: "module", plugins: ["typescript"],
    });
    visitSyntax(ast.program, (node) => {
      if (node.type === "TSInterfaceDeclaration" && node.id.name === "GlobalComponents") {
        for (const member of node.body.body) {
          const declaration = declaredComponent(member);
          if (!declaration) continue;
          const key = componentName(declaration.name);
          const records = components.get(key) || [];
          records.push({ file, reference: declaration.reference });
          components.set(key, records);
        }
      }
    });
  }
  return components;
}

function importedComponentNames(descriptor) {
  const bindings = new Set();
  for (const script of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
    const ast = require("@babel/parser").parse(script.content, { sourceType: "module", plugins: ["typescript", "jsx"] });
    for (const statement of ast.program.body) {
      if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue;
      for (const item of statement.specifiers)
        if (item.importKind !== "type") bindings.add(componentName(item.local.name));
    }
  }
  return bindings;
}

function recordAutomaticComponent(context, file, tag, records) {
  const targets = records.map((record) => ({
    ...record, target: localReference(context.root, record.file, record.reference),
  }));
  const identities = new Set(targets.map((record) => record.target || record.reference));
  if (identities.size > 1) {
    context.unresolved.push({ file: relative(context.root, file), reference: `[component] ${tag}: 声明冲突` });
    return;
  }
  const record = targets[0];
  // 保留实际声明作为编译证据，让隔离还原后可重新识别同一组模板依赖。
  // 声明本身不展开静态 import，避免把未使用组件的源码一并归档。
  context.pending.push(record.file);
  recordReference(context, record.file, record.reference);
  if (record.target) context.autoImportedComponents.push({
    file: relative(context.root, file), name: tag,
    source: relative(context.root, record.target), declaration: relative(context.root, record.file),
  });
}

function recordTemplateComponents(context, file, source) {
  if (!file.endsWith(".vue") || !context.components.size) return;
  const compiler = require("@vue/compiler-sfc");
  const { descriptor } = compiler.parse(source);
  const { template } = descriptor;
  if (!template) return;
  const bindings = importedComponentNames(descriptor);
  // compiler-sfc 3.2 尚未在 parse 结果中提供模板 AST，沿其自身依赖解析以保持兼容。
  const ast = template.ast || createRequire(require.resolve("@vue/compiler-sfc"))
    ("@vue/compiler-dom").parse(template.content);
  const visit = (node) => {
    if (node.type === 1 && node.tagType === 1 && !bindings.has(componentName(node.tag))) {
      const records = context.components.get(componentName(node.tag));
      if (records) recordAutomaticComponent(context, file, node.tag, records);
    }
    for (const child of node.children || []) visit(child);
  };
  visit(ast);
}

function recordSourceDependencies(context, file, content) {
  // 文档示例和全局声明不是运行依赖；自动组件仅按模板实际引用递归展开。
  if (file.endsWith(".md") || context.declarationFiles.has(file)) return;
  for (const reference of sourceReferences(content)) recordReference(context, file, reference);
  for (const reference of dynamicReferences(content, file))
    context.unresolved.push({ file: relative(context.root, file), reference });
  recordTemplateComponents(context, file, content);
}

function collectSources(root, directory, bundle) {
  const entryFiles = ["data.ts", "index.vue", "index.scss", "api.md"]
    .map((name) => resolveProjectPath(root, path.join(directory, name)))
    .filter((file) => fs.existsSync(file));
  for (const name of ["data.ts", "index.vue"]) {
    if (!entryFiles.includes(path.join(directory, name))) throw new Error(`页面缺少 ${name}`);
  }
  const context = {
    root, pending: [...entryFiles], packages: new Set(), unresolved: [],
    components: componentDeclarations(root), autoImportedComponents: [],
    declarationFiles: new Set(["src/components.d.ts", "components.d.ts"].map((name) => path.join(root, name))),
  };
  const sources = new Map();
  while (context.pending.length) {
    const file = context.pending.shift();
    if (sources.has(file)) continue;
    const content = normalize(fs.readFileSync(file, "utf8"));
    sources.set(file, {
      path: relative(root, file),
      sha256: digest(content),
      ...((bundle || entryFiles.includes(file)) ? { content } : {}),
    });
    recordSourceDependencies(context, file, content);
  }
  return {
    sources: [...sources.values()].sort((a, b) => a.path.localeCompare(b.path, "en")),
    packages: dependencyVersions(root, context.packages),
    unresolved: context.unresolved,
    autoImportedComponents: context.autoImportedComponents,
  };
}

function definitionEvidence(source) {
  const { parse } = require("@babel/parser");
  const ast = parse(source, { sourceType: "module", plugins: ["typescript"] });
  for (const statement of ast.program.body) {
    const declaration = statement.declaration || statement;
    const item = declaration.declarations?.find((node) => node.id?.name === "pageDefinition");
    if (item?.init) {
      const object = item.init.type === "CallExpression" ? item.init.arguments[0] : item.init;
      const identity = Object.fromEntries((object?.properties || [])
        .filter((property) => ["code", "name"].includes(property.key?.name || property.key?.value) && property.value?.type === "StringLiteral")
        .map((property) => [property.key.name || property.key.value, property.value.value]));
      return { $source: source.slice(item.init.start, item.init.end), ...identity };
    }
  }
  return null;
}

function templateBindings(source) {
  const { parse } = require("@vue/compiler-sfc");
  const template = parse(source).descriptor.template?.content || "";
  return [...template.matchAll(/((?:@|:)[\w:.-]+|v-[\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)]
    .map((match) => ({ binding: match[1], expression: match[3] }));
}

function serializeDefinition(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (item === undefined) return { $undefined: true };
    return typeof item === "function" ? { $function: item.toString() } : item;
  }));
}

// 没有页面定义时只取接口标题的页面名，去掉文档用途后缀。
const headingPageName = (name) => name?.replace(/\s+(?:API\s*契约|接口契约|接口约定)$/, "");

function mirrorIdentity(options, heading, directory, sourceDefinition) {
  const definition = sourceDefinition || {};
  const [, code, name] = heading || [];
  return {
    schemaVersion: 1,
    role: "mirror",
    domain: options.domain || null,
    pageId: definition.code || options.pageId || code || null,
    page: definition.name || options.page || headingPageName(name) || path.basename(directory),
  };
}

function buildPageMirror(root, inputPath, options = {}) {
  root = path.resolve(root);
  const target = resolveProjectPath(root, inputPath);
  const directory = fs.statSync(target).isFile() ? path.dirname(target) : target;
  const evidence = collectSources(root, directory, options.bundle === true);
  const find = (name) => evidence.sources.find((file) => file.path === relative(root, path.join(directory, name)))?.content || "";
  const definition = options.definition === undefined
    ? definitionEvidence(find("data.ts"))
    : serializeDefinition(options.definition);
  const heading = find("api.md").split("\n", 1)[0].match(/^#\s+(\S+)\s+(.+)$/);
  const spec = {
    ...mirrorIdentity(options, heading, directory, definition),
    dir: relative(root, directory),
    mirror: {
      kind: KIND,
      sourceOfTruth: "./data.ts",
      definition,
      bindings: templateBindings(find("index.vue")),
      sourceHash: digest(JSON.stringify(evidence.sources.map(({ path: file, sha256 }) => [file, sha256]))),
      ...evidence,
      restoration: {
        localSources: options.bundle ? "embedded" : "entry-embedded-dependencies-referenced",
        externalPackagesRequired: evidence.packages.length > 0,
        unresolvedReferences: evidence.unresolved.length,
        dependencyResolution: evidence.autoImportedComponents?.length
          ? "static-imports-and-component-declarations" : "static-imports-only",
        definitionExtraction: options.definition === undefined ? "source-evidence" : "evaluated-definition",
      },
    },
  };
  spec.mirrorHash = digest(JSON.stringify(spec));
  return spec;
}

function inspectMirrorSource(root, file) {
  if (!file || typeof file.path !== "string") return ["镜像含无效源码记录，请重新提取"];
  const issues = [];
  try {
    const actual = normalize(fs.readFileSync(resolveProjectPath(root, file.path), "utf8"));
    if (digest(actual) !== file.sha256) issues.push(`源码已更新，请重新提取镜像：${file.path}`);
    if (file.content !== undefined && digest(file.content) !== file.sha256) issues.push(`镜像源码证据被手改：${file.path}`);
  } catch (error) {
    issues.push(`镜像依赖需要重新确认：${file.path}（${error.message}）`);
  }
  return issues;
}

function inspectPageMirror(root, spec) {
  const mirror = spec?.mirror;
  if (spec?.role !== "mirror" || mirror?.kind !== KIND || mirror.sourceOfTruth !== "./data.ts") {
    return ["镜像缺少 role、kind 或 data.ts 来源声明"];
  }
  if (!Array.isArray(mirror.sources) || !mirror.sources.length) return ["镜像缺少源码证据"];
  const { mirrorHash, ...content } = spec;
  const issues = mirror.sources.flatMap((file) => inspectMirrorSource(root, file));
  if (digest(JSON.stringify(content)) !== mirrorHash) issues.push("镜像结构被手改，请从真实实现重新提取");
  return issues;
}

function writePageMirror(root, spec, outputPath) {
  const target = resolveProjectPath(root, outputPath || path.join(spec.dir, "page-spec.json"));
  if (path.extname(target).toLowerCase() !== ".json") throw new Error("镜像仅支持写入 JSON 文件，不能覆盖页面源码");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(spec, null, 2)}\n`);
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return relative(root, target);
}

module.exports = { buildPageMirror, inspectPageMirror, writePageMirror };

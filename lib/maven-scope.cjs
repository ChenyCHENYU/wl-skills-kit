"use strict";

// Resolve only local, literal Maven aggregation + inheritance. Never run Maven,
// fetch parents, expand environment properties, or parse external XML entities.
const fs = require("node:fs");
const path = require("node:path");
const { SaxesParser } = require("./vendor/saxes/saxes.js");
const NS = "http://maven.apache.org/POM/4.0.0";
const inside = (root, file) => { const rel = path.relative(root, file); return !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`); };

function parsePom(xml) {
    const values = new Map(), seen = new Map(), stack = [];
    const parser = new SaxesParser({ xmlns: true });
    parser.on("doctype", () => { throw new Error("DOCTYPE is not scope evidence"); });
    parser.on("opentag", tag => {
      if (stack.length >= 128) throw new Error("POM too deep");
      stack.push({ name: tag.local, namespace: tag.uri, text: "", children: false });
      const key = stack.map(item => item.name).join("/"); seen.set(key, (seen.get(key) || 0) + 1);
      if (stack.length > 1) stack[stack.length - 2].children = true;
    });
    const text = value => { if (stack.length) stack.at(-1).text += value; };
    parser.on("text", text); parser.on("cdata", text);
    parser.on("closetag", () => {
      const key = stack.map(item => item.name).join("/");
      const node = stack.pop();
      if (node.children || !["", NS].includes(node.namespace) || stack.some(item => !["", NS].includes(item.namespace))) return;
      const entries = values.get(key) || [];
      entries.push(node.text.trim()); values.set(key, entries);
    });
    parser.write(xml).close();
    return pomModel(values, seen);
}

function pomModel(values, seen) {
  const scalars = ["modelVersion", "groupId", "artifactId", "version", "packaging", ...["groupId", "artifactId", "version", "relativePath"].map(key => `parent/${key}`)];
  if (["parent", "modules", ...scalars].some(key => (seen.get(`project/${key}`) || 0) > 1)) return null;
  if (scalars.some(key => seen.has(`project/${key}`) && values.get(`project/${key}`)?.length !== 1)) return null;
  const one = key => { const entries = values.get(`project/${key}`); return entries?.length === 1 ? entries[0] : null; };
  if (one("modelVersion") !== "4.0.0") return null;
  const literal = value => typeof value === "string" && value.length > 0 && !/[${}\p{Cc}]/u.test(value);
  const parent = Object.fromEntries(["groupId", "artifactId", "version", "relativePath"].map(key => [key, one(`parent/${key}`)]));
  const coordinates = [seen.has("project/groupId") ? one("groupId") : parent.groupId, one("artifactId"), seen.has("project/version") ? one("version") : parent.version];
  const result = { coordinates, parent, packaging: one("packaging"), modules: values.get("project/modules/module") || [], literal };
  if (!coordinates.every(literal)) return null;
  // Missing relativePath defaults to ../pom.xml; an explicitly empty value
  // intentionally disables local parent lookup.
  result.relativePath = values.has("project/parent/relativePath") ? parent.relativePath : "../pom.xml";
  return result;
}

function readPom(root, authorizedRoot, cache) {
  const file = path.join(root, "pom.xml");
  if (cache.has(file)) return cache.get(file);
  cache.set(file, null);
  try {
    if (!inside(authorizedRoot, fs.realpathSync(file)) || fs.statSync(file).size > 1024 * 1024) return null;
    const result = parsePom(fs.readFileSync(file, "utf8"));
    cache.set(file, result); return result;
  } catch { return null; }
}

function localPomFile(root, relative) {
  let file = path.resolve(root, relative);
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "pom.xml");
    return fs.realpathSync(file);
  } catch { return null; }
}

function parentLocation(file, root, authorizedRoot) {
  if (!file || path.basename(file) !== "pom.xml") return null;
  const parentRoot = path.dirname(file);
  return parentRoot !== root && inside(authorizedRoot, parentRoot) && inside(parentRoot, root) ? parentRoot : null;
}

function independentBetween(root, parentRoot, strongBoundary) {
  for (let dir = path.dirname(root); dir !== parentRoot; dir = path.dirname(dir)) {
    if (strongBoundary(dir) || fs.existsSync(path.join(dir, "pom.xml"))) return true;
  }
  return false;
}

function verifiedParent(root, authorizedRoot, strongBoundary, cache) {
  const child = readPom(root, authorizedRoot, cache);
  if (!child || !child.literal(child.relativePath)) return null;
  const parentRoot = parentLocation(localPomFile(root, child.relativePath), root, authorizedRoot);
  if (!parentRoot || independentBetween(root, parentRoot, strongBoundary)) return null;
  const parent = readPom(parentRoot, authorizedRoot, cache);
  if (!parent || parent.packaging !== "pom") return null;
  const fields = ["groupId", "artifactId", "version"];
  if (!parent.coordinates.every((value, index) => value === child.parent[fields[index]])) return null;
  const declared = parent.modules.some(module => parent.literal(module) && !path.isAbsolute(module) && localPomFile(parentRoot, module) === path.join(root, "pom.xml"));
  return declared ? parentRoot : null;
}

function mavenProjectRoot(start, authorizedRoot, strongBoundary) {
  const cache = new Map(); let root = start;
  while (root !== authorizedRoot && !strongBoundary(root)) {
    const parent = verifiedParent(root, authorizedRoot, strongBoundary, cache);
    if (!parent) break;
    root = parent;
  }
  return root;
}

module.exports = { mavenProjectRoot };

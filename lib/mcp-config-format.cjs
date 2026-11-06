"use strict";

// Contribution-only edits. Parse the complete document, but never serialize the
// user's other settings, comments, credentials or foreign MCP server entries.
const crypto = require("node:crypto");
const jsonc = () => require("./shared-jsonc.cjs");
const jsoncParser = () => require("./vendor/jsonc-parser/main.js");
const toml = () => require("./vendor/smol-toml/index.cjs");
const hash = (value, algorithm = "sha256") => crypto.createHash(algorithm).update(value).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function lookup(value, segments) {
  for (const segment of segments) {
    if (!object(value) || !Object.hasOwn(value, segment)) return undefined;
    value = value[segment];
  }
  return value;
}

function document(text, format, label) {
  if (format !== "toml") return jsonc().parseJsonc(text, label);
  try { return toml().parse(text, { integersAsBigInt: "asNeeded", maxDepth: 64 }); }
  catch (error) { throw new Error(`${label}: invalid TOML at line ${error.line || "?"}, column ${error.column || "?"}`); }
}

function valueText(value, serialization = "json") {
  if (serialization === "stable") {
    const stable = item => Array.isArray(item) ? item.map(stable) : object(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, stable(item[key])])) : item;
    value = stable(value);
  }
  return JSON.stringify(value, (_, item) => typeof item === "bigint" ? `${item}n` : item);
}

function markerRange(text, key) {
  const begin = `# wl-skills-mcp:${key}:begin`;
  const end = `# wl-skills-mcp:${key}:end`;
  const lines = text.split(/(?<=\n)/);
  let offset = 0, start = null, finish = null;
  for (const line of lines) {
    const trimmed = line.replace(/\r?\n$/, "");
    if (trimmed === begin) {
      if (start !== null) throw new Error("duplicate MCP ownership marker");
      start = offset;
    }
    if (trimmed === end) {
      if (finish !== null) throw new Error("duplicate MCP ownership marker");
      finish = offset + line.length;
    }
    offset += line.length;
  }
  if (!completeMarker(start, finish)) return null;
  return { start, end: finish, raw: text.slice(start, finish) };
}

function completeMarker(start, finish) {
  if (start === null && finish === null) return false;
  if (start === null || finish === null || finish <= start) throw new Error("incomplete MCP ownership marker");
  return true;
}

function inspectEntry(text, target) {
  const parsed = document(text, target.format, target.path);
  for (let index = 1; index < target.serverPath.length; index++) {
    const container = lookup(parsed, target.serverPath.slice(0, index));
    if (container !== undefined && !object(container)) throw new Error(`${target.path}: MCP server container must be an object`);
  }
  const value = lookup(parsed, target.serverPath);
  if (target.format !== "toml") {
    const raw = value === undefined ? undefined : jsonc().getJsoncNodeText(text, target.serverPath, target.path);
    const property = jsonProperty(text, target.serverPath);
    return { value, raw, parsed, propertyRaw: property ? text.slice(property.offset, property.offset + property.length) : undefined,
      propertyLeading: property ? text.slice(property.offset, property.children[1].offset) : undefined };
  }
  const range = markerRange(text, target.serverKey);
  return { value, raw: range?.raw, range, parsed };
}

function tomlBlock(target, value, eol) {
  const server = Object.fromEntries([[target.serverKey, value]]);
  const body = toml().stringify({ mcp_servers: server }).replace(/\n/g, eol);
  return `# wl-skills-mcp:${target.serverKey}:begin${eol}${body}# wl-skills-mcp:${target.serverKey}:end${eol}`;
}

function removeToml(text, target, record) {
  const current = inspectEntry(text, target);
  if (!current.range) throw new Error("MCP table has no owned text block");
  // A marker inside a multiline value cannot own a real table elsewhere.
  const ownDocument = document(current.range.raw, "toml", target.path);
  if (valueText(lookup(ownDocument, target.serverPath)) !== valueText(current.value)) throw new Error("MCP marker does not own the complete server table");
  let { start } = current.range;
  if (record?.addedSeparator && text.slice(start - record.addedSeparator.length, start) === record.addedSeparator) start -= record.addedSeparator.length;
  const updated = text.slice(0, start) + text.slice(current.range.end);
  if (lookup(document(updated, "toml", target.path), target.serverPath) !== undefined) throw new Error("MCP table remains outside its owned text block");
  return updated;
}

function setEntry(text, target, value, record) {
  if (target.format !== "toml") {
    const content = jsonc().setJsoncValue(text, target.serverPath, value, target.path);
    const missing = createdContainers(document(text, target.format, target.path), target.serverPath)[0] || target.serverPath;
    return { content, insertionSpacing: insertionSpacing(text, content, missing) };
  }
  const current = inspectEntry(text, target);
  if (current.value !== undefined) text = removeToml(text, target, record);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const addedSeparator = text && !text.endsWith("\n") ? eol : "";
  const content = text + addedSeparator + tomlBlock(target, value, eol);
  document(content, "toml", target.path);
  return { content, addedSeparator };
}

function removeEntry(text, target, record) {
  if (target.format === "toml") return removeToml(text, target, record);
  let updated = removeJsonEntry(text, target.serverPath, record.insertionSpacing, target.path);
  for (const segments of [...(record.createdContainers || [])].reverse()) {
    const value = lookup(document(updated, target.format, target.path), segments);
    if (object(value) && Object.keys(value).length === 0 && removableContainer(updated, segments, target.path)) {
      updated = removeJsonEntry(updated, segments, record.insertionSpacing, target.path);
    }
  }
  return updated;
}

function createdContainers(parsed, serverPath) {
  const result = [];
  for (let index = 1; index < serverPath.length; index++) {
    const segments = serverPath.slice(0, index);
    if (lookup(parsed, segments) === undefined) result.push(segments);
  }
  return result;
}

function matchesRecord(current, record) {
  if (record.owned !== true || current.value === undefined) return false;
  if (record.legacy && !record.textHash && !plainJson(current.raw)) return false;
  if (!propertyMatches(current, record)) return false;
  const valueHash = hash(valueText(current.value, record.valueSerialization), record.hashAlgorithm);
  return valueHash === record.valueHash && rawMatches(current, record);
}

function rawMatches(current, record) {
  const rawText = record.textSerialization === "json" ? JSON.stringify(current.raw) : current.raw;
  const rawHash = rawText === undefined ? null : hash(rawText, record.hashAlgorithm);
  return !record.textHash || rawHash === record.textHash;
}

function propertyMatches(current, record) {
  if (record.propertyHash) return typeof current.propertyRaw === "string" && hash(current.propertyRaw, record.hashAlgorithm) === record.propertyHash;
  return !current.propertyLeading || plainJson(`{${current.propertyLeading}null}`);
}

function removableContainer(text, segments, label) {
  const property = jsonProperty(text, segments);
  const leading = text.slice(property.offset, property.children[1].offset);
  return plainJson(`{${leading}null}`) && plainJson(jsonc().getJsoncNodeText(text, segments, label));
}

function plainJson(text) {
  try { JSON.parse(text); return true; }
  catch { return false; }
}

function jsonProperty(text, segments) {
  const parser = jsoncParser(), tree = parser.parseTree(text, [], { allowTrailingComma: true });
  const node = parser.findNodeAtLocation(tree, segments);
  return node?.parent?.type === "property" ? node.parent : null;
}

function insertionSpacing(before, after, segments) {
  const property = jsonProperty(after, segments);
  if (!property) return undefined;
  let left = 0, suffix = 0;
  const end = property.offset + property.length;
  while (left < property.offset && before[left] === after[left]) left++;
  while (suffix < after.length - end && suffix < before.length - left && before.at(-suffix - 1) === after.at(-suffix - 1)) suffix++;
  if (before.length - suffix !== left) return undefined;
  const prefix = after.slice(left, property.offset), trailing = after.slice(end, after.length - suffix);
  if (!/^[\s,]*$/.test(prefix + trailing)) return undefined;
  return { path: segments, prefix, suffix: trailing };
}

function removeJsonEntry(text, segments, spacing, label) {
  if (spacing && valueText(spacing.path) === valueText(segments)) {
    const exact = removeWithSpacing(text, segments, spacing, label);
    if (exact !== null) return exact;
  }
  return jsonc().setJsoncValue(text, segments, undefined, label);
}

function removeWithSpacing(text, segments, spacing, label) {
  const property = jsonProperty(text, segments);
  if (!property) return null;
  const start = property.offset - spacing.prefix.length, end = property.offset + property.length;
  if (text.slice(start, property.offset) !== spacing.prefix || text.slice(end, end + spacing.suffix.length) !== spacing.suffix) return null;
  const candidate = text.slice(0, start) + text.slice(end + spacing.suffix.length);
  try { jsonc().parseJsonc(candidate, label); return candidate; }
  catch { return null; }
}

module.exports = { document, lookup, object, hash, valueText, inspectEntry, setEntry, removeEntry, createdContainers, matchesRecord };

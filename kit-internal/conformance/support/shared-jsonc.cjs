"use strict";

// Shipped inside each package: no sibling package or network is required at runtime.
const parser = require("./vendor/jsonc-parser/main.js");
const OPTIONS = { allowTrailingComma: true, disallowComments: false };

function checkDuplicates(node, label) {
  if (node.type === "object") {
    const names = new Set();
    for (const property of node.children || []) {
      const name = property.children[0].value;
      if (names.has(name)) throw new Error(`${label}: duplicate JSON key ${name}`);
      names.add(name);
    }
  }
  for (const child of node.children || []) checkDuplicates(child, label);
}

function parseJsonc(text, label = "shared configuration") {
  const errors = [];
  const tree = parser.parseTree(text, errors, OPTIONS);
  if (errors.length || !tree) {
    const reason = errors.map((error) => `${parser.printParseErrorCode(error.error)}@${error.offset}`).join(", ");
    throw new Error(`${label}: invalid JSON/JSONC ${reason}`);
  }
  if (tree.type !== "object") throw new Error(`${label}: root must be an object`);
  checkDuplicates(tree, label);
  return JSON.parse(JSON.stringify(parser.getNodeValue(tree)));
}

function getJsoncValue(text, segments, label) {
  parseJsonc(text, label);
  const tree = parser.parseTree(text, [], OPTIONS);
  const node = parser.findNodeAtLocation(tree, segments);
  return node ? JSON.parse(JSON.stringify(parser.getNodeValue(node))) : undefined;
}

function getJsoncNodeText(text, segments, label) {
  parseJsonc(text, label);
  const tree = parser.parseTree(text, [], OPTIONS);
  const node = parser.findNodeAtLocation(tree, segments);
  return node ? text.slice(node.offset, node.offset + node.length) : undefined;
}

function parentNode(text, segments, label) {
  let tree = parser.parseTree(text, [], OPTIONS);
  const traversed = [];
  let index = 0;
  for (; index < segments.length - 1; index++) {
    const node = parser.findNodeAtLocation(tree, [segments[index]]);
    if (!node) break;
    if (node.type !== "object") throw new Error(`${label || "shared configuration"}: ${segments[index]} must be an object`);
    tree = node;
    traversed.push(segments[index]);
  }
  return { tree, traversed, index };
}

function removeProperty(text, tree, property) {
  const properties = tree.children || [];
  const position = properties.indexOf(property);
  const end = property.offset + property.length;
  const limit = properties[position + 1]?.offset || tree.offset + tree.length - 1;
  const nextComma = commaAt(text, end, limit);
  if (nextComma !== undefined) return text.slice(0, property.offset) + text.slice(end, nextComma) + text.slice(nextComma + 1);
  const previous = properties[position - 1];
  const previousComma = previous ? commaAt(text, previous.offset + previous.length, property.offset) : undefined;
  const updated = text.slice(0, property.offset) + text.slice(end);
  return previousComma === undefined ? updated : updated.slice(0, previousComma) + updated.slice(previousComma + 1);
}

function addProperty(text, tree, key, value) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const unit = text.match(/^[ \t]+(?=")/m)?.[0] || "  ";
  const lineStart = text.lastIndexOf("\n", tree.offset) + 1;
  const parentIndent = text.slice(lineStart, tree.offset).match(/^[ \t]*/)[0];
  const childIndent = parentIndent + unit;
  const entry = `${JSON.stringify(key)}: ${JSON.stringify(value)}`;
  const properties = tree.children || [];
  const last = properties[properties.length - 1];
  if (!last) {
    const at = tree.offset + 1;
    return text.slice(0, at) + eol + childIndent + entry + eol + parentIndent + text.slice(at);
  }
  const end = last.offset + last.length;
  const trailingComma = commaAt(text, end, tree.offset + tree.length - 1);
  const at = trailingComma === undefined ? end : trailingComma + 1;
  const inserted = trailingComma === undefined ? `,${eol}${childIndent}${entry}` : `${eol}${childIndent}${entry},`;
  return text.slice(0, at) + inserted + text.slice(at);
}

function updateProperty(text, tree, key, value) {
  const property = (tree.children || []).find((item) => item.children[0].value === key);
  if (!property) return value === undefined ? text : addProperty(text, tree, key, value);
  if (value === undefined) return removeProperty(text, tree, property);
  const node = property.children[1];
  return text.slice(0, node.offset) + JSON.stringify(value) + text.slice(node.offset + node.length);
}

function setJsoncValue(text, segments, value, label) {
  if (!Array.isArray(segments) || segments.length === 0 || segments.some((key) => typeof key !== "string")) {
    throw new Error("JSON contribution path must contain string keys");
  }
  parseJsonc(text, label);
  const { tree, traversed, index } = parentNode(text, segments, label);
  if (index < segments.length - 1) {
    if (value === undefined) return text;
    const nested = segments.slice(index + 1).reduceRight((child, key) => Object.fromEntries([[key, child]]), value);
    return setJsoncValue(text, [...traversed, segments[index]], nested, label);
  }
  const updated = updateProperty(text, tree, segments[segments.length - 1], value);
  parseJsonc(updated, label);
  return updated;
}

function commaAt(text, start, end) {
  const scanner = parser.createScanner(text.slice(start, end), true);
  for (let token = scanner.scan(); token !== parser.SyntaxKind.EOF; token = scanner.scan()) {
    if (token === parser.SyntaxKind.CommaToken) return start + scanner.getTokenOffset();
  }
  return undefined;
}

module.exports = { parseJsonc, getJsoncValue, getJsoncNodeText, setJsoncValue };

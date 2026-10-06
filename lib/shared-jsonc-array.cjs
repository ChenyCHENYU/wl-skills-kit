"use strict";

const parser = require("./vendor/jsonc-parser/main.js");
const jsonc = require("./shared-jsonc.cjs");

function arrayNode(text, path) {
  jsonc.parseJsonc(text);
  const tree = parser.parseTree(text, [], { allowTrailingComma: true, disallowComments: false });
  const node = parser.findNodeAtLocation(tree, path);
  if (node && node.type !== "array") throw new Error(`${path.join("/")} must be an array`);
  return node;
}

function appendStrings(text, path, values) {
  if (!values.length) return text;
  const node = arrayNode(text, path);
  if (!node) return jsonc.setJsoncValue(text, path, values);
  const last = node.children?.at(-1);
  const offset = last ? last.offset + last.length : node.offset + 1;
  const insertion = `${last ? "," : ""}${values.map((value) => JSON.stringify(value)).join(",")}`;
  const updated = text.slice(0, offset) + insertion + text.slice(offset);
  jsonc.parseJsonc(updated);
  return updated;
}

function commaOffset(text, start, end) {
  const scanner = parser.createScanner(text.slice(start, end), true);
  for (let token = scanner.scan(); token !== parser.SyntaxKind.EOF; token = scanner.scan()) {
    if (token === parser.SyntaxKind.CommaToken) return start + scanner.getTokenOffset();
  }
  return undefined;
}

function removeElement(text, node, index) {
  const children = node.children || [];
  const child = children[index];
  const previous = children[index - 1];
  const next = children[index + 1];
  const before = previous ? commaOffset(text, previous.offset + previous.length, child.offset) : undefined;
  const after = commaOffset(text, child.offset + child.length, next ? next.offset : node.offset + node.length - 1);
  const comma = before === undefined ? after : before;
  const edits = [{ offset: child.offset, length: child.length }];
  if (comma !== undefined) edits.push({ offset: comma, length: 1 });
  return edits.sort((a, b) => b.offset - a.offset).reduce((content, edit) => content.slice(0, edit.offset) + content.slice(edit.offset + edit.length), text);
}

function removeStrings(text, path, values) {
  const retained = [];
  let content = text;
  for (const value of values) {
    const node = arrayNode(content, path);
    const matches = (node?.children || []).map((child, index) => ({ child, index })).filter(({ child }) => child.value === value);
    if (matches.length > 1) retained.push(value);
    else if (matches.length === 1) content = removeElement(content, node, matches[0].index);
  }
  jsonc.parseJsonc(content);
  return { content, retained };
}

module.exports = { appendStrings, removeStrings };

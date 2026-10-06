"use strict";

const crypto = require("crypto");

const START = "<!-- wl-skills-kit:begin -->";
const END = "<!-- wl-skills-kit:end -->";
const SHARED_PATHS = new Set([
  "AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md",
  ".clinerules", ".cursorrules", ".windsurfrules",
]);

function hash(text) {
  return crypto.createHash("md5").update(text, "utf8").digest("hex");
}

function isSharedMarkdown(rel) {
  return SHARED_PATHS.has(rel);
}

function managedBlock(body) {
  return `${START}\n${body.trimEnd()}\n${END}`;
}

function extractBlock(content) {
  const start = content.indexOf(START);
  const end = content.indexOf(END, start);
  if (start < 0 || end < 0) return "";
  return content.slice(start, end + END.length);
}

function validMarkers(content) {
  const count = content.split(START).length;
  if (count !== content.split(END).length || count > 2) return false;
  return count === 1 || content.indexOf(START) < content.indexOf(END);
}

function removeBlock(content, affixes = {}) {
  const block = extractBlock(content);
  if (!block) return content;
  let start = content.indexOf(block);
  let end = start + block.length;
  if (affixes.prefix && content.slice(start - affixes.prefix.length, start) === affixes.prefix) start -= affixes.prefix.length;
  if (affixes.suffix && content.slice(end, end + affixes.suffix.length) === affixes.suffix) end += affixes.suffix.length;
  return content.slice(0, start) + content.slice(end);
}

/** Only a matching installed hash proves that a legacy whole file is ours. */
function migrateLegacy(content, installedHash) {
  if (!installedHash) return content;
  if (hash(content) === installedHash) return "";
  const foreign = [...content.matchAll(/<!-- (wl-skills-[\w-]+):begin -->[\s\S]*?<!-- \1:end -->/g)];
  const legacy = foreign.reduce((text, match) => text.replace(match[0], ""), content);
  const proven = [legacy, legacy.trimEnd(), `${legacy.trimEnd()}\n`]
    .find((text) => hash(text) === installedHash && content.startsWith(text));
  return proven === undefined ? content : content.slice(proven.length);
}

function planBlock(content, body, installedHash, affixes = {}) {
  const block = managedBlock(body);
  const current = extractBlock(content);
  if (current) return { content: content.replace(current, block), affixes };
  const preserved = migrateLegacy(content, installedHash);
  const eol = preserved.includes("\r\n") ? "\r\n" : "\n";
  const prefix = preserved ? preserved.endsWith("\n") ? eol : eol + eol : "";
  const suffix = eol;
  return { content: `${preserved}${prefix}${block}${suffix}`, affixes: { prefix, suffix } };
}

function upsertBlock(content, body, installedHash) {
  return planBlock(content, body, installedHash).content;
}

module.exports = { isSharedMarkdown, managedBlock, extractBlock, validMarkers, removeBlock, planBlock, upsertBlock };

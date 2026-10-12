"use strict";
const { randomBytes } = require("node:crypto");

function createResultPages({ now = Date.now, ttlMs = 300000, maxEntryBytes = 8 * 1024 * 1024, maxTotalBytes = 32 * 1024 * 1024, maxEntries = 16 } = {}) {
  if ([ttlMs, maxEntryBytes, maxTotalBytes, maxEntries].some((n) => !Number.isSafeInteger(n) || n < 1)) throw new Error("结果缓存预算必须为正整数");
  const entries = new Map();
  let bytes = 0;
  const remove = (id) => { const entry = entries.get(id); if (entry) bytes -= entry.bytes; entries.delete(id); };
  const trim = () => { for (const [id, entry] of entries) if (entry.expiresAt <= now()) remove(id); };
  return {
    put(root, value) {
      trim();
      const json = JSON.stringify(value);
      const size = Buffer.byteLength(json);
      if (size > maxEntryBytes || size > maxTotalBytes) return null;
      while (entries.size >= maxEntries || bytes + size > maxTotalBytes) remove(entries.keys().next().value);
      const id = randomBytes(16).toString("hex");
      const expiresAt = now() + ttlMs;
      entries.set(id, { root, json, bytes: size, expiresAt });
      bytes += size;
      return { id, expiresAt };
    },
    get(root, cursor) {
      trim();
      const match = typeof cursor === "string" && cursor.match(/^([a-f0-9]{32}):([0-9]+)$/);
      const entry = match && entries.get(match[1]);
      const offset = match && Number(match[2]);
      if (!entry || entry.root !== root || !Number.isSafeInteger(offset)) throw new Error("结果游标无效、项目不匹配或已过期，请重新扫描；不会自动重跑");
      return { id: match[1], offset, expiresAt: entry.expiresAt, value: JSON.parse(entry.json) };
    },
    stats() { trim(); return { entries: entries.size, bytes }; },
  };
}

function checkedInteger(value, fallback, min, max, label) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${label} 必须为 ${min}～${max} 的整数`);
  return number;
}

// Bound the serialized handler payload. JSON-RPC envelope/host metadata is separate.
function fitPage(build, requestedItems, maxBytes) {
  const full = build(requestedItems);
  if (Buffer.byteLength(JSON.stringify(full)) <= maxBytes) return full;
  let low = 0;
  let high = requestedItems - 1;
  let best;
  while (low <= high) {
    const count = Math.floor((low + high) / 2);
    const result = build(count);
    if (Buffer.byteLength(JSON.stringify(result)) <= maxBytes) { best = result; low = count + 1; }
    else high = count - 1;
  }
  if (!best || (requestedItems > 0 && !best.page.returned)) throw new Error("单项或必要元信息超出读取预算，请增大 maxBytes 或查看完整 CLI 工件");
  return best;
}

module.exports = { createResultPages, checkedInteger, fitPage };

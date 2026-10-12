import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createResultPages, checkedInteger, fitPage } = require("../mcp/result-pages.cjs");

test("游标绑定项目、有效期与不可变快照，非法游标不触发扫描", () => {
  let time = 100;
  const cache = createResultPages({ now: () => time, ttlMs: 10 });
  const source = { issues: ["中文😀"] };
  const entry = cache.put("/first", source);
  source.issues.push("changed");
  const cursor = entry.id + ":0";
  const result = cache.get("/first", cursor);
  assert.deepEqual(result.value.issues, ["中文😀"]);
  result.value.issues.push("mutated read");
  assert.deepEqual(cache.get("/first", cursor).value.issues, ["中文😀"]);
  for (const bad of ["bad", entry.id + ":9007199254740992", entry.id + ":-1"]) assert.throws(() => cache.get("/first", bad));
  assert.throws(() => cache.get("/other", cursor), /项目不匹配/);
  time = 110;
  assert.throws(() => cache.get("/first", cursor), /过期/);
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
});

test("缓存限制单项、总字节和条目数，超限结果不伪造截断快照", () => {
  const cache = createResultPages({ maxEntryBytes: 20, maxTotalBytes: 20, maxEntries: 2 });
  assert.equal(cache.put("/p", "x".repeat(21)), null);
  const first = cache.put("/p", "x".repeat(10));
  const second = cache.put("/p", "y".repeat(10));
  assert.throws(() => cache.get("/p", first.id + ":0"));
  assert.equal(cache.get("/p", second.id + ":0").value.length, 10);
  assert.ok(cache.stats().bytes <= 20);
  const limited = createResultPages({ maxEntries: 1 });
  const old = limited.put("/p", {});
  limited.put("/p", {});
  assert.throws(() => limited.get("/p", old.id + ":0"));
  assert.throws(() => createResultPages({ ttlMs: 0 }));
});

test("按 UTF-8 序列化预算分页，完整末页优先，超小预算明确失败", () => {
  const build = (count) => ({ text: "中文😀".repeat(count * 10), page: { returned: count } });
  const result = fitPage(build, 20, 500);
  assert.ok(result.page.returned > 0 && result.page.returned < 20);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 500);
  assert.ok(!result.text.includes("�"));
  assert.throws(() => fitPage(build, 1, 10), /预算/);
  assert.equal(fitPage(build, 0, 100).page.returned, 0);
  const terminal = (count) => ({ page: { returned: count }, cursor: count === 3 ? null : "x".repeat(500), text: "x".repeat(count) });
  assert.equal(fitPage(terminal, 3, 100).page.returned, 3);
  for (const bad of [NaN, Infinity, -1, 1.5]) assert.throws(() => checkedInteger(bad, 20, 1, 40, "limit"));
  assert.equal(checkedInteger(undefined, 20, 1, 40, "limit"), 20);
});


import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync as requireStat } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "vitest";
const SERVER = fileURLToPath(new URL("../mcp/server.js", import.meta.url));
const TOOL = "wls_validate_page";
const RECORDS = ".wl-skills/runs";
const FIRST = { path: "src/views", limit: 1, maxBytes: 4096 };
const CHANGED = { path: "src/views" };
const unpack = (r) => r.result.structuredContent;
const total = (v) => v.totalIssues;
const next = (v) => v.nextCursor;
const stamp = (v) => v.snapshotAt;
const returned = (v) => v.issues.length;
function recordDigest(root, folder) {
  const dir = path.join(root, folder);
  if (!existsSync(dir)) return "";
  const hash = createHash("sha256");
  for (const name of readdirSync(dir, { recursive: true }).sort()) {
    const file = path.join(dir, name);
    if (!existsSync(file) || !requireStat(file).isFile()) continue;
    hash.update(name); hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

function startServer(root, server) {
  const child = spawn(process.execPath, [server], { cwd: root, env: { ...process.env, WL_PROJECT_ROOT: root }, stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let id = 0;
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (waiter) { clearTimeout(waiter.timeout); pending.delete(message.id); waiter.resolve(message); }
  });
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });
  return {
    call(args) {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(stderr || "MCP response timeout")); }, 20000);
        pending.set(requestId, { resolve, timeout });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name: TOOL, arguments: args } }) + "\n");
      });
    },
    close() { for (const waiter of pending.values()) clearTimeout(waiter.timeout); lines.close(); child.kill(); },
  };
}

test("真实 MCP 续页只读同次快照，不新增回执；重新扫描产生新证据", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "wl-mcp-pages-"));
  const server = startServer(root, SERVER);
  try {
    for (let i = 0; i < 12; i++) {
      const dir = path.join(root, "src", "views", "page" + i);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "index.vue"), '<template><el-table /><el-button size="small">执行任务</el-button></template>');
      writeFileSync(path.join(dir, "data.ts"), "export const value = 1;");
    }
    const first = await server.call(FIRST);
    assert.ok(first.result._meta?.wlExecution, JSON.stringify(first));
    const initial = unpack(first);
    assert.ok(total(initial) > 1);
    assert.ok(next(initial));
    assert.ok(Buffer.byteLength(JSON.stringify({ text: first.result.content[0].text, structuredContent: initial, isError: Boolean(first.result.isError) })) <= 4096);
    assert.equal(initial.summary.checkedFiles.length, 5);
    assert.ok(initial.summary.checkedFilesOmitted > 0);
    const receipt = JSON.parse(readFileSync(path.resolve(root, first.result._meta.wlExecution.receiptPath), "utf8"));
    assert.equal(receipt.checkedFiles.length, initial.summary.checkedFileCount);
    const before = recordDigest(root, RECORDS);
    for (let i = 0; i < 12; i++) {
      const dir = path.join(root, "src", "views", "page" + i);
      writeFileSync(path.join(dir, "index.vue"), "<template><div /></template>");
      writeFileSync(path.join(dir, "index.scss"), "");
    }
    let pages = 0;
    const readPages = async (cursor) => {
      if (!cursor) return 0;
      const response = await server.call({ resultCursor: cursor, limit: 2, maxBytes: 4096 });
      assert.equal(response.result._meta, undefined);
      const view = unpack(response);
      assert.equal(view.displayOnly, true); assert.equal(total(view), total(initial));
      assert.equal(stamp(view), stamp(initial));
      assert.ok(Buffer.byteLength(JSON.stringify({ text: response.result.content[0].text, structuredContent: view, isError: Boolean(response.result.isError) })) <= 4096);
      pages++;
      assert.ok(pages < 100);
      return returned(view) + await readPages(next(view));
    };
    const readCount = await readPages(next(initial));
    assert.equal(readCount + returned(initial), total(initial));
    const bad = await server.call({ resultCursor: "0".repeat(32) + ":0" });
    assert.equal(bad.result.isError, true);
    assert.equal(recordDigest(root, RECORDS), before);
    const changed = await server.call({ resultCursor: next(initial), ...CHANGED });
    assert.equal(changed.result.isError, true);
    assert.equal(recordDigest(root, RECORDS), before);
    const fresh = await server.call(FIRST);
    assert.ok(fresh.result._meta?.wlExecution);
    assert.notEqual(recordDigest(root, RECORDS), before);
    assert.ok(total(unpack(fresh)) < total(initial));
  } finally { server.close(); rmSync(root, { recursive: true, force: true }); }
}, 30000);

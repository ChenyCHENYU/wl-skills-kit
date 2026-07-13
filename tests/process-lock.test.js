import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { acquireFileLock, releaseFileLock, withFileLock } = require("../lib/process-lock");
const roots = [];

function lockRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-process-lock-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("cross-process file lock", () => {
  it("同一 key 串行执行且结束后释放锁文件", async () => {
    const root = lockRoot();
    const events = [];
    let releaseFirst;
    const gate = new Promise((resolve) => { releaseFirst = resolve; });
    const first = withFileLock("same-project", async () => {
      events.push("first-start");
      await gate;
      events.push("first-end");
    }, { lockRoot: root, pollMs: 10, waitMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = withFileLock("same-project", async () => {
      events.push("second-start");
    }, { lockRoot: root, pollMs: 10, waitMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(events).toEqual(["first-start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first-start", "first-end", "second-start"]);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("不会由错误 token 释放其他持有者的锁", async () => {
    const root = lockRoot();
    const lock = await acquireFileLock("project", { lockRoot: root });
    releaseFileLock({ ...lock, token: "wrong" });
    expect(fs.existsSync(lock.lockPath)).toBe(true);
    releaseFileLock(lock);
    expect(fs.existsSync(lock.lockPath)).toBe(false);
  });
});

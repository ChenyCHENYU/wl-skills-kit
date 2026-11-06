import { test, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { HANDLERS, TOOLS } = require("../mcp/registry");
const { dispatchTool } = require("../mcp/server");

test("receipt-only reads can run during a business write while guarded writes remain serialized", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-mcp-concurrency-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ devDependencies: { "@agile-team/wl-skills-kit": "*" } }));
  const originalRoot = process.env.WL_PROJECT_ROOT;
  process.env.WL_PROJECT_ROOT = root;
  const write = HANDLERS.wls_template_extract;
  const read = HANDLERS.wls_project_snapshot;
  const originalWrite = write.handle;
  const originalRead = read.handle;
  const output = [];
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(value => { output.push(JSON.parse(value)); return true; });
  const entered = [];
  let release;
  let started;
  const firstStarted = new Promise(resolve => { started = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const result = { text: "local fixture", structuredContent: { ok: true, state: "preview" } };
  write.handle = async args => { entered.push(args.runId); if (args.runId === "write-one") { started(); await blocked; } return result; };
  read.handle = async () => { entered.push("read"); return result; };
  let first;
  let second;
  try {
    expect(TOOLS.find(tool => tool.name === read.name).annotations.readOnlyHint).toBe(false);
    expect(TOOLS.find(tool => tool.name === read.name)._meta.wl.businessReadOnly).toBe(true);
    first = dispatchTool(1, write.name, { runId: "write-one" });
    await firstStarted;
    second = dispatchTool(2, write.name, { runId: "write-two" });
    await dispatchTool(3, read.name, { runId: "read-only" });
    expect(entered).toEqual(["write-one", "read"]);
    release();
    await Promise.all([first, second]);
    expect(entered).toEqual(["write-one", "read", "write-two"]);
    expect(output.map(message => message.id).sort()).toEqual([1, 2, 3]);
    expect(output.every(message => message.result._meta?.wlExecution)).toBe(true);
  } finally {
    release();
    await Promise.allSettled([first, second].filter(Boolean));
    write.handle = originalWrite;
    read.handle = originalRead;
    stdout.mockRestore();
    if (originalRoot === undefined) delete process.env.WL_PROJECT_ROOT;
    else process.env.WL_PROJECT_ROOT = originalRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

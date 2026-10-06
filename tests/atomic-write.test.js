import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { atomicWriteFile, createAtomicWriter } = require("../lib/atomic-write.cjs");
const fixtures = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-atomic-write-"));
  fixtures.push(root);
  return root;
}
afterEach(() => fixtures.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe("single-file atomic replacement", () => {
  it("preserves original bytes and existence when a temporary write fails halfway", () => {
    const root = fixture();
    const target = path.join(root, "AGENTS.md");
    const foreign = path.join(root, ".AGENTS.md.wl-skills-foreign.tmp");
    fs.writeFileSync(foreign, "Foreign temporary file");
    const original = Buffer.from("# Team  \r\n\r\n\r\nTail \t");
    const write = createAtomicWriter({ ...fs, writeFileSync: (descriptor) => {
      fs.writeSync(descriptor, "partial write");
      throw new Error("Injected write failure");
    } });
    expect(() => write(target, "replacement")).toThrow(/Injected/);
    expect(fs.existsSync(target)).toBe(false);
    fs.writeFileSync(target, original);
    expect(() => write(target, "replacement")).toThrow(/Injected/);
    expect(fs.readFileSync(target)).toEqual(original);
    expect(fs.readdirSync(root).sort()).toEqual([path.basename(foreign), "AGENTS.md"].sort());
  });

  it("preserves the original on rename failure and keeps its permissions after success", () => {
    const root = fixture();
    const target = path.join(root, ".mcp.json");
    fs.writeFileSync(target, "original");
    fs.chmodSync(target, 0o640);
    const write = createAtomicWriter({ ...fs, renameSync: () => { throw new Error("Injected rename failure"); } });
    expect(() => write(target, "replacement")).toThrow(/Injected/);
    expect(fs.readFileSync(target, "utf8")).toBe("original");
    expect(fs.statSync(target).mode & 0o7777).toBe(0o640);
    expect(fs.readdirSync(root)).toEqual([".mcp.json"]);
    atomicWriteFile(target, "replacement");
    expect(fs.readFileSync(target, "utf8")).toBe("replacement");
    expect(fs.statSync(target).mode & 0o7777).toBe(0o640);
  });

  it("does not clean up a temporary path it failed to create exclusively", () => {
    const root = fixture();
    const target = path.join(root, "AGENTS.md");
    fs.writeFileSync(target, "original");
    let collision;
    const write = createAtomicWriter({ ...fs, openSync: (temporary, flags, mode) => {
      expect(flags).toBe("wx");
      collision = temporary;
      fs.writeFileSync(temporary, "Foreign concurrent file", { mode });
      throw Object.assign(new Error("collision"), { code: "EEXIST" });
    } });
    expect(() => write(target, "replacement")).toThrow(/collision/);
    expect(fs.readFileSync(target, "utf8")).toBe("original");
    expect(fs.readFileSync(collision, "utf8")).toBe("Foreign concurrent file");
  });
});

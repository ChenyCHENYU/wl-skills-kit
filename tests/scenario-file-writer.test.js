"use strict";

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { writeScenarioFiles } = require("../lib/scenario-file-writer");

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wl-scenario-writer-"));
}

describe("scenario file transaction", () => {
  it("restores overwritten files and removes newly created files after a partial failure", () => {
    const root = makeProject();
    const page = path.join(root, "page");
    fs.mkdirSync(page);
    fs.writeFileSync(path.join(page, "data.ts"), "original");
    let installs = 0;
    const io = {
      ...fs,
      renameSync(source, target) {
        if (source.includes(".tmp.") && ++installs === 2) throw new Error("injected failure");
        return fs.renameSync(source, target);
      },
    };
    expect(() => writeScenarioFiles(root, [
      { name: "page/data.ts", content: "changed" },
      { name: "new/index.vue", content: "new" },
    ], { force: true, fs: io })).toThrow("injected failure");
    expect(fs.readFileSync(path.join(page, "data.ts"), "utf8")).toBe("original");
    expect(fs.existsSync(path.join(root, "new"))).toBe(false);
    expect(fs.readdirSync(page)).toEqual(["data.ts"]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("preflights every collision before changing files", () => {
    const root = makeProject();
    fs.writeFileSync(path.join(root, "existing.ts"), "original");
    expect(() => writeScenarioFiles(root, [
      { name: "new.ts", content: "new" },
      { name: "existing.ts", content: "changed" },
    ])).toThrow(/--force/);
    expect(fs.readdirSync(root)).toEqual(["existing.ts"]);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../files/.wl-skills/skills/core/status-column-audit/audit-status-columns.mjs", import.meta.url));
const source = `export const columns = [
  { name: "status", label: "状态", formatter: (row) => statusDict.fmt(row.status) },
  { name: "unit", label: "计量单位", formatter: (row) => unitDict.fmt(row.unit) },
  { name: "kind", label: "类别", formatter: (row) => fmtDict(row.kind, "inventoryKind") },
  { name: "version", label: "版本", formatter: (row) => "v" + row.version },
];
`;

function run(cwd, ...args) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", timeout: 5000 });
}

it("audits, creates a bridge, applies P1 then P2 and leaves repeat runs stable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-status-columns-"));
  try {
    const directory = path.join(root, "src/views/inventory");
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "data.ts");
    fs.writeFileSync(file, source);
    const audit = run(root).stdout;
    for (const category of ["P1", "P2", "P3", "P4"]) expect(audit).toMatch(new RegExp(`${category}[^\\n]*\\(1\\)`));
    expect(fs.readFileSync(file, "utf8")).toBe(source);
    expect(run(root, "--fix").status).toBe(1);
    expect(fs.readFileSync(file, "utf8")).toBe(source);
    expect(run(root, "--init-bridge").status).toBe(0);
    expect(run(root, "--fix").status).toBe(0);
    const p1 = fs.readFileSync(file, "utf8");
    expect(p1).toContain('import { dictAutoTag } from "@/utils/dict-auto-tag";');
    expect(p1).toContain('dictAutoTag(statusDict, row.status, "status")');
    expect(p1).toContain("formatter: (row) => unitDict.fmt(row.unit)");
    expect(run(root, "--fix", "--all").status).toBe(0);
    const all = fs.readFileSync(file, "utf8");
    expect(all).toContain('dictAutoTag(unitDict, row.unit, "unit")');
    expect(all).toContain('formatter: (row) => fmtDict(row.kind, "inventoryKind")');
    expect(all).toContain('formatter: (row) => "v" + row.version');
    expect(run(root, "--fix", "--all").status).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe(all);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("rejects outside paths and leaves nested links and a linked bridge directory untouched", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-status-columns-boundary-"));
  try {
    const project = path.join(root, "project");
    const outside = path.join(root, "outside");
    fs.mkdirSync(path.join(project, "src/views"), { recursive: true });
    fs.mkdirSync(outside);
    const outsideFile = path.join(outside, "data.ts");
    fs.writeFileSync(outsideFile, source);
    const linked = path.join(project, "src/views/linked");
    fs.symlinkSync(outside, linked, "junction");
    expect(run(project, "--init-bridge").status).toBe(0);
    expect(run(project, "--fix", "--dir", "../outside").status).toBe(1);
    expect(run(project, "--fix", "--dir", "src/views/linked").status).toBe(1);
    expect(run(project, "--fix").status).toBe(0);
    expect(fs.readFileSync(outsideFile, "utf8")).toBe(source);
    const bridgeDir = path.join(project, "src/utils");
    fs.rmSync(bridgeDir, { recursive: true });
    fs.symlinkSync(outside, bridgeDir, "junction");
    expect(run(project, "--init-bridge").status).toBe(1);
    expect(fs.readdirSync(outside)).toEqual(["data.ts"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

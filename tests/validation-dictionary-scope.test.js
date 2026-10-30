/** Real Git-index regressions for dictionary validation scope and dirty inputs. */
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../bin/wl-skills.js", import.meta.url));
const roots = [];
const page = "src/views/reports/daily";
const owner = "src/views/production";

function write(root, file, content) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

function contract(name, label = "Enabled", sources = []) {
  return { schemaVersion: 1, module: { code: name, name }, dictionaries: [{
    code: `${name}Status`, name: "Status", order: { field: "STR_KEY", direction: "asc" },
    items: [{ value: "1", label }], sources,
  }] };
}

function writeModule(root, name, valid = true, withPage = true) {
  const dir = `src/views/${name}`;
  write(root, `${dir}/dicts.ts`, `export const MODULE_DICTIONARIES = ${JSON.stringify(contract(name, valid ? "Enabled" : "WRONG", ["daily/api.md"]))} as const;\n`);
  write(root, `${dir}/daily/api.md`, `\`\`\`dict-contract\n${JSON.stringify(contract(name))}\n\`\`\`\n`);
  if (withPage) writePage(root, `${dir}/daily`);
}

function writePage(root, dir) {
  write(root, `${dir}/index.vue`, '<template><div>Report</div></template>\n');
  write(root, `${dir}/data.ts`, "export const title = 'Report';\n");
}

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-dict-scope-"));
  roots.push(root);
  writePage(root, page);
  writeModule(root, "unrelated", false);
  git(root, "init");
  git(root, "add", ".");
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "baseline");
  return root;
}

function stage(root, file, suffix = "\n") {
  fs.appendFileSync(path.join(root, file), suffix);
  git(root, "add", file);
}

function validate(root, flags = ["--pre-commit"]) {
  const result = spawnSync(process.execPath, [CLI, "validate", "src/views", ...flags], {
    cwd: root, encoding: "utf8", timeout: 30000,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  return { ...result, output: result.stdout + result.stderr };
}

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("pre-commit dictionary scope", () => {
  it("does not scan unrelated module dictionaries for a staged report", () => {
    const root = project();
    stage(root, `${page}/data.ts`);
    const result = validate(root);
    expect(result.status, result.output).toBe(0);
    expect(result.output).not.toContain("unrelated/dicts.ts");
    const full = validate(root, ["--json"]);
    expect(full.status).toBe(1);
    expect(JSON.parse(full.stdout).issues.some((issue) => issue.rule === "D1" && issue.dir.includes("unrelated"))).toBe(true);
  });

  it("keeps checking the owning dictionary for a staged page reference", () => {
    const root = project();
    writeModule(root, "production");
    git(root, "add", owner);
    stage(root, `${owner}/daily/data.ts`, 'export const status = { dictCode: "missingStatus" };\n');
    const result = validate(root);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("missingStatus");
    expect(result.output).toContain("D2");
    expect(result.output).not.toContain("unrelated/dicts.ts");
  });

  it.each(["dicts.ts", "daily/api.md"])("validates a staged %s without unrelated page or dictionary reads", (file) => {
    const root = project();
    writeModule(root, "production", false);
    git(root, "add", owner);
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "owner");
    // A dirty unrelated page must not enter the owning module's gate.
    fs.appendFileSync(path.join(root, "src/views/unrelated/daily/data.ts"), "// other task\n");
    stage(root, `${owner}/${file}`);
    const result = validate(root);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("production/dicts.ts");
    expect(result.output).toContain("D1");
    expect(result.output).not.toContain("unrelated/");
  });

  it("validates contracts in a module without index.vue", () => {
    const root = project();
    writeModule(root, "production", false, false);
    git(root, "add", owner);
    const result = validate(root);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("production/dicts.ts");
    expect(result.output).not.toContain("unrelated/dicts.ts");
  });

  it.each([true, false])("accepts a valid staged contract (page present: %s) despite unrelated errors", (withPage) => {
    const root = project();
    writeModule(root, "production", true, withPage);
    git(root, "add", owner);
    const result = validate(root);
    expect(result.status, result.output).toBe(0);
    expect(result.output).not.toContain("unrelated/dicts.ts");
  });

  it("reads dirty sibling API inputs only when their dictionary module is affected", () => {
    const root = project();
    writeModule(root, "production");
    write(root, `${owner}/sibling/api.md`, "# Sibling\n");
    git(root, "add", owner);
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "owner");
    stage(root, `${owner}/daily/data.ts`);
    fs.appendFileSync(path.join(root, `${owner}/sibling/api.md`), "Unstaged contract input\n");
    const result = validate(root);
    expect(result.status, result.output).toBe(1);
    expect(result.stderr).toContain("production/sibling/api.md");
  });

  it("deduplicates and checks every affected module in a mixed commit", () => {
    const root = project();
    writeModule(root, "production");
    git(root, "add", owner);
    stage(root, `${page}/index.vue`, "<!-- staged -->\n");
    stage(root, "src/views/unrelated/daily/index.vue", "<!-- staged -->\n");
    const result = validate(root);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("unrelated/dicts.ts");
    expect(result.output).toContain("D1");
  });

  it("preserves a full check when validation policy changes", () => {
    const root = project();
    write(root, ".wl-skills-validate.json", JSON.stringify({ mockPolicy: "disabled" }));
    git(root, "add", ".wl-skills-validate.json");
    const result = validate(root);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("unrelated/dicts.ts");
  });

  it("blocks unstaged dictionary input used by a staged page", () => {
    const root = project();
    writeModule(root, "production");
    git(root, "add", owner);
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "owner");
    stage(root, `${owner}/daily/data.ts`);
    fs.appendFileSync(path.join(root, `${owner}/dicts.ts`), "// unstaged\n");
    const result = validate(root);
    expect(result.status, result.output).toBe(1);
    expect(result.stderr).toContain("production/dicts.ts");
    expect(result.output).not.toContain("unrelated/dicts.ts");
  });

  it("blocks partially staged contracts", () => {
    const root = project();
    writeModule(root, "production");
    git(root, "add", owner);
    fs.appendFileSync(path.join(root, `${owner}/dicts.ts`), "// unstaged\n");
    const result = validate(root);
    expect(result.status, result.output).toBe(1);
    expect(result.stderr).toContain("production/dicts.ts");
  });

  it("blocks removing only dicts.ts while its API contract remains", () => {
    const root = project();
    writeModule(root, "production");
    git(root, "add", owner);
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "owner");
    fs.unlinkSync(path.join(root, `${owner}/dicts.ts`));
    git(root, "add", "-u");
    const result = validate(root);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("production/dicts.ts");
    expect(result.output).not.toContain("unrelated/dicts.ts");
  });
});

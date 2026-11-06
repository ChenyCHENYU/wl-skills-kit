import { afterEach, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const repo = path.resolve(import.meta.dirname, "..");
const cli = path.join(repo, "bin/wl-skills.js");
const fixtures = [];
const currentManifest = ".wl-skills/state/kit/manifest.json";
const legacyManifest = ".wl-skills-manifest.json";
const md5 = (value) => crypto.createHash("md5").update(value).digest("hex");
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-compact-")));
  fixtures.push(root);
  return root;
}
function put(root, relative, value) {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), value);
}
function run(root, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", timeout: 30000 });
}
function succeeded(result) { expect(result.status, result.stderr || result.stdout).toBe(0); }
function snapshot(root, relative = "") {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const rel = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) return snapshot(root, rel);
    const file = path.join(root, rel);
    return [{ relative: rel, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), mode: fs.statSync(file).mode & 0o777 }];
  });
}
afterEach(() => fixtures.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

test("real default init writes one common gateway, bootstrap, configuration and ownership only", () => {
  const root = fixture();
  succeeded(run(root, "init"));
  expect(snapshot(root).map((file) => file.relative).sort()).toEqual([
    ".agents/skills/wl-skills-kit/SKILL.md", ".wl-skills/config.json", ".wl-skills/state/.gitignore", currentManifest, "AGENTS.md",
  ].sort());
  const config = JSON.parse(fs.readFileSync(path.join(root, ".wl-skills/config.json"), "utf8"));
  expect(config.integration).toBe("compact");
  expect(config.hosts).toEqual(["codex"]);
  expect(config.mcp).toBe(false);
  for (const rel of [".cursor", ".claude", ".cline", ".roo", ".kilo", ".kiro", ".windsurf", ".windsurfrules", ".github", ".wl-skills/skills", ".wl-skills/standards"]) {
    expect(fs.existsSync(path.join(root, rel)), rel).toBe(false);
  }
});

test("project configuration chooses hosts and aliases while explicit hosts override it without directory inference", () => {
  const root = fixture();
  put(root, "package.json", JSON.stringify({ name: "business", devDependencies: { vue: "^3.4.0" }, wlSkills: { schemaVersion: 1, integration: "compact", hosts: ["codex", "z-code", "kilo-code", "cline", "claude-code"], extra: "preserve" } }));
  put(root, ".cursor/team.md", "Team Cursor file.\n");
  succeeded(run(root, "init"));
  const skillPaths = snapshot(root).filter((file) => file.relative.endsWith("/SKILL.md")).map((file) => file.relative).sort();
  expect(skillPaths).toEqual([".agents/skills/wl-skills-kit/SKILL.md", ".claude/skills/wl-skills-kit/SKILL.md"]);
  expect(fs.existsSync(path.join(root, ".cline"))).toBe(false);
  expect(fs.existsSync(path.join(root, ".cursor/skills"))).toBe(false);
  const metadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  expect(metadata.wlSkills.hosts).toEqual(["codex", "zcode", "kilo", "cline", "claude"]);
  expect(metadata.wlSkills.extra).toBe("preserve");
  expect(metadata.devDependencies.vue).toBe("^3.4.0");
  succeeded(run(root, "update", "--hosts", "codex,zcode,kilo", "--no-mcp"));
  expect(snapshot(root).filter((file) => file.relative.endsWith("/SKILL.md")).map((file) => file.relative)).toEqual([".agents/skills/wl-skills-kit/SKILL.md"]);
  expect(fs.readFileSync(path.join(root, ".cursor/team.md"), "utf8")).toBe("Team Cursor file.\n");
});

test("legacy expanded migration retires owned copies while force preserves customized blocks and other packages", () => {
  const root = fixture();
  succeeded(run(root, "init", "--integration", "expanded", "--hosts", "all", "--mcp"));
  fs.renameSync(path.join(root, currentManifest), path.join(root, legacyManifest));
  const file = path.join(root, "CLAUDE.md");
  const foreign = "\n<!-- wl-skills-bd:begin -->\nBackend project instructions.\n<!-- wl-skills-bd:end -->\n";
  const current = fs.readFileSync(file, "utf8");
  const customized = current.replace("仅适用于", "团队自定义：仅适用于") + foreign;
  expect(customized).not.toBe(current + foreign);
  fs.writeFileSync(file, customized);
  succeeded(run(root, "update", "--integration", "compact", "--hosts", "codex", "--no-mcp", "--force"));
  expect(fs.readFileSync(file, "utf8")).toBe(customized);
  expect(fs.existsSync(path.join(root, legacyManifest))).toBe(false);
  expect(fs.existsSync(path.join(root, ".wl-skills/skills/_registry.md"))).toBe(false);
  expect(fs.existsSync(path.join(root, ".wl-skills/copilot-instructions-full.md"))).toBe(false);
  expect(fs.existsSync(path.join(root, currentManifest))).toBe(true);
});

test("a new manifest coexisting with an unconsumed legacy manifest leaves the legacy bytes untouched", () => {
  const root = fixture();
  succeeded(run(root, "init"));
  const team = "A team file with unknown historical ownership.\n";
  put(root, "team.md", team);
  const old = JSON.stringify({ version: "2.20.4", files: { "team.md": md5(team) } }, null, 4) + "\n";
  put(root, legacyManifest, old);
  succeeded(run(root, "update", "--force"));
  expect(fs.readFileSync(path.join(root, legacyManifest), "utf8")).toBe(old);
  expect(fs.readFileSync(path.join(root, "team.md"), "utf8")).toBe(team);
});

test("failure at final manifest write rolls back migration files, configuration and ownership byte for byte", () => {
  const root = fixture();
  succeeded(run(root, "init", "--integration", "expanded", "--hosts", "all", "--mcp"));
  fs.renameSync(path.join(root, currentManifest), path.join(root, legacyManifest));
  const preload = path.join(root, "fail-final-manifest.cjs");
  put(root, "fail-final-manifest.cjs", `const fs = require("node:fs");
const open = fs.openSync; const write = fs.writeFileSync; const tracked = new Set();
fs.openSync = function (file, ...args) { const fd = open(file, ...args); if (typeof file === "string" && file.includes(".manifest.json.wl-skills-")) tracked.add(fd); return fd; };
fs.writeFileSync = function (file, ...args) { if (tracked.has(file)) { fs.writeSync(file, "PARTIAL"); throw new Error("Injected final manifest failure"); } return write(file, ...args); };\n`);
  const before = snapshot(root);
  const result = spawnSync(process.execPath, ["--require", preload, cli, "update", "--integration", "compact", "--hosts", "codex", "--no-mcp"], { cwd: root, encoding: "utf8", timeout: 30000 });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Injected final manifest failure");
  expect(snapshot(root)).toEqual(before);
  expect(fs.existsSync(path.join(root, currentManifest))).toBe(false);
});


test("shared state ignore keeps foreign lines, is idempotent and survives package clean", () => {
  const root = fixture();
  const relative = ".wl-skills/state/.gitignore";
  const original = "# Team runtime files\r\nteam-cache/";
  put(root, relative, original);
  succeeded(run(root, "init"));
  const first = fs.readFileSync(path.join(root, relative), "utf8");
  expect(first.startsWith(original)).toBe(true);
  for (const entry of ["*/runs/", "*/cache/", "*/backups/"]) expect(first.split(/\r?\n/).filter((line) => line === entry)).toHaveLength(1);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, currentManifest), "utf8"));
  expect(manifest.files[relative]).toBeUndefined();
  succeeded(run(root, "update", "--force"));
  expect(fs.readFileSync(path.join(root, relative), "utf8")).toBe(first);
  succeeded(run(root, "clean"));
  expect(fs.readFileSync(path.join(root, relative), "utf8")).toBe(first);
});

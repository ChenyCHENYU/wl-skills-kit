import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { extractBlock } = require("../lib/managed-markdown");
const { gatewayInstallPaths } = require("../lib/host-profiles.cjs");
const { taskGateway } = require("../lib/task-gateway");
const root = path.resolve(import.meta.dirname, "..");
const fixtures = [];
// Expanded ownership regressions perform several real installs per case.
const lifecycleTest = (name, fn) => it(name, fn, 60000);
const md5 = (text) => crypto.createHash("md5").update(text).digest("hex");
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kit-lifecycle-"));
  fixtures.push(dir);
  return dir;
}
function run(dir, args) {
  if (["init", "update"].includes(args[0])) args = [...args, "--integration", "expanded", "--hosts", "all", "--mcp"];
  const result = spawnSync(process.execPath, [path.join(root, "bin/wl-skills.js"), ...args], { cwd: dir, encoding: "utf8", timeout: 30000 });
  return result;
}
function diskSnapshot(dir) {
  const snapshot = {};
  function visit(file) {
    const stat = fs.statSync(file);
    const relative = path.relative(dir, file) || ".";
    if (stat.isDirectory()) {
      snapshot[relative] = { mode: stat.mode, mtime: stat.mtimeMs };
      for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name));
    } else snapshot[relative] = { mode: stat.mode, mtime: stat.mtimeMs, hash: md5(fs.readFileSync(file)) };
  }
  visit(dir);
  return snapshot;
}
function runCompact(dir, command, preload) {
  const options = preload ? ["--require", preload] : [];
  const args = command === "init" ? ["--hosts", "codex,claude"] : [];
  return spawnSync(process.execPath, [...options, path.join(root, "bin/wl-skills.js"), command, ...args], { cwd: dir, encoding: "utf8", timeout: 30000 });
}
function failingEditorPreload(mode) {
  const preload = path.join(fixture(), "inject-editor-failure.cjs");
  fs.writeFileSync(preload, `const Module = require("node:module");
const original = Module._load;
Module._load = function (request, ...args) {
  if (request !== "../lib/editor-adapters") return original.call(this, request, ...args);
  if (${JSON.stringify(mode)} === "load") throw new Error("Injected editor adapter load failure");
  const adapters = original.call(this, request, ...args);
  return { ...adapters, buildEditorConfigs() { throw new Error("Injected editor config generation failure"); } };
};\n`);
  return preload;
}
function failingPreload(dir, basename) {
  const preload = path.join(dir, "inject-write-failure.cjs");
  fs.writeFileSync(preload, `const fs = require("node:fs");
const originalOpen = fs.openSync;
const originalWrite = fs.writeFileSync;
const tracked = new Set();
fs.openSync = function (file, ...args) {
  const descriptor = originalOpen(file, ...args);
  if (typeof file === "string" && file.includes(${JSON.stringify(`.${basename}.wl-skills-`)})) tracked.add(descriptor);
  return descriptor;
};
fs.writeFileSync = function (file, ...args) {
  if (tracked.has(file)) { fs.writeSync(file, "PARTIAL"); throw new Error("Injected temporary write failure"); }
  return originalWrite(file, ...args);
};\n`);
  return preload;
}
afterEach(() => fixtures.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe("kit shared install lifecycle", () => {
  it("diff in a fresh process recognizes configured native entries and performs zero writes", () => {
    const dir = fixture();
    expect(runCompact(dir, "init").status).toBe(0);
    const before = diskSnapshot(dir);
    const result = runCompact(dir, "diff");
    const output = result.stdout + result.stderr;
    expect(result.status, output).toBe(0);
    expect(output).toMatch(/旧版残留: 0(?:\r?\n|$)/);
    expect(diskSnapshot(dir)).toEqual(before);
  });

  it("normal update retains the selected gateways and unrelated work across versions", () => {
    const dir = fixture();
    const agents = path.join(dir, "AGENTS.md");
    const foreign = "# Team instructions  \r\n\r\n<!-- wl-skills-ui:begin -->\r\nKeep UI router. \t\r\n<!-- wl-skills-ui:end -->\r\n";
    fs.writeFileSync(agents, foreign);
    expect(runCompact(dir, "init").status).toBe(0);
    const wip = path.join(dir, "src/views/produce/local-work.ts");
    fs.mkdirSync(path.dirname(wip), { recursive: true });
    const work = Buffer.from('export const pending = "业务草稿";  \r\n// uncommitted WIP\r\n');
    fs.writeFileSync(wip, work);
    const gatewayPaths = gatewayInstallPaths("@agile-team/wl-skills-kit", { hosts: ["codex", "claude"] });
    const originals = Object.fromEntries(gatewayPaths.map(file => [file, fs.readFileSync(path.join(dir, file))]));
    expect(gatewayPaths).toEqual(expect.arrayContaining([".agents/skills/wl-skills-kit/SKILL.md", ".claude/skills/wl-skills-kit/SKILL.md"]));
    const manifestPath = path.join(dir, ".wl-skills/state/kit/manifest.json");
    const old = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    old.version = "2.33.1";
    fs.writeFileSync(manifestPath, JSON.stringify(old));
    const result = runCompact(dir, "update");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const updated = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const file of gatewayPaths) {
      expect(updated.files[file], file).toBeDefined();
      expect(fs.readFileSync(path.join(dir, file)), file).toEqual(originals[file]);
    }
    expect(fs.readFileSync(agents, "utf8").startsWith(foreign)).toBe(true);
    expect(fs.readFileSync(wip)).toEqual(work);
  });

  it.each([
    { command: "diff", mode: "load", message: "Injected editor adapter load failure" },
    { command: "update", mode: "load", message: "Injected editor adapter load failure" },
    { command: "diff", mode: "generate", message: "Injected editor config generation failure" },
    { command: "update", mode: "generate", message: "Injected editor config generation failure" },
  ])("$command stops before cleanup when editor adapters fail at $mode", ({ command, mode, message }) => {
    const dir = fixture();
    expect(runCompact(dir, "init").status).toBe(0);
    const manifestPath = path.join(dir, ".wl-skills/state/kit/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.version = "2.33.1";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const preload = failingEditorPreload(mode);
    const before = diskSnapshot(dir);
    const result = runCompact(dir, command, preload);
    const output = result.stdout + result.stderr;
    expect(result.status, output).not.toBe(0);
    expect(output).toContain(message);
    expect(output).not.toMatch(/旧版残留:|update 会迁移清理|清理: \d+ 个未修改的旧版受管文件/);
    expect(diskSnapshot(dir)).toEqual(before);
  });

  lifecycleTest("installs host gateways with ownership, repairs missing files, and preserves customized or preexisting gateways", () => {
    const dir = fixture();
    const preexisting = ".claude/skills/wl-skills-kit/SKILL.md";
    fs.mkdirSync(path.dirname(path.join(dir, preexisting)), { recursive: true });
    fs.writeFileSync(path.join(dir, preexisting), taskGateway());
    expect(run(dir, ["init"]).status).toBe(0);
    for (const rel of gatewayInstallPaths("@agile-team/wl-skills-kit", { hosts: "all" })) expect(fs.readFileSync(path.join(dir, rel), "utf8")).toBe(taskGateway());
    fs.unlinkSync(path.join(dir, ".kiro/skills/wl-skills-kit/SKILL.md"));
    expect(run(dir, ["update"]).status).toBe(0);
    expect(fs.existsSync(path.join(dir, ".kiro/skills/wl-skills-kit/SKILL.md"))).toBe(true);
    const customized = ".agents/skills/wl-skills-kit/SKILL.md";
    fs.appendFileSync(path.join(dir, customized), "\nProject customization.\n");
    const current = fs.readFileSync(path.join(dir, customized), "utf8");
    expect(run(dir, ["update"]).status).toBe(2);
    expect(fs.readFileSync(path.join(dir, customized), "utf8")).toBe(current);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(path.join(dir, customized), "utf8")).toBe(current);
    expect(fs.readFileSync(path.join(dir, preexisting), "utf8")).toBe(taskGateway());
    expect(fs.existsSync(path.join(dir, ".kiro/skills/wl-skills-kit/SKILL.md"))).toBe(false);
  });

  lifecycleTest("expanded update reads installation metadata a bounded number of times", () => {
    const dir = fixture();
    expect(run(dir, ["init"]).status).toBe(0);
    const manifestPath = path.join(dir, ".wl-skills/state/kit/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.version = "2.20.4";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const counterPath = path.join(dir, "manifest-read-count.txt");
    const preload = path.join(dir, "measure-manifest-reads.cjs");
    fs.writeFileSync(preload, `const fs = require("node:fs");
const path = require("node:path");
const read = fs.readFileSync; const write = fs.writeFileSync; let count = 0;
fs.readFileSync = function (file, ...args) {
  if (typeof file === "string" && path.resolve(file) === ${JSON.stringify(fs.realpathSync(manifestPath))}) count += 1;
  return read(file, ...args);
};
process.on("exit", () => write(${JSON.stringify(counterPath)}, String(count)));\n`);
    const result = spawnSync(process.execPath, ["--require", preload, path.join(root, "bin/wl-skills.js"), "update", "--integration", "expanded", "--hosts", "all", "--mcp"], { cwd: dir, encoding: "utf8", timeout: 30000 });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const reads = Number(fs.readFileSync(counterPath, "utf8"));
    expect(reads).toBeGreaterThan(0);
    // Re-reading and validating the whole ownership manifest for every one of
    // hundreds of resources previously made a real update exceed 30 seconds.
    expect(reads).toBeLessThan(25);
  });

  lifecycleTest("keeps shared Markdown and MCP originals intact when CLI temporary writes fail", () => {
    for (const [rel, original] of [["AGENTS.md", "# Team  \r\n\r\nTail \t"], [".mcp.json", '{"mcpServers":{"team":{"command":"team"}}}\n']]) {
      const dir = fixture();
      fs.writeFileSync(path.join(dir, rel), original);
      const preload = failingPreload(dir, path.basename(rel));
      const result = spawnSync(process.execPath, ["--require", preload, path.join(root, "bin/wl-skills.js"), "init", "--integration", "expanded", "--hosts", "all", "--mcp"], { cwd: dir, encoding: "utf8", timeout: 30000 });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Injected temporary write failure");
      expect(fs.readFileSync(path.join(dir, rel), "utf8")).toBe(original);
      expect(fs.readdirSync(dir).some((file) => file.startsWith(`.${rel}.wl-skills-`))).toBe(false);
    }
  });

  lifecycleTest("preserves every user byte outside routers, including CRLF, blank lines and trailing spaces", () => {
    const dir = fixture();
    const original = "# Team instructions  \r\n\r\n\r\n\r\nKeep spacing. \t\r\nTail  \t";
    for (const rel of ["AGENTS.md", "CLAUDE.md"]) fs.writeFileSync(path.join(dir, rel), original);
    expect(run(dir, ["init"]).status).toBe(0);
    for (const rel of ["AGENTS.md", "CLAUDE.md"]) expect(fs.readFileSync(path.join(dir, rel), "utf8").startsWith(original)).toBe(true);
    expect(run(dir, ["update", "--force"]).status).toBe(0);
    for (const rel of ["AGENTS.md", "CLAUDE.md"]) expect(fs.readFileSync(path.join(dir, rel), "utf8").startsWith(original)).toBe(true);
    expect(run(dir, ["clean"]).status).toBe(0);
    for (const rel of ["AGENTS.md", "CLAUDE.md"]) expect(fs.readFileSync(path.join(dir, rel), "utf8")).toBe(original);
  });

  lifecycleTest("retains a pre-existing empty shared file after removing its contribution", () => {
    const dir = fixture();
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "");
    expect(run(dir, ["init"]).status).toBe(0);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")).toBe("");
  });

  lifecycleTest("real generated blocks survive another package's router through upgrade and clean", () => {
    const dir = fixture();
    expect(run(dir, ["init"]).status).toBe(0);
    const agents = path.join(dir, "AGENTS.md");
    const foreign = "<!-- wl-skills-ui:begin -->\nUI route\n<!-- wl-skills-ui:end -->\n";
    fs.appendFileSync(agents, `\n${foreign}`);
    const manifestPath = path.join(dir, ".wl-skills/state/kit/manifest.json");
    const old = JSON.parse(fs.readFileSync(manifestPath));
    old.version = "2.20.4";
    fs.writeFileSync(manifestPath, JSON.stringify(old));
    expect(run(dir, ["update"]).status).toBe(0);
    expect(run(dir, ["update", "--force"]).status).toBe(0);
    expect(fs.readFileSync(agents, "utf8")).toContain(foreign);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(agents, "utf8").trim()).toBe(foreign.trim());
  });

  lifecycleTest("migrates a manifest-owned legacy file while preserving a foreign appended block", () => {
    const dir = fixture();
    expect(run(dir, ["init"]).status).toBe(0);
    const file = path.join(dir, "AGENTS.md");
    const block = extractBlock(fs.readFileSync(file, "utf8"));
    const legacy = block.split("\n").slice(1, -1).join("\n") + "\n";
    const foreign = "<!-- wl-skills-ui:begin -->\nUI route\n<!-- wl-skills-ui:end -->";
    const appended = `\r\n\r\n \t${foreign}\r\n\r\n\r\n  \t`;
    fs.writeFileSync(file, `${legacy}${appended}`);
    const manifestPath = path.join(dir, ".wl-skills/state/kit/manifest.json");
    const old = JSON.parse(fs.readFileSync(manifestPath));
    old.version = "2.20.4";
    delete old.managedBlocks;
    old.files["AGENTS.md"] = md5(legacy);
    fs.writeFileSync(manifestPath, JSON.stringify(old));
    expect(run(dir, ["update"]).status).toBe(0);
    const updated = fs.readFileSync(file, "utf8");
    expect(updated).toContain(foreign);
    expect(extractBlock(updated).split("\n").slice(1, -1).join("\n") + "\n").toBe(legacy);
    expect(updated).toContain("<!-- wl-skills-kit:begin -->");
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe(appended);
  });

  lifecycleTest("preserves identical pre-existing files and directory .clinerules through clean", () => {
    const dir = fixture();
    const rel = ".wl-skills/copilot-instructions-full.md";
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    const source = fs.readFileSync(path.join(root, "files", rel), "utf8");
    fs.writeFileSync(path.join(dir, rel), source);
    fs.mkdirSync(path.join(dir, ".clinerules"));
    fs.writeFileSync(path.join(dir, ".clinerules/team.md"), "keep me\n");
    expect(run(dir, ["init", "--force"]).status).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, ".wl-skills/state/kit/manifest.json")));
    expect(manifest.files[rel]).toBeUndefined();
    expect(manifest.references[rel]).toBe("identical");
    expect(fs.existsSync(path.join(dir, ".clinerules/wl-skills-kit.md"))).toBe(false);
    expect(fs.existsSync(path.join(dir, ".cursor/rules/wl-skills-kit.mdc"))).toBe(false);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(path.join(dir, rel), "utf8")).toBe(source);
    expect(fs.readFileSync(path.join(dir, ".clinerules/team.md"), "utf8")).toBe("keep me\n");
  });

  lifecycleTest("cleans only JSON pointers it added, preserving comments and foreign entries", () => {
    const dir = fixture();
    fs.writeFileSync(path.join(dir, ".mcp.json"), '{\n  // team server\n  "mcpServers": { "team": {"command":"team"}, },\n}\n');
    expect(run(dir, ["init"]).status).toBe(0);
    expect(fs.readFileSync(path.join(dir, ".mcp.json"), "utf8")).toContain('"wl-skills"');
    expect(run(dir, ["clean"]).status).toBe(0);
    const content = fs.readFileSync(path.join(dir, ".mcp.json"), "utf8");
    expect(content).toContain("// team server");
    expect(content).toContain('"team"');
    expect(content).not.toContain('"wl-skills"');
  });

  lifecycleTest("preserves Kilo instruction-array comments and foreign duplicate values through update and clean", () => {
    const dir = fixture();
    const file = path.join(dir, "kilo.jsonc");
    const originalArray = '[\r\n // team instructions\r\n "docs/team.md", "docs/team.md", /* keep */\r\n]';
    fs.writeFileSync(file, `{\r\n "instructions": ${originalArray},\r\n "mcp": {"team":{"command":"team"}},\r\n}\r\n`);
    expect(run(dir, ["init"]).status).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toContain("// team instructions");
    expect(run(dir, ["update", "--force"]).status).toBe(0);
    expect(run(dir, ["clean"]).status).toBe(0);
    const content = fs.readFileSync(file, "utf8");
    expect(content).toContain(originalArray);
    expect(content).not.toContain(".kilo/rules/wl-skills.md");
    expect(content).toContain('"team"');
  });

  lifecycleTest("references pre-existing Kilo instructions without acquiring clean ownership", () => {
    const dir = fixture();
    const file = path.join(dir, "kilo.jsonc");
    const originalArray = JSON.stringify(['docs/brackets ] and quote " and /* literal */.md', "AGENTS.md"]);
    fs.writeFileSync(file, `{"instructions":${originalArray},"mcp":{}}\n`);
    expect(run(dir, ["init"]).status).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, ".wl-skills/state/kit/manifest.json")));
    expect(manifest.managedJson["kilo.jsonc"]).toBeUndefined();
    expect(manifest.managedMcp.records["kilo.jsonc"].owned).toBe(true);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toContain(originalArray);
  });

  lifecycleTest("preserves comments added inside its own MCP entry on update and clean", () => {
    const dir = fixture();
    expect(run(dir, ["init"]).status).toBe(0);
    const file = path.join(dir, ".mcp.json");
    const content = fs.readFileSync(file, "utf8").replace('"command":', '// local execution note\n"command":');
    fs.writeFileSync(file, content);
    expect(run(dir, ["update", "--force"]).status).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe(content);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe(content);
    expect(fs.existsSync(path.join(dir, ".wl-skills/state/kit/manifest.json"))).toBe(true);
  });

  lifecycleTest("retires a legacy .clinerules path while preserving a team-owned replacement directory", () => {
    const dir = fixture();
    expect(run(dir, ["init"]).status).toBe(0);
    const legacy = "Legacy Kit rules.\n";
    const manifestPath = path.join(dir, ".wl-skills/state/kit/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.version = "2.20.4";
    manifest.files[".clinerules"] = md5(legacy);
    fs.renameSync(manifestPath, path.join(dir, ".wl-skills-manifest.json"));
    fs.writeFileSync(path.join(dir, ".wl-skills-manifest.json"), JSON.stringify(manifest));
    // The historical managed file has since been replaced by a team directory.
    // Retiring its record must never delete or rebuild that directory.
    fs.mkdirSync(path.join(dir, ".clinerules"));
    fs.writeFileSync(path.join(dir, ".clinerules/team.md"), "Team route.\n");
    expect(run(dir, ["update", "--force"]).status).toBe(0);
    expect(fs.existsSync(path.join(dir, ".clinerules/wl-skills-kit.md"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, ".clinerules/team.md"), "utf8")).toBe("Team route.\n");
    expect(fs.existsSync(path.join(dir, ".wl-skills-manifest.json"))).toBe(false);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(path.join(dir, ".clinerules/team.md"), "utf8")).toBe("Team route.\n");
  });
});

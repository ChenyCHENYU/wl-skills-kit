import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { extractBlock } = require("../lib/managed-markdown");
const root = path.resolve(import.meta.dirname, "..");
const fixtures = [];
const md5 = (text) => crypto.createHash("md5").update(text).digest("hex");
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kit-lifecycle-"));
  fixtures.push(dir);
  return dir;
}
function run(dir, args) {
  const result = spawnSync(process.execPath, [path.join(root, "bin/wl-skills.js"), ...args], { cwd: dir, encoding: "utf8", timeout: 30000 });
  return result;
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
  it("keeps shared Markdown and MCP originals intact when CLI temporary writes fail", () => {
    for (const [rel, original] of [["AGENTS.md", "# Team  \r\n\r\nTail \t"], [".mcp.json", '{"mcpServers":{"team":{"command":"team"}}}\n']]) {
      const dir = fixture();
      fs.writeFileSync(path.join(dir, rel), original);
      const preload = failingPreload(dir, path.basename(rel));
      const result = spawnSync(process.execPath, ["--require", preload, path.join(root, "bin/wl-skills.js"), "init"], { cwd: dir, encoding: "utf8", timeout: 30000 });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Injected temporary write failure");
      expect(fs.readFileSync(path.join(dir, rel), "utf8")).toBe(original);
      expect(fs.readdirSync(dir).some((file) => file.startsWith(`.${rel}.wl-skills-`))).toBe(false);
    }
  });

  it("preserves every user byte outside routers, including CRLF, blank lines and trailing spaces", () => {
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

  it("retains a pre-existing empty shared file after removing its contribution", () => {
    const dir = fixture();
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "");
    expect(run(dir, ["init"]).status).toBe(0);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")).toBe("");
  });

  it("real generated blocks survive another package's router through upgrade and clean", () => {
    const dir = fixture();
    expect(run(dir, ["init"]).status).toBe(0);
    const agents = path.join(dir, "AGENTS.md");
    const foreign = "<!-- wl-skills-ui:begin -->\nUI route\n<!-- wl-skills-ui:end -->\n";
    fs.appendFileSync(agents, `\n${foreign}`);
    const manifestPath = path.join(dir, ".wl-skills-manifest.json");
    const old = JSON.parse(fs.readFileSync(manifestPath));
    old.version = "2.20.4";
    fs.writeFileSync(manifestPath, JSON.stringify(old));
    expect(run(dir, ["update"]).status).toBe(0);
    expect(run(dir, ["update", "--force"]).status).toBe(0);
    expect(fs.readFileSync(agents, "utf8")).toContain(foreign);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(agents, "utf8").trim()).toBe(foreign.trim());
  });

  it("migrates a manifest-owned legacy file while preserving a foreign appended block", () => {
    const dir = fixture();
    expect(run(dir, ["init"]).status).toBe(0);
    const file = path.join(dir, "AGENTS.md");
    const block = extractBlock(fs.readFileSync(file, "utf8"));
    const legacy = block.split("\n").slice(1, -1).join("\n") + "\n";
    const foreign = "<!-- wl-skills-ui:begin -->\nUI route\n<!-- wl-skills-ui:end -->";
    const appended = `\r\n\r\n \t${foreign}\r\n\r\n\r\n  \t`;
    fs.writeFileSync(file, `${legacy}${appended}`);
    const manifestPath = path.join(dir, ".wl-skills-manifest.json");
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

  it("preserves identical pre-existing files and directory .clinerules through clean", () => {
    const dir = fixture();
    const rel = ".wl-skills/copilot-instructions-full.md";
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    const source = fs.readFileSync(path.join(root, "files", rel), "utf8");
    fs.writeFileSync(path.join(dir, rel), source);
    fs.mkdirSync(path.join(dir, ".clinerules"));
    fs.writeFileSync(path.join(dir, ".clinerules/team.md"), "keep me\n");
    expect(run(dir, ["init", "--force"]).status).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, ".wl-skills-manifest.json")));
    expect(manifest.files[rel]).toBeUndefined();
    expect(manifest.references[rel]).toBe("identical");
    expect(fs.existsSync(path.join(dir, ".clinerules/wl-skills-kit.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, ".cursor/rules/wl-skills-kit.mdc"))).toBe(true);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(path.join(dir, rel), "utf8")).toBe(source);
    expect(fs.readFileSync(path.join(dir, ".clinerules/team.md"), "utf8")).toBe("keep me\n");
  });

  it("cleans only JSON pointers it added, preserving comments and foreign entries", () => {
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

  it("preserves Kilo instruction-array comments and foreign duplicate values through update and clean", () => {
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

  it("references pre-existing Kilo instructions without acquiring clean ownership", () => {
    const dir = fixture();
    const file = path.join(dir, "kilo.jsonc");
    const originalArray = JSON.stringify(['docs/brackets ] and quote " and /* literal */.md', ".kilo/rules/wl-skills.md"]);
    fs.writeFileSync(file, `{"instructions":${originalArray},"mcp":{}}\n`);
    expect(run(dir, ["init"]).status).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, ".wl-skills-manifest.json")));
    expect(manifest.managedJson["kilo.jsonc"].instructions).toEqual([]);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toContain(originalArray);
  });

  it("preserves comments added inside its own MCP entry on update and clean", () => {
    const dir = fixture();
    expect(run(dir, ["init"]).status).toBe(0);
    const file = path.join(dir, ".mcp.json");
    const content = fs.readFileSync(file, "utf8").replace('"command":', '// local execution note\n"command":');
    fs.writeFileSync(file, content);
    expect(run(dir, ["update", "--force"]).status).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe(content);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe(content);
    expect(fs.existsSync(path.join(dir, ".wl-skills-manifest.json"))).toBe(true);
  });

  it("migrates a former single .clinerules into a directory without deleting team files", () => {
    const dir = fixture();
    expect(run(dir, ["init"]).status).toBe(0);
    // 新装默认目录形态；此处显式构造遗留单文件状态（旧版 kit 的安装产物）：
    // 用 kit 的区块内容重建单文件并按旧清单登记所有权，再由团队改为目录。
    const dirContent = fs.readFileSync(path.join(dir, ".clinerules", "wl-skills-kit.md"), "utf8");
    fs.rmSync(path.join(dir, ".clinerules"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".clinerules"), dirContent);
    const manifestPath = path.join(dir, ".wl-skills-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.files[".clinerules"] = manifest.files[".clinerules/wl-skills-kit.md"];
    delete manifest.files[".clinerules/wl-skills-kit.md"];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    fs.unlinkSync(path.join(dir, ".clinerules"));
    fs.mkdirSync(path.join(dir, ".clinerules"));
    fs.writeFileSync(path.join(dir, ".clinerules/team.md"), "Team route.\n");
    expect(run(dir, ["update", "--force"]).status).toBe(0);
    expect(fs.existsSync(path.join(dir, ".clinerules/wl-skills-kit.md"))).toBe(true);
    expect(run(dir, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(path.join(dir, ".clinerules/team.md"), "utf8")).toBe("Team route.\n");
  });
});

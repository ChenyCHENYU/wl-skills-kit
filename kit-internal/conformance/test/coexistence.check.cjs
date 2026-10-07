"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const test = require("node:test");
const { parseJsonc } = require("../support/shared-jsonc.cjs");
const root = require("../support/workspace-root.cjs");
const names = ["design", "kit", "ui", "bd", "test"];
const bins = { design: "wl-skills-design.js", kit: "wl-skills.js", ui: "wl-ui.js", bd: "wl-skills-bd.js", test: "wl-skills-test.js" };
const states = { design: ".wl-skills-design/state.json", kit: ".wl-skills-manifest.json", ui: ".wl-skills-ui-manifest.json", bd: ".wl-skills-bd-manifest.json", test: ".wl-skills-test/manifest.json" };
const sharedPaths = new Set(["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md", "copilot-instructions.md", ".github/skills/_registry.md", ".github/skills/_pipeline.md", ".github/standards/index.md", ".github/guides/usage.md", ".github/guides/architecture.md", ".mcp.json", ".cursor/mcp.json", ".kiro/settings/mcp.json", ".vscode/mcp.json", ".kilo/kilo.jsonc", "kilo.jsonc", "kilo.json", ".clinerules"]);

function command(name, action, project, extra = []) {
  const bin = path.join(root, `wl-skills-${name}/bin`, bins[name]);
  const args = [bin, action];
  if (name === "design" && action !== "uninstall") args.push("--editor", "all");
  if (name === "ui") {
    args.push("--project", project);
    if (action !== "clean") args.push("--editor", "all", "--profile", "native-element", "--skills-only");
  }
  if (name === "bd") args.push("--target", project, "--json");
  return spawnSync(process.execPath, [...args, ...extra], { cwd: project, encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
}

function success(result, label) {
  assert.equal(result.status, 0, `${label}\n${result.error || ""}\n${result.stderr}\n${result.stdout.slice(-5000)}`);
}

function run(name, action, project) {
  if (name === "bd") {
    const preview = command(name, action, project);
    success(preview, `${name} ${action} preview`);
    const data = JSON.parse(preview.stdout);
    assert.ok(data.planHash, JSON.stringify(data));
    const applied = command(name, action, project, ["--confirm", "--plan-hash", data.planHash]);
    success(applied, `${name} ${action} apply`);
    return;
  }
  const extra = action === "update" && ["kit", "ui"].includes(name) ? ["--force"] : [];
  success(command(name, action, project, extra), `${name} ${action}`);
}

function write(project, relative, content) {
  const file = path.join(project, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function fixture({ emptyRouters = false } = {}) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "wl-conformance-"));
  const sentinels = {
    "AGENTS.md": "# Project agents  \r\n\r\n\r\nUser decisions stay here.\r\n \t\r\n\r\n\r\n",
    "CLAUDE.md": "# Project claude\n\n\nUser decisions stay here.\n\n  ",
    ".github/copilot-instructions.md": "# Project Copilot  \n\n\n",
    ".github/skills/_registry.md": "# Project capability registry\n",
    ".github/skills/_pipeline.md": "# Project pipeline\n",
    ".github/standards/index.md": "# Project standards\n",
    ".github/guides/usage.md": "# Project usage\n",
    ".github/guides/architecture.md": "# Project architecture\n",
    ".github/skills/team/SKILL.md": "---\nname: team\ndescription: Project-specific workflow.\n---\nKeep this skill.\n",
    ".agents/skills/team/SKILL.md": "---\nname: team\ndescription: Project native skill.\n---\nKeep this native skill.\n",
    ".github/standards/team.md": "# Team rule\nKeep this rule.\n",
    ".cursor/rules/team.mdc": "# Team cursor\n",
    ".kiro/steering/team.md": "# Team kiro\n",
    ".clinerules/team.md": "# Team cline\n",
    ".mcp.json": '{\n  // team MCP configuration\n  "mcpServers": {"team": {"command":"team-server"},},\n}\n',
    "package.json": '{"name":"wl-conformance-fixture","private":true}\n',
  };
  if (emptyRouters) for (const relative of ["AGENTS.md", "CLAUDE.md", ".github/guides/usage.md"]) sentinels[relative] = "";
  for (const [relative, content] of Object.entries(sentinels)) write(project, relative, content);
  return { project, sentinels };
}

function tree(project, current = project, out = {}) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const file = path.join(current, entry.name);
    if (entry.isDirectory()) tree(project, file, out);
    else if (entry.isFile()) out[path.relative(project, file).replace(/\\/g, "/")] = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  }
  return out;
}

function block(content, name) {
  const start = `<!-- wl-skills-${name}:begin -->`;
  const end = `<!-- wl-skills-${name}:end -->`;
  const offset = content.indexOf(start);
  return offset < 0 ? null : content.slice(offset, content.indexOf(end, offset) + end.length);
}

function assertSentinels(project, sentinels) {
  for (const [relative, content] of Object.entries(sentinels)) {
    const file = path.join(project, relative);
    assert.ok(fs.existsSync(file), `lost project file ${relative}`);
    const actual = fs.readFileSync(file, "utf8");
    if (relative === ".mcp.json") {
      assert.match(actual, /\/\/ team MCP configuration/);
      assert.deepEqual(parseJsonc(actual).mcpServers.team, { command: "team-server" });
    } else assert.ok(actual.includes(content), `changed project content ${relative}`);
  }
}

function snapshot(project, name) {
  const statePath = path.join(project, states[name]);
  assert.ok(fs.existsSync(statePath), `${name} installation state missing: ${states[name]}`);
  const manifest = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const paths = Array.isArray(manifest.files) ? manifest.files.map((file) => file.path) : Object.keys(manifest.files || {});
  const gateway = `.agents/skills/wl-skills-${name}/SKILL.md`;
  assert.ok(paths.includes(gateway), `${name} native gateway missing from its ownership manifest`);
  const all = tree(project);
  const owned = {};
  for (const relative of paths) if (!sharedPaths.has(relative) && all[relative]) owned[relative] = all[relative];
  const agents = fs.readFileSync(path.join(project, "AGENTS.md"), "utf8");
  const contribution = block(agents, name);
  assert.ok(contribution, `${name} AGENTS contribution missing`);
  return { owned, contribution, state: fs.readFileSync(statePath, "utf8") };
}

function assertSnapshot(project, name, previous) {
  const current = tree(project);
  for (const [relative, hash] of Object.entries(previous.owned)) assert.equal(current[relative], hash, `${name} lost/changed ${relative}`);
  assert.equal(block(fs.readFileSync(path.join(project, "AGENTS.md"), "utf8"), name), previous.contribution, `${name} route contribution changed`);
  assert.equal(fs.readFileSync(path.join(project, states[name]), "utf8"), previous.state, `${name} state was changed by another package`);
}

function assertOtherPackages(project, installed, except) {
  for (const [name, previous] of installed) if (name !== except) assertSnapshot(project, name, previous);
}

function assertEmptyRouters(project, options) {
  if (!options?.emptyRouters) return;
  for (const relative of ["AGENTS.md", "CLAUDE.md", ".github/guides/usage.md"]) {
    assert.equal(fs.readFileSync(path.join(project, relative), "utf8"), "", `changed preexisting empty file ${relative}`);
  }
}

function exercise(order, options) {
  const { project, sentinels } = fixture(options);
  try {
    const installed = new Map();
    for (const name of order) {
      run(name, "init", project);
      assertSentinels(project, sentinels);
      assertOtherPackages(project, installed);
      installed.set(name, snapshot(project, name));
    }
    for (const name of order) {
      run(name, "update", project);
      assertSentinels(project, sentinels);
      assertOtherPackages(project, installed, name);
      installed.set(name, snapshot(project, name));
    }
    for (const name of order.slice().reverse()) {
      run(name, name === "design" ? "uninstall" : "clean", project);
      installed.delete(name);
      assertSentinels(project, sentinels);
      assertOtherPackages(project, installed);
    }
    assertEmptyRouters(project, options);
  } finally {
    if (process.env.WL_KEEP_FIXTURES !== "1") fs.rmSync(project, { recursive: true, force: true });
  }
}

const filter = process.env.WL_MATRIX_FILTER;
function add(order, prefix) {
  const title = `${prefix} ${order.join(" → ")}`;
  if (!filter || title.includes(filter)) test(title, () => exercise(order));
}
for (const name of names) add([name], "standalone lifecycle");
for (const name of names) {
  const title = `standalone empty shared files ${name}`;
  if (!filter || title.includes(filter)) test(title, () => exercise([name], { emptyRouters: true }));
}
for (const left of names) for (const right of names) if (left !== right) add([left, right], "pair lifecycle");

function permutations(items) {
  return items.length === 0 ? [[]] : items.flatMap((item) => permutations(items.filter((other) => other !== item)).map((tail) => [item, ...tail]));
}
if (process.env.WL_FULL_MATRIX === "1") for (const order of permutations(names)) add(order, "five-package lifecycle");

for (const name of names) {
  if (filter && !`preflight ${name}`.includes(filter)) continue;
  test(`preflight ${name} rejects a foreign file where an editor directory is needed without partial writes`, () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "wl-preflight-"));
    try {
      write(project, "package.json", '{"name":"preflight-fixture","private":true}');
      write(project, ".cursor", "project owned cursor file\n");
      const before = tree(project);
      let result = command(name, "init", project);
      if (name === "bd" && result.status === 0) {
        const plan = JSON.parse(result.stdout);
        result = command(name, "init", project, ["--confirm", "--plan-hash", plan.planHash]);
      }
      assert.notEqual(result.status, 0, `${name} should reject parent type conflict`);
      assert.deepEqual(tree(project), before, `${name} wrote a partial installation`);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
}

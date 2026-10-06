"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const test = require("node:test");
const root = require("../support/workspace-root.cjs");
const bins = { design: "wl-skills-design.js", kit: "wl-skills.js", ui: "wl-ui.js", bd: "wl-skills-bd.js", test: "wl-skills-test.js" };

function execute(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.error || ""}\n${result.stderr}\n${result.stdout.slice(-3000)}`);
  return result.stdout;
}

for (const name of ["design", "kit", "ui", "bd", "test"]) {
  test(`published ${name} payload installs independently with its own support and preserves project content`, () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `wl-published-${name}-`));
    try {
      const source = path.join(root, `wl-skills-${name}`);
      const packed = JSON.parse(execute("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary, "--cache", path.join(temporary, "npm-cache")], source))[0];
      const supportDirectory = name === "ui" ? "bin" : "lib";
      const names = new Set(packed.files.map((file) => file.path));
      assert.ok(names.has(`${supportDirectory}/capabilities.json`), "capability boundary omitted from payload");
      if (name !== "design") {
        assert.ok(names.has(`${supportDirectory}/shared-jsonc.cjs`), "shared configuration support omitted from payload");
        assert.ok(names.has(`${supportDirectory}/vendor/jsonc-parser/LICENSE.md`), "parser license omitted from payload");
      }
      const isolated = path.join(temporary, "isolated");
      fs.mkdirSync(isolated);
      execute("tar", ["-xzf", path.join(temporary, packed.filename), "-C", isolated], temporary);
      const installed = path.join(isolated, "package");
      // Only kit has ordinary npm runtime dependencies. Reuse its installed dependency
      // graph, never another WL product package or the conformance support directory.
      if (name === "kit") fs.symlinkSync(path.join(source, "node_modules"), path.join(installed, "node_modules"), "dir");
      const project = path.join(temporary, "project");
      fs.mkdirSync(project);
      fs.writeFileSync(path.join(project, "package.json"), '{"name":"published-fixture","private":true}');
      const original = "# User-owned project instructions\n";
      fs.writeFileSync(path.join(project, "AGENTS.md"), original);
      const cli = path.join(installed, "bin", bins[name]);
      const args = [cli, "init"];
      if (name === "ui") args.push("--project", project, "--editor", "agents-generic", "--profile", "native-element", "--skills-only");
      if (name === "bd") {
        const preview = JSON.parse(execute(process.execPath, [...args, "--target", project, "--json"], project));
        args.push("--target", project, "--json", "--confirm", "--plan-hash", preview.planHash);
      }
      execute(process.execPath, args, project);
      const agents = fs.readFileSync(path.join(project, "AGENTS.md"), "utf8");
      assert.ok(agents.includes(original));
      assert.ok(agents.includes(`<!-- wl-skills-${name}:begin -->`));
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  });
}

import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repo = path.resolve(import.meta.dirname, "..");
test("Kit workspace store preserves actual checker file freshness without siblings", () => {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), "kit-external-store-")));
  const project = path.join(temporary, "workspace/apps/admin");
  const physical = path.join(temporary, "workspace/node_modules/.pnpm/kit-fixture/node_modules/@agile-team/wl-skills-kit");
  try {
    fs.mkdirSync(project, { recursive: true });fs.mkdirSync(physical, { recursive: true });
    for (const file of ["bin", "lib", "files", "mcp", "package.json"]) fs.cpSync(path.join(repo, file), path.join(physical, file), { recursive: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
    fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ private: true, devDependencies: { [pkg.name]: pkg.version, vue: "^3.4.0" } }));
    const logical = path.join(project, "node_modules", pkg.name);
    fs.mkdirSync(path.dirname(logical), { recursive: true });fs.symlinkSync(path.relative(path.dirname(logical), physical), logical, "dir");
    fs.mkdirSync(path.join(project, "src/views/Demo"), { recursive: true });
    fs.writeFileSync(path.join(project, "src/views/Demo/index.vue"), "<template><div>Page</div></template>");
    const run = args => {
      const result = spawnSync(process.execPath, [path.join(physical, "bin/wl-skills.js"), ...args], { cwd: project, encoding: "utf8", timeout: 30000 });
      assert.equal(result.status, 0, result.stderr);return result.stdout;
    };
    run(["init"]);
    const plan = JSON.parse(run(["task", "检查已有 Vue 页面", "--target", "src/views/Demo/index.vue", "--run-id", "external-store", "--json"]));
    assert.equal(plan.ready, true);
    const status = () => JSON.parse(run(["status", "--run-id", plan.runId, "--json"]));
    const before = status();assert.equal(before.planStale, false);
    const snapshot = before.records.find(record => record.kind === "task-decision").ruleSnapshot;
    assert.ok(snapshot.targets.includes(`node_modules/${pkg.name}/lib/ast-rules.js`));
    assert.ok(snapshot.targets.includes(`node_modules/${pkg.name}/bin/wl-skills.js`));
    const rule = path.join(physical, "lib/ast-rules.js");const original = fs.readFileSync(rule);
    fs.appendFileSync(rule, "\n// isolated fixture change\n");assert.equal(status().planStale, true);
    fs.writeFileSync(rule, original);assert.equal(status().planStale, false);
    fs.appendFileSync(path.join(physical, "bin/wl-skills.js"), "\n// isolated fixture change\n");
    assert.equal(status().planStale, true);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

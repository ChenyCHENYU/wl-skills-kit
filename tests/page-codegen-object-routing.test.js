import {test} from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const repo = path.resolve(import.meta.dirname, "..");
const cli = path.join(repo, "bin/wl-skills.js");
const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
const cases = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "page-codegen-object-cases.json"), "utf8"));

test("单包真实协议：泛生成词需要 PC 页面对象，目录与文件目标保留精准生成能力", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-codegen-object-"));
  const project = path.join(temporary, "project");
  fs.mkdirSync(project);
  const run = (args) => {
    const result = spawnSync(process.execPath, [cli, ...args], {cwd: project, encoding: "utf8", timeout: 30000});
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout;
  };
  try {
    fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({private: true, devDependencies: {[pkg.name]: "*"}}));
    run(["init"]);
    const inventory = JSON.parse(run(["protocol", "describe", "--json"]));
    const skill = inventory.inventory.skills.find((entry) => entry.id === "page-codegen");
    assert.ok(skill.triggerCondition.triggers.includes("帮我生成"));
    assert.ok(skill.triggerCondition.targetExtensions.includes(".vue"));
    const request = path.join(temporary, "request.json");
    for (const row of cases) {
      fs.writeFileSync(request, JSON.stringify({operation: "route", projectRoot: project, task: row.task, ...(row.targets ? {targets: row.targets} : {})}));
      const envelope = JSON.parse(run(["protocol", "request", "--input-file", request, "--json"]));
      assert.equal(envelope.ok, true, row.task);
      const decision = envelope.result.decision || envelope.result;
      assert.equal(decision.status, row.status, row.task);
      assert.deepEqual(decision.selectedSkills, row.skills, row.task);
      if (["needs-context", "not-applicable"].includes(row.status)) {
        assert.deepEqual(decision.requiredRules, [], row.task);
        assert.deepEqual(decision.requiredChecks, [], row.task);
      }
    }
    assert.equal(fs.existsSync(path.join(project, ".wl-skills/runs")), false, "route 不写任务记录");
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
});

import { describe, expect, it, beforeAll } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { protocol, runOperation } = require("../lib/protocol-cli");
const cases = require("./protocol-routing-cases.json");
const BIN = path.join(__dirname, "..", "bin", "wl-skills.js");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-routing-"));
}

function routeAt(projectRoot, task) {
  if (!fs.existsSync(path.join(projectRoot, "package.json"))) fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ devDependencies: { "@agile-team/wl-skills-kit": "*" } }));
  return protocol.request({ operation: "route", projectRoot, task }, runOperation);
}

describe("路由准确性：逐技能语料（预期经人工复核冻结）", () => {
  let installedRoot;

  beforeAll(() => {
    installedRoot = tempRoot();
    const run = spawnSync(process.execPath, [BIN, "init"], { cwd: installedRoot, encoding: "utf8", timeout: 120000 });
    expect(run.status, `kit init 失败：${run.stderr}`).toBe(0);
  }, 180000);

  for (const item of cases) {
    const expectedBare = item.skill ? "gap" : item.status;
    const expectedInstalled = item.installedStatus || (item.skill ? "matched" : item.status);

    it(`已声明接入但未初始化：「${item.task}」→ ${expectedBare}${item.skill ? ` + ${item.skill}` : ""}`, () => {
      const envelope = routeAt(tempRoot(), item.task);
      expect(envelope.ok).toBe(true);
      const decision = envelope.result.decision || envelope.result;
      expect(decision.status).toBe(expectedBare);
      if (item.skill) expect(decision.selectedSkills).toContain(item.skill);
      else expect((decision.selectedSkills || []).length).toBe(0);
    });

    it(`已安装：「${item.task}」→ ${expectedInstalled}${item.skill ? ` + ${item.skill}` : ""}`, () => {
      const envelope = routeAt(installedRoot, item.task);
      expect(envelope.ok).toBe(true);
      const decision = envelope.result.decision || envelope.result;
      expect(decision.status).toBe(expectedInstalled);
      if (item.skill) expect(decision.selectedSkills).toContain(item.skill);
    });
  }
});

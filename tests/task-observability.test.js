import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const packageRoot = path.resolve(import.meta.dirname, "..");
const fixtures = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-task-"));
  fixtures.push(root);
  return root;
}
function run(root, args) {
  return spawnSync(process.execPath, [path.join(packageRoot, "bin/wl-skills.js"), ...args], { cwd: root, encoding: "utf8", timeout: 30000 });
}
function page(root) {
  const dir = path.join(root, "src/views/Demo");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.vue"), "<template><div>Title</div></template>\n");
  fs.writeFileSync(path.join(dir, "data.ts"), "export const title = 'Title';\n");
  fs.writeFileSync(path.join(dir, "index.scss"), ".demo { display: block; }\n");
  return dir;
}
afterEach(() => fixtures.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe("kit real task evidence", () => {
  it("uses only its installed canonical assets for a ready specialized decision", () => {
    const root = fixture();
    expect(run(root, ["init"]).status).toBe(0);
    const planned = run(root, ["task", "创建页面", "--target", "src/views", "--json"]);
    expect(planned.status, planned.stderr).toBe(0);
    const decision = JSON.parse(planned.stdout);
    expect(decision.status).toBe("matched");
    expect(decision.ready).toBe(true);
    expect(decision.missingInputs).toEqual([]);
    expect(decision.executionStatus).toBe("not-executed");
  });
  it("reports explicit unsupported skills and frameworks as capability gaps", () => {
    const root = fixture();
    for (const args of [["创建 React 页面"], ["修改页面", "--skill", "unreleased-capability"]]) {
      const result = run(root, ["route", ...args, "--json"]);
      expect(result.status, result.stderr).toBe(0);
      const decision = JSON.parse(result.stdout);
      expect(decision.status).toBe("gap");
      expect(decision.ready).toBe(false);
      expect(decision.gaps.length).toBeGreaterThan(0);
    }
  });
  it("routes ordinary changes to baseline, explicit generation to its Skill, and unrelated work outside the domain", () => {
    const root = fixture();
    for (const [text, target, expected] of [["修改文字", "src/Test.vue", "baseline"], ["创建页面", "src/Test.vue", "matched"], ["帮我写诗", "", "not-applicable"], ["修复", "", "needs-context"], ["创建页面并自动修复", "src/Test.vue", "ambiguous"]]) {
      const result = run(root, ["route", text, "--target", target, "--json"]);
      expect(result.status, result.stderr).toBe(0);
      const decision = JSON.parse(result.stdout);
      expect(decision.routingStatus || decision.status).toBe(expected);
      if (decision.applicable === true) { expect(decision.status).toBe("gap"); expect(decision.ready).toBe(false); }
    }
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("records real CLI checking, correlates a plan, and rejects stale success after edits", () => {
    const root = fixture();
    const dir = page(root);
    const started = run(root, ["task", "修改页面文字", "--target", "src/views/Demo", "--json"]);
    const plan = JSON.parse(started.stdout);
    expect(plan.executionStatus).toBe("not-executed");
    expect(plan.validationStatus).toBe("unverified");
    const checked = run(root, ["validate", "src/views/Demo", "--json", "--run-id", plan.runId]);
    const result = JSON.parse(checked.stdout);
    expect(result.runId).toBe(plan.runId);
    expect(result.summary.pages).toBe(1);
    expect(result.executionStatus).toBe(checked.status === 0 ? "completed" : "failed");
    expect(result.receiptPath).toContain(".wl-skills/runs/");
    const status = JSON.parse(run(root, ["status", "--run-id", plan.runId, "--json"]).stdout);
    expect(status.tools).toHaveLength(1);
    expect(status.tools[0].checkedFiles.map((file) => file.path).sort()).toEqual(["src/views/Demo/data.ts", "src/views/Demo/index.scss", "src/views/Demo/index.vue"]);
    expect(status.tools[0].checks.find((check) => check.id === "validate")).toBeTruthy();
    expect(status.tools[0].checks.find((check) => check.id === "typecheck").status).toBe("skipped");
    expect(status.stale).toBe(false);
    fs.appendFileSync(path.join(dir, "index.vue"), "<!-- changed -->\n");
    expect(JSON.parse(run(root, ["status", "--run-id", plan.runId, "--json"]).stdout).stale).toBe(true);
  });

  it("keeps empty validation unverified and host discovery unverified", () => {
    const root = fixture();
    const result = run(root, ["validate", "src/views", "--json"]);
    expect(result.status).toBe(1);
    const status = JSON.parse(run(root, ["status", "--json"]).stdout);
    expect(status.tools[0].validationStatus).toBe("unverified");
    const diagnostic = JSON.parse(run(root, ["doctor-host", "--json"]).stdout);
    expect(diagnostic.entryReadiness).toBe("incomplete");
    expect(diagnostic.hostDiscovery).toBe("unverified");
  });

  it("owns only its native gateway and preserves user edits on update and clean", () => {
    const root = fixture();
    expect(run(root, ["init"]).status).toBe(0);
    const gateway = path.join(root, ".agents/skills/wl-skills-kit/SKILL.md");
    expect(fs.readdirSync(path.dirname(path.dirname(gateway)))).toEqual(["wl-skills-kit"]);
    fs.appendFileSync(gateway, "\nUser instruction\n");
    expect(run(root, ["update"]).status).toBe(0);
    expect(run(root, ["clean"]).status).toBe(0);
    expect(fs.readFileSync(gateway, "utf8")).toContain("User instruction");
  });
});

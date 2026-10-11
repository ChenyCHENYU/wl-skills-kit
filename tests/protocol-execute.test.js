import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repo = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
const cli = path.join(repo, "bin/wl-skills.js");
const selected = "src/views/Selected/index.vue";

function fixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-public-execute-"));
  try {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ private: true, devDependencies: { [pkg.name]: pkg.version, vue: "^3.4.0" } }));
    fs.mkdirSync(path.join(root, "node_modules/@agile-team"), { recursive: true });
    fs.symlinkSync(repo, path.join(root, "node_modules", pkg.name), "dir");
    fs.mkdirSync(path.dirname(path.join(root, selected)), { recursive: true });
    fs.writeFileSync(path.join(root, selected), "<template><div>example</div></template>\n");
    const installed = spawnSync(process.execPath, [cli, "init"], { cwd: root, encoding: "utf8", timeout: 30000 });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    callback(root);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function request(root, input) {
  const file = path.join(root, "request.json");
  fs.writeFileSync(file, JSON.stringify({ projectRoot: root, ...input }));
  const called = spawnSync(process.execPath, [cli, "protocol", "request", "--input-file", file, "--json"], { cwd: root, encoding: "utf8", timeout: 30000 });
  assert.equal(called.signal, null, called.stderr);
  return { ...JSON.parse(called.stdout), cliExitCode: called.status };
}

function plan(root, runId, task = "检查当前 Vue 代码") {
  const planned = request(root, { operation: "task", task, runId, targets: [selected] });
  assert.equal(planned.ok, true);
  return planned.result;
}

function execute(root, runId, extra = {}) {
  return request(root, { operation: "execute", runId, executorId: "validate", parameters: { targets: [selected] }, ...extra });
}

test("公开 execute 复用原 validate：真实成功和失败、同 runId 回查、文件范围不扩大", () => fixture(root => {
  const source = fs.readFileSync(path.join(root, selected));
  assert.ok(plan(root, "passed").integration.allowedExecutors.includes("validate"));
  const passed = execute(root, "passed");
  assert.equal(passed.ok, true, JSON.stringify(passed));
  assert.equal(passed.cliExitCode, 0);
  assert.equal(passed.result.execution.exitCode, 0);
  assert.equal(passed.result.execution.signal, null);
  assert.equal(passed.result.integration.runId, "passed");
  assert.equal(passed.result.integration.executionStatus, "completed");
  assert.deepEqual(fs.readFileSync(path.join(root, selected)), source);
  const report = JSON.parse(passed.result.execution.stdout);
  assert.equal(report.requestedTarget, selected);
  assert.equal(report.summary.pages, 1);
  assert.ok(report.summary.checkedFiles.every(file => file.startsWith("src/views/Selected/")));
  const status = request(root, { operation: "status", runId: "passed" });
  assert.equal(status.result.integration.executionStatus, passed.result.integration.executionStatus);
  assert.equal(status.result.tools[0].tool, "validate");
  fs.writeFileSync(path.join(root, selected), "<template><div/></template><script setup>const endpoint = 'http://10.0.0.1/unsafe';</script>");
  plan(root, "failed");
  const failed = execute(root, "failed");
  assert.equal(failed.ok, true, JSON.stringify(failed));
  assert.equal(failed.result.execution.exitCode, 1);
  assert.equal(failed.result.integration.executionStatus, "failed");
  assert.equal(failed.result.integration.validationStatus, "failed");
  assert.ok(JSON.parse(failed.result.execution.stdout).issues.some(issue => issue.level === "error" && issue.rule === "K12"));
}), 30000);

test("execute 非法字段、未知执行器与计划外目标在原 CLI 前拒绝，计划逐字节不变", () => fixture(root => {
  const planned = plan(root, "rejected");
  const planFile = path.join(root, planned.recordPath);
  const files = fs.readdirSync(path.dirname(planFile));
  const before = fs.readFileSync(planFile);
  const cases = [
    [{ executorId: "unknown" }, "unsupported-executor"],
    [{ parameters: { targets: [] } }, "invalid-executor-input"],
    [{ parameters: { targets: [selected, "src/views/Other/index.vue"] } }, "invalid-executor-input"],
    [{ parameters: { targets: ["src/views/Other/index.vue"] } }, "target-mismatch"],
    [{ parameters: { targets: [selected], command: "init" } }, "invalid-executor-input"],
    [{ targets: [selected] }, "invalid-executor-input"],
  ];
  for (const [input, code] of cases) {
    const rejected = execute(root, "rejected", input);
    assert.equal(rejected.ok, false, JSON.stringify(input));
    assert.equal(rejected.cliExitCode, 2);
    assert.equal(rejected.error.code, code);
    assert.deepEqual(fs.readFileSync(planFile), before);
    assert.deepEqual(fs.readdirSync(path.dirname(planFile)), files);
    assert.equal(request(root, { operation: "status", runId: "rejected" }).result.executionStatus, "not-executed");
  }
}), 30000);

test("execute 需要本项目仍有效的只读检查计划：解释、过期、禁用与未知 runId 拒绝", () => fixture(root => {
  plan(root, "explain", "解释当前 Vue 代码，不要检查");
  assert.equal(execute(root, "explain").ok, false);
  plan(root, "stale");
  fs.appendFileSync(path.join(root, selected), "<!-- changed after inspect -->\n");
  const stale = execute(root, "stale");
  assert.equal(stale.ok, false);
  assert.equal(request(root, { operation: "status", runId: "stale" }).result.executionStatus, "not-executed");
  plan(root, "disabled");
  fs.writeFileSync(path.join(root, ".wl-skills-scope.json"), JSON.stringify({ schemaVersion: 1, projectType: "pc", packages: { kit: false } }));
  assert.equal(execute(root, "disabled").ok, false);
  assert.equal(execute(root, "unknown-run").ok, false);
  assert.equal(fs.existsSync(path.join(root, ".wl-skills/runs/unknown-run")), false);
}), 30000);

test("复制项目不能重用原根的任务计划：status 过期、execute 身份拒绝且零新回执", () => fixture(root => {
  const planned = plan(root, "copied-plan");
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-copied-project-"));
  try {
    fs.cpSync(root, copy, { recursive: true, verbatimSymlinks: true });
    const record = path.join(copy, planned.recordPath);
    const bytes = fs.readFileSync(record);
    const files = fs.readdirSync(path.dirname(record));
    const status = request(copy, { operation: "status", runId: "copied-plan" });
    assert.equal(status.result.planStale, true);
    assert.equal(status.result.ready, false);
    assert.equal(status.result.integration.ready, false);
    const rejected = execute(copy, "copied-plan");
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, "identity-mismatch");
    assert.deepEqual(fs.readFileSync(record), bytes);
    assert.deepEqual(fs.readdirSync(path.dirname(record)), files);
  } finally { fs.rmSync(copy, { recursive: true, force: true }); }
}), 30000);

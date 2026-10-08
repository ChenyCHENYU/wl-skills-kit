"use strict";

/**
 * execution-closure.check.cjs — task → 原 CLI/MCP 校验 → 同 runId status 证据闭环
 *
 * 每包：protocol task 建计划（not-executed/unverified）→ 调用本包真实校验命令（带 runId）→
 * protocol status 回查同一 runId：执行状态必须翻转且不虚报（失败≠通过、空检查≠通过、
 * 输入变更后过期≠通过）。bd 的 review 尚未与协议 runId 关联，显式记录为已知缺口（不视为通过）。
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const test = require("node:test");
const root = require("../support/workspace-root.cjs");
const { createFixtureGuard } = require("../support/fixture-guard.cjs");

const guard = createFixtureGuard("wl-exec-closure");

function run(bin, args, cwd) {
  // 所有子进程执行前经护栏校验（cwd/--target/--project/--input-file projectRoot）
  guard.guardRun(process.execPath, [path.join(root, bin), ...args], { cwd });
  return spawnSync(process.execPath, [path.join(root, bin), ...args], { cwd, encoding: "utf8", timeout: 300000 });
}

function request(bin, cwd, payload) {
  const file = path.join(cwd, "closure-request.json");
  fs.writeFileSync(file, JSON.stringify(payload));
  const runResult = run(bin, ["protocol", "request", "--input-file", file], cwd);
  assert.equal(runResult.status, 0, `${bin} protocol request 失败：${runResult.stdout}${runResult.stderr}`);
  return JSON.parse(runResult.stdout);
}

function fixtureWithKit(target, name) {
  const project = guard.fixture(name);
  const install = run(target, ["init"], project);
  assert.equal(install.status, 0, `${target} init 失败：${install.stdout}${install.stderr}`);
  return project;
}

test("kit：validate 真实执行后同 runId 状态翻转且不虚报", () => {
  const project = fixtureWithKit("wl-skills-kit/bin/wl-skills.js", "kit-closure");
  const planned = request("wl-skills-kit/bin/wl-skills.js", project, { operation: "task", projectRoot: project, task: "校验页面规范", runId: "kit-exec" });
  assert.equal(planned.result.executionStatus, "not-executed");
  assert.equal(planned.result.validationStatus, "unverified");

  const executed = run("wl-skills-kit/bin/wl-skills.js", ["validate", "--run-id", "kit-exec"], project);
  assert.notEqual(executed.status, 0, "空项目校验应失败（空检查不通过）");

  const status = request("wl-skills-kit/bin/wl-skills.js", project, { operation: "status", projectRoot: project, runId: "kit-exec" });
  assert.notEqual(status.result.executionStatus, "not-executed", "真实执行后状态必须离开 not-executed");
  assert.notEqual(status.result.validationStatus, "passed", "失败/空检查不得报通过");

  fs.appendFileSync(path.join(project, "package.json"), "\n");
  const stale = request("wl-skills-kit/bin/wl-skills.js", project, { operation: "status", projectRoot: project, runId: "kit-exec" });
  assert.notEqual(stale.result.validationStatus, "passed", "输入变更后旧证据不得冒充通过");
});

test("ui：check 真实执行后同 runId 状态翻转且可过期", () => {
  const project = guard.fixture("ui-closure");
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "ui-closure", private: true }));
  const planned = request("wl-skills-ui/bin/wl-ui.js", project, { operation: "task", projectRoot: project, task: "扫描 UI 问题", runId: "ui-exec" });
  assert.equal(planned.result.executionStatus, "not-executed");

  const executed = run("wl-skills-ui/bin/wl-ui.js", ["check", "--run-id", "ui-exec", "--project", project], project);
  assert.equal(executed.status, 0, executed.stderr);

  const status = request("wl-skills-ui/bin/wl-ui.js", project, { operation: "status", projectRoot: project, runId: "ui-exec" });
  assert.notEqual(status.result.executionStatus, "not-executed");
  assert.notEqual(status.result.validationStatus, "passed", "空范围扫描不得报通过");

  fs.appendFileSync(path.join(project, "package.json"), "\n");
  const stale = request("wl-skills-ui/bin/wl-ui.js", project, { operation: "status", projectRoot: project, runId: "ui-exec" });
  assert.ok(stale.result.planStale === true || stale.result.validationStatus !== "passed", "输入变更后证据应过期或不通过");
});

test("design：verify 真实执行后同 runId 状态翻转且不虚报", () => {
  const project = guard.fixture("design-closure");
  const install = run("wl-skills-design/bin/wl-skills-design.js", ["init", "--target", project], project);
  assert.equal(install.status, 0, install.stderr);
  const planned = request("wl-skills-design/bin/wl-skills-design.js", project, { operation: "task", projectRoot: project, task: "创建需求设计说明书", runId: "design-exec" });
  assert.equal(planned.result.executionStatus, "not-executed");

  const executed = run("wl-skills-design/bin/wl-skills-design.js", ["verify", "spec", "--run-id", "design-exec", "--target", project], project);
  assert.notEqual(executed.status, 0, "空设计产物验证应失败");

  const status = request("wl-skills-design/bin/wl-skills-design.js", project, { operation: "status", projectRoot: project, runId: "design-exec" });
  assert.notEqual(status.result.executionStatus, "not-executed");
  assert.notEqual(status.result.validationStatus, "passed");
});

test("test：audit 真实执行后同 runId 状态翻转且可过期", () => {
  const project = fixtureWithKit("wl-skills-test/bin/wl-skills-test.js", "test-closure");
  const planned = request("wl-skills-test/bin/wl-skills-test.js", project, { operation: "task", projectRoot: project, task: "生成测试方案", runId: "test-exec" });
  assert.equal(planned.result.executionStatus, "not-executed");

  const executed = run("wl-skills-test/bin/wl-skills-test.js", ["audit", "--run-id", "test-exec"], project);
  assert.ok([0, 1].includes(executed.status), "空项目审计结果按包语义（空检查不得通过）");

  const status = request("wl-skills-test/bin/wl-skills-test.js", project, { operation: "status", projectRoot: project, runId: "test-exec" });
  assert.notEqual(status.result.executionStatus, "not-executed");
  assert.notEqual(status.result.validationStatus, "passed");

  fs.appendFileSync(path.join(project, "package.json"), "\n");
  const stale = request("wl-skills-test/bin/wl-skills-test.js", project, { operation: "status", projectRoot: project, runId: "test-exec" });
  assert.notEqual(stale.result.validationStatus, "passed");
});

test("bd：review run 真实执行后同 runId 闭环（completed/partial，不虚报通过）", () => {
  const project = guard.fixture("bd-closure");
  const preview = run("wl-skills-bd/bin/wl-skills-bd.js", ["init", "--target", project, "--json"], project);
  const plan = JSON.parse(preview.stdout);
  const confirmed = run("wl-skills-bd/bin/wl-skills-bd.js", ["init", "--target", project, "--json", "--confirm", "--plan-hash", plan.planHash], project);
  assert.equal(confirmed.status, 0, confirmed.stderr);

  const planned = request("wl-skills-bd/bin/wl-skills-bd.js", project, { operation: "task", projectRoot: project, task: "审计后端规则", runId: "bd-exec" });
  assert.equal(planned.result.executionStatus, "not-executed");
  assert.equal(planned.result.validationStatus, "unverified");

  // 正确调用形态：review run --run-id（review 的顶层 --run-id 不是合法子命令）
  const executed = run("wl-skills-bd/bin/wl-skills-bd.js", ["review", "run", "--run-id", "bd-exec", "--target", project, "--json"], project);
  assert.equal(executed.status, 0, executed.stdout + executed.stderr);

  const status = request("wl-skills-bd/bin/wl-skills-bd.js", project, { operation: "status", projectRoot: project, runId: "bd-exec" });
  assert.equal(status.result.runId, "bd-exec");
  assert.equal(status.result.executionStatus, "completed", "review run 后同 runId 应为 completed");
  assert.ok(["partial", "failed", "unverified", "stale"].includes(status.result.validationStatus), "空项目审计不得报 passed（partial/unverified/stale 为真实语义）");
});

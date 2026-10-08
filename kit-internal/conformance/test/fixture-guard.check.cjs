"use strict";

/**
 * fixture-guard.check.cjs — 护栏自身的行为验证（含逃逸负例）
 * 负例不执行任何外部命令：仅在护栏层断言拦截。
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");
const { createFixtureGuard } = require("../support/fixture-guard.cjs");

test("guard：登记目录内目标放行（存在与不存在均可）", () => {
  const guard = createFixtureGuard("wl-guard-self");
  const inside = guard.fixture("inside");
  assert.equal(guard.assertTarget(inside, "inside"), fs.realpathSync(inside));
  assert.equal(guard.assertTarget(path.join(inside, "not-created-yet"), "future"), path.join(inside, "not-created-yet"));
});

test("guard：不存在的外部目标被词法拦截（不执行命令）", () => {
  const guard = createFixtureGuard("wl-guard-self");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "wl-guard-outside-"));
  assert.throws(() => guard.assertTarget(path.join(outside, "not-created"), "escape"), /不属于登记的临时目录/);
  assert.throws(() => guard.assertTarget("/Users", "escape"), /不属于登记的临时目录/);
});

test("guard：符号链接逃逸被拦截", () => {
  const guard = createFixtureGuard("wl-guard-self");
  const inside = guard.fixture("inside");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "wl-guard-outside-"));
  const link = path.join(inside, "escape-link");
  fs.symlinkSync(outside, link);
  assert.throws(() => guard.assertTarget(link, "symlink-escape"), /符号链接逃逸/);
});

test("guard：guardRun 读取 --input-file 内 projectRoot 并拦截外部目标", () => {
  const guard = createFixtureGuard("wl-guard-self");
  const inside = guard.fixture("inside");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "wl-guard-outside-"));
  const inputFile = path.join(inside, "request.json");
  fs.writeFileSync(inputFile, JSON.stringify({ operation: "task", projectRoot: outside, task: "probe" }));
  assert.throws(() => guard.guardRun(process.execPath, ["bin/x.js", "protocol", "request", "--input-file", inputFile], { cwd: inside }), /projectRoot/);
  fs.writeFileSync(inputFile, JSON.stringify({ operation: "task", projectRoot: inside, task: "ok" }));
  const normalized = guard.guardRun(process.execPath, ["bin/x.js", "--input-file", inputFile], { cwd: inside });
  assert.equal(normalized.options.cwd, fs.realpathSync(inside));
});

test("guard：guardRun 拦截外部 cwd 与 --target/--project", () => {
  const guard = createFixtureGuard("wl-guard-self");
  const inside = guard.fixture("inside");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "wl-guard-outside-"));
  assert.throws(() => guard.guardRun("npm", ["install"], { cwd: outside }), /cwd/);
  assert.throws(() => guard.guardRun("node", ["cli.js", "init", "--target", outside], { cwd: inside }), /--target/);
  assert.throws(() => guard.guardRun("node", ["cli.js", "init", "--project", outside], { cwd: inside }), /--project/);
});

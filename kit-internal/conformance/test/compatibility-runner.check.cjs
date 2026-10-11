"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const runner = require("../scripts/compatibility-check.cjs");

function temporary(body) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wl-compat-runner-test-")));
  try { return body(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test("runner 参数缺值/空值/重复/未知/force 在任何安装前拒绝", () => {
  for (const args of [["--key"], ["--key="], ["--key", " "], ["--package-root", "--output", "x"], ["--key", "kit", "--key", "bd"], ["--key", "unknown"], ["--force"]]) assert.throws(() => runner.parseArgs(args, {}));
  assert.deepEqual(runner.parseArgs(["--key=kit", "--output", "evidence"], {}), { node20: undefined, key: "kit", output: "evidence" });
});

test("runner 发布基线是精确版本，普通生命周期无 force/bridge 且 BD 使用原确认入口", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(runner.PACKAGES).map(([key, entry]) => [key, entry.baseline])), { kit: "2.31.1", ui: "1.20.1", bd: "0.38.0", design: "0.18.0", test: "0.32.0" });
  for (const key of Object.keys(runner.PACKAGES)) {
    const args = runner.lifecycleArgs(key, "update", "/isolated-root");
    assert.ok(!args.includes("--force"));
    if (key === "bd") assert.deepEqual(args, ["update", "--target", "/isolated-root", "--json"]);
  }
});

test("候选源码身份、正式版本和升级递进在 pack 前校验", () => temporary(root => {
  const source = path.join(root, "standalone-package"); fs.mkdirSync(source);
  const write = version => fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ name: "@agile-team/wl-skills-kit", version }));
  write("2.32.0"); assert.equal(runner.selectCandidate({ packageRoot: source }).version, "2.32.0");
  assert.throws(() => runner.selectCandidate({ packageRoot: source, key: "bd" }), /不一致/);
  for (const version of ["2.31.1", "2.30.0", "2.32.0-bridge.0", "latest"]) { write(version); assert.throws(() => runner.selectCandidate({ packageRoot: source })); }
}));

test("候选锁相对tgz/hash精确验证，不接受损坏/重复/包身份不符", () => temporary(root => {
  const artifact = path.join(root, "candidate.tgz"); fs.writeFileSync(artifact, "synthetic lock-only artifact; never installed");
  const row = { key: "bd", name: "@agile-team/wl-skills-bd", newVersion: "0.39.0", artifact: "candidate.tgz", sha256: crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex") };
  const file = path.join(root, "lock.json"), write = packages => fs.writeFileSync(file, JSON.stringify({ packages }));
  write([row]); const candidate = runner.selectCandidate({ candidateLock: file }); assert.equal(candidate.artifact, artifact); assert.equal(candidate.key, "bd");
  write([row, row]); assert.throws(() => runner.selectCandidate({ candidateLock: file, key: "bd" }), /唯一/);
  for (const change of [{ name: "@agile-team/wl-skills-kit" }, { sha256: "0".repeat(64) }, { newVersion: "0.39.0-rc.0" }, { artifact: "candidate.zip" }]) {
    write([{ ...row, ...change }]); assert.throws(() => runner.selectCandidate({ candidateLock: file, key: "bd" }));
  }
}));

test("本轮护栏禁止外部cwd/pair/equals/root JSON，哨兵证明拒绝后不启动", () => temporary(outside => {
  const sandbox = runner.createSandbox();
  try {
    const root = sandbox.fixture("inside"), sentinel = path.join(outside, "PWNED");
    const command = ["-e", `require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'x')`];
    assert.throws(() => runner.guardedSpawn(sandbox, process.execPath, command, { cwd: outside, encoding: "utf8" }), /cwd/);
    for (const args of [["--target", outside], [`--project=${outside}`], ["--project="], ["--target"]]) assert.throws(() => sandbox.guardRun(args, root));
    const input = path.join(root, "request.json"); fs.writeFileSync(input, JSON.stringify({ projectRoot: outside }));
    assert.throws(() => sandbox.guardRun([`--input-file=${input}`], root), /projectRoot/);
    fs.writeFileSync(input, JSON.stringify({ projectRoot: null })); assert.throws(() => sandbox.guardRun(["--input-file", input], root), /非空/);
    assert.equal(fs.existsSync(sentinel), false);
    const allowed = runner.guardedSpawn(sandbox, process.execPath, ["-e", "process.stdout.write('allowed')"], { cwd: root, encoding: "utf8" }); assert.equal(allowed.status, 0); assert.equal(allowed.stdout, "allowed");
  } finally { sandbox.cleanup(); }
}));

test("护栏校验最近存在祖先，符号链接未来子路径不能逃逸", () => temporary(outside => {
  const sandbox = runner.createSandbox();
  try {
    const root = sandbox.fixture("inside"), link = path.join(root, "escape"); fs.symlinkSync(outside, link);
    assert.throws(() => sandbox.assertTarget(path.join(link, "future/path")), /符号链接/);
    assert.throws(() => sandbox.assertTarget(path.join(outside, "future/path")), /越出/);
    assert.equal(sandbox.assertTarget(path.join(root, "future/path")), path.join(root, "future/path"));
  } finally { sandbox.cleanup(); }
}));

test("runner 输入错误真实退出非零；require 无安装副作用", () => temporary(root => {
  const script = path.resolve(__dirname, "../scripts/compatibility-check.cjs");
  const required = spawnSync(process.execPath, ["-e", `require(${JSON.stringify(script)})`], { cwd: root, encoding: "utf8" });
  assert.equal(required.status, 0); assert.deepEqual(fs.readdirSync(root), []);
  const invalid = spawnSync(process.execPath, [script, "--force"], { cwd: root, encoding: "utf8" }); assert.equal(invalid.status, 1); assert.match(invalid.stderr, /未知参数/); assert.deepEqual(fs.readdirSync(root), []);
}));

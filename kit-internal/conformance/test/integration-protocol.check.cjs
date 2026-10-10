"use strict";

/**
 * integration-protocol.check.cjs — 五包公开集成协议一致性验收
 *
 * 通过安装前源码仓库的 bin 入口黑盒调用 `protocol describe / request`，
 * 断言五包信封形状、操作清单、错误码与退出码一致，且各自复用本包运行时。
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const root = require("../support/workspace-root.cjs");

const PACKAGES = [
  { name: "wl-skills-kit", bin: "bin/wl-skills.js", binName: "wl-skills", npm: "@agile-team/wl-skills-kit" },
  { name: "wl-skills-ui", bin: "bin/wl-ui.js", binName: "wl-ui", npm: "@agile-team/wl-skills-ui" },
  { name: "wl-skills-bd", bin: "bin/wl-skills-bd.js", binName: "wl-skills-bd", npm: "@agile-team/wl-skills-bd" },
  { name: "wl-skills-design", bin: "bin/wl-skills-design.js", binName: "wl-skills-design", npm: "@agile-team/wl-skills-design" },
  { name: "wl-skills-test", bin: "bin/wl-skills-test.js", binName: "wl-skills-test", npm: "@agile-team/wl-skills-test" },
];
const OPERATIONS = ["route", "explain", "task", "status", "doctor-host"];
const DECISION_STATES = ["matched", "baseline", "ambiguous", "gap", "not-applicable", "needs-context"];

function runCli(pkg, args, cwd) {
  return spawnSync(process.execPath, [path.join(root, pkg.name, pkg.bin), ...args], { encoding: "utf8", cwd: cwd || os.tmpdir() });
}

function requestFile(pkg, payload, cwd) {
  const file = path.join(cwd, "request.json");
  fs.writeFileSync(file, JSON.stringify(payload));
  return { run: runCli(pkg, ["protocol", "request", "--input-file", file], cwd), file };
}

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wl-protocol-check-"));
}

for (const pkg of PACKAGES) {
  test(`describe：${pkg.npm} 返回统一信封与五操作`, () => {
    const run = runCli(pkg, ["protocol", "describe"]);
    assert.equal(run.status, 0, run.stderr);
    const described = JSON.parse(run.stdout);
    assert.equal(described.protocolVersion, 1);
    assert.equal(described.package, pkg.npm);
    assert.ok(Array.isArray(described.capabilities) && described.capabilities.length > 0);
    assert.deepEqual(described.operations.map((operation) => operation.id), OPERATIONS);
    for (const operation of described.operations) {
      assert.equal(typeof operation.readOnly, "boolean");
      assert.equal(typeof operation.mapping, "string");
      assert.ok(operation.mapping.startsWith(pkg.binName), `映射应指向本包 CLI：${operation.mapping}`);
    }
    assert.deepEqual(described.errorCodes, ["unsupported-protocol", "unknown-operation", "missing-input", "invalid-input", "internal-error"]);
    assert.ok(described.constraints.instructionOnly);
    assert.ok(described.constraints.evidence);
  });

  test(`request(route)：${pkg.npm} 返回六类判定且 ok`, () => {
    const cwd = tempProject();
    const { run } = requestFile(pkg, { operation: "route", projectRoot: cwd, task: "统一表格视觉并生成列表页" }, cwd);
    assert.equal(run.status, 0, run.stderr);
    const envelope = JSON.parse(run.stdout);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.operation, "route");
    assert.ok(Array.isArray(envelope.diagnostics));
    const decision = envelope.result.decision || envelope.result;
    assert.ok(DECISION_STATES.includes(decision.status), `非六类状态：${decision.status}`);
  });

  test(`request(task)：${pkg.npm} 持久化返回 runId`, () => {
    const cwd = tempProject();
    fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ devDependencies: { [pkg.npm]: "*" } }));
    const { run } = requestFile(pkg, { operation: "task", projectRoot: cwd, task: "规划一次本域任务" }, cwd);
    const envelope = JSON.parse(run.stdout);
    assert.equal(envelope.ok, true);
    assert.ok(envelope.result.runId, "task 应返回 runId");
  });

  test(`request(doctor-host)：${pkg.npm} 按指定 host 诊断且不宣称已加载`, () => {
    const cwd = tempProject();
    const { run } = requestFile(pkg, { operation: "doctor-host", projectRoot: cwd, host: "claude" }, cwd);
    assert.equal(run.status, 0, run.stderr);
    const envelope = JSON.parse(run.stdout);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.result.host, "claude");
  });

  test(`request 错误信封：${pkg.npm} 协议版本/操作/输入`, () => {
    const cwd = tempProject();
    const unsupported = requestFile(pkg, { protocolVersion: 99, operation: "route", task: "x" }, cwd);
    assert.equal(unsupported.run.status, 2);
    const unsupportedEnvelope = JSON.parse(unsupported.run.stdout);
    assert.equal(unsupportedEnvelope.error.code, "unsupported-protocol");

    const unknown = requestFile(pkg, { operation: "no-such-op" }, cwd);
    assert.equal(JSON.parse(unknown.run.stdout).error.code, "unknown-operation");

    const missing = requestFile(pkg, { operation: "route" }, cwd);
    const missingEnvelope = JSON.parse(missing.run.stdout);
    assert.equal(missingEnvelope.error.code, "missing-input");
    const { field } = missingEnvelope.error;
    assert.ok(field === "task" || (Array.isArray(field) && field.includes("task")), "missing-input 应指明 task 或条件式必填组");
  });
}

test("五包 describe 的快照协议实现同源（哈希一致）", () => {
  const hashes = new Set();
  for (const pkg of PACKAGES) {
    const file = path.join(root, pkg.name, pkg.name === "wl-skills-ui" ? "bin/integration-protocol.cjs" : "lib/integration-protocol.cjs");
    hashes.add(fs.readFileSync(file, "utf8"));
  }
  assert.equal(hashes.size, 1, "integration-protocol.cjs 快照应五包同源");
});

test("五包范围实现与Schema快照一致，公开包独立分发", () => {
  for (const name of ["project-scope.cjs", "project-scope.schema.json"]) {
    const expected = fs.readFileSync(path.join(__dirname, "../support", name), "utf8");
    for (const pkg of PACKAGES) {
      const directory = pkg.name === "wl-skills-ui" ? "bin" : "lib";
      assert.equal(fs.readFileSync(path.join(root, pkg.name, directory, name), "utf8"), expected);
    }
  }
});

"use strict";

/**
 * schema-conformance.check.cjs — 用独立 JSON Schema 校验器核对实际 CLI 回执
 *
 * Ajv 仅为 conformance 开发验收依赖。对五包采集真实 protocol describe/request 输出：
 * 正常请求、缺文件、坏 JSON、非法对象/数组/空白、未知操作/版本、字段类型错误、执行异常，
 * 全部信封必须通过该包自身 describe 声明的 envelope Schema；request Schema 必须按操作
 * 表达必填/条件必填并拒绝空白与缺失输入。
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const test = require("node:test");
const { createRequire } = require("node:module");
const root = require("../support/workspace-root.cjs");

const requireFromHere = createRequire(__filename);
const Ajv = requireFromHere("ajv/dist/2020").default;
const ajv = new Ajv({ strict: false, allErrors: true });

const PACKAGES = [
  { key: "kit", bin: "bin/wl-skills.js" },
  { key: "ui", bin: "bin/wl-ui.js" },
  { key: "bd", bin: "bin/wl-skills-bd.js" },
  { key: "design", bin: "bin/wl-skills-design.js" },
  { key: "test", bin: "bin/wl-skills-test.js" },
];

function runCli(pkg, args, cwd) {
  return spawnSync(process.execPath, [path.join(root, `wl-skills-${pkg.key}`, pkg.bin), ...args], { cwd, encoding: "utf8", timeout: 30000 });
}

function requestViaFile(pkg, payload, cwd) {
  const file = path.join(cwd, "schema-request.json");
  fs.writeFileSync(file, JSON.stringify(payload));
  const run = runCli(pkg, ["protocol", "request", "--input-file", file], cwd);
  let envelope = null;
  try { envelope = JSON.parse(run.stdout); } catch { envelope = null; }
  return { exit: run.status, envelope, raw: run.stdout };
}

for (const pkg of PACKAGES) {
  test(`schema：${pkg.key} 实际回执全部满足自身 envelope Schema`, () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `wl-schema-${pkg.key}-`));
    const describeRun = runCli(pkg, ["protocol", "describe"], cwd);
    assert.equal(describeRun.status, 0, describeRun.stderr);
    const described = JSON.parse(describeRun.stdout);
    const validateEnvelope = ajv.compile(described.schemas.envelope);
    const validateRequest = ajv.compile(described.schemas.request);

    const valid = requestViaFile(pkg, { operation: "doctor-host", projectRoot: cwd, host: "claude" }, cwd);
    assert.ok(valid.envelope && valid.envelope.ok === true, `正常请求应成功：${valid.raw}`);
    assert.ok(validateEnvelope(valid.envelope), `正常信封不过自身 Schema：${JSON.stringify(validateEnvelope.errors)}`);

    const invalidCases = [
      ["object-request-id", { operation: "route", task: "检查", requestId: {} }, "invalid-input"],
      ["object-operation", { operation: {} }, "invalid-input"],
      ["missing-operation-input", { operation: "route" }, "missing-input"],
      ["boolean-task", { operation: "task", task: true }, "invalid-input"],
      ["whitespace-task", { operation: "route", task: "   " }, "invalid-input"],
      ["number-project-root", { operation: "route", task: "检查", projectRoot: 42 }, "invalid-input"],
      ["unsupported-version", { protocolVersion: 99, operation: "route", task: "检查" }, "unsupported-protocol"],
      ["unknown-operation", { operation: "no-such-op" }, "unknown-operation"],
    ];
    for (const [label, payload, expectedCode] of invalidCases) {
      const actual = requestViaFile(pkg, payload, cwd);
      assert.equal(actual.exit, 2, `${label} 应非零退出`);
      assert.ok(actual.envelope, `${label} stdout 应为可解析 JSON`);
      assert.ok(validateEnvelope(actual.envelope), `${label} 信封不过自身 Schema：${JSON.stringify(validateEnvelope.errors)}`);
      assert.equal(actual.envelope.error.code, expectedCode, `${label} 错误码`);
    }

    assert.equal(validateRequest({ operation: "route" }), false, "request Schema 应拒绝缺 route 输入");
    assert.equal(validateRequest({ operation: "route", task: "   " }), false, "request Schema 应拒绝空白 task");
    if (pkg.key === "bd") {
      assert.equal(validateRequest({ operation: "route", type: "audit" }), true, "bd request Schema 应接受 type-only");
      assert.equal(validateRequest({ operation: "task", type: "audit" }), true, "bd request Schema 应接受 task 的 type-only");
    } else {
      assert.equal(validateRequest({ operation: "route", task: "检查" }), true, "request Schema 应接受合法 route");
      assert.equal(validateRequest({ operation: "task", type: "x" }), false, "非 bd request Schema 不应把 type 当 route 必填替代");
    }

    const missingFile = runCli(pkg, ["protocol", "request"], cwd);
    assert.equal(missingFile.status, 2);
    const missingEnvelope = JSON.parse(missingFile.stdout);
    assert.equal(missingEnvelope.error.code, "missing-input");
    assert.ok(validateEnvelope(missingEnvelope), "缺 --input-file 信封应过 Schema");

    const badJson = path.join(cwd, "broken.json");
    fs.writeFileSync(badJson, "{not json");
    const badRun = runCli(pkg, ["protocol", "request", "--input-file", badJson], cwd);
    assert.equal(badRun.status, 2);
    const badEnvelope = JSON.parse(badRun.stdout);
    assert.equal(badEnvelope.error.code, "invalid-input");
    assert.ok(validateEnvelope(badEnvelope), "坏 JSON 信封应过 Schema");
  });
}

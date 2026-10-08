import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { protocol, runOperation } = require("../lib/protocol-cli");
const pkg = require("../package.json");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-integration-"));
}

describe("integration describe", () => {
  it("返回协议版本、能力目录与五个统一操作", () => {
    const described = protocol.describe();
    expect(described.protocolVersion).toBe(1);
    expect(described.package).toBe(pkg.name);
    expect(described.packageVersion).toBe(pkg.version);
    expect(Array.isArray(described.capabilities)).toBe(true);
    expect(described.capabilities.length).toBeGreaterThan(0);
    expect(described.operations.map((operation) => operation.id)).toEqual(["route", "explain", "task", "status", "doctor-host"]);
    for (const operation of described.operations) {
      expect(typeof operation.readOnly).toBe("boolean");
      expect(Array.isArray(operation.required)).toBe(true);
      expect(typeof operation.mapping).toBe("string");
    }
    expect(described.errorCodes).toContain("unsupported-protocol");
  });
});

describe("integration request", () => {
  it("route 只读判定返回六类状态之一", () => {
    const root = tempRoot();
    const envelope = protocol.request({ protocolVersion: 1, operation: "route", projectRoot: root, task: "为 src/views/produce/order 生成列表页" }, runOperation);
    expect(envelope.ok).toBe(true);
    expect(["matched", "baseline", "ambiguous", "gap", "not-applicable", "needs-context"]).toContain(envelope.result.status);
    expect(envelope.diagnostics).toEqual([]);
  });

  it("负向任务返回六类状态之一并附理由（语义由路由自身测试覆盖）", () => {
    const root = tempRoot();
    const envelope = protocol.request({ operation: "route", projectRoot: root, task: "帮我写一首诗" }, runOperation);
    expect(envelope.ok).toBe(true);
    expect(["matched", "baseline", "ambiguous", "gap", "not-applicable", "needs-context"]).toContain(envelope.result.status);
  });

  it("task 持久化返回 runId 且 status 可回查", () => {
    const root = tempRoot();
    const planned = protocol.request({ operation: "task", projectRoot: root, task: "校验 src/views 页面规范" }, runOperation);
    expect(planned.ok).toBe(true);
    expect(planned.result.runId).toBeTruthy();
    const status = protocol.request({ operation: "status", projectRoot: root, runId: planned.result.runId }, runOperation);
    expect(status.ok).toBe(true);
    expect(status.result.runId).toBe(planned.result.runId);
    expect(status.result.executionStatus).toBe("not-executed");
  });

  it("doctor-host 返回指定 host", () => {
    const root = tempRoot();
    const envelope = protocol.request({ operation: "doctor-host", projectRoot: root, host: "claude" }, runOperation);
    expect(envelope.ok).toBe(true);
    expect(envelope.result.host).toBe("claude");
  });

  it("不支持的协议版本返回 unsupported-protocol", () => {
    const envelope = protocol.request({ protocolVersion: 99, operation: "route", task: "x" }, runOperation);
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("unsupported-protocol");
    expect(envelope.error.supportedProtocolVersions).toEqual([1]);
  });

  it("未知操作返回 unknown-operation 并列出可用操作", () => {
    const envelope = protocol.request({ operation: "codegen" }, runOperation);
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("unknown-operation");
    expect(envelope.error.availableOperations).toContain("route");
  });

  it("缺少必要输入返回 missing-input", () => {
    const envelope = protocol.request({ operation: "route" }, runOperation);
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("missing-input");
    expect(envelope.error.field).toBe("task");
  });

  it("非对象请求返回 invalid-input", () => {
    const envelope = protocol.request("route", runOperation);
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("invalid-input");
  });

  it("执行异常返回 internal-error 且诊断与结果分离", () => {
    const envelope = protocol.request({ operation: "route", task: "x" }, () => { throw new Error("boom"); });
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("internal-error");
    expect(envelope.diagnostics).toContain("boom");
  });
});

describe("边界输入校验（独立复验缺陷回归）", () => {
  const invalidPayloads = [
    ["布尔 task", { operation: "task", task: true }],
    ["对象 task", { operation: "task", task: { text: "bad" } }],
    ["非法 targets 元素", { operation: "task", task: "检查目标", targets: [null, 42, {}] }],
    ["数字 projectRoot", { operation: "route", task: "检查目标", projectRoot: 42 }],
    ["对象 runId", { operation: "task", task: "检查目标", runId: {} }],
  ];
  for (const [label, payload] of invalidPayloads) {
    it(`${label} 在触达执行器前判 invalid-input`, () => {
      const envelope = protocol.request(payload, () => { throw new Error("不应触达执行器"); });
      expect(envelope.ok).toBe(false);
      expect(envelope.error.code).toBe("invalid-input");
      expect(envelope.error.field).toBeTruthy();
    });
  }
  it("CLI 缺 --input-file 时 stdout 输出 missing-input JSON 信封", () => {
    const { spawnSync } = require("node:child_process");
    const run = spawnSync(process.execPath, [path.join(path.dirname(require.resolve("../package.json")), "bin", "wl-skills.js"), "protocol", "request"], { encoding: "utf8" });
    expect(run.status).toBe(2);
    const envelope = JSON.parse(run.stdout);
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("missing-input");
    expect(envelope.error.field).toBe("input-file");
  });
});


describe("边界输入（定点收尾回归）", () => {
  it("context null 判 invalid-input 且零写入（CLI 回归）", () => {
    const root = tempRoot();
    const file = path.join(root, "req.json");
    fs.writeFileSync(file, JSON.stringify({ operation: "task", projectRoot: root, task: "校验 src/views 页面规范", runId: "ctx-null", context: null }));
    const { spawnSync } = require("node:child_process");
    const BIN = path.join(path.dirname(require.resolve("../package.json")), "bin", "wl-skills.js");
    const run = spawnSync(process.execPath, [BIN, "protocol", "request", "--input-file", file], { encoding: "utf8" });
    expect(run.status).toBe(2);
    const envelope = JSON.parse(run.stdout);
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("invalid-input");
    expect(envelope.error.field).toBe("context");
    expect(fs.readdirSync(root).filter((name) => name.startsWith(".")).length).toBe(0);
  });

  it("targets 空数组与 Schema 一致（运行时接受空范围）", () => {
    const root = tempRoot();
    const envelope = protocol.request({ operation: "route", projectRoot: root, task: "校验 src/views 页面规范", targets: [] }, runOperation);
    expect(envelope.ok).toBe(true);
    expect(protocol.describe().schemas.request.properties.targets.minItems).toBeUndefined();
  });
});

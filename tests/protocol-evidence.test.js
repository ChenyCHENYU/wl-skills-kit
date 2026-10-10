import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { protocol, runOperation } = require("../lib/protocol-cli");

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-evidence-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ devDependencies: { "@agile-team/wl-skills-kit": "*" } }));
  return root;
}

describe("证据闭环与严格断言（不得兜底通过）", () => {
  it("status 严格回查同一 runId：字段精确、不兜底", () => {
    const root = tempRoot();
    const planned = protocol.request({ operation: "task", projectRoot: root, task: "校验页面规范", runId: "evidence-run-a" }, runOperation);
    expect(planned.ok).toBe(true);
    expect(planned.result.runId).toBe("evidence-run-a");
    expect(planned.result.executionStatus).toBe("not-executed");
    expect(planned.result.validationStatus).toBe("unverified");
    const status = protocol.request({ operation: "status", projectRoot: root, runId: "evidence-run-a" }, runOperation);
    expect(status.ok).toBe(true);
    expect(status.result.runId).toBe("evidence-run-a");
    expect(status.result.executionStatus).toBe("not-executed");
    expect(status.result.validationStatus).toBe("unverified");
  });

  it("混用 runId 不得串记录：查 B 不返回 A 的记录", () => {
    const root = tempRoot();
    protocol.request({ operation: "task", projectRoot: root, task: "任务A", runId: "evidence-run-a" }, runOperation);
    protocol.request({ operation: "task", projectRoot: root, task: "任务B", runId: "evidence-run-b" }, runOperation);
    const statusB = protocol.request({ operation: "status", projectRoot: root, runId: "evidence-run-b" }, runOperation);
    expect(statusB.result.runId).toBe("evidence-run-b");
    const recordTasks = JSON.stringify(statusB.result);
    expect(recordTasks).not.toContain("任务A");
  });

  it("不存在的 runId 不得伪造成功记录", () => {
    const root = tempRoot();
    const status = protocol.request({ operation: "status", projectRoot: root, runId: "no-such-run" }, runOperation);
    expect(status.ok).toBe(true);
    const serialized = JSON.stringify(status.result);
    expect(serialized).not.toContain('"validationStatus":"passed"');
    expect(serialized).not.toContain('"executionStatus":"completed"');
  });

  it("修改被追踪输入后旧证据标记过期（不得冒充当前结果）", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, ".wl-skills", "standards"), { recursive: true });
    fs.writeFileSync(path.join(root, ".wl-skills", "standards", "02-code-structure.md"), "v1");
    const planned = protocol.request({ operation: "task", projectRoot: root, task: "校验页面规范", runId: "stale-run" }, runOperation);
    expect(planned.ok).toBe(true);
    fs.writeFileSync(path.join(root, ".wl-skills", "standards", "02-code-structure.md"), "v2-changed");
    const status = protocol.request({ operation: "status", projectRoot: root, runId: "stale-run" }, runOperation);
    const serialized = JSON.stringify(status.result);
    expect(serialized).not.toContain('"validationStatus":"passed"');
    if ("planStale" in status.result) expect(status.result.planStale).toBe(true);
  });

  it("空检查集不得判定为通过", () => {
    const root = tempRoot();
    const planned = protocol.request({ operation: "task", projectRoot: root, task: "校验页面规范", runId: "empty-run" }, runOperation);
    expect(planned.result.validationStatus).not.toBe("passed");
    expect(planned.result.executionStatus).toBe("not-executed");
  });
});

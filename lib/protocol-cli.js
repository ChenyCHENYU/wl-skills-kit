"use strict";

/**
 * protocol-cli.js — kit 的公开协议接线（薄层）
 *
 * 协议实现来自快照 integration-protocol.cjs（单源 conformance/support，勿改）；
 * 本文件只提供 kit 的能力目录、操作映射，并复用 task-integration 的原执行器。
 */

const fs = require("node:fs");
const path = require("node:path");
const pkg = require("../package.json");
const capabilitiesDocument = require("./capabilities.json");
const { createProtocol } = require("./integration-protocol.cjs");
const integration = require("./task-integration");
const { invokeExecutor } = require("./executor-cli");

const { COMMAND_CATALOG } = require("./command-catalog");
const BIN = "wl-skills";
const OPERATIONS = [
  { id: "route", summary: "只读任务判定：技能、基础约束、歧义与能力缺口", readOnly: true, required: ["task"], optional: ["context", "targets", "skill", "projectRoot"], sideEffects: "无写入", mapping: `${BIN} route --text "<task>" [--target <path>]` },
  { id: "explain", summary: "解释本次任务判定与约束（只读，不记录）", readOnly: true, required: ["task"], optional: ["context", "targets", "skill", "projectRoot"], sideEffects: "无写入", mapping: `${BIN} explain --text "<task>"` },
  { id: "task", summary: "判定并持久化任务计划（尚未执行业务动作）", readOnly: false, required: ["task"], optional: ["context", "runId", "targets", "skill", "projectRoot"], sideEffects: "写入 .wl-skills/runs/ 下本包任务记录", mapping: `${BIN} task --text "<task>" [--run-id <id>]` },
  { id: "status", summary: "读取本包真实执行/校验记录与新鲜度", readOnly: true, required: [], optional: ["runId", "projectRoot"], sideEffects: "无写入", mapping: `${BIN} status [--run-id <id>]` },
  { id: "doctor-host", summary: "宿主入口静态诊断（不证明宿主已加载）", readOnly: true, required: [], optional: ["host", "projectRoot"], sideEffects: "无写入", mapping: `${BIN} doctor-host [--host <host>]` },
];

function buildInventory() {
  const loadErrors = [];
  const commands = COMMAND_CATALOG;
  let skills = [];
  let mcpTools = [];
  try {
    skills = integration.taskCatalog().map((skill) => ({ id: skill.id, description: skill.description, triggers: skill.triggers, triggerCondition: skill.triggerCondition, status: skill.status, entry: skill.path, execution: "instructional" }));
  } catch (error) {
    loadErrors.push(`skills 加载失败：${error.message}`);
  }
  try {
    const registry = require("../mcp/registry");
    mcpTools = (registry.TOOLS || []).map((tool) => ({ name: tool.name, summary: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations || {}, sideEffects: tool._meta?.wl?.sideEffects, businessReadOnly: tool._meta?.wl?.businessReadOnly, recordsOwnReceipt: tool._meta?.wl?.recordsOwnReceipt, write: (tool.annotations && tool.annotations.readOnlyHint === true) ? "readonly" : "guarded" }));
  } catch (error) {
    loadErrors.push(`mcpTools 加载失败：${error.message}`);
  }
  return { skills, commands, mcpTools, loadErrors };
}

const protocol = createProtocol({
  bin: BIN,
  packageName: pkg.name,
  packageVersion: pkg.version,
  capabilities: capabilitiesDocument.capabilities || [],
  constraints: { projectScope: { config: ".wl-skills-scope.json", schema: "lib/project-scope.schema.json", adoption: "own-manifest-or-direct-dependency-or-explicit-enable", inheritance: "never-across-project-boundaries", excluded: ["mobile", "unadopted-project", "aggregate-workspace"] }, node: (pkg.engines && pkg.engines.node) || null, boundaryVersion: capabilitiesDocument.boundaryVersion || null },
  operations: OPERATIONS,
  executors: require("./executors.json"),
  inventory: buildInventory(),
});

function runOperation(operation, input) {
  const normalized = {
    projectRoot: input.projectRoot || ".",
    task: input.task,
    targets: Array.isArray(input.targets) ? input.targets : [],
    runId: input.runId,
    skill: input.skill,
    host: input.host,
    context: input.context,
  };
  return integration.runTaskAction(operation, normalized);
}

function envelopeError(code, message, field) {
  return { protocolVersion: 1, package: pkg.name, packageVersion: pkg.version, operation: null, requestId: null, ok: false, error: { code, message, ...(field ? { field } : {}) }, diagnostics: [] };
}

async function requestEnvelope(input) {
  if (input && input.operation === "execute") {
    return protocol.requestExecute(input, { readStatus: (root, runId) => runOperation("status", { projectRoot: root, runId }), invoke: invokeExecutor });
  }
  return protocol.request(input, runOperation);
}

async function runCli(argv) {
  const sub = argv[0];
  if (sub === "describe") {
    console.log(JSON.stringify(protocol.describe(), null, 2));
    return 0;
  }
  if (sub === "request") {
    const fileIndex = argv.indexOf("--input-file");
    const file = fileIndex >= 0 ? argv[fileIndex + 1] : null;
    if (!file) {
      console.log(JSON.stringify(envelopeError("missing-input", "缺少必要输入：--input-file <request.json>", "input-file"), null, 2));
      return 2;
    }
    let input;
    try {
      input = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
    } catch (error) {
      const message = error.code === "ENOENT" ? `请求文件不存在：${file}` : `请求文件无法解析：${error.message}`;
      console.log(JSON.stringify(envelopeError("invalid-input", message, "input-file"), null, 2));
      return 2;
    }
    const envelope = await requestEnvelope(input);
    console.log(JSON.stringify(envelope, null, 2));
    return envelope.ok ? 0 : 2;
  }
  console.error("用法：");
  console.error("  wl-skills protocol describe --json");
  console.error("  wl-skills protocol request --input-file <request.json> --json");
  return 2;
}

module.exports = { protocol, runOperation, runCli, OPERATIONS };

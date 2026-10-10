"use strict";

/**
 * integration-cli.js — kit 的 integration 公开协议接线（薄层）
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

const BIN = "wl-skills";
const OPERATIONS = [
  { id: "route", summary: "只读任务判定：技能、基础约束、歧义与能力缺口", readOnly: true, required: ["task"], optional: ["targets", "skill", "projectRoot"], sideEffects: "无写入", mapping: `${BIN} route --text "<task>" [--target <path>]` },
  { id: "explain", summary: "解释本次任务判定与约束（只读，不记录）", readOnly: true, required: ["task"], optional: ["targets", "projectRoot"], sideEffects: "无写入", mapping: `${BIN} explain --text "<task>"` },
  { id: "task", summary: "判定并持久化任务计划（尚未执行业务动作）", readOnly: false, required: ["task"], optional: ["runId", "targets", "projectRoot"], sideEffects: "写入 .wl-skills/runs/ 下本包任务记录", mapping: `${BIN} task --text "<task>" [--run-id <id>]` },
  { id: "status", summary: "读取本包真实执行/校验记录与新鲜度", readOnly: true, required: [], optional: ["runId", "projectRoot"], sideEffects: "无写入", mapping: `${BIN} status [--run-id <id>]` },
  { id: "doctor-host", summary: "宿主入口静态诊断（不证明宿主已加载）", readOnly: true, required: [], optional: ["host", "projectRoot"], sideEffects: "无写入", mapping: `${BIN} doctor-host [--host <host>]` },
];

function buildInventory() {
  const loadErrors = [];
  const commands = [
    { name: "init", args: "[--project <path>]", summary: "安装/初始化技能、规范与编辑器配置", execution: "programmatic", sideEffects: "写入 .wl-skills/ 等受管文件" },
    { name: "update", args: "[--project <path>]", summary: "增量更新受管文件", execution: "programmatic", sideEffects: "仅更新本包登记且未修改文件" },
    { name: "clean", args: "[--project <path>]", summary: "清理本包安装文件", execution: "programmatic", sideEffects: "删除本包登记文件" },
    { name: "validate", args: "[--target <paths>]", summary: "页面规范校验（K 规则 + spec 对齐）", execution: "programmatic", sideEffects: "写 .wl-skills/runs/ 回执" },
    { name: "snapshot", args: "", summary: "项目结构快照", execution: "programmatic", sideEffects: "写快照文件" },
    { name: "template", args: "<extract|search|audit>", summary: "页面蓝图提取/检索/审计", execution: "programmatic", sideEffects: "extract 写蓝图文件" },
    { name: "contract", args: "<init|check|sync>", summary: "wl-api-contract 建立/校验", execution: "programmatic", sideEffects: "init/sync 写契约文件" },
    { name: "task", args: "--text <任务> [--run-id <id>]", summary: "判定并持久化任务计划", execution: "programmatic", sideEffects: "写 .wl-skills/runs/" },
    { name: "route", args: "--text <任务>", summary: "只读判定", execution: "programmatic", sideEffects: "无" },
    { name: "explain", args: "--text <任务>", summary: "只读判定解释", execution: "programmatic", sideEffects: "无" },
    { name: "status", args: "[--run-id <id>]", summary: "读取本包回执", execution: "programmatic", sideEffects: "无" },
    { name: "doctor-host", args: "[--host <name>]", summary: "宿主入口静态诊断", execution: "programmatic", sideEffects: "无" },
    { name: "protocol", args: "describe | request --input-file <file>", summary: "本公开集成协议", execution: "programmatic", sideEffects: "见操作声明" },
  ];
  let skills = [];
  let mcpTools = [];
  try {
    skills = integration.taskCatalog().map((skill) => ({ id: skill.id, description: skill.description, triggers: skill.triggers, status: skill.status, entry: skill.path, execution: "instructional" }));
  } catch (error) {
    loadErrors.push(`skills 加载失败：${error.message}`);
  }
  try {
    const registry = require("../mcp/registry");
    mcpTools = (registry.TOOLS || []).map((tool) => ({ name: tool.name, summary: tool.description, write: (tool.annotations && tool.annotations.readOnlyHint === true) ? "readonly" : "guarded" }));
  } catch (error) {
    loadErrors.push(`mcpTools 加载失败：${error.message}`);
  }
  return { skills, commands, mcpTools, loadErrors };
}

const protocol = createProtocol({
  packageName: pkg.name,
  packageVersion: pkg.version,
  capabilities: capabilitiesDocument.capabilities || [],
  constraints: { projectScope: { config: ".wl-skills-scope.json", schema: "lib/project-scope.schema.json", adoption: "own-manifest-or-direct-dependency-or-explicit-enable", inheritance: "never-across-project-boundaries", excluded: ["mobile", "unadopted-project", "aggregate-workspace"] }, node: (pkg.engines && pkg.engines.node) || null, boundaryVersion: capabilitiesDocument.boundaryVersion || null },
  operations: OPERATIONS,
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

function runCli(argv) {
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
    const envelope = protocol.request(input, runOperation);
    console.log(JSON.stringify(envelope, null, 2));
    return envelope.ok ? 0 : 2;
  }
  console.error("用法：");
  console.error("  wl-skills protocol describe --json");
  console.error("  wl-skills protocol request --input-file <request.json> --json");
  return 2;
}

module.exports = { protocol, runOperation, runCli, OPERATIONS };

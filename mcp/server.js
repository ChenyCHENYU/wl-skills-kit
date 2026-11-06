#!/usr/bin/env node
"use strict";

/**
 * wl-skills MCP Server (v2.7.0+)
 *
 * 实现 MCP 协议（stdio transport，JSON-RPC 2.0）
 *
 * 工具描述符集中维护在 mcp/registry.js（auto-discovery）。
 * server.js 自身只做协议层 + 自动调度，新增/修改 Tool 仅改 registry.js。
 *
 * 启动方式（由 .cursor/mcp.json 等编辑器配置自动注入）：
 *   node node_modules/@agile-team/wl-skills-kit/mcp/server.js
 */

const readline = require("readline");
const path = require("path");
const { withFileLock } = require("../lib/process-lock");
const { loadConfig } = require("./config");
const { TOOLS, HANDLERS } = require("./registry");
const { validateSchema } = require("./schema-validator");
const { validateRequest } = require("../lib/json-rpc-request.cjs");
const observation = require("../lib/task-observability.cjs");

const PKG = require("../package.json");
const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];
// Receipt persistence affects MCP annotations, but does not require serializing
// unrelated business reads behind a remote write. Unknown effects stay guarded.
const WRITE_TOOLS = new Set(TOOLS.filter((tool) => tool._meta?.wl?.businessReadOnly !== true).map((tool) => tool.name));

// ─── JSON-RPC 协议层 ────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

// ─── Tool 调度（auto-dispatch via HANDLERS）─────────────────────────────

function invalidToolName(name) {
  return typeof name !== "string" || !name.trim();
}

function registeredTool(name) {
  return Object.hasOwn(HANDLERS, name) ? HANDLERS[name] : undefined;
}

async function dispatchTool(id, toolName, toolArgs) {
  if (invalidToolName(toolName)) return sendError(id, -32602, "工具 name 必须是非空 string");
  const desc = registeredTool(toolName);
  if (!desc) {
    sendError(id, -32601, `未知工具: ${toolName}`);
    return;
  }

  const inputValidation = validateSchema(desc.inputSchema, toolArgs);
  if (!inputValidation.valid) {
    sendError(id, -32602, `参数校验失败: ${inputValidation.errors.join("；")}`);
    return;
  }

  const configResult = resolveToolConfig(desc);
  if (configResult.error) {
    sendResult(id, { ...configResult.error, content: [{ type: "text", text:
      observation.formatExecutionReceipt({}, { tool: desc.name, mcpOutcome: "blocked" })
      + "\n\n" + configResult.error.content[0].text,
    }] });
    return;
  }

  const { config } = configResult;
  const invoke = () => observation.withMcpInvocation(desc.name, () => executeTool(id, desc, toolArgs, config));
  if (WRITE_TOOLS.has(toolName)) return executeLockedTool(id, desc.name, config, invoke);
  await invoke();
}

async function executeLockedTool(id, tool, config, invoke) {
  const scope = config ? `${config.gatewayPath}|${config.sysAppNo || ""}` : path.resolve(process.env.WL_PROJECT_ROOT || process.cwd());
  let entered = false;
  let replied = false;
  try {
    await withFileLock(`mcp-write:${scope}`, async () => {
      entered = true;
      await invoke();
      replied = true;
    }, { waitMs: 180000 });
  } catch (error) {
    // The lock release can fail after the response was already sent.
    if (replied) { console.error(`MCP 写锁释放失败: ${error.message}`); return; }
    const summary = observation.formatExecutionReceipt({}, { tool, mcpOutcome: entered ? "failed" : "blocked" });
    sendResult(id, { content: [{ type: "text", text: `${summary}\n❌ 写工具调用异常: ${error.message}` }], isError: true });
  }
}

function beginToolExecution(desc, args, beginMcpTool) {
  if (desc.name === "wls_validate_page" && args.resultCursor !== undefined) return null;
  return beginMcpTool(desc, args);
}

async function executeTool(id, desc, toolArgs, config) {
  const { beginMcpTool, finishMcpTool } = require("../lib/task-integration");
  const state = { execution: null, finishAttempted: false };
  const finish = (result) => { state.finishAttempted = true; return finishMcpTool(state.execution, desc, result); };
  try {
    const execution = state.execution = beginToolExecution(desc, toolArgs, beginMcpTool);
    const handlerResult = await desc.handle(execution ? { ...toolArgs, runId: execution.metadata.runId } : toolArgs, config);
    const normalized = normalizeHandlerResult(desc, handlerResult);
    const outputError = toolOutputError(desc, normalized);
    if (outputError) {
      const evidence = finish({ isError: true });
      return sendResult(id, { content: receiptContent(desc, execution, evidence, outputError, "failed"), isError: true });
    }
    const evidence = finish(normalized.validationResult
      ? { structuredContent: normalized.validationResult, isError: !normalized.validationResult.ok } : normalized);
    sendResult(id, toolResponse(desc, execution, evidence, normalized, desc.name === "wls_validate_page" && toolArgs.resultCursor !== undefined));
  } catch (e) {
    sendResult(id, failedToolResponse(desc, state, finish, e));
  }
}

function normalizeHandlerResult(desc, handlerResult) {
  const normalized = typeof handlerResult === "string" ? { text: handlerResult } : handlerResult;
  // Preserve legacy JSON text, and also expose a native structured payload.
  if (desc.observabilityAction && !normalized.structuredContent) {
    try { normalized.structuredContent = JSON.parse(normalized.text); } catch { /* Preserve the original response. */ }
  }
  return normalized;
}

function toolOutputError(desc, normalized) {
  if (!desc.outputSchema) return null;
  const validation = validateSchema(desc.outputSchema, normalized.structuredContent);
  return validation.valid ? null : `❌ 工具输出不符合契约: ${validation.errors.join("；")}`;
}

function toolResponse(desc, execution, evidence, normalized, continuation) {
  const failed = normalized.isError === true;
  const outcome = failed ? "failed" : continuation ? "continuation"
    : normalized.structuredContent?.mode === "preview" && normalized.structuredContent.ok === true ? "preview" : "returned";
  return {
    content: receiptContent(desc, execution, evidence || normalized.structuredContent, normalized.text, outcome),
    ...(normalized.structuredContent ? { structuredContent: normalized.structuredContent } : {}),
    ...(normalized.isError ? { isError: true } : {}),
    ...(evidence ? { _meta: { wlExecution: evidence } } : {}),
  };
}

function failedToolResponse(desc, state, finish, error) {
  let evidence;
  let receiptError;
  if (!state.finishAttempted) {
    try { evidence = finish({ isError: true }); } catch (failure) { receiptError = failure; }
  } else if (state.execution) receiptError = new Error("完成回执或响应未能可靠交付，请核对同一任务记录后重试");
  return {
    content: receiptContent(desc, state.execution, evidence, `❌ 工具执行异常: ${error.message}${receiptError ? `\n执行回执不可用：${receiptError.message}` : ""}`, "failed"),
    isError: true,
  };
}

function receiptContent(desc, execution, record, text, mcpOutcome) {
  let current = record || {};
  let unavailable = "";
  if (execution && record) {
    try { current = observation.readStatus({ ...execution.options, runId: record.runId }); }
    catch (error) { unavailable = `\n执行回执状态不可用：${error.message}`; }
  }
  const summary = observation.formatExecutionReceipt(current, { tool: desc.name, packageName: PKG.name, packageVersion: PKG.version, mcpOutcome });
  const body = String(text || "");
  if (desc.observabilityAction) return [{ type: "text", text: summary + unavailable }, { type: "text", text: body }];
  return [{ type: "text", text: `${summary}${unavailable}\n\n${body}` }];
}

function resolveToolConfig(desc) {
  if (!desc.needsBackendConfig) return { config: undefined };
  try {
    return { config: loadConfig() };
  } catch (error) {
    return {
      error: {
        content: [{ type: "text", text: `❌ 配置加载失败: ${error.message}` }],
        isError: true,
      },
    };
  }
}

// ─── 消息循环 ────────────────────────────────────────────────────────────

function parseMessage(line) {
  const raw = line.trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return undefined;
  }
}

function initialize(id, params) {
  const requestedVersion = params.protocolVersion;
  const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
    ? requestedVersion
    : SUPPORTED_PROTOCOL_VERSIONS[0];
  sendResult(id, {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: { name: "wl-skills", version: PKG.version },
    instructions: "写操作默认先预览；仅在用户确认后传对应 confirm 参数。字典支持项目级自动发现；缺少 dicts.ts 时先 bootstrap 本地契约，线上发布只读取 dicts.ts 并校验 planHash。" + observation.MCP_RECEIPT_GUIDANCE,
  });
}

const PARAMLESS_HANDLERS = {
  "tools/list": (id) => sendResult(id, { tools: TOOLS }),
  ping: (id) => sendResult(id, {}),
};

const PARAM_HANDLERS = {
  initialize,
  "tools/call": (id, params) => dispatchTool(id, params.name, params.arguments === undefined ? {} : params.arguments),
};

async function handleMessage(msg) {
  const checked = validateRequest(msg);
  if (checked.error) return send(checked.error);
  if (checked.notification) return;
  const { id, method, params = {} } = checked.request;
  const paramlessHandler = Object.hasOwn(PARAMLESS_HANDLERS, method) ? PARAMLESS_HANDLERS[method] : undefined;
  if (paramlessHandler) return paramlessHandler(id);
  const paramHandler = Object.hasOwn(PARAM_HANDLERS, method) ? PARAM_HANDLERS[method] : undefined;
  if (!paramHandler) return sendError(id, -32601, `Method not found: ${method}`);
  return paramHandler(id, params);
}

function startServer() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("line", async (line) => {
    const msg = parseMessage(line);
    if (msg !== undefined) await handleMessage(msg);
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

// 仅在直接执行时启动监听；被 require（如测试）时不启动
if (require.main === module) {
  printBanner();
  startServer();
}

/**
 * 启动 banner — 写入 stderr，不污染 stdout 的 JSON-RPC 通道
 * 让用户在编辑器 MCP 输出面板能直观看到：版本、工具数量、项目根
 */
function printBanner() {
  const projectRoot = process.env.WL_PROJECT_ROOT || process.cwd();
  const lines = [
    "",
    "═══════════════════════════════════════════════════",
    `  wl-skills MCP Server v${PKG.version}`,
    "═══════════════════════════════════════════════════",
    `  项目根 (WL_PROJECT_ROOT): ${projectRoot}`,
    `  已注册工具 (${TOOLS.length}):`,
    ...TOOLS.map((t) => `    • ${t.name}`),
    "═══════════════════════════════════════════════════",
    "",
  ];
  process.stderr.write(lines.join("\n") + "\n");
}

module.exports = {
  TOOLS,
  HANDLERS,
  dispatchTool,
  handleMessage,
  parseMessage,
  startServer,
};

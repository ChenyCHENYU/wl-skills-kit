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
const { loadConfig } = require("./config");
const { TOOLS, HANDLERS } = require("./registry");
const { validateSchema } = require("./schema-validator");

const PKG = require("../package.json");
const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];

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

async function dispatchTool(id, toolName, toolArgs) {
  const desc = HANDLERS[toolName];
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
    sendResult(id, configResult.error);
    return;
  }

  try {
    const handlerResult = await desc.handle(toolArgs, configResult.config);
    const normalized = typeof handlerResult === "string"
      ? { text: handlerResult }
      : handlerResult;
    if (desc.outputSchema) {
      const outputValidation = validateSchema(desc.outputSchema, normalized.structuredContent);
      if (!outputValidation.valid) {
        sendResult(id, {
          content: [{ type: "text", text: `❌ 工具输出不符合契约: ${outputValidation.errors.join("；")}` }],
          isError: true,
        });
        return;
      }
    }
    sendResult(id, {
      content: [{ type: "text", text: normalized.text }],
      ...(normalized.structuredContent ? { structuredContent: normalized.structuredContent } : {}),
      ...(normalized.isError ? { isError: true } : {}),
    });
  } catch (e) {
    sendResult(id, {
      content: [{ type: "text", text: `❌ 工具执行异常: ${e.message}` }],
      isError: true,
    });
  }
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
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return null;
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
    instructions: "写操作默认先预览；仅在用户确认后传对应 confirm 参数。字典支持项目级自动发现；缺少 dicts.ts 时先 bootstrap 本地契约，线上发布只读取 dicts.ts 并校验 planHash。",
  });
}

async function handleMessage(msg) {
  const { id, method, params = {} } = msg;
  if (id === undefined || id === null) return;
  if (method === "initialize") return initialize(id, params);
  if (method === "tools/list") return sendResult(id, { tools: TOOLS });
  if (method === "tools/call") return dispatchTool(id, params.name, params.arguments || {});
  if (method === "ping") return sendResult(id, {});
  return sendError(id, -32601, `Method not found: ${method}`);
}

function startServer() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("line", async (line) => {
    const msg = parseMessage(line);
    if (msg) await handleMessage(msg);
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

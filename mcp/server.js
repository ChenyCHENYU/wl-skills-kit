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

const PKG = require("../package.json");

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

  let config;
  if (desc.needsBackendConfig) {
    try {
      config = loadConfig();
    } catch (e) {
      sendResult(id, {
        content: [{ type: "text", text: `❌ 配置加载失败: ${e.message}` }],
        isError: true,
      });
      return;
    }
  }

  try {
    const text = await desc.handle(toolArgs, config);
    sendResult(id, { content: [{ type: "text", text }] });
  } catch (e) {
    sendResult(id, {
      content: [{ type: "text", text: `❌ 工具执行异常: ${e.message}` }],
      isError: true,
    });
  }
}

// ─── 消息循环 ────────────────────────────────────────────────────────────

function startServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on("line", async (line) => {
    const raw = line.trim();
    if (!raw) return;

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      return;
    }

    const { id, method, params = {} } = msg;
    if (id === undefined || id === null) return; // notifications

    switch (method) {
      case "initialize":
        sendResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "wl-skills", version: PKG.version },
        });
        break;
      case "tools/list":
        sendResult(id, { tools: TOOLS });
        break;
      case "tools/call":
        await dispatchTool(id, params.name, params.arguments || {});
        break;
      case "ping":
        sendResult(id, {});
        break;
      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

// 仅在直接执行时启动监听；被 require（如测试）时不启动
if (require.main === module) {
  startServer();
}

module.exports = { TOOLS, HANDLERS, dispatchTool, startServer };

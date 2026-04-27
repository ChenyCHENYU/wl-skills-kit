#!/usr/bin/env node
'use strict'

/**
 * wl-skills MCP Server
 *
 * 实现 MCP 协议（stdio transport，JSON-RPC 2.0）
 * 暴露 4 个工具：
 *   wls_menu_query   查询菜单树
 *   wls_menu_upsert  批量新增/更新菜单
 *   wls_dict_query   查询字典模块
 *   wls_dict_upsert  新增/更新字典模块及字典项
 *
 * 启动方式（由 .cursor/mcp.json 自动注入）：
 *   node node_modules/@agile-team/wl-skills-kit/mcp/server.js
 */

const readline = require('readline')
const { loadConfig } = require('./config')
const { handleMenuQuery, handleMenuUpsert } = require('./tools/menuSync')
const { handleDictQuery, handleDictUpsert } = require('./tools/dictSync')

const PKG = require('../package.json')

// ─── Tool 注册表 ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'wls_menu_query',
    description:
      '查询当前应用的完整菜单树。自动从 .github/skills/sync/env.local.json 读取 domainId，' +
      '无需传参。在 wls_menu_upsert 前调用，用于判断哪些菜单需要新增、哪些需要更新。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'wls_menu_upsert',
    description:
      '批量新增或更新菜单项。有 id 字段 → 更新；无 id 字段 → 新增。' +
      '新增时响应自动包含服务端生成的 id，可链式用于创建子菜单。',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description:
            'MenuSaveBody 数组。每项字段：' +
            'id(更新时传), sysAppNo, menuName, menuNameCode, parentId, ' +
            'type("M"=目录/"C"=菜单), path, icon, orderNum, ' +
            'useCache(1), common(2), hidden(false), editMode(false), ' +
            'component(type=C时传), permission(type=C时传)',
          items: { type: 'object' },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'wls_dict_query',
    description:
      '查询当前应用的所有字典模块及字典项。在 wls_dict_upsert 前调用，' +
      '用于判断哪些模块/字典项已存在。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'wls_dict_upsert',
    description:
      '新增或更新字典模块及其字典项。内部自动处理：' +
      '若模块不存在则创建（data=null 后自动 re-query 获取 id），' +
      '若已存在则直接取 id；字典项自动跳过已存在的 strSn。',
    inputSchema: {
      type: 'object',
      properties: {
        module: {
          type: 'object',
          description: 'DictModuleSaveBody: strSn(必填), strName(必填), sortPriority("1"), strLevel(2)',
          properties: {
            strSn: { type: 'string', description: '模块标识符，如 "gender"' },
            strName: { type: 'string', description: '模块显示名，如 "性别"' },
            sortPriority: { type: 'string', description: '排序，字符串类型，如 "1"' },
            strLevel: { type: 'number', description: '固定传 2' },
          },
          required: ['strSn', 'strName'],
        },
        items: {
          type: 'array',
          description:
            'DictItemSaveBody 数组（可选）。每项字段：' +
            'strSn(必填), strName(必填), strLevel(2), ' +
            'dtlValue(""), dtlValueRequired(false), dtlValue2Required(false), ' +
            'dtlValue3Required(false), dtlValue4Required(false)',
          items: { type: 'object' },
        },
      },
      required: ['module'],
    },
  },
]

// ─── JSON-RPC 协议层 ────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

// ─── Tool 调度 ───────────────────────────────────────────────────────────

async function dispatchTool(id, toolName, toolArgs) {
  let config
  try {
    config = loadConfig()
  } catch (e) {
    // 配置加载失败：以文本形式返回给 AI（不是 JSON-RPC error，AI 能读）
    sendResult(id, { content: [{ type: 'text', text: `❌ 配置加载失败: ${e.message}` }], isError: true })
    return
  }

  try {
    let text
    switch (toolName) {
      case 'wls_menu_query':
        text = await handleMenuQuery(config)
        break
      case 'wls_menu_upsert':
        text = await handleMenuUpsert(toolArgs, config)
        break
      case 'wls_dict_query':
        text = await handleDictQuery(config)
        break
      case 'wls_dict_upsert':
        text = await handleDictUpsert(toolArgs, config)
        break
      default:
        sendError(id, -32601, `未知工具: ${toolName}`)
        return
    }
    sendResult(id, { content: [{ type: 'text', text }] })
  } catch (e) {
    sendResult(id, {
      content: [{ type: 'text', text: `❌ 工具执行异常: ${e.message}` }],
      isError: true,
    })
  }
}

// ─── 消息循环 ────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, terminal: false })

rl.on('line', async (line) => {
  const raw = line.trim()
  if (!raw) return

  let msg
  try {
    msg = JSON.parse(raw)
  } catch (e) {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }

  const { id, method, params = {} } = msg

  // Notifications（无 id）不需要响应
  if (id === undefined || id === null) return

  switch (method) {
    case 'initialize':
      sendResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'wl-skills', version: PKG.version },
      })
      break

    case 'tools/list':
      sendResult(id, { tools: TOOLS })
      break

    case 'tools/call':
      await dispatchTool(id, params.name, params.arguments || {})
      break

    case 'ping':
      sendResult(id, {})
      break

    default:
      sendError(id, -32601, `Method not found: ${method}`)
  }
})

rl.on('close', () => {
  process.exit(0)
})

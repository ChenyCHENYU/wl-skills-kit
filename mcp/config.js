'use strict'

const fs = require('fs')
const path = require('path')

/**
 * 从项目的 .wl-skills/skills/sync/env.local.json 加载 MCP 运行配置
 * 项目根目录通过环境变量 WL_PROJECT_ROOT 传入（由 .cursor/mcp.json 注入）
 */
function readRawConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (e) {
    throw new Error(`配置文件解析失败: ${e.message}`)
  }
}

function validateGateway(value) {
  const gatewayPath = String(value || '').trim()
  if (!gatewayPath || /你的网关|请填/i.test(gatewayPath)) {
    throw new Error('请在 env.local.json 中填写真实的 gatewayPath（当前为占位值）')
  }
  let gatewayUrl
  try {
    gatewayUrl = new URL(gatewayPath)
  } catch {
    throw new Error('env.local.json 的 gatewayPath 不是合法 URL')
  }
  if (!['http:', 'https:'].includes(gatewayUrl.protocol)) {
    throw new Error('env.local.json 的 gatewayPath 仅支持 http/https')
  }
  return gatewayPath.replace(/\/+$/, '')
}

function validateToken(value) {
  const token = String(value || '').trim()
  if (!token || /Bearer Token|请填|你的|实际登录凭据/i.test(token)) {
    throw new Error('请在 env.local.json 中填写真实的 token（当前为占位值）')
  }
  if (/^bearer\s+/i.test(token)) {
    throw new Error('env.local.json 的 token 只填纯 JWT/Token，不含 bearer 前缀')
  }
  return token
}

function loadConfig() {
  const projectRoot = path.resolve(process.env.WL_PROJECT_ROOT || process.cwd())
  const configPath = path.join(projectRoot, '.wl-skills', 'skills', 'sync', 'env.local.json')

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `配置文件不存在: ${configPath}\n` +
      `请先执行 pnpm dlx @agile-team/wl-skills-kit init，然后填写 .wl-skills/skills/sync/env.local.json`
    )
  }

  const raw = readRawConfig(configPath)

  return {
    gatewayPath: validateGateway(raw.gatewayPath),
    token: validateToken(raw.token),
    sysAppNo: raw.sysAppNo || '',
    menu: raw.menu || {},
    dict: raw.dict || {},
  }
}

module.exports = { loadConfig, _internal: { validateGateway, validateToken } }

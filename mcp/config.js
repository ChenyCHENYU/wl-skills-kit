'use strict'

const fs = require('fs')
const path = require('path')

/**
 * 从项目的 .github/skills/sync/env.local.json 加载 MCP 运行配置
 * 项目根目录通过环境变量 WL_PROJECT_ROOT 传入（由 .cursor/mcp.json 注入）
 */
function loadConfig() {
  const projectRoot = process.env.WL_PROJECT_ROOT
    ? path.resolve(process.env.WL_PROJECT_ROOT)
    : process.cwd()

  const configPath = path.join(projectRoot, '.github', 'skills', 'sync', 'env.local.json')

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `配置文件不存在: ${configPath}\n` +
      `请先执行 npx @agile-team/wl-skills-kit init，然后填写 .github/skills/sync/env.local.json`
    )
  }

  let raw
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (e) {
    throw new Error(`配置文件解析失败: ${e.message}`)
  }

  if (!raw.gatewayPath || raw.gatewayPath.includes('你的网关')) {
    throw new Error('请在 env.local.json 中填写真实的 gatewayPath（当前为占位值）')
  }
  if (!raw.token || raw.token.includes('Bearer Token')) {
    throw new Error('请在 env.local.json 中填写真实的 token（当前为占位值）')
  }

  return {
    gatewayPath: raw.gatewayPath.replace(/\/$/, ''), // 去掉尾部斜杠
    token: raw.token,
    sysAppNo: raw.sysAppNo || '',
    menu: raw.menu || {},
    dict: raw.dict || {},
  }
}

module.exports = { loadConfig }

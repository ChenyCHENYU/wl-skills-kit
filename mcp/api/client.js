'use strict'

const https = require('https')
const http = require('http')
const crypto = require('crypto')

function errorHint(code, message) {
  if (code === 401 || /token|未登录|鉴权/i.test(message || '')) {
    return '（Token 可能已过期，请重新登录后更新 env.local.json 的 token 字段，仅填纯 JWT 不含 bearer 前缀）'
  }
  if (code === 4004 || /url:|not\s*found/i.test(message || '')) {
    return '（接口未找到。可能是 gatewayPath 配置缺失前缀或后端环境差异；请检查 env.local.json 的 gatewayPath。不要让 AI 绕开 MCP 自己拼 HTTP）'
  }
  return ''
}

function parseResponse(data, statusCode, requestId) {
  let json
  try {
    json = JSON.parse(data)
  } catch (error) {
    throw new Error(`响应解析失败: ${error.message}（HTTP ${statusCode}，requestId=${requestId}）`)
  }
  if (json.code === 2000 && statusCode >= 200 && statusCode < 300) {
    return { ok: true, data: json.data, code: json.code, statusCode, requestId }
  }
  const message = json.message || `服务端返回 code=${json.code}`
  return {
    ok: false,
    data: null,
    error: message + errorHint(json.code, message),
    code: json.code,
    statusCode,
    requestId,
  }
}

function normalizeCustomHeaders(customHeaders) {
  const normalized = {}
  for (const [name, value] of Object.entries(customHeaders || {})) {
    if (value == null) continue
    const text = String(value)
    normalized[name] = /[^\x20-\x7E]/.test(text) ? encodeURIComponent(text) : text
  }
  return normalized
}

function buildHeaders(config, bodyStr, requestId, customHeaders) {
  const headers = {
    ...normalizeCustomHeaders(customHeaders),
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.token}`,
    'X-WL-Skills-Request-Id': requestId,
  }
  if (config.sysAppNo) headers.sysAppNo = config.sysAppNo
  if (config.sysOnlyCurrentApp || (config.dict && config.dict.sysOnlyCurrentApp)) {
    headers.sysOnlyCurrentApp = 'true'
  }
  if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr)
  return headers
}

function buildRequest(fullUrl, options, config, requestId) {
  const urlObj = new URL(fullUrl)
  const isHttps = urlObj.protocol === 'https:'
  const bodyStr = options.body == null ? null : JSON.stringify(options.body)
  return {
    lib: isHttps ? https : http,
    bodyStr,
    requestOptions: {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: buildHeaders(config, bodyStr, requestId, options.headers),
    },
  }
}

/**
 * 带鉴权的 HTTP 客户端（兼容 Node 16+，无额外依赖）
 *
 * @param {string} urlPath - 接口路径（以 / 开头），拼接到 config.gatewayPath 后
 * @param {{ method?: string, body?: unknown }} options
 * @param {{ gatewayPath: string, token: string, sysAppNo?: string, sysOnlyCurrentApp?: boolean, dict?: object }} config
 * @returns {Promise<{ ok: boolean, data: any, error?: string, code?: number }>}
 */
function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function requestOnce(fullUrl, options, config, requestId, timeoutMs) {
  let request
  try {
    request = buildRequest(fullUrl, options, config, requestId)
  } catch {
    return Promise.reject(new Error(`无效的 URL: ${fullUrl}`))
  }

  return new Promise((resolve, reject) => {
    const req = request.lib.request(request.requestOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ data, statusCode: res.statusCode || 0 }))
    })

    req.on('error', (error) => reject(new Error(`请求失败: ${error.message}`)))
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`请求超时（${timeoutMs}ms）`))
    })

    if (request.bodyStr) req.write(request.bodyStr)
    req.end()
  })
}

function retryableStatus(statusCode) {
  return statusCode === 429 || [502, 503, 504].includes(statusCode)
}

async function wlsFetch(urlPath, options, config) {
  const fullUrl = config.gatewayPath + urlPath
  const requestId = crypto.randomUUID()
  const requestOptions = options || {}
  const method = String(requestOptions.method || 'GET').toUpperCase()
  const network = config.network || {}
  const timeoutMs = boundedInteger(network.timeoutMs, 15000, 1000, 60000)
  const retries = method === 'GET' ? boundedInteger(network.getRetries, 2, 0, 3) : 0
  const retryDelayMs = boundedInteger(network.retryDelayMs, 200, 10, 2000)

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await requestOnce(fullUrl, requestOptions, config, requestId, timeoutMs)
      if (attempt < retries && retryableStatus(response.statusCode)) {
        await wait(Math.min(retryDelayMs * (2 ** attempt), 2000))
        continue
      }
      return parseResponse(response.data, response.statusCode, requestId)
    } catch (error) {
      if (attempt >= retries) throw error
      await wait(Math.min(retryDelayMs * (2 ** attempt), 2000))
    }
  }

  throw new Error('请求重试状态异常')
}

module.exports = {
  wlsFetch,
  _internal: {
    boundedInteger,
    buildRequest,
    errorHint,
    normalizeCustomHeaders,
    parseResponse,
    requestOnce,
    retryableStatus,
  },
}

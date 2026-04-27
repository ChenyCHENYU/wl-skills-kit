'use strict'

const https = require('https')
const http = require('http')

/**
 * 带鉴权的 HTTP 客户端（兼容 Node 16+，无额外依赖）
 *
 * @param {string} urlPath - 接口路径（以 / 开头），拼接到 config.gatewayPath 后
 * @param {{ method?: string, body?: unknown }} options
 * @param {{ gatewayPath: string, token: string }} config
 * @returns {Promise<{ ok: boolean, data: any, error?: string, code?: number }>}
 */
function wlsFetch(urlPath, options, config) {
  const fullUrl = config.gatewayPath + urlPath
  const isHttps = fullUrl.startsWith('https')
  const lib = isHttps ? https : http
  const bodyStr = options.body ? JSON.stringify(options.body) : null

  let urlObj
  try {
    urlObj = new URL(fullUrl)
  } catch (e) {
    return Promise.reject(new Error(`无效的 URL: ${fullUrl}`))
  }

  const reqOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    },
  }

  if (bodyStr) {
    reqOptions.headers['Content-Length'] = Buffer.byteLength(bodyStr)
  }

  return new Promise((resolve, reject) => {
    const req = lib.request(reqOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.code === 2000) {
            resolve({ ok: true, data: json.data, code: json.code })
          } else {
            resolve({
              ok: false,
              data: null,
              error: json.message || `服务端返回 code=${json.code}`,
              code: json.code,
            })
          }
        } catch (e) {
          reject(new Error(`响应解析失败: ${e.message}，原始内容: ${data.slice(0, 200)}`))
        }
      })
    })

    req.on('error', (e) => reject(new Error(`请求失败: ${e.message}`)))
    req.setTimeout(15000, () => {
      req.destroy()
      reject(new Error('请求超时（15s）'))
    })

    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

module.exports = { wlsFetch }

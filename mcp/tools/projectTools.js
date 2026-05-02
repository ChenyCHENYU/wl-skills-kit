'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const https = require('https')

function getProjectRoot() {
  return process.env.WL_PROJECT_ROOT ? path.resolve(process.env.WL_PROJECT_ROOT) : process.cwd()
}

function normalizePath(p) {
  return p.replace(/\\/g, '/')
}

function safeResolve(root, inputPath) {
  const full = inputPath ? path.resolve(root, inputPath) : root
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error('路径越界：只能扫描项目根目录内的文件')
  }
  return full
}

function walkFiles(dir, baseDir, files) {
  files = files || []
  if (!fs.existsSync(dir)) return files
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, baseDir, files)
    else files.push(normalizePath(path.relative(baseDir, full)))
  }
  return files
}

function findPageDirs(root, scanRel) {
  const scanDir = safeResolve(root, scanRel || 'src/views')
  const files = walkFiles(scanDir, root)
  const dirs = new Map()
  for (const rel of files) {
    const name = path.basename(rel)
    const dir = normalizePath(path.dirname(rel))
    if (!dirs.has(dir)) dirs.set(dir, new Set())
    dirs.get(dir).add(name)
  }
  const pages = []
  for (const [dir, names] of dirs.entries()) {
    if (!names.has('index.vue')) continue
    const dataPath = path.join(root, dir, 'data.ts')
    let apiConfigCount = 0
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf8')
      apiConfigCount = (content.match(/API_CONFIG/g) || []).length
    }
    pages.push({
      dir,
      hasIndexVue: names.has('index.vue'),
      hasDataTs: names.has('data.ts'),
      hasIndexScss: names.has('index.scss'),
      hasApiMd: names.has('api.md'),
      apiConfigCount,
    })
  }
  pages.sort((a, b) => a.dir.localeCompare(b.dir))
  return pages
}

function formatPagesTable(pages) {
  const lines = ['| 页面目录 | index.vue | data.ts | index.scss | api.md | API_CONFIG |', '|---|---:|---:|---:|---:|---:|']
  for (const page of pages) {
    lines.push(
      `| ${page.dir} | ${page.hasIndexVue ? '✅' : '❌'} | ${page.hasDataTs ? '✅' : '❌'} | ${page.hasIndexScss ? '✅' : '❌'} | ${page.hasApiMd ? '✅' : '—'} | ${page.apiConfigCount} |`
    )
  }
  return lines.join('\n')
}

async function handleCodeScan(args) {
  const root = getProjectRoot()
  const scanPath = args && args.path ? args.path : 'src/views'
  const pages = findPageDirs(root, scanPath)
  const missingData = pages.filter((p) => !p.hasDataTs).length
  const missingScss = pages.filter((p) => !p.hasIndexScss).length
  const missingApi = pages.filter((p) => !p.hasApiMd).length
  const apiPages = pages.filter((p) => p.apiConfigCount > 0).length

  if (pages.length === 0) {
    return `⚠️ 未在 ${scanPath} 下发现包含 index.vue 的页面目录`
  }

  return [
    `✅ 代码结构扫描完成：${scanPath}`,
    '',
    `- 页面目录：${pages.length}`,
    `- 含 API_CONFIG：${apiPages}`,
    `- 缺 data.ts：${missingData}`,
    `- 缺 index.scss：${missingScss}`,
    `- 缺 api.md：${missingApi}（需结合场景判断是否必须）`,
    '',
    formatPagesTable(pages),
  ].join('\n')
}

function findRouteFile(root, inputPath) {
  if (inputPath) {
    const full = safeResolve(root, inputPath)
    return fs.existsSync(full) ? full : null
  }
  const candidates = [
    'vite/plugins/shared/pages.ts',
    'src/router/pages.ts',
    'src/router/routes.ts',
    'src/router/index.ts',
  ]
  for (const rel of candidates) {
    const full = path.join(root, rel)
    if (fs.existsSync(full)) return full
  }
  return null
}

async function handleRouteCheck(args) {
  const root = getProjectRoot()
  const scanPath = args && args.path ? args.path : 'src/views'
  const routeFile = findRouteFile(root, args && args.routeFile)
  if (!routeFile) {
    return '⚠️ 未找到路由文件，默认检查路径：vite/plugins/shared/pages.ts / src/router/pages.ts / src/router/routes.ts / src/router/index.ts'
  }
  const routeContent = fs.readFileSync(routeFile, 'utf8').replace(/\\/g, '/')
  const pages = findPageDirs(root, scanPath)
  const rows = []
  for (const page of pages) {
    const viewRel = page.dir.replace(/^src\/views\//, '')
    const lastSegment = viewRel.split('/').filter(Boolean).pop() || viewRel
    const registered = routeContent.includes(viewRel) || routeContent.includes(page.dir) || routeContent.includes(lastSegment)
    rows.push({ dir: page.dir, registered })
  }
  const miss = rows.filter((r) => !r.registered)
  const relRoute = normalizePath(path.relative(root, routeFile))
  const lines = [`✅ 路由检查完成：${relRoute}`, '', `- 页面目录：${rows.length}`, `- 疑似未注册：${miss.length}`, '', '| 页面目录 | 路由文件中可发现 |', '|---|---:|']
  for (const row of rows) lines.push(`| ${row.dir} | ${row.registered ? '✅' : '⚠️'} |`)
  return lines.join('\n')
}

async function handleGitLogExtract(args) {
  const root = getProjectRoot()
  const n = Math.max(1, Math.min(Number((args && args.n) || 20), 100))
  let output
  try {
    output = execFileSync('git', ['log', `-${n}`, '--pretty=format:%h%x09%s%x09%an%x09%ad', '--date=short'], { cwd: root, encoding: 'utf8' })
  } catch (e) {
    return `❌ git log 提取失败：${e.message}`
  }
  if (!output.trim()) return '⚠️ 未提取到 git log'
  const lines = ['✅ 最近提交摘要', '', '| hash | message | author | date |', '|---|---|---|---|']
  for (const row of output.split('\n')) {
    const [hash, message, author, date] = row.split('\t')
    lines.push(`| ${hash} | ${String(message || '').replace(/\|/g, '\\|')} | ${author || ''} | ${date || ''} |`)
  }
  return lines.join('\n')
}

function readEnvLocal(root) {
  const envPath = path.join(root, '.github', 'skills', 'sync', 'env.local.json')
  if (!fs.existsSync(envPath)) return null
  try {
    return JSON.parse(fs.readFileSync(envPath, 'utf8'))
  } catch (e) {
    return null
  }
}

function findLatestAuditReport(root, inputPath) {
  if (inputPath) {
    const full = safeResolve(root, inputPath)
    return fs.existsSync(full) ? full : null
  }
  const reportDir = path.join(root, '.github', 'reports')
  if (!fs.existsSync(reportDir)) return null
  const files = fs
    .readdirSync(reportDir)
    .filter((name) => /^AUDIT_.*\.md$|规范审查报告\.md$/.test(name))
    .map((name) => path.join(reportDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  return files[0] || null
}

function postWebhook(webhook, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload)
    const req = https.request(
      webhook,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
      }
    )
    req.on('error', (e) => resolve({ ok: false, error: e.message }))
    req.write(body)
    req.end()
  })
}

async function handleAuditReportPush(args) {
  const root = getProjectRoot()
  const env = readEnvLocal(root)
  const webhook = env && env.feishu_webhook
  if (!webhook || String(webhook).includes('你的') || String(webhook).includes('webhook')) {
    return 'ℹ️ 未配置 env.local.json 的 feishu_webhook，已跳过审计报告推送'
  }
  const report = findLatestAuditReport(root, args && args.reportPath)
  if (!report) return '⚠️ 未找到可推送的审计报告'
  const rel = normalizePath(path.relative(root, report))
  const content = fs.readFileSync(report, 'utf8').slice(0, 3500)
  const result = await postWebhook(webhook, { msg_type: 'text', content: { text: `wl-skills 审计报告：${rel}\n\n${content}` } })
  if (!result.ok) return `❌ 飞书推送失败：${result.error || result.statusCode}`
  return `✅ 审计报告已推送：${rel}`
}

module.exports = {
  handleCodeScan,
  handleRouteCheck,
  handleGitLogExtract,
  handleAuditReportPush,
}

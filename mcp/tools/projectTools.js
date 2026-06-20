"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const https = require("https");
const { runAstRules, runTypeCheck } = require("../../lib/ast-rules");
const { alignPage } = require("../../lib/page-spec");

function getProjectRoot() {
  return process.env.WL_PROJECT_ROOT
    ? path.resolve(process.env.WL_PROJECT_ROOT)
    : process.cwd();
}

function normalizePath(p) {
  return p.replace(/\\/g, "/");
}

function safeResolve(root, inputPath) {
  const full = inputPath ? path.resolve(root, inputPath) : root;
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("路径越界：只能扫描项目根目录内的文件");
  }
  return full;
}

function walkFiles(dir, baseDir, files) {
  files = files || [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist"
    )
      continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, baseDir, files);
    else files.push(normalizePath(path.relative(baseDir, full)));
  }
  return files;
}

function findPageDirs(root, scanRel) {
  const scanDir = safeResolve(root, scanRel || "src/views");
  const files = walkFiles(scanDir, root);
  const dirs = new Map();
  for (const rel of files) {
    const name = path.basename(rel);
    const dir = normalizePath(path.dirname(rel));
    if (!dirs.has(dir)) dirs.set(dir, new Set());
    dirs.get(dir).add(name);
  }
  const pages = [];
  for (const [dir, names] of dirs.entries()) {
    if (!names.has("index.vue")) continue;
    const dataPath = path.join(root, dir, "data.ts");
    let apiConfigCount = 0;
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, "utf8");
      apiConfigCount = (content.match(/API_CONFIG/g) || []).length;
    }
    pages.push({
      dir,
      hasIndexVue: names.has("index.vue"),
      hasDataTs: names.has("data.ts"),
      hasIndexScss: names.has("index.scss"),
      hasApiMd: names.has("api.md"),
      apiConfigCount,
    });
  }
  pages.sort((a, b) => a.dir.localeCompare(b.dir));
  return pages;
}

function formatPagesTable(pages) {
  const lines = [
    "| 页面目录 | index.vue | data.ts | index.scss | api.md | API_CONFIG |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const page of pages) {
    lines.push(
      `| ${page.dir} | ${page.hasIndexVue ? "✅" : "❌"} | ${page.hasDataTs ? "✅" : "❌"} | ${page.hasIndexScss ? "✅" : "❌"} | ${page.hasApiMd ? "✅" : "—"} | ${page.apiConfigCount} |`,
    );
  }
  return lines.join("\n");
}

async function handleCodeScan(args) {
  const root = getProjectRoot();
  const scanPath = args && args.path ? args.path : "src/views";
  const pages = findPageDirs(root, scanPath);
  const missingData = pages.filter((p) => !p.hasDataTs).length;
  const missingScss = pages.filter((p) => !p.hasIndexScss).length;
  const missingApi = pages.filter((p) => !p.hasApiMd).length;
  const apiPages = pages.filter((p) => p.apiConfigCount > 0).length;

  if (pages.length === 0) {
    return `⚠️ 未在 ${scanPath} 下发现包含 index.vue 的页面目录`;
  }

  return [
    `✅ 代码结构扫描完成：${scanPath}`,
    "",
    `- 页面目录：${pages.length}`,
    `- 含 API_CONFIG：${apiPages}`,
    `- 缺 data.ts：${missingData}`,
    `- 缺 index.scss：${missingScss}`,
    `- 缺 api.md：${missingApi}（需结合场景判断是否必须）`,
    "",
    formatPagesTable(pages),
  ].join("\n");
}

function readPackageDeps(root) {
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) return {};
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

function findMockFiles(root) {
  const mockDir = path.join(root, "mock");
  if (!fs.existsSync(mockDir)) return [];
  return walkFiles(mockDir, root).filter((rel) => /\.(ts|js)$/.test(rel));
}

async function handleValidatePage(args) {
  const root = getProjectRoot();
  const scanPath = args && args.path ? args.path : "src/views";
  const pages = findPageDirs(root, scanPath);
  const mockFiles = findMockFiles(root);
  const mockContent = mockFiles
    .map((rel) => fs.readFileSync(path.join(root, rel), "utf8"))
    .join("\n");
  const issues = [];

  for (const page of pages) {
    const indexPath = path.join(root, page.dir, "index.vue");
    const dataPath = path.join(root, page.dir, "data.ts");
    const indexContent = fs.existsSync(indexPath)
      ? fs.readFileSync(indexPath, "utf8")
      : "";
    const dataContent = fs.existsSync(dataPath)
      ? fs.readFileSync(dataPath, "utf8")
      : "";
    const baseTableCount = (indexContent.match(/<BaseTable\b/g) || []).length;
    const agGridCount = (
      indexContent.match(/render-type=["']agGrid["']/g) || []
    ).length;
    const cidCount = (indexContent.match(/\bcid=|:cid=/g) || []).length;

    if (!page.hasDataTs) issues.push([page.dir, "warn", "缺 data.ts"]);
    if (!page.hasIndexScss) issues.push([page.dir, "warn", "缺 index.scss"]);
    if (page.apiConfigCount > 0 && !page.hasApiMd)
      issues.push([page.dir, "warn", "检测到 API_CONFIG 但缺 api.md"]);
    if (baseTableCount > 0 && agGridCount < baseTableCount)
      issues.push([page.dir, "error", 'BaseTable 必须 render-type="agGrid"']);
    if (baseTableCount > 0 && cidCount < baseTableCount)
      issues.push([page.dir, "error", "BaseTable 必须配置 cid/:cid"]);
    if (
      baseTableCount > 0 &&
      dataContent &&
      !/defineColumns\s*\(/.test(dataContent)
    )
      issues.push([page.dir, "error", "列定义必须使用 defineColumns()"]);
    if (/operations\s*:/.test(dataContent))
      issues.push([
        page.dir,
        "error",
        "禁止 operations 数组，必须使用 renderOps()",
      ]);
    if (/onClick\s*:\s*\(\s*[^)]*\s*\)\s*=>\s*\{\s*\}/.test(dataContent))
      issues.push([page.dir, "error", "存在空 onClick"]);
    if (page.apiConfigCount > 0 && mockFiles.length === 0)
      issues.push([page.dir, "warn", "检测到 API_CONFIG 但无 mock 文件"]);
    const apiUrls = Array.from(
      dataContent.matchAll(/:\s*["']([^"']+\/[^"']+)["']/g),
    ).map((m) => m[1]);
    for (const url of apiUrls.filter((item) => item.startsWith("/"))) {
      const mockUrl = `/dev-api${url}`;
      if (mockContent && !mockContent.includes(mockUrl))
        issues.push([page.dir, "warn", `mock 未发现端点 ${mockUrl}`]);
    }
  }

  // ── AST 语义级规则检测（v2.10.0+）─────────────────────────────────
  const astResult = runAstRules(root, scanPath);
  if (astResult.astAvailable === false) {
    issues.push([
      scanPath,
      "warn",
      "AST 引擎不可用，跳过语义级规则（R1~R7）",
    ]);
  } else {
    for (const iss of astResult.issues) {
      issues.push([iss.dir, iss.level, `[${iss.rule}] ${iss.text}`]);
    }
  }

  // ── page-spec 比对（v2.11.1+，"约定 vs 代码"确定性核对 S1~S5）───────
  for (const page of pages) {
    const absDir = path.join(root, page.dir);
    const { issues: specIssues } = alignPage(absDir, page.dir);
    for (const iss of specIssues) {
      issues.push([iss.dir, iss.level, `[${iss.rule}] ${iss.text}`]);
    }
  }

  // ── 类型检查 R14（v2.11.2+，仅当 typecheck:true 触发）─────────────────
  if (args && args.typecheck) {
    const tc = runTypeCheck(root);
    for (const iss of tc.issues) {
      issues.push([iss.dir, iss.level, `[${iss.rule}] ${iss.text}`]);
    }
  }

  const errors = issues.filter((item) => item[1] === "error").length;
  const lines = [
    `✅ 页面校验完成：${scanPath}`,
    "",
    `- 页面目录：${pages.length}`,
    `- error：${errors}`,
    `- warn：${issues.length - errors - issues.filter(i => i[1] === "info").length}`,
    `- info：${issues.filter(i => i[1] === "info").length}`,
    "",
  ];
  if (issues.length === 0) lines.push("✔ 未发现偏差");
  else {
    lines.push("| 页面目录 | 级别 | 问题 |", "|---|---|---|");
    for (const [dir, level, text] of issues)
      lines.push(`| ${dir} | ${level} | ${text} |`);
  }
  return lines.join("\n");
}

async function handleDoctorUi() {
  const root = getProjectRoot();
  const deps = readPackageDeps(root);
  const files = walkFiles(root, root).filter(
    (rel) =>
      /\.(ts|vue|scss|html)$/.test(rel) && !rel.startsWith("node_modules/"),
  );
  const content = files
    .map((rel) => fs.readFileSync(path.join(root, rel), "utf8"))
    .join("\n");
  const checks = [
    [
      "@agile-team/wk-skills-ui",
      Boolean(deps["@agile-team/wk-skills-ui"]),
      deps["@agile-team/wk-skills-ui"] || "未安装",
    ],
    [
      "@element-plus/icons-vue",
      Boolean(deps["@element-plus/icons-vue"]),
      deps["@element-plus/icons-vue"] || "未安装",
    ],
    [
      "design tokens",
      /@agile-team\/wk-skills-ui\/design\/tokens|dist\/tokens\.css/.test(
        content,
      ),
      "tokens 引入",
    ],
    [
      "styles preset",
      /@agile-team\/wk-skills-ui\/styles/.test(content),
      "styles/skin preset 引入",
    ],
    [
      "installCommonPreset",
      /installCommonPreset\s*\(/.test(content),
      "runtime preset 安装",
    ],
    ["defineColumns", /defineColumns\s*\(/.test(content), "列定义 runtime"],
    ["renderOps", /renderOps\s*\(/.test(content), "操作列 runtime"],
  ];
  const lines = [
    "✅ wk-skills-ui 接入检查",
    "",
    "| 检查项 | 状态 | 说明 |",
    "|---|---:|---|",
  ];
  for (const [name, ok, detail] of checks)
    lines.push(`| ${name} | ${ok ? "✅" : "❌"} | ${detail} |`);
  return lines.join("\n");
}

function findRouteFile(root, inputPath) {
  if (inputPath) {
    const full = safeResolve(root, inputPath);
    return fs.existsSync(full) ? full : null;
  }
  const candidates = [
    "vite/plugins/shared/pages.ts",
    "src/router/pages.ts",
    "src/router/routes.ts",
    "src/router/index.ts",
  ];
  for (const rel of candidates) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

async function handleRouteCheck(args) {
  const root = getProjectRoot();
  const scanPath = args && args.path ? args.path : "src/views";
  const routeFile = findRouteFile(root, args && args.routeFile);
  if (!routeFile) {
    return "⚠️ 未找到路由文件，默认检查路径：vite/plugins/shared/pages.ts / src/router/pages.ts / src/router/routes.ts / src/router/index.ts";
  }
  const routeContent = fs.readFileSync(routeFile, "utf8").replace(/\\/g, "/");
  const pages = findPageDirs(root, scanPath);
  const rows = [];
  for (const page of pages) {
    const viewRel = page.dir.replace(/^src\/views\//, "");
    const lastSegment = viewRel.split("/").filter(Boolean).pop() || viewRel;
    const registered =
      routeContent.includes(viewRel) ||
      routeContent.includes(page.dir) ||
      routeContent.includes(lastSegment);
    rows.push({ dir: page.dir, registered });
  }
  const miss = rows.filter((r) => !r.registered);
  const relRoute = normalizePath(path.relative(root, routeFile));
  const lines = [
    `✅ 路由检查完成：${relRoute}`,
    "",
    `- 页面目录：${rows.length}`,
    `- 疑似未注册：${miss.length}`,
    "",
    "| 页面目录 | 路由文件中可发现 |",
    "|---|---:|",
  ];
  for (const row of rows)
    lines.push(`| ${row.dir} | ${row.registered ? "✅" : "⚠️"} |`);
  return lines.join("\n");
}

async function handleGitLogExtract(args) {
  const root = getProjectRoot();
  const n = Math.max(1, Math.min(Number((args && args.n) || 20), 100));
  let output;
  try {
    output = execFileSync(
      "git",
      [
        "log",
        `-${n}`,
        "--pretty=format:%h%x09%s%x09%an%x09%ad",
        "--date=short",
      ],
      { cwd: root, encoding: "utf8" },
    );
  } catch (e) {
    return `❌ git log 提取失败：${e.message}`;
  }
  if (!output.trim()) return "⚠️ 未提取到 git log";
  const lines = [
    "✅ 最近提交摘要",
    "",
    "| hash | message | author | date |",
    "|---|---|---|---|",
  ];
  for (const row of output.split("\n")) {
    const [hash, message, author, date] = row.split("\t");
    lines.push(
      `| ${hash} | ${String(message || "").replace(/\|/g, "\\|")} | ${author || ""} | ${date || ""} |`,
    );
  }
  return lines.join("\n");
}

function readEnvLocal(root) {
  const envPath = path.join(
    root,
    ".github",
    "skills",
    "sync",
    "env.local.json",
  );
  if (!fs.existsSync(envPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(envPath, "utf8"));
  } catch (e) {
    return null;
  }
}

function findLatestAuditReport(root, inputPath) {
  if (inputPath) {
    const full = safeResolve(root, inputPath);
    return fs.existsSync(full) ? full : null;
  }
  const reportDir = path.join(root, ".github", "reports");
  if (!fs.existsSync(reportDir)) return null;
  const files = fs
    .readdirSync(reportDir)
    .filter((name) => /^AUDIT_.*\.md$|规范审查报告\.md$/.test(name))
    .map((name) => path.join(reportDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function postWebhook(webhook, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      webhook,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

async function handleAuditReportPush(args) {
  const root = getProjectRoot();
  const env = readEnvLocal(root);
  const webhook = env && env.feishu_webhook;
  if (
    !webhook ||
    String(webhook).includes("你的") ||
    String(webhook).includes("webhook")
  ) {
    return "ℹ️ 未配置 env.local.json 的 feishu_webhook，已跳过审计报告推送";
  }
  const report = findLatestAuditReport(root, args && args.reportPath);
  if (!report) return "⚠️ 未找到可推送的审计报告";
  const rel = normalizePath(path.relative(root, report));
  const content = fs.readFileSync(report, "utf8").slice(0, 3500);
  const result = await postWebhook(webhook, {
    msg_type: "text",
    content: { text: `wl-skills 审计报告：${rel}\n\n${content}` },
  });
  if (!result.ok)
    return `❌ 飞书推送失败：${result.error || result.statusCode}`;
  return `✅ 审计报告已推送：${rel}`;
}

module.exports = {
  handleCodeScan,
  handleValidatePage,
  handleDoctorUi,
  handleRouteCheck,
  handleGitLogExtract,
  handleAuditReportPush,
};

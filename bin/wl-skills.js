#!/usr/bin/env node

/**
 * wl-skills-kit CLI v1.1
 *
 * 功能：
 *   1. 将 files/ 目录下的所有文件按原始路径拷贝到当前工作目录
 *   2. 从 copilot-instructions.md 动态生成多编辑器配置文件
 *      覆盖 Cursor / Windsurf / Kiro / Trae / Claude Code / Roo/Cline / AGENTS.md
 *
 * 用法：npx @agile-team/wl-skills-kit [--dry-run]
 */

const fs = require("fs");
const path = require("path");

const FILES_DIR = path.resolve(__dirname, "..", "files");
const TARGET_DIR = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const showHelp = args.includes("--help") || args.includes("-h");

if (showHelp) {
  console.log(`
  wl-skills-kit — AI Skill 模板包

  用法:
    npx @agile-team/wl-skills-kit           安装/更新模板文件到当前项目
    npx @agile-team/wl-skills-kit --dry-run  预览将要写入的文件（不实际写入）

  安装后写入:
    .github/         AI 指令 + Skills + 文档（GitHub Copilot）
    docs/            组件 API 文档
    src/             通用组件 + 类型定义
    demo/            领域样例（AI 学习参考）
    AGENTS.md        通用 AI 编辑器兜底（Linux Foundation 标准）
    CLAUDE.md        Claude Code / Claude CLI
    .clinerules      Roo Code / Cline
    .cursorrules     Cursor（legacy）
    .cursor/rules/   Cursor（新格式）
    .windsurfrules   Windsurf (Cascade)
    .kiro/steering/  Kiro
    .trae/rules/     Trae
  `);
  process.exit(0);
}

/**
 * 递归遍历目录，返回所有文件的相对路径
 */
function walkDir(dir, baseDir, fileList) {
  fileList = fileList || [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir, fileList);
    } else {
      fileList.push(path.relative(baseDir, fullPath));
    }
  }
  return fileList;
}

/**
 * 写入文件（自动创建目录）
 * @returns {"created"|"updated"}
 */
function writeFile(destPath, content) {
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const exists = fs.existsSync(destPath);
  if (!dryRun) {
    fs.writeFileSync(destPath, content, "utf8");
  }
  return exists ? "updated" : "created";
}

// ─── 主逻辑 ────────────────────────────────────────────────────────────────

console.log("");
console.log("  wl-skills-kit v" + require("../package.json").version);
console.log("  目标目录: " + TARGET_DIR);
console.log("");

if (!fs.existsSync(FILES_DIR)) {
  console.error("  ✖ files/ 目录不存在，包可能已损坏");
  process.exit(1);
}

let created = 0;
let updated = 0;

// ── Step 1: 复制 files/ 静态文件 ─────────────────────────────────────────

const files = walkDir(FILES_DIR, FILES_DIR);

if (dryRun) {
  console.log("  [Step 1] files/ 静态文件:\n");
}

for (const file of files) {
  const src = path.join(FILES_DIR, file);
  const dest = path.join(TARGET_DIR, file);
  const destDir = path.dirname(dest);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const exists = fs.existsSync(dest);
  if (!dryRun) {
    fs.copyFileSync(src, dest);
  }

  if (dryRun) {
    console.log("  " + (exists ? "覆盖" : "新增") + "  " + file);
  } else {
    exists ? updated++ : created++;
  }
}

// ── Step 2: 动态生成多编辑器配置文件 ────────────────────────────────────

// 读取 copilot-instructions.md（来自 files/ 包内，保证内容与安装文件一致）
const INSTRUCTIONS_SRC = path.join(
  FILES_DIR,
  ".github",
  "copilot-instructions.md"
);

if (fs.existsSync(INSTRUCTIONS_SRC)) {
  const raw = fs.readFileSync(INSTRUCTIONS_SRC, "utf8");
  const AUTO_HEADER =
    "<!-- 由 @agile-team/wl-skills-kit 自动生成。源文件：.github/copilot-instructions.md -->\n" +
    "<!-- 请勿手动编辑本文件，更新时重新执行：npx @agile-team/wl-skills-kit@latest -->\n\n";

  // Cursor 新格式 .mdc 需要 YAML frontmatter
  const CURSOR_MDC_HEADER =
    "---\n" +
    'description: "项目编码规范（由 wl-skills-kit 自动生成）"\n' +
    "alwaysApply: true\n" +
    "---\n\n" +
    AUTO_HEADER;

  // [目标相对路径, 文件内容]
  const editorConfigs = [
    // 通用兜底（Linux Foundation 标准，绝大多数 AI 工具均支持）
    ["AGENTS.md", AUTO_HEADER + raw],
    // Claude Code / Claude CLI
    ["CLAUDE.md", AUTO_HEADER + raw],
    // Roo Code / Cline
    [".clinerules", AUTO_HEADER + raw],
    // Cursor — legacy（根目录，仍被新版支持）
    [".cursorrules", AUTO_HEADER + raw],
    // Cursor — 新格式（带 frontmatter 的 .mdc）
    [".cursor/rules/conventions.mdc", CURSOR_MDC_HEADER + raw],
    // Windsurf (Cascade)
    [".windsurfrules", AUTO_HEADER + raw],
    // Kiro
    [".kiro/steering/conventions.md", AUTO_HEADER + raw],
    // Trae
    [".trae/rules/conventions.md", AUTO_HEADER + raw]
  ];

  if (dryRun) {
    console.log("\n  [Step 2] 多编辑器配置文件（从 copilot-instructions.md 生成）:\n");
  }

  for (const [relPath, content] of editorConfigs) {
    const dest = path.join(TARGET_DIR, relPath);
    const exists = fs.existsSync(dest);
    if (dryRun) {
      console.log("  " + (exists ? "覆盖" : "新增") + "  [编辑器] " + relPath);
    } else {
      const result = writeFile(dest, content);
      result === "created" ? created++ : updated++;
    }
  }
}

if (dryRun) {
  const editorCount = fs.existsSync(INSTRUCTIONS_SRC) ? 8 : 0;
  console.log(
    "\n  共 " +
      (files.length + editorCount) +
      " 个文件（未实际写入）"
  );
  process.exit(0);
}

console.log("  ✔ 完成!");
console.log("    新增: " + created + " 个文件");
console.log("    覆盖: " + updated + " 个文件");
console.log("    总计: " + (created + updated) + " 个文件");
console.log("");

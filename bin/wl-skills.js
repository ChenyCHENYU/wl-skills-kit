#!/usr/bin/env node

/**
 * wl-skills-kit CLI
 *
 * 功能：将 files/ 目录下的所有文件按原始路径拷贝到当前工作目录。
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
    .github/    AI 指令 + Skills + 文档
    docs/       组件 API 文档
    src/        通用组件 + 类型定义
    demo/       领域样例（AI 学习参考）
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

// 主逻辑
console.log("");
console.log("  wl-skills-kit v" + require("../package.json").version);
console.log("  目标目录: " + TARGET_DIR);
console.log("");

if (!fs.existsSync(FILES_DIR)) {
  console.error("  ✖ files/ 目录不存在，包可能已损坏");
  process.exit(1);
}

const files = walkDir(FILES_DIR, FILES_DIR);

if (dryRun) {
  console.log("  --dry-run 模式，以下文件将被写入:\n");
  for (const file of files) {
    const targetPath = path.join(TARGET_DIR, file);
    const exists = fs.existsSync(targetPath);
    console.log("  " + (exists ? "覆盖" : "新增") + "  " + file);
  }
  console.log("\n  共 " + files.length + " 个文件（未实际写入）");
  process.exit(0);
}

let created = 0;
let updated = 0;

for (const file of files) {
  const src = path.join(FILES_DIR, file);
  const dest = path.join(TARGET_DIR, file);
  const destDir = path.dirname(dest);

  // 确保目标目录存在
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const exists = fs.existsSync(dest);
  fs.copyFileSync(src, dest);

  if (exists) {
    updated++;
  } else {
    created++;
  }
}

console.log("  ✔ 完成!");
console.log("    新增: " + created + " 个文件");
console.log("    覆盖: " + updated + " 个文件");
console.log("    总计: " + files.length + " 个文件");
console.log("");

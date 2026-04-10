#!/usr/bin/env node

/**
 * wl-skills-kit CLI v2.0
 *
 * 命令:
 *   init      全量安装（默认，向后兼容）
 *   update    增量更新（仅覆盖有变化的文件，展示 diff 摘要）
 *   clean     构建清理（移除 AI 指令/文档/样例，保留组件和类型）
 *   --help    帮助
 *   --dry-run 预览模式（所有命令均支持）
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FILES_DIR = path.resolve(__dirname, "..", "files");
const TARGET_DIR = process.cwd();
const MANIFEST_NAME = ".wl-skills-manifest.json";
const MANIFEST_PATH = path.join(TARGET_DIR, MANIFEST_NAME);
const PKG = require("../package.json");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const showHelp = args.includes("--help") || args.includes("-h");
const command = args.find((a) => !a.startsWith("-")) || "init";

if (showHelp) {
  console.log(`
  wl-skills-kit v${PKG.version} — AI Skill 模板包

  用法:
    npx @agile-team/wl-skills-kit [命令] [选项]

  命令:
    init       全量安装模板文件到当前项目（默认）
    update     增量更新（仅覆盖有变化的文件，展示变更摘要）
    clean      构建清理（移除开发期 AI 文件，保留 src/components + src/types）

  选项:
    --dry-run  预览模式，不实际写入/删除任何文件
    --help     显示帮助

  示例:
    npx @agile-team/wl-skills-kit                安装全量文件
    npx @agile-team/wl-skills-kit update         仅更新有变化的文件
    npx @agile-team/wl-skills-kit clean          清理开发期文件
    npx @agile-team/wl-skills-kit clean --dry-run 预览将要清理哪些文件

  清理保护路径（clean 不删除）:
    src/components/    通用组件（被业务页面 import，构建必需）
    src/types/         类型桶文件（构建必需）
  `);
  process.exit(0);
}

/**
 * 递归遍历目录，返回所有文件的相对路径（正斜杠）
 */
function walkDir(dir, baseDir, fileList) {
  fileList = fileList || [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir, fileList);
    } else {
      fileList.push(path.relative(baseDir, fullPath).replace(/\\/g, "/"));
    }
  }
  return fileList;
}

/** 计算文件 md5 */
function fileMd5(fp) {
  return crypto.createHash("md5").update(fs.readFileSync(fp)).digest("hex");
}

/** 计算字符串内容 md5 */
function contentMd5(c) {
  return crypto.createHash("md5").update(c, "utf8").digest("hex");
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

/** 复制文件（自动创建目录） */
function copyFileSafe(srcPath, destPath) {
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const exists = fs.existsSync(destPath);
  if (!dryRun) {
    fs.copyFileSync(srcPath, destPath);
  }
  return exists ? "updated" : "created";
}

/** 删除文件，并向上清理空父目录 */
function removeFileAndEmptyParents(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  let dir = path.dirname(filePath);
  while (dir !== TARGET_DIR && dir.length > TARGET_DIR.length) {
    try {
      if (fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      } else { break; }
    } catch (e) { break; }
  }
}

/** 读取 manifest */
function readManifest() {
  if (fs.existsSync(MANIFEST_PATH)) {
    try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")); }
    catch (e) { return null; }
  }
  return null;
}

/** 写入 manifest */
function writeManifest(data) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(data, null, 2), "utf8");
}

// 受保护路径（clean 不删除）
const PROTECTED_PREFIXES = ["src/components/", "src/types/"];
function isProtected(relPath) {
  return PROTECTED_PREFIXES.some((p) => relPath.startsWith(p));
}

// ─── 编辑器配置生成 ─────────────────────────────────────────────────────

const AUTO_HEADER =
  "<!-- 由 @agile-team/wl-skills-kit 自动生成。源文件：.github/copilot-instructions.md -->\n" +
  "<!-- 请勿手动编辑本文件，更新时重新执行：npx @agile-team/wl-skills-kit@latest -->\n\n";

const CURSOR_MDC_HEADER =
  "---\n" +
  'description: "项目编码规范（由 wl-skills-kit 自动生成）"\n' +
  "alwaysApply: true\n" +
  "---\n\n" +
  AUTO_HEADER;

function getEditorConfigs(raw) {
  return [
    ["AGENTS.md", AUTO_HEADER + raw],
    ["CLAUDE.md", AUTO_HEADER + raw],
    [".clinerules", AUTO_HEADER + raw],
    [".cursorrules", AUTO_HEADER + raw],
    [".cursor/rules/conventions.mdc", CURSOR_MDC_HEADER + raw],
    [".windsurfrules", AUTO_HEADER + raw],
    [".kiro/steering/conventions.md", AUTO_HEADER + raw],
    [".trae/rules/conventions.md", AUTO_HEADER + raw],
  ];
}

// ─── 命令: init / update ────────────────────────────────────────────────

function runInstall(incremental) {
  const label = incremental ? "update" : "init";
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [" + label + "]");
  console.log("  目标目录: " + TARGET_DIR);
  if (dryRun) console.log("  模式: --dry-run（预览）");
  console.log("");

  if (!fs.existsSync(FILES_DIR)) {
    console.error("  ✖ files/ 目录不存在，包可能已损坏");
    process.exit(1);
  }

  const oldManifest = readManifest();
  const newManifest = { version: PKG.version, files: {} };
  let created = 0, updated = 0, unchanged = 0;

  // ── Step 1: 复制 files/ 静态文件 ───────────────────────────────────

  const files = walkDir(FILES_DIR, FILES_DIR);
  if (dryRun) console.log("  [Step 1] files/ 静态文件:\n");

  for (const relPath of files) {
    const src = path.join(FILES_DIR, relPath);
    const dest = path.join(TARGET_DIR, relPath);
    const srcHash = fileMd5(src);
    newManifest.files[relPath] = srcHash;

    // update 模式: 跳过内容相同的文件
    if (incremental && fs.existsSync(dest)) {
      if (srcHash === fileMd5(dest)) { unchanged++; continue; }
    }

    if (dryRun) {
      const exists = fs.existsSync(dest);
      console.log("  " + (exists ? "覆盖" : "新增") + "  " + relPath);
      exists ? updated++ : created++;
    } else {
      copyFileSafe(src, dest) === "created" ? created++ : updated++;
    }
  }

  // ── Step 2: 动态生成编辑器配置文件 ────────────────────────────────

  const INSTRUCTIONS_SRC = path.join(FILES_DIR, ".github", "copilot-instructions.md");
  if (fs.existsSync(INSTRUCTIONS_SRC)) {
    const raw = fs.readFileSync(INSTRUCTIONS_SRC, "utf8");
    const editorConfigs = getEditorConfigs(raw);

    if (dryRun) {
      console.log("\n  [Step 2] 编辑器配置文件（从 copilot-instructions.md 生成）:\n");
    }

    for (const [ecPath, ecContent] of editorConfigs) {
      const ecDest = path.join(TARGET_DIR, ecPath);
      const ecHash = contentMd5(ecContent);
      newManifest.files[ecPath] = ecHash;

      if (incremental && fs.existsSync(ecDest)) {
        if (ecHash === fileMd5(ecDest)) { unchanged++; continue; }
      }

      if (dryRun) {
        const ecExists = fs.existsSync(ecDest);
        console.log("  " + (ecExists ? "覆盖" : "新增") + "  [编辑器] " + ecPath);
        ecExists ? updated++ : created++;
      } else {
        writeFile(ecDest, ecContent) === "created" ? created++ : updated++;
      }
    }
  }

  // ── Step 3: 写 manifest ────────────────────────────────────────────

  if (!dryRun) writeManifest(newManifest);

  // ── 输出统计 ──────────────────────────────────────────────────────

  const total = created + updated + unchanged;
  if (dryRun) {
    console.log("");
    if (incremental) {
      console.log("  共 " + total + " 个文件（新增 " + created + "，变更 " + updated + "，未变 " + unchanged + "）（未实际写入）");
    } else {
      console.log("  共 " + total + " 个文件（未实际写入）");
    }
  } else {
    console.log("  ✔ 完成!");
    if (incremental) {
      console.log("    新增: " + created + " 个文件");
      console.log("    更新: " + updated + " 个文件");
      console.log("    未变: " + unchanged + " 个文件");
      if (oldManifest && oldManifest.version !== PKG.version) {
        console.log("    版本: " + oldManifest.version + " → " + PKG.version);
      }
    } else {
      console.log("    新增: " + created + " 个文件");
      console.log("    覆盖: " + updated + " 个文件");
      console.log("    总计: " + (created + updated) + " 个文件");
    }
  }
  console.log("");
}

// ─── 命令: clean ────────────────────────────────────────────────────────

function runClean() {
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [clean]");
  console.log("  目标目录: " + TARGET_DIR);
  if (dryRun) console.log("  模式: --dry-run（预览）");
  console.log("");

  const manifest = readManifest();
  if (!manifest) {
    console.log("  ⚠ 未找到 " + MANIFEST_NAME);
    console.log("  请先执行 npx @agile-team/wl-skills-kit init 安装一次。");
    console.log("");
    process.exit(1);
  }

  const allFiles = Object.keys(manifest.files);
  const toRemove = allFiles.filter((f) => !isProtected(f));
  const toKeep = allFiles.filter((f) => isProtected(f));

  if (dryRun) {
    console.log("  将要删除（" + toRemove.length + " 个文件）:\n");
    for (const f of toRemove) {
      const exists = fs.existsSync(path.join(TARGET_DIR, f));
      console.log("  " + (exists ? "删除" : "跳过(不存在)") + "  " + f);
    }
    console.log("\n  保留（" + toKeep.length + " 个文件）:\n");
    for (const f of toKeep) {
      console.log("  保留  " + f);
    }
  } else {
    let removed = 0, skipped = 0;
    for (const f of toRemove) {
      const fullPath = path.join(TARGET_DIR, f);
      if (fs.existsSync(fullPath)) {
        removeFileAndEmptyParents(fullPath);
        removed++;
      } else {
        skipped++;
      }
    }
    // 删除 manifest 自身
    if (fs.existsSync(MANIFEST_PATH)) fs.unlinkSync(MANIFEST_PATH);

    console.log("  ✔ 清理完成!");
    console.log("    删除: " + removed + " 个文件");
    if (skipped > 0) console.log("    跳过: " + skipped + " 个（已不存在）");
    console.log("    保留: " + toKeep.length + " 个文件（src/components/ + src/types/）");
  }
  console.log("");
}

// ─── 主路由 ─────────────────────────────────────────────────────────────

switch (command) {
  case "init":   runInstall(false); break;
  case "update": runInstall(true);  break;
  case "clean":  runClean();        break;
  default:
    console.error('  ✖ 未知命令: "' + command + '"，请使用 --help 查看可用命令');
    process.exit(1);
}

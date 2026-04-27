#!/usr/bin/env node

/**
 * wl-skills-kit CLI v2.1.5
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
const keepReports = args.includes("--keep-reports");
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
    --dry-run        预览模式，不实际写入/删除任何文件
    --keep-reports   clean 命令保留 .github/reports/（默认一起删除）
    --help           显示帮助

  示例:
    npx @agile-team/wl-skills-kit                       安装全量文件
    npx @agile-team/wl-skills-kit update                仅更新有变化的文件
    npx @agile-team/wl-skills-kit clean                 清理开发期文件
    npx @agile-team/wl-skills-kit clean --keep-reports  保留 reports/中的菜单/字典数据
    npx @agile-team/wl-skills-kit clean --dry-run       预览将要清理哪些文件

  保护路径（init / update 不覆盖已存在的）:
    .github/reports/                               AI 生成报告（团队累积数据，存在则跳过）
    .github/skills/sync/menu-sync/env/env.local.json  用户本地配置（token 等，已存在则跳过）

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
      } else {
        break;
      }
    } catch (e) {
      break;
    }
  }
}

/** 读取 manifest */
function readManifest() {
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    } catch (e) {
      return null;
    }
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

// reports/ 中的 AI 生成报告：init/update 遇到已存在不覆盖（团队累积数据）
function isReportFile(relPath) {
  return relPath.startsWith(".github/reports/") && relPath.endsWith(".md");
}

// 用户本地配置：init/update 遇到已存在不覆盖（含 token / gatewayPath 等敏感信息）
const USER_LOCAL_CONFIGS = [
  ".github/skills/sync/menu-sync/env/env.local.json",
];
function isUserLocalConfig(relPath) {
  return USER_LOCAL_CONFIGS.includes(relPath);
}

// ─── 旧版遗留路径（v1.x/v2.0 → v2.1 迁移清理）───────────────────────────
// update 时自动检测并移除，避免旧结构与新结构并存产生歧义。
const LEGACY_PATHS = [
  // Skill 目录重组：flat → core/sync/ops 分级（v2.1）
  ".github/skills/prototype-scan/SKILL.md",
  ".github/skills/api-contract/SKILL.md",
  ".github/skills/page-codegen/SKILL.md",
  ".github/skills/page-codegen/TPL-LIST.md",
  ".github/skills/page-codegen/TPL-MASTER-DETAIL.md",
  ".github/skills/page-codegen/TPL-TREE-LIST.md",
  ".github/skills/page-codegen/TPL-DETAIL-TABS.md",
  ".github/skills/page-codegen/TPL-FORM-ROUTE.md",
  ".github/skills/page-codegen/TPL-CHANGE-HISTORY.md",
  ".github/skills/page-codegen/TPL-RECORD-FORM.md",
  ".github/skills/page-codegen/TPL-DRIVEN.md",
  ".github/skills/page-codegen/TPL-OPERATION-STATION.md",
  ".github/skills/menu-sync/SKILL.md",
  ".github/skills/menu-sync/env/env.local.json",
  ".github/skills/menu-sync/env/guide.md",
  ".github/skills/convention-extract/SKILL.md", // 已更名为 convention-audit
  // docs/ 废弃文件：内容已迁移至 guides/ 或 reports/（v2.0）
  ".github/docs/menu-sync-design.md",
  ".github/docs/use-skill.md",
  ".github/docs/wl-skills-kit.md",
  ".github/docs/SYS_MENU_INFO.md", // 已迁移至 reports/
  // _compat/ 旧说明文件（v2.0 → v2.1 重构为可执行配置层）
  ".github/skills/_compat/ai-model-matrix.md",
  ".github/skills/_compat/editor-setup.md",
];

// ─── 编辑器配置生成（从 _compat/editors.json 读取，特化 frontmatter 注入）─────

const AUTO_HEADER_NOTE =
  "<!-- 由 @agile-team/wl-skills-kit 自动生成。源文件：.github/copilot-instructions.md -->\n" +
  "<!-- 请勿手动编辑本文件，更新时重新执行：npx @agile-team/wl-skills-kit@latest update -->\n\n";

function getEditorConfigs(raw) {
  const editorsJsonPath = path.join(
    FILES_DIR,
    ".github",
    "skills",
    "_compat",
    "editors.json",
  );
  const headersDir = path.join(
    FILES_DIR,
    ".github",
    "skills",
    "_compat",
    "headers",
  );

  if (!fs.existsSync(editorsJsonPath)) {
    console.warn("  ⚠ _compat/editors.json 不存在，跳过多 AI 编辑器配置生成");
    return [];
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(editorsJsonPath, "utf8"));
  } catch (e) {
    console.warn("  ⚠ _compat/editors.json 解析失败：" + e.message);
    return [];
  }

  const configs = [];
  for (const editor of registry.editors || []) {
    if (editor.enabled === false) continue;
    // GitHub Copilot 直接使用 .github/copilot-instructions.md，不重复生成
    if (editor.outputPath === ".github/copilot-instructions.md") continue;

    const headerPath = path.join(headersDir, editor.headerFile);
    let header = "";
    if (fs.existsSync(headerPath)) {
      header = fs.readFileSync(headerPath, "utf8");
    }
    configs.push([editor.outputPath, header + AUTO_HEADER_NOTE + raw]);
  }
  return configs;
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
  let created = 0,
    updated = 0,
    unchanged = 0,
    preserved = 0;

  // ── Step 1: 复制 files/ 静态文件 ───────────────────

  const files = walkDir(FILES_DIR, FILES_DIR);
  if (dryRun) console.log("  [Step 1] files/ 静态文件:\n");

  for (const relPath of files) {
    const src = path.join(FILES_DIR, relPath);
    const dest = path.join(TARGET_DIR, relPath);
    const srcHash = fileMd5(src);
    newManifest.files[relPath] = srcHash;

    // reports/ 下的报告文件：已存在则跳过（保护团队累积数据）
    if (isReportFile(relPath) && fs.existsSync(dest)) {
      preserved++;
      if (dryRun) console.log("  保留  " + relPath + "  (reports/ 已存在)");
      continue;
    }

    // 用户本地配置：已存在则跳过（含 token / gatewayPath 等敏感信息，不覆盖）
    if (isUserLocalConfig(relPath) && fs.existsSync(dest)) {
      preserved++;
      if (dryRun) console.log("  保留  " + relPath + "  (用户本地配置，不覆盖)");
      continue;
    }

    // update 模式: 跳过内容相同的文件
    if (incremental && fs.existsSync(dest)) {
      if (srcHash === fileMd5(dest)) {
        unchanged++;
        continue;
      }
    }

    if (dryRun) {
      const exists = fs.existsSync(dest);
      console.log("  " + (exists ? "覆盖" : "新增") + "  " + relPath);
      exists ? updated++ : created++;
    } else {
      copyFileSafe(src, dest) === "created" ? created++ : updated++;
    }
  }

  // ── Step 1.5: .gitignore 安全修补（防止 env.local.json 意外入 git）────────

  const ENV_LOCAL_GITIGNORE_ENTRY =
    ".github/skills/sync/menu-sync/env/env.local.json";
  const gitignorePath = path.join(TARGET_DIR, ".gitignore");
  if (!dryRun && fs.existsSync(gitignorePath)) {
    const giContent = fs.readFileSync(gitignorePath, "utf8");
    if (!giContent.includes(ENV_LOCAL_GITIGNORE_ENTRY)) {
      fs.appendFileSync(
        gitignorePath,
        "\n# wl-skills-kit: 本地敏感配置（token / gatewayPath，不入 git）\n" +
          ENV_LOCAL_GITIGNORE_ENTRY +
          "\n",
      );
      console.log("  ✔ .gitignore 已追加 env.local.json 保护条目");
    }
  }

  // ── Step 2: 动态生成编辑器配置文件 ────────────────────────────────

  const INSTRUCTIONS_SRC = path.join(
    FILES_DIR,
    ".github",
    "copilot-instructions.md",
  );
  if (fs.existsSync(INSTRUCTIONS_SRC)) {
    const raw = fs.readFileSync(INSTRUCTIONS_SRC, "utf8");
    const editorConfigs = getEditorConfigs(raw);

    if (dryRun) {
      console.log(
        "\n  [Step 2] 编辑器配置文件（从 copilot-instructions.md 生成）:\n",
      );
    }

    for (const [ecPath, ecContent] of editorConfigs) {
      const ecDest = path.join(TARGET_DIR, ecPath);
      const ecHash = contentMd5(ecContent);
      newManifest.files[ecPath] = ecHash;

      if (incremental && fs.existsSync(ecDest)) {
        if (ecHash === fileMd5(ecDest)) {
          unchanged++;
          continue;
        }
      }

      if (dryRun) {
        const ecExists = fs.existsSync(ecDest);
        console.log(
          "  " + (ecExists ? "覆盖" : "新增") + "  [编辑器] " + ecPath,
        );
        ecExists ? updated++ : created++;
      } else {
        writeFile(ecDest, ecContent) === "created" ? created++ : updated++;
      }
    }
  }

  // ── Step 3: 迁移清理（仅 update，清理旧版遗留文件）──────────────────

  if (incremental) {
    let migrated = 0;
    if (dryRun) console.log("\n  [Step 3] 旧版遗留文件检查（迁移清理）:\n");
    for (const legacyRel of LEGACY_PATHS) {
      const legacyFull = path.join(TARGET_DIR, legacyRel);
      if (fs.existsSync(legacyFull)) {
        if (dryRun) {
          console.log("  迁移清理  " + legacyRel + "  (旧版遗留，将被移除)");
        } else {
          removeFileAndEmptyParents(legacyFull);
        }
        migrated++;
      }
    }
    if (!dryRun && migrated > 0) {
      console.log(
        "    迁移: " + migrated + " 个旧版文件已移除（路径已变更，见 CHANGELOG.md）",
      );
    }
    if (dryRun && migrated === 0) {
      console.log("  （无旧版遗留文件）");
    }
  }

  // ── Step 4: 写 manifest ────────────────────────────────────────────

  if (!dryRun) writeManifest(newManifest);

  // ── 输出统计 ──────────────────────────────────────────────────────

  const total = created + updated + unchanged;
  if (dryRun) {
    console.log("");
    if (incremental) {
      console.log(
        "  共 " +
          total +
          " 个文件（新增 " +
          created +
          "，变更 " +
          updated +
          "，未变 " +
          unchanged +
          "）（未实际写入）",
      );
    } else {
      console.log("  共 " + total + " 个文件（未实际写入）");
    }
  } else {
    console.log("  ✔ 完成!");
    if (incremental) {
      console.log("    新增: " + created + " 个文件");
      console.log("    更新: " + updated + " 个文件");
      console.log("    未变: " + unchanged + " 个文件");
      if (preserved > 0)
        console.log(
          "    保留: " + preserved + " 个 reports/ 文件（团队累积数据不覆盖）",
        );
      if (oldManifest && oldManifest.version !== PKG.version) {
        console.log("    版本: " + oldManifest.version + " → " + PKG.version);
      }
    } else {
      console.log("    新增: " + created + " 个文件");
      console.log("    覆盖: " + updated + " 个文件");
      if (preserved > 0)
        console.log(
          "    保留: " + preserved + " 个 reports/ 文件（团队累积数据不覆盖）",
        );
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
  const toRemove = allFiles.filter((f) => {
    if (isProtected(f)) return false;
    if (keepReports && f.startsWith(".github/reports/")) return false;
    return true;
  });
  const toKeep = allFiles.filter((f) => {
    if (isProtected(f)) return true;
    if (keepReports && f.startsWith(".github/reports/")) return true;
    return false;
  });

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
    let removed = 0,
      skipped = 0;
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
    if (keepReports) {
      console.log(
        "    保留: " +
          toKeep.length +
          " 个文件（src/components/ + src/types/ + .github/reports/）",
      );
    } else {
      console.log(
        "    保留: " +
          toKeep.length +
          " 个文件（src/components/ + src/types/）",
      );
    }
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

#!/usr/bin/env node

/**
 * wl-skills-kit CLI v2.6.0
 *
 * 命令:
 *   init      全量安装（默认，向后兼容）
 *   update    增量更新（仅覆盖有变化的文件，展示 diff 摘要）
 *   clean     构建清理（移除 AI 指令/文档/样例，保留组件和类型）
 *   check     环境预检（工具链 / MCP 配置 / manifest）
 *   diff      对比已安装文件与当前 kit 版本
 *   validate  静态检查 src/views 页面文件完整性、AGGrid、skills-ui runtime、mock
 *   validate-page validate 的别名，适用于单页/目录检查
 *   doctor-ui 检查 @agile-team/wk-skills-ui 接入完整性
 *   export    导出 SYS_MENU / SYS_DICT / SYS_PERMISSION 为 xlsx
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
const force = args.includes("--force");
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
    check      环境预检（Node / 工具链 / MCP 配置 / manifest）
    diff       对比已安装文件与当前 kit 版本的差异
    validate   静态检查 src/views 页面文件、AGGrid、skills-ui runtime、mock
    validate-page validate 的别名，适用于单页/目录检查
    doctor-ui  检查 @agile-team/wk-skills-ui 接入完整性
    export     导出 reports/SYS_* 数据为 xlsx

  选项:
    --dry-run        预览模式，不实际写入/删除任何文件
    --keep-reports   clean 命令保留 .github/reports/（默认一起删除）
    --force          强制执行，跳过同版本检测（忽略已安装状态）
    --help           显示帮助

  示例:
    npx @agile-team/wl-skills-kit                       安装全量文件
    npx @agile-team/wl-skills-kit update                仅更新有变化的文件
    npx @agile-team/wl-skills-kit update --force        强制更新（忽略同版本检测）
    npx @agile-team/wl-skills-kit check                 检查本地环境
    npx @agile-team/wl-skills-kit diff                  查看当前项目与最新 kit 差异
    npx @agile-team/wl-skills-kit validate              检查 src/views 页面文件
    npx @agile-team/wl-skills-kit validate-page src/views/mdata/model/demo
    npx @agile-team/wl-skills-kit doctor-ui             检查 wk-skills-ui 接入
    npx @agile-team/wl-skills-kit export                导出菜单/字典/权限 xlsx
    npx @agile-team/wl-skills-kit clean                 清理开发期文件
    npx @agile-team/wl-skills-kit clean --keep-reports  保留 reports/中的菜单/字典数据
    npx @agile-team/wl-skills-kit clean --dry-run       预览将要清理哪些文件

  保护路径（init / update 不覆盖已存在的）:
    .github/reports/   AI 生成报告（团队累积数据，存在则跳过）

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
    } catch {
      break;
    }
  }
}

/** 读取 manifest */
function readManifest() {
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    } catch {
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
  if (force) console.log("  模式: --force（强制执行）");
  console.log("");

  if (!fs.existsSync(FILES_DIR)) {
    console.error("  ✖ files/ 目录不存在，包可能已损坏");
    process.exit(1);
  }

  const oldManifest = readManifest();

  // ── 版本去重：同版本跳过，不同版本自动增量更新 ──────────────────────
  if (oldManifest && !force) {
    if (oldManifest.version === PKG.version) {
      console.log("  ✔ 当前项目已安装 v" + PKG.version + "，无需重复操作");
      console.log(
        "    如需强制重装：npx @agile-team/wl-skills-kit@latest " +
          label +
          " --force",
      );
      console.log("");
      return;
    }
    if (!incremental) {
      // init 命令但已有旧版本 → 自动切换为增量更新，避免全量覆盖
      console.log(
        "  ℹ 检测到已安装 v" + oldManifest.version + "，自动切换为增量更新模式",
      );
      console.log("");
      incremental = true;
    }
  }
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
      if (exists) updated++;
      else created++;
    } else {
      if (copyFileSafe(src, dest) === "created") created++;
      else updated++;
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
        if (ecExists) updated++;
        else created++;
      } else {
        if (writeFile(ecDest, ecContent) === "created") created++;
        else updated++;
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
        "    迁移: " +
          migrated +
          " 个旧版文件已移除（路径已变更，见 CHANGELOG.md）",
      );
    }
    if (dryRun && migrated === 0) {
      console.log("  （无旧版遗留文件）");
    }
  }

  // ── Step 4: 写 manifest ────────────────────────────────────────────

  if (!dryRun) writeManifest(newManifest);

  // ── Step 5: 非耦合桥接提醒（不自动安装 wk-skills-ui）───────────────────────

  const targetPkgPath = path.join(TARGET_DIR, "package.json");
  let hasUiPackage = false;
  if (fs.existsSync(targetPkgPath)) {
    try {
      const targetPkg = JSON.parse(fs.readFileSync(targetPkgPath, "utf8"));
      const deps = { ...targetPkg.dependencies, ...targetPkg.devDependencies };
      hasUiPackage = Boolean(deps["@agile-team/wk-skills-ui"]);
    } catch {
      hasUiPackage = false;
    }
  }

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
  if (hasUiPackage) {
    console.log(
      "  ℹ 检测到 @agile-team/wk-skills-ui：两包独立分工，可组合触发 UI 风格对齐流程。",
    );
  } else {
    console.log(
      "  ℹ 可选桥接：如需统一 UI 风格/老项目化妆层，可安装 @agile-team/wk-skills-ui。",
    );
  }
  console.log(
    "  ℹ 规范插件：建议执行 npx @robot-admin/git-standards init 接入代码质量与提交规范。",
  );
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

function expectedManifestFiles() {
  const expected = {};
  const files = walkDir(FILES_DIR, FILES_DIR);
  for (const relPath of files) {
    expected[relPath] = fileMd5(path.join(FILES_DIR, relPath));
  }
  const instructionsSrc = path.join(
    FILES_DIR,
    ".github",
    "copilot-instructions.md",
  );
  if (fs.existsSync(instructionsSrc)) {
    const raw = fs.readFileSync(instructionsSrc, "utf8");
    for (const [ecPath, ecContent] of getEditorConfigs(raw)) {
      expected[ecPath] = contentMd5(ecContent);
    }
  }
  return expected;
}

function statusIcon(ok) {
  return ok ? "✔" : "✖";
}

function runCheck() {
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [check]");
  console.log("  目标目录: " + TARGET_DIR);
  console.log("");

  const checks = [];
  function add(name, ok, detail) {
    checks.push({ name, ok, detail });
  }

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  add("Node 版本", nodeMajor >= 16, process.versions.node + "（要求 >=16）");

  const toolFiles = [".prettierrc.js", "eslint.config.ts", ".husky"];
  for (const rel of toolFiles) {
    add(
      rel,
      fs.existsSync(path.join(TARGET_DIR, rel)),
      fs.existsSync(path.join(TARGET_DIR, rel)) ? "存在" : "缺失",
    );
  }

  const manifest = readManifest();
  add(
    MANIFEST_NAME,
    Boolean(manifest),
    manifest ? "已安装 v" + manifest.version : "未安装",
  );

  const envPath = path.join(
    TARGET_DIR,
    ".github",
    "skills",
    "sync",
    "env.local.json",
  );
  let envOk = false;
  let envDetail = "缺失";
  if (fs.existsSync(envPath)) {
    try {
      const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
      const gatewayOk =
        env.gatewayPath && !String(env.gatewayPath).includes("你的网关");
      const tokenOk = env.token && !String(env.token).includes("Bearer Token");
      envOk = Boolean(gatewayOk && tokenOk);
      envDetail = envOk ? "已填写 gatewayPath/token" : "存在但仍含占位值";
    } catch (e) {
      envDetail = "JSON 解析失败：" + e.message;
    }
  }
  add("MCP env.local.json", envOk, envDetail);

  const mcpServer = path.join(
    TARGET_DIR,
    "node_modules",
    "@agile-team",
    "wl-skills-kit",
    "mcp",
    "server.js",
  );
  add(
    "MCP server",
    fs.existsSync(mcpServer) ||
      fs.existsSync(path.join(__dirname, "..", "mcp", "server.js")),
    "server.js 可发现",
  );

  for (const item of checks) {
    console.log(
      "  " + statusIcon(item.ok) + " " + item.name + " — " + item.detail,
    );
  }
  const failed = checks.filter((item) => !item.ok).length;
  console.log("");
  console.log(
    failed === 0
      ? "  ✔ 环境预检通过"
      : "  ⚠ 环境预检完成，发现 " + failed + " 项需处理",
  );
  console.log("");
  if (failed > 0) process.exitCode = 1;
}

function runDiff() {
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [diff]");
  console.log("  目标目录: " + TARGET_DIR);
  console.log("");

  const manifest = readManifest();
  const expected = expectedManifestFiles();
  const current = manifest && manifest.files ? manifest.files : {};
  const added = [];
  const changed = [];
  const removed = [];
  const same = [];

  for (const relPath of Object.keys(expected).sort()) {
    const target = path.join(TARGET_DIR, relPath);
    if (!fs.existsSync(target)) {
      added.push(relPath);
    } else if (fileMd5(target) !== expected[relPath]) {
      changed.push(relPath);
    } else {
      same.push(relPath);
    }
  }

  for (const relPath of Object.keys(current).sort()) {
    if (!expected[relPath] && fs.existsSync(path.join(TARGET_DIR, relPath))) {
      removed.push(relPath);
    }
  }

  console.log(
    "  当前 manifest: " + (manifest ? "v" + manifest.version : "未找到"),
  );
  console.log("  最新 kit: v" + PKG.version);
  console.log("  新增/缺失: " + added.length);
  console.log("  内容不同: " + changed.length);
  console.log("  旧版残留: " + removed.length);
  console.log("  相同: " + same.length);
  console.log("");

  function printGroup(title, list) {
    if (list.length === 0) return;
    console.log("  " + title + "：");
    for (const relPath of list.slice(0, 80)) console.log("    - " + relPath);
    if (list.length > 80)
      console.log("    ... 还有 " + (list.length - 80) + " 项");
    console.log("");
  }

  printGroup("新增/缺失（update 会写入）", added);
  printGroup("内容不同（update 会覆盖，reports 除外）", changed);
  printGroup("旧版残留（update 会迁移清理）", removed);
}

function scanPageDirs(scanRel) {
  const scanDir = path.join(TARGET_DIR, scanRel || "src/views");
  if (!fs.existsSync(scanDir)) return [];
  const files = walkDir(scanDir, TARGET_DIR);
  const dirs = new Map();
  for (const rel of files) {
    const dir = path.dirname(rel).replace(/\\/g, "/");
    const name = path.basename(rel);
    if (!dirs.has(dir)) dirs.set(dir, new Set());
    dirs.get(dir).add(name);
  }
  const pages = [];
  for (const [dir, names] of dirs.entries()) {
    if (!names.has("index.vue")) continue;
    const indexPath = path.join(TARGET_DIR, dir, "index.vue");
    const indexContent = fs.existsSync(indexPath)
      ? fs.readFileSync(indexPath, "utf8")
      : "";
    const dataPath = path.join(TARGET_DIR, dir, "data.ts");
    const dataContent = fs.existsSync(dataPath)
      ? fs.readFileSync(dataPath, "utf8")
      : "";
    let apiConfigCount = 0;
    if (dataContent)
      apiConfigCount = (dataContent.match(/API_CONFIG/g) || []).length;
    pages.push({
      dir,
      hasDataTs: names.has("data.ts"),
      hasIndexScss: names.has("index.scss"),
      hasApiMd: names.has("api.md"),
      apiConfigCount,
      baseTableCount: (indexContent.match(/<BaseTable\b/g) || []).length,
      agGridCount: (indexContent.match(/render-type=["']agGrid["']/g) || [])
        .length,
      cidBindCount: (indexContent.match(/\bcid=|:cid=/g) || []).length,
      hasDefineColumns: /defineColumns\s*\(/.test(dataContent),
      hasRenderOps: /renderOps\s*\(/.test(dataContent),
      hasOperationsArray: /operations\s*:/.test(dataContent),
      hasEmptyOnClick: /onClick\s*:\s*\(\s*[^)]*\s*\)\s*=>\s*\{\s*\}/.test(
        dataContent,
      ),
      apiUrls: Array.from(
        dataContent.matchAll(/:\s*["']([^"']+\/[^"']+)["']/g),
      ).map((m) => m[1]),
    });
  }
  return pages.sort((a, b) => a.dir.localeCompare(b.dir));
}

function findMockFiles() {
  const mockDir = path.join(TARGET_DIR, "mock");
  if (!fs.existsSync(mockDir)) return [];
  return walkDir(mockDir, TARGET_DIR).filter((rel) => /\.(ts|js)$/.test(rel));
}

function runValidate() {
  const scanPath =
    args.find((a) => !a.startsWith("-") && a !== command) || "src/views";
  const pages = scanPageDirs(scanPath);
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [" + command + "]");
  console.log("  扫描目录: " + scanPath);
  console.log("");

  if (pages.length === 0) {
    console.log("  ⚠ 未发现包含 index.vue 的页面目录");
    console.log("");
    process.exitCode = 1;
    return;
  }

  const issues = [];
  const mockFiles = findMockFiles();
  const mockContent = mockFiles
    .map((rel) => fs.readFileSync(path.join(TARGET_DIR, rel), "utf8"))
    .join("\n");
  for (const page of pages) {
    if (!page.hasDataTs)
      issues.push({
        level: "warn",
        dir: page.dir,
        text: "缺 data.ts（需结合页面复杂度判断）",
      });
    if (!page.hasIndexScss)
      issues.push({ level: "warn", dir: page.dir, text: "缺 index.scss" });
    if (page.apiConfigCount > 0 && !page.hasApiMd)
      issues.push({
        level: "warn",
        dir: page.dir,
        text: "检测到 API_CONFIG 但缺 api.md",
      });
    if (page.baseTableCount > 0 && page.agGridCount < page.baseTableCount)
      issues.push({
        level: "error",
        dir: page.dir,
        text: 'BaseTable 必须显式 render-type="agGrid"',
      });
    if (page.baseTableCount > 0 && page.cidBindCount < page.baseTableCount)
      issues.push({
        level: "error",
        dir: page.dir,
        text: "BaseTable 必须配置全局唯一 cid / :cid",
      });
    if (page.hasDataTs && page.baseTableCount > 0 && !page.hasDefineColumns)
      issues.push({
        level: "error",
        dir: page.dir,
        text: "表格列必须使用 wk-skills-ui defineColumns()",
      });
    if (page.hasOperationsArray)
      issues.push({
        level: "error",
        dir: page.dir,
        text: "操作列禁止 operations 数组，必须使用 defaultSlot + renderOps()",
      });
    if (
      page.hasDataTs &&
      page.baseTableCount > 0 &&
      !page.hasRenderOps &&
      /操作|_action/.test(
        fs.readFileSync(path.join(TARGET_DIR, page.dir, "data.ts"), "utf8"),
      )
    )
      issues.push({
        level: "warn",
        dir: page.dir,
        text: "疑似存在操作列但未使用 renderOps()",
      });
    if (page.hasEmptyOnClick)
      issues.push({
        level: "error",
        dir: page.dir,
        text: "存在空 onClick: () => {}",
      });
    if (page.apiConfigCount > 0 && mockFiles.length === 0)
      issues.push({
        level: "warn",
        dir: page.dir,
        text: "检测到 API_CONFIG 但项目 mock/ 目录无 mock 文件",
      });
    for (const url of page.apiUrls.filter((item) => item.startsWith("/"))) {
      const mockUrl = `/dev-api${url}`;
      if (mockContent && !mockContent.includes(mockUrl))
        issues.push({
          level: "warn",
          dir: page.dir,
          text: "mock 中未发现端点 " + mockUrl,
        });
    }
  }

  console.log("  页面目录: " + pages.length);
  console.log("  提示项: " + issues.length);
  console.log("");
  const errors = issues.filter((issue) => issue.level === "error").length;
  for (const issue of issues) {
    const icon = issue.level === "error" ? "✖" : "⚠";
    console.log("  " + icon + " " + issue.dir + " — " + issue.text);
  }
  if (issues.length === 0) console.log("  ✔ 页面文件完整性检查通过");
  console.log("");
  if (errors > 0 || issues.length > 0) process.exitCode = 1;
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function runDoctorUi() {
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [doctor-ui]");
  console.log("  目标目录: " + TARGET_DIR);
  console.log("");

  const checks = [];
  function add(name, ok, detail) {
    checks.push({ name, ok, detail });
  }

  const pkg = readJsonSafe(path.join(TARGET_DIR, "package.json"));
  const deps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};
  add(
    "@agile-team/wk-skills-ui",
    Boolean(deps["@agile-team/wk-skills-ui"]),
    deps["@agile-team/wk-skills-ui"] || "未安装",
  );
  add(
    "@element-plus/icons-vue",
    Boolean(deps["@element-plus/icons-vue"]),
    deps["@element-plus/icons-vue"] || "未安装",
  );

  const files = fs.existsSync(TARGET_DIR)
    ? walkDir(TARGET_DIR, TARGET_DIR)
    : [];
  const sourceFiles = files.filter(
    (rel) =>
      /\.(ts|vue|scss|html)$/.test(rel) && !rel.startsWith("node_modules/"),
  );
  const readAll = (pattern) =>
    sourceFiles
      .filter((rel) => pattern.test(rel))
      .map((rel) => fs.readFileSync(path.join(TARGET_DIR, rel), "utf8"))
      .join("\n");
  const allSource = readAll(/.*/);

  add(
    "design tokens",
    /@agile-team\/wk-skills-ui\/design\/tokens|dist\/tokens\.css/.test(
      allSource,
    ),
    "需引入 design tokens",
  );
  add(
    "styles preset",
    /@agile-team\/wk-skills-ui\/styles/.test(allSource),
    "需引入 styles 或 skin preset",
  );
  add(
    "installCommonPreset",
    /installCommonPreset\s*\(/.test(allSource),
    "需在入口或业务 preset 中调用",
  );
  add(
    "defineColumns",
    /defineColumns\s*\(/.test(allSource),
    "页面列定义需使用 defineColumns",
  );
  add("renderOps", /renderOps\s*\(/.test(allSource), "操作列需使用 renderOps");

  for (const item of checks) {
    console.log(
      "  " + statusIcon(item.ok) + " " + item.name + " — " + item.detail,
    );
  }
  const failed = checks.filter((item) => !item.ok).length;
  console.log("");
  console.log(
    failed === 0
      ? "  ✔ wk-skills-ui 接入检查通过"
      : "  ⚠ wk-skills-ui 接入仍有 " + failed + " 项需处理",
  );
  console.log("");
  if (failed > 0) process.exitCode = 1;
}

function parseMarkdownTable(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => /^\|.*\|$/.test(line) && !/^\|\s*-+/.test(line))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

function runExport() {
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [export]");
  console.log("  目标目录: " + TARGET_DIR);
  console.log("");

  const reportDir = path.join(TARGET_DIR, ".github", "reports");
  const files = [
    ["菜单", "SYS_MENU_INFO.md"],
    ["字典", "SYS_DICT_INFO.md"],
    ["权限", "SYS_PERMISSION_INFO.md"],
  ];
  const sheets = [];
  let addedSheets = 0;
  for (const [sheetName, fileName] of files) {
    const full = path.join(reportDir, fileName);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, "utf8");
    let rows = parseMarkdownTable(content);
    if (rows.length === 0)
      rows = content
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => [line]);
    sheets.push([sheetName, rows]);
    addedSheets++;
  }

  if (addedSheets === 0) {
    console.log("  ⚠ 未找到可导出的 SYS_* 报告");
    console.log("");
    process.exitCode = 1;
    return;
  }

  const outDir = path.join(reportDir, "exports");
  const outFile = path.join(outDir, "wl-skills-sys-export.xlsx");
  if (dryRun) {
    console.log("  将导出: " + outFile);
    console.log("  sheet 数: " + addedSheets);
  } else {
    let XLSX;
    try {
      XLSX = require("xlsx");
    } catch {
      console.error(
        "  ✖ 未找到 xlsx 依赖，请重新安装最新 @agile-team/wl-skills-kit",
      );
      process.exit(1);
    }
    const wb = XLSX.utils.book_new();
    for (const [sheetName, rows] of sheets) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(rows),
        sheetName,
      );
    }
    fs.mkdirSync(outDir, { recursive: true });
    XLSX.writeFile(wb, outFile);
    console.log("  ✔ 已导出: " + outFile);
    console.log("  sheet 数: " + addedSheets);
  }
  console.log("");
}

// ─── 主路由 ─────────────────────────────────────────────────────────────

switch (command) {
  case "init":
    runInstall(false);
    break;
  case "update":
    runInstall(true);
    break;
  case "clean":
    runClean();
    break;
  case "check":
    runCheck();
    break;
  case "diff":
    runDiff();
    break;
  case "validate":
  case "validate-page":
    runValidate();
    break;
  case "doctor-ui":
    runDoctorUi();
    break;
  case "export":
    runExport();
    break;
  default:
    console.error(
      '  ✖ 未知命令: "' + command + '"，请使用 --help 查看可用命令',
    );
    process.exit(1);
}

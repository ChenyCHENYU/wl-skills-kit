#!/usr/bin/env node

/**
 * wl-skills-kit CLI v2.13.1
 *
 * 命令:
 *   init      全量安装（默认，向后兼容）
 *   update    增量更新（仅覆盖有变化的文件，展示 diff 摘要）
 *   clean     构建清理（移除 AI 指令/文档/样例，保留组件和类型）
 *   check     环境预检（工具链 / MCP 配置 / manifest）
 *   diff      对比已安装文件与当前 kit 版本
 *   validate  静态检查 src/views 页面文件完整性、AGGrid、skills-ui runtime、mock
 *   validate-page validate 的别名，适用于单页/目录检查
 *   doctor-ui 检查 @agile-team/wl-skills-ui 接入完整性
 *   export    导出 SYS_MENU / SYS_DICT / SYS_PERMISSION 为 xlsx
 *   mock-clean 清理 mock 文件（按域或全部），保留 _utils.ts
 *   standard-env 标准环境配置扫描、迁移与验证
 *   --help    帮助
 *   --dry-run 预览模式（所有命令均支持）
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ─── AST 规则引擎（v2.10.1+，语义级约束检测）──────────────────────────
const {
  runAstRules,
  getStagedFiles,
  runTypeCheck,
} = require("../lib/ast-rules");

// ─── page-spec 比对引擎（v2.11.1+，"约定 vs 代码"确定性核对）────────────
const { alignPage } = require("../lib/page-spec");
const { validateContractAlignment } = require("../lib/dict-contract");

// ─── 安全修复引擎（v2.11.1+，确定性机械修复 F1~F5）────────────────────────
const { runSafeFix } = require("../lib/safe-fix");
const {
  applyStandardEnv,
  formatStandardEnvResult,
  planStandardEnv,
  scanStandardEnv,
  verifyStandardEnv,
} = require("../lib/standard-env");
const { resolveProfile: resolveStandardEnvProfile } = require("../lib/standard-env/profiles");
const {
  DEFAULT_PROFILE: DEFAULT_DELIVERY_PROFILE,
  buildStandaloneContract,
  compareApiContracts,
  readApiContract,
  renderApiMarkdown,
  validateApiContract,
} = require("../lib/api-contract");

const FILES_DIR = path.resolve(__dirname, "..", "files");
const TARGET_DIR = process.cwd();
const MANIFEST_NAME = ".wl-skills-manifest.json";
const MANIFEST_PATH = path.join(TARGET_DIR, MANIFEST_NAME);
const LOCAL_SYNC_CONFIG = ".wl-skills/skills/sync/env.local.json";
const EXAMPLE_SYNC_CONFIG = ".wl-skills/skills/sync/env.example.json";
const PKG = require("../package.json");
const args = process.argv.slice(2);

// ─── 已知命令 / 选项白名单（A1: 防止未知 flag 默认走 init 误装）──────────
const KNOWN_COMMANDS = new Set([
  "init",
  "update",
  "clean",
  "check",
  "diff",
  "validate",
  "validate-page",
  "doctor-ui",
  "export",
  "mock-clean",
  "fix",
  "env",
  "standard-env",
  "contract",
]);
const KNOWN_FLAGS = new Set([
  "--dry-run",
  "--keep-reports",
  "--force",
  "--help",
  "-h",
  "--domain",
  "--all",
  "--pre-commit",
  "--strict",
  "--typecheck",
  "--profile",
  "--profile-file",
  "--project-type",
  "--prod-prefix",
  "--no-migrate-vite",
  "--apply",
  "--confirm",
  "--module-name",
  "--local-api",
  "--local-public",
  "--local-mode",
  "--local-routes",
  "--build",
  "--input",
  "--output",
  "--left",
  "--right",
  "--service",
  "--resource",
  "--module",
  "--contract-id",
  "--permission-prefix",
  "--entity",
  "--description",
  "--external-id",
  "--source-mode",
  "--json",
]);

const dryRun = args.includes("--dry-run");
const showHelp = args.includes("--help") || args.includes("-h");
const keepReports = args.includes("--keep-reports");
const force = args.includes("--force");
const preCommit = args.includes("--pre-commit");
const strict = args.includes("--strict");
const typeCheck = args.includes("--typecheck");

function readOption(name, fallback = "") {
  const flag = name.startsWith("--") ? name : "--" + name;
  const arg = args.find((item) => item === flag || item.startsWith(flag + "="));
  if (!arg) return fallback;
  if (arg.includes("=")) return arg.slice(arg.indexOf("=") + 1);
  const idx = args.indexOf(arg);
  const value = args[idx + 1];
  return value && !value.startsWith("-") ? value : fallback;
}

// 校验所有 flag 是否已知（--help 优先，跳过校验直接显示帮助）
if (!showHelp) {
  const unknownFlags = args.filter(
    (a) =>
      a.startsWith("-") &&
      !KNOWN_FLAGS.has(a) &&
      !KNOWN_FLAGS.has(a.split("=")[0]),
  );
  if (unknownFlags.length > 0) {
    console.error("");
    console.error("  ✖ 未知选项: " + unknownFlags.join(", "));
    console.error("  请使用 --help 查看可用选项");
    console.error("");
    process.exit(1);
  }
}

const positional = args.filter((a) => !a.startsWith("-"));
const command = positional[0] || "init";

// 校验主命令是否已知（--help 时跳过；空命令默认 init）
if (!showHelp && !KNOWN_COMMANDS.has(command)) {
  console.error("");
  console.error('  ✖ 未知命令: "' + command + '"');
  console.error("  请使用 --help 查看可用命令");
  console.error("");
  process.exit(1);
}

if (showHelp) {
  console.log(`
  wl-skills-kit v${PKG.version} — AI Skill 模板包

  用法:
    pnpm dlx @agile-team/wl-skills-kit [命令] [选项]

  命令:
    init       全量安装模板文件到当前项目（默认）
    update     增量更新（仅覆盖有变化的文件，展示变更摘要）
    clean      构建清理（移除开发期 AI 文件，保留 src/components + src/types）
    check      环境预检（Node / 工具链 / MCP 配置 / manifest）
    diff       对比已安装文件与当前 kit 版本的差异
    validate   静态检查 src/views 页面文件、AGGrid、skills-ui runtime、mock
               v2.10.1+ 集成 AST 语义级检测（R1~R14），覆盖正则无法检测的规则
               R13 圈复杂度 / R14 类型错误（R14 需 --typecheck 开启）
    validate-page validate 的别名，适用于单页/目录检查
    doctor-ui  检查 @agile-team/wl-skills-ui 接入完整性
    export     导出 reports/SYS_* 数据为 xlsx
    mock-clean 清理 mock 文件（按域或全部），保留 _utils.ts
    fix        确定性机械修复（agGrid/:deep/未用 import 等），AI 无关
    standard-env 标准环境配置（scan/plan/apply/verify）
    contract   独立 API 契约（init/validate/compare/render/profile），不依赖 design 或 bd
    env        旧环境命令，已停用并提示迁移

  选项:
    --dry-run        预览模式，不实际写入/删除任何文件
    --keep-reports   clean 命令保留 .wl-skills/reports/（默认一起删除）
    --force          强制执行，跳过同版本检测（忽略已安装状态）
    --domain <name>  mock-clean 指定要清理的业务域（如 sale、mdata）
    --all            mock-clean 清理全部 mock（保留 _utils.ts）
    --pre-commit     validate 仅检测 git staged 文件，error 阻断提交，warn 仅提示
    --strict         validate 的 error 和 warn 都导致退出码 1（CI 用）
    --typecheck      validate 额外执行 vue-tsc/tsc --noEmit（R14 类型错误零容忍）
                     体积较大，CI / pre-push 必跑，pre-commit 不建议开启
    --profile <name> standard-env 使用的内置环境 Profile，如 walsin
    --profile-file   standard-env 使用自定义完整五环境 Profile JSON
    --module-name    模块标识；检测到历史冲突时必须明确指定
    --local-api      本地后端地址，默认 http://localhost:10010
    --local-public   本地 public 地址，默认 http://localhost:8002
    --local-mode     本地后端代理范围：all/module/routes
    --local-routes   routes 模式映射，格式 match=rewrite,...
    --confirm        standard-env apply 正式写入确认
    --build          standard-env verify 执行五环境临时构建
    --input <file>   contract validate/render 的输入 JSON
    --output <file>  contract init/render 输出路径
    --left/--right   contract compare 的前后端契约
    --confirm        contract init/render 确认写入；默认只预览
    --json           contract 命令输出机器可读结果
    --help           显示帮助

  示例:
    pnpm dlx @agile-team/wl-skills-kit                       安装全量文件
    pnpm dlx @agile-team/wl-skills-kit update                仅更新有变化的文件
    pnpm dlx @agile-team/wl-skills-kit update --force        强制更新（忽略同版本检测）
    pnpm dlx @agile-team/wl-skills-kit check                 检查本地环境
    pnpm dlx @agile-team/wl-skills-kit diff                  查看当前项目与最新 kit 差异
    pnpm dlx @agile-team/wl-skills-kit validate              检查 src/views 页面文件
    pnpm dlx @agile-team/wl-skills-kit validate --typecheck  含类型检查 R14（CI 用）
    pnpm dlx @agile-team/wl-skills-kit validate-page src/views/mdata/model/demo
    pnpm dlx @agile-team/wl-skills-kit doctor-ui             检查 wl-skills-ui 接入
    pnpm dlx @agile-team/wl-skills-kit export                导出菜单/字典/权限 xlsx
    pnpm dlx @agile-team/wl-skills-kit clean                 清理开发期文件
    pnpm dlx @agile-team/wl-skills-kit clean --keep-reports  保留 reports/中的菜单/字典数据
    pnpm dlx @agile-team/wl-skills-kit clean --dry-run       预览将要清理哪些文件
    pnpm dlx @agile-team/wl-skills-kit mock-clean --domain mdata  清理 mdata 域 mock
    pnpm dlx @agile-team/wl-skills-kit mock-clean --all           清理全部 mock
    pnpm dlx @agile-team/wl-skills-kit mock-clean --all --dry-run 预览将要清理的 mock 文件
    pnpm dlx @agile-team/wl-skills-kit standard-env scan
    pnpm dlx @agile-team/wl-skills-kit standard-env plan --profile walsin
    pnpm dlx @agile-team/wl-skills-kit standard-env apply --profile walsin --confirm
    pnpm dlx @agile-team/wl-skills-kit standard-env verify --profile walsin --build
    pnpm dlx @agile-team/wl-skills-kit contract init --contract-id task --service mdm --resource task --module task --permission-prefix mdm_task
    pnpm dlx @agile-team/wl-skills-kit contract validate --input wl-api-contract.json --strict --json
    pnpm dlx @agile-team/wl-skills-kit contract compare --left frontend-contract.json --right backend-contract.json --strict

  保护路径（init / update 不覆盖已存在的）:
    .wl-skills/reports/   AI 生成报告（团队累积数据，存在则跳过）

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

function ensureGitIgnoreEntry(root, entry) {
  const gitignorePath = path.join(root, ".gitignore");
  const existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : "";
  const lines = existing.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(entry)) return false;
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(gitignorePath, prefix + entry + "\n", "utf8");
  return true;
}

function ensureLocalSyncConfig(root) {
  const localPath = path.join(root, LOCAL_SYNC_CONFIG);
  const examplePath = path.join(root, EXAMPLE_SYNC_CONFIG);
  ensureGitIgnoreEntry(root, LOCAL_SYNC_CONFIG);
  if (fs.existsSync(localPath)) return "preserved";
  if (!fs.existsSync(examplePath)) throw new Error("缺少同步配置模板: " + examplePath);
  fs.copyFileSync(examplePath, localPath);
  return "created";
}

// 受保护路径（clean 不删除）
const PROTECTED_PREFIXES = ["src/components/", "src/types/", ".wl-skills/src/components/", ".wl-skills/src/types/"];
function isProtected(relPath) {
  return PROTECTED_PREFIXES.some((p) => relPath.startsWith(p));
}

// reports/ 中的 AI 生成报告：init/update 遇到已存在不覆盖（团队累积数据）
function isReportFile(relPath) {
  return (relPath.startsWith(".wl-skills/reports/") || relPath.startsWith(".github/reports/")) && relPath.endsWith(".md");
}

// ─── 旧版遗留路径（v1.x/v2.0 → v2.1 迁移清理）───────────────────────────
// update 时自动检测并移除，避免旧结构与新结构并存产生歧义。
const LEGACY_PATHS = [
  // v2.1: Skill 目录重组 flat → core/sync/ops
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
  ".github/skills/convention-extract/SKILL.md",
  ".github/docs/menu-sync-design.md",
  ".github/docs/use-skill.md",
  ".github/docs/wl-skills-kit.md",
  ".github/docs/SYS_MENU_INFO.md",
  ".github/skills/_compat/ai-model-matrix.md",
  ".github/skills/_compat/editor-setup.md",
  // v2.12.4: 旧环境 Skill 已由独立 standard-env-config 替代
  ".wl-skills/skills/ops/env-config/SKILL.md",
  ".wl-skills/skills/ops/env-config/USAGE.md",
];

// ─── v2.11 迁移：.github/ → .wl-skills/ 目录重构 ────────────────────────────
// update 时自动检测旧目录结构并清理
const LEGACY_DIR_PREFIXES = [
  ".github/skills/",
  ".github/standards/",
  ".github/guides/",
  ".github/reports/",
];

// ─── 编辑器配置生成（从 _compat/editors.json 读取，特化 frontmatter 注入）─────

const AUTO_HEADER_NOTE =
  "<!-- 由 @agile-team/wl-skills-kit 自动生成。薄壳入口 → .wl-skills/copilot-instructions-full.md -->\n" +
  "<!-- 请勿手动编辑本文件，更新时重新执行：pnpm dlx @agile-team/wl-skills-kit@latest update -->\n\n";

function getEditorConfigs(raw) {
  // v2.11+: _compat 目录已迁移到 .wl-skills/skills/_compat/
  const editorsJsonPath = path.join(
    FILES_DIR,
    ".wl-skills",
    "skills",
    "_compat",
    "editors.json",
  );
  const headersDir = path.join(
    FILES_DIR,
    ".wl-skills",
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

function printInstallHeader(label) {
  console.log("");
  console.log(`  wl-skills-kit v${PKG.version}  [${label}]`);
  console.log("  目标目录: " + TARGET_DIR);
  if (dryRun) console.log("  模式: --dry-run（预览）");
  if (force) console.log("  模式: --force（强制执行）");
  console.log("");
}

function ensureInstallInfrastructure() {
  if (dryRun) return;
  ensurePreCommitHook(TARGET_DIR);
  ensurePrePushHook(TARGET_DIR);
  ensureEslintConfig(TARGET_DIR);
}

function resolveInstallMode(oldManifest, incremental, label) {
  if (!oldManifest || force) return { incremental, skip: false };
  if (oldManifest.version === PKG.version) {
    console.log(`  ✔ 当前项目已安装 v${PKG.version}，无需重复操作`);
    console.log(`    如需强制重装：pnpm dlx @agile-team/wl-skills-kit@latest ${label} --force\n`);
    return { incremental, skip: true };
  }
  if (incremental) return { incremental, skip: false };
  console.log(`  ℹ 检测到已安装 v${oldManifest.version}，自动切换为增量更新模式\n`);
  return { incremental: true, skip: false };
}

function updateInstallCounter(stats, action) {
  stats[action]++;
}

function preserveInstalledReport(relPath, dest, stats) {
  if (!isReportFile(relPath) || !fs.existsSync(dest)) return false;
  updateInstallCounter(stats, "preserved");
  if (dryRun) console.log(`  保留  ${relPath}  (reports/ 已存在)`);
  return true;
}

function preserveUnchangedFile(context, dest, srcHash) {
  if (!context.incremental || !fs.existsSync(dest)) return false;
  if (srcHash !== fileMd5(dest)) return false;
  updateInstallCounter(context.stats, "unchanged");
  return true;
}

function installStaticFile(relPath, context) {
  if (relPath === "eslint.config.wl-skills.cjs") return;
  const src = path.join(FILES_DIR, relPath);
  const dest = path.join(TARGET_DIR, relPath);
  const srcHash = fileMd5(src);
  context.manifest.files[relPath] = srcHash;
  if (preserveInstalledReport(relPath, dest, context.stats)) return;
  if (preserveUnchangedFile(context, dest, srcHash)) return;
  if (!dryRun) {
    updateInstallCounter(context.stats, copyFileSafe(src, dest));
    return;
  }
  const action = fs.existsSync(dest) ? "updated" : "created";
  console.log(`  ${action === "updated" ? "覆盖" : "新增"}  ${relPath}`);
  updateInstallCounter(context.stats, action);
}

function installStaticFiles(context) {
  if (dryRun) console.log("  [Step 1] files/ 静态文件:\n");
  for (const relPath of walkDir(FILES_DIR, FILES_DIR)) {
    installStaticFile(relPath, context);
  }
}

function installEditorConfig(entry, context) {
  const [relPath, content] = entry;
  const dest = path.join(TARGET_DIR, relPath);
  const hash = contentMd5(content);
  context.manifest.files[relPath] = hash;
  if (context.incremental && fs.existsSync(dest) && hash === fileMd5(dest)) {
    updateInstallCounter(context.stats, "unchanged");
    return;
  }
  if (!dryRun) {
    updateInstallCounter(context.stats, writeFile(dest, content));
    return;
  }
  const action = fs.existsSync(dest) ? "updated" : "created";
  console.log(`  ${action === "updated" ? "覆盖" : "新增"}  [编辑器] ${relPath}`);
  updateInstallCounter(context.stats, action);
}

function installEditorConfigs(context) {
  const source = path.join(FILES_DIR, ".github", "copilot-instructions.md");
  if (!fs.existsSync(source)) return;
  if (dryRun) console.log("\n  [Step 2] 编辑器配置文件（从 copilot-instructions.md 生成）:\n");
  const raw = fs.readFileSync(source, "utf8");
  for (const entry of getEditorConfigs(raw)) installEditorConfig(entry, context);
}

function removeLegacyFile(filePath, label) {
  if (dryRun) console.log(`  迁移清理  ${label}`);
  else removeFileAndEmptyParents(filePath);
}

function migrateLegacyFiles(incremental) {
  if (!incremental) return;
  let migrated = 0;
  if (dryRun) console.log("\n  [Step 3] 旧版遗留文件检查（迁移清理）:\n");
  for (const relPath of LEGACY_PATHS) {
    const fullPath = path.join(TARGET_DIR, relPath);
    if (!fs.existsSync(fullPath)) continue;
    removeLegacyFile(fullPath, `${relPath}  (旧版遗留，将被移除)`);
    migrated++;
  }
  migrated += migrateLegacyDirectories();
  if (!dryRun && migrated > 0) {
    console.log(`    迁移: ${migrated} 个旧版文件已移除（路径已变更，见 CHANGELOG.md）`);
  }
  if (dryRun && migrated === 0) console.log("  （无旧版遗留文件）");
}

function migrateLegacyDirectories() {
  let migrated = 0;
  for (const prefix of LEGACY_DIR_PREFIXES) {
    const legacyDir = path.join(TARGET_DIR, prefix);
    if (!fs.existsSync(legacyDir)) continue;
    for (const relPath of walkDir(legacyDir, legacyDir)) {
      removeLegacyFile(path.join(legacyDir, relPath), `${prefix}${relPath}  (v2.11 目录重构)`);
      migrated++;
    }
    removeLegacyDirectory(legacyDir);
  }
  return migrated;
}

function removeLegacyDirectory(legacyDir) {
  if (dryRun || !fs.existsSync(legacyDir)) return;
  try {
    fs.rmSync(legacyDir, { recursive: true, force: true });
  } catch {}
}

function projectHasUiPackage() {
  const packagePath = path.join(TARGET_DIR, "package.json");
  if (!fs.existsSync(packagePath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Boolean(deps["@agile-team/wl-skills-ui"] || deps["@agile-team/wk-skills-ui"]);
  } catch {
    return false;
  }
}

function printInstallStats(context, oldManifest) {
  const { stats, incremental } = context;
  if (dryRun) return printDryRunInstallStats(stats, incremental);
  console.log("  ✔ 完成!");
  console.log(`    新增: ${stats.created} 个文件`);
  console.log(`    ${incremental ? "更新" : "覆盖"}: ${stats.updated} 个文件`);
  if (incremental) console.log(`    未变: ${stats.unchanged} 个文件`);
  if (stats.preserved > 0) {
    console.log(`    保留: ${stats.preserved} 个 reports/ 文件（团队累积数据不覆盖）`);
  }
  if (incremental && oldManifest && oldManifest.version !== PKG.version) {
    console.log(`    版本: ${oldManifest.version} → ${PKG.version}`);
  }
  if (!incremental) console.log(`    总计: ${stats.created + stats.updated} 个文件`);
}

function printDryRunInstallStats(stats, incremental) {
  const total = stats.created + stats.updated + stats.unchanged;
  console.log("");
  if (!incremental) {
    console.log(`  共 ${total} 个文件（未实际写入）`);
    return;
  }
  console.log(`  共 ${total} 个文件（新增 ${stats.created}，变更 ${stats.updated}，未变 ${stats.unchanged}）（未实际写入）`);
}

function printInstallBridge(hasUiPackage) {
  console.log("");
  console.log(
    hasUiPackage
      ? "  ℹ 检测到 @agile-team/wl-skills-ui：两包独立分工，可组合触发 UI 风格对齐流程。"
      : "  ℹ 可选桥接：如需统一 UI 风格/老项目化妆层，可安装 @agile-team/wl-skills-ui。",
  );
  console.log("  ℹ 规范插件：建议执行 pnpm dlx @robot-admin/git-standards init 接入代码质量与提交规范。\n");
}

function runInstall(incremental) {
  const label = incremental ? "update" : "init";
  printInstallHeader(label);
  if (!fs.existsSync(FILES_DIR)) {
    console.error("  ✖ files/ 目录不存在，包可能已损坏");
    process.exit(1);
  }
  const oldManifest = readManifest();
  ensureInstallInfrastructure();
  const mode = resolveInstallMode(oldManifest, incremental, label);
  if (mode.skip) return;
  const context = {
    incremental: mode.incremental,
    manifest: { version: PKG.version, files: {} },
    stats: { created: 0, updated: 0, unchanged: 0, preserved: 0 },
  };

  // ── Step 1: 复制 files/ 静态文件 ───────────────────
  installStaticFiles(context);

  // 本地凭据配置不进入 manifest：init 创建，update/clean 永不覆盖或删除。
  if (!dryRun) {
    const localConfigAction = ensureLocalSyncConfig(TARGET_DIR);
    console.log(
      "    本地配置: " + LOCAL_SYNC_CONFIG +
      (localConfigAction === "created" ? "（已从 example 创建）" : "（已保留）"),
    );
  }

  // ── Step 2: 动态生成编辑器配置文件 ────────────────────────────────
  installEditorConfigs(context);

  // ── Step 3: 迁移清理（仅 update，清理旧版遗留文件）──────────────────
  migrateLegacyFiles(context.incremental);

  // ── Step 4: 写 manifest ────────────────────────────────────────────

  if (!dryRun) writeManifest(context.manifest);

  // ── Step 5: 非耦合桥接提醒（不自动安装 wl-skills-ui）───────────────────────

  const hasUiPackage = projectHasUiPackage();

  // ── 输出统计 ──────────────────────────────────────────────────────

  printInstallStats(context, oldManifest);
  printInstallBridge(hasUiPackage);

}

// ─── 命令: clean ────────────────────────────────────────────────────────

/**
 * 确保 .husky/pre-commit 包含 wl-skills validate --pre-commit
 * — 这是让 AI 生成的代码"绕不开"规范的核心拦截点
 *
 * 策略：
 * 1. 如果 .husky/pre-commit 不存在 → 创建（包含 validate 调用）
 * 2. 如果存在但不含 wl-skills → 追加（不破坏用户已有的 hook 内容）
 * 3. 如果存在且已含但格式过旧 → 刷新为最新格式
 * 4. 如果存在且格式最新 → 跳过
 *
 * hook 使用包管理器动态解析，避免硬编码 node_modules 路径在 pnpm 下失效。
 * 包含存在性守卫：kit 未安装时优雅跳过，不阻断提交。
 */
function stripLegacyPreCommitBlock(existing, marker) {
  const filtered = [];
  let skipMode = false;
  for (const line of existing.split("\n")) {
    if (line.includes(marker) || line.includes("wl-skills-kit 自动")) {
      skipMode = true;
      continue;
    }
    if (skipMode && (line.includes("exit 1") || line.trim() === "fi")) {
      skipMode = false;
      continue;
    }
    if (!skipMode) filtered.push(line);
  }
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === "") {
    filtered.pop();
  }
  return filtered.join("\n").trimEnd();
}

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {}
}

function refreshPreCommitHook(filePath, existing, marker, hookContent) {
  const base = stripLegacyPreCommitBlock(existing, marker);
  const latest = hookContent.replace("#!/usr/bin/env sh\n", "");
  writeExecutable(filePath, `${base}\n\n${latest}`);
  console.log("  ✔ 已刷新 .husky/pre-commit 为最新格式（v2，含存在性守卫）\n");
}

function appendPreCommitHook(filePath, existing, hookContent) {
  const addition = hookContent.replace("#!/usr/bin/env sh\n", "");
  writeExecutable(filePath, `${existing.trimEnd()}\n\n${addition}`);
  console.log("  ✔ 已在 .husky/pre-commit 追加 wl-skills validate（提交前规范检测）");
  console.log("    → kit 未安装时自动跳过，不阻断提交\n");
}

function createPreCommitHook(filePath, hookContent) {
  writeExecutable(filePath, hookContent);
  console.log("  ✔ 已创建 .husky/pre-commit（提交前自动运行 wl-skills validate）");
  console.log("    → 每次 git commit 时自动检测页面规范，error 级别阻断提交");
  console.log("    → kit 未安装时自动跳过，不阻断提交\n");
}

function ensurePreCommitHook(targetDir) {
  const huskyDir = path.join(targetDir, ".husky");

  // 只有 git 仓库才创建 husky hook
  if (!fs.existsSync(path.join(targetDir, ".git"))) return;
  if (!fs.existsSync(huskyDir)) return;

  const VALIDATE_MARKER = "wl-skills validate --pre-commit";
  // 最新 hook 版本标记，用于检测旧格式并刷新
  const HOOK_VERSION_TAG = "# wl-skills-hook-v2";

  const hookContent =
    "#!/usr/bin/env sh\n" +
    HOOK_VERSION_TAG + "\n" +
    "# wl-skills-kit 自动管理：提交前规范检测（error 阻断提交）\n" +
    "# 如果 node_modules 不存在或 kit 未安装，优雅跳过，不阻断提交\n" +
    'if [ -f "node_modules/@agile-team/wl-skills-kit/bin/wl-skills.js" ]; then\n' +
    '  node node_modules/@agile-team/wl-skills-kit/bin/wl-skills.js validate --pre-commit\n' +
    "  if [ $? -ne 0 ]; then\n" +
    '    echo ""\n' +
    '    echo "  ✖ 规范检测未通过，提交已阻断。修复后重新 git add + git commit"\n' +
    "    exit 1\n" +
    "  fi\n" +
    "else\n" +
    '  echo "  ⚠ wl-skills-kit 未安装（node_modules 中未找到），跳过提交前检测"\n' +
    "fi\n";

  const preCommitFile = path.join(huskyDir, "pre-commit");

  if (!fs.existsSync(preCommitFile)) {
    createPreCommitHook(preCommitFile, hookContent);
    return;
  }
  const existing = fs.readFileSync(preCommitFile, "utf8");
  if (existing.includes(HOOK_VERSION_TAG)) return;
  if (existing.includes(VALIDATE_MARKER)) {
    refreshPreCommitHook(preCommitFile, existing, VALIDATE_MARKER, hookContent);
    return;
  }
  appendPreCommitHook(preCommitFile, existing, hookContent);
}

/**
 * 确保 .husky/pre-push 包含 wl-skills validate --typecheck
 * — pre-push 跑全量类型检查（R14），补 pre-commit 不跑 R14 的缺口
 *
 * 设计理由：pre-commit 跑全量 vue-tsc 太慢（拖慢日常提交），
 * 但 pre-push 频率低、可接受耗时，且 CI 也跑相同命令。
 * 这样 R14 在"推送到远程"和"CI"两个节点都有确定性执行器兜底。
 *
 * 策略同 pre-commit：不存在则创建，存在但无 marker 则追加。
 */
function ensurePrePushHook(targetDir) {
  const huskyDir = path.join(targetDir, ".husky");
  if (!fs.existsSync(path.join(targetDir, ".git"))) return;
  if (!fs.existsSync(huskyDir)) return;

  const HOOK_VERSION_TAG = "# wl-skills-prepush-hook-v1";
  const pushContent =
    "#!/usr/bin/env sh\n" +
    HOOK_VERSION_TAG + "\n" +
    "# wl-skills-kit 自动管理：推送前全量类型检查（R14，error 阻断推送）\n" +
    "# 含 vue-tsc/tsc --noEmit，体积较大故放 pre-push 而非 pre-commit\n" +
    "# 如果 node_modules 不存在或 kit 未安装，优雅跳过，不阻断推送\n" +
    'if [ -f "node_modules/@agile-team/wl-skills-kit/bin/wl-skills.js" ]; then\n' +
    '  node node_modules/@agile-team/wl-skills-kit/bin/wl-skills.js validate --typecheck\n' +
    "  if [ $? -ne 0 ]; then\n" +
    '    echo ""\n' +
    '    echo "  ✖ 类型检查/规范检测未通过，推送已阻断（R14 类型错误零容忍）"\n' +
    '    echo "  → 修复后重新 git push，或单独 commit 后用 --no-verify 跳过（CI 仍会拦截）"\n' +
    "    exit 1\n" +
    "  fi\n" +
    "else\n" +
    '  echo "  ⚠ wl-skills-kit 未安装，跳过推送前类型检查"\n' +
    "fi\n";

  const pushFile = path.join(huskyDir, "pre-push");
  if (!fs.existsSync(pushFile)) {
    fs.writeFileSync(pushFile, pushContent, "utf8");
    try { fs.chmodSync(pushFile, 0o755); } catch {}
    console.log("  ✔ 已创建 .husky/pre-push（推送前自动运行 wl-skills validate --typecheck）");
    console.log("    → R14 类型检查在 pre-push 兜底（pre-commit 太慢不放这）");
    console.log("");
  } else {
    const existing = fs.readFileSync(pushFile, "utf8");
    if (existing.includes(HOOK_VERSION_TAG)) return;
    const addition = "\n" + pushContent.replace("#!/usr/bin/env sh\n", "");
    fs.writeFileSync(pushFile, existing.trimEnd() + "\n" + addition, "utf8");
    try { fs.chmodSync(pushFile, 0o755); } catch {}
    console.log("  ✔ 已在 .husky/pre-push 追加 wl-skills validate --typecheck（R14 类型检查）");
    console.log("");
  }
}

/**
 * 确保业务项目有 ESLint 配置
 * 策略：如果项目根目录没有 eslint.config.cjs，从 kit 复制模板
 *       如果已有，不覆盖（尊重用户自定义配置）
 */
function ensureEslintConfig(targetDir) {
  const targetEslint = path.join(targetDir, "eslint.config.cjs");
  if (fs.existsSync(targetEslint)) return; // 用户已有自定义配置

  const templatePath = path.join(FILES_DIR, "eslint.config.wl-skills.cjs");
  if (!fs.existsSync(templatePath)) return;

  const content = fs.readFileSync(templatePath, "utf8");
  fs.writeFileSync(targetEslint, content, "utf8");
  console.log("  ✔ 已创建 eslint.config.cjs（wl-skills-kit 模板）");
  console.log("    → 安装依赖后生效：pnpm add -D eslint eslint-plugin-vue vue-eslint-parser @typescript-eslint/parser @typescript-eslint/eslint-plugin");
  console.log("");
}

function shouldKeepManagedFile(relPath) {
  if (isProtected(relPath)) return true;
  if (!keepReports) return false;
  return [".wl-skills/reports/", ".github/reports/"].some((prefix) =>
    relPath.startsWith(prefix),
  );
}

function previewClean(toRemove, toKeep) {
  console.log("  将要删除（" + toRemove.length + " 个文件）:\n");
  for (const file of toRemove) {
    const exists = fs.existsSync(path.join(TARGET_DIR, file));
    console.log("  " + (exists ? "删除" : "跳过(不存在)") + "  " + file);
  }
  console.log("\n  保留（" + toKeep.length + " 个文件）:\n");
  for (const file of toKeep) console.log("  保留  " + file);
}

function removeManagedFiles(toRemove) {
  let removed = 0;
  let skipped = 0;
  for (const file of toRemove) {
    const fullPath = path.join(TARGET_DIR, file);
    if (!fs.existsSync(fullPath)) {
      skipped++;
      continue;
    }
    removeFileAndEmptyParents(fullPath);
    removed++;
  }
  if (fs.existsSync(MANIFEST_PATH)) fs.unlinkSync(MANIFEST_PATH);
  return { removed, skipped };
}

function printCleanResult(result, kept) {
  console.log("  ✔ 清理完成!");
  console.log("    删除: " + result.removed + " 个文件");
  if (result.skipped > 0) console.log("    跳过: " + result.skipped + " 个（已不存在）");
  const suffix = keepReports
    ? "src/components/ + src/types/ + .wl-skills/reports/"
    : "src/components/ + src/types/";
  console.log(`    保留: ${kept} 个文件（${suffix}）`);
}

function runClean() {
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [clean]");
  console.log("  目标目录: " + TARGET_DIR);
  if (dryRun) console.log("  模式: --dry-run（预览）");
  console.log("");

  const manifest = readManifest();
  if (!manifest) {
    console.log("  ⚠ 未找到 " + MANIFEST_NAME);
    console.log("  请先执行 pnpm dlx @agile-team/wl-skills-kit init 安装一次。");
    console.log("");
    process.exit(1);
  }

  const allFiles = Object.keys(manifest.files);
  const toRemove = allFiles.filter((file) => !shouldKeepManagedFile(file));
  const toKeep = allFiles.filter(shouldKeepManagedFile);

  if (dryRun) {
    previewClean(toRemove, toKeep);
  } else {
    printCleanResult(removeManagedFiles(toRemove), toKeep.length);
  }
  console.log("");
}

function expectedManifestFiles() {
  const expected = {};
  const files = walkDir(FILES_DIR, FILES_DIR);
  for (const relPath of files) {
    expected[relPath] = fileMd5(path.join(FILES_DIR, relPath));
  }
  // v2.11+: copilot-instructions.md 是薄壳入口，完整地图在 .wl-skills/
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

function createCheck(name, ok, detail) {
  return { name, ok: Boolean(ok), detail };
}

function checkNodeRuntime() {
  const major = Number(process.versions.node.split(".")[0]);
  return createCheck("Node 版本", major >= 22, `${process.versions.node}（要求 >=22）`);
}

function checkProjectConfig(name, candidates) {
  const exists = candidates.some((relPath) =>
    fs.existsSync(path.join(TARGET_DIR, relPath)),
  );
  return createCheck(name, exists, exists ? "存在" : "缺失");
}

function checkPreCommitHook(huskyExists) {
  const hookPath = path.join(TARGET_DIR, ".husky", "pre-commit");
  const configured = fs.existsSync(hookPath)
    ? fs.readFileSync(hookPath, "utf8").includes("wl-skills validate --pre-commit")
    : false;
  const detail = configured
    ? "已配置规范检测"
    : huskyExists
      ? "存在但未配置 wl-skills validate"
      : "不存在";
  return createCheck(".husky/pre-commit (wl-skills validate)", configured, detail);
}

function syncEnvironmentPath() {
  return [
    ".wl-skills/skills/sync/env.local.json",
    ".github/skills/sync/env.local.json",
  ].map((relPath) => path.join(TARGET_DIR, relPath))
    .find((filePath) => fs.existsSync(filePath));
}

function hasConfiguredToken(env) {
  const value = String(env.token || "");
  return Boolean(env.token) && !["Bearer Token", "你的", "请填入"].some((text) =>
    value.includes(text),
  );
}

function checkSyncEnvironment() {
  const envPath = syncEnvironmentPath();
  if (!envPath) return createCheck("MCP env.local.json", false, "缺失");
  try {
    const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    const gatewayOk = Boolean(env.gatewayPath) && !String(env.gatewayPath).includes("你的网关");
    const ok = gatewayOk && hasConfiguredToken(env);
    return createCheck("MCP env.local.json", ok, ok ? "已填写 gatewayPath/token" : "存在但仍含占位值");
  } catch (error) {
    return createCheck("MCP env.local.json", false, "JSON 解析失败：" + error.message);
  }
}

function checkMcpServer() {
  const installed = path.join(
    TARGET_DIR,
    "node_modules",
    "@agile-team",
    "wl-skills-kit",
    "mcp",
    "server.js",
  );
  const bundled = path.join(__dirname, "..", "mcp", "server.js");
  return createCheck("MCP server", [installed, bundled].some(fs.existsSync), "server.js 可发现");
}

function collectEnvironmentChecks() {
  const huskyExists = fs.existsSync(path.join(TARGET_DIR, ".husky"));
  const manifest = readManifest();
  return [
    checkNodeRuntime(),
    checkProjectConfig(".prettierrc", [".prettierrc.js", ".prettierrc", ".prettierrc.cjs"]),
    checkProjectConfig("eslint.config", ["eslint.config.ts", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.js"]),
    createCheck(".husky", huskyExists, huskyExists ? "存在" : "缺失"),
    checkPreCommitHook(huskyExists),
    createCheck(MANIFEST_NAME, manifest, manifest ? `已安装 v${manifest.version}` : "未安装"),
    checkSyncEnvironment(),
    checkMcpServer(),
  ];
}

function runCheck() {
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [check]");
  console.log("  目标目录: " + TARGET_DIR);
  console.log("");

  const checks = collectEnvironmentChecks();

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

function groupFilesByDirectory(files) {
  const dirs = new Map();
  for (const rel of files) {
    const dir = path.dirname(rel).replace(/\\/g, "/");
    const name = path.basename(rel);
    if (!dirs.has(dir)) dirs.set(dir, new Set());
    dirs.get(dir).add(name);
  }
  return dirs;
}

function readPageSource(dir, name) {
  const filePath = path.join(TARGET_DIR, dir, name);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function inspectPageDirectory(dir, names) {
  const indexContent = readPageSource(dir, "index.vue");
  const dataContent = readPageSource(dir, "data.ts");
  return {
    dir,
    hasDataTs: names.has("data.ts"),
    hasIndexScss: names.has("index.scss"),
    hasApiMd: names.has("api.md"),
    apiConfigCount: (dataContent.match(/API_CONFIG/g) || []).length,
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
    ).map((match) => match[1]),
  };
}

function scanPageDirs(scanRel) {
  const scanDir = path.join(TARGET_DIR, scanRel || "src/views");
  if (!fs.existsSync(scanDir)) return [];
  const dirs = groupFilesByDirectory(walkDir(scanDir, TARGET_DIR));
  const pages = [];
  for (const [dir, names] of dirs.entries()) {
    if (!names.has("index.vue")) continue;
    pages.push(inspectPageDirectory(dir, names));
  }
  return pages.sort((a, b) => a.dir.localeCompare(b.dir));
}

function findMockFiles() {
  const mockDir = path.join(TARGET_DIR, "mock");
  if (!fs.existsSync(mockDir)) return [];
  return walkDir(mockDir, TARGET_DIR).filter((rel) => /\.(ts|js)$/.test(rel));
}

function addDictsUnder(root, result) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return;
  for (const rel of walkDir(root, root)) {
    if (path.basename(rel) === "dicts.ts") result.add(path.join(root, rel));
  }
}

function findRelevantDictContracts(scanPath) {
  const result = new Set();
  const viewsRoot = path.join(TARGET_DIR, "src", "views");
  let scanRoot = path.resolve(TARGET_DIR, scanPath);
  if (fs.existsSync(scanRoot) && fs.statSync(scanRoot).isFile()) scanRoot = path.dirname(scanRoot);
  addDictsUnder(scanRoot, result);
  let cursor = scanRoot;
  while (cursor.startsWith(viewsRoot) && cursor.length >= viewsRoot.length) {
    const candidate = path.join(cursor, "dicts.ts");
    if (fs.existsSync(candidate)) result.add(candidate);
    if (cursor === viewsRoot) break;
    cursor = path.dirname(cursor);
  }
  return Array.from(result).sort();
}

function appendDictionaryContractIssues(issues, scanPath) {
  const files = findRelevantDictContracts(scanPath);
  for (const file of files) {
    const result = validateContractAlignment(path.dirname(file));
    const dir = path.relative(TARGET_DIR, file).replace(/\\/g, "/");
    for (const text of result.errors) issues.push({ level: "error", dir, text, rule: "D1" });
    for (const text of result.warnings) issues.push({ level: "warn", dir, text, rule: "D1" });
  }
  return files.length;
}

function getValidationStagedSet() {
  if (!preCommit) return null;
  const staged = getStagedFiles(TARGET_DIR);
  if (staged.length > 0) {
    return new Set(staged.map((file) => file.replace(/\\/g, "/")));
  }
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [validate --pre-commit]");
  console.log("  ⚠ 无 staged 的 .vue/.ts 文件，跳过检测");
  console.log("");
  return undefined;
}

function selectValidationPages(allPages, stagedSet) {
  if (!preCommit || !stagedSet) return allPages;
  const stagedFiles = Array.from(stagedSet);
  const contractStaged = stagedFiles.some(
    (file) => file.endsWith("/dicts.ts") || file.endsWith("/api.md"),
  );
  if (contractStaged) return allPages;
  return allPages.filter((page) =>
    stagedFiles.some((file) => file.startsWith(page.dir + "/")),
  );
}

function appendMockArchitectureIssues(issues, mockFiles) {
  const mockDir = path.join(TARGET_DIR, "mock");
  const hasMockDir = fs.existsSync(mockDir);
  const hasUtils = ["_utils.ts", "_utils.js"].some((name) =>
    fs.existsSync(path.join(mockDir, name)),
  );
  if (hasMockDir && mockFiles.length > 0 && !hasUtils) {
    issues.push({
      level: "warn",
      dir: "mock/",
      text: "缺少 mock/_utils.ts 共享工具文件（建议 wl-skills init 补充）",
    });
  }
  appendMockPlacementIssues(issues, mockFiles);
  appendMockUtilityIssues(issues, mockFiles, hasUtils);
}

function appendMockPlacementIssues(issues, mockFiles) {
  for (const rel of mockFiles) {
    const parts = rel.replace(/\\/g, "/").replace(/^mock\//, "").split("/");
    const basename = parts[parts.length - 1];
    if (parts.length !== 1 || basename.startsWith("_")) continue;
    issues.push({
      level: "info",
      dir: "mock/",
      text: `${basename} 直接放在 mock/ 根目录，建议按业务域分子目录（如 mock/sale/${basename}）`,
    });
  }
}

function appendMockUtilityIssues(issues, mockFiles, hasUtils) {
  if (!hasUtils) return;
  for (const rel of mockFiles) {
    if (path.basename(rel).startsWith("_")) continue;
    const content = fs.readFileSync(path.join(TARGET_DIR, rel), "utf8");
    if (/_utils/.test(content)) continue;
    issues.push({
      level: "info",
      dir: rel,
      text: "未引用 mock/_utils 共享工具，建议统一使用 pageResult/ok/paginate",
    });
  }
}

function appendPageFileIssues(issues, page) {
  if (!page.hasDataTs) {
    issues.push({ level: "warn", dir: page.dir, text: "缺 data.ts（需结合页面复杂度判断）" });
  }
  if (!page.hasIndexScss) {
    issues.push({ level: "warn", dir: page.dir, text: "缺 index.scss" });
  }
  if (page.apiConfigCount > 0 && !page.hasApiMd) {
    issues.push({ level: "warn", dir: page.dir, text: "检测到 API_CONFIG 但缺 api.md" });
  }
}

function appendPageTableIssues(issues, page) {
  if (page.baseTableCount > 0 && page.agGridCount < page.baseTableCount) {
    issues.push({ level: "error", dir: page.dir, text: 'BaseTable 必须显式 render-type="agGrid"' });
  }
  if (page.baseTableCount > 0 && page.cidBindCount < page.baseTableCount) {
    issues.push({ level: "error", dir: page.dir, text: "BaseTable 必须配置全局唯一 cid / :cid" });
  }
  if (page.hasDataTs && page.baseTableCount > 0 && !page.hasDefineColumns) {
    issues.push({ level: "error", dir: page.dir, text: "表格列必须使用 wl-skills-ui defineColumns()" });
  }
  appendRenderOpsIssue(issues, page);
}

function appendRenderOpsIssue(issues, page) {
  const dataContent = page.hasDataTs ? readPageSource(page.dir, "data.ts") : "";
  if (page.baseTableCount > 0 && !page.hasRenderOps && /操作|_action/.test(dataContent)) {
    issues.push({ level: "warn", dir: page.dir, text: "疑似存在操作列但未使用 renderOps()" });
  }
}

function appendPageBehaviorIssues(issues, page) {
  const checks = [
    [page.hasOperationsArray, "error", "操作列禁止 operations 数组，必须使用 defaultSlot + renderOps()"],
    [page.hasEmptyOnClick, "error", "存在空 onClick: () => {}"],
  ];
  for (const [matched, level, text] of checks) {
    if (matched) issues.push({ level, dir: page.dir, text });
  }
}

function appendPageMockIssues(issues, page, mockFiles, mockContent) {
  if (page.apiConfigCount > 0 && mockFiles.length === 0) {
    issues.push({ level: "warn", dir: page.dir, text: "检测到 API_CONFIG 但项目 mock/ 目录无 mock 文件" });
  }
  for (const url of page.apiUrls.filter((item) => item.startsWith("/"))) {
    const mockUrl = `/dev-api${url}`;
    if (!mockContent || mockContent.includes(mockUrl)) continue;
    issues.push({ level: "warn", dir: page.dir, text: "mock 中未发现端点 " + mockUrl });
  }
}

function appendAllPageIssues(issues, pages, mockFiles, mockContent) {
  for (const page of pages) {
    appendPageFileIssues(issues, page);
    appendPageTableIssues(issues, page);
    appendPageBehaviorIssues(issues, page);
    appendPageMockIssues(issues, page, mockFiles, mockContent);
  }
}

function appendSpecIssues(issues, pages) {
  let alignedPages = 0;
  for (const page of pages) {
    const result = alignPage(path.join(TARGET_DIR, page.dir), page.dir, { strict });
    if (result.hasSpec) alignedPages++;
    issues.push(...result.issues);
  }
  return alignedPages;
}

function appendTypeCheckIssues(issues) {
  if (!typeCheck) return { ran: false, errors: 0 };
  const result = runTypeCheck(TARGET_DIR);
  issues.push(...result.issues);
  return { ran: result.ran, errors: result.errorCount || 0 };
}

function printValidationIssues(issues) {
  for (const issue of issues) {
    const icons = { error: "✖", info: "ℹ", warn: "⚠" };
    console.log("  " + (icons[issue.level] || "⚠") + " " + issue.dir + " — " + issue.text);
  }
  if (issues.length === 0) console.log("  ✔ 页面文件完整性检查通过");
  console.log("");
}

function finishValidation(issues, errors, warns) {
  const blocking = issues.filter(
    (issue) => issue.level === "error" || (strict && issue.level === "warn"),
  );
  if (blocking.length > 0) printFixSuggestions(blocking);
  if (preCommit) return finishPreCommitValidation(issues, errors, warns);
  if (strict) return finishStrictValidation(errors, warns);
  if (errors > 0 || warns > 0) process.exitCode = 1;
}

function finishPreCommitValidation(issues, errors, warns) {
  const failCount = strict ? errors + warns : errors;
  if (failCount === 0) {
    console.log(`  ✔ pre-commit 检查通过（${issues.length} 个提示项不阻断提交）\n`);
    return;
  }
  const warnText = strict && warns > 0 ? ` + ${warns} 个 warn（strict 模式）` : "";
  console.log(`  ✖ pre-commit 检查发现 ${errors} 个 error${warnText}，提交已阻断`);
  console.log("  → 请修复后重新 git add + git commit");
  console.log("  → 如需 AI 辅助修复，请触发：规范审计 → 自动修复 → 复扫验证\n");
  process.exitCode = 1;
}

function finishStrictValidation(errors, warns) {
  if (errors === 0 && warns === 0) {
    console.log("  ✔ strict 模式检查全部通过\n");
    return;
  }
  console.log(`  ✖ strict 模式检查发现 ${errors} error / ${warns} warn，CI 已阻断`);
  console.log("  → --strict 模式下 warn 也会失败，请修复\n");
  process.exitCode = 1;
}

function validationScanPath() {
  return args.find((arg) => !arg.startsWith("-") && arg !== command) || "src/views";
}

function printValidationHeader(scanPath) {
  const mode = preCommit ? "  [pre-commit]" : "";
  const scope = preCommit ? "（仅 staged 文件）" : "";
  console.log("");
  console.log(`  wl-skills-kit v${PKG.version}  [${command}]${mode}`);
  console.log(`  扫描目录: ${scanPath}${scope}\n`);
}

function runValidationAst(issues, scanPath, stagedSet) {
  const stagedFiles = preCommit && stagedSet ? Array.from(stagedSet) : undefined;
  const result = runAstRules(TARGET_DIR, scanPath, { stagedFiles, strict });
  issues.push(...result.issues);
  return result;
}

function validationTypeSummary(result) {
  if (!typeCheck) return "";
  return result.ran
    ? `（类型检查 已执行 ${result.errors} error）`
    : "（类型检查 已跳过）";
}

function printValidationSummary(context) {
  const parts = [
    context.astPages ? `（AST 扫描 ${context.astPages}）` : "",
    context.specPages ? `（spec-align ${context.specPages}）` : "",
    context.dictContracts ? `（字典契约 ${context.dictContracts}）` : "",
    validationTypeSummary(context.typeCheckResult),
  ];
  console.log(`  页面目录: ${context.pages}${parts.join("")}`);
  console.log(`  提示项: ${context.issues}\n`);
}

function countValidationIssues(issues, level) {
  if (level === "warn") {
    return issues.filter((issue) => !issue.level || issue.level === "warn").length;
  }
  return issues.filter((issue) => issue.level === level).length;
}

function runValidate() {
  const scanPath = validationScanPath();
  const stagedSet = getValidationStagedSet();
  if (preCommit && stagedSet === undefined) return;
  const allPages = scanPageDirs(scanPath);
  const pages = selectValidationPages(allPages, stagedSet);

  printValidationHeader(scanPath);

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

  appendMockArchitectureIssues(issues, mockFiles);
  appendAllPageIssues(issues, pages, mockFiles, mockContent);

  // ── 模块字典契约 D1：api.md dict-contract → dicts.ts 汇总一致性 ─────
  const dictContractCount = appendDictionaryContractIssues(issues, scanPath);

  // ── AST 语义级规则检测（v2.10.1+）─────────────────────────────────
  // 补充正则无法覆盖的 AST 语义规则（R1~R14），与正则规则合并输出
  // 在 pre-commit 模式下复用上面已计算的 stagedSet
  const astResult = runValidationAst(issues, scanPath, stagedSet);

  // ── page-spec 比对（v2.11.1+，"约定 vs 代码"确定性核对 S1~S5）───────
  // 页面目录存在 page-spec.json 时，比对 data.ts 实际实现与原型约定真值。
  // 无 page-spec.json 的页面静默跳过，不影响其他检查。
  const specAlignedPages = appendSpecIssues(issues, pages);

  // ── 类型检查 R14（v2.11.2+，vue-tsc/tsc 委托，仅 --typecheck 触发）───
  // 体积较大（整项目编译），validate 默认不跑；pre-commit 不建议开启，CI 必跑。
  // 无 tsconfig / 无 checker → 优雅降级为 warn，不阻断。
  const typeCheckResult = appendTypeCheckIssues(issues);

  // ── 输出 ───────────────────────────────────────────────────────────
  printValidationSummary({
    pages: pages.length,
    astPages: astResult.pages,
    specPages: specAlignedPages,
    dictContracts: dictContractCount,
    typeCheckResult,
    issues: issues.length,
  });
  const errors = countValidationIssues(issues, "error");
  const warns = countValidationIssues(issues, "warn");
  printValidationIssues(issues);
  finishValidation(issues, errors, warns);
}

// ── \u4fee\u590d\u5efa\u8bae\u6620\u5c04\u8868\uff08P0\uff1a\u8ba9\u5f00\u53d1\u8005\u77e5\u9053\u600e\u4e48\u4fee\uff09──────────────────────────────
const FIX_SUGGESTIONS = {
  // \u6b63\u5219\u7ea7\u68c0\u67e5
  'render-type="agGrid"': {
    fix: '<BaseTable render-type="agGrid" ...>',
    ref: 'standards/12-base-table.md',
    auto: true,
  },
  'cid / :cid': {
    fix: '\u7ed9 BaseTable \u52a0 cid="{\u6a21\u5757\u7f29\u5199}-{\u529f\u80fd}"\uff0c\u5168\u5c40\u552f\u4e00',
    ref: 'standards/12-base-table.md',
    auto: true,
  },
  'defineColumns()': {
    fix: 'import { defineColumns } from "@agile-team/wl-skills-ui/runtime" \u5e76\u7528\u4e8e\u5217\u5b9a\u4e49',
    ref: 'standards/12-base-table.md',
    auto: true,
  },
  'renderOps()': {
    fix: '\u64cd\u4f5c\u5217\u4f7f\u7528 defaultSlot + renderOps()\uff0c\u7981\u6b62 operations \u6570\u7ec4',
    ref: 'standards/12-base-table.md',
    auto: true,
  },
  'onClick: () => {}': {
    fix: '\u586b\u5145\u5b9e\u9645\u4e8b\u4ef6\u5904\u7406\u903b\u8f91\uff0c\u6216\u8054\u52a8 code-fix \u81ea\u52a8\u4fee\u590d',
    ref: 'standards/04-coding-basics.md',
    auto: true,
  },
};

const AST_FIX_SUGGESTIONS = {
  R1: { fix: '\u5c06\u4e1a\u52a1\u903b\u8f91\u8fc1\u79fb\u5230 data.ts\uff0cindex.vue \u53ea\u4fdd\u7559\u6a21\u677f+\u89e3\u6784', ref: 'standards/02-code-structure.md', auto: false },
  R2: { fix: '\u5c06 getAction/postAction/sessionStorage \u79fb\u5230 data.ts \u4e2d\u8c03\u7528', ref: 'standards/02-code-structure.md', auto: true },
  R3: { fix: '\u66ff\u6362 <el-table> \u4e3a <BaseTable render-type="agGrid" :cid="xxx">', ref: 'standards/12-base-table.md', auto: true },
  R4: { fix: '\u4fee\u6539\u91cd\u590d cid \u4e3a\u5168\u5c40\u552f\u4e00\u503c\uff08\u683c\u5f0f: {\u6a21\u5757\u7f29\u5199}-{\u529f\u80fd}\uff09', ref: 'standards/12-base-table.md', auto: true },
  R5: { fix: 'data.ts \u4e2d class extends AbstractPageQueryHook\uff0c\u5b9e\u73b0 queryDef/columnsDef', ref: 'standards/02-code-structure.md', auto: false },
  R6: { fix: '\u5220\u9664 import axios\uff0c\u6539\u7528 getAction/postAction', ref: 'standards/06-security.md', auto: true },
  R7: { fix: '\u5220\u9664 eval/new Function\uff0c\u7528\u5b89\u5168\u7684\u66ff\u4ee3\u65b9\u6848', ref: 'standards/06-security.md', auto: false },
  R8: { fix: '\u521b\u5efa data.ts\uff0c\u5c06\u63a5\u53e3\u8c03\u7528\u548c\u4e1a\u52a1\u903b\u8f91\u79fb\u5165\uff1b\u786e\u4fdd index.vue \u65e0 API \u8c03\u7528', ref: 'standards/02-code-structure.md', auto: true },
  R9: { fix: '\u66f4\u65b0 api.md\uff0c\u786e\u4fdd URL \u4e0e data.ts API_CONFIG \u4e00\u81f4', ref: 'standards/02-code-structure.md', auto: true },
  R10: { fix: '\u66ff\u6362\u539f\u751f el-* \u7ec4\u4ef6\u4e3a\u5e73\u53f0\u5c01\u88c5\uff08jh-select/jh-date/jh-pagination \u7b49\uff09', ref: 'standards/13-platform-components.md', auto: true },
  R11: { fix: '\u4ece data.ts \u4e2d\u79fb\u9664 Pinia Store import\uff0cStore \u5e94\u5728\u7ec4\u4ef6\u5c42\u4f7f\u7528', ref: 'standards/10-pinia.md', auto: true },
  R12: { fix: '\u5c06\u786c\u7f16\u7801 IP/URL \u79fb\u81f3 .env.* \u73af\u5883\u53d8\u91cf', ref: 'standards/07-config.md', auto: true },
  R13: { fix: '\u62c6\u5206\u9ad8\u590d\u6742\u5ea6\u51fd\u6570\uff1a\u6309\u804c\u8d23\u62bd\u53d6\u5b50\u51fd\u6570\u3001\u7528\u63d0\u524d return \u4ee3\u66ff\u5d4c\u5957 if\u3001\u67e5\u8868\u9a71\u52a8\u53d6\u4ee3 if-else \u94fe\u3001\u7b56\u7565\u6a21\u5f0f\u6d88\u9664\u591a\u5206\u652f', ref: 'standards/04-coding-basics.md', auto: false },
  R14: { fix: '\u6309 TS \u9519\u8bef\u4fee\u590d\u7c7b\u578b\uff08\u8865\u7c7b\u578b\u6807\u6ce8 / \u4fee\u6b63\u8c03\u7528\u53c2\u6570 / \u8865 any \u8fb9\u754c\u6ce8\u91ca\uff09\uff1b\u672a\u88c5 vue-tsc \u65f6\u5b89\u88c5\u540e\u7eb3\u5165 CI', ref: 'standards/09-typescript.md', auto: false },
  // S 系列：page-spec 约定 vs 代码确定性核对（v2.11.1+）
  S0: { fix: '\u4fee\u6b63 page-spec.json \u7ed3\u6784\uff08page/query/columns/toolbar/operations\uff09', ref: '.wl-skills/skills/core/page-codegen/SKILL.md', auto: false },
  S1: { fix: '\u8c03\u6574 queryDef() \u67e5\u8be2\u5b57\u6bb5\u987a\u5e8f\u4e0e page-spec.json query \u4e25\u683c\u4e00\u81f4', ref: '.wl-skills/skills/core/page-codegen/SKILL.md', auto: true },
  S2: { fix: '\u8c03\u6574 columnsDef() \u8868\u683c\u5217\u987a\u5e8f/\u96c6\u5408\u4e0e page-spec.json columns \u4e25\u683c\u4e00\u81f4', ref: '.wl-skills/skills/core/page-codegen/SKILL.md', auto: true },
  S3: { fix: '\u8c03\u6574 toolbarDef() \u6309\u94ae\u987a\u5e8f/\u989c\u8272\u4e0e page-spec.json toolbar \u4e25\u683c\u4e00\u81f4', ref: '.wl-skills/skills/core/page-codegen/SKILL.md', auto: true },
  S4: { fix: '\u64cd\u4f5c\u5217\u6309\u94ae\u4e0e page-spec.json operations \u4e25\u683c\u5bf9\u5e94\uff0c\u4e0d\u591a\u4e0d\u5c11', ref: '.wl-skills/skills/core/page-codegen/SKILL.md', auto: true },
  D1: { fix: '\u5c06\u9875\u9762 api.md \u7684 dict-contract \u5408\u5e76\u5230\u6a21\u5757 dicts.ts\uff0c\u4fee\u6b63\u540c value/label \u6216\u6392\u5e8f\u51b2\u7a81', ref: 'docs/dictionary-contract.md', auto: false },
};

function groupIssuesByRule(blockingIssues) {
  const ruleGroups = new Map();
  for (const issue of blockingIssues) {
    const key = issue.rule || guessRuleFromText(issue.text);
    if (!key) continue;
    if (!ruleGroups.has(key)) ruleGroups.set(key, []);
    ruleGroups.get(key).push(issue);
  }
  return ruleGroups;
}

function printRuleSuggestion(rule, ruleIssues) {
  const suggestion = AST_FIX_SUGGESTIONS[rule] || findRegexSuggestion(ruleIssues[0].text);
  const count = ruleIssues.length;
  if (!suggestion) {
    console.log("  \u2502  " + rule + "\uff08" + count + " \u5904\uff09 [\u2753\u672a\u77e5\u89c4\u5219]");
    console.log("  \u2502    \u2192 \u8bf7\u67e5\u770b .wl-skills/standards/ \u76f8\u5173\u89c4\u8303\u6216\u89e6\u53d1\u89c4\u8303\u5ba1\u8ba1");
    console.log("  \u2502");
    return false;
  }
  const autoTag = suggestion.auto ? " [\u2705\u53ef\u81ea\u52a8\u4fee]" : " [\u270b\u9700\u4eba\u5de5]";
  console.log("  \u2502  " + rule + "\uff08" + count + " \u5904\uff09" + autoTag);
  console.log("  \u2502    \u2192 " + suggestion.fix);
  console.log("  \u2502    \u53c2\u8003: .wl-skills/" + suggestion.ref);
  console.log("  \u2502");
  return suggestion.auto;
}

function printFixSuggestions(blockingIssues) {
  const ruleGroups = groupIssuesByRule(blockingIssues);

  if (ruleGroups.size === 0) return;

  console.log("  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510");
  console.log("  \u2502 \ud83d\udd27 \u4fee\u590d\u5efa\u8bae                                              \u2502");
  console.log("  \u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524");

  let hasAutoFix = false;
  for (const [rule, ruleIssues] of ruleGroups.entries()) {
    hasAutoFix = printRuleSuggestion(rule, ruleIssues) || hasAutoFix;
  }

  console.log("  \u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524");
  if (hasAutoFix) {
    console.log("  \u2502 \ud83d\ude80 \u5feb\u901f\u4fee\u590d\uff1a\u5728 AI \u7f16\u8f91\u5668\u4e2d\u8f93\u5165\uff1a                       \u2502");
    console.log("  \u2502    \"\u89c4\u8303\u5ba1\u8ba1\" \u2192 \"\u81ea\u52a8\u4fee\u590d\" \u2192 \"\u590d\u626b\u9a8c\u8bc1\"              \u2502");
  } else {
    console.log("  \u2502 \ud83d\udcdd \u8bf7\u53c2\u7167\u4e0a\u8ff0\u89c4\u8303\u6587\u6863\u624b\u52a8\u4fee\u590d                       \u2502");
  }
  console.log("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518");
  console.log("");
}

function guessRuleFromText(text) {
  for (const key of Object.keys(FIX_SUGGESTIONS)) {
    if (text.includes(key)) return key;
  }
  return null;
}

function findRegexSuggestion(text) {
  for (const [key, suggestion] of Object.entries(FIX_SUGGESTIONS)) {
    if (text.includes(key)) return suggestion;
  }
  return null;
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function collectDoctorFiles() {
  return fs.existsSync(TARGET_DIR) ? walkDir(TARGET_DIR, TARGET_DIR) : [];
}

function collectDoctorSource(files) {
  return files
    .filter((rel) => /\.(ts|vue|scss|html)$/.test(rel))
    .filter((rel) => !rel.startsWith("node_modules/"))
    .map((rel) => fs.readFileSync(path.join(TARGET_DIR, rel), "utf8"))
    .join("\n");
}

function createUiIntegrationChecks(deps, source) {
  const uiVersion = deps["@agile-team/wl-skills-ui"] || deps["@agile-team/wk-skills-ui"];
  return [
    createCheck("@agile-team/wl-skills-ui", uiVersion, uiVersion || "未安装"),
    createCheck("@element-plus/icons-vue", deps["@element-plus/icons-vue"], deps["@element-plus/icons-vue"] || "未安装"),
    createCheck("design tokens", /@agile-team\/w[lk]-skills-ui\/design\/tokens|dist\/tokens\.css/.test(source), "需引入 design tokens"),
    createCheck("styles preset", /@agile-team\/w[lk]-skills-ui\/styles/.test(source), "需引入 styles 或 skin preset"),
    createCheck("installCommonPreset", /installCommonPreset\s*\(/.test(source), "需在入口或业务 preset 中调用"),
    createCheck("defineColumns", /defineColumns\s*\(/.test(source), "页面列定义需使用 defineColumns"),
    createCheck("renderOps", /renderOps\s*\(/.test(source), "操作列需使用 renderOps"),
  ];
}

function printDoctorChecks(checks) {
  for (const item of checks) {
    const icon = item.warn ? "⚠" : statusIcon(item.ok);
    console.log(`  ${icon} ${item.name} — ${item.detail}`);
  }
}

function runDoctorUi() {
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [doctor-ui]");
  console.log("  目标目录: " + TARGET_DIR);
  console.log("");

  const pkg = readJsonSafe(path.join(TARGET_DIR, "package.json"));
  const deps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};
  const files = collectDoctorFiles();
  const checks = createUiIntegrationChecks(deps, collectDoctorSource(files));
  printDoctorChecks(checks);
  const failed = checks.filter((item) => !item.ok).length;
  console.log("");
  console.log(
      failed === 0
        ? "  ✔ wl-skills-ui 接入检查通过"
        : "  ⚠ wl-skills-ui 接入仍有 " + failed + " 项需处理",
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

async function runExport() {
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [export]");
  console.log("  目标目录: " + TARGET_DIR);
  console.log("");

  const reportDir =
    [
      path.join(TARGET_DIR, ".wl-skills", "reports"),
      path.join(TARGET_DIR, ".github", "reports"),
    ].find((dir) => fs.existsSync(dir)) ||
    path.join(TARGET_DIR, ".wl-skills", "reports");
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
    let writeXlsxFile;
    try {
      writeXlsxFile = require("write-excel-file/node");
    } catch {
      console.error(
        "  ✖ 未找到 write-excel-file 依赖，请重新安装最新 @agile-team/wl-skills-kit",
      );
      process.exit(1);
    }
    fs.mkdirSync(outDir, { recursive: true });
    await writeXlsxFile(
      sheets.map(([sheetName, rows]) => ({
        sheet: sheetName,
        data: rows,
      })),
    ).toFile(outFile);
    console.log("  ✔ 已导出: " + outFile);
    console.log("  sheet 数: " + addedSheets);
  }
  console.log("");
}

// ─── mock-clean ──────────────────────────────────────────────────────────

function mockCleanOptions() {
  const domainArg = args.find((arg) => arg.startsWith("--domain"));
  if (!domainArg) return { domain: "", cleanAll: args.includes("--all") };
  const domain = domainArg.includes("=")
    ? domainArg.split("=")[1]
    : args[args.indexOf(domainArg) + 1] || "";
  return { domain, cleanAll: args.includes("--all") };
}

function mockCleanTargets(mockDir, options) {
  if (!options.cleanAll) {
    const domainDir = path.join(mockDir, options.domain);
    return fs.existsSync(domainDir) ? [domainDir] : [];
  }
  return fs
    .readdirSync(mockDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("_"))
    .map((entry) => path.join(mockDir, entry.name));
}

function removeMockTargets(targets) {
  for (const target of targets) {
    const rel = path.relative(TARGET_DIR, target);
    if (dryRun) console.log("  [dry-run] 将删除: " + rel);
    else {
      fs.rmSync(target, { recursive: true, force: true });
      console.log("  ✔ 已删除: " + rel);
    }
  }
}

function runMockClean() {
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [mock-clean]");
  console.log("");

  const mockDir = path.join(TARGET_DIR, "mock");
  if (!fs.existsSync(mockDir)) {
    console.log("  ⚠ mock/ 目录不存在，无需清理");
    console.log("");
    return;
  }

  const options = mockCleanOptions();

  if (!options.domain && !options.cleanAll) {
    console.error("  ✖ 请指定 --domain <name> 或 --all");
    console.error("  示例: wl-skills mock-clean --domain mdata");
    console.error("        wl-skills mock-clean --all");
    console.error("");
    process.exit(1);
  }

  const toRemove = mockCleanTargets(mockDir, options);
  if (!options.cleanAll && toRemove.length === 0) {
    console.log(`  ⚠ mock/${options.domain}/ 不存在\n`);
    return;
  }

  if (toRemove.length === 0) {
    console.log("  ✔ 无需清理（仅剩 _utils.ts）");
    console.log("");
    return;
  }

  removeMockTargets(toRemove);

  console.log("");
  if (!dryRun) {
    console.log("  建议：将 .env.dev 中 ENV_MOCK 改为 false");
    console.log("  然后运行 wl-skills validate 检查页面无 mock 依赖残留");
    console.log("");
  }
}

// ─── 主路由 ─────────────────────────────────────────────────────────────

// ─── 命令: fix（确定性机械修复）──────────────────────────────────────────

function runEnv() {
  console.log("");
  console.error("  ✖ env 旧标准化命令已停用，避免生成多份 .env.*");
  console.error("  → 请使用 wl-skills standard-env scan/plan/apply/verify");
  console.log("");
  process.exitCode = 1;
}

function buildStandardEnvOptions() {
  const options = {};
  for (const [flag, key] of [
    ["--profile", "profile"],
    ["--profile-file", "profileFile"],
    ["--module-name", "moduleName"],
    ["--local-api", "localApi"],
    ["--local-public", "localPublic"],
    ["--local-mode", "localMode"],
    ["--local-routes", "localRoutes"],
  ]) {
    const value = readOption(flag);
    if (value) options[key] = value;
  }
  return options;
}

function verifyStandardEnvAction(options) {
  const profile = options.profile || options.profileFile
    ? resolveStandardEnvProfile(options, TARGET_DIR)
    : undefined;
  const validation = verifyStandardEnv(TARGET_DIR, {
    profile,
    runBuild: args.includes("--build"),
  });
  return {
    action: "verify",
    root: TARGET_DIR,
    status: validation.valid ? "standard" : "invalid",
    inspection: validation.inspection,
    profile,
    moduleName: validation.inspection.module.resolved,
    warnings: validation.warnings.map((item) => item.message),
    errors: validation.errors.map((item) => item.message),
    changes: [],
    validation,
  };
}

function executeStandardEnvAction(action, options) {
  const actions = {
    scan: () => scanStandardEnv(TARGET_DIR),
    plan: () => planStandardEnv(TARGET_DIR, options),
    apply: () => applyStandardEnv(TARGET_DIR, {
      ...options,
      confirmApply: args.includes("--confirm") && !dryRun,
    }),
    verify: () => verifyStandardEnvAction(options),
  };
  return actions[action]();
}

function isStandardEnvAction(action) {
  return ["scan", "plan", "apply", "verify"].includes(action);
}

function runStandardEnv() {
  const action = positional[1] || "scan";
  if (!isStandardEnvAction(action)) {
    console.error("");
    console.error(`  ✖ 未知 standard-env 子命令: "${action}"`);
    console.error("  可用子命令: scan / plan / apply / verify");
    console.error("");
    process.exitCode = 1;
    return;
  }

  const options = buildStandardEnvOptions();
  let result;
  try {
    result = executeStandardEnvAction(action, options);
  } catch (error) {
    console.error("");
    console.error("  ✖ 标准环境配置失败: " + error.message);
    console.error("");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log(formatStandardEnvResult(result));
  if (action === "apply" && !args.includes("--confirm")) {
    console.log("提示：apply 默认只预览；确认写入必须加 --confirm。");
  }
  console.log("");
  if (result.blocked || result.validation?.valid === false) process.exitCode = 1;
}

function runFix() {
  const scanPath =
    args.find((a) => !a.startsWith("-") && a !== command) || "src/views";
  console.log("");
  console.log("  wl-skills-kit v" + PKG.version + "  [fix]" + (dryRun ? "  [dry-run]" : ""));
  console.log("  扫描目录: " + scanPath);
  console.log("");

  const result = runSafeFix(TARGET_DIR, scanPath, { dryRun });
  if (result.files.length === 0) {
    console.log("  ✔ 未发现可自动修复的机械偏差");
    console.log("");
    return;
  }
  for (const f of result.files) {
    for (const change of f.changes) {
      console.log("  " + (dryRun ? "将修复" : "已修复") + "  " + f.rel + " — " + change);
    }
  }
  console.log("");
  console.log(
    "  " + (dryRun ? "预览" : "完成") + "：" + result.fixedCount + " 处机械修复，涉及 " + result.files.length + " 个文件",
  );
  if (!dryRun) {
    console.log("");
    console.log("  → 建议执行 wl-skills validate 复扫确认；语义级偏差仍需 AI 或人工处理");
  }
  console.log("");
}

function loadDeliveryProfile() {
  const profileFile = readOption("profile-file");
  if (!profileFile) {
    const profileName = readOption("profile", DEFAULT_DELIVERY_PROFILE.profileId);
    if (profileName !== DEFAULT_DELIVERY_PROFILE.profileId) {
      throw new Error(`未知内置交付 profile：${profileName}；自定义 profile 请使用 --profile-file`);
    }
    return DEFAULT_DELIVERY_PROFILE;
  }
  const resolved = path.resolve(TARGET_DIR, profileFile);
  const profile = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!profile.profileId || !profile.protocolVersion || !profile.transport?.operations) {
    throw new Error("自定义交付 profile 缺少 profileId/protocolVersion/transport.operations");
  }
  return profile;
}

function printContractResult(result) {
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printContractItems(result.errors, "✖", console.error);
  printContractItems(result.warnings, "⚠", console.warn);
  console.log(`  ${result.ok ? "✔" : "✖"} errors=${result.summary?.errors || 0}, warnings=${result.summary?.warnings || 0}`);
}

function printContractItems(items, symbol, logger) {
  for (const item of items || []) logger(`  ${symbol} ${item.code} ${item.location}: ${item.message}`);
}

function resolveContractOutput(requested) {
  const output = path.resolve(TARGET_DIR, requested);
  const relative = path.relative(TARGET_DIR, output);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("输出路径必须位于当前项目内");
  }
  return output;
}

function writeContractOutput(requested, content) {
  const output = resolveContractOutput(requested);
  if (fs.existsSync(output) && !force) {
    throw new Error(`输出已存在：${requested}；确认覆盖请加 --force`);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (fs.existsSync(output)) {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    fs.copyFileSync(output, `${output}.bak.${stamp}`);
  }
  const temp = `${output}.tmp-${process.pid}`;
  fs.writeFileSync(temp, content, "utf8");
  if (fs.existsSync(output)) fs.rmSync(output, { force: true });
  fs.renameSync(temp, output);
  return path.relative(TARGET_DIR, output).replace(/\\/g, "/");
}

function runContractInit(profile) {
  const contract = buildStandaloneContract({
    profile,
    contractId: readOption("contract-id"),
    service: readOption("service"),
    resource: readOption("resource"),
    module: readOption("module"),
    permissionPrefix: readOption("permission-prefix"),
    entity: readOption("entity"),
    description: readOption("description"),
    externalId: readOption("external-id"),
    sourceMode: readOption("source-mode", "requirements"),
  });
  const output = readOption("output", "wl-api-contract.json");
  if (!args.includes("--confirm") || dryRun) {
    const result = { ok: true, preview: true, output, contract };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`  预览：将创建 ${output}`);
      console.log("  默认不写入；确认后执行同一命令并加 --confirm");
    }
    return;
  }
  const written = writeContractOutput(output, `${JSON.stringify(contract, null, 2)}\n`);
  console.log(`  ✔ 已创建独立 API 契约：${written}`);
}

function reportContractValidation(result) {
  printContractResult(result);
  if (!result.ok) process.exitCode = 1;
}

function runContractValidate(profile) {
  const input = readOption("input") || positional[2];
  if (!input) throw new Error("contract validate 缺少 --input <file>");
  reportContractValidation(validateApiContract(
    readApiContract(path.resolve(TARGET_DIR, input)),
    { profile, strict },
  ));
}

function runContractCompare(profile) {
  const left = readOption("left");
  const right = readOption("right");
  if (!left || !right) throw new Error("contract compare 需要 --left <file> --right <file>");
  reportContractValidation(compareApiContracts(
    readApiContract(path.resolve(TARGET_DIR, left)),
    readApiContract(path.resolve(TARGET_DIR, right)),
    { profile, strict },
  ));
}

function runContractRender(profile) {
  const input = readOption("input");
  if (!input) throw new Error("contract render 缺少 --input <file>");
  const contract = readApiContract(path.resolve(TARGET_DIR, input));
  const validation = validateApiContract(contract, { profile, strict });
  if (!validation.ok) {
    reportContractValidation(validation);
    return;
  }
  const output = readOption("output", "api.md");
  if (!args.includes("--confirm") || dryRun) {
    console.log(`  预览：将从 ${input} 渲染 ${output}；确认写入请加 --confirm`);
    return;
  }
  console.log(`  ✔ 已生成：${writeContractOutput(output, renderApiMarkdown(contract))}`);
}

function runContractAction(action, profile) {
  const actions = {
    profile: () => console.log(JSON.stringify(profile, null, 2)),
    init: () => runContractInit(profile),
    validate: () => runContractValidate(profile),
    compare: () => runContractCompare(profile),
    render: () => runContractRender(profile),
  };
  if (!actions[action]) throw new Error(`未知 contract 子命令：${action}`);
  actions[action]();
}

function runContract() {
  try {
    runContractAction(positional[1] || "profile", loadDeliveryProfile());
  } catch (error) {
    console.error(`  ✖ API 契约失败：${error.message}`);
    process.exitCode = 1;
  }
}

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
    runExport().catch((e) => {
      console.error("  ✖ 导出失败: " + (e && e.message ? e.message : e));
      process.exit(1);
    });
    break;
  case "mock-clean":
    runMockClean();
    break;
  case "fix":
    runFix();
    break;
  case "env":
    runEnv();
    break;
  case "standard-env":
    runStandardEnv();
    break;
  case "contract":
    runContract();
    break;
  default:
    console.error(
      '  ✖ 未知命令: "' + command + '"，请使用 --help 查看可用命令',
    );
    process.exit(1);
}

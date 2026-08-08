"use strict";

/**
 * 多编辑器适配产物生成器。
 *
 * 规则正文和 Skill 流程仍以 files/.wl-skills 为唯一事实源；这里仅生成各编辑器
 * 能原生发现的薄适配层，避免复制整套 Skill 后出现双份维护和版本漂移。
 */

const fs = require("fs");
const path = require("path");

const AUTO_HEADER_NOTE =
  "<!-- 由 @agile-team/wl-skills-kit 自动生成。薄壳入口 → .wl-skills/copilot-instructions-full.md -->\n" +
  "<!-- 请勿手动编辑本文件，更新时重新执行：pnpm dlx @agile-team/wl-skills-kit@latest update -->\n\n";

function assertSafeRelativePath(relPath, label) {
  const normalized = path.posix.normalize(String(relPath || "").replace(/\\/g, "/"));
  if (!normalized || normalized === "." || path.isAbsolute(normalized) || normalized.startsWith("../")) {
    throw new Error(`${label} 不是安全的项目相对路径: ${relPath}`);
  }
  return normalized;
}

function readRegistry(filesDir) {
  const registryPath = path.join(
    filesDir,
    ".wl-skills",
    "skills",
    "_compat",
    "editors.json",
  );
  if (!fs.existsSync(registryPath)) throw new Error("_compat/editors.json 不存在");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!Array.isArray(registry.editors)) throw new Error("_compat/editors.json 缺少 editors 数组");
  return registry;
}

function parseYamlScalar(raw) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`frontmatter 字段不是有效双引号字符串: ${value}`);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

function frontmatterField(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? parseYamlScalar(match[1]) : "";
}

function parseSkillMetadata(content, sourcePath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${sourcePath}: 缺少 YAML frontmatter`);
  const name = frontmatterField(match[1], "name");
  const description = frontmatterField(match[1], "description");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`${sourcePath}: name 必须是 kebab-case，实际为 ${name || "<empty>"}`);
  }
  if (!description) throw new Error(`${sourcePath}: description 不能为空`);
  return { name, description };
}

function collectSkillFiles(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSkillFiles(fullPath, output);
    else if (entry.name === "SKILL.md") output.push(fullPath);
  }
  return output;
}

function canonicalSkills(filesDir) {
  const skillsRoot = path.join(filesDir, ".wl-skills", "skills");
  return collectSkillFiles(skillsRoot)
    .map((sourcePath) => {
      const content = fs.readFileSync(sourcePath, "utf8");
      const metadata = parseSkillMetadata(content, sourcePath);
      const folderName = path.basename(path.dirname(sourcePath));
      if (folderName !== metadata.name) {
        throw new Error(`${sourcePath}: 文件夹名 ${folderName} 与 Skill name ${metadata.name} 不一致`);
      }
      return {
        ...metadata,
        canonicalPath: path.relative(filesDir, sourcePath).replace(/\\/g, "/"),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function nativeSkillAdapter(skill) {
  return `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n# wl-skills 原生发现适配器\n\n本文件只负责让当前编辑器原生发现 \`${skill.name}\`，不复制业务流程。\n\n执行前必须：\n\n1. 完整读取 \`${skill.canonicalPath}\`。\n2. 以该文件所在目录为基准解析它引用的 \`references/\`、\`templates/\` 和其他相对路径。\n3. 以规范源文件为唯一事实源执行；不得仅根据本适配器猜测或省略步骤。\n`;
}

function addConfig(configs, relPath, content) {
  if (configs.has(relPath)) throw new Error(`编辑器适配输出路径重复: ${relPath}`);
  configs.set(relPath, content);
}

function addNativeSkillConfigs(configs, filesDir, discoveryPath) {
  const root = assertSafeRelativePath(discoveryPath, "skillDiscoveryPath");
  for (const skill of canonicalSkills(filesDir)) {
    const relPath = path.posix.join(root, skill.name, "SKILL.md");
    addConfig(configs, relPath, nativeSkillAdapter(skill));
  }
}

function buildEditorConfigs(filesDir, entryBody) {
  const registry = readRegistry(filesDir);
  const headersDir = path.join(filesDir, ".wl-skills", "skills", "_compat", "headers");
  const configs = new Map();
  for (const editor of registry.editors) {
    if (editor.enabled === false) continue;
    const outputPath = assertSafeRelativePath(editor.outputPath, `${editor.name}.outputPath`);
    if (outputPath !== ".github/copilot-instructions.md") {
      const headerPath = path.join(headersDir, editor.headerFile || "");
      if (!editor.headerFile || !fs.existsSync(headerPath)) {
        throw new Error(`${editor.name}: 缺少 header 模板 ${editor.headerFile || "<empty>"}`);
      }
      const header = fs.readFileSync(headerPath, "utf8");
      addConfig(configs, outputPath, header + AUTO_HEADER_NOTE + entryBody);
    }
    if (editor.skillDiscoveryPath) {
      addNativeSkillConfigs(configs, filesDir, editor.skillDiscoveryPath);
    }
  }
  return [...configs.entries()];
}

module.exports = {
  buildEditorConfigs,
  canonicalSkills,
  nativeSkillAdapter,
  parseSkillMetadata,
};

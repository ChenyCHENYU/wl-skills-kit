"use strict";

/**
 * 多编辑器适配产物生成器。
 *
 * 规则正文和 Skill 流程仍以 files/.wl-skills 为唯一事实源；这里仅生成各编辑器
 * 能原生发现的薄适配层，避免复制整套 Skill 后出现双份维护和版本漂移。
 */

const fs = require("fs");
const path = require("path");
const { taskGateway, taskEntryGuidance } = require("./task-gateway");
const { gatewayInstallPaths } = require("./host-profiles.cjs");
const { resolveIntegration } = require("./project-integration.cjs");

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
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.replace(/^Skill:\s*/i, "").replace(/\s*[（(][a-z][a-z0-9-]*[）)](?:v\d+)?\s*$/i, "").trim() || name;
  return { name, title, description };
}

/**
 * 从 Skill 注册表读取已启用的规范源路径。
 *
 * 注册表是路由、数量和编辑器原生发现的唯一事实源；不能再通过递归目录把
 * 尚未登记的实验 Skill 暴露给某个编辑器，造成不同编辑器能力不一致。
 */
function registeredSkillPaths(filesDir) {
  const registryPath = path.join(filesDir, ".wl-skills", "skills", "_registry.md");
  if (!fs.existsSync(registryPath)) throw new Error("skills/_registry.md 不存在");
  const source = fs.readFileSync(registryPath, "utf8");
  const paths = new Set();
  const pattern = /`(skills\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\/SKILL\.md)`/g;
  let match;
  while ((match = pattern.exec(source)) !== null) paths.add(match[1]);
  if (paths.size === 0) throw new Error("skills/_registry.md 未登记任何 Skill 路径");
  return [...paths].sort();
}

function canonicalSkills(filesDir) {
  return registeredSkillPaths(filesDir)
    .map((registryPath) => {
      const sourcePath = path.join(filesDir, ".wl-skills", registryPath);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`skills/_registry.md 引用了不存在的 Skill: ${registryPath}`);
      }
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

function buildEditorConfigs(filesDir, entryBody, options = {}) {
  const policy = options.gatewayRoots ? options : resolveIntegration(options);
  const gateway = taskGateway();
  const configs = gatewayInstallPaths("@agile-team/wl-skills-kit", policy).map(rel => [rel, gateway]);
  const body = `# WL 前端任务入口\n\n仅适用于目标自身已接入 Kit 的 PC Vue/Web 管理端。\n\n${taskEntryGuidance()}\n\n以真实 notice 说明匹配技能、实际执行与待检查项。按返回的实际路径读取所需技能和规范，依照用户授权执行，并用同一 runId 回查。\n`;
  for (const rel of policy.entryFiles) configs.push([rel.replaceAll("<skill>", "wl-skills-kit"), body]);
  return configs;
}

module.exports = {
  buildEditorConfigs,
  canonicalSkills,
  parseSkillMetadata,
  registeredSkillPaths,
};

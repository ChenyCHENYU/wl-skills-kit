# Changelog

## [1.1.4] - 2026-04-09

### 修复

- 补充遗漏的 `env.local.json` 模板文件到 `files/.github/skills/menu-sync/env/`
- 文件内容为占位符模板（非真实凭据），安装后用户按 `guide.md` 填写实际值

## [1.1.3] - 2026-04-09

### 重构：convention-extract → convention-audit（规范审计）

- **定位翻转**：从"扫描代码提炼规范"改为"用规范审计代码"
  - 旧：项目代码 → 提炼 → 规范文档（代码乱则规范乱）
  - 新：copilot-instructions.md（标准） → 审计 → 偏差报告 + 整改建议
- SKILL.md 完全重写：10 项审计维度、偏差严重度定义、报告模板、执行步骤
- copilot-instructions.md 注册表触发关键词更新：提炼规范 → 规范审计/代码审计/规范检查
- use-skill.md、wl-skills-kit.md 相关描述同步更新

## [1.1.2] - 2026-04-09

### 新增：Skills 自动调度注册表

- `copilot-instructions.md` 末尾新增 **Skills 自动调度** 章节，包含：
  - Skill 注册表（触发关键词 → 必须读取的 SKILL.md 文件映射）
  - 完整流水线（prototype-scan → api-contract → page-codegen → menu-sync）
  - 单独使用模式（只触发单个 Skill）
  - 组件文档按需查阅表 + 领域样例参考表
- 所有编辑器配置文件（8 个）均继承此注册表，实现 **全编辑器 Skill 自动调度**
- README 更新：Skill 识别列从 "⚠️ 需手动引用" → "✅ 通过注册表自动 read_file"

## [1.1.1] - 2026-04-09

### 修复

- 修复 wl-skills-kit.md 中 10 处 `@jhlc/wl-skills-kit` 过时包名引用 → `@agile-team/wl-skills-kit`
- README 新增「多编辑器 / AI 工具支持」章节，详细说明 8 个编辑器的使用姿势差异
- License 从 MIT 改为 UNLICENSED（内部使用）

## [1.1.0] - 2026-04-09

### 新增：多编辑器支持（v1.1）

- CLI 安装时自动生成 8 个编辑器配置文件（单源头：从 `copilot-instructions.md` 动态生成）
  - `AGENTS.md` — Linux Foundation 通用标准，绝大多数 AI 工具均支持
  - `CLAUDE.md` — Claude Code / Claude CLI
  - `.clinerules` — Roo Code / Cline
  - `.cursorrules` — Cursor（legacy 格式，兼容新版）
  - `.cursor/rules/conventions.mdc` — Cursor（新格式，带 `alwaysApply: true`）
  - `.windsurfrules` — Windsurf (Cascade)
  - `.kiro/steering/conventions.md` — Kiro
  - `.trae/rules/conventions.md` — Trae
- `--dry-run` 分两阶段展示：静态文件 + 编辑器配置文件
- `--help` 信息更新，列出所有新增写入路径

## [1.0.0] - 2026-04-08

### 初始发布

- 5 个 AI Skills（prototype-scan / api-contract / page-codegen / menu-sync / convention-extract）
- page-codegen 含 9 个独立模板（TPL-LIST / TPL-FORM-ROUTE / TPL-MASTER-DETAIL / TPL-TREE-LIST / TPL-DETAIL-TABS / TPL-CHANGE-HISTORY / TPL-RECORD-FORM / TPL-OPERATION-STATION / TPL-DRIVEN）
- 12 个平台组件 API 文档（jh-select / jh-date / jh-drag-row 等）
- 通用组件（global 6 个 + local 4 个 + remote 5 个 README）
- 类型桶文件 src/types/page.ts
- 领域样例 demo/（produce 8 页 + sale 5 页）
- CLI 工具 bin/wl-skills.js（--dry-run 预览）

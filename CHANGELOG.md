# Changelog

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

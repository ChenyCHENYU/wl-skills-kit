# Changelog

## [1.2.1] - 2026-04-13

### 新增：自然语言输入模式（模式 0）

- **prototype-scan**：新增模式 0（自然语言），用户口述需求时 AI 内部自动构建 page-spec JSON，无需提供原型/文档
  - 触发区块改为三模式表格（模式 0/A/B）
  - 新增关键词→交互模式映射表、降级默认值策略、page-spec 骨架模板
- **page-codegen**：支持模式 0 快捷路径，无 page-spec 时自动调用 prototype-scan 模式 0
- **copilot-instructions.md**：Skill 注册表及流水线同步更新自然语言触发词

## [1.2.0] - 2026-04-10

### 新增：CLI v2.0 — update 增量更新 + clean 构建清理

- **`update` 命令**：基于 MD5 增量更新，仅覆盖有变化的文件
  - 对比 `.wl-skills-manifest.json` 清单中的 MD5 哈希
  - 输出新增/更新/未变文件数 + 版本变化提示
  - 支持 `--dry-run` 预览
- **`clean` 命令**：构建前清理 AI 开发辅助文件
  - 删除 `.github/`、`docs/`、`demo/`、编辑器配置等非组件文件
  - **保护路径**：`src/components/` + `src/types/` 永远不会被清理
  - 删除空父目录（自动清理目录树）
  - 清除 `.wl-skills-manifest.json` 自身
  - 支持 `--dry-run` 预览
- **Manifest 清单系统**（`.wl-skills-manifest.json`）：
  - `init` / `update` 执行后自动生成，记录版本 + 文件路径 → MD5 映射
  - 供 `update` 做增量比对、`clean` 做精准删除
  - 已加入 `.gitignore`
- CLI 重构为 3 个子命令：`init`（默认，向后兼容）、`update`、`clean`
- README.md 新增「CLI 命令」章节，更新「快速开始」「更新策略」「安装行为说明」

## [1.1.7] - 2026-04-10

### 修复：menu-sync SKILL.md 漏同步

- `files/.github/skills/menu-sync/SKILL.md` 未随 v1.1.6 同步源仓库版本
- 修复内容：sysAppNo 字段补齐（配置模板/表格/示例）、`{appNo}` → `{sysAppNo}` 变量统一、响应码说明补充
- 全量审计确认 19 个同步文件 + 9 个 TPL 模板零差异

## [1.1.6] - 2026-04-10

### 修复：menu-config.md 残留引用 + env 模板字段缺失

- **5 处 `menu-config.md` 残留 → 统一为 `SYS_MENU_INFO.md`**：
  - `use-skill.md`：page-codegen 输出列 + changelog 条目
  - `menu-sync-design.md`：当前工作流 + 过渡路径
  - `TPL-DETAIL-TABS.md`：校验清单
- **env.local.json 模板补齐 `sysAppNo` 字段**（v1.1.4 发版时遗漏）
- **guide.md 补齐 `sysAppNo`**：文件结构示例、字段说明表、获取方式小节

## [1.1.5] - 2026-04-09

### 修复：page-codegen → menu-sync 数据闭环

- **问题**：page-codegen 生成分散的 `menu-config.md`（各页面目录下），menu-sync 却读取集中式 `SYS_MENU_INFO.md`，两者断裂
- **修复**：page-codegen 统一输出到 `.github/docs/SYS_MENU_INFO.md`（追加/覆盖模式，生成前必须询问用户）
- TPL-DETAIL-TABS 原有的 menu-config.md 模板移除，改为引用 SKILL.md 主文件的统一规则
- 新增「api.md 生成时序」章节：明确 api.md 先于 page-codegen（Step 2 → Step 3），确保 API_CONFIG 与接口一致
- copilot-instructions.md 流水线描述更新：Step 3 注明"追加/覆盖 SYS_MENU_INFO.md"，新增数据闭环说明
- use-skill.md 工作流 A 更新：Step 6 增加写入模式确认，Step 8 增加手动/自动两种菜单创建方式说明

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

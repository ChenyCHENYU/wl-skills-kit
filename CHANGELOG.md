# Changelog

## [2.3.2] - 2026-04-28

### 📝 输入规范文档体系 + README/目录结构优化

#### 新增 docs/ 输入规范文档（仅仓库可见，不随包分发）
- **`docs/input-spec-prototype.md`**: 原型输入规范——面向设计师/产品，含合格原型自检清单、按鈕颜色规范、Tab/视角切换标注要求、精度对比表
- **`docs/input-spec-detailed-design.md`**: 详设文档输入规范——面向业务分析师，含可直接复制的 Markdown 表格模板、字段英文名+字典 code 对精度的量化影响说明
- **`docs/input-spec-api.md`**: API 契约确认规范——面向后端开发者，含接口 URL 命名规范、api.md 两步确认工作流、常见问题答疑
- **`docs/input-spec-page-spec.md`**: page-spec JSON 参考手册——面向前端开发者，含每个字段详细注释、自检清单、手写 spec 场景指南

#### 结构和文档优化
- `README.md`: 版本读数更新为 v2.3，仓库结构图补充 `docs/` 目录说明，“进一步阅读”章节补充输入规范入口

---

## [2.3.1] - 2026-04-27

### 🔧 组件三文件分离规范补全 + 文档精准化

#### global/local 组件
- **C_SvgIcon**: Options API → `<script setup lang="ts">`，修复 `scope` typo，提取内联样式到 `index.scss`
- **C_Splitter / C_TagStatus**: 内嵌样式提取到 `index.scss`，改为外链引用
- **C_Tree**: 所有逻辑提取到 `data.ts`（`createTree()`），vue 文件精简为纯模板层
- **C_RightToolbar**: 业务逻辑（列显隐、拖拽、API 调用）提取到 `data.ts`，样式提取到 `index.scss`
- **c_listModal**: 新增 `index.scss`，消除空 style 块

#### 文档与规范
- `docs/request.md`: 补充 `ApiResult<T>` 显式类型定义，说明 mock `code:200` 与真实后端 `code:2000` 均被 interceptor 接受
- `page-codegen/SKILL.md` + `TPL-*.md`: mock 响应格式统一为 `code:2000 + message`
- `package.json`: `files` 补加 `mcp/`，修复 MCP server 从未被 npm 打包的 bug

---

## [2.1.4] - 2026-04-27

### 🔧 Mock 响应格式统一

- `page-codegen/SKILL.md`：mock 响应码 `code: 200` → `code: 2000`，`msg` → `message`，与真实后端格式完全一致
- `TPL-DETAIL-TABS.md`：全部 mock 端点（list/getById/remove/save/update）响应格式同步修正
- `TPL-RECORD-FORM.md`：getBy*/saveOrUpdate mock 端点响应格式同步修正
- 修复后 AI 生成的 mock 文件与真实后端响应结构一致，避免前端 `res.code === 2000` 判断在 mock 模式下永远失败的问题

---

## [2.1.3] - 2026-04-27

### 🔧 组件规范补全 + API 文档修正 + MCP 发布修复

#### global 组件三文件分离规范补全
- **C_SvgIcon**: Options API → `<script setup lang="ts">` 重构；修复 `<style scope>` typo（改为 `scoped`）；提取内联样式到新增 `index.scss`
- **C_Splitter**: 将 `<style scoped>` 内嵌样式全部提取到新增 `index.scss`，vue 文件改为外链引用
- **C_TagStatus**: 将 `<style scoped>` 内嵌样式全部提取到新增 `index.scss`，vue 文件改为外链引用
- **C_Tree**: 将 `<script setup>` 中所有响应式逻辑提取到新增 `data.ts`（`createTree()` 函数），vue 文件精简为模板 + 调用层
- **C_RightToolbar**: 将全部业务逻辑（列显隐、拖拽排序、保存接口调用）提取到新增 `data.ts`（`createRightToolbar()` 函数）；将 `<style scoped>` 内嵌样式提取到新增 `index.scss`

#### local 组件规范补全
- **c_listModal**: 补充 `index.scss`（空 style 块改为外链引用）

#### API 文档修正 (code:200 → code:2000)
- `demo/produce/aiflow/mmwr-customer-apply-add/api.md`: 响应示例 `code:200, result:{}` → `code:2000, data:{}`
- `docs/request.md`: 响应示例 `code: 200` → `code: 2000`，保持与架构规范一致

#### MCP Server npm 发布修复
- `package.json` `files` 字段补充 `"mcp/"` 目录，修复之前 MCP Server 代码未被打包到 npm 的严重缺失（导致 `wl-skills init` 后 `.cursor/mcp.json` 指向的 `node_modules/.../mcp/server.js` 实际不存在）

---

## [2.1.2] - 2026-04-26

### 🔧 消除 npm 发布警告

- `package.json` bin 路径去掉 `./` 前缀（`"./bin/wl-skills.js"` → `"bin/wl-skills.js"`），符合 npm 规范化要求，消除发布时的 `warn: script name was invalid` 提示

---

## [2.1.1] - 2026-04-26

### 🔧 修复与迁移增强

#### bin 字段修复
- `package.json` 新增 `"main": "./bin/wl-skills.js"` —— 修复 npm v9+ 发布时 bin 条目被剔除导致 `npx` 无法找到入口的问题
- bin 命令从 `wl-skills-kit` 重命名为 `wl-skills`（避免与包名重复触发 npm 校验警告；全局安装后可直接用 `wl-skills update`）

#### 旧版用户升级支持
- `bin/wl-skills.js` 新增 `LEGACY_PATHS` 迁移清理机制：
  - `update` 时自动检测并移除 v1.x/v2.0 遗留文件（旧 flat 结构 Skill 路径、废弃 `docs/` 文件等）
  - 共 24 个旧版路径纳入清理名单，避免新旧结构并存产生 AI 调度歧义
  - 输出 "迁移: N 个旧版文件已移除" 统计信息
- README 新增"从早期版本升级"章节（含 `env.local.json` 迁移注意事项）

---

## [2.1.0] - 2026-04-26

### 🎯 多 AI 编辑器适配解耦 + 文档体系完善

#### 解耦的多 AI 配置层
- `files/.github/skills/_compat/` 由"说明文档"重构为**可执行配置层**：
  - 新增 `editors.json`：编辑器注册表（bin 读此文件决定生成什么）
  - 新增 `headers/`：每个编辑器特化 frontmatter 模板（cursor-mdc / kiro / trae 等）
  - 新增 `README.md`：解耦机制说明
- `bin/wl-skills.js` 重构 `getEditorConfigs()`：从 `editors.json` 动态加载，**任意编辑器 `enabled: false` 不影响其他**
- 各编辑器特化 frontmatter：Cursor 含 `description+globs+alwaysApply`，Kiro 含 `inclusion`，Trae 含 `description+globs`，等

#### Skill 分级目录
- `skills/` 重组为 `core/`（5 个）+ `sync/`（3 个）+ `ops/`（1 个）+ `domain/`（占位）
- 16 处旧路径引用已批量更新

#### 完善 Skill 文档（人读 vs AI 读）
- 每个启用 Skill 同目录新增 `USAGE.md`（团队成员阅读，含示例对话/踩坑/FAQ），与 `SKILL.md`（AI 触发用）并存
- 维护文档 `*.MAINTAIN.md` 已在 `kit-internal/skills/`

#### api-contract 基于真实响应重写
- 响应外壳：`{ code: 2000, message, data }`（**非 result，非 200**）
- 分页字段完整描述：`records / total / current / size / pages / countId / maxLimit / orders / searchCount`
- 增加成功/失败/字典/单条/数组各形态示例
- 业务代码 `.then(res => res)` 拿到的就是 `data`（拦截器已剥壳）

#### PLANNED Skill 草稿补全
- `dict-sync/SKILL.draft.md`：完整设计（数据流/三种模式/冲突策略/转正任务）
- `permission-sync/SKILL.draft.md`：权限码命名规范 + 三种模式 + 安全约束
- `code-fix/SKILL.draft.md`：受控修复工作流 + 偏差类型对照 + 防御对抗 prompt

#### 仓库结构治理
- `ARCHITECTURE-PLAN.md` 归档至 `kit-internal/history/`
- 新增 `kit-internal/jenkins-pipeline.md`（Jenkins 参考模板，不强加业务项目）
- README 重写：**严格区分** A. 本仓库结构（维护用）vs B. 业务项目安装结构（业务方用），杜绝混淆

#### 验证
- `npm pack --dry-run`：157 文件 / 247kB（kit-internal 已正确排除）
- 端到端 `init`：149 个文件正确生成；禁用 kiro 后只少 1 个文件（解耦验证通过）

---

## [2.0.0] - 2026-04-26

### 🚀 重大架构升级

#### 模块化规范 + 懒加载门控

- 将原 619 行单文件 `copilot-instructions.md` 中的 12 条规范抽出为独立 `standards/01 ~ 12.md`
- **新增第 13 条 `13-platform-components.md`**——平台组件对照表 + docs 前置读取清单（核心 AI 质量门控）
- 新增 `standards/index.md`，按任务类型（A 生成 / B 重构 / C 审计 / D 模板提取 / E 同步 / F Git）映射规范子集，按需加载
- `copilot-instructions.md` 精简至 ~320 行（减少 48%）

#### 模板分层（universal / domains）

- 8 个通用模板移到 `templates/universal/`：TPL-LIST、TPL-FORM-ROUTE、TPL-MASTER-DETAIL、TPL-TREE-LIST、TPL-DETAIL-TABS、TPL-CHANGE-HISTORY、TPL-RECORD-FORM、TPL-DRIVEN
- 领域专属模板移到 `templates/domains/`：produce 域 TPL-OPERATION-STATION 等
- 新增 `templates/_index.md` 模板注册表
- 新增 `templates/domains/_CONTRIBUTING.md` 领域模板贡献规范

#### 报告分类（reports/）

- 新增 `.github/reports/` 目录，三类文件分离：
  - **系统数据**：`SYS_MENU_INFO.md` / `SYS_DICT_INFO.md`[PLANNED] / `SYS_PERMISSION_INFO.md`[PLANNED]
  - **审计偏差**：`规范审查报告.md`
  - **提取建议**：`组件提取建议.md`
- 全部追加写入，不覆盖团队累积数据
- `init` / `update` 自动保护已存在的 reports 文件
- `clean --keep-reports` 标志可保留累积数据

#### Pre-flight 约定式输出

- 每个 Skill 触发后强制输出 Pre-flight 声明（已读文件、工具链状态、cid 等）
- 工具链检测失败强制暂停，输出 ❌ 红叉提示 + CHENY 工号 409322

#### 新增 Skill

- ✅ **template-extract** — AI 辅助的领域模板提取流程（开发者指路 + AI 读代码 + AI 写模板）
- ✅ **convention-audit**（重命名自 convention-extract 并升级）— 13 条规范全量扫描，输出双报告
- ⏳ **dict-sync** [PLANNED] — 字典数据批量同步
- ⏳ **permission-sync** [PLANNED] — 权限数据批量同步
- ⏳ **code-fix** [PLANNED] — 自动整改 🟢🟡 等级偏差

#### 多 AI 编辑器适配

- 新增 `skills/_compat/ai-model-matrix.md` — 8 种 AI 编辑器能力矩阵
- 新增 `skills/_compat/editor-setup.md` — 编辑器配置 + 5 步团队接入指南
- `bin/wl-skills.js` 已支持 8 种主流 AI 编辑器配置自动生成

#### 维护者文档目录

- 新增仓库根目录 `kit-internal/`（与 files/ 同级）
  - `README.md` / `CONTRIBUTING.md` / `architecture.md`
  - `standards.MAINTAIN.md` / `templates.MAINTAIN.md`
  - `skills/_planned-skills.md`
- 不在 `package.json` files 字段，自然排除于 npm 包外

#### 目录调整（破坏性变更）

- `docs/` → `guides/`（英文统一，避免 Windows 中文路径问题）
- `docs/SYS_MENU_INFO.md` → `reports/SYS_MENU_INFO.md`
- 删除 `docs/menu-sync-design.md`（合并至 `guides/architecture.md`）
- 删除 `docs/wl-skills-kit.md`（合并至 README.md）
- 重写 `docs/use-skill.md` → `guides/usage.md`

#### CLI 增强

- `init` / `update`：`.github/reports/*.md` 已存在则跳过（保护团队累积）
- `clean`：新增 `--keep-reports` 选项

### 迁移指南（从 v1.x 升级）

执行 `npx @agile-team/wl-skills-kit@latest update` 即可。注意：

1. 老的 `docs/SYS_MENU_INFO.md` 需手动迁移到 `reports/SYS_MENU_INFO.md`
2. 老的 `docs/menu-sync-design.md` / `docs/wl-skills-kit.md` 已删除，相关内容见 `guides/architecture.md`
3. 老的 `convention-extract` Skill 重命名为 `convention-audit`，触发词扩展

---

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

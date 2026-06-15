# wl-skills-kit 架构索引（ADR Index）

> **维护者**：CHENY（工号 409322）
> **当前版本基线**：见 `package.json` / `README.md`（不在本文件硬编码）
> **本文件定位**：仅做 **架构决策的历史索引** + **当前架构指针**。完整的当前能力盘点、Skill 列表、MCP Tool 清单、Pipeline 协议等**不在此处维护**。

---

## 当前架构（永远以下游为准）

| 维度 | 单一数据源 |
|---|---|
| 当前版本 / 描述 | `package.json` |
| 完整能力盘点（Skill / MCP / CLI / Pipeline 状态） | `docs/全盘分析与智能体搭建指南.md` |
| AI 全景架构演进 | `docs/ai全景分析.md` |
| Agent Pipeline 执行手册 | `docs/agent-pipeline-runbook.md` |
| MCP Tool 风险矩阵 | `docs/mcp-tool-risk-matrix.md` |
| Skill 路由表 / 触发词 | `files/.wl-skills/skills/_registry.md` |
| Skill I/O 契约 | `files/.wl-skills/skills/_pipeline.md` |
| 多编辑器适配注册表 | `files/.wl-skills/skills/_compat/editors.json` |
| MCP Tool 描述符（auto-discovery） | `mcp/registry.js` |
| 业务方使用指南 | `files/.wl-skills/guides/usage.md` |
| 业务方架构说明 | `files/.wl-skills/guides/architecture.md` |

> 维护这些文档时，**只在上述位置改一份**。本文件只是路径地图，不复制内容。

---

## ADR 历史

> 按时间倒序。每条 ADR 记录"做了什么决策、为什么、影响面"。
> 实施细节 / 当前状态参见上方"单一数据源"。

### ADR-009（v2.10.0，2026-05-31）— 双线解构：原型线 / 规范线隔离

**做了什么**：

- 新增 `core/spec-doc-parse` Skill：专门解构 wl-skills-design 产出的标准《需求设计说明书》（IPO 表 / 功能编码 / 流程五要素）→ page-spec JSON
- 与 `prototype-scan`（原型线）硬隔离：`_registry.md` 调度规则加「优先级 0」——输入命中 `docs/spec/` / 功能编码 / IPO 表特征时强制路由 spec-doc-parse，禁止 prototype-scan 接管
- `prototype-scan` 模式 B 由「详设文档」收敛为「**非规范零散详设**」，加入排除声明，避免与规范文档混淆
- `spec-doc-parse` 自带自闭环：Pre-flight + Parse Validation 五项检查 + 自动修复纠偏 + 解析报告（`SPEC_PARSE_*.md`）
- `convention-audit` 新增 `--mode spec-align`：比对 spec 字段 vs 代码字段，输出 GAP 报告（`SPEC_GAP_*.md`），完成「说明书 → 代码」闭环验证
- 同步更新 `_registry.md` / `_pipeline.md` / `copilot-instructions.md` / `lint-skills.js`

**为什么**：

- wl-skills-design = 上游「生成标准」，wl-skills-kit = 下游「解构标准」，职责必须分清
- 标准说明书是高精度结构化文档（95-100%），落入 prototype-scan 模式 B 走通用推断会损耗精度
- 原型线与规范线若不隔离，后期触发词会互相污染，两条线都做不到最优

**影响面**：

- 业务项目：新增一条「有标准说明书 → spec-doc-parse」路径，原型线行为不变
- 维护者：启用 Skill 数 10 → 11，已由 `_registry.md` 自动计数同步到各处
- 上下游：与 wl-skills-design 形成 `design 生成 → kit 解构 → 代码` 完整链路

---

### ADR-008（v2.7.0，2026-05-12）— 一致性治理与可测性升级

**做了什么**：

- CLI 加未知 flag / 未知命令防护，避免误装
- 引入 `scripts/verify-version.js` 自检版本与 Skill 数一致性
- `scripts/sync-version.js` 改为从 `_registry.md` 自动算 `SKILL_COUNT`，从 `mcp/registry.js` 自动算 `MCP_TOOL_COUNT`
- 新增 `mcp/registry.js`：MCP Tool auto-discovery，`server.js` 不再硬编码 17 项 switch case
- `copilot-instructions.md` 删除 Skill 状态表，统一指向 `_registry.md`
- `dict-sync` / `code-fix` 补 `USAGE.md`，与其他 Skill 一致
- 加入 `vitest` 基础单元测试

**为什么**：

- v2.5.x → v2.6.0 期间，Skill 计数有 3 处独立维护（sync-version 常量 / _registry / copilot Skill 表），漂移风险持续存在
- CLI 默认走 init 在维护者环境踩中过（`--version` 误把 kit 装到仓库根）
- MCP Tool 列表硬编码在 server.js，新增 Tool 要改 3 处（TOOLS 数组、handler 引入、switch case），维护成本偏高

**影响面**：

- 业务项目：无破坏性变更，业务侧使用方式不变
- 维护者：新增 Skill 仅需改 `_registry.md`；新增 MCP Tool 仅需改 `mcp/registry.js`
- CI：可加 `pnpm version:verify` 阻断不一致的发版

---

### ADR-007（v2.6.0，2026-05-12）— 业务理解闭环

**做了什么**：

- 新增 `business-doc-extract` Skill，落点 `docs/business/`
- 语义级智能触发（不依赖固定关键词），碎片化场景默认不触发
- 同步更新 `_registry.md` / `_pipeline.md` / `copilot-instructions.md`，把它定位为 `prototype-scan → api-contract` 之间的建议性插入点

**为什么**：

- 资料达模块/项目级时，缺少"业务理解层"的统一沉淀位置
- 页面级 `api.md` 不应承载模块需求 / 字典枚举 / 字段清单，否则越长越散

**影响面**：

- 页面级 `api.md` 仍位于 `src/views/**/api.md`（接口契约唯一详细位置），不重复维护字段
- 模块 `docs/business/0X-xx/index.md` 只做链接索引

详情参考 `CHANGELOG.md` 2.6.0 条目与 `files/.wl-skills/skills/core/business-doc-extract/SKILL.md`。

---

### ADR-006（v2.5.x）— Agent Pipeline 协议落地

**做了什么**：

- 新增 `_pipeline.md`，定义 Skill I/O / next_suggest / 人工确认边界
- 新增 `docs/agent-pipeline-runbook.md`、`docs/mcp-tool-risk-matrix.md`
- `validate-page` / `doctor-ui` CLI 命令落地，闭环验证页面规范

**为什么**：

- 让 Agent 把"复杂任务拆成可验证步骤"成为可观测的协议，而不是黑盒一气呵成

---

### ADR-005（v2.1.x）— 多 AI 编辑器适配解耦

**做了什么**：

- `_compat/editors.json` 作为编辑器注册表
- `_compat/headers/` 各编辑器 frontmatter 单独维护
- `bin/wl-skills.js#getEditorConfigs()` 仅从注册表读，不再硬编码

**为什么**：

- v2.0 时 9 个编辑器硬编码在 CLI 里，frontmatter 只对 Cursor 做了特化，其他全部用相同格式，导致单平台体验劣化
- 新增编辑器要改代码，门槛高

---

### ADR-001..004（v2.0，2026-04-26）— 第一轮模块化重构

**做了什么**：

- ADR-001 模块化规范 + 懒加载门控：copilot-instructions 619 行单文件 → standards/ 13 条 + index.md 任务门控
- ADR-002 模板分层：page-codegen/templates/ 拆 universal / domains
- ADR-003 报告分类 + 追加不覆盖：docs/ → reports/ 三类（系统数据 / 审计 / 提取建议）
- ADR-004 Pre-flight 约定式输出：每个 Skill 触发后强制输出已读文件、工具链状态、cid 等

**为什么**：

- v1.x 单文件 619 行 AI 全量加载浪费 token
- 9 个 TPL 平铺无法区分通用/领域
- AI 跳过规范前置读取没有可观测信号

**取舍**：

- 不用 JSON Schema 描述规范：JSON 对人类可读性差，AI 加载后还要解释；Markdown 更适合"AI 阅读 + 团队人工 review"
- 不让 AI 自动同步多 AI 编辑器配置：不同编辑器对 frontmatter / 路径 / 触发机制各有差异，强行统一会拉低单平台体验
- 组件提取建议人工 review：AI 识别"这 5 个页面看起来一样"的准确率不高，强行自动化会污染团队代码

---

## 维护准则

1. **本文件不复制能力清单**：当前 Skill 数 / MCP Tool 数 / CLI 命令数等，统一通过"单一数据源"表格里的文件查询
2. **每个版本只新增一条 ADR**：在最上方追加，不修改历史 ADR 内容（如发现错误，加补丁说明而不是改原文）
3. **影响面字段必填**：每条 ADR 必须说明"对业务项目"和"对维护者"两个维度的影响
4. **架构图改动**：只在 `docs/全盘分析与智能体搭建指南.md` 维护

---

## 历史归档

更早的版本规划 / 已废弃方案见 `kit-internal/history/`。

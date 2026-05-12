---
name: business-doc-extract
description: "Use when: 用户提供原型目录（如已发布的 Axure HTML 文件夹）、详设/需求文档、字段或字典资料、已有页面目录等业务资料，并希望沉淀业务理解、对齐产品/后端、维护字段字典或维护待确认事项。Skill 不依赖固定关键词，依据资料源 + 用户意图 + 范围完整度智能判断；碎片化问答、单截图、小修小改默认不触发。Triggers on (语义级，仅作示例): 业务梳理 / 业务文档 / docs/business / 模块大纲 / 字段字典整理 / 待确认事项 / 产品确认 / 业务全景 / 原型转业务文档 / 详设转业务文档 / 业务闭环。"
---

# Skill: 业务文档抽取（business-doc-extract）

把 **原型 / 详设 / 字段字典 / 现有代码 / api.md / mock** 等业务资料沉淀为 **`docs/business`** 下的业务理解文档，作为 `api-contract` 和 `page-codegen` 的高质量输入，同时支撑产品/后端/前端的业务确认闭环。

> **核心理念**：固化但不僵化。本 Skill 不依赖死关键词；只在用户给出可识别的业务资料源、且范围达到模块/项目级时才会建议生成；碎片化任务默认不污染业务文档。

---

## 1. 何时触发

不要把触发当成关键词匹配。请按下面 3 步判断：

1. **资料源识别**：用户消息或工作区是否包含以下任一类：
   - 已发布的 Axure / HTML 原型目录（推荐输入，最规范）
   - 详细设计 / 需求说明 / PRD / 产品文档（md / docx / xlsx）
   - 后端字段实体资料、字典资料表
   - 现有页面目录 + `api.md` + mock（用于反向梳理）
2. **意图识别**：用户的目标是否属于以下之一：
   - 梳理业务、提取业务理解、生成业务文档
   - 整理字段、字典、待确认事项
   - 模块级 / 项目级业务沉淀
   - 在生成代码前先和产品/后端确认
3. **范围识别**：资料覆盖范围是否达到模块级或项目级。

满足“资料源 + 意图 + 范围”三者，才进入本 Skill 的生成态。否则只输出对话级的业务理解片段，**不写入 `docs/business`**。

---

## 2. 决策矩阵

| 场景 | 默认行为 | 是否写入 `docs/business` |
|---|---|---|
| 用户明确说“生成业务文档 / 梳理业务 / 沉淀模块” | 进入生成态，给出计划，确认后写入 | 是（需确认） |
| 提供完整原型目录、完整详设、模块级页面集 | 建议生成 + 给出计划 | 否，先建议；用户确认后再写 |
| 提供字段表 / 字典表，目标是更新字段字典 | 进入增量更新态 | 是（仅更新对应模块的 `field.md` / `dictionary.md`，其他不动） |
| 已有 `docs/business`，用户提交新增需求 | 进入增量维护态 | 是（仅追加/更新涉及模块） |
| 单页面口述需求 / 单截图 | 不触发本 Skill | 否（仅输出页面理解、`api.md` 草案、必要时 preview） |
| 小修小改、报错调试、样式调整 | 不触发本 Skill | 否 |
| 用户要求 “先 mock 能跑” | 不阻塞 page-codegen | 否（保持轻量路径） |

> **缺资料时**：先询问用户提供资料路径，不要凭口述硬生成业务文档。

---

## 3. 输出结构

### 3.1 模块级（推荐，最常用）

```text
docs/business/
├── index.md                         # 业务全景 + 模块索引 + 实现状态
├── open-questions.md                # 全局待确认问题汇总
└── 0X-<module-kebab>/
    ├── index.md                     # 模块全景 + 页面/API 索引
    ├── requirement.md               # 需求理解 + 业务流程 + 页面清单 + 模块待确认
    ├── dictionary.md                # 字典枚举
    └── field.md                     # 字段清单
```

> 模块目录使用 `01-`、`02-` 顺序前缀，便于阅读和约定排序。

### 3.2 文件职责

| 文件 | 职责 | 不放什么 |
|---|---|---|
| `docs/business/index.md` | 项目业务定位、一级模块总览、产品目录 ↔ 代码目录映射、整体实现状态、链接 | 详细需求、字段、字典 |
| `docs/business/open-questions.md` | 跨模块待确认问题汇总表 | 模块内详细规则 |
| `0X-xx/index.md` | 模块定位、子功能清单、页面与 `api.md` 链接、模块链路摘要 | 详细需求与字段 |
| `0X-xx/requirement.md` | 需求来源、业务目标、角色、功能范围、流程图、页面清单、业务规则、异常规则、**模块待确认** | 字典/字段大表 |
| `0X-xx/dictionary.md` | 模块涉及字典 / 枚举 / 状态 | 与字典无关的字段 |
| `0X-xx/field.md` | 模块涉及业务字段、来源、使用位置 | 字典 |

### 3.3 与现有产物的边界

- **页面级 `api.md` 不搬家**：仍然位于 `src/views/**/api.md`，是接口契约的唯一详细位置；模块 `index.md` 只做链接索引。
- **mock 不动**：仍位于 `mock/`，是页面运行依赖。
- **`reports/SYS_*` 不动**：菜单/字典/权限基线仍归 sync 类 Skill。

---

## 4. 生成模式

| 模式 | 说明 | 落盘 |
|---|---|---|
| `preview` | 仅在对话中输出业务理解、待确认点、推荐结构 | 否 |
| `module` | 生成或增量更新单个 `0X-xx/` 模块文档 | 是（需用户确认） |
| `project` | 生成或刷新 `docs/business/index.md` + `open-questions.md` 全局总览 | 是（需用户确认） |
| `incremental` | 基于字段表 / 字典表 / 新需求局部增量更新已有模块文档 | 是（需用户确认） |

> Skill 不要求显式传入模式；AI 应根据资料源和意图自动判断，并在 Pre-flight 中说明。

---

## 5. Pre-flight 声明（必须输出）

```text
🚀 已触发技能 business-doc-extract/SKILL.md  → 业务理解文档抽取与维护
✅ 已识别资料源：{原型目录 / 详设文件 / 字段表 / 字典表 / 现有代码 + api.md}
✅ 已判断范围：{preview / module / project / incremental}
✅ 已读取 standards/index.md       → 任务类型 D（参考结构与组件合规）
✅ 已读取 _pipeline.md              → 与 prototype-scan / api-contract / page-codegen 的衔接关系
✅ 计划落盘：{是/否}，目标路径：{docs/business/...}
⚠ 涉及写文件：是/否；需要用户确认：是/否
```

资料缺失时必须暂停：

```text
❌ 资料源不足：未发现可用的原型目录 / 详设文档 / 字段资料 / 现有页面 + api.md
   → 请提供以下任一资料路径：
     1. 已发布的 Axure HTML 原型目录
     2. 详细设计 / 需求文档（md / docx / xlsx）
     3. 字段实体资料、字典资料表
     4. 已有页面目录与 api.md
   → 或继续走 page-codegen 模式 0（口述需求 → 页面骨架 + mock，不生成业务文档）
   ⛔ 业务文档未写入，等待资料补充。
```

---

## 6. 工作流

### 6.1 模块级（最常用）

1. 读取资料（原型 HTML / 详设 / 字段实体 / 现有 `api.md` / mock）。
2. 拆模块：把内容归类到 `0X-<module-kebab>`，使用产品目录或现有 `src/views/<域>/<模块>` 一级目录命名。
3. 生成 4 个模块文件：
   - `index.md`
   - `requirement.md`
   - `dictionary.md`
   - `field.md`
4. 更新 `docs/business/index.md`：补充模块行、状态、链接。
5. 更新 `docs/business/open-questions.md`：把模块 `requirement.md` 底部的待确认事项汇总到全局表，标注来源文件。
6. 输出完成摘要 + `next_suggest`。

### 6.2 增量更新

1. 检测 `docs/business` 已存在哪些模块。
2. 对应模块若已存在 `dictionary.md` / `field.md`：
   - 仅追加新增项，并标注 `新增` 或 `更新`。
   - 已废弃项标 `已废弃`，不直接删除。
3. 对应模块若不存在：
   - 询问归属，确认后再创建模块目录。
4. 同步刷新 `docs/business/index.md` 与 `open-questions.md`。

### 6.3 项目级刷新

1. 重新扫描 `docs/business/0X-*`，重建：
   - `docs/business/index.md` 模块表
   - `docs/business/open-questions.md` 汇总表
2. 不删除模块文件本身。
3. 给出本次新增 / 状态变更 / 已废弃模块清单。

---

## 7. 文件骨架（生成时遵循）

> Skill 同目录下的 `templates/` 提供可复用的最小骨架，AI 必须读取后再生成。

| 模板 | 路径 | 适用 |
|---|---|---|
| 项目业务全景 | `templates/business-index.md` | `docs/business/index.md` |
| 全局待确认 | `templates/business-open-questions.md` | `docs/business/open-questions.md` |
| 模块全景 | `templates/module-index.md` | `0X-xx/index.md` |
| 模块需求理解 | `templates/module-requirement.md` | `0X-xx/requirement.md` |
| 模块字典 | `templates/module-dictionary.md` | `0X-xx/dictionary.md` |
| 模块字段 | `templates/module-field.md` | `0X-xx/field.md` |

> 骨架仅作初始结构，**禁止**把模板里的占位内容直接当作真实业务事实输出。

---

## 8. 与其他 Skill 的衔接

| 上游 | 关系 |
|---|---|
| `prototype-scan` | 先扫描原型/详设拿到 page-spec，再由本 Skill 提炼模块需求 |
| 用户口述 + 资料指向 | 直接进入本 Skill 的 `preview` 或 `incremental` 模式 |

| 下游 | 关系 |
|---|---|
| `api-contract` | 基于 `requirement.md` + `field.md` 生成更准确的 `api.md` |
| `page-codegen` | 优先读取已有 `requirement.md` / `dictionary.md` / `field.md` 来减少臆造 |
| `dict-sync` | `dictionary.md` 可作为字典 query/upsert 前的业务对照 |
| `permission-sync` | 模块 `requirement.md` 的角色/权限部分可辅助权限规划 |
| `convention-audit` | 不直接耦合，本 Skill 不替代规范审计 |

---

## 9. 完成摘要（必须输出）

```text
## 完成摘要
- 模式：preview / module / project / incremental
- 资料源：{文件或目录列表}
- 输出：
  - docs/business/index.md（更新行：N）
  - docs/business/open-questions.md（新增问题：N）
  - docs/business/0X-xx/index.md
  - docs/business/0X-xx/requirement.md
  - docs/business/0X-xx/dictionary.md
  - docs/business/0X-xx/field.md
- 风险：{产品需确认 N 项 / 后端需确认 N 项}

## 建议下一步
- next_suggest：api-contract / page-codegen / dict-sync / permission-sync
- 原因：{为什么是这一步}
- 是否需要用户确认：是
```

---

## 10. 边界与约束

- **不替代页面级 `api.md`**：详细接口契约仍写在页面目录的 `api.md`，模块 `index.md` 只放链接。
- **不写非业务文档**：本 Skill 不维护 `README.md`、`docs/agent-pipeline-runbook.md`、`docs/mcp-tool-risk-matrix.md`、`docs/全盘分析与智能体搭建指南.md`。
- **不自动确认产品 / 后端问题**：所有 “待确认事项” 必须保留并汇总到 `open-questions.md`。
- **不删除既有事实条目**：仅做追加 / 标注 `已废弃`。
- **不污染碎片场景**：单截图、小修小改、口述简单页面默认不写 `docs/business`。
- **不引入新关键词列表**：触发完全依赖资料源 + 意图 + 范围；不要在外部文件维护“关键词清单 → 触发”表。

---

## 11. 不在本轮范围

- 跨项目业务知识库共享。
- Multi-Agent 业务理解协作。
- 自动从聊天历史回溯生成业务文档。
- 自动覆盖业务规则结论（必须保持人工 review）。

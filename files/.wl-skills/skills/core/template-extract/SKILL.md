---
name: template-extract
description: "Use when: extracting domain-specific page scenarios from existing project pages into wl-scenario JSON templates (with Page Blueprint low-token retrieval as the discovery front-end). Triggers on: 提取模板, 抽取模板, 沉淀模板, 模板贡献, 提取场景, extract template, extract scenario."
---

# Skill: 模板提取（template-extract）

从现有项目的成熟页面提取领域场景，沉淀为 **wl-scenario JSON 场景模板**
（`.wl-skills/templates/scenarios/<域>/`），让后续同类页面直接
`wl-skills scenario render` 确定性生成，AI 零自由度。

> **两阶段流水线**：
> ① **检索发现**（低 token）：`wl-skills snapshot` 项目摘要 + `wl-skills template search`
> 蓝图相似检索（Page Blueprint，不含业务代码的结构事实），用于判断"是否已有可复用场景"；
> ② **沉淀落盘**（确定性）：`wl-skills scenario extract` 产出 wl-scenario JSON。
> Blueprint 负责"找得像"，Scenario 负责"还原得出来"——蓝图检索命中后，仍以 scenario JSON 为准落盘。

---

## 触发词

`提取模板` / `抽取模板` / `沉淀模板` / `模板贡献` / `提取场景` / `extract template`

---

## Pre-flight 声明

```
🚀 已触发技能 template-extract/SKILL.md → 从现有页面提取场景模板
✅ 已读取 template-extract/SKILL.md      → 提取流程主规则
✅ 已读取 templates/patterns.json       → 模式注册表（避免重复登记 pattern）
✅ 已读取 templates/scenarios/README.md → 场景库结构与往返保证
✅ 已读取 standards/02-code-structure.md → 提取产物必须遵循的代码结构
✅ 已读取 standards/13-platform-components.md → 平台组件合规
```

---

## 执行流程

### 步骤 1：开发者指定目标

```
"提取模板，目标页：src/views/produce/sjgl/mmwr-rolling-management/"
```

### 步骤 2：低 token 检索（Blueprint 前置）

```bash
wl-skills snapshot                     # 项目结构摘要（MCP: wls_project_snapshot）
wl-skills template search --query "工位 实绩"   # 相似蓝图检索（MCP: wls_template_search）
```

命中高相似蓝图 → 报告"可能已有同形态场景"，优先增强现有模板而非新建；
未命中 → 继续步骤 3。工具只读本地文件，不上传源码。

### 步骤 3：确定性提取（CLI）

```bash
wl-skills scenario extract --page src/views/produce/sjgl/mmwr-rolling-management
```

提取器自动还原：查询/列/按钮/操作（顺序+label+颜色+字典绑定）、API_CONFIG、TABLE_CID、
modalConfig 表单、Delivery Profile、subTables/formSections 分区、extensions 标记块。
旧形态页面（`operations:` 写法、无 cid）同样可提取，产物按 canonical 升级。

**AI 只处理 CLI 解析不到的部分**：

- 非 canonical 类方法 / 自定义 composable → 移入 `extensions.customMethods`（逐字保留）
- 模板级信息 → `templateId / matchHints / title`
- warnings 里报告的未覆盖能力 → 逐条与开发者确认去向，禁止静默丢弃

### 步骤 4：模式识别与登记确认

对照 `templates/patterns.json`：

- 页面形态命中已登记 pattern（如 list / master-detail / record-form）→ 直接复用
- 新形态 → 问答确认（最多 3 问：领域归属 / pattern 命名 / 轨道建议），
  **pattern 登记是 kit 仓库变更**（patterns.json + 编译器实现），
  业务项目内只能贡献 scenario JSON 样例

### 步骤 5：脱敏与占位化（AI 自检）

- [ ] 业务字段值域替换为 `【】` 占位说明；字段名保留（领域词典资产）
- [ ] API 路径改为 `/【服务缩写】/【资源名】/{action}` 或保留真实契约路径（项目内模板可保留）
- [ ] 字典码保留显式声明（禁止删除 dictCode 改成"猜"）
- [ ] handler/extensions 内禁止 import/export（`scenario validate` 会阻断）
- [ ] `pageId` 置为 `【项目内稳定唯一】` 占位

### 步骤 6：校验与定点验证

```bash
wl-skills scenario validate --input <提取产物>.scenario.json
# 项目内模板（未占位化）追加定点验证：
wl-skills scenario render --input <...>.scenario.json --output <临时目录>
# 产物与源页面 diff：声明式核心必须一致，canonical 升级项列入报告
```

### 步骤 7：写入场景库并输出后续步骤

```
📦 模板提取完成
────────────────────────────────────────────────
✅ 已写入 templates/scenarios/{domain}/{scenario}.scenario.json
📌 后续步骤：
   1. 人工 review（脱敏完整性 / matchHints 命中度 / extensions 必要性）
   2. 提交：git cz → feat(scenario): 新增 {domain}/{scenario} 场景模板
   3. 若登记了新 pattern：在 kit 仓库实现编译器并把 status 改 implemented
────────────────────────────────────────────────
```

---

## 边界情况

| 情况 | 处理 |
| --- | --- |
| 目标页不符合 standards/ 规范 | 拒绝提取，输出审计建议（先整改再沉淀） |
| 目标页业务耦合过深，声明式核心占比过低 | 反问："extensions 体积可能超过声明式核心，是否继续？" |
| 已有 scenario 高度重合 | 优先增强现有模板（追加 matchHints/参数），不建议新建 |
| runtime 轨页面但项目无渲染器 | 提取为 runtime scenario 保存，render 时会被前置检查阻断并提示 |

---

## 与其他 Skill 的关系

- 提取产物供 **page-codegen** 的确定性渲染前置层使用（该 Skill 的 scenario-templates 场景参考）
- 页面已有 page-spec.json 时提取器自动吸收 mode/features，无需重复录入
- Page Blueprint（`wl-skills template extract/search`）是本 Skill 的低 token 检索前端；
  蓝图不生成代码，场景 JSON 才是可确定性渲染的事实源

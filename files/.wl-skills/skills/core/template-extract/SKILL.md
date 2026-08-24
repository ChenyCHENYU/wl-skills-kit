---
name: template-extract
description: "Use when: extracting domain-specific page templates from existing project pages and contributing them to skills/core/page-codegen/templates/domains/. Triggers on: 提取模板, 抽取模板, 沉淀模板, 模板贡献, extract template, contribute template."
---

# Skill: 模板提取（template-extract）

从现有项目的成熟页面提取领域模板，优先沉淀为不含业务代码的 `Page Blueprint JSON`，扩充团队 AI 模板库。

> **核心理念**：确定性脚本先提取结构事实，AI 只负责命名、归类和人工确认；开发者只需提供页面路径，避免把完整源码塞入上下文。

---

## 触发词

`提取模板` / `抽取模板` / `沉淀模板` / `模板贡献` / `extract template`

---

## Pre-flight 声明

```
🚀 已触发技能 template-extract/SKILL.md → 从现有页面提取领域模板
✅ 已读取 template-extract/SKILL.md      → 提取流程主规则
✅ 已读取 templates/_index.md            → 已有模板清单（避免重复）
✅ 已读取 standards/02-code-structure.md → 模板必须遵循的代码结构
✅ 已读取 standards/13-platform-components.md → 模板必须遵循的平台组件合规
```

---

## 执行流程

### 步骤 1：开发者指定目标

开发者提供一个目录路径：

```
"提取模板，目标页：src/views/produce/sjgl/mmwr-rolling-management/"
```

### 步骤 2：优先调用确定性工具

优先调用 `wls_project_snapshot` 获取低 token 项目摘要，再调用 `wls_template_search` 找相似蓝图，最后用 `wls_template_extract`（或 `wl-skills template extract`）生成预览。落盘前必须调用 `wls_template_audit`；两个蓝图演进时用 `wls_template_diff`。工具只读取本地文件，不上传源码。

### 步骤 3：必要时读取目标页文件

```
✅ 读取 {target}/index.vue
✅ 读取 {target}/data.ts
✅ 读取 {target}/index.scss
✅ 读取 {target}/api.md（如存在）
```

### 步骤 4：AI 自动识别交互模式

输出识别结论：

```
🔍 识别结果
  - 页面包含：{2 个 BaseTable / 1 个内联 BaseForm / 4 个操作按钮}
  - 交互模式：{双清单联动 + 内联表单 + 条件按钮}
  - 与已有 TPL 对比：
      ✅ 接近 TPL-OPERATION-STATION（domains/produce/）
      ❌ 不符合 TPL-LIST / TPL-MASTER-DETAIL / TPL-RECORD-FORM
  - 结论建议：本页面**已有相似模板**，可能是 TPL-OPERATION-STATION 的变体，
              建议考虑增强现有模板而非新建。
              （或：本页面是**独立新模式**，建议提取为 TPL-XXX）
```

### 步骤 5：AI 问答确认（最多 4 个问题）

```
❓ 问题 1：领域归属？
   选项：A. produce（生产）  B. sale（销售）  C. 其他（请说明）

❓ 问题 2：建议的模板命名？
   AI 建议：TPL-{XXX-XXX}
   如不满意请提出替代

❓ 问题 3：是否有需要脱敏/抽象的业务特定内容？
   - 业务字段名（建议保留作为占位符 [字段名]）
   - 业务接口路径（建议改为 [服务缩写]/[资源名]/{action} 占位）
   - 硬编码字典码（建议改为占位符或注释说明）

❓ 问题 4：是否合并到已有模板？
   仅当步骤 3 识别为「相似模板」时才问。
   选项：A. 增强现有模板（追加章节）  B. 提取为独立新模板
```

### 步骤 6：生成 Page Blueprint JSON

默认输出：

```text
.wl-skills/templates/blueprints/{domain}/{scene}/blueprint.json
```

蓝图只保留页面模式、查询/列/按钮/操作槽位、组件能力、API/字典依赖、约束和质量信号，不保留 `index.vue` / `data.ts` 业务代码；`fingerprint` 用于防止内容被手工误改。

生成后执行 `wls_template_audit`：结构、真实 URL、真实字典编码和源码正文任一泄露都不得进入共享模板库。检索默认只返回摘要，只有选定候选后才请求完整 Blueprint，避免模板库反向制造 token 峰值。

### 步骤 7：如确需人工模板，再生成 TPL 文件

按 `templates/domains/_CONTRIBUTING.md` 格式生成，必须包含：

- 适用场景说明
- 识别规则（5 条以内）
- 完整 index.vue / data.ts / index.scss 代码（脱敏后）
- 注意事项

### 步骤 8：写入并注册

```
✅ 写入 templates/domains/{domain}/TPL-{NAME}.md
✅ 更新 templates/_index.md（追加注册条目）
```

### 步骤 9：输出后续步骤

```
📦 模板提取完成
────────────────────────────────────────────────
✅ 已生成 templates/domains/{domain}/TPL-{NAME}.md
✅ 已更新 templates/_index.md 注册表
────────────────────────────────────────────────
📌 后续步骤：
   1. 人工 review 模板内容（脱敏完整性 / 占位符正确性）
   2. 提交：git cz → feat(template): 新增领域模板 TPL-{NAME}
   3. PR 评审 → CHENY 合入
────────────────────────────────────────────────
```

---

## 提取质量校验（AI 自检）

生成 TPL 文件后，AI 必须自检：

- [ ] 业务字段名已替换为 `[字段名]` / `[资源名]` 占位符
- [ ] API 路径已替换为 `/[服务缩写]/[资源名]/{action}` 格式
- [ ] 没有遗留具体的字典码 / 状态值（已注释说明用途）
- [ ] 代码符合 standards/02、13（结构 + 组件合规）
- [ ] 包含识别规则（让 AI 未来能匹配此模板）

---

## 边界情况

| 情况                             | 处理                                                         |
| -------------------------------- | ------------------------------------------------------------ |
| 目标页代码不符合 standards/ 规范 | 拒绝提取，输出审计建议（"目标页本身不合规，建议先整改"）     |
| 目标页过于业务特化，无法抽象     | 反问开发者："此页面业务耦合较深，提取后通用性差，是否继续？" |
| 已有 TPL 高度重合                | 优先建议增强现有模板，不建议新建                             |
| 开发者指定的命名不符合规范       | 给出建议命名，请开发者确认                                   |

# 使用指南：business-doc-extract（业务文档抽取）

> **谁读这个文档**：团队成员（产品/前端/后端）
> **AI 触发文件**：同目录 `SKILL.md`（无需手动阅读）

---

## 1. 这个 Skill 解决什么问题

把零散的业务资料（已发布原型、详设、字段表、字典表、现有页面）沉淀为：

```text
docs/business/
├── index.md                # 项目业务全景 + 模块索引
├── open-questions.md       # 全局待确认问题汇总
└── 01-xxx/                 # 模块文档
    ├── index.md            # 模块全景 + 页面/API 索引
    ├── requirement.md      # 需求理解 + 流程 + 页面清单 + 模块待确认
    ├── dictionary.md       # 字典枚举
    └── field.md            # 字段清单
```

让产品、后端、前端基于同一份业务理解协作，避免：

- AI 凭原型截图猜业务规则
- 页面生成后字段对不齐后端实体
- 字典 code 在 mock / 后端 / 前端各写各的
- 待确认问题散落在聊天记录里，没法跟产品对齐

---

## 2. 什么时候会触发

不靠死关键词。AI 只在满足以下条件时**建议**生成：

1. 你提供了可识别的业务资料：
   - 已发布的 Axure HTML 原型目录
   - 详设 / 需求 / PRD（md / docx / xlsx）
   - 后端字段实体、字典资料表
   - 已有页面目录 + `api.md` + mock
2. 资料范围达到模块或项目级（不是单页面/单截图）。
3. 你的目标是“梳理业务 / 沉淀文档 / 整理字段字典 / 确认待确认事项”。

> 单页面口述、单截图、改样式、修 bug 等碎片化任务，**默认不会写 `docs/business`**，避免污染。

---

## 3. 触发示例（语义级）

下面这些自然表达 AI 会自动判断走 business-doc-extract：

```
帮我梳理 docs/prototypes/客户管理 这个原型，按业务文档结构沉淀。
基于 docs/spec/主数据需求.md 把模块文档生成出来，再聊页面。
我把字段实体放在 字段/ 目录，帮我把模块字典和字段同步进 docs/business。
现有 src/views/mdata 已经写完了，回过头帮我生成 docs/business 业务文档。
```

下面这些不会触发：

```
帮我做个客户档案页面（默认走 page-codegen，不写业务文档）
照这张截图做个表格
这个按钮点了报错怎么改
```

---

## 4. 推荐工作流

### 4.1 模块从零沉淀

```
你：
docs/prototypes/客户管理/ 已发布的 Axure 原型在这里，
请按业务文档最佳实践沉淀，目标是 docs/business/01-customer。

AI：
[识别资料源 → 输出 Pre-flight → 给出生成计划 → 等待你确认]
```

确认后产物：

```text
docs/business/index.md
docs/business/open-questions.md
docs/business/01-customer/index.md
docs/business/01-customer/requirement.md
docs/business/01-customer/dictionary.md
docs/business/01-customer/field.md
```

### 4.2 增量补字段或字典

```
你：
后端补了 6 个字段，资料在 字段/MdmModelAttribute.md，
帮我合并进 docs/business/01-model/field.md。

AI：
[读取字段表 → 仅更新 field.md，新增标注“新增”或“更新”]
```

不会乱碰其他模块文件。

### 4.3 反向梳理已有项目

```
你：
src/views/mdata 已经全部写完了，但没有业务文档，
帮我反向沉淀 docs/business 模块文档，标出待确认事项。

AI：
[扫描 src/views + api.md + mock + 字段资料]
[生成模块文档 + 在 open-questions.md 列出待和产品/后端对齐的项]
```

---

## 5. 与页面 `api.md` 的关系

页面级接口契约仍然放在页面目录：

```text
src/views/mdata/model/mdata-model-config/api.md
```

模块 `index.md` 只做索引：

```md
| 页面 | 代码目录 | API 契约 |
|---|---|---|
| 主数据模型配置 | src/views/mdata/model/mdata-model-config | src/views/mdata/model/mdata-model-config/api.md |
```

不在 `docs/business` 里重复维护接口字段。

---

## 6. 输出物用法

| 文件 | 给谁看 | 何时更新 |
|---|---|---|
| `docs/business/index.md` | 产品 / 项目经理 / 新成员 | 模块新增 / 状态变化时 |
| `docs/business/open-questions.md` | 产品 / 后端 / 前端联调会 | 每次发现待确认事项 |
| `0X-xx/index.md` | 模块 owner | 模块结构有调整时 |
| `0X-xx/requirement.md` | 业务侧 + 实施侧 | 需求确认 / 流程调整 |
| `0X-xx/dictionary.md` | 后端字典 + 前端 dict | 字典 code 确认 / 新增 |
| `0X-xx/field.md` | 后端实体 + 前端 data.ts | 字段新增 / 类型调整 |

---

## 7. 常见踩坑

| 现象 | 原因 | 解法 |
|---|---|---|
| AI 把单页面口述写进了 `docs/business` | 资料源不足却被强制走 | 检查是否提供了模块级资料；只是做单页时直接走 page-codegen |
| 生成的字段表里有“推断字段”污染真实事实 | 资料缺失 | 让 AI 把推断字段全部标注 `待确认`，不要直接合并到 field.md 主表 |
| open-questions 越来越多 | 没有定期与产品对齐 | 周会上集中确认后，把已确认项移除并在 requirement.md 落地业务规则 |
| 模块目录命名混乱 | 没有按 `0X-` 顺序前缀 | 强制要求 `01-`、`02-`，与产品一级目录一致 |

---

## 8. FAQ

**Q：小项目也要 `docs/business` 吗？**
A：不强求。小项目可以把业务全景写在 README，不需要拆成 `docs/business`。本 Skill 不会主动给小项目写。

**Q：原型目录必须发布成 HTML 吗？**
A：推荐已发布的 Axure HTML，AI 可以读取具体页面。其他形式（pdf / docx / 截图集）也支持，但识别精度下降。

**Q：能不能只做 preview，不落盘？**
A：可以。直接告诉 AI “只预览，不写文件”，AI 会在对话里输出业务理解结构和待确认事项。

**Q：和 page-codegen 冲突吗？**
A：不冲突。page-codegen 仍然支持口述需求 / 截图直接生成页面；本 Skill 只在你想沉淀业务文档时介入。

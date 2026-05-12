<!--
模板：docs/business/0X-xxx/index.md（模块全景）
使用：business-doc-extract Skill 在 module 模式下生成或刷新。
约束：仅放“模块定位 + 子功能清单 + 页面/API 索引 + 模块链路摘要”。
     详细需求 / 字段 / 字典放在 requirement.md / field.md / dictionary.md。
-->

# {{ModuleName}}

> **代码目录**：`src/views/{{module-path}}`
> **文档目录**：`docs/business/0X-{{module-kebab}}/`
> **最近更新**：{{UpdatedAt}}

---

## 1. 模块定位

{{ModulePositioning}}

---

## 2. 子功能清单

| 功能 | 说明 | 状态 |
|---|---|---|
| {{Feature1}} | {{Desc1}} | {{Status1}} |
| {{Feature2}} | {{Desc2}} | {{Status2}} |

---

## 3. 页面与 API 索引

> 详细接口契约位于页面目录的 `api.md`，本表只做导航。

| 页面 | 代码目录 | API 契约 | 实现状态 |
|---|---|---|---|
| {{Page1Name}} | `src/views/{{page1-path}}` | [`api.md`](../../../src/views/{{page1-path}}/api.md) | {{Status1}} |
| {{Page2Name}} | `src/views/{{page2-path}}` | [`api.md`](../../../src/views/{{page2-path}}/api.md) | {{Status2}} |

---

## 4. 模块链路摘要

```mermaid
flowchart TD
  A[{{Step1}}] --> B[{{Step2}}]
  B --> C[{{Step3}}]
```

> 完整业务流程详见 [`requirement.md`](./requirement.md)。

---

## 5. 关联模块

| 模块 | 关系 |
|---|---|
| {{RelatedModule}} | {{Relation}} |

---

## 6. 模块导航

- 需求理解：[`requirement.md`](./requirement.md)
- 字典枚举：[`dictionary.md`](./dictionary.md)
- 字段清单：[`field.md`](./field.md)
- 全局待确认：[`../open-questions.md`](../open-questions.md)

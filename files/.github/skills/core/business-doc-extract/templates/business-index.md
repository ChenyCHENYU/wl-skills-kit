<!--
模板：docs/business/index.md（项目业务全景）
使用：business-doc-extract Skill 在 project / module 模式下生成或刷新此文件。
约束：表格中的页面数量 / 状态需基于真实资料填充，禁止凭空推断。
-->

# {{ProjectName}} 业务全景

> **版本基线**：{{BaselineVersion}}
> **最近更新**：{{UpdatedAt}}
> **维护者**：{{Maintainer}}

---

## 1. 系统定位

{{SystemPositioning}}

---

## 2. 一级业务模块

| 序号 | 模块 | 代码目录 | 文档 | 当前状态 |
|---|---|---|---|---|
| 01 | {{Module1Name}} | `src/views/{{module1-path}}` | [01-{{module1-kebab}}/index.md](./01-{{module1-kebab}}/index.md) | {{Module1Status}} |
| 02 | {{Module2Name}} | `src/views/{{module2-path}}` | [02-{{module2-kebab}}/index.md](./02-{{module2-kebab}}/index.md) | {{Module2Status}} |

---

## 3. 业务主链路

```mermaid
flowchart LR
  A[{{Step1}}] --> B[{{Step2}}]
  B --> C[{{Step3}}]
  C --> D[{{Step4}}]
```

---

## 4. 模块关系

```mermaid
flowchart TD
  M01[{{Module1Name}}] --> M02[{{Module2Name}}]
  M02 --> M03[{{Module3Name}}]
```

---

## 5. 实现状态摘要

| 维度 | 状态 |
|---|---|
| 已实现页面 | {{ImplementedPages}} |
| 文档化模块 | {{DocumentedModules}} |
| 待确认事项 | 详见 [open-questions.md](./open-questions.md) |

---

## 6. 阅读指南

- 想了解整个系统：从本文件起步。
- 想了解某个业务模块：进入 `0X-xxx/index.md`。
- 想看接口契约：进入对应页面目录的 `api.md`。
- 想看待确认事项：查看 `open-questions.md`。

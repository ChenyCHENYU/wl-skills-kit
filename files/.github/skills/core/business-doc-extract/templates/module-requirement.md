<!--
模板：docs/business/0X-xxx/requirement.md（模块需求理解）
使用：business-doc-extract Skill 在 module / incremental 模式下生成或更新。
约束：流程图、页面清单、模块待确认事项都放在本文件，不再单独建 flow.md / pages.md / open-questions.md。
     全局 open-questions.md 由 Skill 汇总，不在本文件维护汇总表。
-->

# {{ModuleName}}：需求理解

---

## 1. 需求来源

| 来源类型 | 路径或说明 |
|---|---|
| 原型 | {{PrototypePath}} |
| 详设 | {{SpecPath}} |
| 现有代码 | `src/views/{{module-path}}` |
| 后端字段实体 | {{EntityPath}} |
| 字典资料 | {{DictPath}} |

---

## 2. 业务目标

{{BusinessGoal}}

---

## 3. 角色与权限

| 角色 | 可操作内容 | 备注 |
|---|---|---|
| {{Role1}} | {{Operation1}} | {{Note1}} |
| {{Role2}} | {{Operation2}} | {{Note2}} |

---

## 4. 功能范围

| 功能 | 说明 | 是否本期 | 备注 |
|---|---|---|---|
| {{Feature1}} | {{Desc1}} | 是 / 否 | {{Note1}} |

---

## 5. 核心业务流程

```mermaid
flowchart TD
  A[{{Step1}}] --> B[{{Step2}}]
  B --> C[{{Step3}}]
```

> 多个流程时按子标题拆分，例如 `5.1 主流程`、`5.2 异常流程`。

---

## 6. 页面清单

| 页面 | 原型 / 详设来源 | 代码路径 | 实现状态 | 备注 |
|---|---|---|---|---|
| {{Page1}} | {{Source1}} | `src/views/{{page1-path}}` | {{Status1}} | {{Note1}} |
| {{Page2}} | {{Source2}} | `src/views/{{page2-path}}` | {{Status2}} | {{Note2}} |

> 详细接口契约见对应页面目录下的 `api.md`。

---

## 7. 业务规则

| 规则 | 说明 |
|---|---|
| {{Rule1}} | {{Desc1}} |
| {{Rule2}} | {{Desc2}} |

---

## 8. 异常规则

| 场景 | 处理方式 |
|---|---|
| {{Exception1}} | {{Handling1}} |

---

## 9. 模块待确认事项

> 仅维护本模块的待确认事项；全局视图见 `docs/business/open-questions.md`。

| 编号 | 问题 | 影响 | 建议确认人 | 优先级 | 状态 |
|---|---|---|---|---|---|
| Q-{{Module}}-001 | {{Question}} | {{Impact}} | 产品 / 后端 / 前端 | 高 / 中 / 低 | 待确认 |

---

## 10. 变更记录

| 日期 | 摘要 | 操作人 |
|---|---|---|
| {{Date}} | {{Summary}} | {{Operator}} |

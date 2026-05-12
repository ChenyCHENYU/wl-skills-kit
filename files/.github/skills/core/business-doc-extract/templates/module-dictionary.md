<!--
模板：docs/business/0X-xxx/dictionary.md（模块字典枚举）
使用：business-doc-extract Skill 在 module / incremental 模式下生成或更新。
约束：仅维护本模块涉及的字典 / 枚举 / 状态；跨模块共享的字典需在备注列说明。
     字典 code 推断未确认时，必须在 `状态` 列标 `待确认`，确认前不写入业务代码。
-->

# {{ModuleName}}：字典与枚举

---

## 1. 模块字典清单

| 字典 code | 字典名称 | 用途 | 来源 | 状态 | 备注 |
|---|---|---|---|---|---|
| {{DictCode1}} | {{DictName1}} | {{Usage1}} | 原型 / 详设 / 后端 | 待确认 / 已确认 / 已废弃 | {{Note1}} |
| {{DictCode2}} | {{DictName2}} | {{Usage2}} | {{Source2}} | {{Status2}} | {{Note2}} |

---

## 2. 字典项明细

### {{DictCode1}}：{{DictName1}}

| 值 | 标签 | 说明 | 状态 |
|---|---|---|---|
| {{Value1}} | {{Label1}} | {{Desc1}} | 待确认 / 已确认 |
| {{Value2}} | {{Label2}} | {{Desc2}} | {{Status2}} |

---

## 3. 跨模块共享字典

> 如本模块依赖其他模块或平台通用字典，列在此表，避免重复维护。

| 字典 code | 维护方 | 使用页面 |
|---|---|---|
| {{ShareCode}} | {{Owner}} | {{Pages}} |

---

## 4. 与后端 / mock 的对齐情况

| 字典 code | 后端字典模块 | mock 是否覆盖 | 前端 dict 引用位置 | 是否一致 |
|---|---|---|---|---|
| {{DictCode}} | {{BackendModule}} | 是 / 否 | `data.ts` / `select.dictCode` | 是 / 否 |

---

## 5. 变更记录

| 日期 | 摘要 | 操作人 |
|---|---|---|
| {{Date}} | {{Summary}} | {{Operator}} |

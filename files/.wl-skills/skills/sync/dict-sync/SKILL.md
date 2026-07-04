---
name: dict-sync
description: "Use when: syncing business dictionary modules, dictionaries, and dictionary details to the backend; pulling the current online dictionary baseline; checking dictionaries used in data.ts or docs. Triggers on: 同步字典, 创建字典, 刷新字典基线, 字典对比, 字典审计, dict sync, create dict."
---

# Skill: 字典同步（dict-sync）

将业务文档、`data.ts` 或需求说明中的字典落到低代码平台的业务字典中。字典真实结构是三层：

1. 业务模块：左侧一级节点，例如 `主数据系统授权`、`隐患排查治理`
2. 字典：模块下的具体字典，例如 `mdmModelType:模型类型`、`aq_miss_type:隐患缺失类型`
3. 字典明细：字典下的枚举行，例如 `strKey=2, strValue=基础数据模型`

不得把每个字典直接创建成业务模块；这会造成左侧树污染。

---

## 必读公共护栏

本 Skill 遵守 `../_mcp-guardrail.md`。AI 首次执行 sync 类任务时先加载它。

本 Skill 使用 MCP 工具：`wls_dict_query` / `wls_dict_upsert`。调用失败时按 guardrail 引导用户完善 `env.local.json` 后重试，不得用 curl、PowerShell、fetch 绕开 MCP 手拼 HTTP。

---

## 配置

读取 `.wl-skills/skills/sync/env.local.json`（已在 `.gitignore`，不入 git）：

```json
{
  "gatewayPath": "https://example.gateway/uat-api",
  "sysAppNo": "当前应用sysAppNo",
  "token": "从浏览器Network复制的纯token"
}
```

| 字段 | 说明 |
|---|---|
| `gatewayPath` | 后端网关，末尾不加斜杠 |
| `sysAppNo` | 当前选择的应用编码；MCP 会放入请求头 `sysAppNo` |
| `token` | 纯 token/JWT，不含 `bearer ` 前缀，MCP 内部自动拼接 |

平台接口没有显式传 `appId` 查询参数，是通过请求头 `sysAppNo` 定位当前应用。`/system/dictModule/business/list`、`/system/business/dict/getDictionaryTreeData`、保存模块、保存字典、保存明细都必须带这个 header。

---

## 标准写入链路

MCP 必须先查后写：

1. 调 `wls_dict_query` 查询当前应用业务字典树
2. 定位业务模块：优先 `module.id`，其次 `module.strSn`，最后 `module.strName/name`
3. 模块不存在时，仅在入参同时提供 `module.strSn` 和 `module.strName` 时创建模块
4. 在目标模块下定位字典：优先 `dict.id`，其次 `dict.strSn`
5. 字典不存在时调用 `/system/business/dict/save` 创建，并 re-query 获取字典 ID
6. 调 `/system/dictDtl/list?dictId=...` 查询已有明细
7. 只追加不存在的明细；遇到 key/value 冲突不覆盖、不删除

后台接口链路：

| 层级 | 接口 | 关键字段 |
|---|---|---|
| 查模块/字典树 | `GET /system/business/dict/getDictionaryTreeData` | 请求头 `sysAppNo` |
| 创建模块 | `POST /system/dictModule/save` | `strSn`, `strName`, `sortPriority`, `strLevel:2` |
| 创建字典 | `POST /system/business/dict/save` | `strSn`, `strName`, `moduleId`, `strLevel:2` |
| 查明细 | `GET /system/dictDtl/list?size=20&dictId=...` | `dictId` |
| 创建明细 | `POST /system/dictDtl/save` | `dictId`, `strSn`, `strKey`, `strValue`, `strValueCode` |

---

## `wls_dict_upsert` 入参

推荐语义化写法：

```jsonc
{
  "module": {
    "strSn": "mdmAuth",
    "strName": "主数据系统授权",
    "sortPriority": "1",
    "strLevel": 2
  },
  "dict": {
    "strSn": "mdmModelType",
    "strName": "模型类型",
    "strLevel": 2
  },
  "items": [
    { "value": "2", "label": "基础数据模型" },
    { "value": "1", "label": "参照数据模型" },
    { "value": "0", "label": "主数据模型" }
  ]
}
```

映射规则：

| MCP 入参 | 后端字段 | UI 列 |
|---|---|---|
| `value` | `strKey` | `strKey` |
| `label` | `strValue` | `(strValue)` |
| `strValue2` | `strValue2` | `(strValue2)` |
| `strValue3` | `strValue3` | `(strValue3)` |
| `strValue4` | `strValue4` | `(strValue4)` |

`strValueCode` 可显式传入；未传时 MCP 自动生成 `sysDict.dtl.strValue.<安全后缀>`。后缀优先取不含中文的 `strValue`，如果 `strValue` 是中文则回退到 `strKey`，避免违反前端“value 编码不能包含中文”的校验。

当用户明确给的是后端字段时，也支持原始写法：

```jsonc
{
  "items": [
    { "strKey": "2", "strValue": "基础数据模型" }
  ]
}
```

“原样写入”的意思是：只要入参出现 `strKey` 或 `strValue`，MCP 不再猜测、不交换字段，直接按后端字段提交。迁移 `wl-mdata/docs` 里的静态字典时，默认应解析成 `value/label`，只有文档明确写了后端字段名时才用原始 `strKey/strValue`。

---

## 从文档抽取字典

处理 `wl-mdata/docs` 或需求文档时，先整理为稳定的三层结构：

```markdown
## 主数据系统授权 / mdmModelType（模型类型）

| value | label | 备注 |
|---|---|---|
| 2 | 基础数据模型 | |
| 1 | 参照数据模型 | |
| 0 | 主数据模型 | |
```

如果文档只有中文枚举、没有值，例如 `男/女`，不要擅自生成生产值；先标记为待确认，或让用户提供值。若用户明确说按顺序生成，可再生成 `0/1/2...`。

如果文档写法是 `男(0)`、`0=男`、`0 男`，可解析为 `value=0`、`label=男`。

---

## 冲突处理原则

| 场景 | 策略 |
|---|---|
| 目标模块不存在，且有 `module.strSn + module.strName` | 创建模块，再 re-query 获取模块 ID |
| 目标模块不存在，但只传了 `module.id` | 停止；避免在错误应用或错误模块下污染 |
| 字典 `dict.strSn` 已存在且名称一致 | 复用该字典，只追加缺失明细 |
| 字典 `dict.strSn` 已存在但名称不同 | 停止写入，要求人工确认 |
| 明细 `strKey` 已存在且 `strValue` 一致 | 跳过 |
| 明细 `strKey` 已存在但 `strValue` 不同 | 标记冲突，不覆盖 |
| 明细 `strValue` 已存在但 `strKey` 不同 | 标记冲突，不新增重复显示名 |
| 线上有、本地无 | 只报告，不主动删除 |

---

## Pre-flight 声明

执行 push 前必须向用户说明：

```text
已触发 dict-sync
MCP 工具：wls_dict_query / wls_dict_upsert
目标应用 sysAppNo：{sysAppNo}
目标业务模块：{module.strName} / {module.strSn 或 id}
目标字典：{dict.strSn}:{dict.strName}
写入模式：先查后写；存在则追加缺失明细；冲突不覆盖
```

如果目标应用、目标模块、字典编码、枚举值任一项不确定，先停下来确认。

---

## pull / audit / push

### pull

调用 `wls_dict_query`，把线上业务模块、字典、字典明细入口整理为 `.wl-skills/reports/SYS_DICT_INFO.md`。

### audit

扫描 `data.ts` 中：

```typescript
logicType: BusLogicDataType.dict, logicValue: "DICT_CODE"
```

再对比线上 `wls_dict_query` 结果和本地 `SYS_DICT_INFO.md`，只输出缺失/冲突/疑似废弃，不调写接口。

### push

每个“模块 + 字典”调用一次 `wls_dict_upsert`。不要把多个业务模块混到一次调用里，也不要把不同字典的明细混到同一个 `items` 里。

---

## 字典编码规则

字典编码以线上系统和项目既有代码为准，例如 `mdmModelType`、`aq_miss_type` 都是合法既有风格。不要强制改成全大写下划线，也不要让 AI 自己猜编码。

缺失编码时，先从以下来源找：

1. 业务文档已有字典编码
2. `data.ts` 的 `logicValue`
3. 后端接口或旧系统字段
4. 用户明确指定

找不到时输出待确认，不写入。

---

## MCP 不可用或调用失败

见 `../_mcp-guardrail.md`。原则：先帮用户完善 `env.local.json` 的 `gatewayPath`、`token`、`sysAppNo`，再重试 MCP 工具。禁止绕开 MCP 手写 HTTP。

# 模块字典契约

## 职责

字典使用两层真值，禁止用创建先后表达顺序：

1. 页面 `api.md`：声明本页面使用的字典片段。
2. 模块 `dicts.ts`：合并模块全部页面片段，是 MCP 发布的唯一输入。

`SYS_DICT_INFO.md` 仅保存线上快照，不承载待发布定义。

`module.code` 是跨应用协调和冲突诊断使用的稳定技术标识，应采用清晰、全局唯一的 camelCase 编码。若后端存在不可见的软删除/历史记录占用，必须在 `dicts.ts` 与所有页面 `api.md` 中同步改为新的稳定编码；不得只改线上、不得靠大小写规避，也不得改变字典编码和值来绕过模块冲突。

## 目录

```text
src/views/<域>/<模块>/
├── dicts.ts
├── page-a/api.md
└── page-b/api.md
```

## api.md 结构化块

在 `api.md` 的“数据字典”章节写入合法 JSON。数组顺序必须与 `order` 一致。

````markdown
```dict-contract
{
  "schemaVersion": 1,
  "module": {
    "code": "mdmAuth",
    "name": "主数据系统授权"
  },
  "dictionaries": [
    {
      "code": "mdmModelType",
      "name": "模型类型",
      "order": {
        "field": "STR_KEY",
        "direction": "asc"
      },
      "items": [
        { "value": "0", "label": "主数据模型" },
        { "value": "1", "label": "参照数据模型" },
        { "value": "2", "label": "基础数据模型" }
      ],
      "sources": []
    }
  ]
}
```
````

解析器自动把当前 `api.md` 路径加入 `sources`。同一模块多个页面可声明同一字典的不同子集；汇总时按 value 合并，名称、排序、同 value 定义冲突会阻断。

## dicts.ts

只导出一个 JSON 兼容的静态对象：

```typescript
export const MODULE_DICTIONARIES = {
  schemaVersion: 1,
  module: { code: "mdmAuth", name: "主数据系统授权" },
  dictionaries: [
    {
      code: "mdmModelType",
      name: "模型类型",
      order: { field: "STR_KEY", direction: "asc" },
      items: [
        { value: "0", label: "主数据模型" },
        { value: "1", label: "参照数据模型" },
        { value: "2", label: "基础数据模型" }
      ],
      sources: ["model-list/api.md"]
    }
  ]
} as const
```

禁止函数调用、变量引用、展开运算和动态表达式。这样 MCP 可以静态解析而不执行项目代码。

## 字段映射

| 契约 | 后端 |
|---|---|
| `module.code/name` | 模块 `strSn/strName` |
| `dictionary.code/name` | 字典 `strSn/strName` |
| `item.value/label` | 明细 `strKey/strValue` |
| `order.field/direction` | 字典 `orderField/orderRule` |
| `value2/3/4` | `strValue2/3/4` |
| `valueCode` | `strValueCode` |

`order.field` 允许 `STR_KEY`、`STR_VALUE1~4`。默认推荐 `STR_KEY`；使用 value 字段排序时需确认目标数据库排序规则。

## 验证与发布

```text
wl-skills validate src/views/<域>/<模块>
  → D1 校验 api.md 与 dicts.ts 一致

wls_dict_upsert({ scope: "project" })
  → 自动发现全部模块，只读预览 safe-additive 计划和 planHash

wls_dict_upsert({ scope: "project", confirmApply: true, planHash: "..." })
  → 状态未变化时只新增缺失项并完成项目级回查
```

单模块排查使用 `scope: "module" + sourcePath`。没有 `dicts.ts` 的项目先调用 `wls_dict_bootstrap`；详细状态机和冲突策略见 `dictionary-reconcile.md`。

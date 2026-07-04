# 使用指南：dict-sync（业务字典同步）

`dict-sync` 负责把业务模块、字典、字典明细精准同步到低代码平台。它不是简单创建“一个字典模块 + 多个字典项”，而是严格遵守后台三层结构：

1. 业务模块：如 `主数据系统授权`
2. 字典：如 `mdmModelType:模型类型`
3. 明细：如 `strKey=2, strValue=基础数据模型`

## 前置配置

`.wl-skills/skills/sync/env.local.json`：

```json
{
  "gatewayPath": "https://example.gateway/uat-api",
  "sysAppNo": "当前应用sysAppNo",
  "token": "从浏览器Network复制的纯token"
}
```

`sysAppNo` 会作为请求头传给后台。平台选择应用后，字典接口并不是靠 query 参数传 appId，而是靠这个请求头定位当前应用。

## 标准调用示例

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

推荐传 `value/label`：

| 入参 | 后端字段 |
|---|---|
| `value` | `strKey` |
| `label` | `strValue` |

未传 `strValueCode` 时，MCP 会自动生成 `sysDict.dtl.strValue.<安全后缀>`。中文 label 不会直接进入 code，会回退到 `value/strKey`。

如果你已经从 Network 或接口文档拿到了后端字段，也可以直接传：

```jsonc
{ "strKey": "2", "strValue": "基础数据模型" }
```

这种就是“原样写入”：MCP 不交换、不猜测，直接按 `strKey/strValue` 提交。

## 查重和防污染

每次写入前都会查询线上：

- 模块不存在：只有提供 `module.strSn + module.strName` 才创建
- 模块存在：复用模块 ID
- 字典存在且名称一致：只补缺失明细
- 字典存在但名称不同：停止写入
- 明细 key/value 完全一致：跳过
- 明细 key 或 value 冲突：报告冲突，不覆盖、不删除

## 从 `wl-mdata/docs` 迁移

先把文档整理成：

```markdown
## 主数据系统授权 / mdmModelType（模型类型）

| value | label |
|---|---|
| 2 | 基础数据模型 |
| 1 | 参照数据模型 |
| 0 | 主数据模型 |
```

文档写 `男(0)`、`0=男` 时，可解析成 `value=0, label=男`。只有中文、没有值时，先标为待确认，不擅自生成线上枚举值。

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 数据建到了错误应用 | `env.local.json` 的 `sysAppNo` 不对 | 从浏览器 Network 复制当前应用的 `sysAppNo` |
| 左侧树出现很多城市/枚举节点 | 把字典明细误建成模块 | 使用三层入参：module + dict + items |
| 字典创建成功但拿不到 ID | 保存接口返回 `data:null` | MCP 会 re-query 字典树获取 ID |
| 明细重复或值错位 | `strKey/strValue` 语义混淆 | 文档迁移默认用 `value/label`，明确后端字段时才用原始字段 |

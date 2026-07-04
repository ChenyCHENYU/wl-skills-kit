# API 契约输入规范 — 后端如何配合前端 AI 代码生成

> **受众**：后端开发者  
> **目的**：规范前后端接口约定流程，确保 AI 生成的 api.md 与后端实现完全一致，联调零返工

---

## 概述：AI 如何生成接口约定

前端 AI（api-contract Skill）会基于页面清单自动生成 `api.md` 文件，放在每个页面目录下（与 `index.vue` 同级）。

**AI 能自动推断的部分**：
- 标准 CRUD 接口 URL（list / getById / save / update / remove / export）
- 响应结构（分页/单条/增删改/字典）
- 基本字段名（来自原型扫描结果）

**AI 无法推断、需后端提供的部分**：
- 真实的服务缩写（`pm` / `mmwr` / `sale` / ...）
- 实体名（`CamelCase` 资源名，如 `mmwrCustomerArchive`）
- 业务特殊操作（如 `submit` / `approve` / `release` / `convert`）
- 非标准字段名（后端有历史遗留命名时）

---

## 接口 URL 规范

格式：`/[服务缩写]/[资源名CamelCase]/[操作]`

| 服务缩写 | 含义 | 示例 |
|---|---|---|
| `pm` | 生产管理 | `/pm/omptMillPlanOrder/list` |
| `mmwr` | 精整作业 | `/mmwr/mmwrCustomerArchive/list` |
| `sale` | 销售管理 | `/sale/saleOrder/list` |
| `hrms` | 人力资源 | `/hrms/hrmsEmployee/list` |
| `base` | 基础数据 | `/base/cmUserGroup/list` |
| `mmsm` | 炼钢管理 | `/mmsm/mmsmRsltLadleUse/list` |

**关于资源名**：
- 使用实体类名（去掉末尾的 `Entity` / `DO`，保留业务名）
- 通常带服务缩写前缀（如 `mmwrCustomerArchive`，不是 `customerArchive`）
- **请后端同学在开发前告知前端实体名**，避免 AI 自行推断

---

## 标准操作集

AI 会默认为每个页面生成以下标准接口，无需额外沟通：

| 操作 | 方法 | URL | 请求体 |
|------|------|-----|--------|
| 分页列表 | POST | `/list` | `{ current, size, ...查询条件 }` |
| 单条查询 | GET | `/getById` | `?id=xxx` |
| 新增 | POST | `/save` | 实体字段（不含 id） |
| 编辑 | POST | `/update` | 实体字段（含 id） |
| 删除 | POST | `/remove` | `{ id }` |
| 导出 | GET | `/export` | `?...查询条件` |

> 如后端实际 URL 与上述规范不同（历史项目），请在 `api.md` 确认时注明实际 URL。

---

## 统一响应结构（必须遵守）

> **所有接口响应外壳必须是这个格式，AI 和前端框架均依赖此契约**

```json
{
  "code": 2000,
  "message": "操作成功",
  "data": <实际数据>
}
```

### 分页列表响应（`/list` 接口）

```json
{
  "code": 2000,
  "message": "操作成功",
  "data": {
    "records": [ { "字段名": "值" } ],
    "total": 100,
    "current": 1,
    "size": 20,
    "pages": 5
  }
}
```

> 前端 `AbstractPageQueryHook` 自动适配 MyBatis-Plus 分页格式（取 `records` 和 `total`），**不要改为 `list` 或 `rows`**。

### 单条查询响应

```json
{ "code": 2000, "message": "操作成功", "data": { "id": "...", "字段名": "值" } }
```

### 增删改响应

```json
{ "code": 2000, "message": "操作成功", "data": true }
```

或返回新记录主键：

```json
{ "code": 2000, "message": "操作成功", "data": "1234567890123456789" }
```

### 字典查询响应

```json
{
  "code": 2000,
  "message": "操作成功",
  "data": [
    { "value": "01", "label": "启用" },
    { "value": "02", "label": "停用" }
  ]
}
```

### 字典枚举规范

`api.md` 中涉及字典枚举时，统一使用前端/文档语义字段 `value` 和 `label`：

| 字段 | 含义 | 入库映射 |
|---|---|---|
| `dictCode` | 字典编码，必须以生产/线上已有编码为准 | `/system/business/dict/save` 的 `strSn` |
| `dictName` | 字典中文名 | `/system/business/dict/save` 的 `strName` |
| `value` | 业务值/枚举值，如 `0`、`1`、`TYPE_001` | `/system/dictDtl/save` 的 `strKey` |
| `label` | 中文显示名，如 `启用`、`基础数据模型` | `/system/dictDtl/save` 的 `strValue` |

`label/strValue` 通常是中文，这是正常情况。`strValueCode` 不在 `api.md` 中人工维护；同步字典时由 MCP 按线上创建规则生成 `sysDict.dtl.strValue.<安全后缀>`，中文 label 会回退到 `value/strKey`，避免 code 含中文。

```markdown
## 字典枚举

### mdmModelType（模型类型）

| value | label |
|---|---|
| 2 | 基础数据模型 |
| 1 | 参照数据模型 |
| 0 | 主数据模型 |
```

> 字典编码不要由 AI 猜测命名风格。既有线上可能是 `mdmModelType`、`aq_miss_type`、`customer_type` 等不同风格，必须按线上/后端确认值原样记录。

### 失败响应

```json
{ "code": 4001, "message": "参数缺失：customerName 不能为空", "data": null }
```

> **成功码是 `2000`，不是 `200`**。`200` 是历史 mock 环境的遗留，真实后端必须用 `2000`。

---

## 字段命名约定

| 端 | 规范 | 说明 |
|---|---|---|
| **后端（数据库/Entity）** | `snake_case` | 如 `customer_name`, `enable_status` |
| **后端（JSON序列化）** | `camelCase` | Jackson 自动转换，前端收到的是驼峰 |
| **前端（请求/响应）** | `camelCase` | 与 Jackson 转换后的字段一致 |

**核心原则**：前端请求字段名 = 响应中的字段名 = `api.md` 中的字段名 = `data.ts` 中使用的字段名  
**都是 camelCase**，不需要在前端做字段名转换。

---

## 业务特殊操作（最需要提前沟通）

以下操作**AI 无法从原型直接推断**，需后端明确告知操作名和参数：

| 常见操作 | 默认 URL | 请求参数 | 备注 |
|---|---|---|---|
| 提交审批 | `/submit` | `{ id }` | |
| 审批通过 | `/approve` | `{ id, opinion? }` | |
| 审批驳回 | `/reject` | `{ id, opinion }` | opinion 必填 |
| 撤回 | `/withdraw` | `{ id }` | |
| 启用/停用 | `/changeStatus` | `{ id, status }` | |
| 转化 | `/convert` | `{ id }` | 如临时→正式客户 |
| 下发 | `/release` | `{ id }` | |
| 关闭 | `/close` | `{ id }` | |
| 作废 | `/cancel` | `{ id }` | |
| 批量操作 | `/batchXxx` | `{ ids: [] }` | |
| 子表查询 | `/queryXxxList` | `{ mainId }` | |

**请在收到 ai.md 后，确认或修正这些业务操作的实际 URL 和参数格式。**

---

## api.md 工作流

### 第一步：AI 生成草稿

AI 基于原型/详设，自动生成 `api.md` 初稿，内容包括：
- `API_CONFIG`（URL 汇总）
- 实体字段表（字段名、类型、是否必填）
- 请求/响应示例

初稿状态标记为 `🟡 待后端确认`。

### 第二步：后端确认/修正

后端同学拿到 `api.md` 后，需要确认/修正：

- [ ] 服务缩写正确（`pm` / `mmwr` / ...）
- [ ] 实体名正确（与 Controller 中路径一致）
- [ ] 字段名（camelCase）与实际 Entity 的 Jackson 序列化一致
- [ ] 分页参数名（`current` / `size` 还是其他）
- [ ] 特殊业务操作的 URL 和参数正确
- [ ] 必填字段标注正确
- [ ] 字典 `dictCode` 使用线上/后端确认值，未由 AI 猜测
- [ ] 字典枚举使用 `value/label`，且 `value` 值（01/02/1/2 等）正确

修正后将状态改为 `✅ 已确认` 或在注释中标注修改点。

### 第三步：前端基于 api.md 编写 data.ts

`api.md` 确认后，`data.ts` 中的 `API_CONFIG` URL 和所有字段名与 `api.md` 完全一致，联调时两端字段自动对齐。

---

## 常见问题

### Q：分页接口我们用的是 GET 还是 POST？

统一用 **POST**，查询条件放在请求体（不是 query string）。这样支持复杂查询条件（数组、嵌套对象），且 URL 不会过长。

### Q：主键我们用的是 int 还是 string 类型？

前端统一按 **string** 处理主键（Java `Long` 在 JS 中超过安全整数范围，Jackson 加 `@JsonSerialize(using = ToStringSerializer.class)` 序列化为字符串）。api.md 中 `id` 字段类型写 `string`。

### Q：软删除的字段前端需要过滤吗？

不需要，后端 SQL 层过滤。前端不关心 `is_deleted` / `del_flag` 字段。

### Q：`createTime` / `updateTime` / `createUser` / `updateUser` 要写在 api.md 里吗？

只有在页面上**显示**这些字段时才需要写入 api.md 的实体字段表，否则不需要（前端不用知道这些内部字段）。

### Q：返回的列表字段和表单字段不一样，需要两个接口吗？

通常一个 `getById` 接口返回完整字段（包括列表不展示的字段）即可。前端 `data.ts` 对列表和表单分别映射不同字段，共用同一接口响应。

---

## api.md 模板（供参考）

```markdown
# 接口约定 - [页面中文名]

> 服务缩写：[pm / mmwr / sale / ...]  
> 资源名：[实体名CamelCase]  
> 状态：🟡 待后端确认

## API_CONFIG

\`\`\`typescript
export const API_CONFIG = {
  list:     "/[服务缩写]/[资源名]/list",
  getById:  "/[服务缩写]/[资源名]/getById",
  save:     "/[服务缩写]/[资源名]/save",
  update:   "/[服务缩写]/[资源名]/update",
  remove:   "/[服务缩写]/[资源名]/remove",
  export:   "/[服务缩写]/[资源名]/export",
} as const;
\`\`\`

## 实体字段

| 字段名(camelCase) | 类型 | 说明 | 必填 | 字典code |
|---|---|---|---|---|
| id | string | 主键 | - | - |
| customerName | string | 客户名称 | 是 | - |
| customerType | string | 客户类型 | 是 | customer_type |
| enableStatus | string | 启用状态 | 是 | enable_status |

## 字典枚举

### customer_type（客户类型）

| value | label |
|---|---|
| 1 | 正式客户 |
| 0 | 临时客户 |

## 分页查询（POST /list）

请求参数：`{ current: 1, size: 20, customerName?: string, customerType?: string }`  
响应：标准分页格式，`records` 包含实体字段

## 单条查询（GET /getById）

请求：`?id=xxx`  
响应：实体完整字段（含表单字段）
```

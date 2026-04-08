---
name: api-contract
description: "Use when: designing API contracts between frontend and backend based on prototype page inventory, defining request/response field structures, establishing naming conventions, and generating an api.md file per page for team alignment before coding. Triggers on: api contract, interface design, 接口约定, 前后端对齐, 字段定义, 接口设计, api.md."
---

# Skill: 接口约定（api-contract）

基于《页面清单》为每个页面生成 `api.md` 文件，放在**页面目录下**（和 index.vue 同级）。

**双重作用：**

1. **前端** — data.ts 中 `API_CONFIG` 的 URL 和字段名直接基于 api.md
2. **后端** — 拿到 api.md 直接出接口（Controller + Service + Entity），字段名一致，联调零成本

---

## 全局规范

### URL 命名

```
/[服务缩写]/[资源名CamelCase]/[操作]
```

| 服务缩写 | 含义     | 示例                                 |
| -------- | -------- | ------------------------------------ |
| pm       | 生产管理 | `/pm/omptMillPlanOrder/list`         |
| mmwr     | 精整作业 | `/mmwr/mmwrTechFinish/queryTechList` |
| mmsm     | 炼钢管理 | `/mmsm/mmsmRsltLadleUse/list`        |
| sale     | 销售管理 | `/sale/saleOrder/list`               |
| hrms     | 人力资源 | `/hrms/hrmsEmployee/list`            |
| base     | 基础数据 | `/base/cmUserGroup/list`             |

### 标准操作集

| 操作     | 方法 | URL 后缀          | 说明                                                  |
| -------- | ---- | ----------------- | ----------------------------------------------------- |
| 分页列表 | POST | `/list`           | 基类 `super({ url: { list } })` 自动调用              |
| 单条查询 | GET  | `/getById?id=xxx` | `getAction(API_CONFIG.getById, { id })`               |
| 新增     | POST | `/save`           | `postAction(API_CONFIG.save, formData)`               |
| 编辑     | POST | `/update`         | `postAction(API_CONFIG.update, formData)`             |
| 删除     | POST | `/remove`         | 基类 `super({ url: { remove } })` + `this.remove(id)` |
| 导出     | GET  | `/export`         | `getAction(API_CONFIG.export, params)`                |

### 业务操作命名规范

非标准 CRUD 操作按以下约定命名，URL 后缀使用**动词原形**（camelCase）：

| 操作       | 方法 | URL 后缀          | 请求说明                                |
| ---------- | ---- | ----------------- | --------------------------------------- |
| 提交审批   | POST | `/submit`         | `{ id }` 或 `{ ids: [] }`              |
| 审批通过   | POST | `/approve`        | `{ id, opinion? }`                      |
| 审批驳回   | POST | `/reject`         | `{ id, opinion }`                       |
| 撤回       | POST | `/withdraw`       | `{ id }` 撤回已提交的单据              |
| 启用/禁用  | POST | `/changeStatus`   | `{ id, status }`                        |
| 转化       | POST | `/convert`        | `{ id }` 临时→正式（如临时客户→正式）  |
| 下发       | POST | `/release`        | `{ id }` 计划/工单下发执行              |
| 关闭       | POST | `/close`          | `{ id }` 关闭订单/计划                  |
| 作废       | POST | `/cancel`         | `{ id }` 作废单据                       |
| 批量操作   | POST | `/batchXxx`       | 如 `/batchSubmit`、`/batchRemove`       |
| 子表查询   | POST | `/queryXxxList`   | 如 `/queryDetailList`，主从表场景       |

> **命名原则**：`/[服务缩写]/[资源名]/[动作]`，动作用英文动词原形，不用中文拼音，不加 `do` / `handle` 前缀。

### 统一响应结构

```json
// 分页查询
{ "code": 200, "message": "操作成功", "result": { "records": [], "total": 100, "current": 1, "size": 20 } }

// 单条查询
{ "code": 200, "result": { /* Entity */ } }

// 增删改
{ "code": 200, "message": "操作成功", "result": true }
```

### 字段命名

| 端   | 规范         | 说明                           |
| ---- | ------------ | ------------------------------ |
| 前端 | `camelCase`  | 所有请求/响应字段名            |
| 后端 | `snake_case` | 数据库字段，Jackson 自动转驼峰 |

---

## 执行步骤

### Step 1：接收输入

从 Phase 1 《页面清单》获取：

- 业务服务缩写（如 `pm`）
- 资源名（camelCase，如 `omptMillPlanOrder`）
- 各页面的查询字段、表格列、表单字段

### Step 2：为每个页面生成 api.md

文件放在**页面目录下**（和 index.vue 同级），字段名与 data.ts 完全一致。

### Step 3：同步生成 API_CONFIG

api.md 中的接口 URL 直接对应 data.ts 中的 `API_CONFIG`：

```typescript
export const API_CONFIG = {
  list: "/pm/omptMillPlanOrder/list",
  remove: "/pm/omptMillPlanOrder/remove",
  getById: "/pm/omptMillPlanOrder/getById",
  save: "/pm/omptMillPlanOrder/save",
  update: "/pm/omptMillPlanOrder/update",
  export: "/pm/omptMillPlanOrder/export",
  // 按需增加业务操作
  release: "/pm/omptMillPlanOrder/release"
} as const;
```

---

## api.md 模板

每个页面目录下生成：

````markdown
# 接口约定 - [页面中文名]

> 页面路径：`src/views/[域]/[模块]/[子模块]/[目录]/`
> 服务缩写：[pm / mmwr / sale / ...]
> 资源名：[camelCase 实体名]
> 状态：🟡 待后端确认

---

## API_CONFIG

```typescript
export const API_CONFIG = {
  list: "/[服务缩写]/[资源名]/list",
  remove: "/[服务缩写]/[资源名]/remove",
  getById: "/[服务缩写]/[资源名]/getById",
  save: "/[服务缩写]/[资源名]/save",
  update: "/[服务缩写]/[资源名]/update",
  export: "/[服务缩写]/[资源名]/export"
} as const;
```

---

## 实体定义

> 字段名与 data.ts 中 queryDef/columnsDef 使用的字段名**完全一致**

| 字段名        | 类型   | 说明     | 必填 | 字典(logicValue) | 备注                 |
| ------------- | ------ | -------- | ---- | ---------------- | -------------------- |
| id            | string | 主键     | 自动 | -                | 后端生成             |
| [field1]      | string | [说明]   | ✅   | -                |                      |
| [statusField] | string | [状态]   | ✅   | [dictCode]       | 前端 logicValue 对应 |
| [dateField]   | string | [日期]   | ❌   | -                | YYYY-MM-DD           |
| createTime    | string | 创建时间 | 自动 | -                | YYYY-MM-DD HH:mm:ss  |
| updateTime    | string | 更新时间 | 自动 | -                |                      |
| createBy      | string | 创建人   | 自动 | -                |                      |

---

## 接口清单

### 1. 分页查询

```
POST /[服务缩写]/[资源名]/list
```

| 字段          | 类型   | 必填 | 说明                                |
| ------------- | ------ | ---- | ----------------------------------- |
| current       | number | ✅   | 页码（基类自动传）                  |
| size          | number | ✅   | 每页条数（基类自动传）              |
| [queryField1] | string | ❌   | [说明]                              |
| [queryField2] | string | ❌   | [说明]，对应 logicValue: [dictCode] |
| [startDate]   | string | ❌   | 开始日期 YYYY-MM-DD                 |
| [endDate]     | string | ❌   | 结束日期 YYYY-MM-DD                 |

**响应 records：** 同实体定义

### 2. 详情查询

```
GET /[服务缩写]/[资源名]/getById?id=xxx
```

**响应 result：** 单个 Entity

### 3. 新增

```
POST /[服务缩写]/[资源名]/save
```

**请求：** 实体定义中必填字段（不含 id、createTime 等自动字段）

### 4. 编辑

```
POST /[服务缩写]/[资源名]/update
```

**请求：** 同新增 + `id`（必填）

### 5. 删除

```
POST /[服务缩写]/[资源名]/remove
```

**请求：** `{ "ids": ["xxx"] }` 或 `{ "id": "xxx" }`

### 6. 导出（如需要）

```
GET /[服务缩写]/[资源名]/export?[查询参数]
```

---

## 数据字典

| dictCode(logicValue) | 用途   | 出现位置                     |
| -------------------- | ------ | ---------------------------- |
| [dictCode]           | [说明] | queryDef / columnsDef / form |

---

## 联调注意

1. 前端字段全部 camelCase，后端 JSON 序列化输出 camelCase
2. 时间字段统一 `YYYY-MM-DD HH:mm:ss`
3. 大数字 ID 后端转字符串
4. 分页参数是 `current` / `size`（基类自动处理）
5. 枚举字段前端传 value，后端可返回 `[field]Label` 辅助展示
````

---

## 状态标记

- 🟡 待后端确认 — 刚生成
- 🟢 已确认 — 双方对齐，可编码
- 🔴 有变更 — 需双方同步

# 页面查询 Hook 最佳实践

本文档介绍如何使用 `AbstractPageQueryHook` 基类进行页面配置化开发，无需维护独立的 API 层。

## 核心理念

**配置化驱动**：通过在 `data.ts` 中配置 `API_CONFIG` 直接调用基类内置的 HTTP 方法，实现"零 API 层"开发模式。

## 基类概述

`AbstractPageQueryHook` 来自 `@jhlc/common-core`，提供完整的分页查询 + CRUD 操作：

```typescript
import { AbstractPageQueryHook } from "@jhlc/common-core";

class MyPageHook extends AbstractPageQueryHook {
  constructor() {
    super({
      url: { list: "/api/list", remove: "/api/remove" },
      // page 默认值: { size: 20, current: 1 }
    });
  }

  // 必须实现以下三个抽象方法：
  queryDef()   { return []; }  // 查询条件 BaseQueryItemDesc[]
  columnsDef() { return []; }  // 表格列   TableColumnDesc[]
  toolbarDef() { return []; }  // 工具栏   ActionButtonDesc[]
}
```

### 源码构造参数（UsePageQueryConstructorParam）

| 参数             | 说明                       | 类型                                | 默认值           |
| ---------------- | -------------------------- | ----------------------------------- | ---------------- |
| url              | API 地址（list 必填）        | `{ list, remove?, save?, update? }` | -                |
| page             | 分页初始值                   | `ViewPage`                          | `{size:20, current:1}` |
| showSearchForm   | 是否显示搜索表单             | `boolean`                           | -                |
| constQueryParam  | 查询条件常量（每次请求自动附加） | `() => Record<string, any>`         | -                |
| queryParam       | 查询条件初始值               | `Q`                                 | `{}`             |
| requestMethod    | 请求方式                       | `RequestMethod`                     | `RequestMethod.get` |

### 核心属性（均为响应式 Ref）

| 属性       | 类型                 | 说明           |
| ---------- | -------------------- | -------------- |
| list       | `Ref<T[]>`           | 数据列表         |
| page       | `Ref<ViewPage>`      | 分页对象         |
| queryParam | `Ref<Q>`             | 查询条件对象     |
| columns    | `TableColumnDesc[]`  | 表格列（由 columnsDef 计算） |
| queryItems | `BaseQueryItemDesc[]`| 查询项（由 queryDef 计算） |
| toolbars   | `ActionButtonDesc[]` | 工具栏（由 toolbarDef 计算） |
| tableRef   | `Ref`                | 表格组件引用     |
| summaryRow | `Ref<T>`             | 汇总行         |

### 内置 HTTP 方法说明

所有内置方法的详细用法、参数说明、实战示例请参考：[request.md - AbstractPageQueryHook 基类内置方法](./request.md#abstractpagequeryhook-基类内置方法)

### 关键方法一览（源码）

| 方法                              | 说明                                   |
| --------------------------------- | -------------------------------------- |
| `select()`                        | 执行查询（自动读取 page + queryParam）      |
| `remove(id, index?, msg?)`        | 删除（带确认弹窗，删后自动刷新）         |
| `resetQuery()`                    | 重置查询条件并重新查询               |
| `saveBatch()`                     | 批量保存（自动区分新增/更新）            |
| `getSelection()`                  | 获取表格选中行                         |
| `exportExcel(option)`             | 导出 Excel                              |
| `actionBatch(action, url, tip, ids?, auto?)` | 批量操作统一封装          |
| `postBatch(url, tip, ids?)`       | 批量 POST                               |
| `putBatch(url, tip, ids?)`        | 批量 PUT                                |
| `deleteBatch(url, tip, ids)`      | 批量 DELETE                             |
| `unshiftEditRow()`                | 在列表顶部插入可编辑行                 |
| `openEdit(row)`                   | 开启行内编辑                           |

---

## 快速开始

### 步骤 1：定义 API 配置

在 `data.ts` 中直接配置接口路径：

```typescript
// data.ts
import { AbstractPageQueryHook } from "@jhlc/common-core";

const API_CONFIG = {
  list: "/mmsm/mmsmRsltLadleUse/list",
  get: "/mmsm/mmsmRsltLadleUse/getById",
  save: "/mmsm/mmsmRsltLadleUse/save",
  update: "/mmsm/mmsmRsltLadleUse/update",
  remove: "/mmsm/mmsmRsltLadleUse/remove"
};
```

### 步骤 2：实现抽象方法 + 编写 CRUD

```typescript
import { BusLogicDataType } from "@jhlc/types/src/logical-data";

class LadleUseQueryHook extends AbstractPageQueryHook {
  constructor() {
    super({ url: { list: API_CONFIG.list, remove: API_CONFIG.remove } });
  }

  // 查询条件定义
  queryDef() {
    return [
      { name: "ladleNum", label: "钢包号", placeholder: "请输入钢包号" },
      { name: "useDate", label: "使用日期", logicType: BusLogicDataType.date },
    ];
  }

  // 表格列定义
  columnsDef() {
    return [
      { name: "ladleNum", label: "钢包号", width: 120 },
      { name: "furnaceId", label: "炉号", width: 100 },
    ];
  }

  // 工具栏定义
  toolbarDef() {
    return [
      { name: "add", onClick: () => this.handleAdd() },
      { name: "removeBatch", onClick: () => this.handleBatchDelete() },
    ];
  }

  // 新增
  async handleAdd(row?: any) {
    await this.postAction(API_CONFIG.save, row);
    this.select(); // 刷新列表
  }

  // 编辑
  async handleEdit(row: any) {
    await this.putAction(API_CONFIG.update, row);
    this.select();
  }

  // 单个删除（内置 remove 已有确认弹窗，直接调用即可）
  handleDelete(row: any) {
    this.remove(row.id);
  }

  // 批量删除
  async handleBatchDelete() {
    await this.deleteBatch(API_CONFIG.remove, "确定批量删除？", this.getSelection().map(i => i.id));
  }
}
```

> **注意**: 源码中刷新列表的方法是 `this.select()`，不是 `getTableList()`

---

## 标准页面配置示例

完整的 `data.ts` 配置示例：

```typescript
import { AbstractPageQueryHook } from "@jhlc/common-core";
import { BusLogicDataType } from "@jhlc/types/src/logical-data";
import { BaseQueryItemDesc } from "@jhlc/common-core/src/components/form/base-query/type";
import { TableColumnDesc } from "@jhlc/common-core/src/components/table/base-table/type";
import { ActionButtonDesc } from "@jhlc/common-core/src/components/toolbar/type";

const API_CONFIG = {
  list: "/mmsm/mmsmRsltLadleUse/list",
  get: "/mmsm/mmsmRsltLadleUse/getById",
  save: "/mmsm/mmsmRsltLadleUse/save",
  update: "/mmsm/mmsmRsltLadleUse/update",
  remove: "/mmsm/mmsmRsltLadleUse/remove",
  exportExcel: "/mmsm/mmsmRsltLadleUse/export"
};

export class LadleUseQueryHook extends AbstractPageQueryHook {
  constructor() {
    super({
      url: { list: API_CONFIG.list, remove: API_CONFIG.remove },
      // page 默认 { size: 20, current: 1 }
    });
  }

  // 查询条件定义（抽象方法必须实现）
  queryDef(): BaseQueryItemDesc[] {
    return [
      {
        name: "ladleNum",
        label: "钢包号",
        placeholder: "请输入钢包号",
      },
      {
        name: "useDate",
        startName: "useDateStart",
        endName: "useDateEnd",
        label: "使用日期",
        defaultValue: "recentDay7",
        component: () => ({ tag: "jh-date", type: "daterange" }),
      },
      {
        name: "status",
        label: "状态",
        logicType: BusLogicDataType.dict,
        logicValue: "ladle_status",
      },
    ];
  }

  // 表格列定义（抽象方法必须实现）
  columnsDef(): TableColumnDesc[] {
    return [
      { type: "selection", width: 50 },
      { name: "ladleNum", label: "钢包号", width: 120 },
      { name: "furnaceId", label: "炉号", width: 100 },
      {
        name: "useDate", label: "使用日期", width: 120,
        logicType: BusLogicDataType.date,
      },
      {
        name: "status", label: "状态", width: 100,
        logicType: BusLogicDataType.dict,
        logicValue: "ladle_status",
      },
    ];
  }

  // 工具栏定义（抽象方法必须实现）
  toolbarDef(): ActionButtonDesc[] {
    return [
      { name: "add", onClick: () => this.handleAdd() },
      { name: "removeBatch", onClick: () => this.handleBatchDelete() },
      {
        name: "export", label: "导出",
        onClick: () => this.exportExcel({
          filename: "钢包使用记录.xlsx",
        }),
      },
    ];
  }

  // ========== CRUD 操作 ==========

  // 新增
  async handleAdd(row?: any) {
    const res = await this.postAction(API_CONFIG.save, row);
    if (res.success) {
      this.msgSuccess("新增成功");
      this.select(); // 刷新列表
    }
  }

  // 编辑
  async handleEdit(row: any) {
    const res = await this.putAction(API_CONFIG.update, row);
    if (res.success) {
      this.msgSuccess("更新成功");
      this.select();
    }
  }

  // 删除（内置 remove 已带确认弹窗）
  handleDelete(row: any) {
    this.remove(row.id);
  }

  // 批量删除
  async handleBatchDelete() {
    const ids = this.getSelection().map(i => i.id);
    await this.deleteBatch(API_CONFIG.remove, "确定批量删除？", ids);
  }

  // 详情查询
  async getDetail(id: string) {
    return await this.getAction(API_CONFIG.get, { id });
  }
}

export const createPage = () => new LadleUseQueryHook();
```

---

## 何时需要独立的 API 层？

在以下场景中，建议创建独立的 `api/` 文件：

### ✅ 需要独立 API 层的场景

1. **复杂的数据转换**

   ```typescript
   // api/complex-data.ts
   export async function fetchComplexData(params: any) {
     const res = await request.post("/api/data", params);
     // 复杂的数据转换逻辑
     return transformData(res.data);
   }
   ```

2. **多个页面共享同一接口**

   ```typescript
   // api/common.ts
   export const CommonAPI = {
     getDictData: (type: string) => request.get(`/dict/${type}`),
     uploadFile: (file: File) => request.upload("/upload", file)
   };
   ```

3. **需要组合多个接口调用**

   ```typescript
   // api/batch-operations.ts
   export async function batchProcess(ids: string[]) {
     const details = await Promise.all(
       ids.map((id) => request.get(`/detail/${id}`))
     );
     return await request.post("/batch", { data: details });
   }
   ```

4. **特殊的请求拦截或错误处理**
   ```typescript
   // api/special-request.ts
   export async function sensitiveOperation(data: any) {
     return await request.post("/sensitive", data, {
       headers: { "X-Custom-Token": getSpecialToken() }
     });
   }
   ```

### ⛔ 不需要独立 API 层的场景

1. **标准 CRUD 操作** - 直接使用基类方法
2. **简单的列表查询** - 配置 `API_CONFIG.list`
3. **单页面独享的接口** - 写在 `data.ts` 的 `API_CONFIG` 中

---

## 完整的方法参考

所有基类方法的详细文档请参考：

- [request.md - AbstractPageQueryHook 基类内置方法](./request.md#abstractpagequeryhook-基类内置方法)
  - 方法签名
  - 参数说明
  - 实战示例
  - 常见错误与解决方案

---

## 常见问题

### 1. 删除操作应优先使用内置 `remove()`

源码内置的 `this.remove(id)` 已包含确认弹窗 + 成功提示 + 自动刷新，无需自己封装：

```typescript
// ✅ 推荐：直接使用内置 remove
this.remove(row.id);

// ❌ 不推荐：自己封装确认弹窗 + deleteAction
await this.deleteAction(API_CONFIG.remove, { id: row.id });
```

### 2. `actionBatch` / `deleteBatch` 如何使用？

批量操作的统一封装，自动处理确认、提示、刷新：

```typescript
// 批量删除（源码内置自动调用 select() 刷新）
await this.deleteBatch(API_CONFIG.remove, "确定批量删除？", ids);

// 批量确认
await this.postBatch(API_CONFIG.confirm, "确定批量确认？", ids);

// 自定义批量操作
await this.actionBatch(
  this.deleteAction, // 要执行的 HTTP 方法
  API_CONFIG.remove, // 接口 URL
  "确定删除？",      // 确认提示文本
  ids,               // ID 列表（可省略，默认取选中行）
  true               // 是否自动显示成功提示
);
```

### 3. 如何自定义请求头？

所有内置方法都支持 `headers` 参数：

```typescript
await this.postAction(API_CONFIG.save, row, {}, { "X-Custom-Header": "value" });
```

### 4. 如何处理文件上传？

使用 `postAction` 配合 `FormData`：

```typescript
async handleUpload(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await this.postAction('/upload', formData, {}, {
    'Content-Type': 'multipart/form-data'
  })

  return res
}
```

---

## 最佳实践总结

1. **简单 CRUD**：直接在 `data.ts` 配置 `API_CONFIG` + 基类方法
2. **复杂逻辑**：创建独立 `api/` 文件进行封装
3. **查阅方法**：所有 HTTP 方法详细说明见 [request.md](./request.md)
4. **刷新列表**：统一使用 `this.select()`，不是 `getTableList()`
5. **删除操作**：单个用 `this.remove(id)`，批量用 `this.deleteBatch(url, tip, ids)`
6. **抽象方法**：必须实现 `queryDef()`、`columnsDef()`、`toolbarDef()`

---

**相关文档**：

- [request.md - HTTP 请求方法完整文档](./request.md)
- [request.md - AbstractPageQueryHook 基类内置方法](./request.md#abstractpagequeryhook-基类内置方法)

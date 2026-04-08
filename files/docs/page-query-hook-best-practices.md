# 页面查询 Hook 最佳实践

本文档介绍如何使用 `AbstractPageQueryHook` 基类进行页面配置化开发，无需维护独立的 API 层。

## 核心理念

**配置化驱动**：通过在 `data.ts` 中配置 `API_CONFIG` 直接调用基类内置的 HTTP 方法，实现"零 API 层"开发模式。

## 基类概述

`AbstractPageQueryHook` 来自 `@jhlc/common-core`，提供完整的 CRUD 操作：

```typescript
import { AbstractPageQueryHook } from "@jhlc/common-core";

class PageQueryHook extends AbstractPageQueryHook {
  // 继承所有内置方法:
  // getAction, postAction, putAction, deleteAction
  // actionBatch, postBatch, putBatch, deleteBatch
}
```

### 内置 HTTP 方法说明

所有内置方法的详细用法、参数说明、实战示例请参考：[request.md - AbstractPageQueryHook 基类内置方法](./request.md#abstractpagequeryhook-基类内置方法)

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

### 步骤 2：使用基类方法

直接调用 `this.getAction`、`this.postAction` 等内置方法：

```typescript
class LadleUseQueryHook extends AbstractPageQueryHook {
  // 新增
  async handleAdd(row: any) {
    await this.postAction(API_CONFIG.save, row);
    this.getTableList(); // 刷新列表
  }

  // 编辑
  async handleEdit(row: any) {
    await this.putAction(API_CONFIG.update, row);
    this.getTableList();
  }

  // 删除（单个）
  async handleDelete(row: any) {
    await this.deleteAction(API_CONFIG.remove, {}, { ids: [row.id] });
    this.getTableList();
  }

  // 批量删除
  async handleBatchDelete(ids: string[]) {
    await this.actionBatch(this.deleteAction, API_CONFIG.remove, "删除", ids);
    this.getTableList();
  }
}
```

---

## 标准页面配置示例

完整的 `data.ts` 配置示例：

```typescript
import { AbstractPageQueryHook } from "@jhlc/common-core";
import type { BaseFormItemDesc } from "@/types/jh4j-cloud";

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
    super();
    this.api = API_CONFIG.list;
  }

  // 查询条件配置
  formSchemas = [
    {
      field: "ladle_num",
      label: "钢包号",
      component: "Input",
      componentProps: { placeholder: "请输入钢包号" }
    },
    {
      field: "use_date",
      label: "使用日期",
      component: "DatePicker",
      componentProps: { type: "daterange", format: "YYYY-MM-DD" }
    }
  ] as BaseFormItemDesc<any>[];

  // 表单配置（新增/编辑）
  modalSchemas = [
    {
      field: "ladle_num",
      label: "钢包号",
      component: "Input",
      rules: [{ required: true, message: "请输入钢包号" }]
    },
    {
      field: "furnace_id",
      label: "炉号",
      component: "Input",
      rules: [{ required: true, message: "请输入炉号" }]
    },
    {
      field: "use_date",
      label: "使用日期",
      component: "DatePicker",
      componentProps: { type: "date", format: "YYYY-MM-DD" },
      rules: [{ required: true, message: "请选择使用日期" }]
    }
  ] as BaseFormItemDesc<any>[];

  // 表格列配置
  getColumns = () => [
    { title: "钢包号", dataIndex: "ladle_num", width: 120 },
    { title: "炉号", dataIndex: "furnace_id", width: 100 },
    { title: "使用日期", dataIndex: "use_date", width: 120 },
    {
      title: "操作",
      dataIndex: "action",
      width: 200,
      slots: { customRender: "action" }
    }
  ];

  // ========== CRUD 操作 ==========

  // 新增
  async handleAdd(row: any) {
    const res = await this.postAction(API_CONFIG.save, row);
    if (res.success) {
      this.$message.success("新增成功");
      this.getTableList();
    }
  }

  // 编辑
  async handleEdit(row: any) {
    const res = await this.putAction(API_CONFIG.update, row);
    if (res.success) {
      this.$message.success("更新成功");
      this.getTableList();
    }
  }

  // 删除
  async handleDelete(row: any) {
    const res = await this.deleteAction(
      API_CONFIG.remove,
      {},
      { ids: [row.id] }
    );
    if (res.success) {
      this.$message.success("删除成功");
      this.getTableList();
    }
  }

  // 批量删除
  async handleBatchDelete(ids: string[]) {
    await this.actionBatch(
      this.deleteAction,
      API_CONFIG.remove,
      "删除",
      ids,
      true
    );
    this.getTableList();
  }

  // 导出
  async handleExport() {
    const params = this.getQueryParams();
    await this.getAction(API_CONFIG.exportExcel, params);
  }

  // 详情查询
  async getDetail(id: string) {
    return await this.getAction(API_CONFIG.get, { id });
  }
}

export default new LadleUseQueryHook();
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

### 1. 删除操作失败？

**症状**：删除接口收到空的 `ids` 参数

**原因**：`deleteAction` 的第三个参数才是 `data`，不是第二个

**解决**：参考 [request.md - 删除操作示例](./request.md#实战示例-4删除操作)

```typescript
// ❌ 错误
await this.deleteAction(API_CONFIG.remove, { ids: [row.id] });

// ✅ 正确
await this.deleteAction(API_CONFIG.remove, {}, { ids: [row.id] });
```

### 2. `actionBatch` 如何使用？

**用法**：批量操作的统一封装，自动处理确认、提示、错误

**详细说明**：参考 [request.md - actionBatch 方法](./request.md#4-actionbatch---批量操作统一封装)

```typescript
// 批量删除
await this.actionBatch(
  this.deleteAction, // 要执行的方法
  API_CONFIG.remove, // 接口 URL
  "删除", // 操作名称
  ids, // ID 列表
  true // 是否自动成功提示
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
4. **参数顺序**：特别注意 `deleteAction(url, params, data, headers)` 的参数位置

---

**相关文档**：

- [request.md - HTTP 请求方法完整文档](./request.md)
- [request.md - AbstractPageQueryHook 基类内置方法](./request.md#abstractpagequeryhook-基类内置方法)

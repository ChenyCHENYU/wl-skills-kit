# request - HTTP 请求工具

> 基于 axios 封装的统一请求工具，自动处理响应数据解包、错误拦截、token 注入等

## 导入方式

```typescript
import request from "@jhlc/common-core/src/util/request";
```

## 基本用法

### GET 请求

```typescript
// 基础 GET 请求
const data = await request({
  url: "/api/user/list",
  method: "get"
});

// 带查询参数
const data = await request({
  url: "/api/user/detail",
  method: "get",
  params: { id: "123" }
});
```

### POST 请求

```typescript
// 创建数据
const result = await request({
  url: "/api/user/save",
  method: "post",
  data: {
    name: "张三",
    age: 25
  }
});

// 带查询参数的 POST
const result = await request({
  url: "/auth/oauth/token",
  method: "post",
  params: {
    grant_type: "password",
    username: "admin"
  }
});
```

### PUT 请求

```typescript
// 更新数据
const result = await request({
  url: "/api/user/update",
  method: "put",
  data: {
    id: "123",
    name: "李四"
  }
});
```

### DELETE 请求

```typescript
// 删除数据
const result = await request({
  url: "/api/user/delete",
  method: "delete",
  params: { id: "123" }
});
```

## 响应数据结构

`request()` 的 response interceptor 执行 `return cloneDeep(res.data)`，直接返回 HTTP 响应体，即 `ApiResult<T>` 结构：

```typescript
// ApiResult<T> 类型定义（来自 @jhlc/types）
interface ApiResult<T = any> {
  code: number;     // 2000 = 成功，200 也被接受（mock 常用）
  message: string;  // 提示信息
  data: T;          // 实际业务数据
}

// 后端返回的 HTTP 响应体（request() 直接返回这层，不再多一层 .data）
{
  code: 2000,
  message: "操作成功",
  data: { id: 1, name: "张三" }
}

// 使用 request 后直接拿到
const result = await request({ url: "/api/xxx", method: "get" });
console.log(result.code);     // 2000
console.log(result.message);  // "操作成功"
console.log(result.data);     // { id: 1, name: "张三" }（业务数据）
```

> **与 `getAction`/`postAction` 的关系**：这些 action 函数内部调用 `request()`，返回值结构**完全相同**，类型签名为 `Promise<ApiResult<T>>`。`ApiResult<T>` 就是上面的 `{ code, message, data: T }`，两者等价。

## 常见场景

### 场景 1：列表查询

```typescript
// src/views/your-module/data.ts
async select() {
  const params = {
    current: this.page.current,
    size: this.page.size,
    ...this.queryParam.value
  };

  const result = await request({
    url: "/api/order/list",
    method: "get",
    params
  });

  this.list.value = result.data.records;
  this.page.total = result.data.total;
}
```

### 场景 2：表单保存

```typescript
// 新增/编辑统一处理
async save() {
  const result = await request({
    url: this.isEdit ? "/api/user/update" : "/api/user/save",
    method: this.isEdit ? "put" : "post",
    data: this.form.value
  });

  this.msgSuccess(result.message || "操作成功");
}
```

### 场景 3：获取详情

```typescript
async getById(id: string) {
  const result = await request({
    url: "/api/order/getOneById",
    method: "get",
    params: { id }
  });

  this.form.value = result.data;
}
```

### 场景 4：删除数据

```typescript
async remove(id: string) {
  const result = await request({
    url: "/api/order/remove",
    method: "delete",
    params: { id }
  });

  this.msgSuccess(result.message || "删除成功");
  this.select(); // 刷新列表
}
```

### 场景 5：文件下载

```typescript
// 下载文件需要设置 responseType
async downloadFile() {
  const res = await request({
    url: "/api/file/download",
    method: "get",
    params: { id: "123" },
    responseType: "arraybuffer"
  });

  // 创建 Blob 并下载
  const blob = new Blob([res], { type: "application/vnd.ms-excel" });
  const downloadElement = document.createElement("a");
  const href = window.URL.createObjectURL(blob);
  downloadElement.href = href;
  downloadElement.download = "文件名.xlsx";
  document.body.appendChild(downloadElement);
  downloadElement.click();
  document.body.removeChild(downloadElement);
}
```

### 场景 6：获取字典数据

```typescript
// 获取下拉选项
async loadDictOptions() {
  const result = await request({
    url: "/system/dictDtl/getListByDicSn",
    method: "get",
    params: { strSn: "ORDER_STATUS" }
  });

  this.statusOptions = result.data;
}
```

## 配置选项

```typescript
interface RequestConfig {
  url: string; // 请求地址（必填）
  method: string; // 请求方法：get、post、put、delete（必填）
  params?: object; // URL 查询参数
  data?: object; // 请求体数据（POST/PUT）
  headers?: object; // 自定义请求头
  responseType?: string; // 响应类型：json、arraybuffer、blob
  timeout?: number; // 超时时间（毫秒）
}
```

## 与原生 axios 对比

### 原生 axios（啰嗦）

```typescript
import axios from "axios";

// 需要手动解包 res.data
const res = await axios.get("/api/user/list");
console.log(res.data.data); // 两层 data

// POST 请求参数位置不一致
await axios.post("/api/user/save", formData);
await axios.get("/api/user/detail", { params: { id: 1 } });
```

### 封装 request（统一）

```typescript
import request from "@jhlc/common-core/src/util/request";

// 自动解包，直接拿到数据
const result = await request({
  url: "/api/user/list",
  method: "get"
});
console.log(result.data); // 一层 data

// 所有请求配置统一
await request({ url: "/api/user/save", method: "post", data: formData });
await request({ url: "/api/user/detail", method: "get", params: { id: 1 } });
```

## 自动处理功能

1. **自动解包**：返回 `{ code, message, data }` 格式，无需 `res.data.data`
2. **Token 注入**：自动从 localStorage 读取 token 并添加到请求头
3. **错误拦截**：统一处理 401/403/500 等错误，自动弹出提示
4. **双码成功**：`code: 2000`（真实后端业务码）和 `code: 200`（mock 常用值）均视为成功
5. **i18n 支持**：自动在请求头注入当前语言（`Lang` header）

## 在组件中使用

### 页面 Hook 中

```typescript
// src/views/your-module/data.ts
import request from "@jhlc/common-core/src/util/request";

export function createPage() {
  const Page = new (class extends AbstractPageQueryHook {
    async customMethod() {
      const result = await request({
        url: "/api/custom",
        method: "post",
        data: { key: "value" }
      });
      return result.data;
    }
  })();

  return Page.create();
}
```

### API 文件中

```typescript
// src/api/user.ts
import request from "@jhlc/common-core/src/util/request";

export function getUserList(params: any) {
  return request({
    url: "/api/user/list",
    method: "get",
    params
  });
}

export function saveUser(data: any) {
  return request({
    url: "/api/user/save",
    method: "post",
    data
  });
}
```

## 错误处理

```typescript
try {
  const result = await request({
    url: "/api/user/save",
    method: "post",
    data: formData
  });
  console.log("成功:", result.message);
} catch (error) {
  console.error("失败:", error);
  // request 会自动弹出错误提示，这里可以做额外处理
}
```

## 注意事项

1. **method 必填**：必须明确指定请求方法（get、post、put、delete）
2. **params vs data**：
   - `params`：URL 查询参数，适用于 GET/DELETE
   - `data`：请求体数据，适用于 POST/PUT
3. **返回值**：直接返回 `ApiResult<T>` = `{ code, message, data }`，不是 axios 的 response 对象（已自动解包一层）
4. **错误处理**：request 会自动处理错误并提示，通常不需要手动 catch
5. **mock 的 code 值**：response interceptor 同时接受 `code: 200` 和 `code: 2000` 作为成功。项目 mock 文件通常写 `code: 200`（HTTP 标准），真实后端使用业务码 `code: 2000`，两者均正常工作

## 实际案例

### 案例 1：登录

```typescript
// src/api/login.ts
export function login(username: string, password: string) {
  return request({
    url: "/auth/oauth/token",
    method: "post",
    params: {
      grant_type: "password",
      username,
      password,
      client_id: "c1",
      client_secret: "secret"
    }
  });
}

// 使用
const result = await login("admin", "123456");
localStorage.setItem("token", result.data.access_token);
```

### 案例 2：CRUD 完整流程

```typescript
// src/views/order/data.ts
import request from "@jhlc/common-core/src/util/request";

export function createPage(modalRef: Ref<any>) {
  const Page = new (class extends AbstractPageQueryHook {
    // 查询列表
    async select() {
      const result = await request({
        url: "/api/order/list",
        method: "get",
        params: {
          current: this.page.current,
          size: this.page.size
        }
      });
      this.list.value = result.data.records;
    }

    // 删除
    async remove(id: string) {
      const result = await request({
        url: "/api/order/remove",
        method: "delete",
        params: { id }
      });
      this.msgSuccess(result.message);
      this.select();
    }
  })();

  return Page.create();
}

// Modal 弹窗
export function createFormModal(props, mode, emit) {
  const Page = new (class extends AbstractFormHook {
    // 保存（新增/编辑）
    async save() {
      const result = await request({
        url: mode.value === "add" ? props.api.save : props.api.update,
        method: mode.value === "add" ? "post" : "put",
        data: this.form.value
      });
      this.msgSuccess(result.message);
      emit("ok");
    }

    // 获取详情
    async getById(id: string) {
      const result = await request({
        url: props.api.getById,
        method: "get",
        params: { id }
      });
      this.form.value = result.data;
    }
  })();

  return Page.create();
}
```

---

## 📌 AbstractPageQueryHook 基类内置方法

> 在继承 `AbstractPageQueryHook` 的页面中，可以直接使用以下内置方法，**无需单独创建 API 层文件**。
> 这些方法（`getAction`/`postAction`/`putAction`/`deleteAction`）也可以单独导入使用：
> ```typescript
> import { getAction, postAction, putAction, deleteAction } from "@jhlc/common-core/src/api/action";
> ```
> 返回值均为 `Promise<ApiResult<T>>`，即 `{ code: number, message: string, data: T }`，与直接调用 `request()` 完全相同。

### 可用方法一览

| 方法 | 作用 | 推荐场景 |
|------|------|---------|
| `this.getAction` | GET 请求 | 查询详情、获取下拉选项 |
| `this.postAction` | POST 请求 | 新增、批量审批、自定义操作 |
| `this.putAction` | PUT 请求 | 修改、批量更新 |
| `this.deleteAction` | DELETE 请求 | 删除（单条/批量） |
| `this.actionBatch` | 批量操作封装 | 带确认框的批量POST/PUT |
| `this.postBatch` | POST批量快捷方法 | 批量审批、批量导入 |
| `this.putBatch` | PUT批量快捷方法 | 批量修改状态 |
| `this.deleteBatch` | DELETE批量快捷方法 | 批量删除 |

---

### 方法签名与参数说明

#### getAction
```typescript
/**
 * GET 请求
 * @param url - 接口地址
 * @param params - 查询参数（拼接到URL上）
 * @param headers - 请求头配置（可选）
 */
this.getAction<T>(url: string, params?: object, headers?: RequestHeader): Promise<ApiResult<T>>

// 示例
const res = await this.getAction("/api/order/detail", { id: "123" });
console.log(res.data);
```

#### postAction
```typescript
/**
 * POST 请求
 * @param url - 接口地址
 * @param data - 请求体数据
 * @param query - URL查询参数（可选）
 * @param headers - 请求头配置（可选）
 */
this.postAction<T>(url: string, data?: any, query?: object, headers?: RequestHeader): Promise<ApiResult<T>>

// 示例：审批操作
this.postAction("/api/order/approve", { ids: [row.id], status: "approved" });

// 示例：带query参数的POST
this.postAction("/api/user/import", fileData, { type: "excel" });
```

#### putAction
```typescript
/**
 * PUT 请求
 * @param url - 接口地址
 * @param data - 请求体数据
 * @param query - URL查询参数（可选）
 * @param headers - 请求头配置（可选）
 */
this.putAction<T>(url: string, data?: any, query?: object, headers?: RequestHeader): Promise<ApiResult<T>>

// 示例：修改状态
this.putAction("/api/order/updateStatus", { id: row.id, status: "completed" });
```

#### deleteAction ⚠️
```typescript
/**
 * DELETE 请求
 * @param url - 接口地址
 * @param params - URL查询参数（第二个参数）
 * @param data - 请求体数据（第三个参数）⚠️
 * @param headers - 请求头配置（可选）
 */
this.deleteAction<T>(url: string, params?: any, data?: any, headers?: RequestHeader): Promise<ApiResult<T>>

// ✅ 正确用法：把 ids 放在 data（第三个参数）
this.deleteAction("/api/order/remove", {}, { ids: [row.id] });

// ❌ 错误用法：ids 会被当作 params（query参数）
this.deleteAction("/api/order/remove", { ids: [row.id] }); // Mock/后端期望body时会失败
```

#### actionBatch
```typescript
/**
 * 批量操作封装（自动处理选择、确认、刷新）
 * @param action - 要执行的方法（this.postAction / this.putAction）
 * @param url - 接口地址
 * @param tip - 确认提示文字
 * @param idList - ID数组（可选，默认获取选中行）
 * @param autoTipSuccess - 是否自动提示成功（默认false）
 */
this.actionBatch(
  action: Function, 
  url: string, 
  tip: string, 
  idList?: string[], 
  autoTipSuccess?: boolean
): Promise<ApiResult>

// 示例：批量审批
this.actionBatch(
  this.postAction,
  "/api/order/batchApprove",
  "确定审批选中的订单吗？",
  this.getSelection().map(i => i.id)
);

// ⚠️ 注意：不要用于 deleteAction（参数位置不匹配）
// ❌ this.actionBatch(this.deleteAction, url, tip, ids) // ids会变成params
```

#### postBatch / putBatch / deleteBatch
```typescript
/**
 * 快捷批量方法（自动处理选择、确认、刷新、成功提示）
 * @param url - 接口地址
 * @param tip - 确认提示
 * @param idList - ID数组（可选）
 */
this.postBatch(url: string, tip: string, idList?: string[]): Promise<ApiResult>
this.putBatch(url: string, tip: string, idList?: string[]): Promise<ApiResult>
this.deleteBatch(url: string, tip: string, idList?: string[]): Promise<ApiResult>

// 示例
this.postBatch("/api/order/batchApprove", "确定审批选中数据？");
```

---

### 📝 实战示例

#### 示例1：单行操作按钮

```typescript
// data.ts
columnsDef(): TableColumnDesc[] {
  return [
    // ... 其他列
    {
      label: "操作",
      width: 200,
      fixed: "right",
      operations: [
        {
          name: "approve",
          label: "审批",
          onClick: (row: any) =>
            this.confirm("确定审批该记录吗？", "提示").then(() => {
              this.postAction(API_CONFIG.approve, { id: row.id, status: "approved" })
                .then(res => {
                  this.msgSuccess(res.message);
                  this.select(); // 刷新列表
                });
            })
        },
        {
          name: "delete",
          label: "删除",
          onClick: (row: any) =>
            this.confirm("确定删除吗？", "警告").then(() => {
              // ✅ 注意：deleteAction 的 ids 放在第三个参数（data）
              this.deleteAction(API_CONFIG.remove, {}, { ids: [row.id] })
                .then(res => {
                  this.msgSuccess(res.message);
                  this.select();
                });
            })
        }
      ]
    }
  ];
}
```

#### 示例2：工具栏批量操作

```typescript
// data.ts
toolbarDef(): ActionButtonDesc[] {
  return [
    {
      label: "批量审批",
      type: "primary",
      icon: "Check",
      onClick: () => {
        const ids = this.getSelection().map(i => i.id);
        if (!ids.length) {
          this.msgWarning("请选择数据");
          return;
        }
        
        // ✅ 方式1：使用 actionBatch（推荐）
        this.actionBatch(
          this.postAction,
          API_CONFIG.batchApprove,
          "确定审批选中数据吗？",
          ids
        );
      }
    },
    {
      label: "批量删除",
      type: "danger",
      icon: "Delete",
      onClick: () => {
        const ids = this.getSelection().map(i => i.id);
        if (!ids.length) {
          this.msgWarning("请选择数据");
          return;
        }
        
        // ✅ 方式2：手动调用（DELETE需要这样）
        this.confirm("确定删除选中数据吗？", "警告").then(() => {
          this.deleteAction(API_CONFIG.remove, {}, { ids }).then(res => {
            this.msgSuccess(res.message);
            this.select();
          });
        });
      }
    },
    {
      label: "批量发布",
      type: "success",
      icon: "Upload",
      onClick: () => {
        // ✅ 方式3：使用快捷方法 postBatch
        this.postBatch(API_CONFIG.batchPublish, "确定发布选中数据吗？");
      }
    }
  ];
}
```

#### 示例3：获取详情/下拉选项

```typescript
// data.ts
async loadOptions() {
  // 获取字典选项
  const res = await this.getAction("/system/dictDtl/getListByDicSn", { strSn: "ORDER_STATUS" });
  this.statusOptions = res.data;
}

async viewDetail(id: string) {
  // 查看详情
  const res = await this.getAction(API_CONFIG.getById, { id });
  this.detailData.value = res.data;
}
```

#### 示例4：复杂参数场景

```typescript
// 带复杂参数的批量操作
onClick: () => {
  const rows = this.getSelection();
  if (!rows.length) {
    this.msgWarning("请选择数据");
    return;
  }
  
  this.confirm("确定提交选中数据吗？", "提示").then(() => {
    // 自定义参数结构
    this.postAction(API_CONFIG.batchSubmit, {
      ids: rows.map(r => r.id),
      submitTime: new Date().toISOString(),
      operator: "admin",
      remark: "批量提交"
    }).then(res => {
      this.msgSuccess(res.message);
      this.select();
    });
  });
}
```

---

### ⚠️ 常见错误与注意事项

#### 错误1：deleteAction 参数位置错误

```typescript
// ❌ 错误：ids被当作params（query参数）
this.deleteAction(API_CONFIG.remove, { ids: [row.id] });
// 实际请求：DELETE /api/remove?ids=xxx （Mock/后端期望body时会失败）

// ✅ 正确：ids放在第三个参数（data/body）
this.deleteAction(API_CONFIG.remove, {}, { ids: [row.id] });
// 实际请求：DELETE /api/remove  Body: { ids: ["xxx"] }
```

#### 错误2：actionBatch 用于 deleteAction

```typescript
// ❌ 错误：actionBatch会把ids传给deleteAction的第二个参数（params）
this.actionBatch(this.deleteAction, API_CONFIG.remove, "确定删除？", ids);
// 等价于：this.deleteAction(url, ids) ← ids变成了params

// ✅ 正确：手动调用
this.confirm("确定删除？", "警告").then(() => {
  this.deleteAction(API_CONFIG.remove, {}, { ids }).then(res => {
    this.msgSuccess(res.message);
    this.select();
  });
});
```

#### 错误3：忘记刷新列表

```typescript
// ❌ 错误：操作成功后没有刷新
onClick: (row) =>
  this.postAction(API_CONFIG.approve, { id: row.id })
    .then(res => this.msgSuccess(res.message));

// ✅ 正确：调用 this.select() 刷新
onClick: (row) =>
  this.postAction(API_CONFIG.approve, { id: row.id })
    .then(res => {
      this.msgSuccess(res.message);
      this.select(); // ← 刷新列表
    });
```

#### 错误4：没有选中数据检查

```typescript
// ❌ 错误：没有检查是否选中数据
onClick: () => {
  const ids = this.getSelection().map(i => i.id);
  this.postBatch(API_CONFIG.batchApprove, "确定审批？", ids);
}

// ✅ 正确：先检查
onClick: () => {
  const ids = this.getSelection().map(i => i.id);
  if (!ids.length) {
    this.msgWarning("请选择数据");
    return;
  }
  this.postBatch(API_CONFIG.batchApprove, "确定审批？", ids);
}
```

---

### 🎯 最佳实践

#### 1. 统一使用 API_CONFIG 管理路径

```typescript
// data.ts
export const API_CONFIG = {
  list: "/api/order/list",
  remove: "/api/order/remove",
  approve: "/api/order/approve",
  batchSubmit: "/api/order/batchSubmit"
} as const;

// 使用时引用配置
this.postAction(API_CONFIG.approve, data);
```

#### 2. 单行操作用 confirm + action

```typescript
// 单行删除、审批等
onClick: (row) =>
  this.confirm("确定操作吗？", "提示").then(() => {
    this.postAction(API_CONFIG.xxx, { id: row.id })
      .then(res => {
        this.msgSuccess(res.message);
        this.select();
      });
  })
```

#### 3. 批量操作用 actionBatch 或 xxxBatch

```typescript
// 批量POST/PUT：使用 actionBatch
this.actionBatch(this.postAction, API_CONFIG.batchApprove, "确定审批？", ids);

// 批量DELETE：手动调用
this.confirm("确定删除？", "警告").then(() => {
  this.deleteAction(API_CONFIG.remove, {}, { ids }).then(/* ... */);
});

// 或使用快捷方法
this.postBatch(API_CONFIG.batchApprove, "确定审批？");
```

#### 4. 复杂场景可封装方法

```typescript
// data.ts
export function createPage() {
  return new class extends AbstractPageQueryHook {
    // 封装复杂的批量操作
    async batchApproveWithRemark() {
      const rows = this.getSelection();
      if (!rows.length) {
        this.msgWarning("请选择数据");
        return;
      }
      
      // 弹出输入框获取备注
      const remark = await this.prompt("请输入审批意见", "审批");
      if (!remark) return;
      
      return this.postAction(API_CONFIG.batchApprove, {
        ids: rows.map(r => r.id),
        remark,
        approveTime: new Date()
      }).then(res => {
        this.msgSuccess(res.message);
        this.select();
      });
    }
  }
}
```

---

### 📚 何时需要独立 API 文件？

虽然基类方法已覆盖大部分场景，但以下情况仍建议创建 `api/*.ts`：

1. **复杂参数转换**  
   ```typescript
   // 需要复杂的前置数据处理
   export function submitOrder(form: OrderForm) {
     const params = {
       ...form,
       items: form.items.map(transformItem), // 复杂转换
       attachments: await uploadFiles(form.files) // 异步前置
     };
     return request({ url: "/api/order/submit", method: "post", data: params });
   }
   ```

2. **特殊 Header 或 Content-Type**  
   ```typescript
   // 文件上传、multipart等
   export function uploadFile(file: File) {
     const formData = new FormData();
     formData.append("file", file);
     return request({
       url: "/api/file/upload",
       method: "post",
       data: formData,
       headers: { "Content-Type": "multipart/form-data" }
     });
   }
   ```

3. **多个接口组合调用**  
   ```typescript
   // 需要先后调用多个接口
   export async function publishOrder(id: string) {
     await request({ url: `/api/order/validate/${id}`, method: "get" });
     await request({ url: `/api/order/lock/${id}`, method: "post" });
     return request({ url: `/api/order/publish/${id}`, method: "post" });
   }
   ```

4. **跨模块复用**  
   ```typescript
   // 多个页面都要调用的通用接口
   export function getUserInfo() {
     return request({ url: "/api/user/info", method: "get" });
   }
   ```

对于**简单的 CRUD + 按钮操作**，直接在 `data.ts` 中使用基类方法即可，**无需创建 API 文件**。

---

## 总结

- **统一配置**：所有请求使用相同的配置格式
- **自动解包**：无需关心 axios 的 response 结构
- **类型安全**：配合 TypeScript 获得完整类型提示
- **易于维护**：所有 HTTP 请求逻辑统一管理
- **项目规范**：与团队其他成员保持一致的代码风格
- **基类优先**：继承 `AbstractPageQueryHook` 时优先使用内置方法，减少 API 层文件

---

**相关文档**：
- [AbstractPageQueryHook 页面开发最佳实践](./page-query-hook-best-practices.md)

---


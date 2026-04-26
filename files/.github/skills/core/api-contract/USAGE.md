# 使用指南：api-contract（接口约定）

> **谁读这个文档**：团队成员（前端/后端/产品）
> **AI 触发文件**：同目录 `SKILL.md`

---

## 这个 Skill 解决什么问题

为每个页面生成一份 `api.md`，**作为前后端联调的契约**：

- 前端：`data.ts` 里的 `API_CONFIG` URL、查询字段直接来源于此
- 后端：拿 api.md 即可写 Controller + Service + Entity，字段名一致零联调成本

---

## 何时使用

- 拿到《页面清单》（来自 `prototype-scan`），准备让后端开发接口
- 已有页面但接口未定义，需要补齐契约
- 接口字段需要变更，更新 api.md 让前后端同步

---

## 触发关键词

`接口约定` / `api.md` / `字段定义` / `前后端对齐` / `接口设计`

---

## 真实响应契约（务必背下来）

```json
// 分页
{ "code": 2000, "message": "操作成功", "data": { "records": [...], "total": 100, "current": 1, "size": 20, "pages": 5, "countId": null, "maxLimit": null, "orders": [], "searchCount": true } }

// 单条 / 数组
{ "code": 2000, "message": "...", "data": { /* 或 [] */ } }

// 失败
{ "code": 4001, "message": "...", "data": null }
```

- **code 成功值是 `2000`**（不是 200！）
- **包裹字段是 `data`**（不是 `result`！）
- 业务代码 `.then(res => res)` 拿到的已是 `data` 内容（拦截器剥壳）

---

## 标准对话示例

```
你：基于 reports/PROTOTYPE_SCAN_客户管理_20260426.md 生成各页面的 api.md
AI：[Pre-flight]
    将生成 7 个 api.md 文件，输出位置：
    src/views/produce/aiflow/mmwr-customer-archive/api.md
    src/views/produce/aiflow/mmwr-customer-detail/api.md
    ...
    服务缩写：mmwr，资源名：mmwrCustomer*
    需向你确认 3 项：
    1. 主键字段是 customerCode 还是 customerNo？
    2. 状态字典 logicValue 是 customer_state 还是 mmwr_customer_state？
    3. 临时客户转正式客户是 /convert 还是单独接口？
```

---

## 输出物

每个页面目录下生成 `api.md`，结构：

1. **API_CONFIG**（粘贴到 data.ts 用）
2. **实体定义**（字段名、类型、字典、必填）
3. **接口清单**（list/getById/save/update/remove/export + 业务操作如 release/approve）
4. **数据字典**（dictCode 列表）
5. **联调注意**

---

## 团队协作流程

1. 前端基于 prototype-scan 输出生成 api.md（标 🟡 待确认）
2. **发后端 review**（钉钉/IM 直接发文件路径）
3. 后端确认字段，标 🟢 已确认
4. 后端按 api.md 出接口，前端按 api.md 写 data.ts
5. 联调时若有变更，更新 api.md 并标 🔴 有变更，双方同步修改

---

## 常见踩坑

| 现象                                              | 原因                           | 解法                                          |
| ------------------------------------------------- | ------------------------------ | --------------------------------------------- |
| 字段名不一致（前端 customerNo 后端 customerCode） | 没走 api.md 直接编码           | 强制约定：**先 api.md 再 data.ts**            |
| 拦截器报"code 不是 2000"                          | mock 数据用了 200              | 改 mock 为 2000                               |
| 业务代码报 `data.records is undefined`            | 后端忘记包装外壳，返回了纯数组 | 后端按契约包 `{ code, message, data: {...} }` |
| 雪花 ID 精度丢失                                  | 后端返回 number                | 后端 ID 字段统一 String 序列化                |

---

## FAQ

**Q：api.md 一定要放在页面目录下吗？**
A：是。便于 PR review 时一眼看到改了哪个页面的契约。

**Q：可以跳过 api.md 直接 codegen 吗？**
A：技术上可以，AI 会用通用模板字段，但**联调时必踩坑**。建议至少写到"实体定义"段落。

**Q：业务操作（如 release / approve）需要写吗？**
A：写。`page-codegen` 会读取 api.md 中的业务操作列表，自动在 toolbar 里加按钮。

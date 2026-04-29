# permission-sync · 使用示例

> 给团队成员看的快速上手文档。AI 触发协议见 `SKILL.md`。

---

## 一句话理解

**permission-sync = 角色管理 + 角色授权 + 挂动作 + 加 v-permission**

整条链路覆盖"页面建好后，怎么让指定角色的人能看见、能点按钮"的全过程。

---

## 三种典型对话

### 1. 创建角色

```
用户：创建一个测试角色，code 是 test_qa
AI ： [触发 permission-sync]
     [Pre-flight] 模式 = role-manage
     调用 wls_role_query 检查 → code=test_qa 不存在
     调用 wls_role_upsert
     ✅ 创建成功
```

### 2. 给角色分配菜单

```
用户：给『档案普通人员』分配『客户档案』和『客户申请』两个菜单
AI ： [触发 permission-sync]
     [Pre-flight] 模式 = role-assign
     ⚠️ 注意：saveRoleMenus 是全量覆盖，原有菜单会被替换
     是否继续？(yes/no)
用户：yes
AI ： 调用 wls_role_assign_menus
     ✅ 角色授权成功
```

### 3. 给页面挂动作 + 加权限字段（数据驱动，无需改模板）

```
用户：给『客户档案』页面加上 新增/编辑/删除 三个按钮
AI ： [触发 permission-sync]
     [Pre-flight] 模式 = action-attach
     1. wls_action_query 查询已有动作 → 无
     2. wls_action_upsert 注册到后端：customer_add / customer_edit / customer_remove
     3. 在 src/views/customer/list/data.ts 找到工具栏按钮配置，
        给每个对应按钮的 ActionButtonDesc 添加 permission 字段：
        { name: 'add', label: '新增', permission: ['customer_add'], ... }
     ✅ 完成（已写报告 reports/PERMISSION_SYNC_20260429.md）
```

> **为什么不用 v-permission 指令？**  
> 本项目 `BaseToolbar` 内部读取 `ActionButtonDesc.permission` 字段做权限控制，  
> 只需在 `data.ts` 的按钮配置对象里加字段，不需要改 `.vue` 模板，也不依赖全局指令注册。

---

## 常见问题

### Q1：角色授权时，为什么 menuIds 要传完整列表？

后端 `saveRoleMenus` 是**全量覆盖**接口。你传 `[A, B]`，原先 `[A, B, C]` 就会变成 `[A, B]`，C 丢失。

**正确做法**：先查角色现有菜单 → 合并新菜单 → 一起传。

### Q2：权限码写在 `data.ts` 哪里？不需要改模板吗？

对，**不需要改模板（`.vue` 文件）**。`BaseToolbar` 从 `ActionButtonDesc` 的 `permission` 字段读取权限码，在渲染时内部做拦截，标准结构如下：

```ts
// data.ts
{
  name: 'edit',
  label: '编辑',
  permission: ['qmmcProcessCodeMain_update'],  // ← 就加这一行
  onClick: (row: any) => modalRef.value?.edit(row.id)
}
```

`permission` 是数组，支持多权限码 OR 逻辑（有其中任意一个权限码即显示按钮）。

### Q3：权限码用短形式还是长形式？

参照项目既有用法。新项目建议短形式（`customer_add`），与平台示例数据一致。

### Q4：能批量删除角色/动作吗？

**不能**。permission-sync 仅新增不删除（防误删）。删除请走后端管理界面手动操作。

---

## 配置要点

只需 `.github/skills/sync/env.local.json` 的根字段：

```json
{
  "gatewayPath": "http://你的网关:端口",
  "sysAppNo": "应用编码",
  "token": "Bearer Token"
}
```

不需要额外配置 `parentRoleId` / `parentPermissionId` 之类——所有父级 id 由 AI 在执行流程中通过查询接口动态获取。

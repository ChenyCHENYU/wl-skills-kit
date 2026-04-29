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

### 3. 给页面挂动作 + 加 v-permission

```
用户：给『客户档案』页面加上 新增/编辑/删除 三个按钮
AI ： [触发 permission-sync]
     [Pre-flight] 模式 = action-attach
     1. wls_action_query 查询已有动作 → 无
     2. wls_action_upsert 创建 customer_add / customer_edit / customer_remove
     3. 改造 src/views/customer/list/index.vue toolbar，加 v-permission
     ✅ 完成（已写报告 reports/PERMISSION_SYNC_20260429.md）
```

---

## 常见问题

### Q1：角色授权时，为什么 menuIds 要传完整列表？

后端 `saveRoleMenus` 是**全量覆盖**接口。你传 `[A, B]`，原先 `[A, B, C]` 就会变成 `[A, B]`，C 丢失。

**正确做法**：先查角色现有菜单 → 合并新菜单 → 一起传。

### Q2：v-permission 指令在哪里实现？

通常由项目基座（`@jhlc/common-core` 或登录 store）注册全局指令。检查方式：
```bash
grep -r "v-permission\|app.directive('permission'" src/
```
如未找到，请联系架构组确认。

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

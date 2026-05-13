---
name: permission-sync
description: "Use when: managing roles, authorizing menus to roles, attaching action buttons (type=A) to page menus, or wiring permission field in data.ts toolbar config. Triggers on: 创建角色, 角色管理, 角色授权, 给角色分配菜单, 挂动作, 添加动作按钮, 同步权限, 权限码注册, role assign, permission sync."
---

# Skill: 权限同步（permission-sync）

将系统的**角色 → 菜单授权 → 动作按钮 → `data.ts` 权限码字段**串成一条链路，覆盖从权限注册到代码落地的全流程。

> **与 menu-sync / dict-sync 的关系**：完全对称，统一从 `.github/skills/sync/env.local.json` 读取配置。`menu-sync` 负责页面菜单（type=M/C），`permission-sync` 负责其上的角色与动作（type=A）。

---

## 配置（统一配置文件，复用 menu-sync 的配置）

读取 `.github/skills/sync/env.local.json`：

```json
{
  "gatewayPath": "http://你的网关地址:端口",
  "sysAppNo": "应用编码",
  "token": "Bearer Token（不含 bearer 前缀）"
}
```

**permission-sync 不需要额外字段**——角色和动作的 `parentId` 由 AI 在执行流程中通过查询接口动态获取。

---

## 三种工作模式

| 模式             | 触发关键词                         | 动作                                                                                            |
| ---------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `role-manage`    | 创建角色 / 角色管理 / 列出角色     | 查询/新增角色（按 `code` 去重，幂等）                                                           |
| `role-assign`    | 角色授权 / 给 XX 角色分配菜单      | 查询全量可授权菜单 → 选定 menuIds → 调用 `saveRoleMenus` 批量分配                               |
| `action-attach`  | 挂动作 / 给页面加按钮 / 注册权限码 | 注册 type=A 动作到后端 + 在 `data.ts` 对应按钮的 `ActionButtonDesc` 加 `permission` 字段，形成完整闭环 |

---

## Pre-flight 声明（执行前必须输出）

```
🚀 已触发技能 permission-sync/SKILL.md → 权限同步
✅ 已读取 skills/sync/env.local.json   → 网关地址、token、sysAppNo
✅ 操作模式：{role-manage / role-assign / action-attach}
✅ 目标：{角色名 / roleId / 页面菜单 menuId 与权限码列表}
✅ 安全检查：{生产环境拒绝 / 角色分配二次确认 / 仅新增不删除}
```

---

## ⚠️ 必读公共护栏

本 Skill 遵守 `../_mcp-guardrail.md`（MCP 调用纪律与自愈闭环）。AI 首次执行 sync 类任务时先 `read_file` 加载它。

本 Skill 使用的 MCP 工具：`wls_role_query` / `wls_role_upsert` / `wls_assignable_menus_query` / `wls_role_assign_menus` / `wls_action_query` / `wls_action_upsert`。调用失败时按 guardrail §2 剧本引导用户完善 `env.local.json` 后重试，**不得用 curl/手拼 HTTP 绕开 MCP**。

---

## MCP 工具调用规范

permission-sync 通过 6 个 MCP 工具完成所有操作（无需手动 fetch）：

| 工具                          | 用途                                       |
| ----------------------------- | ------------------------------------------ |
| `wls_role_query`              | 查询角色列表（带分页）                     |
| `wls_role_upsert`             | 批量新增角色（按 code 去重）               |
| `wls_assignable_menus_query`  | 查询全量可授权菜单                         |
| `wls_role_assign_menus`       | 给角色批量分配菜单（**全量覆盖**，注意！） |
| `wls_action_query`            | 查询页面菜单下的动作（type=A）             |
| `wls_action_upsert`           | 批量新增动作（按 permission 去重）         |

> 上表 6 个工具覆盖所有场景，**不得以任何理由跳过**。§6 仅为记录 MCP 内部调用的底层接口，供后端/运维联调参考，AI 禁止据此自行发起 HTTP 调用。

---

## 1. role-manage（角色管理）

### 输入示例

> "创建一个测试角色，code 是 test_qa，描述：QA 测试用"

### 流程

1. AI 调用 `wls_role_query` 检查 `code=test_qa` 是否已存在
2. 若不存在，调用 `wls_role_upsert`：
   ```json
   {
     "items": [
       { "roleName": "测试角色（QA）", "code": "test_qa", "configDesc": "QA 测试用" }
     ]
   }
   ```
3. 输出表格：角色名 / code / 状态（✅ 创建成功 / ⏭ 已存在）

---

## 2. role-assign（角色授权）

### 输入示例

> "给『档案普通人员』角色挂上『客户档案』『客户申请』两个菜单"

### 流程

1. **查询角色 id**：`wls_role_query` → 找到 `roleName="档案普通人员"` 对应的 `id`
2. **查询可授权菜单**：`wls_assignable_menus_query` → 获取全部菜单清单
3. **匹配 menuIds**：在结果中找到「客户档案」「客户申请」对应的 menu id
4. **⚠️ 二次确认**：在 Pre-flight 中列出"将给角色 X 分配菜单 [A, B]"，得到用户 yes 才执行
5. **调用授权**：`wls_role_assign_menus`
   ```json
   {
     "roleId": "VERUFQ77SS0BCCE6GJVU21IFEP1EKFBQ",
     "menuIds": ["2049380552157999105", "2049388746804604929"]
   }
   ```

### ⚠️ 全量覆盖式陷阱

后端 `saveRoleMenus` 是**全量覆盖**：
- 传 `[A, B]` 后，原先 `[A, B, C]` 中的 C 会被移除
- AI 在执行前**必须先告知用户**："此操作会替换该角色全部菜单，原有未列出的将被移除"
- 若用户只是想"追加 C"，AI 应自行合并：取出旧 menuIds + 新增的 → 一起传

---

## 3. action-attach（挂动作 + 加 v-permission）

### 输入示例

> "给『客户档案』页面挂上 新增/编辑/删除/导出 四个动作按钮"

### 流程

#### 3.1 服务端注册动作

1. **查询页面菜单 id**：先用 `wls_menu_query` 或 `wls_assignable_menus_query` 找到「客户档案」页面菜单 id（type=C）
2. **查询已有动作**：`wls_action_query({ menuId: <页面id> })` 看哪些已存在
3. **批量新增**：`wls_action_upsert`
   ```json
   {
     "parentId": "<页面菜单 id>",
     "items": [
       { "menuName": "新增", "permission": "customer_add",    "orderNum": 1 },
       { "menuName": "编辑", "permission": "customer_edit",   "orderNum": 2 },
       { "menuName": "删除", "permission": "customer_remove", "orderNum": 3 },
       { "menuName": "导出", "permission": "customer_export", "orderNum": 4 }
     ]
   }
   ```

#### 3.2 在 `data.ts` 中给对应按钮加 `permission` 字段

本项目使用 `@jhlc/common-core` 的 `ActionButtonDesc` 类型，`BaseToolbar` 内部根据 `permission` 字段做权限拦截——**这是数据驱动方式，无需修改模板，无需 `v-permission` 指令**。

由于 page-codegen 保证 `data.ts` 结构一致，toolbar 按钮配置始终在 `data.ts` 内。注册动作后，AI 找到对应按钮对象，添加 `permission` 数组字段：

```ts
// data.ts — 工具栏按钮配置（ActionButtonDesc[]）
{
  name: 'add',
  label: '新增',
  type: 'primary',
  permission: ['customer_add'],          // ← 新增此字段
  onClick: () => modalRef.value?.open()
},
{
  name: 'edit',
  label: '编辑',
  permission: ['customer_edit'],          // ← 新增此字段
  onClick: (row: any) => modalRef.value?.edit(row.id)
},
{
  name: 'remove',
  label: '删除',
  type: 'danger',
  permission: ['customer_remove'],        // ← 新增此字段
  onClick: (row: any) => handleRemove(row.id)
},
```

`permission` 值与 §3.1 中注册到后端的动作 `permission` 字段**完全一致**，直接复制使用。`BaseToolbar` 内部读取当前用户权限列表（由登录态注入），自动控制按钮显示/隐藏——无需任何额外处理。

---

## 4. 权限码命名规范（项目内统一）

两种风格，优先沿用项目现有风格；无既定风格时用短形式：

| 风格 | 格式 | 示例 |
| --- | --- | --- |
| 短形式（主流）| `{资源}_{动作}` | `customer_add` / `customer_edit` / `customer_remove` |
| 长形式（通用）| `{模块}:{资源}:{动作}` | `mmwr:customer:add` |

常用动作：`add` / `edit` / `remove` / `export` / `import` / `submit` / `approve` / `reject`。自定义动作驼峰命名（如 `customer_convertToFormal`）。

---

## 5. 安全约束（强制）

- ✅ **生产环境拒绝直接 push**：`gatewayPath` 含 `prod` / `.com` 时切换为"导出 SQL/JSON"模式，不直接调接口
- ✅ **角色分配全量覆盖处理**：`role-assign` 模式下，AI 内部自动"查旧 menuIds + 合并新增"再调用，防止漏带原有菜单。平台侧已防重复分配，无需额外备份机制
- ✅ **仅新增不删除**：所有 upsert 工具按唯一键去重跳过；删除走人工 SQL（防误删导致大面积失权）
- ✅ **审计报告**：每次执行后，在 `reports/PERMISSION_SYNC_<YYYYMMDD>.md` 追加日志（角色/动作变更、接口调用、data.ts 修改行位置）

---

## 6. 后端接口参考（MCP 内部实现，AI 不得调用）

> 本节仅供后端联调 / 运维排查 / kit 维护者参考。**AI 不得据此自行发起 HTTP 请求。**

| 操作 | 方法 | 路径 |
| --- | --- | --- |
| 查询角色列表 | GET | `/system/role/list?current=1&size=100` |
| 新增角色 | POST | `/system/role/save` |
| 查询可授权菜单 | GET | `/system/menu/get/subMenu?size=999` |
| 角色分配菜单 | POST | `/system/role/saveRoleMenus`（`menuIds` 逗号字符串）|
| 查询页面下动作 | GET | `/system/menu/children?menuId=X` |
| 新增动作 type=A | POST | `/system/menu/save` |

---

## 7. 与其他 Skill 联动

- **page-codegen**：生成 toolbar 按钮时，若 api.md 中声明了操作集，在 `data.ts` 的 `ActionButtonDesc` 中预留 `permission: []`（空数组占位），等待 permission-sync 后续填入真实权限码
- **menu-sync**：菜单注册成功后，AI 应主动询问"是否给该页面挂动作？" → 触发 action-attach
- **convention-audit**：审计 `data.ts` 工具栏按钮是否都设置了非空的 `permission` 字段（字段缺失或为 `[]` 视为偏差）
- **prototype-scan**：扫描原型时识别按钮操作 → 写入 `reports/SYS_PERMISSION_INFO.md` 基线

---

## 8. 报告输出（reports/PERMISSION_SYNC_<日期>.md）

每次执行在 `.github/reports/PERMISSION_SYNC_YYYYMMDD.md` 追加：模式（role-manage/role-assign/action-attach）、变更摘要（新增/已存在/失败）、data.ts 修改行位置、回滚提示。

---

## 9. MCP 不可用或调用失败时怎么办

见 `../_mcp-guardrail.md` §2 自愈闭环剧本。**原则**：先帮用户完善 `env.local.json` 里的 token / gatewayPath，重试 MCP 工具。**绝不允许** AI 用 curl/PowerShell/fetch 绕开 MCP 手拼 HTTP。

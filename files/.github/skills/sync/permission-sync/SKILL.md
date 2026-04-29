---
name: permission-sync
description: "Use when: managing roles, authorizing menus to roles, attaching action buttons (type=A) to page menus, or wiring v-permission directives in Vue code. Triggers on: 创建角色, 角色管理, 角色授权, 给角色分配菜单, 挂动作, 添加动作按钮, 同步权限, 权限码注册, role assign, permission sync."
---

# Skill: 权限同步（permission-sync）

将系统的**角色 → 菜单授权 → 动作按钮 → 业务代码 v-permission**串成一条链路，覆盖从权限注册到代码落地的全流程。

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

| 模式             | 触发关键词                       | 动作                                                                                |
| ---------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `role-manage`    | 创建角色 / 角色管理 / 列出角色   | 查询/新增角色（按 `code` 去重，幂等）                                               |
| `role-assign`    | 角色授权 / 给 XX 角色分配菜单    | 查询全量可授权菜单 → 选定 menuIds → 调用 `saveRoleMenus` 批量分配                   |
| `action-attach`  | 挂动作 / 给页面加按钮 / 注册权限码 | 在指定页面菜单下批量新增 type=A 动作（按 `permission` 去重）+ 在代码加 v-permission |

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

> 编辑器不支持 MCP 时（如纯命令行使用），可参考 §6 调用接口直连方式手动跑通。

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

#### 3.2 在 Vue 代码中加 v-permission 指令

注册动作后，AI 自动改造对应页面的 toolbar/操作列，加上 `v-permission`：

```vue
<el-button v-permission="'customer_add'" @click="onAdd">新增</el-button>
<el-button v-permission="'customer_edit'" @click="onEdit">编辑</el-button>
<el-button v-permission="'customer_remove'" @click="onRemove">删除</el-button>
<el-button v-permission="'customer_export'" @click="onExport">导出</el-button>
```

> `v-permission` 指令通常由项目基座（如 `@jhlc/common-core` 或登录鉴权模块）注册。若项目未注册，AI 应在 Pre-flight 提示用户"未检测到 v-permission 指令实现，仅完成服务端注册，代码侧指令请由架构组补全"。

---

## 4. 权限码命名规范（项目内统一）

```
{资源camelCase}_{动作}      ← 当前项目主流（短，便于阅读）
{模块}:{资源}:{动作}          ← 通用平台风格（语义完整）
```

| 动作         | 含义     | 示例（短）                  | 示例（长）                       |
| ------------ | -------- | --------------------------- | -------------------------------- |
| `add`        | 新增     | `customer_add`              | `mmwr:customer:add`              |
| `edit`       | 编辑     | `customer_edit`             | `mmwr:customer:edit`             |
| `remove`     | 删除     | `customer_remove`           | `mmwr:customer:remove`           |
| `export`     | 导出     | `customer_export`           | `mmwr:customer:export`           |
| `import`     | 导入     | `customer_import`           | `mmwr:customer:import`           |
| `submit`     | 提交审批 | `customer_submit`           | `mmwr:customer:submit`           |
| `approve`    | 审批通过 | `customer_approve`          | `mmwr:customer:approve`          |
| `reject`     | 审批驳回 | `customer_reject`           | `mmwr:customer:reject`           |
| `{custom}`   | 自定义   | `customer_convertToFormal`  | `mmwr:customer:convertToFormal`  |

> AI 在生成时**先扫描项目内已有 v-permission 用法**，沿用现有风格；项目无既定风格时优先短形式（`xxx_add`），与示例数据保持一致。

---

## 5. 安全约束（强制）

- ✅ **生产环境拒绝直接 push**：`gatewayPath` 含 `prod` / `.com` 时切换为"导出 SQL/JSON"模式，不直接调接口
- ✅ **角色分配二次确认**：`role-assign` 模式下，必须在 Pre-flight 中列出"角色 → 完整菜单清单"得到用户 yes 才执行
- ✅ **仅新增不删除**：所有 upsert 工具按唯一键去重跳过；删除走人工 SQL（防误删导致大面积失权）
- ✅ **审计报告**：每次执行后，在 `reports/PERMISSION_SYNC_<YYYYMMDD>.md` 追加日志（角色/动作变更、调用接口、响应、回滚提示）

---

## 6. 直连接口参考（无 MCP 时的兜底）

所有接口共用 Headers：

```
Content-Type: application/json
Authorization: Bearer <token>
```

| 操作                 | 方法 | 路径                                                | Body                                                          |
| -------------------- | ---- | --------------------------------------------------- | ------------------------------------------------------------- |
| 查询角色列表         | GET  | `/system/role/list?current=1&size=100`              | -                                                             |
| 新增角色             | POST | `/system/role/save`                                 | `{ roleName, code, configDesc }`                              |
| 查询全量可授权菜单   | GET  | `/system/menu/get/subMenu?size=999`                 | -                                                             |
| 角色分配菜单         | POST | `/system/role/saveRoleMenus`                        | `{ roleId, menuIds: "id1,id2" }` （**逗号分隔字符串**）         |
| 查询页面下子菜单/动作 | GET  | `/system/menu/children?current=1&size=10&menuId=X` | -                                                             |
| 新增动作（type=A）   | POST | `/system/menu/save`                                 | `{ parentId, type:"A", menuName, permission, icon, orderNum, sysAppNo, intIsActive:1, useCache:1 }` |

---

## 7. 与其他 Skill 联动

- **page-codegen**：生成 toolbar 时根据 `api.md` 的操作集自动加 `v-permission` 指令（在动作 upsert 完成后）
- **menu-sync**：菜单注册成功后，AI 应主动询问"是否给该页面挂动作？" → 触发 action-attach
- **convention-audit**：审计页面 toolbar 是否所有按钮都有 `v-permission`（缺失视为偏差）
- **prototype-scan**：扫描原型时识别按钮 → 写入 `reports/SYS_PERMISSION_INFO.md` 基线

---

## 8. 报告输出（reports/PERMISSION_SYNC_<日期>.md）

```md
# 权限同步报告 2026-04-29

## role-manage
- ✅ 新增角色：测试角色（QA）/ test_qa

## role-assign
- ✅ 角色 default_role 已分配 5 个菜单：[id1, id2, ...]
- ⚠️ 替换原有 7 个菜单（已确认）

## action-attach
- ✅ customer 页面新增 4 个动作：add/edit/remove/export
- ✅ 代码已加 v-permission（src/views/customer/list/index.vue 第 32-45 行）

## 回滚提示
- 角色分配可通过重新调用 saveRoleMenus 传旧 menuIds 恢复
- 新增的角色/动作建议通过后端管理界面手动删除（防止误删生产数据）
```

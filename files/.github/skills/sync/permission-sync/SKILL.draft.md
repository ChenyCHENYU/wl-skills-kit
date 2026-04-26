---
name: permission-sync
description: "[PLANNED — DRAFT, not yet active] 权限同步 Skill 设计草稿。基于 reports/SYS_PERMISSION_INFO.md 基线，将页面级/按钮级权限码注册到系统权限表，并按角色分配。"
status: planned
---

# Skill: 权限同步（permission-sync）— 草稿

> ⚠️ **本文件为设计草稿（SKILL.draft.md），未启用，不参与 AI 调度。**

---

## 1. 设计目标

新增页面后，除菜单外还需注册：

- **页面访问权限**（`mmwr:customer:list`）
- **按钮级权限**（`mmwr:customer:add` / `:edit` / `:remove` / `:approve` / `:export` ...）
- **数据权限**（可选：客户经理只看自己的客户等）
- **角色绑定**（哪些角色获得这些权限）

---

## 2. 数据流

```
本地基线                                  后端接口                              Skill 触发
────────────────────────────────────────  ──────────────────────────────────  ────────────────
reports/SYS_PERMISSION_INFO.md  ─fetch─→  GET  /sys/permission/listAll
                                ←compare── POST /sys/permission/batchSave
                                ─upload─→ POST /sys/role/assignPermissions  ─→  "同步权限"
```

---

## 3. 权限码命名规范

```
{服务缩写}:{资源camelCase}:{操作}
```

| 操作     | 含义           | 示例                            |
| -------- | -------------- | ------------------------------- |
| list     | 查看列表       | `mmwr:customer:list`            |
| detail   | 查看详情       | `mmwr:customer:detail`          |
| add      | 新增           | `mmwr:customer:add`             |
| edit     | 编辑           | `mmwr:customer:edit`            |
| remove   | 删除           | `mmwr:customer:remove`          |
| export   | 导出           | `mmwr:customer:export`          |
| import   | 导入           | `mmwr:customer:import`          |
| submit   | 提交审批       | `mmwr:customer:submit`          |
| approve  | 审批通过       | `mmwr:customer:approve`         |
| reject   | 审批驳回       | `mmwr:customer:reject`          |
| {custom} | 自定义业务操作 | `mmwr:customer:convertToFormal` |

---

## 4. 三种工作模式

| 模式       | 触发                    | 动作                                                   |
| ---------- | ----------------------- | ------------------------------------------------------ |
| `scan`     | "扫描权限码"            | 从 src/views/ 扫 v-permission / hasPerm 调用，输出清单 |
| `register` | "注册权限码 / 同步权限" | 对比基线 → 创建缺失 + 更新描述                         |
| `assign`   | "给 XX 角色分配权限"    | 选定角色 + 选定权限码 → 调 /sys/role/assignPermissions |

---

## 5. 安全约束

- **生产环境拒绝直接 push**：检测 gatewayPath 含 prod/.com 时强制走"导出 SQL"模式
- **角色分配二次确认**：每次 assign 必须在 Pre-flight 中列出"角色 → 新增/移除的权限"，得到用户 yes 才执行
- **不删除权限**：永远只新增/更新，删除走人工 SQL（防误删导致大面积失权）
- **审计**：每次 register/assign 输出 `reports/PERMISSION_SYNC_<YYYYMMDD>.md`，含完整调用日志和回滚 SQL

---

## 6. 与其他 Skill 联动

- **page-codegen**：生成 toolbar 时根据 api.md 操作集自动加 `v-permission` 指令
- **menu-sync**：菜单注册后提示"是否同步注册访问权限"
- **convention-audit**：审计按钮是否都有 v-permission

---

## 7. 转正前的开发任务

- [ ] 确认后端权限模型（RBAC / ABAC？是否分页面权限和按钮权限？）
- [ ] 数据权限是否纳入本 Skill（建议：暂不，单独 data-permission-sync）
- [ ] 设计 v-permission 指令的项目内实现（如 @jhlc/common-core 提供则复用）
- [ ] 多租户场景下的权限继承策略
- [ ] 与 SSO（嘉为蓝鲸）权限同步策略

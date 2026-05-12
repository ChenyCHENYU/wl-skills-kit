# MCP Tool 风险矩阵

> **版本基线**：wl-skills-kit v2.6.0  
> **定位**：统一说明 17 个 MCP Tool 的风险等级、自动化边界、人工确认点和适用场景，避免 Agent 在企业项目中越权执行有副作用动作。

---

## 1. 分级原则

| 风险级别 | 定义 | 自动化建议 |
|---|---|---|
| R0 只读感知 | 只读取本地文件、Git 信息或后端数据，不产生写入 | 可由 Agent 自动调用 |
| R1 本地检查 | 只做本地扫描和诊断，不修改文件、不调用后端写接口 | 可由 Agent 自动调用，结果需展示 |
| R2 本地产物 | 读取本地报告并生成导出文件或摘要 | 建议先 dry-run 或展示输出路径 |
| R3 后端写入 | 会新增/更新菜单、字典、角色、授权或动作权限 | 必须人工确认，建议先 query/dry-run/报告预览 |
| R4 外部通知 | 会向飞书等外部协作系统推送消息 | 必须人工确认，可配置缺失时静默跳过 |

---

## 2. Tool 风险矩阵

| Tool | 分类 | 风险级别 | 是否依赖 token | 是否可自动调用 | 人工确认要求 |
|---|---|---:|---|---|---|
| `wls_code_scan` | 项目感知 | R0 | 否 | 是 | 无 |
| `wls_route_check` | 项目感知 | R0 | 否 | 是 | 无 |
| `wls_git_log_extract` | 项目感知 | R0 | 否 | 是 | 无 |
| `wls_validate_page` | 本地检查 | R1 | 否 | 是 | 无 |
| `wls_doctor_ui` | 本地检查 | R1 | 否 | 是 | 无 |
| `wls_menu_query` | 菜单查询 | R0 | 是 | 是 | 无 |
| `wls_dict_query` | 字典查询 | R0 | 是 | 是 | 无 |
| `wls_role_query` | 权限查询 | R0 | 是 | 是 | 无 |
| `wls_assignable_menus_query` | 权限查询 | R0 | 是 | 是 | 无 |
| `wls_action_query` | 权限查询 | R0 | 是 | 是 | 无 |
| `wls_menu_sync_from_report` | 菜单同步 | R3 | 是 | 否 | 必须确认报告路径、同步范围和 dry-run 结果 |
| `wls_menu_upsert` | 菜单写入 | R3 | 是 | 否 | 必须确认新增/更新项 |
| `wls_dict_upsert` | 字典写入 | R3 | 是 | 否 | 必须确认模块和字典项 |
| `wls_role_upsert` | 角色写入 | R3 | 是 | 否 | 必须确认角色 code 和名称 |
| `wls_role_assign_menus` | 授权写入 | R3 | 是 | 否 | 必须确认全量 menuIds，避免覆盖已有授权 |
| `wls_action_upsert` | 动作写入 | R3 | 是 | 否 | 必须确认 parentId 和 permission 命名 |
| `wls_audit_report_push` | 外部通知 | R4 | 可选 | 否 | 必须确认推送报告和目标 webhook |

---

## 3. Agent 调用约束

### 3.1 可自动调用

以下 Tool 不产生副作用，可作为 Agent Pipeline 的前置感知或复扫能力：

```text
wls_code_scan
wls_route_check
wls_git_log_extract
wls_validate_page
wls_doctor_ui
wls_menu_query
wls_dict_query
wls_role_query
wls_assignable_menus_query
wls_action_query
```

### 3.2 必须人工确认

以下 Tool 会写后端或推送外部消息，Agent 必须先输出计划并等待用户确认：

```text
wls_menu_sync_from_report
wls_menu_upsert
wls_dict_upsert
wls_role_upsert
wls_role_assign_menus
wls_action_upsert
wls_audit_report_push
```

确认信息至少包含：

- **目标环境**：`gatewayPath` / `sysAppNo` / `domainId`
- **数据来源**：报告路径、用户输入或上一步产物
- **影响范围**：新增、更新、覆盖、推送对象
- **回滚方式**：是否可通过后台手工删除或重新同步恢复

---

## 4. 推荐执行顺序

### 菜单同步

```text
wls_menu_query
→ 读取/生成 SYS_MENU_INFO.md
→ wls_menu_sync_from_report(dryRun: true)
→ 用户确认
→ wls_menu_sync_from_report(dryRun: false)
→ wls_route_check
```

### 字典同步

```text
wls_dict_query
→ 读取/生成 SYS_DICT_INFO.md
→ 展示将新增/跳过项
→ 用户确认
→ wls_dict_upsert
→ convention-audit 或页面复扫
```

### 权限同步

```text
wls_role_query
→ wls_assignable_menus_query
→ wls_action_query
→ 生成 SYS_PERMISSION_INFO.md
→ 用户确认
→ wls_role_upsert / wls_action_upsert / wls_role_assign_menus
→ 权限码使用复扫
```

---

## 5. 安全边界

- `env.local.json` 只放本地环境配置，不应提交真实 token。
- R3/R4 Tool 不允许在用户无明确确认时自动执行。
- 角色授权是全量覆盖式操作，必须展示最终 `menuIds` 集合。
- 飞书 webhook 缺失时应跳过，不阻断主流程。
- CI 中默认只运行 R0/R1 能力；如需 R3/R4，必须使用受控环境变量和审批流程。

# MCP Tool 风险矩阵

> **版本基线**：wl-skills-kit v2.13.8
> **数据源**：`mcp/registry.js`（v2.7.0+ 引入 auto-discovery，新增 Tool 仅改 registry）  
> **定位**：统一说明 23 个 MCP Tool 的风险等级、自动化边界、人工确认点和适用场景，避免 Agent 在企业项目中越权执行有副作用动作。

---

## 1. 分级原则

| 风险级别 | 定义 | 自动化建议 |
|---|---|---|
| R0 只读感知 | 只读取本地文件、Git 信息或后端数据，不产生写入 | 可由 Agent 自动调用 |
| R1 本地检查 | 只做本地扫描和诊断，不修改文件、不调用后端写接口 | 可由 Agent 自动调用，结果需展示 |
| R2 本地产物 | 读取本地报告并生成导出文件、摘要或本地配置文件 | 建议先 dry-run 或展示输出路径；写配置文件必须人工确认 |
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
| `wls_standard_env_scan` | 环境扫描 | R1 | 否 | 是 | 无，只读识别项目形态和历史配置 |
| `wls_standard_env_apply` | 环境迁移 | R2 | 否 | 否 | 默认只生成计划；正式写入必须确认 Profile、模块名、文件计划并传 `confirmApply: true` |
| `wls_standard_env_verify` | 环境验证 | R1 | 否 | 是 | 静态验证可自动调用；五环境构建仅在依赖已安装时启用 |
| `wls_domain_query` | 应用域查询 | R0 | 是 | 是 | 无 |
| `wls_menu_query` | 菜单查询 | R0 | 是 | 是 | 无 |
| `wls_dict_query` | 字典查询 | R0 | 是 | 是 | 无 |
| `wls_dict_bootstrap` | 本地字典契约 | R2 | 否 | 否 | 默认只预览；创建本地 `dicts.ts` 必须携带预览 `planHash` 并传 `confirmWrite:true`，绝不覆盖已有文件 |
| `wls_role_query` | 权限查询 | R0 | 是 | 是 | 无 |
| `wls_assignable_menus_query` | 权限查询 | R0 | 是 | 是 | 无 |
| `wls_action_query` | 权限查询 | R0 | 是 | 是 | 无 |
| `wls_menu_sync_from_report` | 菜单同步 | R3 | 是 | 否 | 默认预览；正式执行必须同时传 `confirmApply:true` 和预览 `planHash` |
| `wls_menu_upsert` | 菜单写入 | R3 | 是 | 否 | 默认预览；正式执行必须同时传 `confirmApply:true` 和预览 `planHash` |
| `wls_menu_delete` | 菜单删除 | R3 | 是 | 否 | 默认预览；必须展示递归影响范围，正式删除需 `confirmApply:true` 和预览 `planHash` |
| `wls_dict_upsert` | 字典协调 | R3 | 是 | 否 | 默认只预览；确认项目级 safe-additive 计划后必须同时传 `confirmApply:true` 和有效 `planHash` |
| `wls_role_upsert` | 角色写入 | R3 | 是 | 否 | 默认预览；正式执行必须同时传 `confirmApply:true` 和预览 `planHash` |
| `wls_role_assign_menus` | 授权写入 | R3 | 是 | 否 | 必须确认全量 menuIds，并同时传 `confirmFullReplace:true` 和预览 `planHash` |
| `wls_action_upsert` | 动作写入 | R3 | 是 | 否 | 默认预览；正式执行必须同时传 `confirmApply:true` 和预览 `planHash` |
| `wls_audit_report_push` | 外部通知 | R4 | 可选 | 否 | 默认预览；确认推送报告和目标 webhook 后传 `confirmPush:true` |

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
wls_standard_env_scan
wls_standard_env_verify
wls_domain_query
wls_menu_query
wls_dict_query
wls_role_query
wls_assignable_menus_query
wls_action_query
```

### 3.2 必须人工确认

以下 Tool 会写后端、写本地配置文件或推送外部消息，Agent 必须先输出计划并等待用户确认：

```text
wls_menu_sync_from_report
wls_menu_upsert
wls_menu_delete
wls_dict_upsert
wls_dict_bootstrap
wls_role_upsert
wls_role_assign_menus
wls_action_upsert
wls_audit_report_push
wls_standard_env_apply
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
wls_domain_query
→ wls_menu_query
→ 读取/生成 SYS_MENU_INFO.md
→ wls_menu_sync_from_report（默认预览）
→ 用户确认
→ wls_menu_sync_from_report(confirmApply: true, planHash)
→ wls_route_check
```

### 字典同步

```text
wls_dict_bootstrap（仅无 dicts.ts 的旧项目）
→ 校验页面 api.md dict-contract 与模块 dicts.ts（D1）
→ wls_dict_upsert({scope:"project"}) 自动发现并预览 safe-additive 计划
→ 用户确认
→ wls_dict_upsert({scope:"project", confirmApply:true, planHash})
→ 自动完成项目级回查
→ convention-audit 或页面复扫
```

### 权限同步

```text
wls_role_query
→ wls_assignable_menus_query
→ wls_action_query
→ 生成 SYS_PERMISSION_INFO.md
→ 各写工具先预览并记录各自 planHash
→ 用户确认
→ wls_role_upsert(confirmApply: true, planHash) / wls_action_upsert(confirmApply: true, planHash) / wls_role_assign_menus(confirmFullReplace: true, planHash)
→ 权限码使用复扫
```

### 标准环境配置

```text
wls_standard_env_scan
→ 展示项目形态、模块名证据和旧地址
→ 显式选择华新或完整自定义五环境 Profile
→ wls_standard_env_apply（不传 confirmApply，仅生成计划）
→ 用户确认模块名、目标地址、本地联调参数和文件计划
→ wls_standard_env_apply(confirmApply: true)
→ wls_standard_env_verify(runBuild: true)
→ 二次计划必须无文件变更
```

---

## 5. 安全边界

- `env.local.json` 只放本地环境配置，不应提交真实 token。
- R3/R4 Tool 不允许在用户无明确确认时自动执行。
- `wls_standard_env_apply` 不调用后端，但会事务式更新本地前端环境与 Vite 配置；未确认时不得传 `confirmApply: true`。
- 华新 Profile 不得静默套用；非华新项目必须提供完整五环境 Profile，避免客户地址混用。
- 菜单、角色、动作和角色授权执行前都会重读线上；必须携带最近一次预览 `planHash`，漂移后旧计划自动失效。
- 菜单删除必须展示全部递归子节点，自底向上执行；不得仅凭菜单名称直接删除。
- 角色授权是全量覆盖式操作，必须展示最终 `menuIds` 集合，并显式传 `confirmFullReplace: true` 与预览 `planHash`。
- 飞书 webhook 缺失时应跳过，不阻断主流程。
- CI 中默认只运行 R0/R1 能力；如需 R3/R4，必须使用受控环境变量和审批流程。

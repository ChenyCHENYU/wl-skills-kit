---
name: menu-sync
description: "为页面查询、单个创建、批量注册或同步系统菜单及导航节点，支持 pages.ts 菜单清单对齐。写入先查询、预览差异和 planHash，再按明确确认执行；不把菜单页面的样式修改当成后端菜单写入。"
---

# 菜单同步（menu-sync）

适用于在已接入 Kit 的 PC 项目查询或维护后端菜单。以当前项目的菜单报告、页面注册和真实菜单查询为准。只调整菜单页面样式时用相应的前端技能。访问业务菜单前读 [同步护栏](../_mcp-guardrail.md)，严禁使用 curl、自拼 HTTP 或项目脚本绕开原 MCP 工具。

## 判断要走哪条链路

| 任务 | 实际工具和前置条件 |
| --- | --- |
| 查询菜单、定位父目录或排查菜单不可见 | 用 `wls_menu_query` 取得当前应用域菜单树，应用域不明确时先用 `wls_domain_query`。域树存在与目标角色能看见是两项事实。 |
| 按报告批量创建或同步 | 读取目标项目的 `.wl-skills/reports/SYS_MENU_INFO*.md`，核对范围后用 `wls_menu_sync_from_report`。有多个候选报告时明确传 `reportPath`。 |
| 创建或修改指定菜单项 | 用 `wls_menu_query` 获取父级 ID、现有菜单及排序，再用 `wls_menu_upsert`。需要新建父目录时先确认并创建目录，取得真实 ID 后再预览子项。 |
| 只调整顺序 | 先读 [变更范围与验收](../../../guides/change-scope.md)，用 `wls_menu_upsert` 传 `orderOnly: true`，每项只传已有 `id` 与 `orderNum`。保持页面目录、页面注册分组、组件路径、路由和权限。 |

终端可用时可用 Kit CLI 建立任务和回查状态。实际线上查询、预览及写入需要当前宿主已连接本项目的 Kit MCP 并列出对应工具。用户按 [MCP 接入指南](../../../guides/mcp-setup.md) 在本机配置，运行时从 `.wl-skills/config/kit-sync.local.json`（旧项目可兼容 `.wl-skills/skills/sync/env.local.json`）或 `WL_SKILLS_TOKEN` 取得凭据。模型无需读取、传递或展示凭据。入口不可用时报告尚未执行和下一步。

## 从预览到验收

1. 沿用任务 `runId`。只查询时止于查询。需要修改时先核对目标环境、应用域、父级和用户指定范围。
2. 调用实际写工具的预览。不传 `confirmApply`，报告新增、更新、跳过和冲突，并说明尚未写入。显示原工具返回的 `planHash`。
3. 用户明确确认该计划后，再向同一工具提交原输入、`confirmApply: true`、同一 `planHash` 和 `runId`。结果提示计划过期时重新查询、预览和确认。连接中断或写入结果不明时，先只读回查再判断是否需要新的计划。
4. 从实际结果说明已保存、已验证可见、未验证或失败。菜单结构看完整域树，当前用户可见性看权限树。出现 `MENU_NOT_VISIBLE` 时说明保存和可见性的差别，按实际授权另行处理权限。用同一 `runId` 查看 `status` 或 `wls_status`。

## 字段与父子关系

- `M` 是目录，`C` 是页面菜单，`A` 是动作按钮，由 [权限同步](../permission-sync/SKILL.md) 管理。二级菜单使用真实父目录 ID，不能把所有子项挂到项目根。
- `menuName` 和 `component` 以页面注册或报告为准。核对 `path`、隐藏状态、图标和排序与目标应用一致。独立表单、详情和历史页通常隐藏，以实际路由设计为准。
- 默认不生成 `permission`。需要角色可见性控制时使用已确认的权限码，并检查目标角色的可见性。服务端可能补默认值，最终以回查结果为准。

# 同步配置字段

统一安装、配置位置和凭据操作见 [MCP 接入指南](../../../../guides/mcp-setup.md)。新版使用 `.wl-skills/config/kit-sync.local.json`，运行时兼容旧项目的 `.wl-skills/skills/sync/env.local.json`。凭据仅供 MCP 运行时读取。

- `gatewayPath` 保留协议、域名、显式端口和当前环境前缀。不要把具体菜单接口拼到基地址上。
- `sysAppNo` 使用目标环境的真实应用编码。`menu.domainId` 通过 `wls_domain_query` 查询，父菜单 ID 从 `wls_menu_query` 的完整域树取得。权限树用于检查可见性。
- `token` 是纯 token，不含 `Bearer ` 前缀。临时凭据可以在 MCP 环境注入 `WL_SKILLS_TOKEN`，其优先级高于文件字段。不要把凭据放进对话、项目报告或提交。
- `environment` 与真实目标环境一致。`allowProductionWrites` 默认关闭。生产写入需要用户走实际发布审批。
- `dict.headers` 只在后端需要业务字典页面上下文时按项目要求配置非敏感字段。字典模块归属从项目 `dicts.ts` 获取。

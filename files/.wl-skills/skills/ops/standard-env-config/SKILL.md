---
name: standard-env-config
description: "Use when standardizing or migrating frontend Vite subapp environments. Triggers on: 标准环境配置, 前端环境标准化, 五套环境, 本地联调, public 联调, 172/9000 迁移, sit-api, uat-api, pre-api, prod-api, environment profile."
---

# Skill: 标准环境配置

将存量 Vue/Vite 子应用迁移为与当前模板一致的环境结构：单一公共 `.env`、`dev/sit/uat/pre/prd` 五套目标环境、远程开发/本地后端/public 本地联调三种开发方式，以及职责清晰的模块化 Vite 配置。

本 Skill 与页面生成、菜单、字典、权限和业务代码完全隔离。它只处理前端工程配置，不修改后端、网关、Nginx、Docker、Java、SQL 或配置中心。

## 强制安全规则

1. 始终先调用 `wls_standard_env_scan`，禁止从项目名猜配置后直接写入。
2. 华新项目必须由用户明确选择 `profile: "walsin"`；其他项目必须提供完整的五环境 Profile。不得静默套用华新地址。
3. 模块名存在多个候选值时必须让用户确认 `moduleName`，不得自动选择历史脚本值。
4. 首次调用 `wls_standard_env_apply` 不传 `confirmApply`，只展示计划。
5. 计划中的目标地址、模块名、本地地址、更新和删除文件均确认后，才能传 `confirmApply: true`。
6. 正式迁移后必须调用 `wls_standard_env_verify`；依赖已安装时执行 `runBuild: true` 完成五环境临时构建。
7. 最后再次生成迁移计划，结果必须是 `standard` 且无文件变更。
8. 不清理项目原有 `dist`，不覆盖无法识别的业务插件，不打印 `.env` secret 值。

## 标准流程

```text
wls_standard_env_scan
  -> 判断 standard / legacy-direct / legacy-gateway / custom / unsupported
  -> 确认目标 Profile、moduleName、本地联调地址和代理范围
  -> wls_standard_env_apply（默认仅计划）
  -> 用户确认计划
  -> wls_standard_env_apply(confirmApply: true)
  -> wls_standard_env_verify
  -> wls_standard_env_verify(runBuild: true)
  -> 再次 plan，确认 no-op
```

## Pre-flight 声明

正式写入前必须向用户展示：识别到的项目形态、模块名全部证据、目标 Profile 的五套地址、本地后端与 public 地址、代理范围、文件新增/更新/删除清单和备份策略。用户未明确确认时只允许停留在计划阶段。

## Profile 选择

- 华新项目：显式传 `profile: "walsin"`。
- 其他客户或内网 IP 项目：传 `profileFile` 或 `profileData`，必须完整包含 `dev/sit/uat/pre/prd`。
- `webUrl` 同时支持 HTTP/HTTPS、域名、IPv4/IPv6 和端口；`apiPrefix` 不带首尾斜杠。
- Profile 只描述环境端点，不改变标准目录和开发模式。

## 三种开发方式

| 命令 | API | public/远程资源 | 用途 |
| --- | --- | --- | --- |
| `pnpm dev` | 目标 Profile | 目标 Profile | 本地前端连接远程环境 |
| `pnpm dev:local` | 本地后端，默认 `http://localhost:10010` | 目标 Profile | 本地前后端联调 |
| `pnpm dev:public` | 目标 Profile | 本地 public，默认 `http://localhost:8002` | 子应用与本地基座联调 |

`dev:local` 与 `dev:public` 互斥，构建命令禁止使用本地来源。本地后端代理会移除 `Authorization`，避免把远程 token 传给本地服务。

## 完成输出

```markdown
## 标准环境配置结果
- 项目形态：standard / legacy-direct / legacy-gateway
- Profile：walsin / 自定义名称
- 模块名：{moduleName}
- 文件计划：新增 N / 更新 N / 删除 N
- 静态验证：通过 / 未通过
- 五环境构建：dev/sit/uat/pre/prd 通过 / 未执行及原因
- 二次计划：无变更 / 仍有差异
- 备份位置：{path}
```

完整命令、Profile 示例和验收项见同目录 [USAGE.md](./USAGE.md)。

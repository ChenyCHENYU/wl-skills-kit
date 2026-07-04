---
name: env-config
description: "Standardize and migrate frontend environment configuration for Vue/Vite/uni-app projects. Use when users mention 环境配置、切环境、baseURL、/api、sit-api、uat-api、prod-api、prd-api、172 迁移、客户迁移、华新环境、五套环境、四套环境、前端环境标准化, or ask to scan/apply frontend env files."
---

# Skill: 前端环境配置标准化（env-config）

本 Skill 只处理前端项目环境配置：`.env.*`、`env/.env.*`、Vite/uni-app baseURL 与 API 前缀线索。后端、网关、Nginx、Docker、Java、SQL、配置中心不在本 Skill 范围内。

## 必读与工具

触发后必须先读：

1. `.wl-skills/standards/07-config.md`
2. `.wl-skills/skills/_registry.md` 中本 Skill 的工具依赖说明

优先使用 MCP：

- `wls_env_scan`：只读扫描，识别项目形态、现有 env 文件和硬编码端点。
- `wls_env_apply`：默认 dry-run；只有传 `confirmApply: true` 才允许写入前端 env 文件。

MCP 不可用时使用 CLI：

```bash
wl-skills env scan
wl-skills env apply
wl-skills env apply --apply
```

## 执行流程

Pre-flight 必须先声明：已读 `standards/07-config.md`、已运行只读扫描、当前是否只是 dry-run、是否需要用户确认写入。

1. 先运行 `wls_env_scan`，不要直接写文件。
2. 判断项目形态：
   - `root-env`：根目录 `.env`、`.env.dev`、`.env.sit`、`.env.uat`、`.env.pre`、`.env.prod`、`.env.prd`，常见变量为 `ENV_WEB_API`、`ENV_WEB_URL`、`ENV_API_PREFIX`。
   - `env-dir`：`env/.env.*`，常见变量为 `VITE_API_BASE_URL`、`VITE_DOMAIN`、`VITE_ENV`。
3. 输出计划，明确哪些文件会创建/更新、哪些字段由工具管理、哪些硬编码 URL/API 前缀需要人工确认。
4. 如用户要求写入，先调用 `wls_env_apply` 但不传 `confirmApply`，得到 dry-run 报告。
5. 用户明确确认后，才调用 `wls_env_apply({ confirmApply: true })` 或 CLI `env apply --apply`。
6. 写入后建议运行项目原有校验命令，例如 `pnpm lint`、`pnpm build` 或当前项目约定的启动检查。

## Profile 规则

默认 Profile 为 `walsin`，适合华新前端五套环境。需要其他客户或 4 套环境时，传 `profileData` 或 `profileFile`：

```json
{
  "name": "customer-a",
  "title": "客户A标准环境",
  "envs": {
    "dev": { "env": "dev", "host": "https://example-sit.company.com", "apiPrefix": "sit-api" },
    "sit": { "env": "sit", "host": "https://example-sit.company.com", "apiPrefix": "sit-api" },
    "uat": { "env": "uat", "host": "https://example-uat.company.com", "apiPrefix": "uat-api" },
    "pre": { "env": "pre", "host": "https://example-pre.company.com", "apiPrefix": "pre-api" },
    "prod": { "env": "prod", "host": "https://example-prd.company.com", "apiPrefix": "prod-api" }
  }
}
```

如生产环境使用 `prd-api` 而不是 `prod-api`，优先传 `prodPrefix: "prd-api"`，不要手改多个文件。

## 护栏

- 不写真实 token、secret、cookie、账号密码。
- 不删除业务自定义 env 变量；只更新工具识别的标准字段。
- 不改后端配置；发现后端环境诉求时说明应放到 bd 能力处理。
- 不自动替换业务代码里的硬编码 URL；扫描报告只列出线索，由用户确认后再按代码任务处理。
- 不在用户未确认时传 `confirmApply: true`。

## 输出格式

完成后输出：

```markdown
## 环境配置结果
- 项目形态：root-env / env-dir
- Profile：walsin / custom
- 模式：dry-run / apply
- 变更文件：...
- 备份目录：...
- 硬编码线索：...
- 验证：已运行 / 未运行及原因
```

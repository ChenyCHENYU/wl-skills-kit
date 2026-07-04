# 使用指南：env-config（前端环境配置标准化）

本能力用于把企业前端项目的环境配置标准化，覆盖新项目初始化、老项目迁移、客户环境切换、172 地址替换、baseURL 与 API 前缀统一。它只处理前端工程，不处理后端、网关、Nginx、Docker、Java、SQL 或配置中心。

## 什么时候用

- 新项目需要一次性生成 4/5 套前端环境。
- 老项目从 172、旧客户、旧域名迁移到当前客户环境。
- 接手存量项目时，需要先摸清 `.env.*`、`env/.env.*`、硬编码 URL 和 API 前缀。
- 想把 `/api`、`dev-api`、`sit-api`、`uat-api`、`pre-api`、`prod-api` / `prd-api` 的规则前置统一。
- AI 生成页面、接口契约或 mock 前，需要先确认项目运行环境和接口代理前缀。

## 推荐工作流

```bash
# 1. 只读扫描，不写任何文件
wl-skills env scan

# 2. 预览将要生成或更新的前端 env 文件
wl-skills env apply

# 3. 人工确认报告后正式写入
wl-skills env apply --apply
```

写入后建议执行项目自己的启动或构建命令，例如：

```bash
pnpm dev
pnpm build
```

如果只是让 AI 帮忙处理，优先走 MCP：

```text
wls_env_scan()
wls_env_apply()                         # 默认 dry-run
wls_env_apply({ confirmApply: true })   # 用户确认后才写文件
```

## 日常场景

### 接手项目先扫描

```bash
wl-skills env scan
```

重点看报告里的三类信息：

- 当前项目使用 `root-env` 还是 `env-dir`。
- 已存在的 `.env.*` / `env/.env.*` 是否完整。
- 代码里是否存在硬编码域名、IP、`172.*` 地址或历史 API 前缀。

### 华新标准环境写入

默认内置华新前端环境规则，先 dry-run：

```bash
wl-skills env apply
```

确认报告无误后再写入：

```bash
wl-skills env apply --apply
```

### 172 或旧客户环境迁移

先扫描找出旧地址线索：

```bash
wl-skills env scan
```

再用当前客户 profile 预览写入计划：

```bash
wl-skills env apply --profile-file ./env-profile.customer.json
```

确认后写入：

```bash
wl-skills env apply --profile-file ./env-profile.customer.json --apply
```

扫描报告会提示代码里的硬编码 URL，但不会自动改业务代码。硬编码需要结合业务含义单独确认后再改，避免误替换。

### 生产前缀使用 prd-api

有些项目线上使用 `prd-api` 而不是 `prod-api`：

```bash
wl-skills env apply --prod-prefix prd-api
wl-skills env apply --prod-prefix prd-api --apply
```

## 自定义客户 Profile

可以通过 CLI `--profile-file` 或 MCP `profileData` 传入客户环境。示例：

```json
{
  "appName": "customer-demo",
  "proxyPrefixes": {
    "dev": "api",
    "sit": "sit-api",
    "uat": "uat-api",
    "pre": "pre-api",
    "prod": "prod-api"
  },
  "baseUrls": {
    "dev": "https://dev.example.com",
    "sit": "https://sit.example.com",
    "uat": "https://uat.example.com",
    "pre": "https://pre.example.com",
    "prod": "https://www.example.com"
  }
}
```

命令：

```bash
wl-skills env scan --profile-file ./env-profile.customer.json
wl-skills env apply --profile-file ./env-profile.customer.json
wl-skills env apply --profile-file ./env-profile.customer.json --apply
```

## 默认覆盖范围

`root-env` 项目：

- `.env`
- `.env.dev`
- `.env.sit`
- `.env.uat`
- `.env.pre`
- `.env.prod`
- `.env.prd`

`env-dir` 项目：

- `env/.env`
- `env/.env.development`
- `env/.env.sit`
- `env/.env.uat`
- `env/.env.pre`
- `env/.env.production`

工具只维护标准环境字段，会尽量保留项目自定义变量。正式写入前会生成备份：

```text
.wl-skills/reports/env-backups/
```

每次扫描或写入还会生成报告：

```text
.wl-skills/reports/ENV_CONFIG_*.md
```

## 安全边界

- `env scan` 永远只读。
- `env apply` 默认 dry-run，不写文件。
- CLI 只有加 `--apply` 才正式写入。
- MCP 只有传 `confirmApply: true` 才正式写入。
- 正式写入前会自动备份原 env 文件。
- 后端环境配置以后放到 bd 能力处理，本能力不跨边界修改。

## 团队约定

- 新项目先跑 `wl-skills env apply` dry-run，把报告纳入评审。
- 老项目迁移先跑 `wl-skills env scan`，把硬编码 URL 单独列出来处理。
- 客户环境差异沉淀成 `env-profile.<customer>.json`，不要散落在口头说明里。
- AI 修改环境前必须先给出 dry-run 报告，人工确认后才能写入。

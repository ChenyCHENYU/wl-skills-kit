# 使用指南：env-config（前端环境配置标准化）

本能力用于把企业前端项目的环境配置标准化，覆盖新项目初始化、老项目迁移、客户环境切换、172 地址替换、baseURL 与 API 前缀统一。它只处理前端工程里的 `.env.*` / `env/.env.*`、`vite.config.*`、`public/env-dev.json` 等前端配置，不处理后端、网关、Nginx、Docker、Java、SQL 或配置中心。

## 什么时候用

- 新项目需要一次性生成 4/5 套前端环境。
- 老项目从 172、旧客户、旧域名迁移到当前客户环境，或从华新环境切回 172/其他客户环境。
- 接手存量项目时，需要先摸清 `.env.*`、`env/.env.*`、硬编码 URL 和 API 前缀。
- 想把 `/api`、`dev-api`、`sit-api`、`uat-api`、`pre-api`、`prod-api` / `prd-api` 的规则前置统一。
- AI 生成页面、接口契约或 mock 前，需要先确认项目运行环境和接口代理前缀。

## 推荐工作流

```bash
# 1. 只读扫描，不写任何文件
wl-skills env scan

# 2. 预览将要生成或更新的前端 env / Vite 配置
wl-skills env apply

# 3. 人工确认报告后正式写入
wl-skills env apply --apply

# 特殊项目仅处理 env 文件，不迁移 vite.config / public/env-dev.json
wl-skills env apply --no-migrate-vite
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
wls_env_apply({ migrateViteConfig: false }) # 只处理 env 文件
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

### 172、华新、客户环境互切

`172.*` 通常代表内网、旧客户或联调地址；华新域名和其他客户域名只是不同环境地址来源。标准化时不要把某个地址写死到代码里，而是沉淀到 profile：

- `baseUrls`：每套环境的网关或前端域名，例如 SIT/UAT/PRE/PRD。
- `proxyPrefixes`：服务前缀，按 `sit-api`、`uat-api`、`pre-api`、`prod-api` / `prd-api` 维护。

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

扫描报告会提示代码里的硬编码 URL。工具会自动迁移可识别的前端配置硬编码，例如 `vite.config.*` 中的 `webMap`、`webApiMap`、`[baseApi]` 代理 target，以及 `public/env-dev.json`；业务源码里的 URL 仍需要结合业务含义单独确认后再改，避免误替换。

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
    "dev": "sit-api",
    "sit": "sit-api",
    "uat": "uat-api",
    "pre": "pre-api",
    "prod": "prod-api",
    "prd": "prod-api"
  },
  "baseUrls": {
    "dev": "https://sit.example.com",
    "sit": "https://sit.example.com",
    "uat": "https://uat.example.com",
    "pre": "https://pre.example.com",
    "prod": "https://www.example.com",
    "prd": "https://www.example.com"
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

工具只维护标准环境字段和可识别的前端环境配置，会尽量保留项目自定义变量。正式写入前会生成备份：

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
- 默认会迁移明确识别的 `vite.config.*` / `public/env-dev.json` 前端硬编码环境配置；传 `--no-migrate-vite` 或 `migrateViteConfig: false` 可关闭。
- 业务源码里的硬编码 URL 只报告，不自动替换。
- 正式写入前会自动备份原 env / Vite 配置文件。
- 后端环境配置以后放到 bd 能力处理，本能力不跨边界修改。

## 团队约定

- 新项目先跑 `wl-skills env apply` dry-run，把报告纳入评审。
- 老项目迁移先跑 `wl-skills env scan`，把硬编码 URL 单独列出来处理。
- 客户环境差异沉淀成 `env-profile.<customer>.json`，不要散落在口头说明里。
- AI 修改环境前必须先给出 dry-run 报告，人工确认后才能写入。

# 使用指南：env-config（前端环境配置标准化）

## 适用场景

- 新项目初始化 4/5 套前端环境。
- 老项目从旧客户、旧 172 地址迁移到当前客户环境。
- 统一 `baseURL`、`/api`、`sit-api`、`uat-api`、`prod-api` / `prd-api`。
- 接手项目时快速识别环境文件和硬编码 URL。

## 标准流程

```bash
# 只读扫描
wl-skills env scan

# 预览将要写入哪些前端 env 文件
wl-skills env apply

# 人工确认后正式写入
wl-skills env apply --apply
```

AI 侧优先调用：

- `wls_env_scan`
- `wls_env_apply`

`wls_env_apply` 默认仍是 dry-run，必须传 `confirmApply: true` 才会写文件。

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

工具只改标准字段，保留业务自定义变量。

## 自定义客户环境

可通过 MCP `profileData` 或 CLI `--profile-file` 传入客户环境：

```bash
wl-skills env scan --profile-file ./env-profile.customer.json
wl-skills env apply --profile-file ./env-profile.customer.json
wl-skills env apply --profile-file ./env-profile.customer.json --apply
```

如果生产接口前缀是 `prd-api`：

```bash
wl-skills env apply --prod-prefix prd-api --apply
```

## 注意事项

- 后端环境配置不在本能力范围内，后续放到 bd 能力处理。
- 扫描到代码里的硬编码 URL 后，先确认业务含义，再单独修改代码。
- 正式写入会自动备份到 `.wl-skills/reports/env-backups/`。

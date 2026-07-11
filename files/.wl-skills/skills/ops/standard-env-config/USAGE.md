# 使用指南：标准环境配置

这项能力用于把存量 Vue/Vite 子应用收敛到统一、可验证的环境结构。新项目继续从最新模板创建；存量项目通过本能力完成扫描、计划、备份、迁移、验证和幂等检查。

## 能力边界

会处理：

- 根目录 `.env` 和旧 `.env.dev/.env.uat/.env.prod` 等环境文件
- `vite.config.ts` 及可识别的 Vite 环境映射、代理和联邦配置
- `public/env-dev.json` 等静态运行时配置
- `package.json` 中的开发和五环境构建脚本
- 标准 `vite/config/*.ts` 模块

不会处理：

- 业务页面、接口实现和后端服务配置
- Nginx、Docker、Java、SQL、配置中心
- 无法确定语义的自定义插件代码
- 依赖安装、锁文件升级和原有 `dist` 清理

## CLI 快速流程

存量项目先更新 Skill。升级时会自动清理已退役的 `skills/ops/env-config/`：

```bash
pnpm dlx @agile-team/wl-skills-kit@latest update
```

AI 对话最短提示词：

```text
用标准环境配置能力检查并迁移当前项目，目标使用华新环境，先只生成计划，我确认后再修改并完整验证。
```

只有模块名冲突或目标不是华新时，才需要补充 `moduleName` 或自定义 Profile 文件路径。

```bash
# 1. 只读扫描
pnpm dlx @agile-team/wl-skills-kit standard-env scan

# 2. 华新项目生成迁移计划，不写文件
pnpm dlx @agile-team/wl-skills-kit standard-env plan --profile walsin --module-name safe

# 3. 确认地址和文件计划后正式迁移
pnpm dlx @agile-team/wl-skills-kit standard-env apply --profile walsin --module-name safe --confirm

# 4. 静态验证
pnpm dlx @agile-team/wl-skills-kit standard-env verify --profile walsin

# 5. 依赖已安装时，在临时副本中构建五套环境
pnpm dlx @agile-team/wl-skills-kit standard-env verify --profile walsin --build
```

旧的 `wl-skills env` 已停止写入，只用于提示迁移到 `standard-env`，避免旧规则继续污染项目。

## MCP 快速流程

```text
wls_standard_env_scan()
wls_standard_env_apply({ profile: "walsin", moduleName: "safe" })
wls_standard_env_apply({
  profile: "walsin",
  moduleName: "safe",
  confirmApply: true
})
wls_standard_env_verify({ profile: "walsin", runBuild: true })
```

`apply` 默认只返回计划。只有 `confirmApply: true` 才会写文件。

## 标准结果

迁移后的环境职责如下：

```text
.env                         公共且不随环境重复的变量
vite.config.ts               极简入口
vite/config/app.ts           模块名、端口、本地联调和保留代理
vite/config/environments.ts  dev/sit/uat/pre/prd 端点表
vite/config/context.ts       环境与开发模式解析
vite/config/server.ts        API、资源和联调代理
vite/config/plugins.ts       动态 env-dev.json 与入口中间件
vite/config/base.ts          alias / define / css / resolve
vite/config/build.ts         构建配置
```

旧 `.env.*`、`vite/environment.ts` 和静态 `public/env-dev.json` 会在计划中明确列为删除项。开发态 `/env-dev.json` 由 Vite 中间件按当前模式动态返回，避免静态文件混入其他环境。

## 五套环境 Profile

华新项目显式使用内置 Profile：

```bash
--profile walsin
```

其他项目使用完整 JSON，不会继承华新地址：

```json
{
  "name": "customer-a",
  "title": "客户 A 环境",
  "environments": {
    "dev": { "webUrl": "http://10.10.1.11:8080", "apiPrefix": "dev-api" },
    "sit": { "webUrl": "http://10.10.1.12:8080", "apiPrefix": "sit-api" },
    "uat": { "webUrl": "https://uat.example.com", "apiPrefix": "uat-api" },
    "pre": { "webUrl": "https://pre.example.com", "apiPrefix": "pre-api" },
    "prd": { "webUrl": "https://example.com", "apiPrefix": "prod-api" }
  }
}
```

```bash
pnpm dlx @agile-team/wl-skills-kit standard-env plan --profile-file ./env-profile.json --module-name sale
pnpm dlx @agile-team/wl-skills-kit standard-env apply --profile-file ./env-profile.json --module-name sale --confirm
pnpm dlx @agile-team/wl-skills-kit standard-env verify --profile-file ./env-profile.json --build
```

完整五环境是硬约束。缺少任一环境、URL 协议无效、URL 含账号/密码/查询参数，或 `apiPrefix` 非法时都会阻断。

## 本地联调配置

标准开发服务器端口为 `8001`，本地 public 默认端口为 `8002`：

```bash
pnpm dev         # 子应用连接远程目标环境
pnpm dev:local   # API 切到 http://localhost:10010
pnpm dev:public  # 资源和 /sub/public 切到 http://localhost:8002，API 保持远程
```

迁移时可定制：

```bash
--local-api http://10.0.0.20:9000
--local-public http://localhost:8002
--local-mode all
```

本地后端代理范围支持：

- `all`：整个当前 API 前缀转到本地，适合旧 9000 直连项目。
- `module`：仅当前模块路径转本地，其余 API 保持远程。
- `routes`：按 `--local-routes match=rewrite,...` 精确转发。

本地后端与本地 public 不能同时启用，任何构建都不能使用本地来源。

## 模块名冲突

扫描会综合项目目录、package scripts、运行时 JSON 和 views 根目录识别模块名。出现多个不同值时只报告证据并阻断计划，例如：

```text
project-folder: safe
package-scripts: ehs
runtime-json: safe
views-root: safe
```

确认后显式传 `--module-name safe`。能力不会因为历史脚本先出现就自动采用 `ehs`。

## 备份与回滚

- Git 项目：备份到 `.git/wl-skills/standard-env/<timestamp>/`，不会进入提交。
- 非 Git 项目：备份到系统临时目录 `wl-skills-standard-env/<project>-<timestamp>/`。
- 写入和删除采用事务式执行；静态验证失败会自动恢复原文件。
- 输出只展示变量名和文件计划，不打印 secret 值。

## 验收清单

- 扫描结果为 `standard`
- 二次 `plan` 显示无文件变更
- `.env` 只保留公共变量，旧 `.env.*` 已移除
- 五套地址和 API 前缀与目标 Profile 完全一致
- `pnpm dev`、`pnpm dev:local`、`pnpm dev:public` 三种模式职责正确
- `dev/sit/uat/pre/prd` 五环境临时构建全部通过
- 真实项目根目录未新增 `verify-output`
- 原业务插件、alias、依赖版本和锁文件未被无关改动

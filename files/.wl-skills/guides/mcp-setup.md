# MCP 接入与验收

技能发现和 MCP 是两件事。先安装项目本地 Kit 执行器，再按实际使用的宿主选择项目入口；`init` 默认不配置 MCP，只有明确传 `--mcp` 才生成选中宿主的原生配置和本地凭据模板。

```sh
pnpm exec wl-skills init --hosts codex,claude,zcode --mcp --dry-run
# 核对计划后，在已授权的项目内去掉 --dry-run 执行。
pnpm exec wl-skills doctor-host --host codex --json
pnpm exec wl-skills check
```

宿主路径、配置格式和现有文件复用由当前包的 host profiles / MCP 安装器决定，不在多份指南维护另一套路径表。原生项目配置契约未核实的宿主会返回手动接入诊断；按诊断提供的官方入口配置，不向猜测的 settings.json/global 路径写入。旧宿主名称和已登记文件可能保留为升级兼容，这不代表仍默认生成旧入口。

## 本地连接信息

当前默认配置在 `.wl-skills/config/kit-sync.local.json`；旧项目 `.wl-skills/skills/sync/env.local.json` 仍可兼容读取。两者同时存在时使用 compact 路径，不复制第二份凭据。模板会说明需要填写的字段：

```json
{
  "gatewayPath": "https://项目实际网关/api",
  "sysAppNo": "实际应用编码",
  "token": "实际登录凭据，纯Token而非Bearer前缀",
  "environment": "test",
  "menu": {"domainId": "从同环境真实查询取得的应用域ID"},
  "dict": {}
}
```

密钥只在本地文件或 `WL_SKILLS_TOKEN` 环境变量中注入，不写进聊天、受管规则、报告或 Git。沿用模板中的请求头和网络选项；不猜 parentMenuId、应用编码或跨环境复用上下文。`update/clean` 不覆盖、删除本地凭据。

## 从可发现到真实执行

1. 在当前宿主中确认本项目服务已启用；首次批准、重新加载等步骤遵循宿主返回的实际状态。
2. 真实列出工具，并执行一次已授权的只读查询，确认网关、应用、权限及返回语义。配置文件存在和连接指示灯不能证明业务可用。
3. 需要写入时，先查询、预览具体 planHash，确认后由原工具写前重查并写后回查；显示失败、未验证或缺配置就停止相应写入，不从工具名称猜“已成功”。
4. 在同 runId 的 `status` 查看工具执行、后验检查、缺失项和证据新鲜度。菜单排序、批量范围另见 [范围验收](change-scope.md)。

本包不会因安装完成就保证所有宿主、模型或 VS Code 插件隐式触发。只读查询、计划、真正写入、业务效果必须分别验证。

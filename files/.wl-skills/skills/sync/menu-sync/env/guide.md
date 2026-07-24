# env.local.json 配置说明

> 每位成员在本地维护自己的副本，已加入 `.gitignore`，**不会提交到远端仓库**。

---

## 配置文件位置

**唯一运行路径**：`.wl-skills/skills/sync/env.local.json`
**模板路径**：`.wl-skills/skills/sync/env.example.json`

旧版分散配置不再作为运行时回退来源；首次升级时人工合并一次即可。

---

## 配置格式（菜单/字典/权限三合一）

```json
{
  "gatewayPath": "https://gateway.example:8443/sit-api",
  "sysAppNo": "QjQuXy1kbKxZyjhS5N2",
  "token": "eyJhbGci...",
  "environment": "uat",
  "allowProductionWrites": false,

  "menu": {
    "parentMenuId": "1803456789012345678"
  },

  "dict": {
    "sysOnlyCurrentApp": true,
    "headers": {}
  }
}
```

---

## 字段说明

| 字段 | 说明 | 示例 |
|---|---|---|
| `gatewayPath` | 后端网关完整基地址，必须与浏览器成功请求保持同一协议、域名、**端口和环境前缀**，末尾不加斜杠 | `https://gateway.example:8443/sit-api` |
| `sysAppNo` | 应用编码（非明文，从已有菜单接口响应中获取） | `QjQuXy1kbKxZyjhS5N2` |
| `token` | 当前登录用户的登录凭据，**只填纯 token/JWT，不含 `bearer ` 前缀** | `eyJhbGci...` |
| `environment` | 环境标识；生产填写 `production`，用于启用写保护 | `uat` |
| `allowProductionWrites` | 生产写入审批后的本地显式开关，默认必须为 `false` | `false` |
| `menu.parentMenuId` | 目标父级目录的菜单数据库 ID（每套环境不同） | `1803456789012345678` |
| `dict.sysOnlyCurrentApp` | 字典查询/写入是否只看当前 `sysAppNo` 应用，建议保持 `true` | `true` |
| `dict.headers` | 可选。仅后端依赖业务字典页面上下文时填写，从同环境成功请求复制 `menupath/menupermission` 等非敏感头 | `{ "menupath": "dataDic", "menupermission": "sys_businessDict" }` |

> 字典业务模块不写死在 env 中。`wls_dict_upsert` 从当前项目各模块 `dicts.ts` 读取稳定的 `module.code/name`，并由 `sysAppNo` 限定目标应用；项目级预检会阻断跨模块重复和线上归属冲突。

---

## 如何获取各字段

### gatewayPath

询问后端同事，或查看浏览器 Network 面板中任意**成功接口**的 Request URL。应保留协议、域名/IP、显式端口以及 `/sit-api`、`/uat-api` 等环境前缀，只去掉具体业务接口路径。

例如成功请求为：

```text
https://gateway.example:8443/sit-api/system/dictModule/business/list
```

则配置为：

```json
{ "gatewayPath": "https://gateway.example:8443/sit-api" }
```

不要省略非默认端口，也不要因为域名相同就假定 443 与 8443 是同一套数据。

### menu.parentMenuId / domainId

**方法 A（推荐，MCP 自动查询）**：对 AI 说「查一下所有应用域」，AI 会调用 `wls_domain_query`（`GET /system/sysDomain/list`），返回全部应用域及其 `id`（= domainId）。

**方法 B**：系统管理后台 → 菜单管理 → 找到目标父级目录 → 点编辑/查看 → 复制菜单 ID

**方法 C（API 查询）**：

```
GET {gatewayPath}/system/sysDomain/list?current=1&size=99
```

返回所有系统内置域（生产/质量/销售/...），含 `id`/`code`/`name`。取目标域的 `id` 作为 domainId。

> ⚠️ **不要用 `getPermissionMenuTree` 查 domainId**——该接口只返回有菜单权限的域。
> 生产域（production）等可能存在但当前账号无权限时查不到。
> 必须用 `sysDomain/list`（不依赖菜单权限）。

### sysAppNo

系统用编码后的字符串标识应用（如 `QjQuXy1kbKxZyjhS5N2`），而非明文 `produce` / `sale`。

**获取方式**：浏览器 F12 → Network → 找任意菜单相关接口的响应体 → 查看已有菜单条目的 `sysAppNo` 字段值，复制即可。

> ℹ️ 同一领域下所有菜单的 `sysAppNo` 相同，复制任意一个即可。

### token

1. 在浏览器中登录系统
2. 按 F12 打开 DevTools → Network 面板
3. 随便点一个接口请求
4. 查看 Request Headers → `authorization` 字段
5. 去掉 `bearer ` 前缀，复制剩余字符串粘贴到 `token` 字段

> Token 有有效期，若创建菜单时提示鉴权失败，重新登录后刷新 token 即可。

CI、Codex 或其他自动化环境建议通过环境变量临时注入，不把 token 写回文件：

```powershell
$env:WL_SKILLS_TOKEN="<临时 token>"
```

```bash
export WL_SKILLS_TOKEN="<临时 token>"
```

运行时 `WL_SKILLS_TOKEN` 优先于 `env.local.json#token`，日志和查询结果不会回显 token。

### dict.headers（少数后端需要）

默认保持 `{}`。如果浏览器能创建业务字典模块，而 MCP 使用相同网关、token、`sysAppNo` 仍返回不符合现状的模块类型/权限错误，可对照成功请求补充：

```json
{
  "dict": {
    "sysOnlyCurrentApp": true,
    "headers": {
      "menupath": "dataDic",
      "menupermission": "sys_businessDict"
    }
  }
}
```

- `menuname` 可直接写中文，MCP 会自动进行 HTTP 头编码。
- `Authorization`、`Content-Type`、`sysAppNo` 和请求追踪 ID 始终由 MCP 管理，配置值不能覆盖。
- `menuid` 往往随环境变化；除非后端明确要求，否则不要复制到其他环境。

---

## 使用方式

配置完成后，直接对 AI 说：

> 「帮我创建菜单」/ 「同步菜单」/ 「补菜单」

AI 会自动执行：
1. 读取 `SYS_MENU_INFO.md`（菜单定义）
2. 读取 `env.local.json`（环境配置）
3. 调 `/system/menu/children` 查询父级已有子节点（去重）
4. 逐条调 `/system/menu/save` 创建缺失菜单
5. 输出 `created / skipped` 结果表

**全程无需手动执行任何命令。**

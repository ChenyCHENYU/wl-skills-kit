# env.local.json 配置说明

> 每位成员在本地维护自己的副本，已加入 `.gitignore`，**不会提交到远端仓库**。

---

## 配置文件位置（优先使用新统一路径）

**新路径（v2.1.5+ 推荐）**：`.github/skills/sync/env.local.json`  
**兼容路径（老版）**：`.github/skills/sync/menu-sync/env/env.local.json`

AI 优先读新路径，如不存在自动回落到兼容路径。

---

## 配置格式（菜单/字典/权限三合一）

```json
{
  "gatewayPath": "http://192.168.10.50:9000",
  "sysAppNo": "QjQuXy1kbKxZyjhS5N2",
  "token": "eyJhbGci...",

  "menu": {
    "parentMenuId": "1803456789012345678"
  },

  "dict": {
    "moduleId": "7C909G0U2F8HI7E305LV0135LSJ3UBIO"
  }
}
```

---

## 字段说明

| 字段 | 说明 | 示例 |
|---|---|---|
| `gatewayPath` | 后端网关地址，含协议和端口，**末尾不加斜杠** | `http://192.168.10.50:9000` |
| `sysAppNo` | 应用编码（非明文，从已有菜单接口响应中获取） | `QjQuXy1kbKxZyjhS5N2` |
| `token` | 当前登录用户的 Bearer Token，**不含 `bearer ` 前缀** | `eyJhbGci...` |
| `menu.parentMenuId` | 目标父级目录的菜单数据库 ID（每套环境不同） | `1803456789012345678` |
| `dict.moduleId` | 字典所属模块 ID（字典管理后台获取） | `7C909G0U2F8HI7E305LV0135LSJ3UBIO` |

---

## 如何获取各字段

### gatewayPath

询问后端同事，或查看浏览器 Network 面板中任意接口请求的 URL，取协议 + 域名/IP + 端口部分。

### menu.parentMenuId

**方法 A（推荐）**：系统管理后台 → 菜单管理 → 找到目标父级目录 → 点编辑/查看 → 复制菜单 ID

**方法 B（API 查询）**：

```
GET {gatewayPath}/system/menu/children?menuId=0
```

从顶级节点向下逐层查找，直到找到目标父级目录。也可以告诉 AI「帮我查一下父级菜单 ID」，AI 会自动调接口查询。

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

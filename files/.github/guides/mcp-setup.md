# MCP Server 配置指南

`wl-skills init` 已自动为以下编辑器生成项目级 MCP 配置：

| 编辑器 | 自动生成的配置文件 |
| ---- | --------------- |
| Cursor | `.cursor/mcp.json` |
| Claude Code | `.mcp.json` |
| VS Code / GitHub Copilot | `.vscode/mcp.json` |
| Kiro | `.kiro/settings/mcp.json` |

以下编辑器仅支持全局配置，需手动添加一次（添加后对所有项目生效，无需重复操作）：

---

## Windsurf

编辑全局文件 `~/.codeium/windsurf/mcp_config.json`，在 `mcpServers` 中追加：

```json
{
  "mcpServers": {
    "wl-skills": {
      "command": "node",
      "args": ["/你的项目绝对路径/node_modules/@agile-team/wl-skills-kit/mcp/server.js"]
    }
  }
}
```

> 提示：Windsurf 不支持 `${workspaceFolder}` 变量，需填写绝对路径；或使用相对路径 `node_modules/...`（Windsurf 会从工作区根目录解析）。

---

## Cline（VS Code 插件）

打开 VS Code 设置（`Ctrl+,`），搜索 `cline mcpServers`，或直接编辑 `settings.json` 追加：

```json
{
  "cline.mcpServers": {
    "wl-skills": {
      "command": "node",
      "args": ["${workspaceFolder}/node_modules/@agile-team/wl-skills-kit/mcp/server.js"]
    }
  }
}
```

也可通过 Cline 侧边栏 → **MCP Servers** → **Edit Config** 进行图形化配置。

---

## Trae IDE

1. 打开 **Trae 设置**（`Ctrl+Shift+,`）→ **MCP**
2. 点击 **+** 新增服务器
3. 在弹出的 JSON 中填入：

```json
{
  "mcpServers": {
    "wl-skills": {
      "command": "node",
      "args": ["node_modules/@agile-team/wl-skills-kit/mcp/server.js"]
    }
  }
}
```

4. 保存后重启 Trae，MCP 工具即可使用。

---

## Qoder IDE

1. 打开 **Qoder 设置**（`Ctrl+Shift+,`）→ **MCP**
2. 切换到 **我的服务器** 标签 → 点击右上角 **+** 新增
3. 在弹出的 JSON 中填入：

```json
{
  "mcpServers": {
    "wl-skills": {
      "command": "node",
      "args": ["node_modules/@agile-team/wl-skills-kit/mcp/server.js"]
    }
  }
}
```

4. 关闭并保存，链接图标变绿表示连接成功。

---

## 配置完成后

确保已在 `.github/skills/sync/env.local.json` 中填写：

```json
{
  "gatewayPath": "https://你的网关域名/api",
  "token": "Bearer 你的Token",
  "menu": { "domainId": 1 },
  "dict": {}
}
```

配置完成后重启编辑器，对 AI 说「扩展菜单」或「加字典」，AI 会自动调用 MCP 工具完成同步。

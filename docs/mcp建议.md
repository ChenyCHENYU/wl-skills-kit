# wl-skills-kit MCP 集成建议

> 本文记录将 MCP（Model Context Protocol）引入 wl-skills-kit 的架构设计讨论与落地路径。
> 目标：**减少 AI 在 prompt 中猜测接口格式的消耗，让每次 sync 操作精准、可预期、省 token**。

---

## 一、当前架构的瓶颈

### 问题本质

现在 menu-sync / dict-sync 的执行路径：

```
用户说「同步菜单」
  → AI 读 SKILL.md（~1000 token）理解接口格式
  → AI 在 prompt 里"推断"组装 HTTP 请求体
  → AI 描述请求 → 用户粘贴到 curl/工具执行
  → 用户把响应粘回给 AI
  → AI 解析非结构化文本 → 决策下一步
  → 循环…
```

**每条菜单 = 至少 2 轮对话 + ~800 token**。10 条菜单 = ~8000 token + 用户手动操作 10 次。

### 根因

AI 没有"直接调接口"的能力，只能靠 prompt 描述接口 → 用户中转执行 → 粘贴结果。

---

## 二、MCP 能解决什么

MCP 让 AI 把工具函数当作原生能力调用，不经过 prompt 中转：

```
用户说「同步菜单」
  → AI call menu_query({ parentMenuId })   ← MCP tool，AI 直接调用
  → MCP server 执行 HTTP，返回 JSON
  → AI 看结构化结果，直接决策哪些需要创建
  → AI call menu_create({ menuName, path, ... })  × N 条
  → 输出结果表
```

**10 条菜单 = 1 轮对话 + ~800 token（同等规模少 90%）**，且无需用户手动中转。

### 额外收益

| 维度 | 当前 | MCP 后 |
|---|---|---|
| 接口格式说明 | 每次 ~500 token | 零（tool signature 已包含） |
| 用户手动中转 | 每条菜单 1 次 | 零 |
| 响应解析错误 | AI 偶尔误读文本 | 零（结构化 JSON） |
| 可重试性 | 手动重试 | tool 自动重试 |
| 多人去重 | AI 推断 | tool 每次实时查询 |

---

## 三、是否开独立包？

**建议：内置在 wl-skills-kit 本包，不拆包**。

理由：
- MCP server 的配置复用 `skills/sync/env.local.json`（gatewayPath/token/sysAppNo），不需要单独维护配置
- `wl-skills init` 可以同时写入 MCP server 路径到 `.cursor/mcp.json` / `.claude/settings.json`，用户零感知
- 包拆得越多，业务项目的维护成本越高（两个包的版本要对齐）
- 当 MCP tools 超过 15 个 or 出现跨团队复用需求时，再拆 `@agile-team/wl-skills-mcp` 独立包

---

## 四、架构设计

### 目录结构（内置在本包）

```
wl-skills-kit/
├── mcp/                          ← 新增目录
│   ├── server.ts                 MCP server 入口（stdio 协议）
│   ├── tools/
│   │   ├── menu/
│   │   │   ├── menuQuery.ts      tool: wls_menu_query(parentMenuId)
│   │   │   └── menuCreate.ts     tool: wls_menu_create(menuData[])
│   │   ├── dict/
│   │   │   ├── dictQuery.ts      tool: wls_dict_query(moduleId)
│   │   │   ├── dictCreate.ts     tool: wls_dict_create(dictData)
│   │   │   └── dictItemCreate.ts tool: wls_dict_item_create(items[])
│   │   └── permission/
│   │       └── ...               (等 API 接入后补充)
│   ├── config.ts                 读取 env.local.json，注入到所有 tool
│   └── README.md                 使用说明
├── files/                        ← 现有
└── ...
```

### Tool 命名约定

所有 tool 以 `wls_` 前缀，避免与其他 MCP server 冲突：

| Tool | 参数 | 返回 |
|---|---|---|
| `wls_menu_query` | `parentMenuId: string` | `{ menus: [{id, menuName, path, ...}] }` |
| `wls_menu_create` | `items: MenuData[]` | `{ created: string[], skipped: string[], failed: string[] }` |
| `wls_dict_query` | `moduleId: string` | `{ dicts: [{id, strSn, strName, items: [...]}] }` |
| `wls_dict_create` | `dict: DictData` | `{ id: string, strSn: string }` |
| `wls_dict_item_create` | `dictId: string, items: DictItem[]` | `{ created: number, skipped: number }` |

### 配置注入方式

```typescript
// mcp/config.ts
import { readFileSync } from 'fs'
import { resolve } from 'path'

export function loadConfig(projectRoot: string) {
  const configPath = resolve(projectRoot, '.github/skills/sync/env.local.json')
  return JSON.parse(readFileSync(configPath, 'utf8'))
  // { gatewayPath, sysAppNo, token, menu: { parentMenuId }, dict: { moduleId } }
}
```

**复用现有 `env.local.json`，无需重复填写任何配置。**

---

## 五、落地路径（三阶段）

### 阶段 1 — 低成本验证（menu-sync MCP 化）

**目标**：验证 MCP 在实际项目中是否生效，量化节省效果。

```
实现内容：
  wls_menu_query + wls_menu_create 两个 tool（~100 行 TypeScript）
  wl-skills init 自动写入 .cursor/mcp.json

验证指标：
  - 对比同规模（10 条菜单）: MCP vs prompt，记录对话轮数和 token
  - 是否出现接口调用错误（格式错误/鉴权失败）
```

**需要你提供**（只需一次）：
1. `env.local.json` 里已有的字段（gatewayPath / token / sysAppNo）— 这些不用重填，MCP 直接读
2. 确认菜单接口响应的字段名（已知：`menuName`, `path`, `parentMenuId`）—— 用于 tool 的类型定义
3. 接口鉴权方式是否就是 `Authorization: Bearer {token}`？（当前 SKILL.md 显示是，需确认）

### 阶段 2 — dict-sync + permission-sync MCP 化

**目标**：三个 sync 共用同一个 MCP server，统一配置。

```
新增 tool：wls_dict_query / wls_dict_create / wls_dict_item_create
等 permission API 接入后：wls_permission_query / wls_permission_create

共用 config.ts，只需一份 env.local.json
```

### 阶段 3 — convention-audit 工具化

**目标**：`audit_file` 直接返回结构化偏差清单，code-fix 拿 JSON 直接修复。

```typescript
// tool: wls_audit_file
input:  { filePath: string, standards?: number[] }
output: {
  issues: [
    { id: 'issue#1', severity: '🔴', rule: 12, line: 42, desc: 'cid 缺失' },
    ...
  ],
  stats: { red: 2, yellow: 3, green: 1 }
}
```

这一步价值最大：**audit → fix 整个链路无需人工中转**，AI 拿到 JSON 后可以直接 code-fix。

---

## 六、各编辑器配置方式

`wl-skills init` 自动写入对应配置（与现有 .gitignore 自动写入机制相同）：

### Cursor

```json
// .cursor/mcp.json（自动写入）
{
  "mcpServers": {
    "wl-skills": {
      "command": "node",
      "args": ["node_modules/@agile-team/wl-skills-kit/mcp/server.js"],
      "env": { "WL_PROJECT_ROOT": "." }
    }
  }
}
```

### Claude Code

```json
// .claude/settings.json（自动写入）
{
  "mcpServers": {
    "wl-skills": {
      "command": "node",
      "args": ["node_modules/@agile-team/wl-skills-kit/mcp/server.js"],
      "env": { "WL_PROJECT_ROOT": "." }
    }
  }
}
```

### Windsurf / Cline / Kiro

均支持 `mcp.json` 或等效配置，`wl-skills init` 按编辑器类型写入对应路径。

---

## 七、为让 AI 更精准，你需要提供什么？

> 以下是 AI（我）在执行 sync 操作时的"猜测盲区"，一旦你提供一次，就固化到 SKILL.md + MCP tool 的类型定义中，后续无需重复。

| 信息 | 现在是否已知 | 需要你提供 |
|---|---|---|
| 菜单接口响应的完整字段结构 | ⚠️ 只知道部分 | 贴一条真实的 `/system/menu/children` 响应 JSON |
| 字典接口创建后的响应结构（含返回的 id 字段名）| ⚠️ 推断 | 贴一条成功创建的响应 |
| 鉴权方式（Bearer / 其他？）| ✅ 已知 Bearer | 无需 |
| permission 接口路径 | ❌ 未知 | 等实现时再提供 |
| 字典 moduleId 的获取位置 | ✅ 已在 SKILL.md 中描述 | 无需 |

**最小代价验证**：只需提供前两条（真实响应 JSON），就能实现阶段 1 + 阶段 2 的精准无猜。

---

## 八、与现有 SKILL.md 的协作关系

MCP 引入后，SKILL.md 不会消失，而是**职责分工**：

| 内容 | 谁负责 |
|---|---|
| 触发词、前置检查、Pre-flight 声明 | SKILL.md（prompt 层） |
| 工作流决策（哪些跳过、哪些创建）| SKILL.md（prompt 层） |
| 实际 HTTP 调用 | MCP tool（执行层） |
| 返回结构化结果 | MCP tool（执行层） |
| 输出给用户的结果表 | SKILL.md 指导 AI 格式化 |

两层配合，各司其职。SKILL.md 变薄（不再需要描述接口格式），MCP tool 变厚（类型安全、可复用）。

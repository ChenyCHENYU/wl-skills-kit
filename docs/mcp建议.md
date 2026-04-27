# wl-skills-kit MCP 集成建议（基于官方文档 + 真实场景分析）

> **修订版**。核心原则：精度优先，不折腾，每一步都有验证指标。
>
> 参考来源：MCP 官方文档 modelcontextprotocol.io（2025-06-18 规范）、官方参考实现（filesystem / GitHub / Sentry server）。
> 原始目标：**减少 AI 在 prompt 中猜测接口格式的消耗，让每次 sync 操作精准、可预期、省 token**。

---

## 一、MCP 三个原语——先对齐官方概念

MCP 官方定义了三种原语，很多文章只讲 Tools，漏掉了另外两个。这个区分对架构决策至关重要：

| 原语 | 谁控制调用 | 用途 | 我们的场景 |
|---|---|---|---|
| **Tools** | AI 模型主动调用 | 执行动作（写入/调接口/触发副作用） | menu-sync、dict-sync |
| **Resources** | 应用层驱动（非 AI） | 读取只读数据，为 AI 提供上下文 | 文档缓存、接口 Schema |
| **Prompts** | 用户显式触发 | 可复用工作流模板（类似 slash command） | 现有 SKILL.md 的替代形态 |

---

## 二、docs-sync/query 方案重新评估

### 原方案

```
wls_docs_sync  ← 定期拉取文档，存入本地 docs-cache/
wls_docs_query ← AI 查询时从本地缓存读，毫秒级响应
```

### 问题

这个方案本质上是**用 Tools 做了 Resources 原语已经原生支持的事**，额外引入了维护成本：
- `wls_docs_sync` 谁触发？cron？手动？多开发者怎么同步？
- `docs-cache/` 需要 gitignore 还是 commit？
- AI 查询时，文档内容本身很长，直接消耗大量 context token

### 三种方案真实对比

| 方案 | 精度 | Token | 复杂度 | 离线 | 适用条件 |
|---|---|---|---|---|---|
| **A. 静态捆绑 JSON**（推荐） | ✅ 最高 | ✅ 零开销 | ✅ 最低 | ✅ | 文档变化慢（Element Plus / AGGrid） |
| **B. MCP Resources 原语** | ✅ 高 | ⚠️ 按需加载 | ⚠️ 中 | ❌ | 动态文档（内部 Swagger、实时规则） |
| **C. wls_docs_sync/query**（原方案） | ⚠️ 中 | ⚠️ 中 | ❌ 最高 | ❌ | 不推荐，过度设计 |

**推荐方案 A**：Element Plus / AGGrid 文档几个月才更新一次，静态 JSON 随包发布，零网络、零 cron、零 token 开销：

```
files/docs-cache/
├── element-plus.json     组件 props API 表格
├── ag-grid-coldefs.json  ColDef 字段说明
└── README.md             说明文档版本、更新日期
```

AI 通过 SKILL.md 引用文件路径即可，不需要任何 MCP tool。包升级时顺带更新 JSON。

**何时才需要方案 B**：文档是动态生成的（如内部 Swagger），用 Resources 原语暴露，客户端通过 `resources/subscribe` 订阅变更，缓存由 MCP 协议层托管，不需要手写 sync/query 逻辑。

---

## 三、当前瓶颈的真实量化

### menu-sync 场景（10 条菜单）

```
当前路径（prompt-based）：
  第 1 轮：AI 读 SKILL.md → 理解接口格式（~800 token）
  第 2 轮：AI 组装请求体 → 用户执行 → 粘贴响应（每条 ~300 token）
  第 3~N 轮：逐条确认创建（共 10 轮）
  合计：~4000 input token + 10 次手动操作 + 约 20 分钟

MCP 路径：
  第 1 轮：AI call wls_menu_query → 取得现有菜单结构（~200 token）
  第 2 轮：AI 批量 call wls_menu_create（1 次）→ 返回结果表
  合计：~500 input token + 0 次手动操作 + 约 1 分钟
```

**token 节省约 87%，手动操作从 10 次到 0 次**。

### 什么场景 MCP 反而不如 prompt？

| 场景 | MCP 效果 | 原因 |
|---|---|---|
| convention-audit 规则判断 | ⚠️ 精度可能下降 | 规则判断依赖 AI 理解代码上下文，结构化 JSON 会丢失语义 |
| page-codegen 代码生成 | ❌ 不适合 | 创意性任务，AI 需要完整上下文，不是执行确定动作 |
| 首次学习项目规范 | ❌ 不适合 | AI 需要读完整 SKILL.md，MCP 无法压缩"理解"过程 |
| 同步菜单/字典 | ✅ 大幅提升 | 确定性操作，接口格式固定，AI 只做决策不做猜测 |
| 触发构建/测试/版本发布 | ✅ 适合 | 确定性动作，MCP tool = 命令执行器 |

**核心判断标准**：需要 AI "理解语义" → 留在 SKILL.md；AI 只需"执行确定动作" → 适合 MCP。

---

## 四、Core / CLI / MCP 三层架构——严丝合缝的分工

### 为什么要分三层

不分层的后果：MCP tool 里堆满了 HTTP 调用 + 业务判断 + 格式转换，最终无法维护。CLI 想复用只能复制粘贴。

分三层的本质：**每层只做一件事，每层可以独立测试、独立替换、独立扩展**。

### 精确的职责边界

```
╔══════════════════════════════════════════════════════════════╗
║  SKILL.md（prompt 层）                                       ║
║  · 触发词识别、Pre-flight 检查                               ║
║  · AI 的"大脑"：理解意图、决定调哪些 tool、输出结果表       ║
║  · 不执行任何 IO，只做决策和格式化                           ║
╚══════════════════════════╤═══════════════════════════════════╝
                           │ AI 发起 tool call
              ┌────────────┴────────────┐
              │                         │
    ╔═════════▼══════════╗   ╔══════════▼═════════╗
    ║  MCP Tools 层       ║   ║  CLI 层             ║
    ║  mcp/tools/         ║   ║  bin/wl-skills.js   ║
    ║  · JSON-RPC 2.0     ║   ║  · 命令行参数解析   ║
    ║  · Tool schema 描述 ║   ║  · 彩色进度输出     ║
    ║  · AI 可见的说明    ║   ║  · --dry-run 支持   ║
    ║  · 零业务逻辑       ║   ║  · 零业务逻辑       ║
    ╚═════════╤══════════╝   ╚══════════╤═════════╝
              │                         │
              └────────────┬────────────┘
                           │ 共同调用
    ╔══════════════════════▼═══════════════════════════════════╗
    ║  API Client 层（现阶段的"共享层"）                        ║
    ║  mcp/api/                                                ║
    ║  · 真实 HTTP 调用（fetch + Bearer 鉴权 + 重试）          ║
    ║  · 基于真实 JSON 生成的 TypeScript interface             ║
    ║  · 统一错误格式：{ ok, data, error, code }               ║
    ║  · 与 MCP / CLI 完全解耦，直接 import 使用               ║
    ╚══════════════════════╤═══════════════════════════════════╝
                           │
    ╔══════════════════════▼═══════════════════════════════════╗
    ║  业务后端 API                                             ║
    ║  {gatewayPath}/system/menu/...                           ║
    ║  {gatewayPath}/system/dict/...                           ║
    ╚══════════════════════════════════════════════════════════╝
```

### 为什么现在不做 core/ 而是 api/ 层

| 层 | 共用条件 | 现在满足？ |
|---|---|---|
| `api/`（HTTP 调用） | MCP 和 CLI 需要调同一接口 | ✅ 立即满足，现在就分离 |
| `core/`（业务判断） | MCP 和 CLI 需要共用"哪些新增 vs 更新"的判断逻辑 | ❌ 目前 AI 做判断，代码层不需要 |

**`api/` 现在分离出来，以后 CLI 加命令直接 import，不需要任何重构**。这是"打扎实基础"的具体体现。

### 三层进化路径

```
现阶段：
  SKILL.md → AI call MCP tools → mcp/tools/ → mcp/api/ → HTTP

加 CLI（满足触发条件后）：
  SKILL.md → AI call MCP tools ─┐
  用户命令 → CLI 命令 ────────── ┤→ mcp/api/（直接复用）→ HTTP

加 core/（有复杂判断逻辑时）：
  → 从 api/ 中分离出纯函数的业务判断层
  → MCP/CLI 都变成"薄 wrapper + core 调用"
```

### core/ 的触发条件（缺一不动）

1. CLI 需要在**无 AI 介入**的情况下独立完成整个 sync 流程
2. 某段业务判断逻辑出现在 MCP 和 CLI 两个地方
3. 有 vitest 测试需求（core/ 纯函数是最容易测试的）

---

## 五、是否开独立包？

**结论：内置在 wl-skills-kit 本包，不拆包**。

理由：
- MCP server 复用 `skills/sync/env.local.json`（gatewayPath/token/sysAppNo），零新增配置
- `wl-skills init` 同时写入 MCP 配置到 `.cursor/mcp.json` 等，用户零感知
- 两个包的版本对齐是长期负担
- 当 tools 超过 15 个，或出现跨团队复用需求时，再拆 `@agile-team/wl-skills-mcp` 独立包

---

## 六、基于真实接口的 TypeScript 类型定义（已确认，零猜测）

> 以下全部基于你提供的真实请求/响应 JSON，不再有任何推断字段。

### 关键发现（影响工具设计）

| 接口 | 端点 | 创建响应 | 影响 |
|---|---|---|---|
| 菜单目录/菜单（type=M/C） | `POST /system/menu/save` | ✅ `data` 返回完整对象含 `id` | 可链式操作（先建目录拿ID，再建子菜单） |
| 字典模块 | `POST /system/dictModule/save` | ⚠️ `data: null` | 创建后**必须再查一次**才能拿到 `id` |
| 字典值（词典项） | `POST /system/business/dict/save` | ✅ `data: null`（不需要 ID） | 只需确认成功 |

这是最关键的架构约束：**字典模块创建后 data 为 null**，`wls_dict_upsert` 内部需要自动 create → re-query → create items。

---

### 菜单接口类型

```typescript
// mcp/api/types/menu.ts

/** 菜单类型：M=目录  C=菜单页面  F=按钮权限 */
export type MenuType = 'M' | 'C' | 'F'

/**
 * 新增/更新菜单的请求体（目录 type=M 和菜单 type=C 共用同一端点）
 * POST /system/menu/save
 * 有 id → 更新；无 id → 新增
 */
export interface MenuSaveBody {
  id?: string            // 更新时必传，新增时不传（服务端生成）
  sysAppNo: string       // 应用标识，如 "gFEuK5B7qNVnl7eA2aZ"（即 SKILL.md 里的 sysAppNo）
  menuName: string       // 显示名称
  menuNameCode: string   // 国际化 key，格式：menu:{sysAppCamel}:{pathCamelCase}
  parentId: string       // 父菜单 ID（根目录用固定 ID）
  type: MenuType         // "M"=目录 "C"=菜单页面
  path: string           // 路由 path（目录如 "testDir"，菜单如 "test_menu"）
  icon: string           // 图标名，默认 "list"
  orderNum: number       // 显示排序
  useCache: 0 | 1        // 1=使用缓存（默认）
  common: number         // 固定传 2
  hidden: boolean        // 是否隐藏，默认 false
  editMode: false        // 固定传 false

  // 仅 type=C（菜单页面）时有意义
  component?: string     // 组件路径，如 "produce/sale-prototype/module/index"
  permission?: string    // 权限标识，如 "test-menu"；目录时传 null 或不传
}

/**
 * 新增/更新菜单的响应
 * 新增时 data 返回完整菜单对象（含服务端生成的 id）✅
 * 更新时 data 也返回完整对象
 */
export interface MenuSaveResponse {
  code: number           // 2000 = 成功
  message: string        // "菜单新增成功" | "菜单修改成功"
  data: MenuSavedItem | null
}

/** 服务端返回的完整菜单对象 */
export interface MenuSavedItem {
  id: string             // 雪花 ID 字符串，新增后从这里取
  sysAppNo: string
  menuName: string
  permission: string
  parentId: string
  icon: string
  path: string
  component: string | null
  type: MenuType
  orderNum: number
  useCache: number
  common: number
  hidden: boolean
  menuNameCode: string
  children: MenuSavedItem[]
  // 以下字段存在但 MCP 工具不需要处理
  companyId: string
  createUserNo: string
  updateUserNo: string
  createDateTime: string
  updateDateTime: string
  groupId: string | null
  pageId: string | null
  microApp: boolean | null
  markApp: boolean
  cname: string
  label: string
  name: string
}

/** 统一响应格式 */
export interface ApiResponse<T = null> {
  code: number
  message: string
  data: T
}
```

---

### 字典接口类型

```typescript
// mcp/api/types/dict.ts

/**
 * 新增字典模块的请求体
 * POST /system/dictModule/save
 * ⚠️ sortPriority 是字符串（"1"），不是数字
 */
export interface DictModuleSaveBody {
  strSn: string          // 模块标识符，如 "common"、"test"（代码里引用用这个）
  strName: string        // 显示名称，如 "通用"、"produce"
  sortPriority: string   // ⚠️ 字符串类型！如 "1"
  strLevel: 2            // 固定传 2（表示字典模块层级）
}

/**
 * 新增字典模块响应
 * ⚠️ data 为 null！创建后无法从响应里拿 id
 * 必须在创建成功后再调查询接口，用 strSn 匹配找到新建的模块拿其 id
 */
export interface DictModuleSaveResponse {
  code: number           // 2000 = 成功
  message: string        // "系统字典模块增加成功!"
  data: null             // 永远是 null
}

/**
 * 新增字典值（词典项）的请求体
 * POST /system/business/dict/save
 */
export interface DictItemSaveBody {
  moduleId: string       // 所属字典模块的 id（32字符大写字母数字格式）
  strSn: string          // 字典项 key，如 "1" "2" "M" "F"
  strName: string        // 字典项显示名，如 "男" "女"
  strLevel: 2            // 固定传 2
  dtlValue: string       // 扩展值1，不需要时传 ""
  dtlValueRequired: boolean      // dtlValue 是否必填，默认 false
  dtlValue2Required: boolean     // 默认 false
  dtlValue3Required: boolean     // 默认 false
  dtlValue4Required: boolean     // 默认 false
  // dtlValue2/3/4 字段存在但本次未在请求体中看到，推测不传时服务端默认为 ""
}

/** 新增字典值响应（不返回 id，只需确认成功） */
export interface DictItemSaveResponse {
  code: number           // 2000 = 成功
  message: string        // "词典增加成功!"
  data: null
}

/** 字典模块完整对象（查询返回） */
export interface DictModule {
  id: string             // 32字符大写字母数字，如 "I5S4TFVOIV06UO518R5QKAH8R3J874I8"
  sysAppNo: string
  strSn: string          // 用于在创建后 re-query 时定位
  strName: string
  strLevel: number
  sortPriority: number
  dictionaries: DictItem[] | null
  appCommon: boolean
  backupId: string
  companyId: string
  createUserNo: string
  updateUserNo: string
  createDateTime: string
  updateDateTime: string
}

/** 字典值（词典项）完整对象 */
export interface DictItem {
  id?: string
  moduleId: string
  strSn: string
  strName: string
  strLevel: number
  dtlValue: string
  dtlValue2?: string
  dtlValue3?: string
  dtlValue4?: string
  dtlValueRequired: boolean
  dtlValue2Required: boolean
  dtlValue3Required: boolean
  dtlValue4Required: boolean
}
```

---

### 字典 dtlValue1~4 扩展字段的用途解释

这是这套字典系统的**多列扩展设计**，每个字典项除了主要的 `strSn`（key）+ `strName`（显示名）之外，最多可以携带 4 个附加数据列。

**经典使用场景**：

| 字典 | strSn | strName | dtlValue（value1） | dtlValue2 | dtlValue3 | dtlValue4 |
|---|---|---|---|---|---|---|
| 性别 | `1` | 男 | `M`（英文缩写） | `male`（英文全称） | — | — |
| 省份 | `SH` | 上海 | `021`（区号） | `310000`（邮编） | `东部`（区域） | — |
| 状态 | `1` | 审批中 | `#FF9900`（颜色） | `warning`（UI类型） | — | — |
| 工序 | `CUT` | 下料 | `01`（工序编号） | `2`（标准工时/小时） | `cutting`（英文） | — |

**dtlValue是否必填** 的作用：字典是被业务表单引用的。有些业务场景下，选了这个字典项之后必须同时填写附加值（如：选了"省份=上海"，必须再填具体区号）。Required=true 表示引用这个字典的表单校验规则里该附加列不能为空。

**简单场景（如性别、是否等枚举）**：`dtlValue` 传空字符串 `""`，Required 全部传 `false` 即可。

---

## 七、接口地址与参数（已全部确认）

> 所有接口均基于真实网络抓包验证。

| 工具 | 操作 | HTTP | 端点 | 关键特性 |
|---|---|---|---|---|
| `wls_menu_query` | 查询 | GET | `/system/menu/getMenuTreeByDomainId?domainId=` | domainId 从 env.local.json `menu.domainId` 自动读取 |
| `wls_menu_upsert` | 新增/更新 | POST | `/system/menu/save` | 有 id=更新，无 id=新增；新增响应 data 含完整对象（含 id） |
| `wls_dict_query` | 查询 | GET | `/system/business/dict/getDictionaryTreeData` | 无参数，返回 `data.dictionary.children[]` |
| `wls_dict_upsert` ① | 查询模块 | GET | `/system/business/dict/getDictionaryTreeData` | 检查 strSn 是否已存在 |
| `wls_dict_upsert` ② | 创建模块 | POST | `/system/dictModule/save` | **data=null**！创建后必须 re-query |
| `wls_dict_upsert` ③ | re-query | GET | `/system/business/dict/getDictionaryTreeData` | 用 strSn 匹配拿到 id |
| `wls_dict_upsert` ④ | 创建字典项 | POST | `/system/business/dict/save` | data=null（只确认 code=2000） |

**鉴权**：所有请求带 `Authorization: Bearer {token}` header，token 来自 env.local.json。

**`sysAppNo`**：写入请求体（如 menuSaveBody.sysAppNo），不需要放进请求头。

**`domainId` vs `parentMenuId`**：两者都存在 env.local.json `menu` 字段中。
- `domainId`：应用域 ID（大数字，如 1777597797627056130），MCP 查询使用
- `parentMenuId`：新建菜单的父节点 ID，SKILL.md prompt 流程中使用

---

## 八、架构升级建议——分阶段，每步有验证

### 现状评估

| 模块 | 状态 | 痛点程度 |
|---|---|---|
| SKILL.md 系统 | ✅ 运行良好 | 低，不需要动 |
| menu-sync / dict-sync | ⚠️ 手动中转 | **高，第一优先级** |
| convention-audit | ✅ 精度足够 | 低，不需要 MCP 化 |
| bin/wl-skills.js 逻辑 | ⚠️ 轻微堆积 | 中，api/ 分层后缓解 |

---

### 阶段一：MCP sync 落地（现在做）

**目录结构（实际平钺，纯 JS 无编译）**：

```
wl-skills-kit/
└── mcp/
    ├── server.js              MCP server 入口（stdio 协议，JSON-RPC 2.0，无三方依赖）
    ├── config.js              读取 env.local.json，校验占位字段
    ├── api/
    │   ├── client.js              带鉴权的 fetch wrapper（http/https 模块，兼容 Node 16+）
    │   ├── menuApi.js             queryMenuTree() / saveMenu()
    │   └── dictApi.js             queryDictModules() / saveDictModule() / saveDictItem()
    ├── tools/
    │   ├── menuSync.js            handleMenuQuery() + handleMenuUpsert()
    │   └── dictSync.js            handleDictQuery() + handleDictUpsert()
    └── README.md
```

**Tool 清单（已确认接口行为后的最终版）**：

| Tool | 参数 | 内部调用端点 |
|---|---|---|
| `wls_menu_query` | `{ domainId: string }` | `GET /system/menu/getMenuTreeByDomainId?domainId={domainId}` → 返回全量菜单树 |
| `wls_menu_upsert` | `{ items: MenuSaveBody[] }` | `POST /system/menu/save`；有 id=更新，无 id=新增；新增后从响应 data 取 id |
| `wls_dict_query` | `{}` | `GET /system/business/dict/getDictionaryTreeData` → 返回 `data.dictionary.children[]` |
| `wls_dict_upsert` | `{ module: DictModuleSaveBody, items?: DictItemSaveBody[] }` | ① `POST /system/dictModule/save`（data=null）→ ② 再次 GET 查询用 strSn 匹配拿 id → ③ `POST /system/business/dict/save` × N 条 |

**字典 upsert 的内部流程说明**：

```
wls_dict_upsert({ module: { strSn: "gender", strName: "性别", ... }, items: [...] })
  ↓
① 先查询：queryDictModules() → 检查是否已存在 strSn="gender" 的模块
  ↓ 不存在
② POST /system/dictModule/save → {code:2000, data: null}（不含id）
  ↓
③ 再次 queryDictModules() → 找到 strSn="gender" 的模块 → 取其 id
  ↓
④ POST /system/business/dict/save × N 条（用第③步拿到的 moduleId）
  ↓
⑤ 返回 { module: "gender", created: N, skipped: 0 }
```

**api/ 层的核心 client（基于已确认的鉴权方式）**：

```typescript
// mcp/api/client.ts
export async function wlsFetch<T>(
  path: string,
  options: { method?: string; body?: unknown },
  config: { gatewayPath: string; token: string; sysAppNo: string }
): Promise<{ ok: boolean; data: T | null; error?: string; code?: number }> {
  const res = await fetch(`${config.gatewayPath}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const json = await res.json()
  if (json.code === 2000) {
    return { ok: true, data: json.data, code: json.code }
  }
  return { ok: false, data: null, error: json.message, code: json.code }
}
```

**编辑器配置（`wl-skills init` 自动写入）**：

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "wl-skills": {
      "command": "node",
      "args": ["node_modules/@agile-team/wl-skills-kit/mcp/server.js"],
      "env": { "WL_PROJECT_ROOT": "${workspaceFolder}" }
    }
  }
}
```

```json
// .claude/settings.json
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

**阶段一完成的验证指标**：
- [ ] 10 条菜单同步：对话轮数 ≤ 2，input token < 600
- [ ] 接口调用成功率 100%（类型安全，无格式猜测）
- [ ] CLI 如果要加 `wl-skills sync menu`，直接 import `mcp/api/menuApi.ts` 即可，不需要任何重构

---

### 阶段二：CLI 命令扩展（api/ 层已就绪后自然延伸）

```bash
# 加这两个命令，完全复用 mcp/api/
wl-skills sync menu --parent-id=xxx       # 同步菜单（无 AI，纯 CLI）
wl-skills sync dict --module-id=xxx       # 同步字典
```

对应 bin/wl-skills.js 增加：

```javascript
program
  .command('sync <type>')
  .option('--parent-id <id>', '父菜单ID')
  .option('--dry-run', '预览不执行')
  .action(async (type, opts) => {
    const { menuApi } = require('../mcp/api/menuApi')  // 直接复用
    // ...
  })
```

**触发条件**：有用户希望在 CI/CD 里自动同步（无 AI 介入）。

---

### 阶段三：core/ 分层（真正的大厂 CLI）

```bash
wl-skills sync --all          # 菜单 + 字典 + 权限一键同步
wl-skills audit --fix         # 规范审查 + 自动修复
wl-skills generate page       # 代码生成
```

**触发条件**（缺一不做）：
1. 阶段二已验证，api/ 层运行稳定
2. 出现 MCP 和 CLI 共用相同业务判断逻辑的情况
3. TypeScript 编译流程配置完成
4. 有 vitest 测试覆盖需求

---

## 九、静态文档 vs 动态文档的适用边界

你说"更多是已经生成的静态文档，只是让 AI 读写"。**静态文档不需要 MCP**，直接放 `files/` 目录随包发布即可。

**动态文档的参考场景**（你未来可能遇到的）：

| 场景 | 动态原因 | 建议方案 |
|---|---|---|
| 内部 Swagger/OpenAPI | 后端每次发版都更新 | MCP Resources + subscribe |
| 菜单/字典的当前状态 | 每次运行都要查最新状态 | MCP Tools（已做） |
| 数据库表结构 | 每次迁移后变化 | MCP Resources（按需） |
| 运行时的错误日志 | 实时变化 | MCP Resources（按需） |
| Git 提交历史 | 每次 commit 后变化 | 直接用现有 Git MCP server |

**你说的"静态文档让 AI 读写"**——就是当前 SKILL.md 的工作方式，不需要 MCP。AI 读文件是 IDE 的内置能力。

---

## 十、总结：做什么、不做什么

### 现在做（阶段一，已完成）

- ✅ `mcp/api/client.js` 共享 HTTP 层（Bearer 鉴权，内置 http/https，无三方依赖）
- ✅ `mcp/api/menuApi.js` + `mcp/api/dictApi.js`
- ✅ `wls_menu_query` + `wls_menu_upsert` 两个 Tools
- ✅ `wls_dict_query` + `wls_dict_upsert` 两个 Tools（含 dict data=null re-query 逐辑）
- ✅ `wl-skills init` 自动写入 `.cursor/mcp.json` 和 `.claude/settings.json`
- ✅ `env.local.json` 新增 `menu.domainId` 字段

### 满足触发条件后再做

- ⏳ CLI `wl-skills sync` 命令（条件：有无 AI 介入的 CI/CD 需求）
- ⏳ `core/` 纯函数分层（条件：有业务判断逻辑需要跨 MCP/CLI 共用）
- ⏳ permission-sync MCP 化（条件：API 接入后）

### 不做

- ❌ `wls_docs_sync` / `wls_docs_query`（静态 JSON 放 files/ 即可）
- ❌ `wls_audit_file` MCP tool（SKILL.md prompt 方式精度更高）
- ❌ plugin 机制、YAML 工作流、向量搜索（等真实需求）

### convention-audit 的特殊说明

audit 的核心价值是 AI 对**代码语义**的理解，不是执行确定动作。封装成 MCP tool 只能返回结构化 `{issues}` 列表，反而丢失代码上下文，精度下降。保留在 SKILL.md 是正确的。若未来需要，正确形式是 **MCP Resources**（把代码文件作为 Resource 暴露），而非 Tools。

### SKILL.md 与 MCP 的分工（不变）

| 内容 | 负责方 |
|---|---|
| 触发词、Pre-flight 检查、工作流决策 | SKILL.md（prompt 层） |
| 实际 HTTP 调用 | MCP api/ 层 |
| JSON-RPC 包装 | MCP tools/ 层 |
| 输出给用户的结果表格式化 | SKILL.md 指导 AI |



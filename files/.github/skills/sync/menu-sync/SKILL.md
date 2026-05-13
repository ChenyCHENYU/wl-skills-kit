---
name: menu-sync
description: "Use when: creating system menus for newly generated pages, batch registering menus, or syncing pages.ts entries to the backend menu table. Triggers on: 创建菜单, 注册菜单, 同步菜单, 补菜单, menu sync, create menu, register menu."
---

# Skill: 菜单同步（menu-sync）

将 pages.ts 中注册的页面同步到后端菜单表，使系统能够路由到新页面。

> **背景**：本项目是 Module Federation 子应用，页面在 `pages.ts` 注册后，
> 还需要在后端菜单表中创建对应记录，系统才能路由到该页面。
> 设计文档：`.github/guides/architecture.md`

---

## 配置与使用方式（一次配置，无需反复填写）

### 数据来源分工

| 数据                                             | 来源                       | 说明                                    |
| ------------------------------------------------ | -------------------------- | --------------------------------------- |
| 菜单名称、路径、组件、权限、隐藏、排序、应用编码 | `.github/reports/SYS_MENU_INFO*.md` | 由 page-codegen 追加写入，AI 直接读取 |
| `parentMenuNameCode`                             | `wls_menu_query` 查询菜单树 | 从父级节点获取，无需手填               |
| **gatewayPath、parentMenuId、sysAppNo、token**   | `env.local.json`           | 可通过 token/接口辅助提取               |
| **domainId**                                     | 用户确认 / 菜单后台 Network | 当前权限下无法总是自动获取，需确认     |

### 配置文件（统一维护，菜单/字典/权限共用）

优先读取 `.github/skills/sync/env.local.json`（v2.1.5+ 统一配置）：

```json
{
  "gatewayPath": "http://网关地址:端口",
  "sysAppNo": "应用编码（从已有菜单的sysAppNo字段获取，非明文）",
  "token": "Bearer Token（不含bearer前缀）",
  "menu": {
    "parentMenuId": "父级菜单ID",
    "domainId": "应用域ID"
  }
}
```

> 向下兼容：如上述文件不存在，回落读取 `menu-sync/env/env.local.json`（旧版路径）。  
> 字段说明及获取方式见 `env/guide.md`

menu-sync 读取规则：`parentMenuId` 优先从 `menu.parentMenuId` 读取，回落到根级 `parentMenuId`。

### 使用步骤

1. **首次**：按 `env/guide.md` 填写 `skills/sync/env.local.json` 的字段
2. **之后**：直接对 AI 说「帮我创建菜单」/「同步菜单」/「补菜单」
3. AI 自动执行：读 `.github/reports/SYS_MENU_INFO*.md` → 读 `env.local.json` → 优先调用 `wls_menu_sync_from_report` 一步完成确定性同步；如需手动拆分，则 `wls_menu_query` 查 domain 菜单树 → 先 upsert 一级目录 → 用返回 id upsert 二级页面菜单 → 输出 created/updated/skipped 结果表
4. **全程无需手动执行任何命令**

SYS_MENU_INFO.md 是 menu-sync Skill 的输入数据源：
- **自动创建**：用户说"帮我创建菜单" → menu-sync 调用 `wls_menu_sync_from_report` 读取 SYS_MENU_INFO.md → 调 API 按目录与页面顺序创建/更新
- **手动创建**：用户也可直接按 SYS_MENU_INFO.md 的表格在系统管理后台手动创建菜单
- 两种方式等价，菜单创建后通过 `组件路径` 字段与 pages.ts 注册的文件路径关联
- **自动创建顺序**：优先使用 `wls_menu_sync_from_report`；手动拆分时必须先调用 `wls_menu_query` 获取当前 domain 菜单树，再 `wls_menu_upsert` 创建/更新一级目录（type=M），拿到目录 id 后再创建二级菜单（type=C）。不得把二级页面全部直接挂到根 `parentMenuId`。

---

## 方案演进路线

| 阶段        | 方案                              | 状态          | 说明                                                 |
| ----------- | --------------------------------- | ------------- | ---------------------------------------------------- |
| **Phase 1** | AI 调用现有 API 逐条创建          | ✅ 当前可用   | 利用 `/system/menu/save` 接口，AI 充当自动化脚本     |
| **Phase 2** | 前端推送脚本 `pnpm run menu:push` | ⏳ 待后端接口 | 需后端提供 `POST /system/menu/batchPush` upsert 接口 |

---

## Phase 1：MCP 驱动创建菜单（当前方案）

> 本质是 **menu-sync-design.md 的方案 C（只增不删）**，由 AI 调 MCP 工具自动执行。

> 📖 **必读公共护栏**：`../_mcp-guardrail.md`
> 该文件定义了 MCP 调用纪律、错误分层判定、自愈闭环剧本。AI 首次执行 sync 类任务时必须先 `read_file` 加载它。
>
> 本 Skill 使用的 MCP 工具：`wls_menu_sync_from_report` / `wls_menu_query` / `wls_menu_upsert`。工具不可用或调用失败时，按 guardrail §2 剧本引导用户完善 `env.local.json` 后重试，**不得用 curl/手拼 HTTP 绕开 MCP**。

### 前置条件

1. MCP 已连接（工具列表中可见 `wls_menu_sync_from_report`）
2. `.github/skills/sync/env.local.json` 已填写 `token`（纯 JWT，不含 `bearer ` 前缀）、`gatewayPath`、`sysAppNo`、`menu.parentMenuId`、`menu.domainId`

### 输入

用户提供以下信息（或 AI 从 pages.ts 自动提取）：

- **父级菜单 ID**：`menuId`（后端菜单树中的上级目录 ID）
- **应用编码**：`sysAppNo`（如 `produce`、`sale`、`system`）
- **菜单数据**：可以是 pages.ts 中的条目，或用户手动指定

菜单类型：

| type | 含义         | 必填字段                                      |
| ---- | ------------ | --------------------------------------------- |
| `M`  | 目录         | `menuName`, `path`                            |
| `C`  | 菜单（页面） | `menuName`, `path`, `permission`, `component` |
| `A`  | 动作按钮     | `menuName`, `path`                            |

### 执行流程（首选：一步到位）

**默认走 `wls_menu_sync_from_report`**——它内部完成「读报告 → 查菜单树 → 一级目录 upsert → 二级菜单 upsert」全流程：

```
工具：wls_menu_sync_from_report
入参：{ dryRun?: boolean, reportPath?: string }   // 不传 reportPath 自动用最新 SYS_MENU_INFO*.md
第一次执行：先传 dryRun: true 预览，确认无误后再正式执行（去掉 dryRun）
```

### 手动拆分流程（仅当一步式不满足时）

#### Step 1: 查询当前 domain 菜单树（防重复 + 取父级信息）

```
工具：wls_menu_query   （无参，自动读 env.local.json → menu.domainId）
返回：当前应用域完整菜单树
```

#### Step 2: 先创建一级目录（type=M），再创建二级页面菜单（type=C）

- 一级目录按 `menuName/path` 在父级 `parentMenuId` 下去重；不存在则创建，存在则复用 id
- 二级页面菜单的 `parentId` 必须是上一步对应目录的 id，**禁止**全部挂到根 `parentMenuId`

```
工具：wls_menu_upsert
入参：{ items: [<下面的对象>...] }
```

**`items[]` 单条对象模板（仅作为 MCP 入参参考，禁止 AI 自行 fetch）**：

```jsonc
{
  "useCache": 1,
  "icon": "list",
  "common": 2,
  "hidden": false,
  "type": "C",                      // "M"=目录, "C"=菜单, "A"=动作
  "parentId": "{父级目录的 id}",
  "sysAppNo": "{sysAppNo}",
  "orderNum": 1,
  "menuName": "客户档案",
  "menuNameCode": "{parentMenuNameCode}:{pinyinName}",
  "path": "mmwrCustomerArchive",
  "permission": "mmwrCustomerArchive",
  "component": "produce/production-mmwr/aiflow/mmwr-customer-archive/index.vue"
}
```

> **MCP 内部说明**（AI 不可据此自行调接口）：底层走 `POST /system/menu/save`，成功码 `code: 2000`。

#### Step 3: 记录结果

创建完成后输出结果表格：

| 菜单名   | path                | type | 状态                | id     |
| -------- | ------------------- | ---- | ------------------- | ------ |
| 客户档案 | mmwrCustomerArchive | C    | ✅ created          | 123456 |
| 客户详情 | mmwrCustomerDetail  | C    | ⏭️ skipped (已存在) | -      |

### 字段生成规则

| 字段           | 规则                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------- |
| `menuName`     | 取 pages.ts 的 `label`                                                                       |
| `path`         | 页面目录名转 camelCase（如 `mmwr-customer-archive` → `mmwrCustomerArchive`）                 |
| `component`    | 取 pages.ts 的 `name`（如 `produce/production-mmwr/aiflow/mmwr-customer-archive/index.vue`） |
| `permission`   | `{域}:{path}:list`（如 `produce:mmwrCustomerArchive:list`）                                  |
| `menuNameCode` | `{父级menuNameCode}:{菜单名拼音}`（小写连续拼接）                                            |
| `hidden`       | 表单页/详情页等隐藏路由设为 `true`，菜单可见页面设为 `false`                                 |
| `orderNum`     | 从父级已有菜单最大 orderNum + 1 开始递增                                                     |
| `icon`         | 目录级 `"list"`，菜单级 `"list"`                                                             |

### pages.ts → 菜单数据映射示例

以 `aiflow` 子模块为例：

```
pages.ts 条目:
  ["mmwr-customer-archive", "客户档案"]

→ 菜单数据:
  {
    type: "C",
    menuName: "客户档案",
    path: "mmwrCustomerArchive",
    component: "produce/production-mmwr/aiflow/mmwr-customer-archive/index.vue",
    permission: "produce:mmwrCustomerArchive:list",
    hidden: false
  }

隐藏页面示例:
  ["mmwr-customer-apply-add-form", "客户申请新增表单"]

→ 菜单数据:
  {
    type: "C",
    menuName: "客户申请新增表单",
    path: "mmwrCustomerApplyAddForm",
    component: "produce/production-mmwr/aiflow/mmwr-customer-apply-add-form/index.vue",
    permission: "produce:mmwrCustomerApplyAddForm:list",
    hidden: true    // ← 表单页隐藏
  }
```

### 隐藏页面判断规则

以下页面类型应设置 `hidden: true`：

- 目录名含 `-form`（独立路由表单页）
- 目录名含 `-detail`（详情页）
- 目录名含 `-history`（历史查询页）
- reports/SYS_MENU_INFO.md 中标注为"隐藏菜单"的页面

### 跳过规则

- 当前父级下已有同名 `menuName` → 跳过
- 当前父级下已有相同 `path` → 跳过
- 跳过时不做更新、不做覆盖，只记录"已跳过"

### 树形菜单处理

如果 `SYS_MENU_INFO` 包含一级目录和二级菜单，必须按以下顺序处理：

1. 先以 `type: "M"` 创建目录
2. 保存成功后取返回的 `data.id`
3. 以新 `id` 作为 `parentId` 继续创建子菜单
4. 若目录已存在，复用已存在目录 id，不重复创建

---

## Phase 2：推送脚本方案（待后端接口就绪后启用）

> 对应 menu-sync-design.md 的 **方案 D（推送覆盖）**，是最终目标方案。

### 与 Phase 1 的差异

| 维度     | Phase 1 (AI 调 API) | Phase 2 (推送脚本)           |
| -------- | ------------------- | ---------------------------- |
| 执行者   | AI                  | `pnpm run menu:push` 脚本    |
| 更新能力 | 只增不删（方案 C）  | upsert 覆盖（方案 D）        |
| 改名支持 | ❌ 会产生重复       | ✅ 按 componentPath 匹配更新 |
| 权限影响 | 无                  | 无（只写结构字段）           |
| 依赖     | Token + 网关地址    | 后端 `batchPush` 接口        |

### 所需后端接口

```
POST /system/menu/batchPush
```

- 按 `componentPath` 做 upsert（存在则更新结构字段，不存在则新增）
- **不删除**后端多余的菜单
- **不碰**权限/角色绑定字段
- 详见 `.github/guides/architecture.md`

### pages.ts 扩展

在 `SharedPageItem` 中增加 `menuMeta` 字段：

```typescript
export interface SharedPageItem {
  name: string;
  label: string;
  menuMeta?: {
    parentName: string;
    menuPath: string;
    sortOrder: number;
    appCode: string;
    hidden?: boolean;
    icon?: string;
  };
}
```

### 切换步骤

1. 后端提供 `batchPush` 接口
2. 在 pages.ts 的页面条目中补充 `menuMeta`
3. 创建 `scripts/menu-push.ts`（vite-node 执行）
4. 注册 `pnpm run menu:push` 命令
5. page-codegen Skill 生成页面时自动填充 `menuMeta`
6. 废弃 Phase 1 的 AI 手动调 API 流程

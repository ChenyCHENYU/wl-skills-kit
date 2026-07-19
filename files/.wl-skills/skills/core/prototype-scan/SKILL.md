---
name: prototype-scan
description: "Use when: analyzing Axure exported HTML prototype files to extract page inventory, classify interaction patterns, identify reusable components, and produce a structured page checklist for Vue development. Also supports NON-standard detailed design documents (free-form MD/Word) or natural language descriptions as input. DO NOT use for standard requirement-spec documents produced by wl-skills-design (path contains .wl-skills/docs/spec/, has function codes like PMMB001, IPO tables, flow five-elements) — route those to spec-doc-parse instead. Triggers on: prototype analysis, axure scan, page inventory, 原型解析, 页面清单, axure转vue, 口述需求, 自然语言建页面, natural language page request, 建个页面, 写个页面, 口头描述页面."
---

# Skill: 原型解析（prototype-scan）

将 **Axure 导出的 HTML 原型包** 或 **详细设计文档（MD/Word/表格）** 解析为结构化的 **page-spec JSON 页面清单**，作为后续接口约定和代码生成的输入。

> **两种输入，同一输出**：输出格式完全相同（page-spec JSON），消费方（page-codegen）无需感知来源。

## 触发

| 模式 | 输入 | 典型场景 |
|------|------|----------|
| **模式 0（自然语言）** | 用户口述需求，无文件 | 日常对话："帮我建一个客户管理页面，有XX字段" |
| **模式 A（Axure）** | Axure HTML 文件包目录 | 已有原型设计，AI 全量扫描 HTML |
| **模式 B（非规范详设）** | MD/Word/表格格式的零散详细设计 | 已有非规范详设文档，AI 解析结构化字段 |

> ⚠️ **双线隔离（必读）**：本 Skill 走「原型线」。若输入是 wl-skills-design 产出的**标准需求设计说明书**（路径含 `.wl-skills/docs/spec/`、含功能编码 `/[A-Z]{2,6}[0-9]{3}/`、含 IPO 表「处理逻辑」、含流程五要素），属于「规范线」，**禁止本 Skill 接管**，必须路由到 `core/spec-doc-parse/SKILL.md`。两线各自解析，最终都汇聚到同一份 page-spec JSON，下游 `api-contract` / `page-codegen` 无感知来源。

---

## 模式 0 — 自然语言转 page-spec（内部步骤）

> **核心原则**：模式 0 是 AI 的**内部推导流程**，不输出中间 JSON 给用户。
> AI 从口述中提取信息 → 内部构建 page-spec JSON → 直接传递给 page-codegen 消费。
> **不向用户索要文件**，用注释标注不确定项即可。

### 1. 提取关键信息

从用户口述中识别以下实体（缺省则用默认值）：

| 实体 | 识别关键词示例 | 默认值 |
|------|---------------|--------|
| 页面中文名 | "XX页面" / "XX管理" / "XX档案" | 必须由用户提供 |
| 交互模式 | 见下方映射表 | `LIST` |
| 服务缩写 | "生产"→pm, "精整"→mmwr, "销售"→sale, "人力"→hrms, "基础"→base | 从目标路径推断 |
| 资源名 | 从中文名推断 CamelCase | 自动推断 |
| 目录名 | 从中文名推断 kebab-case | 自动推断 |

### 2. 关键词 → 交互模式映射

| 用户关键词 | 推断模式 |
|-----------|----------|
| "列表" / "查询" / "管理页" / 无特殊说明 | `LIST` |
| "主从" / "明细" / "上下表" | `MASTER_DETAIL` |
| "树形" / "左树右表" | `TREE_LIST` |
| "表单" / "详情" / "多Tab表单" | `DETAIL_TABS` |
| "独立表单" / "路由表单" / "复杂表单" | `FORM_ROUTE` |
| "变更历史" / "变更记录" | `CHANGE_HISTORY` |
| "记录表单" / "无分页" | `RECORD_FORM` |
| "工位" / "操作站" | `OPERATION_STATION` |

### 3. 内部构建 page-spec 骨架

AI 根据提取的信息，内部构建 page-spec JSON（**不输出给用户**）：

```jsonc
{
  "schemaVersion": 1,
  "pageId": "PAGE-[稳定业务编号]",
  "page": "[用户说的中文名]",
  "name": "[推断的kebab-case]",
  "mode": "[推断的交互模式，默认LIST]",
  "dir": "views/[域]/[模块]/[子模块]/[kebab-name]/",
  "profileId": "jh4j3-openapi3",
  "protocolVersion": "1.0",
  "apiContract": "./api.md",
  "openQuestions": [],
  "query": [
    // 从用户描述中提取；未提及 → 基于资源名推断 1-2 个（如"名称"、"编码"）
  ],
  "toolbar": [
    // 默认: 新增(primary) + 删除(danger)；用户提及"导出""导入"等则追加
  ],
  "columns": [
    // 从用户描述中提取；未逐一列举 → 基于资源语义推断 5-8 个常见字段
  ],
  "operations": [
    // 默认: 编辑 + 删除；用户提及"查看""审批"等则调整
  ],
  "features": {
    "tabSwitch": false, "viewSwitch": false, "hiddenMenu": false
  },
  "notes": [
    "[模式0] 字段英文名为AI推断值，请确认",
    "[模式0] dictCode 为推断值，请后端确认"
  ]
}
```

### 4. 降级与默认值原则

| 信息缺失项 | 默认策略 |
|-----------|----------|
| 交互模式 | `LIST`（最常见的列表查询页） |
| 查询字段 | 基于业务资源名推断 1-2 个（"名称"、"编码"） |
| 工具栏按钮 | `[新增(primary), 删除(danger)]` |
| 表格列 | 基于资源语义推断 5-8 个常见字段（编码、名称、类型、状态、创建时间等） |
| 操作列 | `[编辑, 删除]` |
| 字段英文名 | AI 推断 camelCase，notes 标注"字段名为推断值" |
| 字典 code | 状态类字段自动标注推断 dictCode，notes 标注"dictCode 为推断值" |
| 子表 | 不生成（用户未提及则不推断） |
| Tab/视角切换 | 关闭（`false`） |

> 构建完成后，直接进入输出流程（同模式 A/B），为 page-codegen 提供标准 page-spec JSON。

---

## 输入模式 A：Axure HTML 扫描

---

## 步骤

> ### ⚠️ Axure 原型文件访问前置说明
>
> Axure 导出的 HTML 包含一个 `index.html` 入口，但**不能直接用 `open_browser_page(index.html)` 访问**：
>
> | 访问方式 | 结果 | 推荐 |
> |---------|------|------|
> | `open_browser_page(index.html)` | 被重定向到 `resources/chrome/chrome.html`（扩展安装引导页），侧边栏不渲染 | ❌ 永久不可用 |
> | `open_browser_page(具体功能页.html)` | 页面内容正常，`read_page` 可读完整 DOM 快照 | ✅ **首选** |
> | `read_file(xxx.html)` | 直接读 HTML 源码，用正则提取文本/label | ✅ 推荐（补细节用）|
>
> **根本原因**：VS Code 集成浏览器是独立 Playwright/Chromium 进程，**不加载用户 Chrome 的任何扩展**，即使用户本地已安装 Axure RP 扩展也无效。此行为不随环境变化。
>
> **补充**：浏览器面板显示 `(not visible)` 仅表示该标签不在前台，不代表无法访问，`screenshot_page`/`read_page` 照样可用。
>
> **菜单树**应从 `系统整体框架.html`（或类似全局框架页）的 DOM 文本节点提取，不依赖侧边栏渲染。

### 1. 全量扫描 HTML

遍历所有 `.html` 文件，提取：

| 区域 | 提取内容                                               |
| ---- | ------------------------------------------------------ |
| 标题 | `<title>` / 标题文本 → 页面名称                        |
| 表格 | `<table>` / 网格布局 → 表格列定义                      |
| 表单 | `<input>` / `<select>` / 标签文本 → 查询条件和表单字段 |
| 按钮 | `<button>` / 链接文本 → 操作按钮列表                   |
| 弹窗 | 遮罩层 / 弹出层 → 弹窗组件                             |
| 树形 | 侧边栏 / 树形导航 → 树形结构                           |
| 注释 | Axure 注解 → 业务说明                                  |

### 2. 交互模式分类

| 模式            | 特征                  | 前端组件                                         |
| --------------- | --------------------- | ------------------------------------------------ |
| `LIST`          | 查询区 + 表格 + 分页  | BaseQuery + BaseTable + jh-pagination            |
| `MASTER_DETAIL` | 上方主表 + 下方明细表 | jh-drag-row（需 `.drager_row { height: 100% }`） |
| `TREE_LIST`     | 左侧树 + 右侧表格     | jh-drag-col + C_Tree                              |
| `FORM_MODAL`    | 弹窗中的表单          | el-dialog + el-form                              |
| `COMPOSITE`     | 多种组合              | 组合使用                                         |

### 3. 字段提取

对每个页面提取 3 类字段（字段名用 camelCase，与 data.ts 直接对应）：

**查询字段：**

```
中文名 | 建议英文名(camelCase) | 组件类型 | dictCode(如有)
```

组件类型对照（查询项 `queryDef()` 中使用）：

| 原型表现   | 组件配置                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 普通输入框 | 默认 input（无需 component 属性）                                                                                                                                     |
| 下拉选择   | `logicType: BusLogicDataType.dict, logicValue: "dictCode"`                                                                                                            |
| 单日期     | `component: () => ({ tag: "jh-date", type: "date" })`                                                                                                                 |
| 月份选择   | `component: () => ({ tag: "jh-date", type: "month", showFormat: "YYYY-MM", format: "YYYYMM" })`                                                                       |
| 日期范围   | `component: () => ({ tag: "jh-date", type: "daterange", rangeSeparator: "至", showFormat: "YYYY-MM-DD", valueFormat: "YYYY-MM-DD" })`，需额外配 `startName`/`endName` |
| 用户选择   | `component: () => ({ tag: "jh-user-picker" })`                                                                                                                        |
| 部门选择   | `component: () => ({ tag: "jh-dept-picker" })`                                                                                                                        |

**表格列：**

```
列名(中文) | 字段名(camelCase) | 宽度建议 | 是否字典列(logicType/logicValue)
```

字典列配置参考：`{ label: "状态", name: "status", minWidth: 120, logicType: BusLogicDataType.dict, logicValue: "dictCode", sortable: true, filterable: true }`

**表单字段（弹窗）：**

```
中文名 | 英文名(camelCase) | 类型 | 是否必填 | 组件类型 | dictCode
```

### 4. 组件匹配

对照平台已有组件（详细 API 见 `.wl-skills/docs/jh-*.md`）：

| 功能区   | 组件                    | 说明                                 |
| -------- | ----------------------- | ------------------------------------ |
| 查询区   | BaseQuery               | 通过 `queryDef()` 声明式配置         |
| 工具栏   | BaseToolbar             | 通过 `toolbarDef()` 声明式配置       |
| 表格     | BaseTable               | 通过 `columnsDef()` 声明式配置       |
| 分页     | jh-pagination           | 固定用法，见 copilot-instructions.md |
| 上下分栏 | jh-drag-row             | 主从表必备，需设 `:top-height`       |
| 左右分割 | jh-drag-col             | 树形+列表必备，设 `:leftWidth` + #left/#right slot |
| 树形面板 | C_Tree                  | 含搜索+Tab 切换                      |
| 下拉选择 | jh-select               | dict 属性自动加载字典数据            |
| 日期选择 | jh-date / jh-date-range | 参见 `.wl-skills/docs/jh-date.md`               |
| 用户选择 | jh-user-picker          | 参见 `.wl-skills/docs/jh-user-picker.md`        |
| 部门选择 | jh-dept-picker          | 参见 `.wl-skills/docs/jh-dept-picker.md`        |
| 文件上传 | jh-file-upload          | 参见 `.wl-skills/docs/jh-file-upload.md`        |

**新建组件判断：**

- 3+ 页面相同逻辑 → `.wl-skills/src/components/global/C_PascalCase/`
- 同模块 2 页面共用 → `.wl-skills/src/components/local/c_camelCase/`
- 业务强耦合 → 页面 `components/` 目录下

### 5. pages.ts 注册名推断

根据 `vite/plugins/shared/pages.ts` 的 `gProd` / `gSale` 函数格式：

```typescript
// ["kebab-case-目录名", "中文label"]
// 路径: views/[域]/[模块]/[子模块]/[目录]/index.vue
```

---

## 输出格式：page-spec JSON

> **核心原则：结构化 JSON 确保字段不遗漏（可机器 diff），notes 保留复杂语境。**
> 每个页面输出一个 page-spec JSON 对象，所有页面汇总为数组。
> **禁止在 JSON 中用"等"、"..."省略任何字段**，必须逐个列出。

### page-spec 结构定义

```jsonc
{
  // ===== 页面基本信息 =====
  "schemaVersion": 1,
  "pageId": "SALE-CUSTOMER-ARCHIVE",
  "page": "客户档案",               // 中文名
  "name": "customer-archive",       // kebab-case 目录名
  "mode": "LIST",                   // LIST | MASTER_DETAIL | TREE_LIST | DETAIL_TABS | FORM_ROUTE | CHANGE_HISTORY | RECORD_FORM | OPERATION_STATION | TEMPLATE_DRIVEN
  "dir": "views/sale/.wl-skills/templates/khda/customer-archive/",
  "profileId": "jh4j3-openapi3",
  "protocolVersion": "1.0",
  "apiContract": "./api.md",
  "openQuestions": [],
  "pagesTs": ["customer-archive", "客户档案"],  // pages.ts 注册项
  "platformComponents": ["BaseQuery", "BaseTable", "jh-pagination"],
  "newComponents": [],              // 需要新建的组件名（空数组=不需要新建）

  // ===== 查询区字段（逐个列出，禁止省略） =====
  "query": [
    { "name": "customerName", "label": "客户名称", "type": "input" },
    { "name": "customerType", "label": "客户类型", "type": "dict", "dictCode": "customer_type" },
    {
      "name": "createDate", "label": "建立日期", "type": "dateRange",
      "startName": "createDateStart", "endName": "createDateEnd"
    }
  ],

  // ===== 工具栏按钮（逐个列出，与原型顺序严格一致） =====
  "toolbar": [
    { "label": "新增", "type": "primary", "action": "openModal" },
    { "label": "删除", "type": "danger", "action": "batchDelete" },
    { "label": "导出", "type": "plain", "action": "export" }
  ],
  // toolbar.type 映射：蓝底填充="primary"，线框/白底="plain"，红色="danger"，灰色="default"

  // ===== 表格列（逐列列出，禁止省略） =====
  "columns": [
    { "name": "customerName", "label": "客户名称", "width": 180 },
    { "name": "customerType", "label": "客户类型", "width": 120, "dict": "customer_type" }
  ],

  // ===== 操作列按钮 =====
  "operations": [
    { "label": "编辑", "action": "edit" },
    { "label": "删除", "action": "delete" }
  ],

  // ===== 内嵌子表（关键！必须标注交互属性） =====
  "subTables": [
    {
      "name": "businessInfo",
      "label": "业务信息",
      "editable": true,          // 是否可增删行
      "inlineEdit": false,       // 是否行内编辑（双击单元格编辑）
      "columns": [
        { "name": "salesType", "label": "销售别", "width": 80 }
      ],
      "operations": [            // 子表的操作按钮
        { "label": "删除", "action": "removeRow" }
      ]
    }
  ],

  // ===== 表单字段（DETAIL_TABS / FORM_ROUTE / 弹窗 页面使用） =====
  "formSections": [
    {
      "name": "basicInfo",
      "label": "基本信息",
      "fields": [
        { "name": "customerName", "label": "客户名称", "type": "input", "required": true },
        { "name": "customerType", "label": "客户类型", "type": "dict", "dictCode": "customer_type", "required": true }
      ]
    }
  ],

  // ===== 页面级特殊交互开关 =====
  "features": {
    "tabSwitch": false,          // 是否有 Tab 切换（如临时/正式客户）
    "tabItems": [],              // Tab 项：[{ "label": "临时客户", "value": "temp" }]
    "viewSwitch": false,         // 是否有视图/视角切换（如管理视角/使用视角 Radio）
    "viewItems": [],             // 视图项：[{ "label": "管理视角", "value": "management" }]
    "hiddenMenu": false          // 是否隐藏菜单（从列表跳转进入的子页面）
  },

  // ===== 非结构化补充说明 =====
  "notes": [
    "客户分类/客户级别的下拉选项按产品线动态变化",
    "状态信息区（创建时间、核实状态等）为只读展示"
  ]
}
```

### 子表交互判断规则

| 原型特征 | editable | inlineEdit |
|---------|----------|------------|
| 表格上方有"新增"按钮，行内有"删除"链接 | `true` | `false` |
| 表格单元格可直接编辑（输入框/下拉） | `true` | `true` |
| 纯展示表格，无任何编辑入口 | `false` | `false` |
| 表格仅有外部"导入"按钮填充数据 | `false` | `false` |

### 完整输出模板

````markdown
# 页面清单 - [模块名称]

> 原型来源：[文件名/版本]
> 业务说明：[一句话描述]

## 页面总表

| # | 页面名称 | 交互模式 | kebab 目录名 | 是否隐藏菜单 |
|---|---------|---------|-------------|-------------|

## page-spec

```json
[
  { /* 页面1 完整 page-spec */ },
  { /* 页面2 完整 page-spec */ }
]
```

## 共享组件识别

| 组件 | 位置 | 复用页面 | 说明 |
|-----|------|---------|------|

## 数据字典汇总

| dictCode | 中文名 | 可选值 | 出现页面 |
|----------|-------|--------|---------|

## pages.ts 注册片段

```typescript
const [模块名]Module = gProd("[base-path]", {
  [子模块]: [
    ["[kebab-目录名]", "[中文名]"],
  ],
});
```

> ⚠️ 注册后还需在系统管理平台配置菜单路由
````

### 自检清单（输出前必须逐项确认）

```
□ 每个页面的 query 数组 — 数量与原型查询区字段一一对应？
□ 每个页面的 query 数组 — 顺序与原型一致（从左到右、从上到下）？
□ 每个页面的 columns 数组 — 数量与原型表头一一对应？
□ 每个页面的 columns 数组 — 顺序与原型表头从左到右完全一致？
□ 每个页面的 toolbar 数组 — 数量与原型按钮一一对应？
□ 每个页面的 toolbar 数组 — 顺序与原型按钮从左到右完全一致？
□ 每个页面的 toolbar 数组 — 按钮 type 与原型颜色对应（蓝底=primary, 线框=plain, 红色=danger）？
□ 每个页面的 operations 数组 — 数量与原型操作列按钮一一对应？
□ 每个页面的 operations 数组 — 顺序与原型一致？
□ 所有 subTables 都标注了 editable + inlineEdit？
□ 所有 dict 字段都提取了 dictCode？
□ features.tabSwitch / tabItems — 原型中的小 Tab 标签是否全部提取？
□ features.viewSwitch / viewItems — 原型中的视角切换（Radio/RadioButton）是否提取？
□ viewSwitch 为 true 时，是否为每个视角分别提取了 columns 数组？
□ features.hiddenMenu 已正确标注？
□ notes 中补充了无法结构化的特殊逻辑？
```

### 精度细节要求（必读）

> **顺序即规范**：原型设计师精心安排了查询区、按钮栏、表格列的顺序，AI 输出必须严格保持一致。

1. **查询区字段**：按原型从左到右、从上到下逐个提取，不可调换顺序，不可遗漏
2. **工具栏按钮**：按原型从左到右逐个提取，标注颜色类型（蓝底填充 = `primary`，线框 = `plain`，红色 = `danger`，灰色/默认 = `default`）
3. **Tab 标签**：原型中所有 Tab（如"临时客户"/"正式客户"/"公海池"）必须提取到 `features.tabItems`，标注 label 和 value
4. **视图/视角切换**：原型中 Radio/RadioButton 组（如"管理视角"/"使用视角"）必须提取到 `features.viewItems`。当 viewSwitch 为 true 时，须为**每个视角分别提取 columns 数组**（因不同视角列定义不同），page-spec 中使用 `viewColumns: { "management": [...], "usage": [...] }` 结构
5. **表格列**：按原型表头从左到右逐列提取（不含复选框列和序号列，这两列在代码模板中自动添加），不可遗漏任何一列
5. **操作列按钮**：表格最后一列的操作按钮（查看/编辑/删除/启用等），逐个提取到 `operations`，保持原型中的文字和顺序
6. **按钮文字**：必须使用原型中的**原始文字**（如原型写"新增申请"不可简化为"新增"）

---

## 输入模式 B：非规范详细设计文档

当输入是零散 MD/Word/表格详设时，读取 `references/nonstandard-design-input.md` 后执行；若命中 `.wl-skills/docs/spec/`、功能编码、IPO 或流程五要素，立即路由 `spec-doc-parse`，不得读取该 reference。

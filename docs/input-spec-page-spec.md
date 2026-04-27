# page-spec JSON 参考手册 — 页面规格定义完全指南

> **受众**：前端开发者  
> **目的**：理解 page-spec JSON 的完整结构，支持三个场景：  
> 1. 审核 AI（prototype-scan）自动生成的 page-spec 是否正确  
> 2. 手写 page-spec（跳过原型扫描，直接描述页面结构）  
> 3. 在 page-codegen 前做最后一次人工校验

---

## 什么是 page-spec

`page-spec` 是 AI 代码生成链路中的"中间语言"：

```
原型/详设 → prototype-scan → page-spec JSON → page-codegen → 代码
```

- **面向机器**（page-codegen 读取），但**人类可读**
- 一个 JSON 对象 = 一个页面的完整规格说明
- 每个页面的字段顺序、按钮顺序、类型全部固化在这里

---

## 完整字段参考

### 顶层基本信息

```jsonc
{
  "pageName": "客户档案",             // 必填：页面中文名
  "kebabName": "customer-archive",    // 必填：目录名（kebab-case，小写+连字符）
  "pattern": "LIST",                  // 必填：页面交互模式（见下方枚举）
  "path": "views/mmwr/customer/khda/customer-archive/",  // 必填：完整视图路径
  "pagesTs": ["customer-archive", "客户档案"],  // 必填：pages.ts 注册项 [路由名, 中文名]
  "platformComponents": ["BaseQuery", "BaseTable", "jh-pagination"],  // 必填：用到的平台组件
  "newComponents": []                 // 必填：需新建的业务组件（空数组=不需要）
}
```

#### `pattern` 枚举值

| 值 | 含义 | 典型场景 |
|---|---|---|
| `LIST` | 标准列表页（查询 + 工具栏 + 表格） | 90% 的管理列表 |
| `MASTER_DETAIL` | 主从详情（列表 + 侧边/底部详情区） | 有关联详情的数据 |
| `TREE_LIST` | 左树右表（树形导航 + 右侧表格） | 分类/层级管理 |
| `FORM_TAB` | Tab 表单页（多 Tab 分区展示/编辑） | 单条记录的详情页 |
| `COMPOSITE` | 复合型（多种模式组合） | 特殊复杂页面 |

---

### query — 查询条件字段

```jsonc
"query": [
  // 文本输入
  { "field": "customerName", "label": "客户名称", "type": "input" },

  // 字典下拉
  { "field": "customerType", "label": "客户类型", "type": "dict", "dictCode": "customer_type" },

  // 日期范围（必须有 startName 和 endName）
  {
    "field": "createDate",
    "label": "建立日期",
    "type": "dateRange",
    "startName": "createDateStart",
    "endName": "createDateEnd"
  },

  // 单个日期
  { "field": "planDate", "label": "计划日期", "type": "date" },

  // 数字输入
  { "field": "qty", "label": "数量", "type": "number" },

  // 自定义下拉（非字典，选项固定）
  { "field": "category", "label": "分类", "type": "select", "options": [{ "label": "A类", "value": "A" }] },

  // 树形选择（部门/组织）
  { "field": "deptId", "label": "所属部门", "type": "treeSelect" }
]
```

**`type` 枚举**：`input` | `dict` | `date` | `dateRange` | `number` | `select` | `treeSelect`

**注意事项**：
- 顺序严格按原型/详设从左到右、从上到下排列
- `dateRange` 类型的 `startName` / `endName` 是发给后端的实际字段名
- `dict` 类型必须有 `dictCode`（全小写下划线，如 `customer_type`）

---

### toolbar — 工具栏按钮

```jsonc
"toolbar": [
  { "label": "新增", "type": "primary", "action": "openModal" },
  { "label": "批量删除", "type": "danger", "action": "batchDelete" },
  { "label": "导出", "type": "plain", "action": "export" },
  { "label": "导入", "type": "plain", "action": "import" }
]
```

#### `type` 与原型颜色对应

| 原型颜色 | type 值 | 说明 |
|---|---|---|
| 蓝色填充按钮 | `primary` | 主要操作：新增、保存、提交 |
| 线框/白底按钮 | `plain` | 次要操作：导出、导入、刷新 |
| 红色按钮 | `danger` | 危险操作：删除、作废 |
| 灰色/默认 | `default` | 辅助操作 |

#### `action` 枚举

| 值 | 含义 |
|---|---|
| `openModal` | 打开新增弹窗（最常用） |
| `batchDelete` | 批量删除已选行 |
| `export` | 导出当前查询结果 |
| `import` | 导入（打开导入对话框） |
| `refresh` | 手动刷新列表 |
| 自定义字符串 | 如 `submit` / `approve`，在 notes 中描述具体行为 |

---

### columns — 表格列

```jsonc
"columns": [
  // 普通文本列
  { "field": "customerCode", "label": "客户编码", "width": 120 },

  // 字典列（值自动渲染为字典标签）
  { "field": "customerType", "label": "客户类型", "width": 120, "dict": "customer_type" },

  // 可点击列（蓝色链接，点击跳转或打开详情）
  { "field": "customerName", "label": "客户名称", "width": 180, "clickable": true },

  // 日期列
  { "field": "createDate", "label": "建立日期", "width": 120 },

  // 数字列（右对齐）
  { "field": "qty", "label": "数量", "width": 80 }
]
```

**注意事项**：
- 顺序严格按原型表头从左到右排列（不含复选框列和序号列，这两列框架自动添加）
- 可点击列（蓝色链接文字）必须标注 `"clickable": true`，否则会生成为普通文本
- 宽度单位为 px，不确定时可省略（AI/代码模板有默认值）

---

### operations — 操作列按钮

```jsonc
"operations": [
  { "label": "查看", "action": "view" },
  { "label": "编辑", "action": "edit" },
  { "label": "删除", "action": "delete" }
]
```

**顺序**：原型操作列按钮从左到右的顺序，AI 严格遵守。

**常见 action 值**：`view` | `edit` | `delete` | 自定义（在 notes 描述行为）

---

### subTables — 内嵌子表

适用于页面中存在关联子表（如"工单明细"、"产品清单"）的情况：

```jsonc
"subTables": [
  {
    "name": "businessInfo",    // 子表的 camelCase 名
    "label": "业务信息",        // 子表的中文标题
    "editable": true,          // 是否可增删行（有新增/删除按钮）
    "inlineEdit": false,       // 是否行内编辑（单元格可直接编辑）
    "columns": [
      { "field": "salesType", "label": "销售别", "width": 80, "dict": "sales_type" },
      { "field": "remark", "label": "备注", "width": 200 }
    ],
    "operations": [
      { "label": "删除", "action": "removeRow" }
    ]
  }
]
```

#### `editable` / `inlineEdit` 判断规则

| 原型特征 | editable | inlineEdit |
|---|---|---|
| 表格上方有"新增"按钮，行内有"删除"链接 | `true` | `false` |
| 表格单元格可直接编辑（显示输入框/下拉） | `true` | `true` |
| 纯展示，无任何编辑入口 | `false` | `false` |
| 只有"导入"按钮填充数据 | `false` | `false` |

---

### formSections — 表单区块（FORM_TAB 页面 / 弹窗表单）

```jsonc
"formSections": [
  {
    "name": "basicInfo",       // 区块的 camelCase 标识
    "label": "基本信息",        // 区块的中文标题
    "fields": [
      { "field": "customerName", "label": "客户名称", "type": "input", "required": true },
      { "field": "customerType", "label": "客户类型", "type": "dict", "dictCode": "customer_type", "required": true },
      { "field": "remark", "label": "备注", "type": "textarea", "required": false }
    ]
  },
  {
    "name": "statusInfo",
    "label": "状态信息",
    "fields": [
      { "field": "createTime", "label": "创建时间", "type": "text", "required": false, "readonly": true }
    ]
  }
]
```

**字段 `type` 枚举**：`input` | `textarea` | `dict` | `date` | `dateRange` | `number` | `select` | `treeSelect` | `text`（只读展示）

---

### features — 页面特殊交互开关

```jsonc
"features": {
  "tabSwitch": false,        // 是否有 Tab 切换（分类/视图 Tab，如临时/正式客户）
  "tabItems": [],            // Tab 项列表（tabSwitch=true 时必填）
                             // 格式：[{ "label": "临时客户", "value": "temp" }, ...]

  "viewSwitch": false,       // 是否有视角/视图切换（RadioButton，如管理视角/使用视角）
  "viewItems": [],           // 视角列表（viewSwitch=true 时必填）
                             // 格式：[{ "label": "管理视角", "value": "management" }, ...]

  "hiddenMenu": false        // 是否隐藏菜单（从列表跳转进入，不在菜单显示）
}
```

**tabSwitch vs viewSwitch 的区别**：
- `tabSwitch`：Tab 组件（`el-tabs`），切换时整个查询区+表格都变
- `viewSwitch`：RadioButton 组，通常只改变表格列或查询条件（同一批数据的不同展示视角）

**viewSwitch 时的 columns**：  
当 `viewSwitch: true` 时，不同视角的列定义不同，使用 `viewColumns` 字段：

```jsonc
"viewColumns": {
  "management": [
    { "field": "xxx", "label": "管理字段" }
  ],
  "usage": [
    { "field": "yyy", "label": "使用字段" }
  ]
}
```

---

### notes — 补充说明

```jsonc
"notes": [
  "客户分类/客户级别的下拉选项按产品线动态变化（客户类型改变后联动）",
  "点击客户编码跳转到'客户详情'页（隐藏菜单页，path: views/mmwr/customer/detail/）",
  "状态信息区（核实状态、创建人等）为只读展示，无编辑入口",
  "删除需二次确认：'确认删除客户[customerName]吗？'"
]
```

`notes` 用于记录**无法完全结构化**的业务规则，包括：
- 联动逻辑（A 字段改变影响 B 字段的选项）
- 特殊权限控制（某按钮仅特定角色可见）
- 跳转关系（点击某字段跳转到哪个页面）
- 二次确认提示文字
- 弹窗/抽屉的特殊行为

---

## 完整示例

```json
{
  "pageName": "客户档案",
  "kebabName": "customer-archive",
  "pattern": "LIST",
  "path": "views/mmwr/customer/khda/customer-archive/",
  "pagesTs": ["customer-archive", "客户档案"],
  "platformComponents": ["BaseQuery", "BaseTable", "jh-pagination"],
  "newComponents": [],
  "query": [
    { "field": "customerName", "label": "客户名称", "type": "input" },
    { "field": "customerType", "label": "客户类型", "type": "dict", "dictCode": "customer_type" },
    { "field": "enableStatus", "label": "启用状态", "type": "dict", "dictCode": "enable_status" },
    { "field": "createDate", "label": "建立日期", "type": "dateRange", "startName": "createDateStart", "endName": "createDateEnd" }
  ],
  "toolbar": [
    { "label": "新增", "type": "primary", "action": "openModal" },
    { "label": "导出", "type": "plain", "action": "export" }
  ],
  "columns": [
    { "field": "customerCode", "label": "客户编码", "width": 120, "clickable": true },
    { "field": "customerName", "label": "客户名称", "width": 200 },
    { "field": "customerType", "label": "客户类型", "width": 120, "dict": "customer_type" },
    { "field": "enableStatus", "label": "启用状态", "width": 100, "dict": "enable_status" },
    { "field": "createDate", "label": "建立日期", "width": 120 }
  ],
  "operations": [
    { "label": "编辑", "action": "edit" },
    { "label": "删除", "action": "delete" }
  ],
  "subTables": [],
  "formSections": [],
  "features": {
    "tabSwitch": false,
    "tabItems": [],
    "viewSwitch": false,
    "viewItems": [],
    "hiddenMenu": false
  },
  "notes": [
    "客户编码点击后跳转到客户详情页（隐藏菜单页）",
    "删除需二次确认"
  ]
}
```

---

## 自检清单（提交 page-codegen 前）

- [ ] `query` — 字段数量与原型/详设一致，顺序一致
- [ ] `query` — 所有 `dict` 类型都有 `dictCode`（下划线格式）
- [ ] `query` — 所有 `dateRange` 类型都有 `startName` / `endName`
- [ ] `toolbar` — 按钮数量与顺序与原型一致
- [ ] `toolbar` — `type` 值与按钮颜色匹配（蓝=primary，红=danger，白框=plain）
- [ ] `columns` — 字段数量与表头一致，顺序一致（不含复选框/序号列）
- [ ] `columns` — 可点击列标注了 `"clickable": true`
- [ ] `columns` — 字典列标注了 `"dict": "xxx"`
- [ ] `operations` — 操作按钮数量与顺序与原型一致
- [ ] `subTables` — 每个子表的 `editable` / `inlineEdit` 已正确标注
- [ ] `features.tabSwitch` — 若页面有 Tab，`tabItems` 列表已完整填写
- [ ] `features.viewSwitch` — 若页面有视角切换，`viewItems` 和 `viewColumns` 已完整填写
- [ ] `features.hiddenMenu` — 隐藏菜单页面已正确标注 `true`
- [ ] `notes` — 特殊联动/跳转/权限规则已记录

---

## 手写 page-spec 的使用场景

**适合手写（跳过 prototype-scan）的情况**：
- 没有 Axure 原型，也没有详设文档，只有口头/自然语言描述
- 页面结构极简（如只有几个字段的配置页），不值得走完整扫描流程
- 需要修正 AI 扫描结果时，直接编辑 JSON 比重新描述更精确

**手写后直接传给 page-codegen**：

```
用户：以下是 page-spec，请直接生成代码：
{ "pageName": "xxx", ... }
```

page-codegen 接受手写 page-spec 作为直接输入，不需要经过 prototype-scan。

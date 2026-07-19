# page-spec.json 规范（精准实现的"真值锚点"）

> **为什么需要它**：`page-codegen` 的精准约定——查询字段顺序、表格列顺序、按钮顺序与颜色、操作列严格对应原型、按钮文字保真——过去只活在 AI 的对话上下文里，没有机器可比对的真值。
> `page-spec.json` 把这份"原型约定"固化到页面目录，`wl-skills validate`（S1~S5 规则）据此**确定性核对 data.ts 是否按约定实现**，让"生成即精准"可被验证、可被卡控。

---

## 落点

每个由 `prototype-scan` / `spec-doc-parse` / `page-codegen` 产出的页面目录下，写入一份 `page-spec.json`：

```
src/views/[域]/[模块]/[页面]/
├── index.vue
├── data.ts
├── index.scss
├── api.md
└── page-spec.json   ← 原型/说明书约定的结构化真值（单一数据源）
```

> `page-spec.json` 是**约定真值**，data.ts 是**实现**。validate 比对二者，偏差即报。

---

## Schema

```jsonc
{
  "schemaVersion": 1,
  "pageId": "SCREEN_CUSTOMER_ARCHIVE", // 当前项目稳定唯一，design 映射可选
  "page": "客户档案",                  // 必填，页面中文名
  "dir": "src/views/mdata/customer",  // 可选，页面目录（相对项目根）
  "mode": "LIST",                      // 严格模式必填
  "profileId": "jh4j3-openapi3",
  "protocolVersion": "1.0",
  "apiContract": "contracts/customer-archive.json",
  "openQuestions": [],                  // 严格模式必须为空

  // 查询字段：顺序 = 原型从左到右、从上到下
  "query": [
    { "name": "customerCode", "label": "客户编码" },
    { "name": "customerName", "label": "客户名称" }
  ],

  // 表格列：顺序 = 原型表头从左到右（selection/index/_action 可省略，不参与比对）
  "columns": [
    { "name": "customerCode", "label": "客户编码" },
    { "name": "customerName", "label": "客户名称" },
    { "name": "enableStatus", "label": "状态" }
  ],

  // 工具栏按钮：顺序 = 原型从左到右；color 取原型颜色
  "toolbar": [
    { "label": "新增", "color": "primary", "plain": false },
    { "label": "批量删除", "color": "danger", "plain": false },
    { "label": "导出", "color": "default", "plain": true }
  ],

  // 操作列按钮：与原型严格一一对应，禁止自行增减
  "operations": [
    { "label": "编辑" },
    { "label": "删除" }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 比对规则 | 偏差级别 |
|---|---|---|---|---|
| `page` | string | ✅ | — | — |
| `pageId` | string | strict ✅ | 当前项目稳定唯一；可选映射 design screen.id | S0 error |
| `profileId/protocolVersion` | string | strict ✅ | 与 API contract 一致 | S0 error |
| `apiContract` | string | strict ✅ | 指向当前项目契约，不要求上游包 | S0 error |
| `formSections/subTables/features` | array/object | 按页面 | 结构、字段唯一性和子项完整性 | S0 error |
| `openQuestions` | array | strict ✅ | 严格模式必须为空 | S0 error |
| `query[].name` | string | — | 与 `queryDef()` 字段**集合 + 顺序**比对 | S1 warn |
| `columns[].name` | string | — | 与 `columnsDef()` 列**集合 + 顺序**比对（忽略 selection/index/_action） | S2 error |
| `toolbar[].label` | string | — | 与 `toolbarDef()` 按钮**集合 + 顺序**比对 | S3 error |
| `toolbar[].color` | enum | — | 集合一致时逐个核对颜色（primary/danger/warning/success/default） | S3 warn |
| `operations[].label` | string | — | 与 `renderOps([...])` 按钮**集合**比对 | S4 error |

> `color` 合法值：`primary` `danger` `warning` `success` `default`
> 颜色映射见 `page-codegen/SKILL.md` §按钮颜色映射表。

---

## 校验规则（validate S1~S5）

执行 `wl-skills validate src/views/xxx` 时，若页面目录存在 `page-spec.json`，自动追加比对：

| 规则 | 检查 | 级别 | 含义 |
|---|---|---|---|
| S0 | page-spec.json 结构合法性 | error/warn | JSON、完整区块、稳定 ID、profile、契约、未决问题 |
| S1 | 查询字段顺序/集合 | warn | queryDef 与 spec.query 不一致 |
| S2 | 表格列顺序/集合 | **error** | columnsDef 与 spec.columns 不一致（阻断提交）|
| S3 | 工具栏按钮顺序/集合/颜色 | **error**/warn | toolbarDef 与 spec.toolbar 不一致 |
| S4 | 操作列按钮集合 | **error** | renderOps 与 spec.operations 不一致（含"多了原型外按钮"）|

- 无 `page-spec.json` 的页面**静默跳过**，不影响其他检查
- 解析失败报告 S0；严格模式下缺契约元数据或存在未决问题直接阻断
- error 级别在 `--pre-commit` 时阻断提交，形成"生成 → 卡控 → 修复 → 复扫"闭环

---

## 与 Pipeline 的关系

```
prototype-scan / spec-doc-parse
  └─ 产出 page-spec（reports/*_PARSE_*.md 含完整 JSON）
       ↓
page-codegen
  └─ 把 page-spec 写入页面目录 page-spec.json（真值落盘）
  └─ 按 page-spec 生成 data.ts（精准实现）
       ↓
wl-skills validate（S1~S5）
  └─ 比对 page-spec.json vs data.ts → 偏差即报 → 闭环
```

> 这一步让"精准实现"从 **AI 自觉** 升级为 **代码卡控**。

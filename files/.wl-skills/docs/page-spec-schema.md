# page-spec.json 规范（精准实现的"真值锚点"）

> **为什么需要它**：`page-codegen` 的精准约定——查询字段顺序、表格列顺序、按钮顺序与颜色、操作列严格对应原型、按钮文字保真——过去只活在 AI 的对话上下文里，没有机器可比对的真值。
> `page-spec.json` 把这份"原型约定"固化到页面目录，`wl-skills validate`（S1~S6 规则）据此**确定性核对 data.ts 与机器 API 契约是否按约定实现**，让"生成即精准"可被验证、可被卡控。

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
  "features": {
    "contextFields": [
      { "name": "companyId", "source": "server", "operations": ["page", "create", "update"] },
      { "name": "factory", "source": "client", "operations": ["page", "create"] }
    ],
    "listLifecycle": {
      "initialLoad": true,
      "queryTrigger": "manual",
      "queryResetPage": true,
      "saveRefresh": "first",
      "deleteEmptyPageFallback": true
    }
  },
  "validationRules": [
    {
      "kind": "chronology",
      "startField": "startTime",
      "endField": "endTime",
      "allowEqual": true,
      "operations": ["create", "update"],
      "message": "结束时间不能早于开始时间",
      "source": "requirement:customer-validity"
    }
  ],

  // 查询字段：顺序 = 原型从左到右、从上到下
  "query": [
    {
      "name": "customerCode",
      "label": "客户编码",
      "type": "input",
      "constraints": { "maxLength": 64 },
      "constraintSource": "api-contract:models.pageRequest.customerCode"
    },
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
| `*.type=dict` | string | — | 必须同时声明已确认的 `dictCode` | S0 error |
| `*.constraints` | object | — | 仅校验显式长度/格式/数值边界，不做字段名推断 | S0 error |
| `*.constraintSource` | string | strict 条件必填 | 声明 constraints 时必须指向 API/数据库/需求契约 | S0 error |
| `*.contractField` | boolean | 否 | 默认 true；纯展示字段必须显式设 false 才不参加机器契约字段白名单比对 | S6 error |
| `features.fixedQueryFields` | string[] | 条件必填 | 固定工厂/类型等上下文字段；查询、新增、更新必须同时携带 | S0 error |
| `features.contextFields` | object[] | 推荐 | `client` 只进入显式 operations；`server` 必须由鉴权上下文注入且不得出现在请求模型 | S0/S6 error |
| `features.listLifecycle` | object | 列表页推荐 | 首次查询、手动/自动触发、回第一页刷新、删除空页回退的显式契约 | S0 error |
| `validationRules` | object[] | 跨字段边界必填 | chronology 等规则必须与 wl-api-contract 完全一致，禁止前后端各猜一套 | S0/S6 error |
| `features.definitionSource` | string | 集中定义必填 | 共享定义模块的项目相对路径；必须与 `data.ts` 的 `pageDefinition` import 一致 | S0 error |

> `color` 合法值：`primary` `danger` `warning` `success` `default`
> 颜色映射见 `page-codegen/SKILL.md` §按钮颜色映射表。

---

## 校验规则（validate S1~S6）

执行 `wl-skills validate src/views/xxx` 时，若页面目录存在 `page-spec.json`，自动追加比对：

| 规则 | 检查 | 级别 | 含义 |
|---|---|---|---|
| S0 | page-spec.json 结构合法性 | error/warn | JSON、完整区块、稳定 ID、profile、契约、未决问题 |
| S1 | 查询字段顺序/集合 | warn | queryDef 与 spec.query 不一致 |
| S2 | 表格列顺序/集合 | **error** | columnsDef 与 spec.columns 不一致（阻断提交）|
| S3 | 工具栏按钮顺序/集合/颜色/填充形态 | **error**/warn | toolbarDef 与 spec.toolbar 不一致 |

创建类主按钮（新增/新建/添加/创建）必须固定为
`{ "color": "primary", "plain": false }`。S3 同时比较颜色与 `plain`，
不得用 `primary + plain: true` 伪装成已满足主色要求。
| S4 | 操作列按钮集合 | **error** | renderOps 与 spec.operations 不一致（含"多了原型外按钮"）|
| S5 | 按钮和字段 label 文字保真 | warn | 规格与代码文字不一致 |
| S6 | page-spec 与机器 API 契约对齐 | **error** | 阻断字段多传/漏传、显式 required/constraints 漂移、client/server 上下文方向错误、chronology 规则漂移及多资源绑定不唯一；未声明边界不按字段名猜测 |

- 无 `page-spec.json` 的页面**静默跳过**，不影响其他检查
- 解析失败报告 S0；严格模式下缺契约元数据或存在未决问题直接阻断
- `features.definitionSource` 明确声明共享定义源时，校验器确认
  `data.ts import/export pageDefinition` 委托链，不再误套旧式
  `queryDef/columnsDef` 解析器；建议在 `.wl-skills-validate.json`
  的 `definitionValidators` 为该来源绑定项目语义校验脚本，闭合真实字段、按钮和接口验证
- S6 仅在 `apiContract` 文件或 `api.md` 中存在 `wl-api-contract` 机器契约时执行；字段名只做
  snake_case/camelCase 规范化，不根据中文标签猜测。纯展示字段用 `contractField:false` 精确豁免。
- error 级别在 `--pre-commit` 时阻断提交，形成"生成 → 卡控 → 修复 → 复扫"闭环

### constraints 支持项

| 类型 | 支持字段 |
|---|---|
| 字符串 | `minLength`、`maxLength`、`pattern` |
| 数值 | `minimum`、`maximum`、`minExclusive`、`maxExclusive`、`step`、`totalDigits`、`fractionDigits` |

约束只在契约显式声明时检查。不得按“编码通常 64 位”“状态通常 2 位”等经验
自动补值；未确认的边界应进入 `openQuestions`。

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
wl-skills validate（S1~S6）
  └─ 比对 page-spec.json vs data.ts → 偏差即报 → 闭环
```

> 这一步让"精准实现"从 **AI 自觉** 升级为 **代码卡控**。

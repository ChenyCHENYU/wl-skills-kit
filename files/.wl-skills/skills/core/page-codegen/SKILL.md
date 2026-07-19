---
name: page-codegen
description: "Use when: generating complete Vue 3 page code (index.vue + data.ts + modal components + api.md + pages.ts registration) from a prototype page inventory and API contract, strictly following the cx-ui-produce project conventions. Read SKILL.md first (rules+constraints), then read the matching TPL-*.md for the template code. Triggers on: generate page, create page, code generation, 生成页面, 页面代码, 代码生成, vue页面, 帮我生成, natural language page generation. NOTE: 口述需求/建个页面/写个页面/按原型生成 belong to prototype-scan first (page-codegen chains from it via 模式 0)."
---

# Skill: 页面代码生成（page-codegen）

基于《页面清单》+ 原型信息，生成符合项目规范的完整 Vue 3 页面代码。

---

## Pre-flight 规范声明（执行前必须输出）

```
🚀 已触发技能 page-codegen/SKILL.md          → 页面代码生成：骨架文件 + 模板调度 + 前置检查
✅ 已读取 templates/_index.md                → 模板注册表，匹配 → {TPL路径}
✅ 已读取 templates/{universal|domains/xxx}/TPL-XXX.md → {当前模板说明}
✅ 已读取 standards/index.md                 → 规范门控（任务类型 A：生成新页面）
✅ 已读取 standards/02-code-structure.md     → 三文件分离+接口契约 + 三段式 + script 9段顺序
✅ 已读取 standards/12-base-table.md         → AGGrid必用 + cid命名规范
✅ 已读取 standards/13-platform-components.md → 平台组件对照表 + docs前置读取清单
✅ 已读取 standards/14-layout-containers.md   → 布局容器（必须用 jh-drag-row/jh-drag-col）
✅ 已读取 .wl-skills/docs/{涉及的jh-*文档}              → 当前页涉及组件的使用规范
✅ 工具链检测：.prettierrc.js ✓  eslint.config.ts ✓  .husky/ ✓  [全部就绪]
✅ cid 已生成：{value}（{首字母缩写说明}）
```

**工具链失败时（红叉 + 暂停）**：

```
❌ 工具链检测失败：未找到 .prettierrc.js / eslint.config.ts / .husky/
   → 请执行：npx @robot-admin/git-standards init
   → 或联系 CHENY（工号 409322）解决
   → ⛔ 代码生成已暂停，修复后重新触发
```

**生成完成摘要（生成结束后输出）**：

```
📦 本次生成完成
────────────────────────────────────────────────
✅ src/views/.../{页面}/index.vue
✅ src/views/.../{页面}/data.ts
✅ src/views/.../{页面}/index.scss
✅ src/views/.../{页面}/api.md
✅ src/views/.../{页面}/page-spec.json  → 约定真值（供 S1~S5 比对）
✅ src/views/{域}/{模块}/dicts.ts       → 模块字典发布真值（页面有字典时）
✅ reports/SYS_MENU_INFO.md  → 已追加菜单条目
────────────────────────────────────────────────
🔍 强制自检（不可跳过）：
   wl-skills validate src/views/{生成的页面目录}
   → 同时执行 R1~R14（AST 语义）+ S1~S5（page-spec 比对）
   → 结果：{0 error / N warn} 或列出 error 待修复
────────────────────────────────────────────────
📌 后续步骤：
   1. 在 router/pages.ts 注册路由
   2. 若本页 hiddenMenu=true → 在 src/util/navigate-hidden.ts 的 HIDDEN_ROUTE_MAP 追加一行
   3. 提交：git cz（禁止直接 git commit，pre-commit 会自动检测规范）
────────────────────────────────────────────────
```

### 生成后强制自检（不可跳过，不可标记为"可选"）

> **v2.10.0+ 硬约束**：生成页面代码后，AI **必须**立即执行规范自检，不可跳过。

1. **调用 MCP 工具** `wls_validate_page`，path 参数为**本次生成的页面目录**（精确到具体页面，不传 src/views 全局）
2. 如有 **error**：
   - 仅修复**本次生成的文件**中的 error（index.vue / data.ts / index.scss / api.md）
   - 如 error 来自同目录下的**旧文件**（非本次生成），不要修改，在摘要中标注"已跳过 N 个旧文件 error"
   - 修复后重新自检直到本次生成的文件 0 error
3. 如有 **warn** → 尝试修复，确实无法修复的在摘要中说明原因
4. 自检结果（error 数 / warn 数 / 跳过的旧文件数）写入上方"生成完成摘要"
5. 自检范围为本次生成的**单个页面目录**，不对无关页面负责

> 这条规则确保 AI 不会"写完就跑"——生成和验证形成闭环。
> **作用域隔离原则**：AI 只对自己本次生成的文件负责，不强制修复历史遗留偏差。
> git commit 时 pre-commit hook 会再次拦截，但 AI 应在生成阶段就消除本次生成的 error。

---

## 前置检查

```
□ 页面中文名：
□ 交互模式：LIST / MASTER_DETAIL / TREE_LIST / DETAIL_TABS / FORM_ROUTE / CHANGE_HISTORY / RECORD_FORM / OPERATION_STATION / TEMPLATE_DRIVEN
□ page-spec JSON：（必须存在，由 prototype-scan 输出）
□ 文件路径：src/views/[域]/[模块]/[子模块]/[kebab-case-目录名]/
□ pages.ts 注册名：["kebab-目录名", "中文名"]
□ 服务缩写：[pm / mmwr / sale / ...]
□ 资源名(CamelCase)：
```

> **重要**：查询字段、表格列、按钮列表不再手动罗列，直接从 page-spec JSON 中读取。
> 如果没有 page-spec JSON，必须先执行 prototype-scan Skill 生成。
>
> **模式 0 快捷路径**：当用户直接口述需求（如"帮我生成一个客户管理页面"）而未提供 page-spec JSON 时，AI 内部自动调用 prototype-scan 模式 0 构建 page-spec JSON，然后继续执行代码生成，无需用户提供任何文件。

---

## 生成产物（标准页面文件）

```
src/views/[域]/[模块]/[子模块]/[kebab-case-目录名]/
├── index.vue       ← 页面入口（纯模板 + 解构）
├── data.ts         ← 业务逻辑（AbstractPageQueryHook 类 / 直接导出 ref+函数）
├── index.scss      ← 页面样式
├── api.md          ← 接口约定（按 api-contract Skill 模板生成）
└── page-spec.json  ← ★ 原型约定真值（查询/列/按钮/操作列 顺序+颜色），供 validate S1~S5 确定性比对
```

页面使用字典时，在模块根目录额外维护 `dicts.ts`：

```text
src/views/[域]/[模块]/dicts.ts
```

先在页面 `api.md` 写完整 `dict-contract`，再合并到 `dicts.ts`；读取 `.wl-skills/docs/dictionary-contract.md`。不得仅在 `data.ts` 写 `logicValue` 而缺少字典定义。

> **page-spec.json 是"精准实现"的真值锚点**：把 page-spec（查询字段顺序、列顺序、按钮顺序与颜色、操作列）固化到页面目录，`wl-skills validate` 据此比对 data.ts 实际实现，偏差即报（详见 `.wl-skills/docs/page-spec-schema.md`）。**不可省略**——没有它，"按约定实现"无法被验证，只能靠 AI 自觉。

弹窗组件处理策略：

- **通用弹窗**（新增/编辑表单，2+ 页面可复用）→ 提取到 `.wl-skills/src/components/local/c_xxxModal/`
- **极个性弹窗**（仅单页面使用，c_modal 无法满足）→ 放在页面 `components/xxxModal.vue`

附加输出：

- `pages.ts` 注册片段
- **`reports/SYS_MENU_INFO.md`** — 集中式菜单配置，**追加写入**（见下方 §SYS_MENU_INFO 生成规则）
- `mock/[业务域]/[模块].ts`（项目根目录 `mock/` 下按域分目录，`vite-plugin-mock` 自动加载，与 api.md 的 URL 和字段完全一致；详见 `.wl-skills/docs/mock-architecture.md`）

---

## 约束（严格遵守）

### 必须

1. data.ts 使用 `class extends AbstractPageQueryHook`，通过 `queryDef()` / `toolbarDef()` / `columnsDef()` 配置。**仅适用于 LIST / MASTER_DETAIL / TREE_LIST 三种列表型页面**。其余模板不用此基类：DETAIL_TABS（直接导出 reactive+ref）、FORM_ROUTE（useXxx composable）、CHANGE_HISTORY（composable+mock）、RECORD_FORM（直接 ref+函数）、OPERATION_STATION（多个 createXxxPage）、TEMPLATE_DRIVEN（仅 config 对象）
2. index.vue 只有模板 + `createPage()` 解构 + `onMounted`，不写业务逻辑。**例外**：DETAIL_TABS / FORM_ROUTE / CHANGE_HISTORY 的 index.vue 可包含表单状态管理；OPERATION_STATION 包含 computed/watch/多列表协调逻辑
3. 最外层 class：`app-container app-page-container`
4. 样式用 `@import "./index.scss"`
5. API 用 `getAction` / `postAction` from `@jhlc/common-core/src/api/action`
6. 字典字段用 `logicType: BusLogicDataType.dict, logicValue: "dictCode"`
7. 同时生成 api.md（基于 api-contract Skill 模板）；有字典时写 dict-contract 并更新模块 dicts.ts
8. 提供 pages.ts 注册片段
9. 同时在 `mock/[业务域]/` 目录下生成对应的 mock 文件（`MockMethod[]` + mockjs，URL 和字段与 api.md 一致，URL 必须带 `/dev-api` 前缀）。业务域取 `src/views/` 下第一级目录名（如 `sale`、`mdata`）。mock 文件必须 `import { paginate, ok, pick, nowStr } from "../_utils"` 复用共享工具，不可自行重复定义
10. **查询字段顺序**：`queryDef()` 中字段顺序必须与 page-spec `query` 数组顺序严格一致（即原型从左到右、从上到下）
11. **表格列顺序**：`columnsDef()` 中列顺序必须与 page-spec `columns` 数组顺序严格一致（`selection` + `index` 在最前，其余按原型表头从左到右）
12. **按钮顺序与颜色**：`toolbarDef()` 中按钮顺序和 `name`（颜色）必须与 page-spec `toolbar` 数组严格一致（`primary`=蓝底, `danger`=红色, `warning`=橙色, `default`=灰色; `plain: true`=线框）。**"新增"类按钮永远排第一**（如"新增"、"新增申请"），这是产品通用规范
13. **操作列按钮**：`columnsDef()` 操作列的 `operations` 数组必须与 page-spec `operations` 数组**严格一一对应**，不可遗漏也**不可自行添加**（如原型没有"查看"按钮就不能加"查看"）
14. **Tab 标签**：当 page-spec `features.tabSwitch === true` 时，必须在 index.vue 中生成 Tab 组件，tabs 与 `features.tabItems` 一一对应
15. **按钮文字保真**：使用原型中的原始文字（如"新增申请"不可简化为"新增"，"变更申请"不可简化为"变更"）
16. **可点击列（蓝色链接列）**：原型中蓝色凸显的列（如客户编码、申请编码等编码/编号类字段）必须实现为可点击链接，使用 `defaultSlot` + `h()` 渲染蓝色链接样式，点击后查看详情（调 `getById` 后展示或路由跳转）
17. **按钮颜色映射**：按钮的 `type` 属性决定颜色，须根据原型按钮颜色或按钮语义映射（见下方 §按钮颜色映射表）
18. **按钮必须可交互**：所有按钮的 `onClick` 必须有真实处理逻辑，禁止空函数 `() => {}`。通用交互实现见下方 §按钮交互实现规则
19. **未知交互阻断**：原型/需求未提供交互细节且无法由已确认契约确定时，写入 `openQuestions` 并停止生成该操作；禁止用提示消息伪装已实现功能
20. **生成后依赖自检**：代码生成完成后，检查 `package.json` 是否已安装生成代码所需的依赖（`mockjs`、`vite-plugin-mock`、`lodash-es`、`xlsx` 等），若缺失则提示用户执行安装命令。同时检查 `vite.config.ts` 是否已注册 `viteMockServe`、`mock/_utils.ts` 是否存在（若不存在则从 kit 种子文件补充）
21. **Contract First，Mock 可选**：先通过 `wl-api-contract` 建立真实 method/path/request/response。需求明确需要前端并行开发时再生成 `mock/[业务域]/[模块].ts`；mock 必须复用同一契约，关闭后不得修改业务 URL。
22. **Mock URL 必须匹配真实请求**：`API_CONFIG` 保持真实接口路径（如 `/mdata/mdataModel/queryPage`），mock 文件端点必须带 Vite 代理前缀（如 `/dev-api/mdata/mdataModel/queryPage`），这样关闭 mock 后无需修改业务代码。
23. **页面初始数据必须由 mock 提供**：列表页 `onMounted(() => select())` 后必须能显示模拟数据，不允许生成空白页等待后端接口；`list` 端点返回 `{ code: 2000, data: { records, total, size, current } }`。
24. **必须使用 wl-skills-ui runtime 风格**：当项目安装了 `@agile-team/wl-skills-ui` 时，列表列定义必须使用 `defineColumns()`，操作列必须使用 `renderOps()`，状态/字典列优先使用 runtime 渲染器或 `logicType=dict` 自动映射；不可退回默认纯文本/空函数风格。
25. **wl-skills-ui 接入自检**：生成页面前检查项目是否已接入 `@agile-team/wl-skills-ui` 样式与 runtime。若未接入，先提示并补齐：`@use '@agile-team/wl-skills-ui/styles' as *;`、`installCommonPreset()`、必要的 design tokens 引入；否则页面风格不会自动生效。
26. **pages.ts 分组注册**：多页面模块必须按当前业务目录分组写入 `vite/plugins/shared/pages.ts`，使用 `gProd(module, { subModule: [[page, label]] })` 结构，不允许把所有页面扁平追加到一个数组。
27. **BaseTable 强制 AGGrid**：所有业务主列表/台账/主从表/树表/详情子表的 `BaseTable` 必须显式写 `render-type="agGrid"`，并绑定全局唯一 `cid`。弹窗小表格可豁免，但必须在生成摘要中说明理由。
28. **cid 必须可追踪**：每个页面导出 `TABLE_CID = "{pageAbbr}-{base36Timestamp}"`；多表页面使用 `BOTTOM_TABLE_CID` / `ITEM_TABLE_CID`，列级 `cid` 必须使用 `${TABLE_CID}-fieldName` 前缀。
29. **skills-ui 只能融合，不可生搬硬套**：不得照搬 `wl-skills-ui/templates/list-page` 中的原生 `el-form/usePageHook/el-pagination` 通用写法；本项目必须保留 `AbstractPageQueryHook + BaseQuery + BaseToolbar + BaseTable + jh-pagination` 平台骨架，只融合 `defineColumns/renderOps/tokens/preset`。
30. **必须落盘 page-spec.json**：生成页面时，把 page-spec（`page` 中文名 + `query` + `columns` + `toolbar` + `operations`）按 `.wl-skills/docs/page-spec-schema.md` 写入页面目录的 `page-spec.json`。字段 `name`/`label`/顺序必须与 data.ts 生成内容、与原型严格一致——这是 `validate` 做 S1~S5 比对的真值。生成后自检若出现 S2/S3/S4 error，说明 data.ts 与 spec 不一致，必须修正到 0 error。
31. **字典契约闭环**：页面出现 `logicType: BusLogicDataType.dict` 时，api.md 必须包含完整 dict-contract，模块 dicts.ts 必须汇总该定义；`wl-skills validate` D1 未通过时禁止建议 dict-sync。

### 禁止事项（严格遵守）

1. **❌ 禁止手写弹窗**：不可在页面 `components/` 下用 `el-dialog` + `el-form` + `el-row/col` 手写弹窗。必须使用 `c_formModal`（`.wl-skills/src/components/local/c_formModal/`），通过 `modalConfig` 配置驱动。**例外**：纯只读详情弹窗（`jh-dialog` + `BaseForm :disabled="true"`）可不用 `c_formModal`，如工艺参数查看（参考 mmwr-process-parameters）
2. **❌ 禁止在弹窗中使用原生 Element Plus 组件**：不可使用 `el-select`、`el-input`、`el-date-picker` 等原生组件，必须使用 `jh-select`、`jh-date`、`jh-user-picker` 等平台组件（通过 `BaseFormItemDesc` 的 `component` 属性配置）
3. **❌ 禁止在 BaseToolbar 内使用 slot**：`BaseToolbar` 组件**不支持任何 slot**（源码中无 `<slot>` 标签），放入的内容会被丢弃不渲染。Tab/视角切换等额外 UI 必须放在 BaseToolbar **外部**
4. **❌ 禁止用 el-radio-group 做 Tab/视角切换**：所有 Tab 式切换（视角切换、数据过滤 Tab、功能 Tab）**必须使用 `el-tabs`**（参考 `mmwr-steel-stripping-operations`）。不可用 `el-radio-group` + 手动 `handleViewChange` / `handleTabChange`
5. **❌ 禁止 Mock 端点只返回成功不修改数据**：mock 文件中每个端点的 `response` 必须实际修改 `dataPool`（splice/assign/修改字段），否则 `this.select()` 刷新后数据不变。详见 §Mock 端点最佳实践
6. **❌ 禁止遗留未使用的 import**：data.ts 中不要导入未使用的模块（如仅用 `postAction` 时不导入 `getAction`）
7. **❌ 禁止操作列自编按钮**：操作列的 `operations` 数组必须与原型操作列按钮**严格一致**，不可凭空添加原型中不存在的按钮（如原型只有"编辑"+"删除"，不可自行加"查看"）
8. **❌ 状态类列必须 `fixed: "right"` + 色块渲染**：启用状态、停用时间、转化状态、客户状态、审批状态、核实状态等靠近操作列的状态类列必须设置 `fixed: "right"`，与操作列一起固定在表格右侧。**且状态列必须用 `defaultSlot` + `h(ElTag)` 渲染彩色标签**，不可纯文本显示（详见 §状态列色块渲染模式）
9. **❌ 禁止操作按钮标签自编**：操作列按钮 `label` 必须与原型严格一致（如原型写"修改"不可改成"编辑"，写"作废"不可改成"删除"），且 onClick 逻辑必须匹配语义（"作废"调 cancel API，不是 remove）
10. **❌ 禁止平台组件遗漏 `label=""`**：在 el-form-item 内使用 `jh-select`、`jh-date`、`jh-file-upload` 时，**必须传 `label=""`** 隐藏组件自身标签（否则会渲染"下拉选择框："、"日期："等多余文字）
11. **❌ 禁止表单控件宽度不统一**：`jh-select`、`jh-date`、`el-input-number`、`jh-file-upload` 默认宽度可能与 `el-input` 不一致，必须在 scoped style 中用 `:deep()` 统一设为 `width: 100%`（详见 §表单页 UI 细节规范）
12. **❌ 禁止表单页无滚动**：独立路由表单页内容超出视口时必须可滚动，`.app-page-container` 须设 `overflow-y: auto`（**不要加 `height: 100%`，全局已有 `height: calc(100vh - 100px)`，叠加会导致双滚动条**）
13. **❌ 禁止内联 style 散落**：所有页面/组件样式统一写在 `index.scss` 中（便于复用和移动），不可在 template 中大量使用内联 `style="..."`
14. **❌ 禁止生成无 mock 的页面**：只写 `API_CONFIG` 但不写 `mock/[业务域]/*.ts` 属于生成失败。mock 文件必须按域分目录、import `_utils` 共享工具（详见 `.wl-skills/docs/mock-architecture.md`）。
15. **❌ 禁止生成空或占位 onClick**：`onClick: () => {}` 和仅提示“待确认”的处理都属于生成失败；未知逻辑必须阻断并进入 openQuestions。
16. **❌ 禁止忽略 wl-skills-ui**：项目已安装 `@agile-team/wl-skills-ui` 时，不使用 `defineColumns/renderOps` 属于生成失败。
17. **❌ 禁止 BaseTable 非 AGGrid**：业务列表中 `<BaseTable>` 未写 `render-type="agGrid"` 或缺少 `cid/:cid` 属于生成失败。
18. **❌ 禁止列缺 cid**：AGGrid 表格的数据列/操作列缺少列级 `cid` 属于生成失败。

### 场景化实现规则（按需读取）

| 命中场景 | 必读 reference |
| --- | --- |
| CRUD 弹窗、蓝色链接列或 FORM_ROUTE 隐藏路由 | `references/modal-and-navigation.md` |
| 按钮交互、条件操作列、状态标签或视角/Tab | `references/table-interactions.md` |
| Excel 导入导出或 Mock 写操作 | `references/import-export-and-mock.md` |
| FORM_TAB / FORM_ROUTE / 独立路由表单页 | `references/form-ui.md` |
| 写入 `pages.ts` 或 `SYS_MENU_INFO.md` 前 | `references/registration-and-menu.md` |

只读取本次页面命中的 reference；模板代码仍按下方模板索引读取一个匹配文件。


### 禁止

> 以下为精简速查清单，详细说明见上方 §禁止事项（严格遵守）。

- ❌ index.vue 中写业务逻辑（逻辑全在 data.ts）
- ❌ 使用 Vuex（用 Pinia）
- ❌ `::v-deep` / `/deep/`（用 `:deep()`）
- ❌ 直接用 axios（用 getAction/postAction）
- ❌ 手写查询表单/工具栏/分页（用 BaseQuery/BaseToolbar/jh-pagination）
- ❌ 使用 `useTableDelete`（用 `this.remove(row.id)`）
- ❌ 用 `{ ...instance }` 展开 `create()` 返回值
- ❌ Mock 端点不修改 dataPool、字段名不对齐 columnsDef
- ❌ data.ts 导入未使用的模块
- ❌ 用 `el-radio-group` 做 Tab/视角切换（统一用 `el-tabs`）

---

## 表单页 UI 路由

FORM_TAB、FORM_ROUTE 或独立路由表单页必须读取 `references/form-ui.md`；列表页不加载。

## api.md 生成时序

> **api.md 在页面代码之前生成**（Step 2: api-contract → Step 3: page-codegen）。
> page-codegen 读取已生成的 api.md 中的 URL 和字段定义，确保 `API_CONFIG`、mock、data.ts 与接口约定一致。
> 未来使用真实 API 设计文档时，api.md 由后端提供或 api-contract Skill 从设计文档提取，page-codegen 直接消费。
> 页面含字典时，在生成 data.ts 前先完成 `api.md dict-contract → 模块 dicts.ts` 合并，生成结束后由 validate D1 复核。

---

## 页面注册与菜单报告

生成 `pages.ts` 注册片段和追加 `reports/SYS_MENU_INFO.md` 前，必须读取 `references/registration-and-menu.md`，确保 component 路径、菜单层级和追加策略一致。

## 代码模板索引

> 各模板完整代码见对应独立文件，按需读取。主文件（SKILL.md）包含前置检查、约束、按钮规则、Mock规范等所有共用规则。

| 交互模式 | 文件 | 适用场景 | 典型参考页面 |
|---|---|---|---|
| LIST | templates/universal/TPL-LIST.md | 标准查询+工具栏+表格+分页 | mmwr-customer-archive |
| MASTER_DETAIL | templates/universal/TPL-MASTER-DETAIL.md | jh-drag-row 主从表，双击联动 | ompt-ht-plan-order |
| TREE_LIST | templates/universal/TPL-TREE-LIST.md | 左侧 C_Tree + 右侧列表 | — |
| DETAIL_TABS | templates/universal/TPL-DETAIL-TABS.md | jh-drag-row 上Tab表单+下子表 | add-demo / domestic-trade-order |
| FORM_ROUTE | templates/universal/TPL-FORM-ROUTE.md | 复杂表单独立路由（非弹窗） | mmwr-customer-apply-add-form |
| CHANGE_HISTORY | templates/universal/TPL-CHANGE-HISTORY.md | 左历史时间线+右变更详情 | mmwr-customer-apply-change-history |
| RECORD_FORM | templates/universal/TPL-RECORD-FORM.md | BaseQuery选主记录+Form+Table无分页 | mmsm-convert-progress |
| OPERATION_STATION | templates/domains/produce/TPL-OPERATION-STATION.md | 工序站点操作（待处理↔已处理+操作表单） | mmwr-rolling-management |

> **配置驱动模板页**（ResultQueryTemplate / FinishingAchievementTemplate 等）：见 templates/universal/TPL-DRIVEN.md，仅需生成 config 对象，不套用以上模板。
> **领域模板查询**：完整路径以 `templates/_index.md` 注册表为准，新增领域模板见 `templates/domains/_CONTRIBUTING.md`。

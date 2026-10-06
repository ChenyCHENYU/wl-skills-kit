---
name: page-codegen
description: "Use when: generating complete Vue 3 page code (index.vue + data.ts + modal components + api.md + pages.ts registration) from a prototype page inventory and API contract, following the current project component and API contracts. Read SKILL.md first (rules+constraints), then read the matching TPL-*.md for the template code. Triggers on: generate page, create page, code generation, 生成页面, 页面代码, 代码生成, vue页面, 帮我生成, natural language page generation. NOTE: 口述需求/建个页面/写个页面/按原型生成 belong to prototype-scan first (page-codegen chains from it via 模式 0)."
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
✅ 已读取 standards/02-code-structure.md     → 三文件分离、扁平业务与接口契约
✅ 已读取 standards/12-base-table.md         → 优先复用 BaseTable、稳定 CID 与兼容规则
✅ 已读取 standards/13-platform-components.md → 平台组件对照表 + docs前置读取清单
✅ 已读取 standards/14-layout-containers.md   → 布局容器（必须用 jh-drag-row/jh-drag-col）
✅ 已读取 standards/11-form-validation.md     → 表单校验库 + 契约边界（页面含表单时）
✅ 已读取 .wl-skills/docs/{涉及的jh-*文档}              → 当前页涉及组件的使用规范
✅ 已读取 references/component-materialization.md（使用标准业务组件时）→ 按需落盘与契约防护
✅ 已读取 references/form-validation-library.md（页面含表单时）→ Element/RuleSpec API 选择
✅ 工具链检测：.prettierrc.js ✓  eslint.config.ts ✓  .husky/ ✓  [全部就绪]
✅ 表单校验库：@robot-admin/form-validate {版本/不适用}
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
✅ src/views/.../{页面}/page-spec.json  → 从真实实现提取的领域镜像（按需留存）
✅ src/views/{域}/{模块}/dicts.ts       → 模块字典发布真值（页面有字典时）
✅ src/components/{local|global}/{组件}/ → 本页需要且原项目缺失时按需落盘
✅ reports/SYS_MENU_INFO.md  → 已追加菜单条目
────────────────────────────────────────────────
🔍 强制自检（不可跳过）：
   wl-skills validate src/views/{生成的页面目录}
   → 同时执行 K1~K20（AST 语义）+ S1~S6（page-spec/机器契约比对）+ C1~C4（组件契约）
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
□ 需求与已确认接口：可来自原型、文档、口述、已有实现或显式生成输入；不强制先写 JSON
□ 文件路径：src/views/[域]/[模块]/[子模块]/[kebab-case-目录名]/
□ pages.ts 注册名：["kebab-目录名", "中文名"]
□ 服务缩写：[pm / mmwr / sale / ...]
□ 资源名(CamelCase)：
```

> 新建页面先确认需求与接口，直接实现业务三文件，再验证与提取镜像。已有页面的事实来自实际代码，不能用过期 JSON 覆盖。
> 用户明确提供需求规格 JSON 时可以消费其确认内容；现有或显式选择的 scenario 项目继续原往返链。不得自动把普通业务页改为 JSON 编译产物。

---

## 生成产物（标准页面文件）

### 编写范式与必要注释

先读取 `standards/02-code-structure.md`、`standards/03-comments.md` 和实际宿主组件
契约。优先使用平台已有组件；简单独立表单参考 FORM_ROUTE 的完整 BaseForm 示例，
只有特殊业务区域才用 slot/componentVNode。Vue 版本兼容和通用校验适配集中到项目
composables，一次落盘后直接复用，不为每个页面创建嫁接函数。

主动给页面/共享入口、关键动作、联动覆盖条件、非直观校验、兼容处理补中文注释。
只解释职责、来源和边界，不机械复述赋值。生成后检查这些注释与实现相符，并检查
是否复制了已有组件/组合函数的逻辑；风格差异只建议，实际错误及废弃代码才阻断。

```
src/views/[域]/[模块]/[子模块]/[kebab-case-目录名]/
├── index.vue       ← 页面入口（模板 + 页面对象绑定，兼容解构）
├── data.ts         ← 字段与业务函数（优先组合函数，兼容已有类）
├── index.scss      ← 页面样式
├── api.md          ← 接口约定（按 api-contract Skill 模板生成）
└── page-spec.json  ← 可选的领域知识镜像，从实际实现提取，不参与页面运行
```

页面使用字典时，在模块根目录额外维护 `dicts.ts`：

```text
src/views/[域]/[模块]/dicts.ts
```

先在页面 `api.md` 写完整 `dict-contract`，再合并到 `dicts.ts`；读取 `.wl-skills/docs/dictionary-contract.md`。不得仅在 `data.ts` 写 `logicValue` 而缺少字典定义。

> **普通业务页面以实际实现为准**：`data.ts` 保存字段与业务逻辑，`index.vue` 和 `index.scss` 保存实际交互与样式；按需提取 `role: "mirror"` 的 page-spec.json，作为未来领域模板库的知识材料。镜像缺失或过期不阻断业务校验，只有显式镜像检查才验证镜像是否完整、最新。用户明确选择旧需求规格或 scenario 往返链时，继续按其规则比对，不能把旧规则套到知识镜像上。详见 `.wl-skills/docs/page-spec-schema.md`。

弹窗组件处理策略：

- **kit 标准组件** → 按 `references/component-materialization.md` 预览并按需落盘到 `src/components/local/`；`.wl-skills` 仅为模板源
- **项目通用弹窗**（新增/编辑表单，2+ 页面复用）→ 提取到 `src/components/local/c_xxxModal/`
- **极个性弹窗**（仅单页面使用，c_modal 无法满足）→ 放在页面 `components/xxxModal.vue`

附加输出：

- `pages.ts` 注册片段
- **`reports/SYS_MENU_INFO.md`** — 集中式菜单配置，**追加写入**（见下方 §SYS_MENU_INFO 生成规则）
- `mock/[业务域]/[模块].ts`（仅当 `.wl-skills-validate.json.mockPolicy` 为 `required`，或 `optional` 且需求明确需要 mock 时生成；`disabled` 时禁止生成。详见 `.wl-skills/docs/mock-architecture.md`）

## wl-skills-ui 生成闭环契约

生成代码应直接遵守 `@agile-team/wl-skills-ui` 的控件几何和列表布局契约，避免让业务页再用 CSS 补救：

- 所有直接生成的 `el-input`、`el-input-number`、`jh-select`、`jh-date` 等输入控件显式使用 `size="small"`（或等价的 `size` 配置），保留标准 `placeholder`；不得在页面样式中把 `.el-input__inner`、`.el-input__wrapper` 的 `padding` 清零。展示值、只读值与 placeholder 必须复用同一控件结构和间距。
- 数字输入框只声明业务语义（`controls`、`textAlign` 等）；不得在页面中隐藏步进按钮、重写箭头的绝对定位或高度。UI 包统一负责右侧上下箭头的几何。
- 复杂表单控件在表单列中统一 `width: 100%`，避免选择器、日期、数字框宽度漂移。
- 列表分页必须位于表格之后的独立 `.list-page__pager` 容器，并右对齐；不要把分页器塞进表格或工具栏布局。
- 操作列必须 `fixed: "right"`、`align: "center"`，使用 `renderOps` 图标语义；宽度按同时可见按钮最大数量确定（2 个约 140px，3 个约 200px），查看/编辑/删除不得生成裸文字按钮。
- 状态/字典列必须使用 `logicType: BusLogicDataType.dict` 或 runtime Tag 渲染，不生成无语义的纯文本状态列。

生成完成后的页面自检除既有 K1~K20/S1~S6/C1~C4 外，还必须确认：分页器容器和位置、操作列固定/对齐/宽度、状态 Tag、输入控件 `size`/placeholder/间距，以及数字框未被业务 CSS 改写。

---

## 约束（严格遵守）

以下 page-spec 字段对应规则仅作用于已确认的需求规格输入或旧 scenario 项目，不能作用于领域镜像；普通页面直接实现并验证代码。


### 必须

1. data.ts 推荐字段数组 + `useXxx()` / `createPage()` 平铺函数。普通新列表参考 TPL-LIST 和 `templates/composables/usePageQuery.ts`；需要表格列扩展才使用 `useBaseTable.ts`。公共组合函数按需落到 `src/composables` 并被后续页面直接导入，单页业务不进入公共层。已有 `AbstractPageQueryHook`、原生字段定义和显式 scenario 管理的页面兼容，不强制改成统一架构。
2. index.vue 以模板、页面函数调用、视图绑定和生命周期为主，不写业务逻辑。成员较多时，data.ts 用 `proxyRefs` 直接声明公开状态和事件，最后 `return page`，视图用单个页面对象访问，Vue 3.5 及以上的原生组件引用优先用 `useTemplateRef`，旧 Vue 或已有组合函数引用用 `ref` / `toRef` 显式连接，不对整页执行 `toRefs`；简单页面的解构及已有 Hook 继续兼容，不新增硬门禁。私有逻辑仍用局部变量，每次调用独立创建状态。**例外**：DETAIL_TABS / FORM_ROUTE / CHANGE_HISTORY 的 index.vue 可包含表单状态管理；OPERATION_STATION 包含 computed/watch/多列表协调逻辑
3. 最外层 class：`app-container app-page-container`
4. 样式用 `@import "./index.scss"`
5. API 用 `getAction` / `postAction` from `@jhlc/common-core/src/api/action`
6. 字典字段用 `logicType: BusLogicDataType.dict, logicValue: "dictCode"`
7. 同时生成 api.md（基于 api-contract Skill 模板）；有字典时写 dict-contract 并更新模块 dicts.ts
8. 提供 pages.ts 注册片段
9. **Mock 遵循项目策略**：读取 `.wl-skills-validate.json.mockPolicy`。`disabled` 不生成、不安装、不校验 mock；`optional`（默认）仅在用户明确需要时生成；`required` 必须生成。启用时放在 `mock/[业务域]/`，URL/字段/方法/载荷与 api.md 及生效 Delivery Profile 一致，并复用 `../_utils`
10. **查询字段顺序**：查询声明中的字段顺序必须与 page-spec `query` 数组顺序严格一致（即原型从左到右、从上到下）
11. **表格列顺序**：列声明中的列顺序必须与 page-spec `columns` 数组顺序严格一致（`selection` + `index` 在最前，其余按原型表头从左到右）
12. **按钮顺序与颜色**：工具栏声明中的按钮顺序、`name`（颜色）和 `plain`（填充/线框）必须与 page-spec `toolbar` 数组严格一致（`primary`=蓝底, `danger`=红色, `warning`=橙色, `default`=灰色; `plain: true`=线框）。**"新增/新建/添加/创建"类主按钮永远排第一，并强制 `name: "primary"` 且不得设置 `plain: true`**；生成后 S3 必须同时校验颜色和 plain 形态。
13. **长文本列**：普通文本列统一声明 `showOverflowTooltip: true`，列宽不足时显示省略号，悬停展示完整内容；selection/index/操作列、自定义 Tag 渲染列以及 `wrapText/autoHeight` 列不得机械添加。
14. **操作列按钮**：`columnsDef()` 操作列的 `operations` 数组必须与 page-spec `operations` 数组**严格一一对应**，不可遗漏也**不可自行添加**（如原型没有"查看"按钮就不能加"查看"）
15. **Tab 标签**：当 page-spec `features.tabSwitch === true` 时，必须在 index.vue 中生成 Tab 组件，tabs 与 `features.tabItems` 一一对应
16. **按钮文字保真**：使用原型中的原始文字（如"新增申请"不可简化为"新增"，"变更申请"不可简化为"变更"）
17. **可点击列（蓝色链接列）**：原型中蓝色凸显的列（如客户编码、申请编码等编码/编号类字段）必须实现为可点击链接，使用 `defaultSlot` + `h()` 渲染蓝色链接样式，点击后查看详情（调 `getById` 后展示或路由跳转）
18. **按钮颜色映射**：按钮的 `type` 属性决定颜色，须根据原型按钮颜色或按钮语义映射（见下方 §按钮颜色映射表）
19. **按钮必须可交互**：所有按钮的 `onClick` 必须有真实处理逻辑，禁止空函数 `() => {}`。通用交互实现见下方 §按钮交互实现规则
20. **未知交互阻断**：原型/需求未提供交互细节且无法由已确认契约确定时，写入 `openQuestions` 并停止生成该操作；禁止用提示消息伪装已实现功能
21. **生成后依赖自检**：只检查本次生成代码真实使用的依赖（如 `lodash-es`、`xlsx`）；页面含新增/编辑/独立表单或可编辑明细时检查 `@robot-admin/form-validate` 的声明范围与可解析安装版本均满足 3.4.1+。缺少依赖必须在 Pre-flight 提示安装并暂停，不得生成悬空 import；不得静默安装。仅在 mock 策略启用且本次生成 mock 时检查 `mockjs`、`vite-plugin-mock`、`viteMockServe` 和 `mock/_utils.ts`。标准业务组件必须先执行 `component ensure` 预览/确认闭环
22. **Contract First，Mock 可选**：先通过 `wl-api-contract` 建立真实 method/path/request/response。需求明确需要前端并行开发时再生成 `mock/[业务域]/[模块].ts`；mock 必须复用同一契约，关闭后不得修改业务 URL。
23. **Mock URL 必须匹配真实请求**：`API_CONFIG` 保持真实接口路径（如 `/mdata/mdataModel/queryPage`），mock 文件端点必须带 Vite 代理前缀（如 `/dev-api/mdata/mdataModel/queryPage`），这样关闭 mock 后无需修改业务代码。
24. **列表首次加载必须真实执行查询**：列表页 `onMounted(() => select())` 调用同一 API_CONFIG；mock 启用时由 mock 返回契约数据，mock 禁用时直接访问真实后端。不得为了展示初始数据在页面内硬编码假数据
25. **优先复用 wl-skills-ui runtime**：当项目安装了 `@agile-team/wl-skills-ui` 时，列表列定义推荐使用 `defineColumns()`，操作列推荐使用 `renderOps()`；允许由 composables 组合函数统一调用，也接受经过功能验证的等价写法，状态/字典列优先使用 runtime 渲染器或 `logicType=dict` 自动映射；不可退回默认纯文本/空函数风格。
26. **wl-skills-ui 接入自检**：生成页面前检查项目是否已接入 `@agile-team/wl-skills-ui` 样式与 runtime。若未接入，先提示并补齐：`@use '@agile-team/wl-skills-ui/styles' as *;`、`installCommonPreset()`、必要的 design tokens 引入；否则页面风格不会自动生效。
27. **pages.ts 分组注册**：多页面模块必须按当前业务目录分组写入 `vite/plugins/shared/pages.ts`，使用 `gProd(module, { subModule: [[page, label]] })` 结构，不允许把所有页面扁平追加到一个数组。
28. **表格复用优先**：优先扩展已有 BaseTable，默认推荐 AG Grid；有效的其他渲染方式兼容。启用持久化时使用稳定 CID，确证跨页面冲突才阻断。
29. **cid 保持稳定**：重构保留现有表格和列 CID；新值推荐业务语义前缀或一次性时间戳，格式差异不阻断。
30. **skills-ui 只能融合，不可生搬硬套**：不得照搬 `wl-skills-ui/templates/list-page` 中的原生 `el-form/usePageHook/el-pagination` 通用写法；优先复用项目已有组件。新逻辑可使用平铺的组合函数；已有 AbstractPageQueryHook 兼容，不强制继承。公共嫁接层集中在 composables，单页业务留在 data.ts，避免只转发或重复包装的文件。
31. **实现为事实，镜像按需留存**：页面业务定义只在 data.ts 维护，index.vue/index.scss 分离视图和样式。真实实现通过验证后，用 `wl-skills template mirror --path <页面目录>` 提取 `role: "mirror"` 的 JSON；镜像用于 AI 理解与领域模板归档，不反向控制页面。过期镜像只建议重新提取。旧需求规格与显式 scenario 链继续兼容，详见 `.wl-skills/docs/page-spec-schema.md`。
32. **字典契约闭环**：页面出现 `logicType: BusLogicDataType.dict` 时，api.md 必须包含完整 dict-contract，模块 dicts.ts 必须汇总该定义；`wl-skills validate` D1 未通过时禁止建议 dict-sync。
33. **字段边界契约闭环**：创建/更新表单的字符串长度、格式和数值范围/精度必须从已确认的 API/数据库/需求契约记录在实际字段/规则及已确认 API 契约中；镜像从实现提取边界证据，不手工维护第二份约束；实现时同步生成控件属性与 `@robot-admin/form-validate` 规则，后端校验仍是最终边界。UI-only 使用 `ELEMENT_RULES/ELEMENT_COMBOS`；需与提交/明细校验复用时以 `SPEC_RULES` 为唯一事实源并用 `toElementRules` 适配。无来源时进入 `openQuestions`，禁止按字段名、标签或经验值猜测。
34. **字典实际引用闭环**：生成结束后除 D1 外必须通过 D2；代码中的 `dictCode/logicValue/useDictOpts/jh-select dict` 字面量必须已在模块 dicts.ts 登记。状态机枚举不因名称含 status/type/flag 被强制改成平台字典。
35. **分页边界闭环**：以项目 `.wl-skills/contracts/wl-delivery-profile.v1.json` 为唯一事实源；无项目配置时才使用包基线 `current: 1, size: 10, maxSize: 200`。项目显式采用 20/1000 等合理口径时允许并报告覆盖基线，不得误判；只有代码与生效 Profile 不一致或请求越界才阻断。查询、重置、页大小变化和保存成功后回第一页，删除末页最后一条时回退上一页。
36. **上下文闭环**：新页面使用 `features.contextFields` 区分 `client/server`。客户端上下文仅进入显式 operations；服务端租户/公司上下文由鉴权注入，禁止由前端请求携带。旧 `fixedQueryFields` 兼容为客户端 page/create/update 上下文。只显示默认值但提交时丢失属于生成失败。
37. **查询触发与列表生命周期**：标准列表首次进入查询；检索条件由“搜索/重置”显式触发，普通输入失焦不得自动查询（`BaseQuery :auto-select="false"`）；保存成功回第一页刷新；删除导致当前页为空时回退上一页。特殊实时联想页须在 page-spec 显式声明 `queryTrigger=auto`。
38. **字段边界只认契约证据**：必填、长度、正则、数值范围/精度和开始/结束时间必须来自 已确认需求和 wl-api-contract；实现驱动页面不能把 JSON 镜像当成业务约束来源；字符串字段不得按名称猜成数字，查询 DTO 不得机械继承数据库写入长度，拿不准时只保留明确必填或形成 openQuestion。
39. **请求字段白名单**：表单提交只从 `wl-api-contract.models.createRequest/updateRequest` 构造 DTO；禁止把整份响应式页面状态或通用宽 DTO 原样发送。页面字段多于契约会被后端拒绝，少于必填契约会造成数据丢失。
40. **可序列化与可理解异常**：不得直接 `structuredClone` Vue Proxy/组件实例；使用项目验证过的 `cloneDeep/toRaw` 或显式 DTO 构造。不得把 `error.message` 原样弹给用户，优先后端业务 message，失败时给中文动作型兜底并记录技术日志。
41. **大量表单快速填写闭环**：page-spec 中表单字段 ≥10 且混合必填/非必填时必须生成有效“全部/仅必填”切换。弹窗用 `show-required-toggle`，分区页面用 `show-required-filter`，页面 `BaseForm` 用 `useFormRequiredOnly + visibleItems`，多 Tab 页由父级传递受控状态且每个子表单真实过滤。禁止只生成开关或 prop 而未改变渲染 items；完整实现只读 `references/form-ui.md`。
42. **按钮尺寸显式稳定**：生成的直接 `el-button` / `ElButton` 与 `BaseToolbar` 默认必须显式写 `size="small"`，避免项目 ConfigProvider 或部署环境默认值不同造成视觉漂移；原型或既有代码已明确设置 `default`、`large` 或动态 `:size` 时保留其业务意图，不得强改。
43. **业务闭环契约必须落地**：需求出现上下键、默认日期、完整文字、去重、合并/统合或批量状态门禁时，必须先写入 `features.acceptance` 再生成。去重只使用业务确认字段且同时覆盖 create/update；提示使用业务对象名称。批量校验只能作用于选中记录（`selected-only`），不得扩大到同组未选数据。验收至少覆盖正向、无命中、重置和同租户写后读；完整清单见 `docs/business-closure-playbook.md`。

### 禁止事项（严格遵守）

1. **弹窗优先复用**：优先使用按需落盘到 `src/components/local/c_formModal/` 的 `c_formModal`，通过 `modalConfig` 配置驱动；禁止运行时引用 `.wl-skills`。**例外**：纯只读详情弹窗（`jh-dialog` + `BaseForm :disabled="true"`）可不用 `c_formModal`，如工艺参数查看（参考 mmwr-process-parameters）
2. **表单组件优先复用**：优先使用 `jh-select`、`jh-date`、`jh-user-picker` 等平台组件（通过 `BaseFormItemDesc` 的 `component` 属性配置）
3. **❌ 禁止在 BaseToolbar 内使用 slot**：`BaseToolbar` 组件**不支持任何 slot**（源码中无 `<slot>` 标签），放入的内容会被丢弃不渲染。Tab/视角切换等额外 UI 必须放在 BaseToolbar **外部**
4. **Tab 选择建议**：Tab 式切换（视角切换、数据过滤 Tab、功能 Tab）推荐使用 `el-tabs`（参考 `mmwr-steel-stripping-operations`）。现有有效的 `el-radio-group` 切换兼容，核实其语义、键盘操作和业务事件
5. **❌ 禁止 Mock 端点只返回成功不修改数据**：mock 文件中每个端点的 `response` 必须实际修改 `dataPool`（splice/assign/修改字段），否则 `this.select()` 刷新后数据不变。详见 §Mock 端点最佳实践
6. **❌ 禁止遗留未使用的 import**：data.ts 中不要导入未使用的模块（如仅用 `postAction` 时不导入 `getAction`）
7. **❌ 禁止操作列自编按钮**：操作列的 `operations` 数组必须与原型操作列按钮**严格一致**，不可凭空添加原型中不存在的按钮（如原型只有"编辑"+"删除"，不可自行加"查看"）
8. **❌ 状态类列必须 `fixed: "right"` + 色块渲染**：启用状态、停用时间、转化状态、客户状态、审批状态、核实状态等靠近操作列的状态类列必须设置 `fixed: "right"`，与操作列一起固定在表格右侧。**且状态列必须用 `defaultSlot` + `h(ElTag)` 渲染彩色标签**，不可纯文本显示（详见 §状态列色块渲染模式）
9. **❌ 禁止操作按钮标签自编**：操作列按钮 `label` 必须与原型严格一致（如原型写"修改"不可改成"编辑"，写"作废"不可改成"删除"），且 onClick 逻辑必须匹配语义（"作废"调 cancel API，不是 remove）
10. **❌ 禁止平台组件遗漏 `label=""`**：在 el-form-item 内使用 `jh-select`、`jh-date`、`jh-file-upload` 时，**必须传 `label=""`** 隐藏组件自身标签（否则会渲染"下拉选择框："、"日期："等多余文字）
11. **❌ 禁止表单控件宽度不统一**：`jh-select`、`jh-date`、`el-input-number`、`jh-file-upload` 默认宽度可能与 `el-input` 不一致，必须在 scoped style 中用 `:deep()` 统一设为 `width: 100%`（详见 §表单页 UI 细节规范）
12. **❌ 禁止表单页无滚动**：独立路由表单页内容超出视口时必须可滚动，`.app-page-container` 须设 `overflow-y: auto`（**不要加 `height: 100%`，全局已有 `height: calc(100vh - 100px)`，叠加会导致双滚动条**）
13. **样式维护建议**：新页面样式集中在 `index.scss`，动态样式和有效的存量内联 style 兼容；不能仅因写法不同阻断，重复无效样式仍须清理。
14. **❌ 禁止违反项目 Mock 策略**：`disabled` 时不得生成 mock；`required` 时不得遗漏；`optional` 时只有需求明确才生成。生成的 mock 必须按域分目录并复用 `_utils`，不生成 mock 本身不是缺陷
15. **❌ 禁止生成空或占位 onClick**：`onClick: () => {}` 和仅提示“待确认”的处理都属于生成失败；未知逻辑必须阻断并进入 openQuestions。
16. **平台渲染建议**：项目已安装 `@agile-team/wl-skills-ui` 时优先使用 `defineColumns/renderOps`，允许 composables 内集中调用及已验证的等价写法。有效存量写法不因此报错。
17. **BaseTable 兼容**：新列表推荐 AG Grid；有效的既有渲染方式兼容。使用持久化时保留稳定 CID，真实跨页面冲突才阻断。
18. **列状态建议**：启用列持久化时生成稳定列 CID，已存在的列 CID 不得重生成。命名或格式差异只建议改进。
19. **❌ 禁止新页面手写通用表单规则**：不得重复写 `{ required, message, trigger }`、通用格式正则和数值 callback validator；使用 `@robot-admin/form-validate`。业务特有且无法等价映射的规则可保留，但必须说明契约来源。
20. **❌ 禁止 Element Plus 页面使用 Naive API**：不得使用 `PRESET_RULES`、`RULE_COMBOS`、`NAIVE_COMBOS` 或 `toNaiveRule(s)`；改用 `ELEMENT_RULES/ELEMENT_COMBOS` 或 RuleSpec 适配。

### 场景化实现规则（按需读取）

| 命中场景                                                     | 必读 reference                          |
| ------------------------------------------------------------ | --------------------------------------- |
| 用户选择 scenario 或现有页面带 scenarioRef（确定性往返维护） | `references/scenario-templates.md`      |
| CRUD 弹窗、蓝色链接列或 FORM_ROUTE 隐藏路由                  | `references/modal-and-navigation.md`    |
| 按钮交互、条件操作列、状态标签或视角/Tab                     | `references/table-interactions.md`      |
| Excel 导入导出或 Mock 写操作                                 | `references/import-export-and-mock.md`  |
| FORM_TAB / FORM_ROUTE / 独立路由表单页                       | `references/form-ui.md`                 |
| 新增/编辑表单、可编辑明细或提交前批量校验                    | `references/form-validation-library.md` |
| 写入 `pages.ts` 或 `SYS_MENU_INFO.md` 前                     | `references/registration-and-menu.md`   |

只读取本次页面命中的 reference；模板代码仍按下方模板索引读取一个匹配文件。

### 禁止

> 以下为精简速查清单，详细说明见上方 §禁止事项（严格遵守）。

- ❌ index.vue 中写业务逻辑（逻辑全在 data.ts）
- ❌ 使用 Vuex（用 Pinia）
- ❌ `::v-deep` / `/deep/`（用 `:deep()`）
- ❌ 直接用 axios（用 getAction/postAction）
- ❌ 手写查询表单/工具栏/分页（用 BaseQuery/BaseToolbar/jh-pagination）
- ❌ 使用 `useTableDelete`（用 `this.remove(row.id)`）
- ❌ 展开含原型方法的类实例（会丢失方法）；组合函数明确返回的普通对象可以展开
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

| 交互模式          | 文件                                               | 适用场景                                | 典型参考页面                       |
| ----------------- | -------------------------------------------------- | --------------------------------------- | ---------------------------------- |
| LIST              | templates/universal/TPL-LIST.md                    | 标准查询+工具栏+表格+分页               | mmwr-customer-archive              |
| MASTER_DETAIL     | templates/universal/TPL-MASTER-DETAIL.md           | jh-drag-row 主从表，双击联动            | ompt-ht-plan-order                 |
| TREE_LIST         | templates/universal/TPL-TREE-LIST.md               | 左侧 C_Tree + 右侧列表                  | —                                  |
| DETAIL_TABS       | templates/universal/TPL-DETAIL-TABS.md             | jh-drag-row 上Tab表单+下子表            | add-demo / domestic-trade-order    |
| FORM_ROUTE        | templates/universal/TPL-FORM-ROUTE.md              | 复杂表单独立路由（非弹窗）              | mmwr-customer-apply-add-form       |
| CHANGE_HISTORY    | templates/universal/TPL-CHANGE-HISTORY.md          | 左历史时间线+右变更详情                 | mmwr-customer-apply-change-history |
| RECORD_FORM       | templates/universal/TPL-RECORD-FORM.md             | BaseQuery选主记录+Form+Table无分页      | mmsm-convert-progress              |
| OPERATION_STATION | templates/domains/produce/TPL-OPERATION-STATION.md | 工序站点操作（待处理↔已处理+操作表单） | mmwr-rolling-management            |

> **配置驱动模板页**（ResultQueryTemplate / FinishingAchievementTemplate 等）：见 templates/universal/TPL-DRIVEN.md，仅需生成 config 对象，不套用以上模板。
> **领域模板查询**：完整路径以 `templates/_index.md` 注册表为准，新增领域模板见 `templates/domains/_CONTRIBUTING.md`。

## 存量项目与质量门禁

推荐结构允许持续优化。类、组合函数、列工厂和组件选择差异只给建议；无法静态证明的调用链报告待核实，并使用项目行为验证。无用变量、无用组件、废弃代码、空处理函数、超标复杂度与已确认的业务契约错误继续阻断。注释和提交描述使用中文，技术标识保留原名。

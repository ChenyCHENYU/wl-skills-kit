---
name: page-codegen
description: "Use when: generating complete Vue 3 page code (index.vue + data.ts + modal components + api.md + pages.ts registration) from a prototype page inventory and API contract, strictly following the cx-ui-produce project conventions. Read SKILL.md first (rules+constraints), then read the matching TPL-*.md for the template code. Triggers on: generate page, create page, code generation, 生成页面, 页面代码, 代码生成, vue页面, 按原型生成, 口述需求, 建个页面, 写个页面, 帮我生成, natural language page generation."
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
✅ 已读取 standards/14-layout-containers.md   → 布局容器（禁用 C_Splitter，必须用 jh-drag-row/jh-drag-col）
✅ 已读取 docs/{涉及的jh-*文档}              → 当前页涉及组件的使用规范
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
✅ reports/SYS_MENU_INFO.md  → 已追加菜单条目
────────────────────────────────────────────────
📌 后续步骤：
   1. 在 router/pages.ts 注册路由
   2. 若本页 hiddenMenu=true → 在 src/util/navigate-hidden.ts 的 HIDDEN_ROUTE_MAP 追加一行
   3. 提交：git cz（禁止直接 git commit）
   4. 可选：触发 convention-audit 扫描本次生成文件
────────────────────────────────────────────────
```

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
├── index.vue     ← 页面入口（纯模板 + 解构）
├── data.ts       ← 业务逻辑（AbstractPageQueryHook 类 / 直接导出 ref+函数）
├── index.scss    ← 页面样式
└── api.md        ← 接口约定（按 api-contract Skill 模板生成）
```

弹窗组件处理策略：

- **通用弹窗**（新增/编辑表单，2+ 页面可复用）→ 提取到 `src/components/local/c_xxxModal/`
- **极个性弹窗**（仅单页面使用，c_modal 无法满足）→ 放在页面 `components/xxxModal.vue`

附加输出：

- `pages.ts` 注册片段
- **`reports/SYS_MENU_INFO.md`** — 集中式菜单配置，**追加写入**（见下方 §SYS_MENU_INFO 生成规则）
- `mock/[业务域]/[模块].ts`（项目根目录 `mock/` 下按域分目录，`vite-plugin-mock` 自动加载，与 api.md 的 URL 和字段完全一致；详见 `docs/mock-architecture.md`）

---

## 约束（严格遵守）

### 必须

1. data.ts 使用 `class extends AbstractPageQueryHook`，通过 `queryDef()` / `toolbarDef()` / `columnsDef()` 配置。**仅适用于 LIST / MASTER_DETAIL / TREE_LIST 三种列表型页面**。其余模板不用此基类：DETAIL_TABS（直接导出 reactive+ref）、FORM_ROUTE（useXxx composable）、CHANGE_HISTORY（composable+mock）、RECORD_FORM（直接 ref+函数）、OPERATION_STATION（多个 createXxxPage）、TEMPLATE_DRIVEN（仅 config 对象）
2. index.vue 只有模板 + `createPage()` 解构 + `onMounted`，不写业务逻辑。**例外**：DETAIL_TABS / FORM_ROUTE / CHANGE_HISTORY 的 index.vue 可包含表单状态管理；OPERATION_STATION 包含 computed/watch/多列表协调逻辑
3. 最外层 class：`app-container app-page-container`
4. 样式用 `@import "./index.scss"`
5. API 用 `getAction` / `postAction` from `@jhlc/common-core/src/api/action`
6. 字典字段用 `logicType: BusLogicDataType.dict, logicValue: "dictCode"`
7. 同时生成 api.md（基于 api-contract Skill 模板）
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
19. **未知交互兜底**：当原型未提供交互细节、且无法从通用模式推断时，`onClick` 中使用 `ElMessage.info("需业务确认交互逻辑")` 作为占位
20. **生成后依赖自检**：代码生成完成后，检查 `package.json` 是否已安装生成代码所需的依赖（`mockjs`、`vite-plugin-mock`、`lodash-es`、`xlsx` 等），若缺失则提示用户执行安装命令。同时检查 `vite.config.ts` 是否已注册 `viteMockServe`、`mock/_utils.ts` 是否存在（若不存在则从 kit 种子文件补充）
21. **默认 Mock First**：新生成页面默认必须走 `vite-plugin-mock`。必须生成 `mock/[业务域]/[模块].ts`（import `../_utils` 共享工具），并确保 `API_CONFIG` 中每个 URL 都有对应 mock 端点；只有当用户明确要求关闭 mock 或 `.env.dev` 中 `ENV_MOCK=false` 时，才允许直接联调真实接口。
22. **Mock URL 必须匹配真实请求**：`API_CONFIG` 保持真实接口路径（如 `/mdata/mdataModel/list`），mock 文件端点必须带 Vite 代理前缀（如 `/dev-api/mdata/mdataModel/list`），这样关闭 mock 后无需修改业务代码。
23. **页面初始数据必须由 mock 提供**：列表页 `onMounted(() => select())` 后必须能显示模拟数据，不允许生成空白页等待后端接口；`list` 端点返回 `{ code: 2000, data: { records, total, size, current } }`。
24. **必须使用 wk-skills-ui runtime 风格**：当项目安装了 `@agile-team/wk-skills-ui` 时，列表列定义必须使用 `defineColumns()`，操作列必须使用 `renderOps()`，状态/字典列优先使用 runtime 渲染器或 `logicType=dict` 自动映射；不可退回默认纯文本/空函数风格。
25. **wk-skills-ui 接入自检**：生成页面前检查项目是否已接入 `@agile-team/wk-skills-ui` 样式与 runtime。若未接入，先提示并补齐：`@use '@agile-team/wk-skills-ui/styles' as *;`、`installCommonPreset()`、必要的 design tokens 引入；否则页面风格不会自动生效。
26. **pages.ts 分组注册**：多页面模块必须按当前业务目录分组写入 `vite/plugins/shared/pages.ts`，使用 `gProd(module, { subModule: [[page, label]] })` 结构，不允许把所有页面扁平追加到一个数组。
27. **BaseTable 强制 AGGrid**：所有业务主列表/台账/主从表/树表/详情子表的 `BaseTable` 必须显式写 `render-type="agGrid"`，并绑定全局唯一 `cid`。弹窗小表格可豁免，但必须在生成摘要中说明理由。
28. **cid 必须可追踪**：每个页面导出 `TABLE_CID = "{pageAbbr}-{base36Timestamp}"`；多表页面使用 `BOTTOM_TABLE_CID` / `ITEM_TABLE_CID`，列级 `cid` 必须使用 `${TABLE_CID}-fieldName` 前缀。
29. **skills-ui 只能融合，不可生搬硬套**：不得照搬 `wk-skills-ui/templates/list-page` 中的原生 `el-form/usePageHook/el-pagination` 通用写法；本项目必须保留 `AbstractPageQueryHook + BaseQuery + BaseToolbar + BaseTable + jh-pagination` 平台骨架，只融合 `defineColumns/renderOps/tokens/preset`。

### 禁止事项（严格遵守）

1. **❌ 禁止手写弹窗**：不可在页面 `components/` 下用 `el-dialog` + `el-form` + `el-row/col` 手写弹窗。必须使用 `c_formModal`（`src/components/local/c_formModal/`），通过 `modalConfig` 配置驱动。**例外**：纯只读详情弹窗（`jh-dialog` + `BaseForm :disabled="true"`）可不用 `c_formModal`，如工艺参数查看（参考 mmwr-process-parameters）
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
14. **❌ 禁止生成无 mock 的页面**：只写 `API_CONFIG` 但不写 `mock/[业务域]/*.ts` 属于生成失败。mock 文件必须按域分目录、import `_utils` 共享工具（详见 `docs/mock-architecture.md`）。
15. **❌ 禁止生成空 onClick**：`onClick: () => {}` 属于生成失败；未知逻辑也必须用 `ElMessage.info(...)` 明示。
16. **❌ 禁止忽略 wk-skills-ui**：项目已安装 `@agile-team/wk-skills-ui` 时，不使用 `defineColumns/renderOps` 属于生成失败。
17. **❌ 禁止 BaseTable 非 AGGrid**：业务列表中 `<BaseTable>` 未写 `render-type="agGrid"` 或缺少 `cid/:cid` 属于生成失败。
18. **❌ 禁止列缺 cid**：AGGrid 表格的数据列/操作列缺少列级 `cid` 属于生成失败。

### c_formModal 使用规范

> 项目已有 `src/components/local/c_formModal/` 通用表单弹窗组件，支持 add/edit/view 三模式。
> 所有标准 CRUD 弹窗**必须使用此组件**，不可重复编写。

**data.ts 中定义 modalConfig：**

```typescript
import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";

export const modalConfig = {
  titlePrefix: "客户",       // 标题前缀：新增客户 / 编辑客户 / 查看客户
  width: "850px",
  columns: 2,
  labelWidth: "110px",
  formItems: [
    { name: "code", label: "编码", disabled: true, placeholder: "系统自动生成" },
    { name: "name", label: "名称", required: true, placeholder: "请输入" },
    // 下拉用 jh-select 组件
    {
      name: "type",
      label: "类型",
      component: () => ({ tag: "jh-select", items: OPTS.type })
    }
  ] as BaseFormItemDesc<any>[],
  api: {
    getById: API_CONFIG.getById,
    save: API_CONFIG.save,
    update: API_CONFIG.update
  }
};
```

**index.vue 中使用：**

```vue
<c_formModal ref="editModalRef" v-bind="modalConfig" @ok="select" />

<script setup lang="ts">
import { createPage, modalConfig } from "./data";
import c_formModal from "@/components/local/c_formModal/index.vue";
</script>
```

**调用方式**（在 data.ts 中）：
- 新增：`_editModalRef?.value?.open()`
- 编辑：`_editModalRef?.value?.edit(row.id)`
- 查看：`_editModalRef?.value?.view(row.id)`

---

### 可点击列（蓝色链接列）

原型中以蓝色文字凸显的列（通常是编码、编号类字段）表示"可点击查看详情"。

**识别规则**：
- 原型中蓝色/带下划线的列文字 → 必须实现为可点击
- 常见目标列：客户编码、申请编码、订单编号、合同编号、计划编号等"XX编码/编号"字段

**实现方式**：在 `columnsDef()` 中使用 `defaultSlot` + `h()` 渲染蓝色链接：

```typescript
import { h } from "vue";

// 在 columnsDef() 中：
{
  label: "客户编码",
  name: "customerCode",
  minWidth: 120,
  defaultSlot: ({ row }: any) => {
    return h(
      "span",
      {
        style: "color: #409eff; cursor: pointer; text-decoration: underline;",
        onClick: () => handleCodeClick(row)
      },
      row.customerCode
    );
  }
}
```

**点击处理逻辑**（按优先级选择）：
1. 有编辑弹窗 → `_editModalRef?.value?.open(row.id, "view")` （查看模式打开同一弹窗）
2. 如果有详情路由 → `navigateToForm({ id: row.id, mode: "view" })`
3. Mock 阶段暂无详情页 → `ElMessage.info(\`查看详情: ${row.fieldValue}\`)`

**handleCodeClick 推荐实现**：

```typescript
let _editModalRef: any = null;

function handleCodeClick(row: any) {
  _editModalRef?.value?.open(row.id, "view");
}
```

> 注意：`_editModalRef` 在 `createPage(editModalRef?)` 中赋值，详见 §弹窗模板

---

### FORM_ROUTE 表单页（路由跳转式表单）

> 当表单足够复杂（如多 Tab、多子表、独立布局）时，使用**独立路由**替代弹窗（c_formModal）。
>
> **导航方式选择**（按场景区分）：
>
> | 场景 | 方式 | 原因 |
> |---|---|---|
> | **菜单页 → 隐藏页 / 隐藏页 → 隐藏页** | `navigateHidden(path, query?)` from `src/util/navigate-hidden.ts` | 懒注册 + router.push，无整页刷新；内部自动兜底 location.href 防白屏 |
> | **返回上一页** | `useRouter().back()` | 任何页面均可用 |
>
> ⚠️ `navigateHidden` 依赖 `src/util/navigate-hidden.ts` 的 `HIDDEN_ROUTE_MAP`。**每新增一个隐藏页，必须在该 Map 里追加一行**，否则兜底会退化为整页刷新。

#### 路由路径命名规则

| 目录名（kebab-case）              | 路由路径（camelCase）                       |
| ---------------------------------- | -------------------------------------------- |
| `mmwr-customer-apply-add-form`     | `/aiflow/mmwrCustomerApplyAddForm`           |
| `mmwr-customer-apply-change-form`  | `/aiflow/mmwrCustomerApplyChangeForm`        |

**规则**：`/[子模块名-camelCase]/[完整页面目录名转PascalCase]`
- 子模块名取 pages.ts 的 key，如 `aiflow`
- 页面目录名整体转 PascalCase（含 `mmwr` 前缀），如 `mmwr-customer-apply-add-form` → `mmwrCustomerApplyAddForm`

#### navigate-hidden.ts 标准实现（首次使用时创建，后续只追加 Map 条目）

```typescript
// src/util/navigate-hidden.ts
import envConfig from "@jhlc/common-core/src/store/env-config";
import { ElMessage } from "element-plus";

/**
 * 隐藏页路由懒注册表
 * 每新增一个 hiddenMenu=true 的页面，在此追加一行
 */
const HIDDEN_ROUTE_MAP: Record<string, () => Promise<any>> = {
  // "/aiflow/mmwrCustomerApplyAddForm": () => import("@/views/produce/aiflow/mmwr-customer-apply-add-form/index.vue"),
};

export async function navigateHidden(path: string, query?: Record<string, string>) {
  const router = envConfig()?.router;
  if (!router) { ElMessage.error("路由未初始化，请刷新页面重试"); return; }

  const matched = router.resolve({ path }).matched;
  if (!matched.length || matched[0].path === "/:pathMatch(.*)*") {
    const loader = HIDDEN_ROUTE_MAP[path];
    if (!loader) {
      // 降级兜底：路由 Map 未配置时整页跳转，不白屏
      location.href = router.resolve({ path, query } as any).href;
      return;
    }
    router.addRoute({ path, component: loader });
  }
  await router.push({ path, query } as any);
}
```

#### 调用侧标准实现（data.ts）

```typescript
// ✅ 正确：用 navigateHidden
import { navigateHidden } from "@/util/navigate-hidden";

// 在 createPage() 外部定义，避免每次调用都重新创建
const FORM_ROUTE = "/aiflow/mmwrCustomerApplyAddForm";

function navigateToForm(query?: Record<string, string>) {
  navigateHidden(FORM_ROUTE, query);
}

export function createPage() {
  const Page = new (class extends AbstractPageQueryHook {
    toolbarDef(): ActionButtonDesc[] {
      return [
        {
          name: "primary",
          label: "新增申请",
          onClick: () => navigateToForm()        // 无参：新增
        }
      ];
    }
    columnsDef(): TableColumnDesc<any>[] {
      return defineColumns([
        // ...
        {
          label: "操作",
          name: "_action",
          cid: `${TABLE_CID}-action`,
          fixed: "right",
          align: "center",
          defaultSlot: ({ row }: any) =>
            renderOps([
              { type: "edit", onClick: () => navigateToForm({ id: row.id }) }  // 带 id：编辑
            ])
        }
      ] as any) as TableColumnDesc<any>[];
    }
  })();
  return Page.create() as any;
}
```

> **✅ 正确做法**：
> - 跳转隐藏页 → `navigateHidden(path, query?)`（懒注册 + router.push，无刷新，内部兜底防白屏）
> - 返回上一页 → `useRouter().back()`
>
> **❌ 禁止**：
> - 直接 `router.push({ path: "..." })` — 主应用过滤了 hidden 路由，路由未注册直接 push 会白屏或报 "Invalid route component"
> - 直接 `location.href = router.resolve(...).href` — 触发整页重载，有加载动画刷新感；`navigateHidden` 内部已兜底，**外部调用侧禁止直接使用**
> - kebab-case 路径（`/mmwr-xxx-form`）— 路由路径必须是 camelCase
>
> ⚠️ **新增隐藏页时必须同步维护 `src/util/navigate-hidden.ts` 的 `HIDDEN_ROUTE_MAP`**，否则 `navigateHidden` 降级为整页刷新，失去无刷新优势。

---

### 按钮颜色映射表

> **原型颜色优先**：当原型明确展示按钮颜色时，**必须以原型为准**，不可用语义推断覆盖。下方语义推断仅在原型未标颜色时使用。

| 原型按钮颜色 | `name` 值 | `plain` | 说明 |
| --- | --- | --- | --- |
| 蓝色填充（深蓝底白字） | `"primary"` | 不设 | 主操作-填充（新增申请、启用） |
| 蓝色线框（蓝边框蓝字） | `"primary"` | `true` | 次要操作-线框（变更申请） |
| 红色填充（红底白字） | `"danger"` | 不设 | 危险-填充（删除、批量删除） |
| 红色线框（红边框红字） | `"danger"` | `true` | 危险-线框（审批驳回、作废） |
| 橙色填充（橙底白字） | `"warning"` | 不设 | 警告-填充（停用） |
| 橙色线框（橙边框橙字） | `"warning"` | `true` | 警告-线框（撤回、退回、回收） |
| 绿色线框（绿边框绿字） | `"success"` | `true` | 正向确认-线框（审批通过、转化、认领） |
| 灰色线框（灰边框灰字） | 不设 name | `true` | 中性操作-线框（导出、导入、批量修改） |

> **`name` vs `type` 属性**：`name` 为按钮提供默认的颜色（`type`）和图标（`icon`）；`type` 可单独覆盖颜色，两者可共存，`type` 优先级更高。工具栏按钮优先使用 `name`，只在需要与 `name` 默认颜色不同时才加 `type` 覆盖。

**语义自动推断**（仅当原型未标颜色时使用，原型明确颜色时以原型为准）：
- 新增/新增申请/保存 → `name: "primary"`（蓝色填充）
- 变更申请 → `plain: true`（灰色线框）
- 提交 → `name: "primary", plain: true`
- 审批通过/认领/转化 → `name: "success", plain: true`
- 删除/批量删除 → `name: "danger"`（红色填充）
- 审批驳回/作废 → `name: "danger", plain: true`
- 启用 → `name: "primary"`（蓝色填充）
- 停用 → `name: "warning"`（橙色填充）
- 撤回/退回/回收 → `name: "warning", plain: true`
- 导出/导入/批量修改 → `plain: true`（灰色线框）

---

### 按钮交互实现规则

所有按钮 `onClick` 必须实现真实交互逻辑，按按钮语义选择以下模式：

| 按钮语义 | 交互实现 |
| --- | --- |
| **新增/新增申请** | `_editModalRef?.value?.open()` |
| **删除** | 校验选中 → `this.removeBatch()` |
| **提交** | 校验选中 → `ElMessageBox.confirm → postAction(API_CONFIG.submit, { ids })` |
| **审批通过** | 校验选中 → `ElMessageBox.confirm → postAction(API_CONFIG.update, { ids, approvalStatus: "审批完成" })` |
| **审批驳回** | 校验选中 → `ElMessageBox.confirm → postAction(API_CONFIG.update, { ids, approvalStatus: "驳回" })` |
| **启用/停用** | 校验选中 → `ElMessageBox.confirm → postAction(API_CONFIG.enable/disable, { ids })` |
| **撤回** | 校验选中 → `ElMessageBox.confirm → postAction(API_CONFIG.withdraw, { ids })` |
| **导出** | 客户端 XLSX 生成（见下方 §导出/导入实现模式） |
| **导入** | 文件选择器 → XLSX 解析 → postAction 批量导入（见下方 §导出/导入实现模式） |
| **其他** | `ElMessage.info("需业务确认交互逻辑")` |

**获取选中行的通用模式**：

```typescript
const rows = this.tableRef.value?.getSelectionRows();
if (!rows?.length) {
  ElMessage.warning("请先选择数据");
  return;
}
const ids = rows.map((r: any) => r.id);
```

**操作列按钮交互**：
- 编辑 → `_editModalRef?.value?.open(row.id)`
- 删除 → `this.remove(row.id)`（基类内置方法，自带确认弹窗）
- 查看 → `_editModalRef?.value?.view(row.id)`

---

### 操作列条件显示模式（`show` 属性）

> 原型中操作列可能在**不同行**显示**不同按钮**（如已核实行显示"修改+作废"，未核实行显示"编辑+删除"）。
> 此时需取**所有按钮的并集**，通过 `show: (row) => boolean` 按行条件显示。

**判断依据**：如果原型操作列中，不同行的按钮文字/数量不同，则属于条件操作。

**标准实现**（框架原生 `show` 属性）：

```typescript
{
  label: "操作",
  name: "_action",
  cid: `${TABLE_CID}-action`,
  width: 140,
  fixed: "right",
  align: "center",
  defaultSlot: ({ row }: any) =>
    renderOps([
      {
        type: "edit",
        label: "修改",
        show: () => row.verifyStatus === "已核实",
        onClick: () => _editModalRef?.value?.edit(row.id)
      },
      {
        type: "danger",
        label: "作废",
        show: () => row.verifyStatus === "已核实",
        onClick: () => handleCancel(row)
      },
      {
        type: "edit",
        label: "编辑",
        show: () => row.verifyStatus !== "已核实",
        onClick: () => _editModalRef?.value?.edit(row.id)
      },
      {
        type: "del",
        label: "删除",
        show: () => row.verifyStatus !== "已核实",
        onClick: () => Page?.remove(row.id)
      }
    ])
}
```

**关键规则**：
1. **width** 按并集中同时显示的最大按钮数计算（2 个≈140，3 个≈200）
2. **按钮 label** 必须与原型中每行实际显示的文字严格一致
3. **按钮语义→API 对应**："作废"→cancel API，"删除"→remove API，不可混用

---

### 状态列色块渲染模式

> 所有"XX状态"类列**必须用 `defaultSlot` + `h(ElTag)` 渲染彩色标签**，不可纯文本显示。

**标准实现模式：**

1. **文件顶部定义映射表 + 渲染函数**（与 `import` 同级）：
```typescript
import { h, resolveComponent } from "vue";

/** 状态色块映射 */
const STATUS_TAG_MAP: Record<string, Record<string, string>> = {
  convertStatus: { "已转化": "success", "未转化": "info" },
  customerStatus: { "临时客户": "warning", "正式客户": "success" },
  verifyStatus: { "已核实": "success", "未核实": "info" },
  enableStatus: { "已启用": "success", "已停用": "danger" },
  approvalStatus: { "开立审批中": "", "审批完成": "success", "驳回": "danger", "流程终止": "info" }
};
function renderStatusTag(row: any, field: string) {
  const val = row[field];
  const type = STATUS_TAG_MAP[field]?.[val];
  if (type === undefined) return val;
  return h(resolveComponent("ElTag") as any, { type: type || "", effect: "light", size: "small" }, () => val);
}
```

2. **列定义中使用 `defaultSlot`**：
```typescript
{ label: "转化状态", name: "convertStatus", minWidth: 100, fixed: "right",
  defaultSlot: ({ row }: any) => renderStatusTag(row, "convertStatus") },
```

**颜色映射规则**（按语义）：
| 语义 | ElTag type | 效果 |
|------|-----------|------|
| 成功/已完成/已启用/已核实/已转化/正式 | `success` | 绿色 |
| 警告/临时/待处理 | `warning` | 橙色 |
| 危险/已停用/驳回/已作废 | `danger` | 红色 |
| 默认/进行中/审批中 | `""` | 蓝灰 |
| 信息/未处理/未核实/未转化/终止 | `info` | 灰色 |

**注意**：当映射值中包含空字符串 `""` 时（如"开立审批中"），`renderStatusTag` 中判断条件必须用 `type === undefined` 而非 `!type`，否则空字符串会被跳过不渲染标签。

---

### 视角切换（viewSwitch）与 Tab 切换（tabSwitch）

#### viewSwitch — 同数据不同列（如"管理视角 / 使用视角"）

> 列定义放在 `class` **外部**作为独立 export 函数；`columnsDef()` 返回其中一个提供默认的 `columns` ref；`index.vue` 自行管理 `activeView`，用 `v-if` 切换 `BaseTable`。

外部列函数无法用 `this` 调用 Page 方法，需要**模块级变量**引用：

```typescript
// 模块顶部：外部列函数通过此变量回调 Page 的 select()/remove()
let Page: any = null;

export function managementColumns(): TableColumnDesc<any>[] {
  return defineColumns([
    // ...
    {
      label: "操作",
      name: "_action",
      cid: `${TABLE_CID}-management-action`,
      fixed: "right",
      width: 100,
      align: "center",
      defaultSlot: ({ row }: any) =>
        renderOps([
          { type: "del", label: "删除", onClick: () => Page?.remove(row.id) }
        ])
    }
  ] as any) as TableColumnDesc<any>[];
}
export function usageColumns(): TableColumnDesc<any>[] {
  return defineColumns([ /* 使用视角列... */ ] as any) as TableColumnDesc<any>[];
}

export function createPage(editModalRef?: any) {
  const inst = new (class extends AbstractPageQueryHook {
    columnsDef() { return managementColumns(); }  // 提供 columns ref 默认值
  })();
  Page = inst;
  return (inst as any).create() as any;
}
```

`index.vue` 核心片段：

```vue
<el-tabs v-model="activeView">
  <el-tab-pane label="管理视角" name="management">
    <BaseTable v-if="activeView === 'management'" ref="tableRef"
      :data="list" :columns="mgmtCols" showToolbar />
  </el-tab-pane>
  <el-tab-pane label="使用视角" name="usage">
    <BaseTable v-if="activeView === 'usage'" ref="tableRef"
      :data="list" :columns="useCols" showToolbar />
  </el-tab-pane>
</el-tabs>

<script setup lang="ts">
import { createPage, managementColumns, usageColumns } from "./data";
const editModalRef = ref();
const activeView = ref("management");
const mgmtCols = managementColumns();
const useCols = usageColumns();
const Page = createPage(editModalRef);
const { tableRef, page, queryParam, list, queryItems, toolbars, select } = Page;
</script>
```

#### tabSwitch — 同列不同数据（如"临时客户 / 正式客户 / 公海池"）

> `createPage()` 在 `return` 前把 `activeTab` + `handleTabChange` 挂到结果对象，`index.vue` 解构后直接绑定。

**data.ts（`createPage()` 末尾，return 之前）**：

```typescript
  const activeTab = ref<"temp" | "formal" | "pool">("temp");
  const handleTabChange = (val: typeof activeTab.value) => {
    activeTab.value = val;
    result.queryParam.value.tabType = val;
    result.select();
  };
  result.activeTab = activeTab;
  result.handleTabChange = handleTabChange;
  return result;
```

**index.vue 核心片段**：

```vue
<el-tabs v-model="activeTab" @tab-change="handleTabChange">
  <el-tab-pane label="临时客户" name="temp" />
  <el-tab-pane label="正式客户" name="formal" />
  <el-tab-pane label="公海池" name="pool" />
</el-tabs>

<script setup lang="ts">
const Page = createPage(editModalRef);
const { tableRef, page, queryParam, list, queryItems, toolbars, select,
        activeTab, handleTabChange } = Page;
</script>
```

---

### 导出/导入实现模式

> 使用 `xlsx` 库进行客户端 Excel 生成与解析，不依赖后端文件流。

**导出（data.ts 顶部需 `import * as XLSX from "xlsx"`）**：

```typescript
{
  label: "导出",
  plain: true,
  onClick: async () => {
    const data = this.list.value;
    if (!data?.length) { ElMessage.warning("无数据可导出"); return; }
    const exportData = data.map((row: any) => ({
      "列中文名1": row.fieldName1,
      "列中文名2": row.fieldName2
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "导出文件名.xlsx");
    ElMessage.success("导出成功");
  }
}
```

**导入（需 mock 提供 import 端点）**：

```typescript
{
  label: "导入",
  plain: true,
  onClick: () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
        if (!rows.length) { ElMessage.warning("文件无有效数据"); return; }
        await postAction(API_CONFIG.import, { rows });
        ElMessage.success(`导入成功 ${rows.length} 条`);
        this.select();
      } catch { ElMessage.error("导入失败，请检查文件格式"); }
    };
    input.click();
  }
}
```

### Mock 端点最佳实践

> **核心原则**：Mock 模式下所有操作必须能完整走通，不可出现接口报错。
> data.ts 中每个 `postAction(API_CONFIG.xxx, ...)` 调用，mock 文件中都必须有对应端点。

**1. 所有端点必须修改 dataPool**

mock 端点不能只返回 `{ code: 2000 }` — 必须实际修改内存中的 `dataPool` 数据，否则 `this.select()` 刷新后数据不变。

```typescript
// ✅ 正确：启用端点修改 dataPool 中的 enableStatus
{
  url: "/dev-api/sale/xxx/enable",
  method: "post",
  response: ({ body }: any) => {
    const ids = body?.ids || [];
    ids.forEach((id: string) => {
      const item = dataPool.find((d) => d.id === id);
      if (item) item.enableStatus = "已启用";
    });
    return { code: 2000, message: "启用成功", data: null };
  }
}

// ❌ 错误：只返回成功，不修改数据
{
  url: "/dev-api/sale/xxx/enable",
  method: "post",
  response: () => ({ code: 2000, message: "启用成功", data: null })
}
```

**2. 常见操作的 Mock 修改模式**

| 操作 | dataPool 修改方式 |
| --- | --- |
| 删除 | `dataPool.splice(idx, 1)` |
| 新增 | `dataPool.unshift({ ...genRecord(), ...body, id: Random.id() })` |
| 编辑 | `Object.assign(dataPool[idx], body)` |
| 启用/停用 | 修改 `item.enableStatus` |
| 提交/审批 | 修改 `item.approvalStatus` |
| 作废 | `dataPool.splice(idx, 1)` 或修改状态 |
| 分配/认领 | 修改 `item.businessPerson` |

**3. 端点覆盖检查**

生成完成后，逐个对比 `API_CONFIG` 的所有 key 与 mock 文件中的 `url`，确保一一对应、零遗漏。

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

## 表单页 UI 细节规范（FORM_TAB / 独立路由表单页）

> 适用于使用 el-form + el-row/col 布局的复杂表单页（如客户申请新增/变更）。
> 所有样式规则**写在组件或页面的 index.scss** 中，便于未来复用和移动，避免内联 style 散落。

### 1. 平台组件 label 隐藏

`jh-select`、`jh-date`、`jh-file-upload` 等平台组件自带 `label` prop（默认会渲染"下拉选择框："、"日期："等文字）。
**在 el-form-item 内使用时，必须传 `label=""` 隐藏组件自身标签**，避免与 el-form-item 的 label 重复。

```vue
<!-- ✅ 正确 -->
<el-form-item label="审批产品别">
  <jh-select v-model="form.productLine" dict="product_line" label="" placeholder="请选择" />
</el-form-item>
<el-form-item label="成立时间">
  <jh-date v-model="form.establishDate" label="" placeholder="请选择" />
</el-form-item>
<el-form-item label="营业执照">
  <jh-file-upload v-model="form.businessLicense" label="" :disabled="isView" />
</el-form-item>

<!-- ❌ 错误：不传 label=""，组件内部会额外渲染 "下拉选择框：" / "日期：" 等文字 -->
<jh-select v-model="form.productLine" dict="product_line" />
<jh-date v-model="form.establishDate" />
```

### 2. 表单控件宽度统一

`jh-select`、`jh-date`、`el-input-number`、`jh-file-upload` 默认宽度可能与 `el-input` 不一致。
在组件 scoped style 中统一设置 `width: 100%`：

```scss
:deep(.jh-select),
:deep(.jh-date),
:deep(.el-input-number) {
  width: 100%;
}
:deep(.jh-select .el-input),
:deep(.jh-date .el-input) {
  width: 100%;
}
:deep(.jh-file-upload) {
  width: 100%;
}
```

### 3. 页面滚动

独立表单页内容通常超出视口高度。全局 `.app-page-container` 已设 `height: calc(100vh - 100px); overflow: hidden`（列表页靠表格内部滚动），**表单页必须覆盖 `overflow` 为 `auto`**：

> ⚠️ 不要加 `height: 100%`，否则会产生双滚动条（与全局 height 冲突）。

```scss
.app-page-container {
  overflow-y: auto;
  padding-bottom: 24px;
}
```

### 4. 只看必填项

通过在最外层容器加 CSS class 切换，利用 Element Plus 的 `.is-required` 自动标记来隐藏非必填项。

**关键**：不能只隐藏 `el-form-item`（外层 `el-col` 仍占栅格空间→留白），必须隐藏整个 `el-col` 并让剩余列自动重排。

**组件 props**：接收 `onlyRequired` Boolean prop
**模板**：`:class="{ 'only-required': onlyRequired }"`
**样式**（使用 `:has()` 选择器，Chrome 105+）：

```scss
&.only-required {
  /* 隐藏包含非必填字段的整个 el-col */
  :deep(.el-col:has(> .el-form-item:not(.is-required))) {
    display: none !important;
  }
  /* 让可见列自动重排（4列/行） */
  :deep(.el-row) {
    flex-wrap: wrap;
  }
  :deep(.el-col) {
    flex: 0 0 25% !important;
    max-width: 25% !important;
  }
}
```

### 5. 状态信息区域放置

状态信息（创建时间、修改时间、核实状态等只读字段）**仅在"基本信息"Tab 内展示**（业务表格下方），不放在 el-tabs 外部——否则切换到其他 Tab 时仍然可见，与原型不符。

### 6. 文件上传预览

使用 `jh-file-upload` 时，默认 `list-type="picture"` 会将已上传文件显示在组件下方。如需在框内预览（卡片样式），设 `list-type="picture-card"` + `:limit="1"`：

```vue
<jh-file-upload v-model="form.businessLicense" label="" list-type="picture-card" :limit="1" />
```

### 7. 企业核实 Drawer

客户名称输入框右侧加搜索图标，点击打开 `el-drawer` 展示工商信息（天眼查/企查查），使用 `el-descriptions` 两列表格布局。mock 阶段先用静态数据，后续对接 API。

### 8. 按钮位置

表单页操作按钮（保存、取消等）**左对齐**，放在 `.page-toolbar` 区域（标题行下方、tabs 上方）：

```vue
<div class="page-header">
  <span class="page-title">客户申请详情</span>
  <span class="page-tag page-tag--add">新增</span>
  <span class="page-tag page-tag--status">未审核</span>
  <el-checkbox v-model="onlyRequired" class="only-required-check">只看必填项</el-checkbox>
</div>
<div class="page-toolbar">
  <el-button type="danger" @click="handleSaveAndChange">保存并变更</el-button>
  <el-button type="warning" @click="handleSave">保存</el-button>
  <el-button @click="handleCancel">取消</el-button>
</div>
```

---

### 导入路径规范（@/types/page 桶文件）

> `src/types/page.ts` 是类型桶文件（barrel export），统一重导出 `@jhlc/common-core` 中的常用类型和基类。
> **所有 data.ts 文件必须从 `@/types/page` 导入，禁止直接引用 `@jhlc/common-core/src/...` 的深层路径。**

```typescript
// ✅ 正确：从桶文件导入
import {
  AbstractPageQueryHook,
  BaseQueryItemDesc,
  ActionButtonDesc,
  TableColumnDesc,
  BusLogicDataType
} from "@/types/page";

// ❌ 错误：直接从 common-core 深层路径导入
import { AbstractPageQueryHook } from "@jhlc/common-core/src/page-hooks/page-query-hook.ts";
import { BaseQueryItemDesc } from "@jhlc/common-core/src/components/form/base-query/type.ts";
```

| 导出名                   | 说明                       |
| ------------------------ | -------------------------- |
| `AbstractPageQueryHook`  | 列表页基类                 |
| `BaseQueryItemDesc`      | 查询表单字段描述类型       |
| `ActionButtonDesc`       | 工具栏/操作列按钮描述类型  |
| `TableColumnDesc`        | 表格列描述类型             |
| `BusLogicDataType`       | 业务逻辑类型枚举（如 dict）|

> **例外**：`BaseFormItemDesc`（弹窗表单字段类型）仍直接从 common-core 导入：
> `import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";`
> 因为 `src/types/page.ts` 当前未导出该类型。

---

## api.md 生成时序

> **api.md 在页面代码之前生成**（Step 2: api-contract → Step 3: page-codegen）。
> page-codegen 读取已生成的 api.md 中的 URL 和字段定义，确保 `API_CONFIG`、mock、data.ts 与接口约定一致。
> 未来使用真实 API 设计文档时，api.md 由后端提供或 api-contract Skill 从设计文档提取，page-codegen 直接消费。

---

## SYS_MENU_INFO 生成规则（所有模板通用）

page-codegen 生成页面代码后，**必须追加写入菜单配置信息到 `reports/SYS_MENU_INFO.md`**。

## pages.ts 分组注册规则（Module Federation 子应用）

多页面子应用必须使用与 `wl-mdata` 验证一致的分组模式，禁止扁平追加：

```typescript
import type { SharedPageItem } from "./utils";

type PageTuple = [string, string];
type SubModuleMap = Record<string, PageTuple[]>;

const gProd = (module: string, subModules: SubModuleMap): SharedPageItem[] =>
  Object.entries(subModules).flatMap(([subModule, pages]) =>
    pages.map(([page, label]) => ({
      name: `${module}/${subModule}/${page}/index.vue`,
      label
    }))
  );

const mdataModule = gProd("mdata", {
  model: [
    ["mdata-model-config", "主数据模型配置"],
    ["mdata-attr-mapping", "属性映射管理"]
  ],
  integration: [
    ["mdata-integ-system", "集成系统管理"]
  ]
});

export const list: SharedPageItem[] = mdataModule;
export default list;
```

生成规则：

| 字段 | 规则 |
| --- | --- |
| `module` | 来自项目启动参数 `--module=xxx`，如 `mdata` |
| `subModule` | 来自页面目录第二级，如 `src/views/mdata/model/...` → `model` |
| `page` | 页面 kebab 目录名，如 `mdata-model-config` |
| `name` | `${module}/${subModule}/${page}/index.vue` |
| `label` | 页面中文名 |

> menu-sync 的 `component` 必须与 `pages.ts` 生成的 `name` 完全一致，否则菜单能创建但点击无法加载页面。

### 写入策略（默认追加，不覆盖）

- **默认为追加模式**：保留已有内容，在末尾追加本次生成的菜单。避免覆盖团队之前累积的菜单记录。
- **如需重置**：用户明确说“覆盖”才走覆盖逻辑。

> AI 询问示例（仅当用户意图不明时）：`本次生成了 N 个页面的菜单配置，默认追加到 reports/SYS_MENU_INFO.md，是否需要覆盖已有内容？`

### 生成模板

多级菜单必须先写目录（`type=M`），再在目录下写页面菜单（`type=C`）。格式如下：

```markdown
# 系统菜单配置 — [项目名] [业务模块]

> **module 命名**：`[module]`
> **父级菜单**：来自 `.github/skills/sync/env.local.json` 的 `menu.parentMenuId`

## 一级目录（type=M）

| # | 菜单名 | path | orderNum | 备注 |
| - | ------ | ---- | -------- | ---- |
| 1 | [目录中文名] | `[目录pathCamel]` | 1 | 含 N 个子菜单 |

## 二级菜单（type=C）

### 1. [目录中文名] 子菜单

| 菜单名 | path | component | permission |
| ------ | ---- | --------- | ---------- |
| [页面中文名] | `[pageCamel]` | `[module]/[subModule]/[pageKebab]/index.vue` | `[module]:[pageCamel]:list` |
```

### 字段生成规则

| 字段 | 来源 | 规则 |
|------|------|------|
| 菜单路径 | page-spec.kebabName | kebab-case → camelCase（`mmwr-customer-archive` → `mmwrCustomerArchive`） |
| 菜单名称 | page-spec.pageName | 直接使用中文名 |
| 组件路径 | pages.ts 注册路径 | `[module]/[subModule]/[kebab-目录名]/index.vue` |
| 权限标识 | module + 菜单路径 | `[module]:[pageCamel]:list` |
| 是否隐藏 | page-spec.features.hiddenMenu | `true` → 是，`false` → 否 |
| 上级目录 | 用户指定 / page-spec 推断 | 如果用户在原型扫描阶段指定了上级目录，使用该值 |
| 应用选择 | pages.ts 域名 | `produce` → 生产，`sale` → 销售 |
| 显示排序 | 页面在模块内的序号 | 从 1 开始递增 |

### 隐藏页面判断规则

以下页面类型应设置 `是否隐藏: 是`：
- 目录名含 `-form`（独立路由表单页）
- 目录名含 `-detail`（详情页）
- 目录名含 `-history`（历史查询页）
- page-spec.features.hiddenMenu === true

### SYS_MENU_INFO.md 文件结构

```markdown
# 系统菜单配置 — [项目名] [模块名]

> **父级菜单**：`[parentMenuId]`
> **应用编码**：`[sysAppNo]`
> **module 命名**：`[module]`

## 一级目录（type=M）

| # | 菜单名 | path | orderNum | 备注 |
| - | ------ | ---- | -------- | ---- |
| 1 | [目录名] | `[目录pathCamel]` | 1 | 含 N 个子菜单 |

## 二级菜单（type=C）

### 1. [目录名] 子菜单

| 菜单名 | path | component | permission |
| ------ | ---- | --------- | ---------- |
| [页面名称] | `[pageCamel]` | `[module]/[subModule]/[pageKebab]/index.vue` | `[module]:[pageCamel]:list` |

> pages.ts 对应：`gProd("[module]", { [subModule]: [["[pageKebab]", "[页面名称]"]] })`
```

### 与 menu-sync 的衔接

SYS_MENU_INFO.md 是 menu-sync Skill 的输入数据源：
- **自动创建**：用户说"帮我创建菜单" → menu-sync 读取 SYS_MENU_INFO.md → 调 API 逐条创建
- **手动创建**：用户也可直接按 SYS_MENU_INFO.md 的表格在系统管理后台手动创建菜单
- 两种方式等价，菜单创建后通过 `组件路径` 字段与 pages.ts 注册的文件路径关联
- **自动创建顺序**：必须先调用 `wls_menu_query` 获取当前 domain 菜单树，再 `wls_menu_upsert` 创建/更新一级目录（type=M），拿到目录 id 后再创建二级菜单（type=C）。不得把二级页面全部直接挂到根 `parentMenuId`。

---

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


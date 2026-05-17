# 产品化前端编码指令

> 本文件由 AI 编辑器自动加载（VS Code Copilot / Cursor / Windsurf 等），确保生成代码符合项目规范。
> **前置要求**：AI 首次进入项目时，建议先阅读 `README.md` 了解产品化架构全景。后续对话中依赖本文件的规范约定即可，无需重复扫描。

## 架构

- Vue 3.2 + Vite + TypeScript（strict: false）
- Module Federation **子应用**，路由/权限/布局/Store 从主应用 `main` 远程加载
- UI：Element Plus + @jhlc/jh-ui + @jhlc/common-core
- 样式：Windi CSS + SCSS
- 状态：Pinia
- 页面注册：`vite/plugins/shared/pages.ts` 通过 `gProd()` / `gSale()` 声明
- 菜单路由配置：后端菜单表是唯一数据源。pages.ts 注册组件后，需在系统管理后台 → 菜单管理 → 新增菜单。批量新增页面时可用后端 batchImport 接口，详见 `.github/skills/sync/menu-sync/SKILL.md`

## 页面标准结构（三文件分离 + 接口契约）

```
src/views/[域]/[模块]/[子模块]/[kebab-case目录]/
├── index.vue    ← 纯模板+解构，不写业务逻辑
├── data.ts      ← AbstractPageQueryHook 类 + API_CONFIG
├── index.scss   ← 页面样式（可为空）
└── api.md       ← 接口约定（前端预留 + 后端出接口依据）
```

弹窗组件处理策略：

- **通用弹窗**（新增/编辑表单，2+ 页面可复用）→ 提取到 `src/components/local/c_xxxModal/`
- **极个性弹窗**（仅单页面使用，c_modal 无法满足）→ 放在页面 `components/xxxModal.vue`

## Mock 架构（与页面完全解耦）

> 详细规范见 `docs/mock-architecture.md`

```
mock/
├── _utils.ts              ← 共享工具（pageResult / ok / paginate / nowStr / pick）
└── [业务域]/              ← 镜像 src/views 第一级目录
    └── [模块].ts          ← 每个模块一个文件，export default MockMethod[]
```

- **开关**：`.env.dev` 中 `ENV_MOCK=true/false`，`vite.config.ts` 中 `viteMockServe({ enable: command === "serve" && config.ENV_MOCK !== "false" })`
- **解耦**：mock 文件放在项目根 `mock/` 目录，不在 `src/views` 中 import 任何 mock
- **URL 对齐**：`API_CONFIG` 保持真实路径（如 `/mdata/mdataModel/list`），mock 端点带 `/dev-api` 前缀，关闭 mock 后无需改页面代码
- **STORE 模式**：`let STORE = Array.from({ length: N }, genRecord)` 可变数组，CRUD 直接修改内存，查询立即可见
- **按模块自治**：删某业务 mock 只删对应文件，不影响其他模块
- **一键清理**：`wl-skills mock-clean --domain [域]` 或 `--all`

## data.ts 核心模式

> 配置化驱动，通过 `API_CONFIG` + `class extends AbstractPageQueryHook` 实现零 API 层开发。
> 基类内置 `getAction`/`postAction`/`putAction`/`deleteAction`/`actionBatch` 等 HTTP 方法（详见 `docs/request.md`），标准 CRUD 无需独立 API 文件。

```typescript
import {
  AbstractPageQueryHook,
  BaseQueryItemDesc,
  ActionButtonDesc,
  TableColumnDesc,
  BusLogicDataType
} from "@/types/page";
import { getAction, postAction } from "@jhlc/common-core/src/api/action";

export const API_CONFIG = {
  list: "/[服务缩写]/[资源名]/list",
  remove: "/[服务缩写]/[资源名]/remove",
  getById: "/[服务缩写]/[资源名]/getById",
  save: "/[服务缩写]/[资源名]/save",
  update: "/[服务缩写]/[资源名]/update",
  export: "/[服务缩写]/[资源名]/export"
} as const;

export function createPage(addModalRef?: any) {
  let Page = new (class extends AbstractPageQueryHook {
    constructor() {
      super({ url: { list: API_CONFIG.list, remove: API_CONFIG.remove } });
    }
    queryDef(): BaseQueryItemDesc<any>[] {
      return [
        { name: "fieldName", label: "字段名", placeholder: "请输入" },
        {
          name: "status",
          label: "状态",
          logicType: BusLogicDataType.dict,
          logicValue: "dictCode"
        }
      ];
    }
    toolbarDef(): ActionButtonDesc[] {
      return [
        {
          name: "primary",
          label: "新增",
          plain: true,
          onClick: () => addModalRef?.value?.open()
        }
      ];
    }
    columnsDef(): TableColumnDesc<any>[] {
      return [
        { type: "selection" },
        { type: "index" },
        {
          label: "字段名",
          name: "fieldName",
          minWidth: 120,
          sortable: true,
          filterable: true
        },
        {
          label: "状态",
          name: "status",
          minWidth: 100,
          logicType: BusLogicDataType.dict,
          logicValue: "dictCode",
          sortable: true,
          filterable: true
        }
      ];
    }
  })();
  return Page.create() as any;
}
```

## index.vue 标准模板

```vue
<template>
  <div class="app-container app-page-container">
    <BaseQuery
      :form="queryParam"
      :items="queryItems"
      @select="select"
      @reset="select"
    />
    <BaseToolbar :items="toolbars" />
    <BaseTable
      ref="tableRef"
      render-type="agGrid"
      :cid="TABLE_CID"
      :data="list"
      :columns="columns"
      showToolbar
    />
    <jh-pagination
      v-show="page.total && page.total > 0"
      :total="page.total || 0"
      v-model:currentPage="page.current"
      v-model:pageSize="page.size"
      @current-change="select"
      @size-change="select"
    />
  </div>
</template>

<script setup lang="ts">
import { createPage, TABLE_CID } from "./data";

const Page = createPage();
const {
  tableRef,
  page,
  queryParam,
  list,
  queryItems,
  columns,
  toolbars,
  select
} = Page;

onMounted(() => select());
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

## 命名规范

| 位置         | 规范                    | 示例                             |
| ------------ | ----------------------- | -------------------------------- |
| 目录/路由    | kebab-case              | `ompt-mill-plan/`                |
| pages.ts     | `["kebab名", "中文名"]` | `["ompt-mill-plan", "轧钢计划"]` |
| 字段名       | camelCase               | `orderNo`, `planStatus`          |
| logicValue   | camelCase               | `planStatus`, `plineCode`        |
| 全局组件     | `C_PascalCase/`         | `C_Tree/`                        |
| 局部公共组件 | `c_camelCase/`          | `c_modal/`、`c_detailPanel/`     |
| 页面私有组件 | camelCase               | `addModal.vue`（仅极个性弹窗）   |

## 平台组件速查

| 用途     | 组件           | 来源                             |
| -------- | -------------- | -------------------------------- |
| 查询区   | BaseQuery      | @jhlc/common-core                |
| 工具栏   | BaseToolbar    | @jhlc/common-core                |
| 表格     | BaseTable      | @jhlc/common-core                |
| 分页     | jh-pagination  | @jhlc/jh-ui                      |
| 上下分栏 | jh-drag-row    | @jhlc/jh-ui                      |
| 下拉选择 | jh-select      | @jhlc/jh-ui（dict 属性自动加载） |
| 单日期   | jh-date        | @jhlc/jh-ui                      |
| 日期范围 | jh-date-range  | @jhlc/jh-ui                      |
| 用户选择 | jh-user-picker | @jhlc/jh-ui                      |
| 部门选择 | jh-dept-picker | @jhlc/jh-ui                      |
| 文件上传 | jh-file-upload | @jhlc/jh-ui                      |
| 文本翻译 | jh-text        | @jhlc/jh-ui                      |
| 左右分割 | jh-drag-col    | @jhlc/jh-ui (#left/#right slot)  |
| 树形面板 | C_Tree         | src/components/global            |

## 组件提取策略

| 场景                      | 位置                                  | 命名                    |
| ------------------------- | ------------------------------------- | ----------------------- |
| 3+ 页面复用               | `src/components/global/C_PascalCase/` | 全局自动注册            |
| 2+ 页面复用（如通用弹窗） | `src/components/local/c_camelCase/`   | 按需导入，如 `c_modal/` |
| 仅单页面使用              | 页面 `components/xxxModal.vue`        | 仅当 c_modal 无法满足时 |

## 禁止事项

- ❌ index.vue 中写业务逻辑（逻辑全在 data.ts）
- ❌ 使用 Vuex（用 Pinia）
- ❌ `::v-deep` / `/deep/`（用 `:deep()`）
- ❌ 直接用 axios（用 getAction/postAction）
- ❌ 手写查询表单/工具栏/分页（用 BaseQuery/BaseToolbar/jh-pagination）
- ❌ 每个页面重复写弹窗组件（优先用 `c_modal` 等局部公共组件）


---

## 规范门控（standards/index.md 懒加载）

> ⚠️ 本节为**强制约定**，所有 AI 编辑器/模型都必须遵守。

完整 14 条编码规范拆分在 `.github/standards/01 ~ 14.md`，由 `standards/index.md` 提供任务类型 → 规范子集映射，**按需加载，不全量读取**。

> 任务类型 → 必读规范映射以 `standards/index.md` 为**唯一数据源**，此处不再重复列表。执行前先 `read_file` 加载 `standards/index.md` 确认当前映射。

**执行任何代码生成或改动前**：
1. 先 `read_file` 加载 `standards/index.md` 确认任务类型
2. 按映射读取对应 `standards/0X-*.md`
3. 在 Pre-flight 声明中列出已加载文件

---

## AI Skills 自动调度

完整触发词与 Skill 路径见 `skills/_registry.md`（**单一数据源**，不在此处重复）。

> 🔖 **首选「场景索引」**：`skills/_best-practices.md`
>
> 进入项目对话或开启新任务时，AI 必须先 `read_file` 加载：
>
> 1. `skills/_best-practices.md`（按场景的最佳实践索引，**首选路由依据**）
> 2. `skills/_registry.md`（触发词 → Skill 路径映射）
> 3. `skills/_pipeline.md`（Skill I/O 契约 + 推荐链式顺序）
>
> 三者联合判定后再决定调用哪个 Skill / MCP 工具。**禁止仅凭关键词命中就跳过 best-practices 的语义判断**。
>
> sync 类（菜单/字典/权限）任务必须额外加载 `skills/sync/_mcp-guardrail.md`，调用失败按 §2 自愈剧本引导用户完善配置后重试，不绕开 MCP。

### Intent Router（自然语言智能识别）

用户不需要记住 Skill 名。只要消息包含以下任一语义，AI 必须自动路由到对应 Skill：

| 用户自然表达 | 自动触发 |
| ------------ | -------- |
| 生成页面 / 做个页面 / 列表页 / 管理页 / 台账 / 根据原型 / 根据截图 / 补页面 | `page-codegen`，必要时先 `prototype-scan` + `api-contract` |
| mock / 假数据 / 后端没好 / 先能跑 / 联调前 | `page-codegen` 的 mock-first 规则 |
| 菜单 / 注册页面 / 点击进不来 / 同步菜单 / 补菜单 | `menu-sync` + `route-check` |
| 风格 / 样式不生效 / skills-ui / 操作列 / 状态标签 / AGGrid | `page-codegen` + `wk-skills-ui runtime` + `doctor-ui` |
| 规范检查 / 体检 / 接手项目 / 偏差 | `convention-audit` 或 CLI `validate` |
| 用户提供完整原型/详设/字段或字典资料，且意图为业务梳理/模块沉淀/字段字典维护/待确认事项整理 | `business-doc-extract`（**语义级触发，禁止仅靠关键词命中**；碎片需求默认跳过） |

页面生成类任务命中后，必须读取：

1. `.github/skills/core/page-codegen/SKILL.md`
2. `.github/skills/core/page-codegen/templates/_index.md`
3. 匹配的 `TPL-*.md`
4. `.github/standards/12-base-table.md`
5. 如涉及菜单，读取 `.github/skills/sync/menu-sync/SKILL.md`

### 页面模板硬约束

生成业务表格时，必须同时满足：

- 使用 `AbstractPageQueryHook + BaseQuery + BaseToolbar + BaseTable + jh-pagination`
- `BaseTable` 显式 `render-type="agGrid"`
- `BaseTable` 绑定全局唯一 `cid` / `:cid`
- 列定义使用 `@agile-team/wk-skills-ui/runtime` 的 `defineColumns()`
- 操作列使用 `renderOps()`，禁止 `operations: []`
- 保留 `common-core` 平台骨架，不得生搬硬套 `wk-skills-ui` 通用模板里的 `usePageHook/el-form/el-pagination`
- 生成后建议运行 `wl-skills validate-page <页面目录>` 和 `wl-skills doctor-ui`

**Skill 状态总览 / 路径 / 完整触发词**：见 `skills/_registry.md`（**单一数据源**，新增或激活 Skill 只改这一处）。

**执行规则**：

1. 用户消息匹配 `_registry.md` 触发词 → 用 `read_file` 加载对应 SKILL.md
2. SKILL.md 中标注的"必读 standards"按 standards/index.md 映射加载
3. 在 SKILL.md 指示下输出 **Pre-flight 声明**（强制）

---

## Pre-flight 声明（强制约定式输出）

每次 Skill 触发时，**必须先输出**以下结构的 Pre-flight 声明，再开始执行：

```
🚀 已触发技能 {skill-name}/SKILL.md  → {一句话用途}
✅ 已读取 standards/index.md         → 规范门控
✅ 已读取 standards/{相关条目}        → {一句话说明}
✅ 已读取 {其他必要文档}              → {说明}
✅ 工具链检测：{各项 ✓ / ✗}
✅ {其他前置检查项，如 cid 生成等}
```

**工具链检测失败必须暂停**：

```
❌ 工具链检测失败：未找到 {缺失文件}
   → 请执行：npx @robot-admin/git-standards init
   → 或联系 CHENY（工号 409322）解决
   → ⛔ 任务已暂停，修复后重新触发
```

---

## 报告类文件（reports/）

AI 生成的所有报告类文件统一写入 `.github/reports/`，**全部追加不覆盖**。

| 文件                              | 写入方             | 读取方                |
| --------------------------------- | ------------------ | --------------------- |
| `reports/SYS_MENU_INFO.md`        | page-codegen       | menu-sync             |
| `reports/SYS_DICT_INFO.md`        | dict-collect  | dict-sync             |
| `reports/SYS_PERMISSION_INFO.md` [PLANNED] | permission-collect | permission-sync |
| `reports/规范审查报告.md`          | convention-audit   | 人工 → code-fix       |
| `reports/组件提取建议.md`          | convention-audit   | 人工 → template-extract |

详见 `reports/README.md`。

---

## 组件文档按需查阅

生成代码时如需了解组件用法，按需读取以下文档（不要全量加载）：

| 主题                                | 文档路径                                              |
| ----------------------------------- | ----------------------------------------------------- |
| BaseQuery / BaseTable / BaseToolbar | `src/components/remote/{BaseXxx}/README.md`           |
| jh-* 平台组件                       | `docs/jh-{name}.md`                                   |
| c_formModal / c_listModal 等        | `src/components/local/{c_xxx}/README.md`              |
| AbstractPageQueryHook 最佳实践      | `docs/page-query-hook-best-practices.md`              |
| HTTP 请求工具                       | `docs/request.md`                                     |

> 详细对照表与"何时必读哪个文档"见 `standards/13-platform-components.md`。

---

## 领域样例参考

首次生成某类页面时，可读取 `demo/` 下对应样例：

| 模板类型              | 样例路径                                                |
| --------------------- | ------------------------------------------------------- |
| LIST                  | `demo/produce/aiflow/mmwr-customer-archive/`            |
| FORM_ROUTE            | `demo/produce/aiflow/mmwr-customer-apply-add-form/`     |
| CHANGE_HISTORY        | `demo/produce/aiflow/mmwr-customer-apply-change-history/` |
| DETAIL_TABS           | `demo/produce/aiflow/mmwr-customer-detail/`             |
| MASTER_DETAIL         | `demo/sale/demo/metallurgical-spec/`                    |

---

> 📚 完整指南：`.github/guides/usage.md`
> 🏗️ 架构设计：`.github/guides/architecture.md`
> 🔧 维护者文档：`kit-internal/`（仓库内，不安装到业务项目）

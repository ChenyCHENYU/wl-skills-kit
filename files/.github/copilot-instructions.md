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

## 页面标准结构（4 文件）

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

## data.ts 核心模式

> 配置化驱动，通过 `API_CONFIG` + `class extends AbstractPageQueryHook` 实现零 API 层开发。
> 基类内置 `getAction`/`postAction`/`putAction`/`deleteAction`/`actionBatch` 等 HTTP 方法（详见 `docs/request.md`），标准 CRUD 无需独立 API 文件。

```typescript
import { AbstractPageQueryHook } from "@jhlc/common-core/src/page-hooks/page-query-hook.ts";
import { BaseQueryItemDesc } from "@jhlc/common-core/src/components/form/base-query/type.ts";
import { ActionButtonDesc } from "@jhlc/common-core/src/components/toolbar/type.ts";
import { TableColumnDesc } from "@jhlc/common-core/src/components/table/base-table/type.ts";
import { BusLogicDataType } from "@jhlc/types/src/logical-data";
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
    <BaseTable ref="tableRef" :data="list" :columns="columns" showToolbar />
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
import { createPage } from "./data";

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
| 左右分割 | C_Splitter     | src/components/global            |
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

完整 13 条编码规范拆分在 `.github/standards/01 ~ 13.md`，由 `standards/index.md` 提供任务类型 → 规范子集映射，**按需加载，不全量读取**。

| 任务类型              | 必读规范                                          |
| --------------------- | ------------------------------------------------- |
| A. 生成新页面         | 01, 02, 03, 04, 05, 06, 07, 09, 10, 11, 12, 13   |
| B. 修改/重构现有代码  | 02, 04, 05, 06, 09, 10, 12, 13                    |
| C. 规范审计           | 全部 01 ~ 13                                       |
| D. 模板提取           | 02, 03, 09, 12, 13                                |
| E. 数据同步（菜单等） | 04, 05, 07                                        |
| F. Git/分支/提交      | 08                                                |

**执行任何代码生成或改动前**：
1. 先 `read_file` 加载 `standards/index.md` 确认任务类型
2. 按映射读取对应 `standards/0X-*.md`
3. 在 Pre-flight 声明中列出已加载文件

---

## AI Skills 自动调度

完整触发词与 Skill 路径见 `skills/_registry.md`（**单一数据源**，不在此处重复）。

| Skill 名             | 状态     | 一句话说明                              |
| -------------------- | -------- | --------------------------------------- |
| prototype-scan       | ✅ 启用  | 原型/详设 → page-spec JSON              |
| api-contract         | ✅ 启用  | 生成 api.md 接口约定                    |
| page-codegen         | ✅ 启用  | 4 文件 + 模板调度 + 菜单追加            |
| menu-sync            | ✅ 启用  | reports/SYS_MENU_INFO → 后端菜单接口    |
| convention-audit     | ✅ 启用  | 13 条规范扫描 + 偏差报告 + 提取建议     |
| template-extract     | ✅ 启用  | 现有页面 → 领域模板沉淀                 |
| dict-sync            | ✅ 启用   | 字典数据同步                            |
| permission-sync      | ⏳ PLANNED | 权限数据同步                            |
| code-fix             | ✅ 启用   | 自动整改 🟢🟡 等级偏差                  |

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

---
name: convention-extract
description: "Use when: scanning a Vue project to extract and document coding conventions, file structure rules, naming patterns, component usage patterns, and API writing standards into a reusable conventions document. Triggers on: extract conventions, project standards, coding rules, 提炼规范, 编码规范, 项目扫描规范."
---

# Skill: 规范提炼（convention-extract）

扫描 Vue 项目源码，将隐含的编码规范显式化、固化，供 AI 在代码生成时精确还原项目风格。

**cx-ui-produce 项目的规范已提炼完成并固化在 `.github/copilot-instructions.md` 中。**
以下是完整规范详情，新项目接入时参考「扫描步骤」重新执行。

---

## 已固化规范：cx-ui-produce

### 1. 技术栈

```
Vue 3.2 + Vite + TypeScript（strict: false）
Element Plus 2.x + @jhlc/jh-ui 3.x（自研组件库）
@jhlc/common-core 3.x（查询/表格/工具栏/HTTP/页面Hook基类）
Windi CSS + SCSS
Pinia + pinia-plugin-persistedstate
Module Federation（@originjs/vite-plugin-federation，子应用架构）
```

### 2. 微前端架构

- 本项目是 Module Federation **子应用**（produce 域）
- 路由、权限、布局、Store 均从主应用 `main` 远程加载
- 子应用只负责 `src/views/` 下的业务页面
- 页面在 `vite/plugins/shared/pages.ts` 注册，构建后通过 `exposes` 暴露给主应用
- 共享依赖：vue, pinia, vue-router, element-plus, @jhlc/common-core

### 3. 目录结构

```
src/views/[域]/[模块]/[子模块分组]/[kebab-case-页面目录]/
├── index.vue              ← 纯模板 + createPage 解构，不写业务逻辑
├── data.ts                ← AbstractPageQueryHook 类 + API_CONFIG
├── index.scss             ← 页面样式（可为空）
└── api.md                 ← 接口约定（前端预留 + 后端出接口依据）
```

弹窗组件提取策略：

- **通用弹窗**（2+ 页面复用）→ `src/components/local/c_xxxModal/`（如 `c_modal/`）
- **极个性弹窗**（仅单页面，c_modal 无法满足）→ 页面 `components/xxxModal.vue`

### 4. data.ts 编码模式（核心）

所有页面使用 `class extends AbstractPageQueryHook` 配置化开发：

```typescript
import {
  AbstractPageQueryHook,
  BaseQueryItemDesc,
  ActionButtonDesc,
  TableColumnDesc
} from "@/types/page";
import { getAction, postAction } from "@jhlc/common-core/src/api/action";
import { ElMessage, ElMessageBox } from "element-plus";

// ✅ API 配置：URL 格式为 /[服务缩写]/[资源名CamelCase]/[操作]
export const API_CONFIG = {
  list: "/pm/omptMillPlanOrder/list",
  export: "/pm/omptMillPlanOrder/export",
  remove: "/pm/omptMillPlanOrder/remove",
  getById: "/pm/omptMillPlanOrder/getById",
  save: "/pm/omptMillPlanOrder/save",
  update: "/pm/omptMillPlanOrder/update"
} as const;

// ✅ createPage 工厂：接收弹窗 ref，返回 Page.create()
export function createPage(addModalRef?: any) {
  let Page = new (class extends AbstractPageQueryHook {
    constructor() {
      // super 传入 list 和 remove 的 URL，基类自动处理分页查询和删除
      super({ url: { list: API_CONFIG.list, remove: API_CONFIG.remove } });
    }

    // ✅ 查询条件（BaseQuery 组件数据源）
    queryDef(): BaseQueryItemDesc<any>[] {
      return [
        // 普通输入框（默认）
        { name: "orderNo", label: "订单号", placeholder: "请输入订单号" },
        // 字典下拉（自动加载字典数据）
        {
          name: "planStatus",
          label: "计划状态",
          placeholder: "请选择",
          logicType: BusLogicDataType.dict,
          logicValue: "planStatus"
        },
        // 月份选择器
        {
          name: "orderMonth",
          label: "订单月",
          placeholder: "请选择",
          component: () => ({
            tag: "jh-date",
            type: "month",
            showFormat: "YYYY-MM",
            format: "YYYYMM"
          })
        },
        // 日期范围选择器
        {
          name: "planDate",
          startName: "planStartDate",
          endName: "planEndDate",
          label: "计划时间",
          placeholder: "请选择",
          component: () => ({
            tag: "jh-date",
            type: "daterange",
            rangeSeparator: "至",
            showFormat: "YYYY-MM-DD",
            valueFormat: "YYYY-MM-DD"
          })
        }
      ];
    }

    // ✅ 工具栏按钮（BaseToolbar 组件数据源）
    toolbarDef(): ActionButtonDesc[] {
      return [
        {
          name: "primary",
          label: "新增",
          plain: true,
          onClick: () => addModalRef?.value?.open()
        },
        {
          name: "danger",
          label: "删除",
          plain: true,
          onClick: () => {
            this.actionBatch(
              this.postAction,
              API_CONFIG.remove,
              "确定删除选中数据吗？",
              this.getSelection().map((item) => item.id)
            );
          }
        }
      ];
    }

    // ✅ 表格列（BaseTable 组件数据源）
    columnsDef(): TableColumnDesc<any>[] {
      return [
        { type: "selection" },
        { type: "index" },
        {
          label: "订单号",
          name: "orderNo",
          minWidth: 120,
          sortable: true,
          filterable: true
        },
        // 字典列（自动翻译 value → label）
        {
          label: "计划状态",
          name: "planStatus",
          minWidth: 120,
          logicType: BusLogicDataType.dict,
          logicValue: "planStatus",
          sortable: true,
          filterable: true
        },
        {
          label: "计划重量",
          name: "planWeight",
          minWidth: 120,
          sortable: true,
          filterable: true
        },
        // 操作列
        {
          label: "操作",
          operations: [
            {
              name: "edit",
              label: "编辑",
              onClick: (row) => addModalRef?.value?.open(row.id)
            },
            {
              name: "remove",
              label: "删除",
              onClick: (row) => this.remove(row.id)
            }
          ]
        }
      ];
    }
  })();

  return Page.create() as any;
}
```

### 5. index.vue 模式

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

**强制规则：**

- `<script setup lang="ts">` 必须
- index.vue 里**不写业务逻辑**
- 最外层 class 必须是 `app-container app-page-container`
- 弹窗组件放在根 `</div>` 之后
- 样式用 `@import "./index.scss"`

### 6. API 写法

```typescript
// ✅ 使用 @jhlc/common-core 封装方法
import { getAction, postAction } from "@jhlc/common-core/src/api/action";

// URL 格式：/[服务缩写]/[资源名CamelCase]/[操作]
// 服务缩写如：pm(生产管理)、mmwr(精整)、mmsm(炼钢)、sale(销售)、hrms(人力)

// 分页查询（基类 super({ url }) 自动处理）
// 单条查询
getAction(API_CONFIG.getById, { id });
// 新增 / 编辑
postAction(API_CONFIG.save, formData);
postAction(API_CONFIG.update, formData);
// 删除（单条）
this.remove(row.id); // 基类内置方法
// 批量操作
this.actionBatch(this.postAction, url, "确认提示", ids);
```

详细文档：`docs/request.md`、`docs/page-query-hook-best-practices.md`

### 7. 命名规范

| 位置         | 规范                    | 示例                                 |
| ------------ | ----------------------- | ------------------------------------ |
| 路由/目录    | kebab-case              | `ompt-mill-plan/`                    |
| pages.ts     | `["kebab名", "中文名"]` | `["ompt-mill-plan", "轧钢计划编制"]` |
| 字段名       | camelCase               | `orderNo`, `planStatus`              |
| logicValue   | camelCase               | `planStatus`, `plineCode`            |
| 全局组件     | `C_PascalCase/`         | `C_Tree/`                            |
| 局部组件     | `c_camelCase/`          | `c_modal/`、`c_detailPanel/`         |
| 页面私有组件 | camelCase               | `addModal.vue`（仅极个性弹窗）       |
| API CONFIG   | UPPER_SNAKE（变量名）   | `API_CONFIG`                         |
| 服务缩写     | 小写简写                | `pm`, `mmwr`, `mmsm`, `sale`         |

### 8. 共享业务组件分类与命名

| 分类 | 路径 | 命名 | 职责 | 示例 |
|---|---|---|---|---|
| **通用弹窗** | `src/components/local/c_xxxModal/` | `c_formModal`、`c_modal` | 配置驱动的表单弹窗，多页面复用 | `c_formModal`（CRUD 弹窗） |
| **业务表单容器** | `src/components/local/c_xxxForm/` | `c_customerApplyForm` | 封装多 Tab 表单 + 数据契约（loadData/collectFormData/validate），多页面共享 | `c_customerTabs`（建议重命名为 `c_customerApplyForm`） |
| **配置驱动模板** | `src/components/template/XxxTemplate/` | PascalCase | 布局完全相同的 3+ 页面共用的模板组件，页面仅传 config | `FinishingAchievementTemplate`（7 个精整实绩页共用） |
| **页面私有组件** | `页面目录/components/` | camelCase | 仅单页面使用、c_modal 无法满足的极个性弹窗 | `addModal.vue` |

**命名避坑**：
- ❌ 不要用 `c_xxxTabs` 命名业务表单容器 → 容易与 `el-tabs` / `jh-tabs` 混淆
- ✅ 用 `c_xxxForm` / `c_xxxPanel` 表达其"表单容器"本质

### 9. 路由导航规范（微前端子应用）

| 场景 | 方式 | 原因 |
|---|---|---|
| **菜单页 → 隐藏页**（列表→表单） | `envConfig()?.router.resolve() + location.href` | 父壳需刷新菜单高亮 |
| **隐藏页 → 隐藏页**（表单→变更历史） | `envConfig()?.router.resolve() + location.href` | `router.push()` 跳过 shell 的 `generateCurrentRoute`，导致 "Invalid route component" 报错 |
| **返回上一页** | `useRouter().back()` | 任何页面均可用，无需加载组件 |

> ⚠️ **所有前进导航（无论是否隐藏页）必须用 `location.href`**，`useRouter().push()` 仅用于 `.back()`。

### 10. 样式规范

- Windi CSS 工具类优先
- `:deep()` 替代 `::v-deep` / `/deep/`
- jh-drag-row 必须：`.app-page-container .drager_row { height: 100%; }`
- 所有页面/组件样式统一写在 `index.scss` 中，不可在 template 中大量使用内联 style

### 11. pages.ts 注册

```typescript
// vite/plugins/shared/pages.ts
const moduleName = gProd("base-path", {
  subModuleKey: [["kebab-目录名", "中文名"]]
});
// 导出到 list 数组
export const list: SharedPageItem[] = [...moduleName, ...otherModule];
```

---

## 扫描步骤（新项目时使用）

当接入新项目时，扫描以下文件提炼规范：

1. `package.json` → 技术栈 + 依赖版本
2. `vite.config.ts` / `vite/plugins/` → 构建配置 + 微前端配置
3. 页面注册文件（如 `pages.ts`、`router/index.ts`）→ 路由注册规范
4. `src/views/` 选取 2-3 个典型页面 → 页面结构 + data.ts 模式
5. `src/components/` → 全局/局部组件规范
6. `src/api/` → API 写法规范
7. `src/types/` → 类型规范
8. 组件文档（如 `docs/`）→ 自研组件用法
9. `.env*` / 环境配置文件 → 环境变量

> **如果新项目是空白/刚初始化的**，跳过本步骤，直接复制 cx-ui-produce 的 `.github/copilot-instructions.md` 作为基础模板，按实际修改即可。

输出更新本文件的「已固化规范」部分。

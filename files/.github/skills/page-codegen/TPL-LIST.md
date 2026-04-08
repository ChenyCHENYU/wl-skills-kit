# LIST：标准列表页

> 见 SKILL.md 主文件（约束 + 按钮规则 + Mock 规范等共用规则）。


#### data.ts

```typescript
// 实际项目中统一从桶文件导入（src/types/page.ts）
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

/** 静态下拉选项（无字典 code 时在前端定义） */
const OPTS = {
  [optionKey]: [
    { label: "选项1", value: "value1" },
    { label: "选项2", value: "value2" }
  ]
};

export function createPage(editModalRef?: any) {
  let Page = new (class extends AbstractPageQueryHook {
    constructor() {
      super({ url: { list: API_CONFIG.list, remove: API_CONFIG.remove } });
    }

    queryDef(): BaseQueryItemDesc<any>[] {
      return [
        // 普通输入框
        {
          name: "[fieldName]",
          label: "[中文名]",
          placeholder: "请输入[中文名]"
        },
        // 字典下拉（后端字典表）
        {
          name: "[statusField]",
          label: "[状态名]",
          placeholder: "请选择",
          logicType: BusLogicDataType.dict,
          logicValue: "[dictCode]"
        },
        // 静态下拉（前端定义选项，无字典 code 时使用）
        {
          name: "[selectField]",
          label: "[下拉名]",
          component: () => ({ tag: "jh-select", items: OPTS.[optionKey] })
        },
        // 日期范围（需要 startName/endName）
        {
          name: "[dateField]",
          startName: "[startDate]",
          endName: "[endDate]",
          label: "[日期名]",
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

    toolbarDef(): ActionButtonDesc[] {
      return [
        // name 决定按钮颜色：primary=蓝底, danger=红色, warning=橙色; plain=true 为线框风格
        // 按钮顺序必须与 page-spec toolbar 数组顺序严格一致
        {
          name: "primary",
          label: "新增",
          plain: true,
          onClick: () => editModalRef?.value?.open()
        }
      ];
    }

    columnsDef(): TableColumnDesc<any>[] {
      return [
        { type: "selection" },
        { type: "index" },
        // 普通列
        {
          label: "[列名]",
          name: "[fieldName]",
          minWidth: 120,
          sortable: true,
          filterable: true
        },
        // 字典列（自动翻译）
        {
          label: "[状态名]",
          name: "[statusField]",
          minWidth: 120,
          logicType: BusLogicDataType.dict,
          logicValue: "[dictCode]",
          sortable: true,
          filterable: true
        },
        // 操作列（如需要行内编辑/删除按钮）
        {
          label: "操作",
          width: 150,
          fixed: "right",
          operations: [
            {
              name: "edit",
              label: "编辑",
              onClick: (row: any) => editModalRef?.value?.open(row.id)
            },
            {
              name: "remove",
              label: "删除",
              onClick: (row: any) => this.remove(row.id)
            }
          ]
        }
      ];
    }
  })();

  return (Page as any).create() as any;
}
```

#### index.vue

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

#### index.scss

```scss
// 页面特有样式（无特殊需求可留空）
```

---

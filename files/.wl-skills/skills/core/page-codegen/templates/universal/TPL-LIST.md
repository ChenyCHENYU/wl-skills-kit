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
import { ElMessage } from "element-plus";
import { defineColumns, renderOps } from "@agile-team/wk-skills-ui/runtime";

export const TABLE_CID = "[pageAbbr]-[base36Timestamp]";

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
        },
        {
          label: "导出",
          plain: true,
          onClick: () => ElMessage.info("导出逻辑待业务确认")
        }
      ];
    }

    columnsDef(): TableColumnDesc<any>[] {
      return defineColumns([
        { type: "selection", width: 55, fixed: "left", align: "center", headerAlign: "center" },
        { type: "index", label: "序号", width: 60, align: "center" },
        // 普通列
        {
          label: "[列名]",
          name: "[fieldName]",
          cid: `${TABLE_CID}-[fieldName]`,
          minWidth: 120,
          sortable: true,
          filterable: true
        },
        // 字典列（自动翻译）
        {
          label: "[状态名]",
          name: "[statusField]",
          cid: `${TABLE_CID}-[statusField]`,
          minWidth: 120,
          logicType: BusLogicDataType.dict,
          logicValue: "[dictCode]",
          sortable: true,
          filterable: true
        },
        // 操作列（如需要行内编辑/删除按钮）
        {
          label: "操作",
          name: "_action",
          cid: `${TABLE_CID}-action`,
          width: 150,
          fixed: "right",
          align: "center",
          defaultSlot: ({ row }: any) =>
            renderOps([
              { type: "edit", onClick: () => editModalRef?.value?.open(row.id) },
              { type: "del", onClick: () => this.remove(row.id) }
            ])
        }
      ] as any) as TableColumnDesc<any>[];
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
  select,
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

#### mock/[页面kebab-name].ts

```typescript
import type { MockMethod } from "vite-plugin-mock";

const dataPool = Array.from({ length: 23 }).map((_, index) => ({
  id: String(index + 1),
  name: `模拟数据${index + 1}`,
  status: index % 2 === 0 ? "1" : "0",
  remark: "由 vite-plugin-mock 提供，关闭 ENV_MOCK 后直接走真实接口",
}));

function pageList(query: any) {
  const current = Number(query?.current || query?.pageNum || 1);
  const size = Number(query?.size || query?.pageSize || 10);
  const start = (current - 1) * size;
  return {
    code: 2000,
    message: "success",
    data: {
      records: dataPool.slice(start, start + size),
      total: dataPool.length,
      current,
      size,
    },
  };
}

export default [
  {
    url: "/dev-api/[服务缩写]/[资源名]/list",
    method: "get",
    response: ({ query }: any) => pageList(query),
  },
  {
    url: "/dev-api/[服务缩写]/[资源名]/remove",
    method: "post",
    response: ({ body, query }: any) => {
      const id = body?.id || query?.id;
      const ids = body?.ids || (id ? [id] : []);
      ids.forEach((itemId: string) => {
        const index = dataPool.findIndex((item) => item.id === String(itemId));
        if (index >= 0) dataPool.splice(index, 1);
      });
      return { code: 2000, message: "删除成功", data: null };
    },
  },
  {
    url: "/dev-api/[服务缩写]/[资源名]/save",
    method: "post",
    response: ({ body }: any) => {
      const row = { id: String(Date.now()), ...body };
      dataPool.unshift(row);
      return { code: 2000, message: "新增成功", data: row };
    },
  },
  {
    url: "/dev-api/[服务缩写]/[资源名]/update",
    method: "post",
    response: ({ body }: any) => {
      const index = dataPool.findIndex((item) => item.id === String(body?.id));
      if (index >= 0) Object.assign(dataPool[index], body);
      return { code: 2000, message: "更新成功", data: dataPool[index] || body };
    },
  },
  {
    url: "/dev-api/[服务缩写]/[资源名]/getById",
    method: "get",
    response: ({ query }: any) => ({
      code: 2000,
      message: "success",
      data: dataPool.find((item) => item.id === String(query?.id)) || null,
    }),
  },
] as MockMethod[];
```

---

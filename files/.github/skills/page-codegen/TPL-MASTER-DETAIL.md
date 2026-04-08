# MASTER_DETAIL：主从表页

> 见 SKILL.md 主文件（约束 + 按钮规则 + Mock 规范等共用规则）。


#### data.ts（额外部分）

在标准 createPage 基础上，增加 createBottomPage：

```typescript
// ... 同模板 A 的 imports 和 API_CONFIG（增加从表相关 URL）
export const API_CONFIG = {
  list: "/[服务缩写]/[主资源]/list",
  remove: "/[服务缩写]/[主资源]/remove",
  // ...标准 CRUD
  bottomList: "/[服务缩写]/[从资源]/list" // 从表查询
} as const;

export function createPage(/* refs */) {
  // ... 主表同模板 A
}

// 双击主表行 → 加载从表数据
export function handleRowDblclick(
  row: any,
  bottomSelect: Function,
  BottomPage: any
) {
  BottomPage.queryParam.value.mainId = row.id;
  BottomPage.tableRef.value.loading();
  getAction(API_CONFIG.bottomList, BottomPage.queryParam.value)
    .then((res) => {
      BottomPage.list.value = res.data;
      BottomPage.tableRef.value.clearSelection();
    })
    .finally(() => {
      BottomPage.tableRef.value.closeLoading();
    });
}

// 从表 Hook
export function createBottomPage() {
  let Page = new (class extends AbstractPageQueryHook {
    constructor() {
      super({ url: { list: API_CONFIG.bottomList } });
    }
    queryDef(): BaseQueryItemDesc<any>[] {
      return [];
    }
    toolbarDef(): ActionButtonDesc[] {
      return [];
    }
    columnsDef(): TableColumnDesc<any>[] {
      return [
        { type: "index" }
        // 从表字段
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
    <jh-drag-row :top-height="350">
      <template #top>
        <BaseQuery
          :form="queryParam"
          :items="queryItems"
          @select="select"
          @reset="select"
        />
        <BaseToolbar :items="toolbars" />
        <BaseTable
          ref="tableRef"
          :data="list"
          :columns="columns"
          showToolbar
          @row-dblclick="
            (row) => handleRowDblclick(row, bottomSelect, BottomPage)
          "
        />
        <jh-pagination
          v-show="page.total && page.total > 0"
          :total="page.total || 0"
          v-model:currentPage="page.current"
          v-model:pageSize="page.size"
          @current-change="select"
          @size-change="select"
        />
      </template>
      <template #bottom>
        <BaseToolbar :items="bottomToolbars" />
        <BaseTable
          ref="bottomTableRef"
          :data="bottomList"
          :columns="bottomColumns"
          showToolbar
        />
      </template>
    </jh-drag-row>
  </div>
</template>

<script setup lang="ts">
import { createPage, createBottomPage, handleRowDblclick } from "./data";

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

const BottomPage = createBottomPage();
const {
  tableRef: bottomTableRef,
  list: bottomList,
  columns: bottomColumns,
  select: bottomSelect,
  toolbars: bottomToolbars
} = BottomPage;

onMounted(() => select());
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

#### index.scss

```scss
.app-page-container .drager_row {
  height: 100%;
}

.base-toolbar-box {
  margin-bottom: 4px;
}
```

---

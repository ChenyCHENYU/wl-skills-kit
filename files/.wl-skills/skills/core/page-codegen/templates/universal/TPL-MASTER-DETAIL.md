# MASTER_DETAIL：主从表页

主从表各创建一份 `usePageQuery`，共同放在一个页面对象中。主表选择、明细关联键、清空规则留在本页，表格查询与分页复用同一份组合函数，不增加主从表适配器。有效的旧类式页面和显式 scenario 产物继续兼容。

首次使用时按 [TPL-LIST](TPL-LIST.md) 安装组合函数。下面展示已确认双击主表加载分页明细的查询场景；主表 CRUD 按 TPL-LIST 添加已声明的动作，明细独立维护、关联键和查询方法以实际 page-spec/API 契约为准。

> 见 SKILL.md 的共用约束，布局复用 `jh-drag-row`。

#### data.ts

```typescript
import { proxyRefs, ref } from "vue";
import type { BaseQueryItemDesc, TableColumnDesc } from "@/types/page";
import { postAction } from "@jhlc/common-core/src/api/action";
import { defineColumns } from "@agile-team/wl-skills-ui/runtime";
import { usePageQuery } from "@/composables/usePageQuery";

type MasterRow = { id: string; name: string };
type DetailRow = { id: string; name: string };
type MasterQuery = { name: string };
type DetailQuery = { mainId?: string };

export const TABLE_CID = "[稳定页面CID]";
export const DETAIL_TABLE_CID = `${TABLE_CID}-detail`;
export const PAGE_SIZES = [10, 20, 50, 100, 200];
export const API_CONFIG = {
  list: "/[服务]/[主资源]/queryPage",
  detailList: "/[服务]/[从资源]/queryPage"
};
export const queryItems: BaseQueryItemDesc<MasterQuery>[] = [
  { name: "name", label: "名称", placeholder: "请输入名称" }
];
export const columns = defineColumns([
  { type: "index", label: "序号", width: 60, align: "center" },
  { name: "name", label: "名称", cid: `${TABLE_CID}-name`, minWidth: 120 }
] satisfies TableColumnDesc<MasterRow>[]);
export const detailColumns = defineColumns([
  { type: "index", label: "序号", width: 60, align: "center" },
  {
    name: "name",
    label: "明细名称",
    cid: `${DETAIL_TABLE_CID}-name`,
    minWidth: 120
  }
] satisfies TableColumnDesc<DetailRow>[]);

export function createPage() {
  const masterTableRef = ref();
  const detailTableRef = ref();
  const selectedMaster = ref<MasterRow>();
  const page = proxyRefs({
    // 两个查询对象各自负责本表，模板不需要铺开两套字段清单。
    master: proxyRefs(
      usePageQuery<MasterRow, MasterQuery>({
        initialQuery: () => ({ name: "" }),
        pageSizes: PAGE_SIZES,
        request: (query, paging) =>
          postAction(API_CONFIG.list, {
            ...query,
            current: paging.current,
            size: paging.size
          }),
        loading: (active) =>
          active
            ? masterTableRef.value?.loading?.()
            : masterTableRef.value?.closeLoading?.(),
        updated: () => {
          // 主表刷新后丢弃旧选择，同时令尚未返回的明细请求失效。
          selectedMaster.value = undefined;
          page.detail.clear();
        }
      })
    ),
    detail: proxyRefs(
      usePageQuery<DetailRow, DetailQuery>({
        initialQuery: () => ({}),
        fixedQuery: () => ({ mainId: selectedMaster.value?.id }),
        beforeSelect: () => Boolean(selectedMaster.value?.id),
        pageSizes: PAGE_SIZES,
        request: (query, paging) =>
          postAction(API_CONFIG.detailList, {
            ...query,
            current: paging.current,
            size: paging.size
          }),
        loading: (active) =>
          active
            ? detailTableRef.value?.loading?.()
            : detailTableRef.value?.closeLoading?.()
      })
    ),
    masterTableRef,
    detailTableRef,
    selectMaster: async (row: MasterRow): Promise<void> => {
      selectedMaster.value = row;
      // 主表换行后先清空旧明细，再从第一页加载新行的明细。
      page.detail.clear();
      await page.detail.search();
    }
  });
  return page;
}
```

#### index.vue

```vue
<template>
  <div class="app-container app-page-container">
    <jh-drag-row :top-height="350">
      <template #top>
        <BaseQuery
          :form="vm.master.query"
          :items="queryItems"
          :auto-select="false"
          @select="vm.master.search"
          @reset="vm.master.reset"
        />
        <BaseTable
          ref="masterTableRef"
          render-type="agGrid"
          :cid="TABLE_CID"
          :data="vm.master.rows"
          :columns="columns"
          row-id="id"
          row-key="id"
          show-toolbar
          @row-dblclick="vm.selectMaster"
        />
        <div class="list-page__pager">
          <jh-pagination
            v-show="vm.master.page.total > 0"
            v-model:currentPage="vm.master.page.current"
            v-model:pageSize="vm.master.page.size"
            :page-sizes="PAGE_SIZES"
            :total="vm.master.page.total"
            @current-change="vm.master.select"
            @size-change="vm.master.search"
          />
        </div>
      </template>
      <template #bottom>
        <BaseTable
          ref="detailTableRef"
          render-type="agGrid"
          :cid="DETAIL_TABLE_CID"
          :data="vm.detail.rows"
          :columns="detailColumns"
          row-id="id"
          row-key="id"
          show-toolbar
        />
        <div class="list-page__pager">
          <jh-pagination
            v-show="vm.detail.page.total > 0"
            v-model:currentPage="vm.detail.page.current"
            v-model:pageSize="vm.detail.page.size"
            :page-sizes="PAGE_SIZES"
            :total="vm.detail.page.total"
            @current-change="vm.detail.select"
            @size-change="vm.detail.search"
          />
        </div>
      </template>
    </jh-drag-row>
  </div>
</template>

<script setup lang="ts">
import { toRef, onMounted } from "vue";
import {
  createPage,
  TABLE_CID,
  DETAIL_TABLE_CID,
  PAGE_SIZES,
  queryItems,
  columns,
  detailColumns
} from "./data";

const vm = createPage();
const masterTableRef = toRef(vm, "masterTableRef");
const detailTableRef = toRef(vm, "detailTableRef");
onMounted(() => vm.master.select());
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

.list-page__pager {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
  padding: 12px 0 0;
}
```

当前示例约定主表刷新后清空明细；其他页面若需保留所选行，应在本页明确校验该行仍存在。查询字段、选择事件和刷新策略由页面决定，不放进通用组合函数。

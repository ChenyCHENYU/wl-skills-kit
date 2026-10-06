# TREE_LIST：树形+列表

与 [TPL-LIST](TPL-LIST.md) 共用 `usePageQuery`，树节点选择和新增上下文留在本页。公开成员直接声明在页面对象中，私有树节点 ID 留在函数内；每次调用独立创建状态。有效的旧类式页面和显式 scenario 产物继续兼容。

首次使用时按 TPL-LIST 安装同一份组合函数，后续直接导入；不另建树表适配器。以下示例假设已确认分页、新增、修改、删除及树节点 `treeId` 上下文契约，字段、方法和路径须按当前 Delivery Profile 替换。

> 见 SKILL.md 的共用约束。布局使用 `jh-drag-col`，树组件复用项目 `C_Tree`。

#### data.ts

```typescript
import { proxyRefs, ref, type Ref } from "vue";
import type CFormModal from "@/components/local/c_formModal/index.vue";
import type {
  BaseQueryItemDesc,
  TableColumnDesc,
  ActionButtonDesc
} from "@/types/page";
import {
  deleteAction,
  getAction,
  postAction
} from "@jhlc/common-core/src/api/action";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineColumns, renderOps } from "@agile-team/wl-skills-ui/runtime";
import { usePageQuery } from "@/composables/usePageQuery";

type TreeNode = { id: string; label: string; children?: TreeNode[] };
type Row = { id: string; name: string; treeId?: string };
type Query = { name: string; treeId?: string };

export const TABLE_CID = "[稳定页面CID]";
export const PAGE_SIZES = [10, 20, 50, 100, 200];
export const API_CONFIG = {
  tree: "/[服务]/[树资源]/tree",
  list: "/[服务]/[资源]/queryPage",
  remove: "/[服务]/[资源]/deleteById/{id}",
  getById: "/[服务]/[资源]/getById/{id}",
  save: "/[服务]/[资源]/save",
  update: "/[服务]/[资源]/updateById"
};
export const queryItems: BaseQueryItemDesc<Query>[] = [
  { name: "name", label: "名称", placeholder: "请输入名称" }
];
export const modalConfig = {
  titlePrefix: "[业务名称]",
  api: {
    getById: API_CONFIG.getById,
    save: API_CONFIG.save,
    update: API_CONFIG.update
  },
  formItems: [{ name: "name", label: "名称", placeholder: "请输入名称" }]
};

export function createPage(
  modalRef: Ref<InstanceType<typeof CFormModal> | undefined>
) {
  const tableRef = ref();
  const selectedNodeId = ref<string>();
  const list = usePageQuery<Row, Query>({
    initialQuery: () => ({ name: "" }),
    // 搜索和重置都保留所选树节点；上下文不接受查询框覆盖。
    fixedQuery: () => ({ treeId: selectedNodeId.value }),
    pageSizes: PAGE_SIZES,
    request: (query, page) =>
      postAction(API_CONFIG.list, {
        ...query,
        current: page.current,
        size: page.size
      }),
    loading: (active) =>
      active ? tableRef.value?.loading?.() : tableRef.value?.closeLoading?.()
  });
  const remove = async (row: Row) => {
    await ElMessageBox.confirm("确认删除该记录吗？", "删除确认", {
      type: "warning"
    });
    await deleteAction(
      API_CONFIG.remove.replace("{id}", encodeURIComponent(row.id)),
      {}
    );
    ElMessage.success("删除成功");
    await list.selectAfterDeletion();
  };
  const page = proxyRefs({
    ...list,
    tableRef,
    treeData: ref<TreeNode[]>([]),
    selectNode: async (node: TreeNode): Promise<void> => {
      selectedNodeId.value = node.id;
      await page.search();
    },
    initialize: async (): Promise<void> => {
      const response = await getAction(API_CONFIG.tree);
      // 树响应与分页响应分别按接口契约映射，不猜测多种响应结构。
      page.treeData = response.data || [];
      await page.select();
    },
    toolbars: [
      {
        name: "primary",
        label: "新增",
        onClick: () => modalRef.value?.open({ treeId: selectedNodeId.value })
      }
    ] satisfies ActionButtonDesc[],
    columns: defineColumns([
      { type: "index", label: "序号", width: 60, align: "center" },
      { name: "name", label: "名称", cid: `${TABLE_CID}-name`, minWidth: 120 },
      {
        label: "操作",
        name: "_action",
        cid: `${TABLE_CID}-action`,
        width: 140,
        fixed: "right",
        align: "center",
        defaultSlot: ({ row }: { row: Row }) =>
          renderOps([
            {
              type: "edit",
              label: "修改",
              onClick: () => modalRef.value?.edit(row)
            },
            { type: "del", label: "删除", onClick: () => remove(row) }
          ])
      }
    ] satisfies TableColumnDesc<Row>[])
  });
  return page;
}
```

#### index.vue

```vue
<template>
  <div class="app-container app-page-container">
    <jh-drag-col :left-width="220">
      <template #left>
        <C_Tree
          :tree-data="vm.treeData"
          :show-search="true"
          @node-click="vm.selectNode"
        />
      </template>
      <template #right>
        <BaseQuery
          :form="vm.query"
          :items="queryItems"
          :auto-select="false"
          @select="vm.search"
          @reset="vm.reset"
        />
        <BaseToolbar size="small" :items="vm.toolbars" />
        <BaseTable
          ref="tableRef"
          render-type="agGrid"
          :cid="TABLE_CID"
          :data="vm.rows"
          :columns="vm.columns"
          row-id="id"
          row-key="id"
          show-toolbar
        />
        <div class="list-page__pager">
          <jh-pagination
            v-show="vm.page.total > 0"
            v-model:currentPage="vm.page.current"
            v-model:pageSize="vm.page.size"
            :page-sizes="PAGE_SIZES"
            :total="vm.page.total"
            @current-change="vm.select"
            @size-change="vm.search"
          />
        </div>
      </template>
    </jh-drag-col>
    <c_formModal ref="modalRef" v-bind="modalConfig" @ok="vm.search" />
  </div>
</template>

<script setup lang="ts">
import { ref, toRef, onMounted } from "vue";
import c_formModal from "@/components/local/c_formModal/index.vue";
import {
  createPage,
  TABLE_CID,
  PAGE_SIZES,
  queryItems,
  modalConfig
} from "./data";

const modalRef = ref<InstanceType<typeof c_formModal>>();
const vm = createPage(modalRef);
const tableRef = toRef(vm, "tableRef");
onMounted(() => vm.initialize());
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

#### index.scss

```scss
.app-page-container {
  height: 100%;
}

.list-page__pager {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
  padding: 12px 0 0;
}
```

`C_Tree` 的 Props 和事件以项目组件 README 为准。组件缺失时执行 `wl-skills component ensure --components C_Tree` 预览并确认，将文件落到 `src/components/global/C_Tree/`；应用运行时不引用 `.wl-skills`。

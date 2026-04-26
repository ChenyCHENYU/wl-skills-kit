# TREE_LIST：树形+列表

> 见 SKILL.md 主文件（约束 + 按钮规则 + Mock 规范等共用规则）。


#### index.vue

```vue
<template>
  <div class="app-container app-page-container">
    <C_Splitter :left-width="220">
      <template #left>
        <C_Tree
          :tree-data="treeData"
          :show-search="true"
          @node-click="handleNodeClick"
        />
      </template>
      <template #right>
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
      </template>
    </C_Splitter>
  </div>
</template>

<script setup lang="ts">
import { createPage, loadTree } from "./data";

const Page = createPage();
const {
  tableRef,
  page,
  queryParam,
  list,
  treeData,
  queryItems,
  columns,
  toolbars,
  select,
  handleNodeClick
} = Page;

onMounted(() => {
  loadTree();
  select();
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

#### data.ts

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
  tree: "/[服务缩写]/[树资源]/tree",
  list: "/[服务缩写]/[主资源]/list",
  remove: "/[服务缩写]/[主资源]/remove",
  getById: "/[服务缩写]/[主资源]/getById",
  save: "/[服务缩写]/[主资源]/save",
  update: "/[服务缩写]/[主资源]/update"
} as const;

// ===== 树形数据 =====
const treeData = ref<any[]>([]);
let currentNodeId: string | undefined;

export async function loadTree() {
  const res = await getAction(API_CONFIG.tree);
  treeData.value = res.result || res.data || res;
}

export function createPage(editModalRef?: any) {
  let _editModalRef = editModalRef;

  let Page = new (class extends AbstractPageQueryHook {
    constructor() {
      super({ url: { list: API_CONFIG.list, remove: API_CONFIG.remove } });
    }

    queryDef(): BaseQueryItemDesc<any>[] {
      return [
        { name: "[fieldName]", label: "[中文名]", placeholder: "请输入" }
      ];
    }

    toolbarDef(): ActionButtonDesc[] {
      return [
        {
          name: "primary",
          label: "新增",
          onClick: () => _editModalRef?.value?.open()
        },
        {
          name: "danger",
          label: "删除",
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) return ElMessage.warning("请先选择数据");
            this.removeBatch();
          }
        }
      ];
    }

    columnsDef(): TableColumnDesc<any>[] {
      return [
        { type: "selection" },
        { type: "index" },
        { label: "[字段名]", name: "[fieldName]", minWidth: 120 },
        {
          label: "操作",
          width: 140,
          fixed: "right",
          operations: [
            {
              name: "edit",
              label: "编辑",
              onClick: (row: any) => _editModalRef?.value?.edit(row.id)
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

  const created = (Page as any).create() as any;

  // ⭐ 树节点点击 → 过滤右侧列表
  function handleNodeClick(data: any) {
    currentNodeId = data.id;
    created.queryParam.value.treeId = data.id;
    created.page.current = 1;
    created.select();
  }

  return {
    ...created,
    treeData,
    handleNodeClick
  };
}
```

#### index.scss

```scss
.app-page-container {
  // C_Splitter 需要父容器撑满高度
  :deep(.my-splitter-container) {
    height: 100%;
  }
}
```

> **C_Tree Props 速查**：`tabs`（标签页数组）、`treeData`（必填）、`showSearch`（默认 true）、`defaultExpandAll`（默认 true）。
> **Events**：`@node-click`（节点点击）、`@tab-change`（标签页切换）。
> 详见 `src/components/global/C_Tree/README.md`。

---

# TREE_LIST：树形+列表

> 见 SKILL.md 主文件（约束 + 按钮规则 + Mock 规范等共用规则）。
> **布局约束**：必须用 `jh-drag-col`（详 standards/14-layout-containers.md）。

#### index.vue

```vue
<template>
  <div class="app-container app-page-container" style="height: 100%">
    <jh-drag-col :leftWidth="220">
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
      </template>
    </jh-drag-col>
  </div>
</template>

<script setup lang="ts">
import { createPage, loadTree, TABLE_CID } from "./data";

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
  handleNodeClick,
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
  BusLogicDataType,
} from "@/types/page";
import { deleteAction, getAction, postAction } from "@jhlc/common-core/src/api/action";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineColumns, renderOps } from "@agile-team/wl-skills-ui/runtime";

export const TABLE_CID = "[pageAbbr]-[base36Timestamp]";

export const API_CONFIG = {
  tree: "/[服务缩写]/[树资源]/tree",
  list: "/[服务缩写]/[主资源]/queryPage",
  remove: "/[服务缩写]/[主资源]/deleteById/{id}",
  getById: "/[服务缩写]/[主资源]/getById/{id}",
  save: "/[服务缩写]/[主资源]/save",
  update: "/[服务缩写]/[主资源]/updateById",
} as const;
const resolveApiPath = (template: string, id: string) =>
  template.replace("{id}", encodeURIComponent(id));

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
      super({ url: { list: API_CONFIG.list } });
    }

    queryDef(): BaseQueryItemDesc<any>[] {
      return [
        { name: "[fieldName]", label: "[中文名]", placeholder: "请输入" },
      ];
    }

    toolbarDef(): ActionButtonDesc[] {
      return [
        {
          name: "primary",
          label: "新增",
          onClick: () => _editModalRef?.value?.open(),
        },
        // 批量删除仅在契约显式声明 batchDelete operation 后生成；不得复用单删 URL
      ];
    }

    columnsDef(): TableColumnDesc<any>[] {
      return defineColumns([
        {
          type: "selection",
          width: 55,
          fixed: "left",
          align: "center",
          headerAlign: "center",
        },
        { type: "index", label: "序号", width: 60, align: "center" },
        {
          label: "[字段名]",
          name: "[fieldName]",
          cid: `${TABLE_CID}-[fieldName]`,
          minWidth: 120,
        },
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
                onClick: () => _editModalRef?.value?.edit(row.id),
              },
              { type: "del", onClick: () => this.deleteById(row.id) },
            ]),
        },
      ] as any) as TableColumnDesc<any>[];
    }

    async deleteById(id: string) {
      await ElMessageBox.confirm("确认删除该记录吗？", "提示", { type: "warning" });
      await deleteAction(resolveApiPath(API_CONFIG.remove, id), {});
      ElMessage.success("删除成功");
      await this.select();
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
    handleNodeClick,
  };
}
```

#### index.scss

```scss
.app-page-container {
  // jh-drag-col 需要父容器擑满高度
  height: 100%;
}
```

> **C_Tree Props 速查**：`tabs`（标签页数组）、`treeData`（必填）、`showSearch`（默认 true）、`defaultExpandAll`（默认 true）。
> **Events**：`@node-click`（节点点击）、`@tab-change`（标签页切换）。
> 详见 `.wl-skills/src/components/global/C_Tree/README.md`。
> 生成前执行 `wl-skills component ensure --components C_Tree` 预览并确认，将运行文件按需落盘到 `src/components/global/C_Tree/`；禁止让 Vite 直接引用 `.wl-skills`。

---

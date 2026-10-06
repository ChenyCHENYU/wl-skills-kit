# LIST：标准列表页

新页面推荐平铺的字段数组、页面函数和 `usePageQuery`，继续使用项目的 BaseQuery、BaseToolbar、BaseTable、分页器与表单弹窗。类式 `AbstractPageQueryHook` 存量和显式选择的 scenario 编译产物继续兼容。

页面状态和事件较多时，在函数内用 Vue 的 `proxyRefs` 声明一个页面对象，最后 `return page`；视图通过 `vm.query` 等属性直接绑定。公开成员只定义一次，私有请求及辅助函数保留局部变量，不再重复列返回值和模板解构。Vue 3.5 及以上的原生组件引用可在函数内用 `useTemplateRef` 绑定；下面的 `ref` / `toRef(vm, "tableRef")` 写法同时兼容旧 Vue。不对整页执行 `toRefs`。每次调用都创建独立状态，不把可变对象放到模块顶层。简单页面的直接返回、解构或已有 Hook 写法继续兼容。

首次使用时，将 `templates/composables/usePageQuery.ts` 按需复制到项目 `src/composables/usePageQuery.ts`，后续页面直接导入。已有同名实现先检查其契约，兼容则复用，不能自动覆盖。需要列分组、列 CID 补全或字段转换时才使用同目录的 `useBaseTable.ts`；普通原生列不必再包一层。模板源仅供生成，应用运行时不得导入 `.wl-skills`。

以下展示已确认有查询、新增、修改、删除的列表。按实际 page-spec/API 契约替换业务名称、字段、路径、字典和 Delivery Profile；未声明的动作不要生成。组合函数只管理列表生命周期，弹窗和业务动作仍写在当前页 `data.ts`，不复制炼钢的字段模型、组件或 shared。

#### data.ts

```typescript
import { proxyRefs, ref, type Ref } from "vue";
import type CFormModal from "@/components/local/c_formModal/index.vue";
import type {
  BaseQueryItemDesc,
  TableColumnDesc,
  ActionButtonDesc
} from "@/types/page";
import { BusLogicDataType } from "@/types/page";
import { postAction, deleteAction } from "@jhlc/common-core/src/api/action";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineColumns, renderOps } from "@agile-team/wl-skills-ui/runtime";
import { usePageQuery } from "@/composables/usePageQuery";

type Row = { id: string; name: string; status: string };
type Query = { name: string; status: string };

// 现有页面保留原 CID；新页面只生成一次，不能每次启动重新计算。
export const TABLE_CID = "[稳定页面CID]";
export const PAGE_SIZES = [10, 20, 50, 100, 200];
export const API_CONFIG = {
  list: "/[服务]/[资源]/queryPage",
  remove: "/[服务]/[资源]/deleteById/{id}",
  getById: "/[服务]/[资源]/getById/{id}",
  save: "/[服务]/[资源]/save",
  update: "/[服务]/[资源]/updateById"
};

export const queryItems: BaseQueryItemDesc<Query>[] = [
  { name: "name", label: "名称", placeholder: "请输入名称" },
  {
    name: "status",
    label: "状态",
    placeholder: "请选择",
    logicType: BusLogicDataType.dict,
    logicValue: "[字典code]"
  }
];

export const modalConfig = {
  titlePrefix: "[业务名称]",
  api: {
    getById: API_CONFIG.getById,
    save: API_CONFIG.save,
    update: API_CONFIG.update
  },
  formItems: [
    { name: "name", label: "名称", placeholder: "请输入名称" },
    {
      name: "status",
      label: "状态",
      logicType: BusLogicDataType.dict,
      logicValue: "[字典code]"
    }
  ]
};

export function createPage(
  modalRef: Ref<InstanceType<typeof CFormModal> | undefined>
) {
  const tableRef = ref();
  const list = usePageQuery<Row, Query>({
    initialQuery: () => ({ name: "", status: "" }),
    page: { current: 1, size: 10 },
    pageSizes: PAGE_SIZES,
    // 请求方法、字段及响应映射以当前页面接口契约为准。
    request: (params, paging) =>
      postAction(API_CONFIG.list, {
        name: params.name,
        status: params.status,
        current: paging.current,
        size: paging.size
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
  // 只展开组合函数返回的普通对象；类实例不能展开，避免丢失原型方法。
  const page = proxyRefs({
    ...list,
    tableRef,
    toolbars: [
      { name: "primary", label: "新增", onClick: () => modalRef.value?.open() }
    ] satisfies ActionButtonDesc[],
    columns: defineColumns([
      { type: "index", label: "序号", width: 60, align: "center" },
      { name: "name", label: "名称", cid: `${TABLE_CID}-name`, minWidth: 120 },
      {
        name: "status",
        label: "状态",
        cid: `${TABLE_CID}-status`,
        minWidth: 120,
        fixed: "right",
        logicType: BusLogicDataType.dict,
        logicValue: "[字典code]"
      },
      {
        name: "_action",
        label: "操作",
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
    <BaseQuery
      :form="vm.query"
      :items="queryItems"
      :auto-select="false"
      @select="vm.search"
      @reset="vm.reset"
    />
    <BaseToolbar size="small" :items="vm.toolbars" />
    <div class="list-title">[列表标题]</div>
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
onMounted(() => vm.select());
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

#### index.scss

```scss
.list-page__pager {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
  padding: 12px 0 0;
}
```

主从页分别创建两份 `usePageQuery`，在本页函数中设置明细上下文和清空规则；树表页在本页函数中处理树选择。不要为几个不同事件增加统一业务渲染器。列表响应不是 `data.records/total/summary` 时，在 `request` 内明确映射；首次查询、搜索/重置/保存回第一页、页大小限制、删除越界回退和请求竞态都由组合函数统一管理。

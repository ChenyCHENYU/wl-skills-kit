<template>
  <jh-dialog
    v-model="visible"
    :width="width"
    :title="title"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
  >
    <BaseQuery
      :form="queryParam"
      :items="resolvedQueryItems"
      :columns="queryColumns"
      :label-width="queryLabelWidth"
      @select="select"
      @reset="resetQuery"
    />

    <BaseTable
      ref="tableRef"
      :data="list"
      :columns="columns"
      showToolbar
      highlightCurrentRow
      currentRowSelectMethod="click"
      @row-dblclick="handleRowDblclick"
    />

    <jh-pagination
      v-show="page.total && page.total > 0"
      v-model:currentPage="page.current"
      v-model:pageSize="page.size"
      :total="page.total || 0"
      @current-change="select"
      @size-change="select"
    />
    <template v-if="showFooterButtons" #footer>
      <div class="dialog-footer">
        <BaseToolbar :items="cancelConfirmButtons(close, confirm)" />
      </div>
    </template>
  </jh-dialog>
</template>

<script setup lang="ts">
import type { BaseQueryItemDesc, TableColumnDesc } from "@/types/page";
import { cancelConfirmButtons } from "@jhlc/common-core/src/components/toolbar/toolbar-data";
import { RequestMethod } from "@jhlc/types/src/request-type";
import { ref } from "vue";
import { createPage } from "./data";

interface Props {
  width?: string;
  title?: string;
  queryColumns?: number;
  queryLabelWidth?: string;
  queryItems?: BaseQueryItemDesc[];
  tableColumns?: TableColumnDesc[];
  apiPath?: string;
  requestMethod?: RequestMethod;
  showFooterButtons?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  width: "1200px",
  title: "",
  queryColumns: 4,
  queryLabelWidth: "100px",
  queryItems: () => [],
  tableColumns: () => [],
  apiPath: "",
  requestMethod: RequestMethod.get,
  showFooterButtons: true
});

const emits = defineEmits(["ok"]);

// 弹窗显示状态
const visible = ref(false);
// 固定的查询参数
const constQueryParam = ref<Record<string, any>>({});

const Page = createPage(
  props.apiPath,
  constQueryParam.value,
  props.queryItems,
  props.tableColumns,
  props.requestMethod
);

const {
  tableRef,
  page,
  list,
  queryParam,
  queryItems: resolvedQueryItems,
  columns,
  select,
  resetQuery
} = Page;

// 确定函数
const confirm = () => {
  const selectedRows = tableRef.value?.getSelection();
  emits("ok", selectedRows);
  close();
};

// 双击行函数
const handleRowDblclick = (row: any) => {
  if (!props.showFooterButtons) return;
  emits("ok", row);
  close();
};

// 打开弹窗
const open = (params: Record<string, any>) => {
  if (params) {
    Object.assign(constQueryParam.value, params);
  }
  resetQuery();
  visible.value = true;
};

// 关闭弹窗
const close = () => {
  visible.value = false;
  list.value = [];
};

// 暴露方法
defineExpose({
  open,
  close
});
</script>

<style scoped lang="scss" src="./index.scss"></style>

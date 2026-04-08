<template>
  <div class="app-container app-page-container">
    <BaseQuery
      :form="queryParam"
      :items="queryItems"
      @select="select"
      @reset="select"
    />
    <BaseToolbar :items="toolbars" />
    <el-tabs v-model="activeView">
      <el-tab-pane label="管理视角" name="management">
        <BaseTable
          v-if="activeView === 'management'"
          ref="tableRef"
          :data="list"
          :columns="mgmtCols"
          showToolbar
        />
      </el-tab-pane>
      <el-tab-pane label="使用视角" name="usage">
        <BaseTable
          v-if="activeView === 'usage'"
          ref="tableRef"
          :data="list"
          :columns="useCols"
          showToolbar
        />
      </el-tab-pane>
    </el-tabs>
    <jh-pagination
      v-show="page.total && page.total > 0"
      :total="page.total || 0"
      v-model:currentPage="page.current"
      v-model:pageSize="page.size"
      @current-change="select"
      @size-change="select"
    />
    <c_formModal ref="editModalRef" v-bind="modalConfig" @ok="select" />
  </div>
</template>

<script setup lang="ts">
import {
  createPage,
  modalConfig,
  managementColumns,
  usageColumns
} from "./data";
import c_formModal from "@/components/local/c_formModal/index.vue";

const editModalRef = ref();
const Page = createPage(editModalRef);
const { tableRef, page, queryParam, list, queryItems, toolbars, select } = Page;

const activeView = ref("management");
const mgmtCols = managementColumns();
const useCols = usageColumns();

onMounted(() => select());
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>

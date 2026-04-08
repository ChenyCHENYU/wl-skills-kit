<template>
  <div class="app-container app-page-container">
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="临时客户" name="temp" />
      <el-tab-pane label="正式客户" name="formal" />
      <el-tab-pane label="公海池" name="pool" />
    </el-tabs>
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
    <c_formModal ref="editModalRef" v-bind="modalConfig" @ok="select" />
  </div>
</template>

<script setup lang="ts">
import { createPage, modalConfig } from "./data";
import c_formModal from "@/components/local/c_formModal/index.vue";

const editModalRef = ref();
const Page = createPage(editModalRef);
const {
  tableRef,
  page,
  queryParam,
  list,
  queryItems,
  columns,
  toolbars,
  select,
  activeTab,
  handleTabChange
} = Page;

onMounted(() => select());
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>

<template>
  <div class="app-container app-page-container">
    <BaseQuery :form="queryParam" :items="queryItems" @select="select" @reset="select" />
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
  </div>
</template>

<script setup lang="ts">
import { createPage } from "./data";

const Page = createPage();
const { tableRef, page, queryParam, list, queryItems, columns, toolbars, select } = Page;

onMounted(() => select());
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>

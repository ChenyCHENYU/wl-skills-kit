<!--
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-12-31 11:03:17
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-01 22:21:41
 * @FilePath: \cx-ui-sale\src\views\sale\demo\domestic-trade-order\index.vue
 * @Description: 内贸订单 - 视图层（内贸订单列表的查询、新增、编辑、删除）
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 -->
<template>
  <div class="app-container app-page-container">
    <!-- 搜索栏 -->
    <BaseQuery
      :form="queryParam"
      :items="queryItems"
      :columns="5"
      :auto-select="false"
      @select="select"
      @reset="select"
    />
    <!-- 工具栏 -->
    <BaseToolbar :items="toolbars" :rightItems="rightToolbars" />
    <!-- 表格 -->
    <BaseTable
      ref="tableRef"
      :data="list"
      :columns="columns"
      :render-type="renderType"
      showToolbar
    />
    <!-- 分页 -->
    <jh-pagination
      v-show="page.total && page.total > 0"
      :total="page.total || 0"
      v-model:currentPage="page.current"
      v-model:pageSize="page.size"
      @current-change="select"
      @size-change="select"
    />
  </div>
  <!-- 表单弹窗 -->
  <c_formModal ref="modalRef" v-bind="modalConfig" @ok="select" />
</template>

<script setup lang="ts">
import c_formModal from "@/components/local/c_formModal/index.vue";
import { createPage, renderType, modalConfig } from "./data";

// 弹窗引用
const modalRef = ref<InstanceType<typeof c_formModal>>();

// 创建页面Hook实例
const Page = createPage(modalRef);

// 解构使用
const { page, queryParam, list, queryItems, toolbars, columns, select } = Page;

// TODO: 右侧工具栏 - 临时用于切换表格类型演示，未来需删除除）
const rightToolbars = [
  {
    label: "切换表格",
    classnames: ["glass-button"],
    onClick: () => {
      renderType.value = renderType.value === "dataTable" ? "agGrid" : "dataTable";
    }
  }
];

// 初始化
onMounted(() => {
  select();
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>

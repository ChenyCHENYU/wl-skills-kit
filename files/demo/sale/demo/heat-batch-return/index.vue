<!--
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-06-13 18:38:58
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-04 08:29:26
 * @FilePath: \cx-ui-sale\src\views\sale\demo\heat-batch-return\index.vue
 * @Description: 炉次返送 - 视图层（待炉次返送与已炉次返送数据管理）
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 -->
<template>
  <div class="furnace-batch-page-container">
    <div class="furnace-batch-page">
      <!-- 工具栏单独占一行 -->
      <div class="toolbar-container">
        <BaseToolbar :items="pendingToolbarItems" />
      </div>

      <!-- 表格内容区域 -->
      <div class="page-container">
        <!-- 左侧：待炉次返送 -->
        <div class="section left-section">
          <!-- 标题 -->
          <div class="section-header">
            <div class="title-bar"></div>
            <h2 class="section-title">待炉次返送</h2>
          </div>

          <!-- 表格 -->
          <div class="table-box">
            <BaseTable
              :data="pendingData.list"
              :columns="pendingColumnsConfig"
              :loading="pendingLoading"
              border
              stripe
              size="small"
              height="100%"
              @selection-change="handlePendingSelectionChange"
            />
          </div>

          <!-- 分页 -->
          <div class="pagination-container">
            <div class="pagination-info">共{{ pendingData.total }}条</div>
            <jh-pagination
              v-model:currentPage="pendingPagination.page"
              v-model:pageSize="pendingPagination.pageSize"
              :total="pendingData.total"
              :page-sizes="[15, 30, 50, 100]"
              layout="prev, pager, next, sizes, jumper"
              size="small"
              @current-change="handlePendingPageChange"
              @size-change="handlePendingSizeChange"
            />
          </div>
        </div>

        <!-- 右侧：已炉次返送 -->
        <div class="section right-section">
          <!-- 标题 -->
          <div class="section-header">
            <div class="title-bar"></div>
            <h2 class="section-title">已炉次返送</h2>
          </div>

          <!-- 表格 -->
          <div class="table-box">
            <BaseTable
              :data="returnedData.list"
              :columns="returnedColumnsConfig"
              :loading="returnedLoading"
              border
              stripe
              size="small"
              height="100%"
              @selection-change="handleReturnedSelectionChange"
            />
          </div>

          <!-- 分页 -->
          <div class="pagination-container">
            <div class="pagination-info">共{{ returnedData.total }}条</div>
            <jh-pagination
              v-model:currentPage="returnedPagination.page"
              v-model:pageSize="returnedPagination.pageSize"
              :total="returnedData.total"
              :page-sizes="[15, 30, 50, 100]"
              layout="prev, pager, next, sizes, jumper"
              size="small"
              @current-change="handleReturnedPageChange"
              @size-change="handleReturnedSizeChange"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 新增返送弹窗 -->
    <c_formModal
      ref="modalRef"
      :form-items="modalConfig.formItems"
      :api="modalConfig.api"
      :width="modalConfig.width"
      :columns="modalConfig.columns"
      :label-width="modalConfig.labelWidth"
      :title-prefix="modalConfig.titlePrefix"
      @ok="handleModalOk"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import c_formModal from "@/components/local/c_formModal/index.vue";
import {
  pendingColumnsConfig,
  returnedColumnsConfig,
  pendingLoading,
  returnedLoading,
  pendingData,
  returnedData,
  pendingPagination,
  returnedPagination,
  fetchPendingData,
  fetchReturnedData,
  handlePendingPageChange,
  handlePendingSizeChange,
  handleReturnedPageChange,
  handleReturnedSizeChange,
  handlePendingSelectionChange,
  handleReturnedSelectionChange,
  handleQuery,
  getToolbarConfig,
  modalConfig
} from "./data";
import "./index.scss";

// 弹窗引用
const modalRef = ref<InstanceType<typeof c_formModal>>();

// 待返送工具栏配置
const pendingToolbarItems = computed(() =>
  getToolbarConfig({
    onReturn: () => modalRef.value?.open(),
    onQuery: handleQuery
  })
);

// 弹窗操作成功回调
const handleModalOk = () => {
  fetchPendingData();
  fetchReturnedData();
};

// 初始化数据
onMounted(() => {
  fetchPendingData();
  fetchReturnedData();
});
</script>

<style scoped lang="scss">
@import "./index.scss";

.input-suffix {
  color: #909399;
  font-size: 12px;
  padding-right: 0px;
}
</style>

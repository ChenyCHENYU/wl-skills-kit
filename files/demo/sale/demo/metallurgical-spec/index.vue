<!--
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-12-31 15:10:30
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-03 09:15:45
 * @FilePath: \cx-ui-sale\src\views\sale\demo\metallurgical-spec\index.vue
 * @Description: 冶金规范模板 - 经典主明细布局（精简优化版）
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 -->

<template>
  <div class="metallurgical-spec-page">
    <!-- 主标签页 -->
    <el-tabs v-model="activeTab" class="main-tabs">
      <el-tab-pane
        v-for="tab in mainTabsConfig"
        :key="tab.name"
        :label="tab.label"
        :name="tab.name"
      />
    </el-tabs>

    <!-- 列表页面 -->
    <div v-show="activeTab === 'list'" class="list-content">
      <BaseQuery
        :form="unifiedQueryForm"
        :items="listQueryItemsConfig"
        :columns="5"
        labelWidth="120px"
        @select="handleUnifiedQuerySearch"
        @reset="handleUnifiedQueryReset"
      />

      <BaseTable
        :data="listTableData"
        :columns="listTableColumnsConfig"
        :loading="listLoading"
        height="100%"
      />

      <div class="pagination-wrapper">
        <jh-pagination
          :current-page="listPagination.pageNum"
          :page-size="listPagination.pageSize"
          :total="listPagination.total"
          @current-change="handleListPageChange"
          @size-change="handleListSizeChange"
        />
      </div>
    </div>

    <!-- 详情页面 -->
    <div v-show="activeTab === 'detail'" class="detail-wrapper">
      <BaseQuery
        :form="unifiedQueryForm"
        :items="listQueryItemsConfig"
        :columns="5"
        labelWidth="120px"
        @select="handleUnifiedQuerySearch"
        @reset="handleUnifiedQueryReset"
      />

      <!-- 左右布局 -->
      <jh-drag-col :left-width="300" class="detail-content-wrapper">
        <template #left>
          <C_Tree
            :tabs="treeTabsConfig"
            :tree-data="treeData"
            :tree-props="treeProps"
            :default-active-tab="treeActiveTab"
            @node-click="handleNodeClick"
            @tab-change="handleTreeTabChange"
          />
        </template>

        <template #right>
          <div class="detail-area">
            <!-- 详情标签页 -->
            <div class="detail-tabs-buttons">
              <el-button-group>
                <el-button
                  v-for="tab in detailTabsConfig"
                  :key="tab.name"
                  :type="detailActiveTab === tab.name ? 'primary' : ''"
                  size="small"
                  @click="detailActiveTab = tab.name"
                >
                  {{ tab.label }}
                </el-button>
              </el-button-group>
            </div>

            <!-- 基本信息 -->
            <div v-if="detailActiveTab === 'basic'" class="detail-content">
              <BaseQuery
                :form="detailQueryForm"
                :items="detailQueryItemsConfig"
                :columns="5"
                @select="handleDetailQuerySearch"
                @reset="handleDetailQueryReset"
              />

              <BaseToolbar :items="toolbarItems" size="small" />

              <BaseTable
                :data="tableData"
                :columns="tableColumnsConfig"
                :loading="loading"
                height="100%"
                @selection-change="handleSelectionChange"
              />

              <div class="pagination-wrapper">
                <jh-pagination
                  :current-page="pagination.pageNum"
                  :page-size="pagination.pageSize"
                  :total="pagination.total"
                  @current-change="handlePageChange"
                  @size-change="handleSizeChange"
                />
              </div>
            </div>

            <!-- 明细信息 -->
            <div v-if="detailActiveTab === 'detail'" class="detail-content">
              <BaseQuery
                :form="detailQueryForm"
                :items="detailQueryItemsConfig"
                :columns="5"
                @select="handleDetailQuerySearch"
                @reset="handleDetailQueryReset"
              />

              <BaseToolbar :items="detailToolbarItems" size="small" />

              <!-- 主明细表格区域 -->
              <div class="detail-tables-container">
                <!-- 未选择节点时的提示 -->
                <div v-if="!isTreeNodeSelected" class="no-tree-selection-tip">
                  <el-empty
                    description="请先点击左侧树节点选择数据"
                    :image-size="120"
                  >
                    <template #image>
                      <el-icon :size="60" color="#909399">
                        <ArrowLeft />
                      </el-icon>
                    </template>
                  </el-empty>
                </div>

                <!-- 选择节点后显示表格数据 -->
                <div v-else class="tables-content">
                  <C_Splitter direction="vertical">
                    <div class="main-table-section">
                      <BaseTable
                        :key="updateKey"
                        :data="tableData"
                        :columns="tableColumnsConfig"
                        :loading="loading"
                        height="300px"
                        @selection-change="handleSelectionChange"
                        @row-click="handleRowClick"
                      />
                    </div>
                    <div>
                      <div class="experiment-section">
                        <div class="experiment-header">
                          <div class="experiment-title">
                            <el-icon class="title-arrow"><ArrowDown /></el-icon>
                            <span class="title-text">实验项目信息</span>
                          </div>
                        </div>

                        <BaseTable
                          :key="updateKey"
                          :data="experimentData"
                          :columns="experimentColumnsConfig"
                          :loading="loading"
                          height="250px"
                          :max-height="250"
                          style="overflow-y: auto"
                        />

                        <div class="pagination-wrapper">
                          <jh-pagination
                            :current-page="experimentPagination.pageNum"
                            :page-size="experimentPagination.pageSize"
                            :total="experimentPagination.total"
                            @current-change="handleExperimentPageChange"
                            @size-change="handleExperimentSizeChange"
                          />
                        </div>
                      </div>
                    </div>
                  </C_Splitter>
                </div>
              </div>
            </div>
          </div>
        </template>
      </jh-drag-col>
    </div>
  </div>

  <!-- 主表格编辑弹窗 -->
  <c_formModal
    ref="mainModalRef"
    :form-items="mainModalConfig.formItems"
    :api="mainModalConfig.api"
    :width="mainModalConfig.width"
    :columns="mainModalConfig.columns"
    :label-width="mainModalConfig.labelWidth"
    :title-prefix="mainModalConfig.titlePrefix"
    @ok="handleMainModalOk"
  />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch, nextTick } from "vue";
import { ArrowDown, ArrowLeft } from "@element-plus/icons-vue";
import c_formModal from "@/components/local/c_formModal/index.vue";
import C_Splitter from "@/components/global/C_Splitter/index.vue";
import {
  // 状态
  activeTab,
  treeActiveTab,
  detailActiveTab,
  loading,
  listLoading,
  treeData,
  tableData,
  listTableData,
  experimentData,
  updateKey,
  currentSelectedRow,
  isTreeNodeSelected,
  unifiedQueryForm,
  detailQueryForm,
  pagination,
  listPagination,
  experimentPagination,
  // 配置
  mainTabsConfig,
  treeTabsConfig,
  detailTabsConfig,
  treeProps,
  listQueryItemsConfig,
  detailQueryItemsConfig,
  tableColumnsConfig,
  listTableColumnsConfig,
  experimentColumnsConfig,
  toolbarItems,
  detailToolbarItems,
  // 方法
  handleNodeClick,
  handleUnifiedQuerySearch,
  handleUnifiedQueryReset,
  handleListPageChange,
  handleListSizeChange,
  handleDetailQuerySearch,
  handleDetailQueryReset,
  handlePageChange,
  handleSizeChange,
  handleSelectionChange,
  handleRowClick,
  handleExperimentPageChange,
  handleExperimentSizeChange,
  handleTreeTabChange,
  // 主表格编辑弹窗相关
  mainModalConfig,
  handleMainModalOk,
  initData,
  loadListData,
  loadExperimentData,
  cleanup
} from "./data";

// 弹窗引用
const mainModalRef = ref<InstanceType<typeof c_formModal>>();

// 生命周期
onMounted(() => {
  activeTab.value === "list" ? loadListData() : initData();
  // 延迟设置弹窗引用，确保组件已完全挂载
  nextTick(() => {
    if (typeof window !== "undefined" && mainModalRef.value) {
      (window as any).mainModalRef = mainModalRef.value;
    }
  });
});

onUnmounted(cleanup);

// 标签切换监听
watch(activeTab, (newTab) => {
  newTab === "detail" ? initData() : loadListData();
});

watch(detailActiveTab, (newTab) => {
  if (newTab === "detail" && currentSelectedRow.value) {
    loadExperimentData(currentSelectedRow.value);
  }
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>

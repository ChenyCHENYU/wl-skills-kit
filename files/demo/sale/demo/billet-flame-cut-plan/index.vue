<!--
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-06-13 18:38:58
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-04 00:29:09
 * @FilePath: \cx-ui-sale\src\views\sale\demo\billet-flame-cut-plan\index.vue
 * @Description: 钢坯火切计划 - 视图层
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 -->
<template>
  <div class="app-container app-page-container">
    <el-tabs v-model="activeTab" class="main-tab">
      <el-tab-pane label="火切计划" name="plan">
        <!-- 搜索栏 -->
        <BaseQuery
          :form="queryParam"
          :items="queryItems"
          :columns="5"
          @select="select"
          @reset="select"
        />
        <!-- 工具栏 -->
        <BaseToolbar :items="toolbars" />
        <!-- 主内容区域 - 左右布局 -->
        <div class="main-content">
          <!-- 左侧：计划信息 -->
          <div class="left-panel">
            <el-divider content-position="left">计划信息</el-divider>
            <BaseTable
              ref="tableRef"
              :data="list"
              :columns="columns"
              :render-type="renderType"
              :loading="loading"
            />
            <!-- 分页 -->
            <jh-pagination
              v-show="page.total > 0"
              :total="page.total"
              v-model:currentPage="page.current"
              v-model:pageSize="page.size"
              @current-change="select"
              @size-change="select"
              class="pagination-wrapper"
            />
          </div>
          <!-- 右侧：切割信息 -->
          <div class="right-panel">
            <el-divider content-position="left" class="cut-info-divider">切割信息</el-divider>
            <BaseTable
              :data="cutList"
              :columns="cutColumns"
              :render-type="renderType"
              :loading="loading"
            />
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="火切实绩" name="result">
        <!-- 预留火切实绩内容 -->
      </el-tab-pane>
    </el-tabs>
  </div>
  <!-- 表单弹窗 -->
  <c_formModal 
    ref="modalRef" 
    :form-items="modalConfig.formItems"
    :api="modalConfig.api"
    :width="modalConfig.width"
    :columns="modalConfig.columns"
    :label-width="modalConfig.labelWidth"
    :title-prefix="modalConfig.titlePrefix"
    @ok="select" 
  />
</template>

<script setup lang="ts">
import c_formModal from "@/components/local/c_formModal/index.vue";
import { createPageHook, renderType } from "./data";
import "./index.scss";

// 弹窗引用
const modalRef = ref();

// 创建页面Hook实例
const Page = createPageHook(modalRef);

// 解构使用
const {
  activeTab,
  queryParam,
  page,
  tableRef,
  list,
  cutList,
  loading,
  queryItems,
  toolbars,
  columns,
  cutColumns,
  modalConfig
} = Page;

// 查询数据
const select = async () => {
  await Page.select();
};

// 初始化
onMounted(() => {
  select();
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>

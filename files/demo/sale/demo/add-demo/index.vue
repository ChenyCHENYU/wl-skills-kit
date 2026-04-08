<!--
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-12-29 15:38:58
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-03 00:46:17
 * @FilePath: \cx-ui-sale\src\views\sale\demo\add-demo\index.vue
 * @Description: 新增编辑页示例 - 视图层（订单新增编辑表单、项次信息管理）
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 -->
<template>
  <div class="main-maintenance-container">
    <!-- C_Splitter 包裹表单区和项次信息 -->
    <C_Splitter direction="vertical" class="main-splitter">
      <!-- 🆕 使用增强版组件（集成所有功能） -->
      <c_formSections
        :sections="sectionsConfig"
        :form="form"
        v-model:activeNames="activeNames"
        show-header
        header-title="主档维护"
        :header-actions="headerActions"
        show-toolbar
        show-required-filter
        show-layout-switch
        :default-layout="5"
        :layout-options="[2, 3, 4, 5]"
        show-nav-tabs
        nav-tabs-position="left"
        :nav-tabs="navTabsConfig"
        label-width="100px"
        label-position="right"
        :gutter="20"
        class="form-card"
      >
        <!-- 特殊需求区块插槽 -->
        <template #special-3>
          <el-row :gutter="20">
            <el-col :span="24">
              <el-button type="primary" plain @click="addSpecialRequirement">
                + 添加需求
              </el-button>
            </el-col>
          </el-row>
        </template>
      </c_formSections>

      <el-card
        shadow="never"
        class="items-card"
        :initialSize="220"
        :minSize="150"
      >
        <div class="child-items-section">
          <div class="section-header">
            <div class="title-group">
              <el-icon class="collapse-icon"><ArrowDown /></el-icon>
              <span>项次信息</span>
            </div>
            <el-icon
              class="fullscreen-icon"
              :title="isItemTableFullscreen ? '退出全屏' : '全屏'"
              @click="toggleItemTableFullscreen"
            >
              <component :is="isItemTableFullscreen ? 'Close' : 'FullScreen'" />
            </el-icon>
          </div>
          <BaseTable
            :data="paginatedItemData"
            :columns="itemColumnsConfig"
            border
            class="child-table"
            height="100%"
          />
          <!-- 分页 -->
          <div class="items-pagination">
            <div class="drag-hint">
              <span class="drag-icon">⇕</span>
              <span class="hint-text">长按拖动，可调整两个区域所占高度</span>
            </div>
            <jh-pagination
              v-show="itemTotal && itemTotal > 0"
              :total="itemTotal || 0"
              v-model:currentPage="currentPage"
              v-model:pageSize="pageSize"
              @current-change="refreshItemData"
              @size-change="refreshItemData"
            />
          </div>
        </div>
      </el-card>
    </C_Splitter>

    <!-- 全屏模式 - 使用 Teleport 传送到 body -->
    <Teleport to="body">
      <div v-if="isItemTableFullscreen" class="fullscreen-overlay">
        <el-card shadow="never" class="items-card-fullscreen">
          <div class="child-items-section">
            <div class="section-header">
              <div class="title-group">
                <el-icon class="collapse-icon"><ArrowDown /></el-icon>
                <span>项次信息</span>
              </div>
              <el-icon
                class="fullscreen-icon"
                title="退出全屏"
                @click="toggleItemTableFullscreen"
              >
                <Close />
              </el-icon>
            </div>
            <BaseTable
              :data="paginatedItemData"
              :columns="itemColumnsConfig"
              border
              class="child-table"
              height="100%"
            />
            <!-- MARK: 分页（推荐平台统一封装的，保持一致，个性化定制不能满足的时候可以自行拓展 el-pagination） -->
            <div class="items-pagination">
              <jh-pagination
                v-show="itemTotal && itemTotal > 0"
                :total="itemTotal || 0"
                v-model:currentPage="currentPage"
                v-model:pageSize="pageSize"
                @current-change="refreshItemData"
                @size-change="refreshItemData"
              />
            </div>
          </div>
        </el-card>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { ArrowDown, Close } from "@element-plus/icons-vue";
import C_Splitter from "@/components/global/C_Splitter/index.vue";
import c_formSections from "@/components/local/c_formSections/index.vue";
import {
  form,
  activeNames,
  sectionsConfig,
  navTabsConfig,
  headerActions,
  isItemTableFullscreen,
  itemColumnsConfig,
  itemTotal,
  paginatedItemData,
  currentPage,
  pageSize,
  addSpecialRequirement,
  toggleItemTableFullscreen,
  refreshItemData,
  initPage
} from "./data";

// 页面初始化
onMounted(() => {
  initPage();
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>

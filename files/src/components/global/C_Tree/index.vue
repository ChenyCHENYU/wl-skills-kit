<template>
  <div class="c-tree-panel">
    <!-- Tab 切换 -->
    <el-tabs
      v-if="tabs && tabs.length > 0"
      v-model="activeTab"
      class="tree-tabs"
    >
      <el-tab-pane
        v-for="tab in tabs"
        :key="tab.name"
        :label="tab.label"
        :name="tab.name"
      />
    </el-tabs>

    <!-- 搜索框 -->
    <div v-if="showSearch" class="tree-search">
      <el-input
        v-model="searchKeyword"
        :placeholder="searchPlaceholder"
        clearable
        :prefix-icon="Search"
        size="small"
      />
    </div>

    <!-- 树形组件 -->
    <el-tree
      ref="treeRef"
      :data="treeData"
      :props="treeProps"
      :filter-node-method="filterNode"
      :default-expand-all="defaultExpandAll"
      :highlight-current="highlightCurrent"
      @node-click="handleNodeClick"
    >
      <template #default="{ data }">
        <slot name="node" :data="data">
          <span class="tree-node-label">{{ data[treeProps.label] }}</span>
        </slot>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { createTree, type Props } from "./data";

const props = withDefaults(defineProps<Props>(), {
  treeProps: () => ({ children: "children", label: "label" }),
  defaultActiveTab: "tab1",
  showSearch: true,
  searchPlaceholder: "关键词搜索",
  defaultExpandAll: true,
  highlightCurrent: true
});

const emit = defineEmits<{
  (e: "node-click", data: any): void;
  (e: "tab-change", tabName: string): void;
}>();

const {
  Search,
  activeTab,
  searchKeyword,
  treeRef,
  filterNode,
  handleNodeClick,
  clearSearch,
  switchTab
} = createTree(props, emit);

defineExpose({ treeRef, searchKeyword, activeTab, clearSearch, switchTab });
</script>

<style scoped lang="scss" src="./index.scss"></style>

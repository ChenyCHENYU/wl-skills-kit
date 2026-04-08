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
import { ref, watch } from "vue";
import { Search } from "@element-plus/icons-vue";

// Props 定义
interface Props {
  tabs?: Array<{ label: string; name: string }>;
  treeData: any[];
  treeProps?: Record<string, string>;
  defaultActiveTab?: string;
  showSearch?: boolean;
  searchPlaceholder?: string;
  defaultExpandAll?: boolean;
  highlightCurrent?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  treeProps: () => ({ children: "children", label: "label" }),
  defaultActiveTab: "tab1",
  showSearch: true,
  searchPlaceholder: "关键词搜索",
  defaultExpandAll: true,
  highlightCurrent: true
});

// Emits 定义
const emit = defineEmits<{
  (e: "node-click", data: any): void;
  (e: "tab-change", tabName: string): void;
}>();

// 状态
const activeTab = ref(props.defaultActiveTab);
const searchKeyword = ref("");
const treeRef = ref<any>(null);

// 过滤节点
const filterNode = (value: string, data: any) => {
  if (!value) return true;
  const label = data[props.treeProps.label || "label"];
  return label && label.includes(value);
};

// 节点点击
const handleNodeClick = (data: any) => {
  emit("node-click", data);
};

// 监听搜索关键词
watch(searchKeyword, (val) => {
  treeRef.value?.filter(val);
});

// 监听tab切换
watch(activeTab, (val) => {
  emit("tab-change", val);
});

// 暴露方法
defineExpose({
  treeRef,
  searchKeyword,
  activeTab,
  clearSearch: () => {
    searchKeyword.value = "";
  },
  switchTab: (tabName: string) => {
    activeTab.value = tabName;
  }
});
</script>

<style scoped lang="scss" src="./index.scss"></style>

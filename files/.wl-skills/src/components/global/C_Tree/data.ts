import { ref, watch } from "vue";
import { Search } from "@element-plus/icons-vue";

// ===== 类型定义 =====
export interface Props {
  tabs?: Array<{ label: string; name: string }>;
  treeData: any[];
  treeProps?: Record<string, string>;
  defaultActiveTab?: string;
  showSearch?: boolean;
  searchPlaceholder?: string;
  defaultExpandAll?: boolean;
  highlightCurrent?: boolean;
}

// ===== 组件逻辑 =====
export function createTree(
  props: Props,
  emit: (e: "node-click" | "tab-change", ...args: any[]) => void,
) {
  const activeTab = ref(props.defaultActiveTab ?? "tab1");
  const searchKeyword = ref("");
  const treeRef = ref<any>(null);

  const filterNode = (value: string, data: any) => {
    if (!value) return true;
    const label = data[props.treeProps?.label || "label"];
    return label && label.includes(value);
  };

  const handleNodeClick = (data: any) => {
    emit("node-click", data);
  };

  watch(searchKeyword, (val) => {
    treeRef.value?.filter(val);
  });

  watch(activeTab, (val) => {
    emit("tab-change", val);
  });

  const clearSearch = () => {
    searchKeyword.value = "";
  };

  const switchTab = (tabName: string) => {
    activeTab.value = tabName;
  };

  return {
    Search,
    activeTab,
    searchKeyword,
    treeRef,
    filterNode,
    handleNodeClick,
    clearSearch,
    switchTab,
  };
}

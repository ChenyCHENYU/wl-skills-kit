/**
 * C_Tree 组件类型定义（纯树形展示）
 */

/** 树形节点数据 */
export interface TreeNode {
  id?: string | number;
  label?: string;
  children?: TreeNode[];
  [key: string]: any;
}

/** 标签页配置 */
export interface TabConfig {
  label: string;
  name: string;
}

/** 树形配置 */
export interface TreeProps {
  children?: string;
  label?: string;
  disabled?: string;
  isLeaf?: string;
}

/** C_Tree 组件 Props */
export interface CTreeProps {
  /** Tab 配置数组 */
  tabs?: TabConfig[];
  /** 树形数据（必填） */
  treeData: TreeNode[];
  /** 树形配置 */
  treeProps?: TreeProps;
  /** 默认激活的 tab */
  defaultActiveTab?: string;
  /** 是否显示搜索框 */
  showSearch?: boolean;
  /** 搜索框占位符 */
  searchPlaceholder?: string;
  /** 是否默认展开所有节点 */
  defaultExpandAll?: boolean;
  /** 是否高亮当前选中节点 */
  highlightCurrent?: boolean;
}

/** C_Tree 组件暴露的方法 */
export interface CTreeExpose {
  /** 树形组件实例 */
  treeRef: any;
  /** 搜索关键词 */
  searchKeyword: string;
  /** 当前激活的 tab */
  activeTab: string;
  /** 清空搜索 */
  clearSearch: () => void;
  /** 切换 tab */
  switchTab: (tabName: string) => void;
}

/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-12-31 14:20:15
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-02 10:30:22
 * @FilePath: \cx-ui-sale\src\views\sale\demo\metallurgical-spec\data.ts
 * @Description: 冶金规范模板 - 数据逻辑层（精简优化版）
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 */

import { ref, reactive, h } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { BaseQueryItemDesc, ActionButtonDesc, TableColumnDesc, BusLogicDataType } from "@/types/page";
import request from "@jhlc/common-core/src/util/request";

// ========== 类型定义 ==========
// 统一查询表单
interface UnifiedQueryForm {
  specCode: string;
  managementType: string;
  productStandard: string;
  buckleType: string;
  productName: string;
  manufacturingMethod: string;
  steelGrade: string;
  deliveryStatus: string;
  productSpecCode: string;
  indexNumber: string;
  standardType: string;
  usageDefinition: string;
}

// 详情查询表单
interface DetailQueryForm {
  indexNumber: string;
  steelGrade: string;
  standardType: string;
  productStandard: string;
  productName: string;
  usageDefinition: string;
}

export interface TableRow {
  id: string;
  serialNumber: number;
  indexNumber: string;
  standardType: string;
  productStandard: string;
  revisionNumber: string;
  productName: string;
}

export interface ExperimentRow {
  id: string;
  serialNumber: number;
  testCategory: string;
  testItem: string;
  judgmentLogic: string;
  absLowerSymbol: string;
  absLowerValue: number;
  absUpperSymbol: string;
  absUpperValue: number;
  internalLowerSymbol: string;
  internalLowerValue: number;
  internalUpperSymbol: string;
  internalUpperValue: number;
}

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
}

// ========== 状态管理 ==========
// 活跃标签
export const activeTab = ref("list");
export const treeActiveTab = ref("tab1");
export const detailActiveTab = ref("basic");

// 加载状态
export const loading = ref(false);
export const listLoading = ref(false);

// 数据状态
export const treeData = ref<TreeNode[]>([]);
export const tableData = ref<TableRow[]>([]);
export const listTableData = ref<any[]>([]);
export const experimentData = ref<ExperimentRow[]>([]);
export const selectedRows = ref<TableRow[]>([]);
export const currentSelectedRow = ref<TableRow | null>(null);
export const updateKey = ref(0);
// 树节点选择状态
export const isTreeNodeSelected = ref(false);

// 数据缓存
const dataCache = ref({
  treeData: null as TreeNode[] | null,
  treeLoadTime: 0,
  experimentDataCache: new Map<string, { data: ExperimentRow[]; loadTime: number; total: number }>()
});
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟

// ========== 通用工具函数 ==========
const createPagination = () => reactive({ pageNum: 1, pageSize: 10, total: 0 });

// 分页配置
export const pagination = createPagination();
export const listPagination = createPagination();
export const experimentPagination = createPagination();

// ========== 表单数据 ==========
// 表单初始化工具
const createEmptyForm = <T extends Record<string, any>>(fields: (keyof T)[]): T => 
  reactive(Object.fromEntries(fields.map(field => [field, ""])) as T);

// 表单配置
export const unifiedQueryForm = createEmptyForm<UnifiedQueryForm>([
  'specCode', 'managementType', 'productStandard', 'buckleType',
  'productName', 'manufacturingMethod', 'steelGrade', 'deliveryStatus',
  'productSpecCode', 'indexNumber', 'standardType', 'usageDefinition'
]);

export const detailQueryForm = createEmptyForm<DetailQueryForm>([
  'indexNumber', 'steelGrade', 'standardType', 'productStandard', 'productName', 'usageDefinition'
]);

// ========== 配置常量 ==========
const createTabConfig = (items: Array<[string, string]>) => 
  items.map(([label, name]) => ({ label, name }));

export const mainTabsConfig = createTabConfig([["列表数据", "list"], ["详情数据", "detail"]]);
export const treeTabsConfig = createTabConfig([["基本信息", "tab1"], ["交付标准", "tab2"]]);
export const detailTabsConfig = createTabConfig([["基本信息", "basic"], ["明细信息", "detail"]]);

export const treeProps = { children: "children", label: "label" } as const;

// ========== 查询配置 ==========
const createDictItem = (name: string, label: string, logicValue: string) => ({
  name, label, placeholder: "请选择", logicType: BusLogicDataType.dict, logicValue
});

const createInputItem = (name: string, label: string) => ({
  name, label, placeholder: "请输入"
});

export const listQueryItemsConfig: BaseQueryItemDesc<UnifiedQueryForm>[] = [
  createInputItem("specCode", "规范代码"),
  createInputItem("productStandard", "产品标准"),
  createDictItem("productName", "品名", "PRODUCT_NAME"),
  createInputItem("steelGrade", "钢级"),
  createDictItem("managementType", "管理类型", "MANAGEMENT_TYPE"),
  createInputItem("buckleType", "扣型"),
  createDictItem("manufacturingMethod", "制造方法", "MANUFACTURING_METHOD"),
  createDictItem("deliveryStatus", "交货状态", "DELIVERY_STATUS"),
  createDictItem("productSpecCode", "产品规范", "PRODUCT_SPEC_CODE")
];

export const detailQueryItemsConfig: BaseQueryItemDesc<DetailQueryForm>[] = [
  createInputItem("indexNumber", "索引号"),
  createDictItem("standardType", "标准类型", "STANDARD_TYPE"),
  createInputItem("productStandard", "产品标准"),
  createInputItem("steelGrade", "钢级"),
  createDictItem("productName", "品名", "PRODUCT_NAME"),
  createInputItem("usageDefinition", "用途定义")
];

// ========== 表格列配置 ==========
export const listTableColumnsConfig: TableColumnDesc[] = [
  { type: "index", label: "序号", width: 80 },
  {
    label: "冶金规范代码",
    name: "specCode",
    width: 150,
    defaultSlot: ({ row }: any) => {
      return h(
        "span",
        {
          style: "color: #409eff; cursor: pointer; text-decoration: underline;",
          onClick: () => handleListRowClick(row)
        },
        row.specCode
      );
    }
  },
  { label: "品名", name: "productName", width: 120 },
  { label: "钢级/牌号（公制）", name: "steelGradeMetric", width: 150 },
  { label: "钢级/牌号（英制）", name: "steelGradeImperial", width: 150 },
  { label: "产品标准", name: "productStandard", width: 200 },
  { label: "客户编码", name: "customerCode", width: 120 },
  { label: "用途码", name: "usageCode", width: 100 },
  { label: "扣形", name: "buckleType", width: 100 },
  { label: "管端类型", name: "pipeEndType", width: 100 },
  { label: "制造方法", name: "manufacturingMethod", width: 120 },
  { label: "交货状态", name: "deliveryStatus", width: 120 },
  { label: "产品规范代码", name: "productSpecCode", minWidth: 150 }
];

export const tableColumnsConfig: TableColumnDesc[] = [
  { type: "selection", width: 50 },
  { label: "序号", name: "serialNumber", width: 110 },
  { label: "索引号", name: "indexNumber", width: 180 },
  { label: "标准类型", name: "standardType", width: 120 },
  { label: "产品标准", name: "productStandard", width: 250 },
  { label: "修订号", name: "revisionNumber", width: 100 },
  { label: "品名", name: "productName", minWidth: 150 },
  {
    label: "操作",
    width: 220,
    fixed: "right",
    operations: [
      {
        name: "gaToGc",
        label: "GA->GC",
        onClick: (row: TableRow) => handleGaToGcRow(row)
      },
      {
        name: "copy",
        label: "复制",
        onClick: (row: TableRow) => handleCopyRow(row)
      },
      {
        name: "edit",
        label: "编辑",
        onClick: (row: TableRow) => handleEditRow(row)
      },
      {
        name: "remove",
        label: "删除",
        onClick: (row: TableRow) => handleDeleteRow(row)
      }
    ]
  }
];

export const experimentColumnsConfig: TableColumnDesc[] = [
  {
    label: "序号",
    name: "serialNumber",
    width: 80,
    align: "center",
    // 使用列级 span 函数实现行合并
    span: ({ rowIndex, data }: any) => {
      if (!data || data.length === 0) return { rowSpan: 1, colSpan: 1 };

      const currentCategory = data[rowIndex]?.testCategory;
      const prevCategory =
        rowIndex > 0 ? data[rowIndex - 1]?.testCategory : null;

      // 如果是分组的第一行，计算需要合并的行数
      if (rowIndex === 0 || currentCategory !== prevCategory) {
        let rowSpan = 1;
        for (let i = rowIndex + 1; i < data.length; i++) {
          if (data[i].testCategory === currentCategory) {
            rowSpan++;
          } else {
            break;
          }
        }
        return { rowSpan, colSpan: 1 };
      }

      // 非第一行则隐藏
      return { rowSpan: 0, colSpan: 0 };
    },
    defaultSlot: ({ row, $index }: { row: ExperimentRow; $index: number }) => {
      return h("span", String($index + 1));
    }
  },
  {
    label: "试验种类",
    name: "testCategory",
    width: 150,
    align: "center",
    // 使用列级 span 函数实现行合并
    span: ({ rowIndex, data }: any) => {
      if (!data || data.length === 0) return { rowSpan: 1, colSpan: 1 };

      const currentCategory = data[rowIndex]?.testCategory;
      const prevCategory =
        rowIndex > 0 ? data[rowIndex - 1]?.testCategory : null;

      // 如果是分组的第一行，计算需要合并的行数
      if (rowIndex === 0 || currentCategory !== prevCategory) {
        let rowSpan = 1;
        for (let i = rowIndex + 1; i < data.length; i++) {
          if (data[i].testCategory === currentCategory) {
            rowSpan++;
          } else {
            break;
          }
        }
        return { rowSpan, colSpan: 1 };
      }

      // 非第一行则隐藏
      return { rowSpan: 0, colSpan: 0 };
    }
  },
  { label: "试验项目", name: "testItem", width: 150 },
  { label: "判断逻辑", name: "judgmentLogic", width: 120 },
  {
    label: "绝对判断",
    children: [
      { label: "下限符号", name: "absLowerSymbol", width: 80 },
      { label: "下限值", name: "absLowerValue", width: 80 },
      { label: "上限符号", name: "absUpperSymbol", width: 80 },
      { label: "上限值", name: "absUpperValue", width: 80 }
    ]
  },
  {
    label: "内控判断",
    children: [
      { label: "下限符号", name: "internalLowerSymbol", width: 80 },
      { label: "下限值", name: "internalLowerValue", width: 80 },
      { label: "上限符号", name: "internalUpperSymbol", width: 80 },
      { label: "上限值", name: "internalUpperValue", width: 80 }
    ]
  }
];

// ========== 工具栏配置 ==========
const createToolbarButton = (label: string, type = "", plain = false) => ({
  label, ...(type && { type }), ...(plain && { plain }),
  onClick: () => ElMessage.info(`${label}功能待实现`)
});

const createToolbar = (buttons: Array<[string, string?, boolean?]>, includeDelete = true) => [
  ...buttons.map(([label, type, plain]) => createToolbarButton(label, type, plain)),
  ...(includeDelete ? [{ label: "删除", type: "danger", onClick: () => handleDelete() }] : [])
];

export const toolbarItems = createToolbar([
  ["新增", "primary"], ["复制新增", "", true], ["GA->GC", "", true],
  ["导入", "", true], ["导出", "", true], ["模版导出", "", true]
]);

export const detailToolbarItems = createToolbar([["新增", "primary"], ["复制", "", true]]);

// ========== 主表格编辑弹窗配置 ==========
export const mainModalConfig = {
  titlePrefix: "基本信息",
  width: "1000px",
  columns: 2,
  labelWidth: "120px",
  formItems: [
    {
      name: "serialNumber",
      label: "序号",
      placeholder: "请输入序号",
      required: true
    },
    {
      name: "indexNumber",
      label: "索引号",
      placeholder: "请输入索引号",
      required: true
    },
    {
      name: "standardType",
      label: "标准类型",
      placeholder: "请选择标准类型",
      required: true
    },
    {
      name: "productStandard",
      label: "产品标准",
      placeholder: "请输入产品标准",
      required: true,
      span: 24
    },
    {
      name: "revisionNumber",
      label: "修订号",
      placeholder: "请输入修订号"
    },
    {
      name: "productName",
      label: "品名",
      placeholder: "请输入品名",
      required: true
    }
  ],
  api: {
    getById: "/api/metallurgical/getById" as any,
    save: "/api/metallurgical/save" as any,
    update: "/api/metallurgical/update" as any
  }
};

// ========== 实验项目编辑弹窗配置 ==========
export const experimentModalConfig = {
  titlePrefix: "实验项目",
  width: "900px",
  columns: 2,
  labelWidth: "120px",
  formItems: [
    {
      name: "testCategory",
      label: "试验种类",
      placeholder: "请输入试验种类",
      required: true,
      span: 24
    },
    {
      name: "testItem",
      label: "试验项目",
      placeholder: "请输入试验项目",
      required: true
    },
    {
      name: "judgmentLogic",
      label: "判断逻辑",
      placeholder: "请输入判断逻辑"
    },
    // 绝对判断组
    {
      name: "absLowerSymbol",
      label: "绝对下限符号",
      placeholder: "请输入符号",
      span: 6
    },
    {
      name: "absLowerValue",
      label: "绝对下限值",
      placeholder: "请输入数值",
      span: 6
    },
    {
      name: "absUpperSymbol",
      label: "绝对上限符号",
      placeholder: "请输入符号",
      span: 6
    },
    {
      name: "absUpperValue",
      label: "绝对上限值",
      placeholder: "请输入数值",
      span: 6
    },
    // 内控判断组
    {
      name: "internalLowerSymbol",
      label: "内控下限符号",
      placeholder: "请输入符号",
      span: 6
    },
    {
      name: "internalLowerValue",
      label: "内控下限值",
      placeholder: "请输入数值",
      span: 6
    },
    {
      name: "internalUpperSymbol",
      label: "内控上限符号",
      placeholder: "请输入符号",
      span: 6
    },
    {
      name: "internalUpperValue",
      label: "内控上限值",
      placeholder: "请输入数值",
      span: 6
    }
  ],
  api: {
    getById: "/api/experiment/getById" as any,
    save: "/api/experiment/save" as any,
    update: "/api/experiment/update" as any
  }
};

// ========== API配置 ==========
const API = {
  tree: "/api/metallurgical/tree",
  list: "/api/metallurgical/list",
  listPage: "/api/metallurgical/spec/list",
  experimentList: "/api/metallurgical/experiment/list"
} as const;

// ========== 通用数据加载工具 ==========
const handleApiError = (error: any, message: string) => {
  console.error(`${message}:`, error);
  ElMessage.error(`${message}: ${error instanceof Error ? error.message : "未知错误"}`);
};

const extractApiData = (res: any) => res.data.data || res.data;

// ========== 数据加载函数 ==========
export const loadTreeData = async () => {
  try {
    const now = Date.now();
    const cachedData = dataCache.value.treeData;
    const cacheTime = dataCache.value.treeLoadTime;
    
    if (cachedData && now - cacheTime < CACHE_DURATION) {
      treeData.value = cachedData;
      return;
    }
    
    const res = await request({ url: API.tree, method: "get" });
    const data = extractApiData(res);
    
    treeData.value = data;
    dataCache.value.treeData = data;
    dataCache.value.treeLoadTime = now;
  } catch (error) {
    handleApiError(error, "加载树形数据失败");
  }
};

// 加载主表数据
export const loadTableData = async () => {
  loading.value = true;
  try {
    const res = await request({
      url: API.list,
      method: "post",
      data: {
        ...unifiedQueryForm,
        ...detailQueryForm,
        pageNum: pagination.pageNum,
        pageSize: pagination.pageSize
      }
    });
    const responseData = extractApiData(res);
    tableData.value = responseData.list || responseData.records || [];
    updateKey.value++;
    pagination.total = responseData.total || 0;
  } catch (error) {
    handleApiError(error, "加载表格数据失败");
  } finally {
    loading.value = false;
  }
};

// 加载子表数据（实验数据）
export const loadExperimentData = async (row: TableRow, pageNum = 1) => {
  loading.value = true;
  console.log("加载子表数据:", row.id, pageNum);
  try {
    const cacheKey = `${row.id}_${pageNum}`;
    const cachedData = dataCache.value.experimentDataCache.get(cacheKey);
    const now = Date.now();

    if (cachedData && now - cachedData.loadTime < CACHE_DURATION) {
      console.log("使用缓存数据");
      experimentData.value = cachedData.data;
      updateKey.value++;
      experimentPagination.total = cachedData.total;
      experimentPagination.pageNum = pageNum;
      return;
    }

    const res = await request({
      url: API.experimentList,
      method: "post",
      data: {
        parentId: row.id,
        pageNum,
        pageSize: experimentPagination.pageSize
      }
    });

    const responseData = res.data?.data || res.data || res;
    const data = responseData.list || responseData.records || [];
    const total = responseData.total || 0;

    console.log("子表数据加载结果:", { data, total, pageNum });

    experimentData.value = data;
    updateKey.value++;
    experimentPagination.total = total;
    experimentPagination.pageNum = pageNum;

    dataCache.value.experimentDataCache.set(cacheKey, {
      data,
      total,
      loadTime: now
    });
  } catch (error) {
    console.error("加载子表数据失败:", error);
    ElMessage.error(
      `加载子表数据失败: ${error instanceof Error ? error.message : "未知错误"}`
    );
  } finally {
    loading.value = false;
  }
};

// 加载列表数据
export const loadListData = async () => {
  listLoading.value = true;
  try {
    const res = await request({
      url: API.listPage,
      method: "post",
      data: {
        ...unifiedQueryForm,
        pageNum: listPagination.pageNum,
        pageSize: listPagination.pageSize
      }
    });
    const responseData = res.data.data || res.data;
    listTableData.value = responseData.list || responseData.records || [];
    listPagination.total = responseData.total || 0;
  } catch (error) {
    console.error("加载列表数据失败:", error);
    ElMessage.error(
      `加载列表数据失败: ${error instanceof Error ? error.message : "未知错误"}`
    );
  } finally {
    listLoading.value = false;
  }
};

// ========== 事件处理 ==========
// 通用重置表单方法
const resetForm = (form: any) =>
  Object.keys(form).forEach((key) => (form[key] = ""));

// 查询和重置
export const handleUnifiedQuerySearch = () => {
  if (activeTab.value === "list") {
    listPagination.pageNum = 1;
    loadListData();
  } else {
    pagination.pageNum = 1;
    loadTableData();
  }
};

export const handleUnifiedQueryReset = () => {
  resetForm(unifiedQueryForm);
  handleUnifiedQuerySearch();
};

export const handleDetailQuerySearch = () => {
  pagination.pageNum = 1;
  loadExperimentData(currentSelectedRow.value, 1);
};

export const handleDetailQueryReset = () => {
  resetForm(detailQueryForm);
  handleDetailQuerySearch();
};

// 分页处理
const createPageHandler =
  (pagination: any, loadFn: Function) => (page: number) => {
    pagination.pageNum = page;
    loadFn();
  };

const createSizeHandler =
  (pagination: any, loadFn: Function) => (size: number) => {
    pagination.pageSize = size;
    pagination.pageNum = 1;
    loadFn();
  };

// 通用事件处理器工厂
const createEventHandlers = () => ({
  // 表格事件
  handleSelectionChange: (selection: TableRow[]) => { selectedRows.value = selection; },
  
  handleRowClick: (row: TableRow) => {
    console.log("点击行数据:", row);
    currentSelectedRow.value = row;
    detailActiveTab.value = "detail";
    loadExperimentData(row);
  },
  
  // 树节点事件
  handleNodeClick: (data: TreeNode) => {
    console.log('选中树节点:', data.label);
    isTreeNodeSelected.value = true;
    pagination.pageNum = 1;
    loadTableData();
  },
  
  handleTreeTabChange: (tabName: string) => {
    treeActiveTab.value = tabName;
    loadTreeData();
  },
  
  // 列表行点击
  handleListRowClick: (row: any) => {
    activeTab.value = "detail";
    unifiedQueryForm.specCode = row.specCode || "";
    ElMessage.info(`已切换到详情页面: ${row.specCode}`);
  }
});

// 导出事件处理器
export const { 
  handleSelectionChange, handleRowClick, handleNodeClick, 
  handleTreeTabChange, handleListRowClick 
} = createEventHandlers();

export const handlePageChange = createPageHandler(pagination, loadTableData);
export const handleSizeChange = createSizeHandler(pagination, loadTableData);
export const handleListPageChange = createPageHandler(listPagination, loadListData);
export const handleListSizeChange = createSizeHandler(listPagination, loadListData);

// 实验项目分页处理
export const handleExperimentPageChange = (page: number) => {
  if (currentSelectedRow.value) loadExperimentData(currentSelectedRow.value, page);
};

export const handleExperimentSizeChange = (size: number) => {
  experimentPagination.pageSize = size;
  handleExperimentPageChange(1);
};

// 行级操作
const createRowAction = (action: string) => (row: TableRow) => {
  ElMessage.info(`${action}: ${row.indexNumber}`);
};

// 删除操作
export const handleDelete = () => {
  if (selectedRows.value.length === 0) {
    ElMessage.warning("请先选择要删除的数据");
    return;
  }
  ElMessageBox.confirm("确定要删除选中的数据吗？", "提示", {
    type: "warning"
  }).then(() => {
    ElMessage.success("删除成功");
    loadTableData();
  });
};

export const handleGaToGcRow = createRowAction("GA->GC");
export const handleCopyRow = createRowAction("复制行");

// 主表格编辑事件
export const handleEditRow = (row: TableRow) => {
  console.log("编辑基本信息:", row);
  // 检查是否在浏览器环境中并且有全局的弹窗引用
  if (typeof window !== "undefined" && (window as any).mainModalRef) {
    (window as any).mainModalRef.edit(row.id);
  } else {
    ElMessage.info(`编辑基本信息: ${row.indexNumber} (弹窗功能演示)`);
  }
};
export const handleDeleteRow = (row: TableRow) => {
  ElMessageBox.confirm(
    `确定要删除索引号为 ${row.indexNumber} 的数据吗？`,
    "提示",
    { type: "warning" }
  ).then(() => {
    ElMessage.success("删除成功");
    loadTableData();
  });
};

// ========== 实验项目编辑相关 ==========
// 实验项目编辑事件
export const handleExperimentEdit = (row: ExperimentRow) => {
  console.log("编辑实验项目:", row);
  // 检查是否在浏览器环境中并且有全局的弹窗引用
  if (typeof window !== "undefined" && (window as any).experimentModalRef) {
    (window as any).experimentModalRef.edit(row.id);
  } else {
    ElMessage.info(`编辑实验项目: ${row.testItem} (弹窗功能演示)`);
  }
};

// 主表格弹窗确认事件
export const handleMainModalOk = () => {
  console.log("基本信息编辑完成");
  // 重新加载表格数据
  loadTableData();
};

// 弹窗确认事件
export const handleExperimentModalOk = () => {
  console.log("实验项目编辑完成");
  // 重新加载实验数据
  if (currentSelectedRow.value) {
    loadExperimentData(currentSelectedRow.value);
  }
};

// ========== 弹窗引用管理 ==========
// 定义全局变量用于存储弹窗引用
let mainModalRef: any = null;
let experimentModalRef: any = null;

// 设置主表格弹窗引用（由Vue组件调用）
export const setMainModalRef = (ref: any) => {
  mainModalRef = ref;
};

// 设置实验项目弹窗引用（由Vue组件调用）
export const setExperimentModalRef = (ref: any) => {
  experimentModalRef = ref;
};

// 行合并逻辑已移至列配置的 span 函数中，无需手动处理

// ========== 生命周期管理 ==========
export const initData = () => {
  loadTreeData();
  // 重置状态：详情页面初始不加载表格数据，等待用户点击树节点
  isTreeNodeSelected.value = false;
  tableData.value = [];
  experimentData.value = [];
  updateKey.value = 0;
};

export const cleanup = () => {
  // 清空缓存
  dataCache.value.treeData = null;
  dataCache.value.treeLoadTime = 0;
  dataCache.value.experimentDataCache.clear();
  
  // 清空选择状态
  selectedRows.value = [];
  currentSelectedRow.value = null;
  isTreeNodeSelected.value = false;
};
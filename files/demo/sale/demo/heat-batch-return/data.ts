/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-06-13 18:38:58
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-04 08:52:20
 * @FilePath: \cx-ui-sale\src\views\sale\demo\heat-batch-return\data.ts
 * @Description: 炉次返送 - 数据逻辑层
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 */
import { ref, reactive, h } from "vue";
import { TableColumnDesc } from "@jhlc/common-core/src/components/table/base-table/type";
import { ActionButtonDesc } from "@jhlc/common-core/src/components/toolbar/type";
import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";
import axios from "axios";
import { ElMessage } from "element-plus";

// 计划炉号点击处理函数
function handlePlanFurnaceNoClick(row: any) {
  ElMessage.info(`查看计划炉号: ${row.plannedFurnaceNumber} 的详细信息`);
  // 这里可以添加跳转到计划炉号详情页面或打开详情弹窗的逻辑
}

/**
 * 表格列配置 - 待返送
 */
export const pendingColumnsConfig: TableColumnDesc<any>[] = [
  { type: "selection", width: 55 },
  {
    label: "计划炉号",
    name: "plannedFurnaceNumber",
    defaultSlot: ({ row }: any) => {
      return h(
        "span",
        {
          style: "color: #409eff; cursor: pointer; text-decoration: underline;",
          onClick: () => handlePlanFurnaceNoClick(row)
        },
        row.plannedFurnaceNumber
      );
    }
  },
  { label: "计划顺序号", name: "plannedSequenceNumber", width: 120 },
  { label: "熔炼号", name: "smeltingNumber", width: 150 },
  { label: "内部钢种", name: "internalSteelGrade", width: 120 },
  { label: "铸机号", name: "castingMachineNumber", width: 120 }
];

/**
 * 表格列配置 - 已返送
 */
export const returnedColumnsConfig: TableColumnDesc<any>[] = [
  { type: "selection", width: 55 },
  {
    label: "计划炉号",
    name: "plannedFurnaceNumber",
    defaultSlot: ({ row }: any) => {
      return h(
        "span",
        {
          style: "color: #409eff; cursor: pointer; text-decoration: underline;",
          onClick: () => handlePlanFurnaceNoClick(row)
        },
        row.plannedFurnaceNumber
      );
    }
  },
  { label: "计划顺序号", name: "plannedSequenceNumber", width: 120 },
  { label: "熔炼号", name: "smeltingNumber", width: 150 },
  { label: "内部钢种", name: "internalSteelGrade", width: 120 },
  { label: "铸机号", name: "castingMachineNumber", width: 120 }
];

/**
 * Loading状态
 */
export const pendingLoading = ref(false);
export const returnedLoading = ref(false);

/**
 * 待返送数据
 */
export const pendingData = reactive({
  list: [] as any[],
  total: 0
});

/**
 * 已返送数据
 */
export const returnedData = reactive({
  list: [] as any[],
  total: 0
});

/**
 * 待返送分页
 */
export const pendingPagination = reactive({
  page: 1,
  pageSize: 15
});

/**
 * 已返送分页
 */
export const returnedPagination = reactive({
  page: 1,
  pageSize: 15
});

/**
 * 选中的行
 */
export const pendingSelectedRows = ref<any[]>([]);
export const returnedSelectedRows = ref<any[]>([]);

/**
 * API 配置 - 统一管理所有接口地址
 */
export const API_CONFIG = {
  list: "/api/furnace-batch/list",
  save: "/api/furnace-batch/save",
  update: "/api/furnace-batch/update",
  getById: "/api/furnace-batch/getOneById"
} as const;

/**
 * 获取待返送数据
 */
export const fetchPendingData = async () => {
  pendingLoading.value = true;

  try {
    const params = {
      page: pendingPagination.page,
      pageSize: pendingPagination.pageSize,
      type: "pending"
    };

    const response = await axios.get(API_CONFIG.list, { params });

    if (response.data.code === 200) {
      pendingData.list = response.data.data.list;
      pendingData.total = response.data.data.total;
    } else {
      ElMessage.error(response.data.message || "获取数据失败");
    }
  } catch (error) {
    console.error("获取待返送数据失败:", error);
    ElMessage.error("获取数据失败");
  } finally {
    pendingLoading.value = false;
  }
};

/**
 * 获取已返送数据
 */
export const fetchReturnedData = async () => {
  returnedLoading.value = true;

  try {
    const params = {
      page: returnedPagination.page,
      pageSize: returnedPagination.pageSize,
      type: "returned"
    };

    const response = await axios.get(API_CONFIG.list, { params });

    if (response.data.code === 200) {
      returnedData.list = response.data.data.list;
      returnedData.total = response.data.data.total;
    } else {
      ElMessage.error(response.data.message || "获取数据失败");
    }
  } catch (error) {
    console.error("获取已返送数据失败:", error);
    ElMessage.error("获取数据失败");
  } finally {
    returnedLoading.value = false;
  }
};

/**
 * 待返送分页变化
 */
export const handlePendingPageChange = (page: number) => {
  pendingPagination.page = page;
  fetchPendingData();
};

export const handlePendingSizeChange = (size: number) => {
  pendingPagination.pageSize = size;
  pendingPagination.page = 1;
  fetchPendingData();
};

/**
 * 已返送分页变化
 */
export const handleReturnedPageChange = (page: number) => {
  returnedPagination.page = page;
  fetchReturnedData();
};

export const handleReturnedSizeChange = (size: number) => {
  returnedPagination.pageSize = size;
  returnedPagination.page = 1;
  fetchReturnedData();
};

/**
 * 选择变化
 */
export const handlePendingSelectionChange = (selection: any[]) => {
  pendingSelectedRows.value = selection;
};

export const handleReturnedSelectionChange = (selection: any[]) => {
  returnedSelectedRows.value = selection;
};

/**
 * 查询
 */
export const handleQuery = () => {
  pendingPagination.page = 1;
  returnedPagination.page = 1;
  fetchPendingData();
  fetchReturnedData();
};

/**
 * 新增返送炉次弹窗配置
 */
export const modalConfig = {
  titlePrefix: "返送炉次",
  width: "60%",
  columns: 4,
  labelWidth: "90px",
  formItems: [
    {
      name: "ponoNumber",
      label: "PONO号",
      placeholder: "请输入"
    },
    {
      name: "continuousCasterNumber",
      label: "连铸机号",
      required: true,
      placeholder: "请选择",
      customProps: () => ({
        clearable: true,
        options: [
          { label: "1", value: "1" },
          { label: "2", value: "2" },
          { label: "3", value: "3" }
        ]
      })
    },
    {
      name: "internalSteelGrade",
      label: "内部钢种",
      required: true,
      placeholder: "请输入"
    },
    {
      name: "castSlabType",
      label: "铸坯类型",
      required: true,
      placeholder: "请选择",
      customProps: () => ({
        clearable: true,
        options: [
          { label: "类型1", value: "type1" },
          { label: "类型2", value: "type2" },
          { label: "类型3", value: "type3" }
        ]
      })
    },
    {
      name: "slabCount",
      label: "坯数",
      required: true,
      placeholder: "请输入",
      rules: [
        { required: true, message: "请输入坯数", trigger: "blur" },
        { pattern: /^\d+$/, message: "坯数必须为数字", trigger: "blur" }
      ]
    },
    {
      name: "thickness",
      label: "厚度",
      required: true,
      placeholder: "请输入",
      rules: [
        { required: true, message: "请输入厚度", trigger: "blur" },
        { pattern: /^\d+(\.\d+)?$/, message: "厚度必须为数字", trigger: "blur" }
      ]
    },
    {
      name: "width",
      label: "宽度",
      required: true,
      placeholder: "请输入",
      rules: [
        { required: true, message: "请输入宽度", trigger: "blur" },
        { pattern: /^\d+(\.\d+)?$/, message: "宽度必须为数字", trigger: "blur" }
      ]
    },
    {
      name: "length",
      label: "长度",
      required: true,
      placeholder: "请输入",
      rules: [
        { required: true, message: "请输入长度", trigger: "blur" },
        { pattern: /^\d+(\.\d+)?$/, message: "长度必须为数字", trigger: "blur" }
      ]
    },
    {
      name: "lengthUpperLimit",
      label: "长度上限",
      required: true,
      placeholder: "请输入",
      rules: [
        { required: true, message: "请输入长度上限", trigger: "blur" },
        {
          pattern: /^\d+(\.\d+)?$/,
          message: "长度上限必须为数字",
          trigger: "blur"
        }
      ]
    },
    {
      name: "widthUpperLimit",
      label: "宽度上限",
      required: true,
      placeholder: "请输入",
      rules: [
        { required: true, message: "请输入宽度上限", trigger: "blur" },
        {
          pattern: /^\d+(\.\d+)?$/,
          message: "宽度上限必须为数字",
          trigger: "blur"
        }
      ]
    }
  ] as BaseFormItemDesc<any>[],
  api: {
    getById: API_CONFIG.getById,
    save: API_CONFIG.save,
    update: API_CONFIG.update
  }
};

/**
 * 工具栏配置生成
 */
export const getToolbarConfig = (callbacks: {
  onReturn: () => void;
  onQuery: () => void;
}): ActionButtonDesc[] => [
  { label: "炉次返送", type: "primary", onClick: callbacks.onReturn },
  { label: "查询", type: "primary", onClick: callbacks.onQuery }
];

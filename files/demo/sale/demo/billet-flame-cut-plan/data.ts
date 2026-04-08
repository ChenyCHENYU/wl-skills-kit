/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-06-13 18:38:58
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-01 10:00:00
 * @FilePath: \cx-ui-sale\src\views\sale\demo\billet-flame-cut-plan\data.ts
 * @Description: 钢坯火切计划 - 数据逻辑层
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 */
import { ref, reactive, type Ref, h } from "vue";
import { BaseQueryItemDesc } from "@jhlc/common-core/src/components/form/base-query/type";
import { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";
import { ActionButtonDesc } from "@jhlc/common-core/src/components/toolbar/type";
import { TableColumnDesc } from "@jhlc/common-core/src/components/table/base-table/type";
import { ElMessage, ElMessageBox } from "element-plus";

// ==================== 类型定义 ====================
export interface TableRow {
  id: number;
  meltNo: string;
  slabNo: string;
  planHeatNo: string;
  slabType: string;
  cutCount: number;
  thickness: string;
  width: string;
  totalLength: string;
  weight: string;
  multipleNo: string;
  actualSteel: string;
  planCutTime: string;
  cutOperator: string;
}

// ==================== 表格渲染类型 ====================
export const renderType = ref<"dataTable" | "agGrid">("dataTable");

// ==================== 搜索项配置 ====================
export const queryItemsConfig: BaseQueryItemDesc<any>[] = [
  {
    name: "slabNo",
    label: "钢坯号",
    placeholder: "请输入"
  },
  {
    name: "planHeatNo",
    label: "计划炉号",
    placeholder: "请输入"
  },
  {
    name: "meltNo",
    label: "熔炼号",
    placeholder: "请输入"
  },
  {
    name: "dateRange",
    type: "range",
    startName: "startDate",
    endName: "endDate",
    label: "切断时间",
    rangeSeparator: "至",
    placeholder: "开始",
    widthScale: 1.5
  }
];

// ==================== 工具栏配置 ====================
export const getToolbarConfig = (callbacks: {
  onAdd: () => void;
  onSave: () => void;
  onExport: () => void;
  onReset: () => void;
}): ActionButtonDesc[] => [
  {
    name: "add",
    label: "新增",
    type: "primary",
    onClick: callbacks.onAdd
  },
  {
    name: "save",
    label: "保存",
    type: "success",
    onClick: callbacks.onSave
  },
  {
    name: "export",
    label: "导出",
    onClick: callbacks.onExport
  },
  {
    name: "reset",
    label: "重置",
    onClick: callbacks.onReset
  }
];

// ==================== 事件处理函数 ====================
function handleMeltNoClick(row: TableRow) {
  ElMessage.info(`查看熔炼号: ${row.meltNo} 的详细信息`);
  // 这里可以添加跳转到熔炼号详情页面或打开详情弹窗的逻辑
}

// ==================== 计划信息表格列配置 ====================
export const getPlanColumnsConfig = (callbacks: {
  onEdit: (row: TableRow) => void;
  onDelete: (row: TableRow) => void;
}): TableColumnDesc<TableRow>[] => [
  { type: "selection" },
  { label: "序号", type: "index", width: 60 },
  {
    label: "熔炼号",
    name: "meltNo",
    width: 120,
    defaultSlot: ({ row }: any) => {
      return h(
        "span",
        {
          style: "color: #409eff; cursor: pointer; text-decoration: underline;",
          onClick: () => handleMeltNoClick(row)
        },
        row.meltNo
      );
    }
  },
  { label: "板坯号", name: "slabNo", width: 140 },
  { label: "计划炉号", name: "planHeatNo", width: 120 },
  { label: "坯料类型", name: "slabType", width: 100 },
  { label: "切割块数", name: "cutCount", width: 100, align: "right" },
  { label: "厚度", name: "thickness", width: 80, align: "right" },
  { label: "宽度", name: "width", width: 80, align: "right" },
  { label: "总长度", name: "totalLength", width: 100, align: "right" },
  { label: "重量", name: "weight", width: 100, align: "right" },
  { label: "倍尺数", name: "multipleNo", width: 80, align: "right" },
  { label: "实际钢种", name: "actualSteel", width: 120 },
  { label: "计划切割时间", name: "planCutTime", width: 160 },
  { label: "切割人员", name: "cutOperator", width: 100 },
  {
    label: "操作",
    width: 140,
    fixed: "right",
    operations: [
      {
        name: "edit",
        label: "编辑",
        onClick: (row: TableRow) => callbacks.onEdit(row)
      },
      {
        name: "delete",
        label: "删除",
        onClick: (row: TableRow) => callbacks.onDelete(row)
      }
    ]
  } as any
];

// ==================== 切割信息表格列配置 ====================
export const cutColumnsConfig: TableColumnDesc<TableRow>[] = [
  { type: "selection" },
  { label: "序号", type: "index", width: 60 },
  {
    label: "熔炼号",
    name: "meltNo",
    width: 120,
    defaultSlot: ({ row }: any) => {
      return h(
        "span",
        {
          style: "color: #409eff; cursor: pointer; text-decoration: underline;",
          onClick: () => handleMeltNoClick(row)
        },
        row.meltNo
      );
    }
  },
  { label: "板坯号", name: "slabNo", width: 140 },
  { label: "计划炉号", name: "planHeatNo", width: 120 },
  { label: "坯料类型", name: "slabType", width: 100 },
  { label: "切割块数", name: "cutCount", width: 100, align: "right" },
  { label: "厚度", name: "thickness", width: 80, align: "right" },
  { label: "宽度", name: "width", width: 80, align: "right" },
  { label: "总长度", name: "totalLength", width: 100, align: "right" },
  { label: "重量", name: "weight", width: 100, align: "right" },
  { label: "倍尺数", name: "multipleNo", width: 80, align: "right" },
  { label: "实际钢种", name: "actualSteel", width: 120 },
  { label: "计划切割时间", name: "planCutTime", width: 160 },
  { label: "切割人员", name: "cutOperator", width: 100 },
  {
    label: "订单材/余材",
    width: 120,
    align: "center",
    defaultSlot: () => "--"
  }
];

// ==================== 弹窗配置 ====================
export const modalConfig = {
  titlePrefix: "计划信息",
  width: "800px",
  columns: 2,
  labelWidth: "120px",
  api: {
    getById: "/api/billet-flame-cut-plan/getById",
    save: "/api/billet-flame-cut-plan/save",
    update: "/api/billet-flame-cut-plan/update"
  },
  formItems: [
    {
      name: "meltNo",
      label: "熔炼号",
      placeholder: "请输入熔炼号",
      required: true
    },
    {
      name: "slabNo",
      label: "板坯号",
      placeholder: "请输入板坯号",
      required: true
    },
    {
      name: "planHeatNo",
      label: "计划炉号",
      placeholder: "请输入计划炉号",
      required: true
    },
    {
      name: "slabType",
      label: "坯料类型",
      placeholder: "请选择坯料类型",
      required: true,
      type: "select" as const,
      options: [
        { label: "热轧", value: "热轧" },
        { label: "冷轧", value: "冷轧" },
        { label: "中厚板", value: "中厚板" }
      ]
    },
    {
      name: "cutCount",
      label: "切割块数",
      placeholder: "请输入切割块数",
      required: true,
      type: "number" as const
    },
    {
      name: "thickness",
      label: "厚度",
      placeholder: "请输入厚度",
      required: true,
      type: "number" as const
    },
    {
      name: "width",
      label: "宽度",
      placeholder: "请输入宽度",
      required: true,
      type: "number" as const
    },
    {
      name: "totalLength",
      label: "总长度",
      placeholder: "请输入总长度",
      required: true,
      type: "number" as const
    },
    {
      name: "weight",
      label: "重量",
      placeholder: "请输入重量",
      required: true,
      type: "number" as const
    },
    {
      name: "multipleNo",
      label: "倍尺数",
      placeholder: "请输入倍尺数",
      required: true
    },
    {
      name: "actualSteel",
      label: "实际钢种",
      placeholder: "请输入实际钢种",
      required: true
    },
    {
      name: "planCutTime",
      label: "计划切割时间",
      placeholder: "请选择计划切割时间",
      required: true,
      type: "datetime" as const
    },
    {
      name: "cutOperator",
      label: "切割人员",
      placeholder: "请输入切割人员",
      required: true
    }
  ] as BaseFormItemDesc<TableRow>[]
};

// ==================== 创建页面 Hook ====================
export function createPageHook(modalRef: Ref<any>) {
  // 顶部标签页
  const activeTab = ref("plan");

  // 查询参数
  const queryParam = reactive({
    slabNo: "",
    planHeatNo: "",
    meltNo: "",
    startDate: "",
    endDate: ""
  });

  // 分页
  const page = reactive({
    current: 1,
    size: 10,
    total: 0
  });

  // 表格
  const tableRef = ref();
  const list = ref<TableRow[]>([]); // 分页显示的计划数据
  const fullPlanData = ref<TableRow[]>([]); // 完整的计划数据
  const cutList = ref<TableRow[]>([]);
  const loading = ref(false);

  // 查询项
  const queryItems = queryItemsConfig;

  // 工具栏
  const toolbars = getToolbarConfig({
    onAdd: () => modalRef.value?.open(),
    onSave: handleSave,
    onExport: handleExport,
    onReset: handleReset
  });

  // 表格列（带操作）
  const columns = getPlanColumnsConfig({
    onEdit: (row) => modalRef.value?.edit(row.id.toString()),
    onDelete: handleDelete
  });

  // 切割信息列
  const cutColumns = cutColumnsConfig;

  // 生成模拟数据
  // 生成计划信息数据（24条）
  function generatePlanMockData(): TableRow[] {
    const meltNos = [
      "25300001",
      "25300002",
      "25300003",
      "25300004",
      "25300005",
      "25300006",
      "25300007",
      "25300008"
    ];
    const slabTypes = ["热轧", "冷轧", "中厚板"];
    const operators = [
      "王志鹏",
      "李小明",
      "张华",
      "刘强",
      "陈明",
      "王强",
      "李华",
      "张明"
    ];

    const data: TableRow[] = [];
    for (let i = 1; i <= 24; i++) {
      data.push({
        id: i,
        meltNo: meltNos[Math.floor(Math.random() * meltNos.length)],
        slabNo: `BC3BD3BF${String(i).padStart(3, "0")}`,
        planHeatNo: `PH${String(Math.floor(Math.random() * 999) + 1).padStart(
          3,
          "0"
        )}`,
        slabType: slabTypes[Math.floor(Math.random() * slabTypes.length)],
        cutCount: Math.floor(Math.random() * 10) + 1,
        thickness: (Math.random() * 50 + 10).toFixed(1),
        width: (Math.random() * 1000 + 500).toFixed(0),
        totalLength: (Math.random() * 5000 + 1000).toFixed(0),
        weight: (Math.random() * 10 + 2).toFixed(2),
        multipleNo: String(Math.floor(Math.random() * 5) + 1),
        actualSteel: "Q235B",
        planCutTime: "2025-01-01 12:00:00",
        cutOperator: operators[Math.floor(Math.random() * operators.length)]
      });
    }
    return data;
  }

  // 生成切割信息数据（5条）
  function generateCutMockData(): TableRow[] {
    const meltNos = [
      "25300001",
      "25300002",
      "25300003",
      "25300004",
      "25300005"
    ];
    const slabTypes = ["热轧", "冷轧", "中厚板"];
    const operators = ["王志鹏", "李小明", "张华", "刘强", "陈明"];

    const data: TableRow[] = [];
    for (let i = 1; i <= 5; i++) {
      data.push({
        id: i,
        meltNo: meltNos[Math.floor(Math.random() * meltNos.length)],
        slabNo: `BC3BD3BF${String(i).padStart(3, "0")}`,
        planHeatNo: `PH${String(Math.floor(Math.random() * 999) + 1).padStart(
          3,
          "0"
        )}`,
        slabType: slabTypes[Math.floor(Math.random() * slabTypes.length)],
        cutCount: Math.floor(Math.random() * 10) + 1,
        thickness: (Math.random() * 50 + 10).toFixed(1),
        width: (Math.random() * 1000 + 500).toFixed(0),
        totalLength: (Math.random() * 5000 + 1000).toFixed(0),
        weight: (Math.random() * 10 + 2).toFixed(2),
        multipleNo: String(Math.floor(Math.random() * 5) + 1),
        actualSteel: "Q235B",
        planCutTime: "2025-01-01 12:00:00",
        cutOperator: operators[Math.floor(Math.random() * operators.length)]
      });
    }
    return data;
  }

  // 查询
  async function select() {
    loading.value = true;
    try {
      // 模拟API请求
      await new Promise((resolve) => setTimeout(resolve, 500));
      // 首次加载时生成完整数据
      if (fullPlanData.value.length === 0) {
        fullPlanData.value = generatePlanMockData();
        cutList.value = generateCutMockData();
      }
      // 根据分页参数切片计划数据
      const startIndex = (page.current - 1) * page.size;
      const endIndex = startIndex + page.size;
      list.value = fullPlanData.value.slice(startIndex, endIndex);
      page.total = fullPlanData.value.length;
    } finally {
      loading.value = false;
    }
  }

  // 保存
  function handleSave() {
    ElMessage.success("保存成功");
  }

  // 导出
  function handleExport() {
    ElMessage.success("导出成功");
  }

  // 重置
  function handleReset() {
    Object.assign(queryParam, {
      slabNo: "",
      planHeatNo: "",
      meltNo: "",
      startDate: "",
      endDate: ""
    });
    select();
  }

  // 删除
  function handleDelete(row: TableRow) {
    ElMessageBox.confirm(`确定要删除板坯号 "${row.slabNo}" 吗？`, "删除确认", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning"
    })
      .then(() => {
        const index = fullPlanData.value.findIndex(
          (item) => item.id === row.id
        );
        if (index > -1) {
          fullPlanData.value.splice(index, 1);
          // 重新计算分页数据
          const startIndex = (page.current - 1) * page.size;
          const endIndex = startIndex + page.size;
          list.value = fullPlanData.value.slice(startIndex, endIndex);
          page.total = fullPlanData.value.length;
          ElMessage.success("删除成功");
        }
      })
      .catch(() => {});
  }

  return {
    // 状态
    activeTab,
    queryParam,
    page,
    tableRef,
    list,
    cutList,
    loading,

    // 配置
    queryItems,
    toolbars,
    columns,
    cutColumns,
    renderType,
    modalConfig,

    // 方法
    select
  };
}

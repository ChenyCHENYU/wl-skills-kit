/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-12-29 15:38:58
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-03 10:00:00
 * @FilePath: \cx-ui-sale\src\views\sale\demo\add-demo\data.ts
 * @Description: 新增编辑页示例 - 数据逻辑层（可作为新增编辑页模板）
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 */
import { ref, reactive, h, Component, computed } from "vue";
import { ElMessageBox, ElMessage } from "element-plus";
import { Check, Document } from "@element-plus/icons-vue";
import request from "@jhlc/common-core/src/util/request";
import type {
  SectionConfig,
  NavTabConfig,
  HeaderAction
} from "@/components/local/c_formSections/data";

// ===== 类型定义 =====
interface ItemData {
  id: number;
  title: string;
  furnaceNumber: string;
  batchNumber: string;
  productionLine: string;
  feedCount: number;
  feedWeight: number;
  scrapCount: number;
  scrapWeight: number;
  operationTime: string;
  shift: string;
  team: string;
}

/**
 * API 配置 - 统一管理所有接口地址
 */
export const API_CONFIG = {
  // 主档操作
  save: "/api/order-form/save",
  saveDraft: "/api/order-form/draft",
  update: "/api/order-form/update",
  getById: "/api/order-form/getOneById",
  // 项次操作
  itemList: "/api/order-items/list",
  itemAdd: "/api/order-items/add",
  itemRemove: "/api/order-items/remove"
} as const;

// ===== 状态定义 =====
/** 项次信息表格全屏状态 */
export const isItemTableFullscreen = ref(false);

/** 折叠面板展开状态 */
export const activeNames = ref(["1", "2", "3", "4", "5"]);

// ===== 顶部操作按钮配置 =====
export const headerActions: HeaderAction[] = [
  {
    label: "保存",
    type: "primary",
    icon: Check as Component,
    onClick: async () => {
      await saveForm(false);
    }
  },
  {
    label: "保存为草稿",
    icon: Document as Component,
    onClick: async () => {
      await saveForm(true);
    }
  },
  {
    label: "取消",
    onClick: () => {
      ElMessageBox.confirm("确认放弃当前更改吗？", "提示", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning"
      })
        .then(() => {
          resetForm();
          ElMessage.success("已清空表单数据");
        })
        .catch(() => {
          // 用户取消操作
        });
    }
  }
];

// ===== 楼层导航配置 =====
export const navTabsConfig: NavTabConfig[] = [
  { label: "订单信息", name: "order", sectionName: null },
  { label: "基本信息", name: "basic", sectionName: "1" },
  { label: "产品规格", name: "spec", sectionName: "5" },
  { label: "价格信息", name: "price", sectionName: null },
  { label: "生产要求", name: "production", sectionName: null },
  { label: "运输信息", name: "shipping", sectionName: "2" },
  { label: "特殊需求", name: "special", sectionName: "3" },
  { label: "变更信息", name: "change", sectionName: "4" }
];

/** 切换项次信息表格全屏状态 */
export const toggleItemTableFullscreen = () => {
  isItemTableFullscreen.value = !isItemTableFullscreen.value;
};

// ===== 表单数据配置（数据+配置合一） =====
const formFieldsData = {
  // 基本信息
  basicInfo: {
    mpsRequirement: {
      value: "0-无",
      label: "MPS要求",
      type: "select",
      options: [{ label: "0-无", value: "0-无" }]
    },
    mpsNumber: { value: "", label: "MPS编号", type: "input" },
    mpsText: { value: "", label: "MPS文本", type: "input" },
    supervisionRequirement: {
      value: "0-无",
      label: "监制要求",
      type: "select",
      options: [{ label: "0-无", value: "0-无" }]
    },
    firstDayInspection: {
      value: "0-否",
      label: "首日检",
      type: "select",
      options: [{ label: "0-否", value: "0-否" }]
    },
    isCollaborative: {
      value: "0-否",
      label: "是否协同",
      type: "select",
      options: [{ label: "0-否", value: "0-否" }]
    },
    orderEngineeringNo: { value: "", label: "订单工程编号", type: "input" },
    process: { value: "", label: "制程", type: "input" },
    fullOrderDelivery: {
      value: "0-否",
      label: "整单交付",
      type: "select",
      options: [{ label: "0-否", value: "0-否" }]
    },
    forcedRelease: {
      value: "0-否",
      label: "强制放行",
      type: "select",
      required: true,
      options: [{ label: "0-否", value: "0-否" }]
    },
    isSampleDeliveryFree: {
      value: "0-否",
      label: "是否免费送样",
      type: "select",
      options: [{ label: "0-否", value: "0-否" }]
    }
  },
  // 运输信息
  shippingInfo: {
    shippingMethod: {
      value: "Q-汽运",
      label: "运输方式",
      type: "input",
      required: true
    },
    consignee: { value: "002", label: "收货人", type: "input", required: true },
    consigneeUnit: {
      value: "中国石化国际石油工...",
      label: "收货单位",
      type: "input"
    },
    deliveryLocation: { value: "产出库", label: "交运地点", type: "input" },
    arrivalStation: { value: "", label: "到站", type: "input" },
    dedicatedLine: { value: "", label: "专用线", type: "input" },
    consigneeAddress: {
      value: "北京市朝阳区6A",
      label: "收货地址",
      type: "input"
    },
    consigneeSequenceNo: {
      value: "002",
      label: "收货人序号",
      type: "input",
      required: true
    }
  },
  // 变更信息
  changeInfo: {
    changeType: { value: "", label: "变更类型", type: "input" },
    changePerson: { value: "", label: "变更人", type: "input" },
    changeTime: { value: "", label: "变更时间", type: "input" },
    changeReason: { value: "", label: "变更原因", type: "textarea", rows: 2 },
    changeFirstDayInspection: {
      value: "0-否",
      label: "首日检",
      type: "select",
      options: [{ label: "0-否", value: "0-否" }]
    },
    changeIsCollaborative: {
      value: "0-否",
      label: "是否协同",
      type: "select",
      options: [{ label: "0-否", value: "0-否" }]
    },
    changeOrderEngineeringNo: {
      value: "",
      label: "订单工程编号",
      type: "input"
    },
    changeIsSampleDeliveryFree: {
      value: "0-否",
      label: "是否免费送样",
      type: "select",
      options: [{ label: "0-否", value: "0-否" }]
    }
  },
  // 产品规格
  productSpec: {
    productName: {
      value: "",
      label: "产品名称",
      type: "input",
      required: true
    },
    productCode: {
      value: "",
      label: "产品编码",
      type: "input",
      required: true
    },
    specification: { value: "", label: "规格型号", type: "input" },
    material: { value: "", label: "材质", type: "input", required: true },
    diameter: { value: "", label: "直径(mm)", type: "input" },
    length: { value: "", label: "长度(mm)", type: "input" },
    thickness: { value: "", label: "壁厚(mm)", type: "input" },
    unitWeight: { value: "", label: "单重(kg)", type: "input" },
    standard: { value: "", label: "执行标准", type: "input" },
    surfaceTreatment: { value: "", label: "表面处理", type: "input" }
  }
};

/** 表单数据（自动从配置生成） */
export const form = reactive(
  Object.values(formFieldsData).reduce((acc, section) => {
    Object.entries(section).forEach(([key, config]) => {
      acc[key] = config.value;
    });
    return acc;
  }, {} as Record<string, any>)
);

// ===== 区块元数据配置 =====
const sectionsMeta = [
  { key: "basicInfo", name: "1", id: "section-1", title: "基本信息" },
  { key: "shippingInfo", name: "2", id: "section-2", title: "运输信息" },
  {
    key: "special",
    name: "3",
    id: "section-3",
    title: "特殊需求",
    isSpecial: true
  },
  { key: "changeInfo", name: "4", id: "section-4", title: "变更信息" },
  { key: "productSpec", name: "5", id: "section-5", title: "产品规格" }
] as const;

/** 自动生成区块配置 */
const sectionsConfigRaw: SectionConfig[] = sectionsMeta.map((meta) => ({
  name: meta.name,
  id: meta.id,
  title: meta.title,
  isSpecial: "isSpecial" in meta ? meta.isSpecial : undefined,
  fieldsConfig:
    meta.key === "special"
      ? []
      : Object.entries(
          formFieldsData[meta.key as keyof typeof formFieldsData] || {}
        ).map(([prop, config]) => {
          const { value, ...rest } = config;
          return { prop, ...rest } as any;
        })
}));

/** 表单区域配置（组件内部处理过滤逻辑） */
export const sectionsConfig = sectionsConfigRaw;

// ===== 项次信息表格配置 =====

/**
 * 处理标题点击事件
 * @param row 当前行数据
 * @param index 行索引（从 0 开始）
 */
export const handleTitleClick = (row: ItemData, index: number) => {
  ElMessageBox.alert(
    `你可以对我做点什么操作？
    
行 ID: ${row.id}
行序号: ${index + 1}
标题: ${row.title}
炉号: ${row.furnaceNumber}
批号: ${row.batchNumber}

这里可以添加编辑、查看详情、删除等操作按钮。`,
    `点击了第 ${index + 1} 行`,
    {
      confirmButtonText: "知道了",
      type: "info"
    }
  );
};

export const itemColumnsConfig = [
  { type: "selection", width: 40 },
  { type: "index", label: "序号", width: 60 },
  {
    name: "title",
    label: "标题",
    minWidth: 90,
    // 使用 defaultSlot 自定义渲染蓝色链接样式，添加点击事件
    defaultSlot: ({ row, $index }: { row: any; $index: number }) => {
      return h(
        "span",
        {
          style: "color: #409eff; cursor: pointer; text-decoration: underline;",
          onClick: () => handleTitleClick(row, $index)
        },
        row.title
      );
    }
  },
  {
    name: "furnaceNumber",
    label: "炉号",
    minWidth: 110,
    showOverflowTooltip: true
  },
  {
    name: "batchNumber",
    label: "批号",
    minWidth: 110,
    showOverflowTooltip: true
  },
  {
    name: "productionLine",
    label: "生产线",
    minWidth: 150,
    showOverflowTooltip: true
  },
  {
    name: "feedCount",
    label: "上料支数",
    minWidth: 90,
    showOverflowTooltip: true
  },
  {
    name: "feedWeight",
    label: "上料重量",
    minWidth: 90,
    showOverflowTooltip: true
  },
  {
    name: "scrapCount",
    label: "废品支数",
    minWidth: 90,
    showOverflowTooltip: true
  },
  {
    name: "scrapWeight",
    label: "废品重量",
    minWidth: 90,
    showOverflowTooltip: true
  },
  {
    name: "operationTime",
    label: "操作时间",
    minWidth: 140,
    showOverflowTooltip: true
  },
  {
    name: "shift",
    label: "班次",
    minWidth: 80,
    showOverflowTooltip: true,
    filterable: true
  },
  { name: "team", label: "班组", minWidth: 80, showOverflowTooltip: true }
];

// ===== 数据生成 =====
/** 项次数据 */
export const itemData = ref<ItemData[]>([]);

/** 分页状态 */
export const currentPage = ref(1);
export const pageSize = ref(10);

/** 项次数据总数 */
export const itemTotal = ref(0);

/** 分页后的项次数据 */
export const paginatedItemData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return itemData.value.slice(start, end);
});

// ========== 方法定义 ==========
/** 添加特殊需求 */
export const addSpecialRequirement = () => {
  console.log("添加特殊需求");
};

/**
 * 表单验证
 */
const validateForm = (): boolean => {
  // 检查必填字段
  const requiredFields = [
    { key: "productName", label: "产品名称" },
    { key: "productCode", label: "产品编码" },
    { key: "material", label: "材质" },
    { key: "shippingMethod", label: "运输方式" },
    { key: "consignee", label: "收货人" },
    { key: "consigneeSequenceNo", label: "收货人序号" },
    { key: "forcedRelease", label: "强制放行" }
  ];

  for (const field of requiredFields) {
    if (!form[field.key]) {
      ElMessage.error(`请填写${field.label}`);
      return false;
    }
  }

  return true;
};

/**
 * 保存表单
 * @param isDraft 是否保存为草稿
 */
const saveForm = async (isDraft: boolean) => {
  try {
    // 草稿可以不验证必填项
    if (!isDraft && !validateForm()) {
      return;
    }

    const res = await request({
      url: isDraft ? API_CONFIG.saveDraft : API_CONFIG.save,
      method: "post",
      data: {
        ...form,
        isDraft
      }
    });

    ElMessage.success(res.message || (isDraft ? "草稿保存成功" : "保存成功"));
  } catch (err) {
    console.error("保存失败:", err);
  }
};

/**
 * 重置表单
 */
const resetForm = () => {
  Object.keys(form).forEach((key) => {
    if (typeof form[key] === "string") {
      form[key] = "";
    } else if (typeof form[key] === "number") {
      form[key] = 0;
    } else if (Array.isArray(form[key])) {
      form[key] = [];
    }
  });
};

/**
 * 加载项次数据
 */
export const fetchItemData = async () => {
  try {
    const res = await request({
      url: API_CONFIG.itemList,
      method: "get",
      params: {
        page: currentPage.value,
        size: pageSize.value
      }
    });

    itemData.value = res.data.records || res.data;
    itemTotal.value = res.data.total || res.data.length;
  } catch (err) {
    console.error("加载项次数据失败:", err);
  }
};

/**
 * 刷新项次数据
 */
export const refreshItemData = () => {
  fetchItemData();
};

/**
 * 页面初始化
 */
export const initPage = () => {
  fetchItemData();
};

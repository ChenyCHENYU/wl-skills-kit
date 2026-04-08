/*
 * @Author: ChenYu ycyplus@gmail.com
 * @Date: 2025-06-13 18:38:58
 * @LastEditors: ChenYu ycyplus@gmail.com
 * @LastEditTime: 2026-01-04 09:20:35
 * @FilePath: \cx-ui-sale\src\views\sale\demo\domestic-trade-order\data.ts
 * @Description: 内贸订单 - 数据逻辑层（配置和业务逻辑）
 * Copyright (c) 2025 by CHENY, All Rights Reserved 😎.
 */
import type { Ref } from "vue";
import {
  AbstractPageQueryHook,
  BaseQueryItemDesc,
  ActionButtonDesc,
  TableColumnDesc,
  BusLogicDataType
} from "@/types/page";

import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";
import { useTableDelete } from "@/composables/useTableDelete";

// 表格渲染类型
export const renderType = ref<"dataTable" | "agGrid">("dataTable");

/**
 * API 配置 - 统一管理所有接口地址
 */
export const API_CONFIG = {
  list: "/api/domestic-trade-order/list",
  remove: "/api/domestic-trade-order/remove",
  getById: "/api/domestic-trade-order/getOneById",
  save: "/api/domestic-trade-order/save",
  update: "/api/domestic-trade-order/update"
} as const;

/**
 * 查询项配置
 */
export const queryItemsConfig: BaseQueryItemDesc<any>[] = [
  {
    name: "companyName",
    label: "公司名称",
    placeholder: "请选择"
  },
  {
    name: "groupOrderNo",
    label: "集团订单号",
    placeholder: "请输入"
  },
  {
    name: "productionOrderNo",
    label: "产销订单号",
    placeholder: "请输入"
  },
  {
    name: "orderStatus",
    label: "订单状态",
    placeholder: "请选择",
    logicType: BusLogicDataType.dict,
    logicValue: "ORDER_STATUS"
  },
  {
    name: "dateRange",
    type: "range",
    startName: "startDate",
    endName: "endDate",
    label: "日期录入",
    logicType: BusLogicDataType.date,
    rangeSeparator: "至",
    placeholder: "开始"
  },
  {
    name: "salesCompany",
    label: "销售公司",
    placeholder: "请选择",
    logicType: BusLogicDataType.dict,
    logicValue: "SALES_COMPANY"
  },
  {
    name: "salesOrg",
    label: "销售机构",
    placeholder: "请选择",
    logicType: BusLogicDataType.dict,
    logicValue: "SALES_ORG"
  },
  {
    name: "salesEmployeeId",
    label: "销售员工号",
    placeholder: "请选择",
    logicType: BusLogicDataType.dict,
    logicValue: "SALES_EMPLOYEE"
  },
  {
    name: "productSegment",
    label: "产品板块",
    placeholder: "请选择",
    logicType: BusLogicDataType.dict,
    logicValue: "PRODUCT_SEGMENT"
  }
];

/**
 * Modal 弹窗配置
 */
export const modalConfig = {
  titlePrefix: "内贸订单",
  width: "850px",
  columns: 2,
  labelWidth: "110px",
  formItems: [
    {
      name: "foreignTradeOrderNo",
      label: "外贸订单号",
      required: true,
      placeholder: "请输入外贸订单号"
    },
    {
      name: "period",
      label: "周期",
      required: true,
      placeholder: "请选择"
    },
    {
      name: "salesOrg",
      label: "销售机构",
      required: true,
      placeholder: "请选择"
    },
    {
      name: "manufacturingBase",
      label: "制造基地",
      required: true,
      placeholder: "请选择"
    },
    {
      name: "orderWeight",
      label: "订单重量",
      required: true,
      placeholder: "请输入订单重量"
    },
    {
      name: "weightedAverage",
      label: "加权平均",
      placeholder: "请输入加权平均"
    },
    {
      name: "settlementUser",
      label: "结算用户",
      required: true,
      placeholder: "请输入结算用户"
    },
    {
      name: "finalUser",
      label: "最终用户",
      placeholder: "请输入最终用户"
    },
    {
      name: "orderStatus",
      label: "订单状态",
      required: true,
      placeholder: "请选择"
    },
    {
      name: "merchandiser",
      label: "跟单员",
      placeholder: "请输入跟单员"
    },
    {
      name: "salesperson",
      label: "销售员",
      placeholder: "请输入销售员"
    },
    {
      name: "productionOrder",
      label: "产销订单",
      placeholder: "请输入产销订单"
    }
  ] as BaseFormItemDesc<any>[],
  api: {
    getById: API_CONFIG.getById,
    save: API_CONFIG.save,
    update: API_CONFIG.update
  }
};

/**
 * 创建页面Hook实例
 * @param modalRef 弹窗引用
 */
export function createPage(modalRef: Ref<any>) {
  let Page = new (class extends AbstractPageQueryHook {
    constructor() {
      super({
        url: {
          list: API_CONFIG.list,
          remove: API_CONFIG.remove
        }
      });
    }

    // 查询项配置
    queryDef(): BaseQueryItemDesc<any>[] {
      return queryItemsConfig;
    }

    // 工具栏配置
    toolbarDef(): ActionButtonDesc[] {
      return [
        {
          name: "add",
          label: "新增",
          type: "primary",
          onClick: () => modalRef.value?.open()
        },
        { label: "整单复制", plain: true, onClick: () => {} },
        { label: "审核", type: "success", onClick: () => {} },
        { label: "价格审核", type: "success", onClick: () => {} },
        { label: "生效", type: "success", onClick: () => {} },
        { label: "绿通放行", type: "success", onClick: () => {} },
        { label: "生成采购计划", plain: true, onClick: () => {} },
        { label: "一键生成采购合同", plain: true, onClick: () => {} },
        { label: "天管订货产品确认函", plain: true, onClick: () => {} },
        { label: "同步产销订单", plain: true, onClick: () => {} },
        { label: "下发预处理", plain: true, onClick: () => {} },
        { label: "下发校验", plain: true, onClick: () => {} },
        { label: "技术、交期评审", plain: true, onClick: () => {} },
        { label: "合同分款", plain: true, onClick: () => {} },
        { label: "查看合同", plain: true, onClick: () => {} },
        { label: "退回", type: "danger", onClick: () => {} }
      ];
    }

    // 表格列配置
    columnsDef(): TableColumnDesc<any>[] {
      const self = this;
      const handleDelete = useTableDelete(API_CONFIG.remove, () =>
        self.select()
      );

      return [
        { type: "selection", width: 55 },
        { label: "外贸订单号", name: "foreignTradeOrderNo", minWidth: 150 },
        {
          label: "周期",
          name: "period",
          minWidth: 80,
          align: "center",
          defaultSlot: ({ row }: any) => {
            return h(
              resolveComponent("ElTag") as any,
              { type: "danger", effect: "light", size: "small" },
              () => row.period
            );
          }
        },
        { label: "销售机构", name: "salesOrg", minWidth: 120 },
        { label: "制造基地", name: "manufacturingBase", minWidth: 120 },
        {
          label: "订单重量",
          name: "orderWeight",
          minWidth: 100,
          align: "right"
        },
        {
          label: "加权平均",
          name: "weightedAverage",
          minWidth: 100,
          align: "right"
        },
        {
          label: "结算用户",
          name: "settlementUser",
          minWidth: 200,
          showOverflowTooltip: true
        },
        {
          label: "最终目的地",
          name: "finalUser",
          minWidth: 120,
          showOverflowTooltip: true
        },
        { label: "订单状态", name: "orderStatus", minWidth: 120 },
        { label: "跟单员", name: "merchandiser", minWidth: 90 },
        { label: "销售员", name: "salesperson", minWidth: 90 },
        { label: "产销订单", name: "productionOrder", minWidth: 120 },
        {
          label: "操作",
          width: 150,
          fixed: "right",
          operations: [
            {
              name: "edit",
              label: "编辑",
              onClick: (row: any) => modalRef.value?.edit(row.id)
            },
            {
              name: "remove",
              label: "删除",
              onClick: (row: any) => handleDelete({ id: row.id })
            }
          ]
        }
      ];
    }
  })();

  return Page.create() as any;
}

import {
  AbstractPageQueryHook,
  BaseQueryItemDesc,
  ActionButtonDesc,
  TableColumnDesc
} from "@/types/page";
import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";
import { postAction } from "@jhlc/common-core/src/api/action";
import * as XLSX from "xlsx";
import { h, resolveComponent } from "vue";

/** 状态色块映射 */
const STATUS_TAG_MAP: Record<string, Record<string, string>> = {
  enableStatus: { 已启用: "success", 已停用: "danger" }
};
function renderStatusTag(row: any, field: string) {
  const val = row[field];
  const type = STATUS_TAG_MAP[field]?.[val];
  if (type === undefined) return val;
  return h(
    resolveComponent("ElTag") as any,
    { type, effect: "light", size: "small" },
    () => val
  );
}

export const API_CONFIG = {
  list: "/sale/customerArchive/list",
  remove: "/sale/customerArchive/remove",
  getById: "/sale/customerArchive/getById",
  save: "/sale/customerArchive/save",
  update: "/sale/customerArchive/update",
  export: "/sale/customerArchive/export",
  batchUpdate: "/sale/customerArchive/batchUpdate",
  enable: "/sale/customerArchive/enable",
  disable: "/sale/customerArchive/disable",
  import: "/sale/customerArchive/import"
} as const;

/** 下拉选项常量 */
const OPTS = {
  approvalProduct: [
    { label: "热轧", value: "热轧" },
    { label: "盘元", value: "盘元" },
    { label: "冷精", value: "冷精" },
    { label: "汽车", value: "汽车" }
  ],
  applyOrg: [
    { label: "不锈鋼接單中心", value: "不锈鋼接單中心" },
    {
      label: "江阴华新特殊合金材料有限公司",
      value: "江阴华新特殊合金材料有限公司"
    },
    { label: "採瞒管理中心", value: "採瞒管理中心" },
    { label: "烟台华鑫再生资源有限公司", value: "烟台华鑫再生资源有限公司" }
  ],
  applyType: [
    { label: "新增", value: "新增" },
    { label: "变更", value: "变更" }
  ],
  applicant: [
    { label: "魏子明", value: "魏子明" },
    { label: "龚辉鉴", value: "龚辉鉴" },
    { label: "宋书迪", value: "宋书迪" },
    { label: "李锋", value: "李锋" },
    { label: "杨松", value: "杨松" },
    { label: "王之勤", value: "王之勤" },
    { label: "邹建军", value: "邹建军" },
    { label: "龙成金", value: "龙成金" }
  ],
  applyDept: [
    { label: "業務管理處", value: "業務管理處" },
    { label: "線材銷售部", value: "線材銷售部" },
    { label: "無縫管銷售處", value: "無縫管銷售處" },
    { label: "華南銷售科", value: "華南銷售科" },
    { label: "汽車產業銷售科", value: "汽車產業銷售科" },
    { label: "大陸行銷部", value: "大陸行銷部" },
    { label: "冷精棒業管部(台北)", value: "冷精棒業管部(台北)" },
    { label: "業管科", value: "業管科" },
    { label: "華東銷售科", value: "華東銷售科" }
  ],
  approvalStatus: [
    { label: "开立审批中", value: "开立审批中" },
    { label: "审批完成", value: "审批完成" },
    { label: "流程终止", value: "流程终止" },
    { label: "驳回", value: "驳回" }
  ],
  verifyStatus: [
    { label: "未核实", value: "未核实" },
    { label: "已核实", value: "已核实" }
  ],
  enableStatus: [
    { label: "已启用", value: "已启用" },
    { label: "已停用", value: "已停用" }
  ],
  customerType: [
    { label: "交易客户", value: "交易客户" },
    { label: "非交易客户", value: "非交易客户" }
  ],
  relatedPartyType: [
    { label: "01-关联企业", value: "01-关联企业" },
    { label: "02-合并关系人", value: "02-合并关系人" },
    { label: "03-非关系人", value: "03-非关系人" },
    { label: "04-实质关系人", value: "04-实质关系人" }
  ],
  customerLevel: [
    { label: "大客户（B1)", value: "大客户（B1)" },
    { label: "一般客户（A1)", value: "一般客户（A1)" }
  ],
  customerClassify: [
    { label: "01-一级管厂", value: "01-一级管厂" },
    { label: "02-二级管厂", value: "02-二级管厂" },
    { label: "03-其他", value: "03-其他" },
    { label: "04-长约经销商", value: "04-长约经销商" },
    { label: "05-锻造及机加工", value: "05-锻造及机加工" }
  ],
  customerNature: [
    { label: "001-直接客户", value: "001-直接客户" },
    { label: "002-盘商", value: "002-盘商" },
    { label: "003-贸易商", value: "003-贸易商" },
    { label: "004-非交易-未分类", value: "004-非交易-未分类" }
  ]
};

export { OPTS };

/** c_formModal 配置 */
export const modalConfig = {
  titlePrefix: "客户",
  width: "850px",
  columns: 2,
  labelWidth: "110px",
  formItems: [
    {
      name: "customerCode",
      label: "客户编码",
      disabled: true,
      placeholder: "系统自动生成"
    },
    {
      name: "customerName",
      label: "客户名称",
      required: true,
      placeholder: "请输入客户名称"
    },
    {
      name: "customerShortName",
      label: "客户简称",
      placeholder: "请输入客户简称"
    },
    {
      name: "customerType",
      label: "客户类型",
      required: true,
      component: () => ({ tag: "jh-select", items: OPTS.customerType })
    },
    {
      name: "country",
      label: "国家/地区",
      component: () => ({
        tag: "jh-select",
        items: [
          { label: "中国大陆", value: "中国大陆" },
          { label: "日本", value: "日本" },
          { label: "韩国", value: "韩国" },
          { label: "美国", value: "美国" }
        ]
      })
    },
    {
      name: "currency",
      label: "交易币种",
      component: () => ({
        tag: "jh-select",
        items: [
          { label: "CNY", value: "CNY" },
          { label: "USD", value: "USD" },
          { label: "JPY", value: "JPY" }
        ]
      })
    },
    {
      name: "taxCategory",
      label: "纳税类别",
      component: () => ({
        tag: "jh-select",
        items: [
          { label: "一般纳税人", value: "一般纳税人" },
          { label: "小规模纳税人", value: "小规模纳税人" },
          { label: "海外纳税", value: "海外纳税" }
        ]
      })
    },
    {
      name: "enableStatus",
      label: "启用状态",
      component: () => ({ tag: "jh-select", items: OPTS.enableStatus })
    }
  ] as BaseFormItemDesc<any>[],
  api: {
    getById: API_CONFIG.getById,
    save: API_CONFIG.save,
    update: API_CONFIG.update
  }
};

let _editModalRef: any = null;

/** 查看客户详情（打开弹窗-查看模式） */
function handleCustomerCodeClick(row: any) {
  _editModalRef?.value?.view(row.id);
}

/** 管理视角列定义 */
export function managementColumns(): TableColumnDesc<any>[] {
  return [
    { type: "selection" },
    { type: "index" },
    {
      label: "客户编码",
      name: "customerCode",
      minWidth: 120,
      defaultSlot: ({ row }: any) => {
        return h(
          "span",
          {
            style:
              "color: #409eff; cursor: pointer; text-decoration: underline;",
            onClick: () => handleCustomerCodeClick(row)
          },
          row.customerCode
        );
      }
    },
    {
      label: "客户名称",
      name: "customerName",
      minWidth: 189,
      showOverflowTooltip: true
    },
    { label: "客户简称", name: "customerShortName", minWidth: 116 },
    { label: "客户类型", name: "customerType", minWidth: 105 },
    { label: "国家/地区", name: "country", minWidth: 100 },
    { label: "交易币种", name: "currency", minWidth: 93 },
    { label: "纳税类别", name: "taxCategory", minWidth: 100 },
    { label: "关系人分类", name: "relatedPartyType", minWidth: 122 },
    {
      label: "上级客户",
      name: "parentCustomer",
      minWidth: 119,
      showOverflowTooltip: true
    },
    { label: "集团", name: "groupName", minWidth: 113 },
    { label: "建立人", name: "creator", minWidth: 100 },
    { label: "建立时间", name: "createTime", minWidth: 165 },
    {
      label: "申请组织",
      name: "applyOrg",
      minWidth: 150,
      showOverflowTooltip: true
    },
    {
      label: "启用状态",
      name: "enableStatus",
      minWidth: 100,
      fixed: "right",
      defaultSlot: ({ row }: any) => renderStatusTag(row, "enableStatus")
    },
    { label: "停用时间", name: "disableTime", minWidth: 157, fixed: "right" },
    {
      label: "操作",
      width: 100,
      fixed: "right",
      operations: [
        {
          name: "edit",
          label: "编辑",
          onClick: (row: any) => _editModalRef?.value?.edit(row.id)
        },
        {
          name: "remove",
          label: "删除",
          onClick: (row: any) => Page?.remove(row.id)
        }
      ]
    }
  ];
}

/** 使用视角列定义（含业务字段） */
export function usageColumns(): TableColumnDesc<any>[] {
  return [
    { type: "selection" },
    { type: "index" },
    {
      label: "客户编码",
      name: "customerCode",
      minWidth: 120,
      defaultSlot: ({ row }: any) => {
        return h(
          "span",
          {
            style:
              "color: #409eff; cursor: pointer; text-decoration: underline;",
            onClick: () => handleCustomerCodeClick(row)
          },
          row.customerCode
        );
      }
    },
    {
      label: "客户名称",
      name: "customerName",
      minWidth: 189,
      showOverflowTooltip: true
    },
    { label: "客户简称", name: "customerShortName", minWidth: 116 },
    { label: "客户类型", name: "customerType", minWidth: 105 },
    { label: "国家/地区", name: "country", minWidth: 100 },
    { label: "交易币种", name: "currency", minWidth: 93 },
    { label: "纳税类别", name: "taxCategory", minWidth: 100 },
    { label: "关系人分类", name: "relatedPartyType", minWidth: 122 },
    {
      label: "上级客户",
      name: "parentCustomer",
      minWidth: 119,
      showOverflowTooltip: true
    },
    { label: "集团", name: "groupName", minWidth: 113 },
    {
      label: "使用组织",
      name: "useOrg",
      minWidth: 160,
      showOverflowTooltip: true
    },
    { label: "销售别", name: "salesType", minWidth: 100 },
    { label: "客户性质", name: "customerNature", minWidth: 100 },
    { label: "客户分类", name: "customerClassify", minWidth: 140 },
    { label: "客户级别", name: "customerLevel", minWidth: 120 },
    { label: "业务人员", name: "businessPerson", minWidth: 120 },
    { label: "业务部门", name: "businessDept", minWidth: 140 },
    { label: "收款协议", name: "paymentAgreement", minWidth: 140 },
    { label: "银承贴息", name: "bankAcceptanceDiscount", minWidth: 120 },
    { label: "免息天数", name: "interestFreeDays", minWidth: 100 },
    { label: "主要行业", name: "mainIndustry", minWidth: 120 },
    { label: "下游行业", name: "downstreamIndustry", minWidth: 140 },
    { label: "采购钢种", name: "steelType", minWidth: 120 },
    { label: "需求产品型态", name: "demandProductType", minWidth: 130 },
    { label: "月需求量", name: "monthDemand", minWidth: 100 },
    { label: "授信额度", name: "creditLimit", minWidth: 120 },
    { label: "佣金否", name: "commission", minWidth: 80 },
    { label: "备注", name: "remark", minWidth: 120, showOverflowTooltip: true },
    { label: "建立人", name: "creator", minWidth: 100 },
    { label: "建立时间", name: "createTime", minWidth: 165 },
    {
      label: "申请组织",
      name: "applyOrg",
      minWidth: 150,
      showOverflowTooltip: true
    },
    {
      label: "启用状态",
      name: "enableStatus",
      minWidth: 124,
      fixed: "right",
      defaultSlot: ({ row }: any) => renderStatusTag(row, "enableStatus")
    },
    { label: "停用时间", name: "disableTime", minWidth: 157, fixed: "right" },
    {
      label: "操作",
      width: 100,
      fixed: "right",
      operations: [
        {
          name: "edit",
          label: "编辑",
          onClick: (row: any) => _editModalRef?.value?.edit(row.id)
        },
        {
          name: "remove",
          label: "删除",
          onClick: (row: any) => Page?.remove(row.id)
        }
      ]
    }
  ];
}

let Page: any = null;

export function createPage(editModalRef?: any) {
  _editModalRef = editModalRef;

  let Page_inst = new (class extends AbstractPageQueryHook {
    constructor() {
      super({ url: { list: API_CONFIG.list, remove: API_CONFIG.remove } });
    }

    queryDef(): BaseQueryItemDesc<any>[] {
      return [
        { name: "customerCode", label: "客户编码", placeholder: "请输入" },
        {
          name: "approvalProduct",
          label: "审批产品别",
          component: () => ({ tag: "jh-select", items: OPTS.approvalProduct })
        },
        {
          name: "applyDate",
          startName: "applyDateStart",
          endName: "applyDateEnd",
          label: "申请日期",
          component: () => ({
            tag: "jh-date",
            type: "daterange",
            rangeSeparator: "至",
            showFormat: "YYYY-MM-DD",
            valueFormat: "YYYY-MM-DD"
          })
        },
        {
          name: "applyOrg",
          label: "申请组织",
          component: () => ({ tag: "jh-select", items: OPTS.applyOrg })
        },
        { name: "customerName", label: "客户名称", placeholder: "请输入" },
        {
          name: "applyType",
          label: "申请类型",
          component: () => ({ tag: "jh-select", items: OPTS.applyType })
        },
        {
          name: "applicant",
          label: "申请人",
          component: () => ({ tag: "jh-select", items: OPTS.applicant })
        },
        {
          name: "applyDept",
          label: "申请部门",
          component: () => ({ tag: "jh-select", items: OPTS.applyDept })
        },
        {
          name: "approvalStatus",
          label: "审批状态",
          component: () => ({ tag: "jh-select", items: OPTS.approvalStatus })
        },
        {
          name: "verifyStatus",
          label: "核实状态",
          component: () => ({ tag: "jh-select", items: OPTS.verifyStatus })
        }
      ];
    }

    toolbarDef(): ActionButtonDesc[] {
      return [
        {
          name: "primary",
          label: "新增申请",
          onClick: () => _editModalRef?.value?.open()
        },
        {
          label: "变更申请",
          plain: true,
          onClick: () => _editModalRef?.value?.open()
        },
        {
          label: "批量修改",
          plain: true,
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            ElMessage.info("批量修改功能开发中");
          }
        },
        {
          label: "导入",
          plain: true,
          onClick: () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".xlsx,.xls";
            input.onchange = async (e: any) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const buf = await file.arrayBuffer();
                const wb = XLSX.read(buf, { type: "array" });
                const rows = XLSX.utils.sheet_to_json(
                  wb.Sheets[wb.SheetNames[0]]
                ) as any[];
                if (!rows.length) {
                  ElMessage.warning("文件无有效数据");
                  return;
                }
                await postAction(API_CONFIG.import, { rows });
                ElMessage.success(`导入成功 ${rows.length} 条`);
                this.select();
              } catch {
                ElMessage.error("导入失败，请检查文件格式");
              }
            };
            input.click();
          }
        },
        {
          label: "导出",
          plain: true,
          onClick: async () => {
            const data = this.list.value;
            if (!data?.length) {
              ElMessage.warning("无数据可导出");
              return;
            }
            const exportData = data.map((row: any) => ({
              客户编码: row.customerCode,
              客户名称: row.customerName,
              客户简称: row.customerShortName,
              客户类型: row.customerType,
              "国家/地区": row.country,
              交易币种: row.currency,
              纳税类别: row.taxCategory,
              启用状态: row.enableStatus,
              建立时间: row.createTime
            }));
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "客户档案");
            XLSX.writeFile(wb, "客户档案.xlsx");
            ElMessage.success("导出成功");
          }
        },
        {
          name: "primary",
          label: "启用",
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            const ids = rows.map((r: any) => r.id);
            ElMessageBox.confirm("确定启用选中客户？", "提示", { type: "info" })
              .then(() => {
                postAction(API_CONFIG.enable, { ids }).then(() => {
                  ElMessage.success("启用成功");
                  this.select();
                });
              })
              .catch(() => {});
          }
        },
        {
          name: "warning",
          label: "停用",
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            const ids = rows.map((r: any) => r.id);
            ElMessageBox.confirm("确定停用选中客户？", "提示", {
              type: "warning"
            })
              .then(() => {
                postAction(API_CONFIG.disable, { ids }).then(() => {
                  ElMessage.success("停用成功");
                  this.select();
                });
              })
              .catch(() => {});
          }
        },
        {
          name: "danger",
          label: "删除",
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            this.removeBatch();
          }
        }
      ];
    }

    columnsDef(): TableColumnDesc<any>[] {
      return managementColumns();
    }
  })();

  Page = Page_inst;
  let result = (Page_inst as any).create() as any;

  return result;
}

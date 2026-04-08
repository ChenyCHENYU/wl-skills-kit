import {
  AbstractPageQueryHook,
  BaseQueryItemDesc,
  ActionButtonDesc,
  TableColumnDesc
} from "@/types/page";
import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";
import { postAction } from "@jhlc/common-core/src/api/action";
import envConfig from "@jhlc/common-core/src/store/env-config";
import * as XLSX from "xlsx";
import { h, resolveComponent } from "vue";

/** 状态色块映射 */
const STATUS_TAG_MAP: Record<string, Record<string, string>> = {
  convertStatus: { 已转化: "success", 未转化: "info" },
  customerStatus: { 临时客户: "warning", 正式客户: "success" },
  verifyStatus: { 已核实: "success", 未核实: "info" }
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
  list: "/sale/tempCustomerArchive/list",
  remove: "/sale/tempCustomerArchive/remove",
  getById: "/sale/tempCustomerArchive/getById",
  save: "/sale/tempCustomerArchive/save",
  update: "/sale/tempCustomerArchive/update",
  convert: "/sale/tempCustomerArchive/convert",
  cancel: "/sale/tempCustomerArchive/cancel",
  claim: "/sale/tempCustomerArchive/claim",
  assign: "/sale/tempCustomerArchive/assign",
  recycle: "/sale/tempCustomerArchive/recycle",
  returnBack: "/sale/tempCustomerArchive/return",
  export: "/sale/tempCustomerArchive/export"
} as const;

/** Tab 类型 */
export type TabType = "temp" | "formal" | "pool";

const OPTS = {
  customerStatus: [
    { label: "临时客户", value: "临时客户" },
    { label: "正式客户", value: "正式客户" }
  ],
  customerType: [
    { label: "SYCSR001-交易客户", value: "SYCSR001-交易客户" },
    { label: "SYCSR002-直采客户", value: "SYCSR002-直采客户" }
  ],
  useOrg: [
    { label: "不锈鋼接單中心", value: "不锈鋼接單中心" },
    {
      label: "江阴华新特殊合金材料有限公司",
      value: "江阴华新特殊合金材料有限公司"
    },
    { label: "採瞒管理中心", value: "採瞒管理中心" },
    { label: "烟台华鑫再生资源有限公司", value: "烟台华鑫再生资源有限公司" }
  ],
  businessDept: [
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
  product: [
    { label: "热轧", value: "热轧" },
    { label: "盘元", value: "盘元" },
    { label: "冷精", value: "冷精" },
    { label: "汽车", value: "汽车" }
  ],
  verifyStatus: [
    { label: "未核实", value: "未核实" },
    { label: "已核实", value: "已核实" }
  ],
  convertStatus: [
    { label: "已转化", value: "已转化" },
    { label: "未转化", value: "未转化" }
  ]
};

export { OPTS };

/** c_formModal 配置 */
export const modalConfig = {
  titlePrefix: "临时客户",
  width: "850px",
  columns: 2,
  labelWidth: "110px",
  formItems: [
    {
      name: "customerCode",
      label: "客户编号",
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
      name: "customerType",
      label: "客户类型",
      component: () => ({ tag: "jh-select", items: OPTS.customerType })
    },
    {
      name: "product",
      label: "产品别",
      component: () => ({ tag: "jh-select", items: OPTS.product })
    },
    { name: "contactPerson", label: "联系人", placeholder: "请输入联系人" },
    { name: "phone", label: "联系电话", placeholder: "请输入联系电话" },
    { name: "businessPerson", label: "业务员", placeholder: "请输入业务员" },
    { name: "applyReason", label: "申请原因", placeholder: "请输入申请原因" }
  ] as BaseFormItemDesc<any>[],
  api: {
    getById: API_CONFIG.getById,
    save: API_CONFIG.save,
    update: API_CONFIG.update
  }
};

let _editModalRef: any = null;

const DETAIL_ROUTE = "/aiflow/mmwrCustomerDetail";
/** 查看临时客户详情（跳转详情页） */
function handleCustomerCodeClick(row: any) {
  const router = envConfig()?.router;
  if (!router) {
    ElMessage.error("路由未初始化，请刷新页面重试");
    return;
  }
  location.href = router.resolve({
    path: DETAIL_ROUTE,
    query: { id: row.id }
  }).href;
}

let PageRef: any = null;

export function createPage(editModalRef?: any) {
  _editModalRef = editModalRef;
  const activeTab = ref<TabType>("temp");

  let Page = new (class extends AbstractPageQueryHook {
    constructor() {
      super({ url: { list: API_CONFIG.list, remove: API_CONFIG.remove } });
    }

    queryDef(): BaseQueryItemDesc<any>[] {
      return [
        { name: "customerCode", label: "客户编码", placeholder: "请输入" },
        {
          name: "customerStatus",
          label: "客户状态",
          component: () => ({ tag: "jh-select", items: OPTS.customerStatus })
        },
        {
          name: "useOrg",
          label: "使用组织",
          component: () => ({ tag: "jh-select", items: OPTS.useOrg })
        },
        { name: "customerName", label: "客户名称", placeholder: "请输入" },
        {
          name: "businessDept",
          label: "业务部门",
          component: () => ({ tag: "jh-select", items: OPTS.businessDept })
        },
        {
          name: "applicant",
          label: "申请人",
          component: () => ({ tag: "jh-select", items: OPTS.applicant })
        },
        {
          name: "convertStatus",
          label: "转换状态",
          component: () => ({ tag: "jh-select", items: OPTS.convertStatus })
        },
        {
          name: "product",
          label: "产品别",
          component: () => ({ tag: "jh-select", items: OPTS.product })
        },
        {
          name: "businessPerson",
          label: "业务员",
          component: () => ({ tag: "jh-select", items: OPTS.applicant })
        },
        {
          name: "verifyStatus",
          label: "核实状态",
          component: () => ({ tag: "jh-select", items: OPTS.verifyStatus })
        },
        {
          name: "createDate",
          startName: "createDateStart",
          endName: "createDateEnd",
          label: "建立日期",
          component: () => ({
            tag: "jh-date",
            type: "daterange",
            rangeSeparator: "至",
            showFormat: "YYYY-MM-DD",
            valueFormat: "YYYY-MM-DD"
          })
        },
        {
          name: "lastFollowDate",
          startName: "lastFollowDateStart",
          endName: "lastFollowDateEnd",
          label: "最后跟进时间",
          component: () => ({
            tag: "jh-date",
            type: "daterange",
            rangeSeparator: "至",
            showFormat: "YYYY-MM-DD",
            valueFormat: "YYYY-MM-DD"
          })
        }
      ];
    }

    toolbarDef(): ActionButtonDesc[] {
      return [
        {
          name: "primary",
          label: "新增",
          onClick: () => _editModalRef?.value?.open()
        },
        {
          label: "分配",
          plain: true,
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            const ids = rows.map((r: any) => r.id);
            ElMessageBox.confirm("确定分配选中客户？", "提示", { type: "info" })
              .then(() => {
                postAction(API_CONFIG.assign, { ids }).then(() => {
                  ElMessage.success("分配成功");
                  this.select();
                });
              })
              .catch(() => {});
          }
        },
        {
          label: "作废",
          type: "danger",
          plain: true,
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            const ids = rows.map((r: any) => r.id);
            ElMessageBox.confirm("确定作废选中客户？", "提示", {
              type: "warning"
            })
              .then(() => {
                postAction(API_CONFIG.cancel, { ids }).then(() => {
                  ElMessage.success("作废成功");
                  this.select();
                });
              })
              .catch(() => {});
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
              客户编号: row.customerCode,
              客户名称: row.customerName,
              客户类型: row.customerType,
              使用组织: row.useOrg,
              产品别: row.product,
              业务员: row.businessPerson,
              业务部门: row.businessDept,
              核实状态: row.verifyStatus,
              转换状态: row.convertStatus,
              创建时间: row.createTime
            }));
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "临时客户档案");
            XLSX.writeFile(wb, "临时客户档案.xlsx");
            ElMessage.success("导出成功");
          }
        },
        {
          label: "回收",
          type: "warning",
          plain: true,
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            const ids = rows.map((r: any) => r.id);
            ElMessageBox.confirm("确定回收选中客户？", "提示", {
              type: "warning"
            })
              .then(() => {
                postAction(API_CONFIG.recycle, { ids }).then(() => {
                  ElMessage.success("回收成功");
                  this.select();
                });
              })
              .catch(() => {});
          }
        },
        {
          label: "转化",
          type: "success",
          plain: true,
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            const ids = rows.map((r: any) => r.id);
            ElMessageBox.confirm("确定将选中临时客户转化为正式客户？", "提示", {
              type: "info"
            })
              .then(() => {
                postAction(API_CONFIG.convert, { ids }).then(() => {
                  ElMessage.success("转化成功");
                  this.select();
                });
              })
              .catch(() => {});
          }
        },
        {
          label: "认领",
          type: "success",
          plain: true,
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            const ids = rows.map((r: any) => r.id);
            ElMessageBox.confirm("确定认领选中客户？", "提示", { type: "info" })
              .then(() => {
                postAction(API_CONFIG.claim, { ids }).then(() => {
                  ElMessage.success("认领成功");
                  this.select();
                });
              })
              .catch(() => {});
          }
        },
        {
          label: "退回",
          type: "warning",
          plain: true,
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            const ids = rows.map((r: any) => r.id);
            ElMessageBox.confirm("确定退回选中客户？", "提示", {
              type: "warning"
            })
              .then(() => {
                postAction(API_CONFIG.returnBack, { ids }).then(() => {
                  ElMessage.success("退回成功");
                  this.select();
                });
              })
              .catch(() => {});
          }
        }
      ];
    }

    columnsDef(): TableColumnDesc<any>[] {
      return [
        { type: "selection" },
        { type: "index" },
        {
          label: "客户编号",
          name: "customerCode",
          minWidth: 140,
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
          label: "使用组织",
          name: "useOrg",
          minWidth: 180,
          showOverflowTooltip: true
        },
        { label: "产品别", name: "product", minWidth: 100 },
        { label: "申请原因", name: "applyReason", minWidth: 120 },
        { label: "业务员", name: "businessPerson", minWidth: 100 },
        { label: "业务部门", name: "businessDept", minWidth: 140 },
        {
          label: "核实状态",
          name: "verifyStatus",
          minWidth: 100,
          defaultSlot: ({ row }: any) => renderStatusTag(row, "verifyStatus")
        },
        { label: "创建人", name: "creator", minWidth: 100 },
        { label: "创建时间", name: "createTime", minWidth: 160 },
        { label: "最近跟进人", name: "lastFollowPerson", minWidth: 100 },
        { label: "最近跟进日期", name: "lastFollowDate", minWidth: 130 },
        {
          label: "转化状态",
          name: "convertStatus",
          minWidth: 100,
          fixed: "right",
          defaultSlot: ({ row }: any) => renderStatusTag(row, "convertStatus")
        },
        {
          label: "客户状态",
          name: "customerStatus",
          minWidth: 100,
          fixed: "right",
          defaultSlot: ({ row }: any) => renderStatusTag(row, "customerStatus")
        },
        {
          label: "操作",
          width: 140,
          fixed: "right",
          operations: [
            {
              name: "edit",
              label: "修改",
              show: (row: any) => row.verifyStatus === "已核实",
              onClick: (row: any) => _editModalRef?.value?.edit(row.id)
            },
            {
              name: "danger",
              label: "作废",
              show: (row: any) => row.verifyStatus === "已核实",
              onClick: (row: any) => {
                ElMessageBox.confirm("确定作废该客户？", "提示", {
                  type: "warning"
                })
                  .then(() => {
                    postAction(API_CONFIG.cancel, { ids: [row.id] }).then(
                      () => {
                        ElMessage.success("作废成功");
                        PageRef?.select();
                      }
                    );
                  })
                  .catch(() => {});
              }
            },
            {
              name: "edit",
              label: "编辑",
              show: (row: any) => row.verifyStatus !== "已核实",
              onClick: (row: any) => _editModalRef?.value?.edit(row.id)
            },
            {
              name: "remove",
              label: "删除",
              show: (row: any) => row.verifyStatus !== "已核实",
              onClick: (row: any) => {
                ElMessageBox.confirm("确定删除该客户？", "提示", {
                  type: "warning"
                })
                  .then(() => {
                    postAction(API_CONFIG.remove, { id: row.id }).then(() => {
                      ElMessage.success("删除成功");
                      PageRef?.select();
                    });
                  })
                  .catch(() => {});
              }
            }
          ]
        }
      ];
    }
  })();

  PageRef = Page;
  let result = (Page as any).create() as any;

  /** Tab 切换 */
  const handleTabChange = (val: TabType) => {
    activeTab.value = val;
    result.queryParam.value.tabType = val;
    result.select();
  };

  result.activeTab = activeTab;
  result.handleTabChange = handleTabChange;
  return result;
}

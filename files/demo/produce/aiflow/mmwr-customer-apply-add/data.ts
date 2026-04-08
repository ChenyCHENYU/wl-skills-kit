import {
  AbstractPageQueryHook,
  BaseQueryItemDesc,
  ActionButtonDesc,
  TableColumnDesc
} from "@/types/page";
import { postAction } from "@jhlc/common-core/src/api/action";
import envConfig from "@jhlc/common-core/src/store/env-config";
import { ElMessage, ElMessageBox } from "element-plus";
import { h, resolveComponent } from "vue";

// ===== 状态色块渲染 =====
const STATUS_TAG_MAP: Record<string, Record<string, string>> = {
  approvalStatus: {
    开立审批中: "",
    审批完成: "success",
    驳回: "danger",
    流程终止: "info"
  },
  verifyStatus: { 已核实: "success", 未核实: "info" }
};
function renderStatusTag(row: any, field: string) {
  const val = row[field];
  const typeMap = STATUS_TAG_MAP[field];
  if (!typeMap) return val;
  const type = Object.prototype.hasOwnProperty.call(typeMap, val)
    ? typeMap[val]
    : undefined;
  if (type === undefined) return val;
  return h(
    resolveComponent("ElTag") as any,
    { type: type || "", effect: "light", size: "small" },
    () => val
  );
}

export const API_CONFIG = {
  list: "/sale/customerApply/addList",
  remove: "/sale/customerApply/remove",
  getById: "/sale/customerApply/getById",
  save: "/sale/customerApply/save",
  update: "/sale/customerApply/update",
  submit: "/sale/customerApply/submit",
  withdraw: "/sale/customerApply/withdraw",
  export: "/sale/customerApply/export"
} as const;

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
    { label: "揉瞒管理中心", value: "揉瞒管理中心" },
    { label: "烟台华鑫再生资源有限公司", value: "烟台华鑫再生资源有限公司" }
  ],
  applyType: [
    { label: "新增", value: "新增" },
    { label: "变更", value: "变更" }
  ],
  applyDept: [
    { label: "業務管理處", value: "業務管理處" },
    { label: "線材銷售部", value: "線材銷售部" },
    { label: "無縫管銷售處", value: "無縫管銷售處" },
    { label: "華南銷售科", value: "華南銷售科" },
    { label: "汽車產業銷售科", value: "汽車產業銷售科" }
  ],
  applicant: [
    { label: "魏子明", value: "魏子明" },
    { label: "龚辉鉴", value: "龚辉鉴" },
    { label: "宋书迪", value: "宋书迪" },
    { label: "李锋", value: "李锋" },
    { label: "杨松", value: "杨松" }
  ],
  approvalStatus: [
    { label: "开立审批中", value: "开立审批中" },
    { label: "审批完成", value: "审批完成" },
    { label: "驳回", value: "驳回" },
    { label: "流程终止", value: "流程终止" }
  ],
  verifyStatus: [
    { label: "已核实", value: "已核实" },
    { label: "未核实", value: "未核实" }
  ]
};

const FORM_ROUTE = "/aiflow/mmwrCustomerApplyAddForm";

function navigateToForm(query?: Record<string, string>) {
  const router = envConfig()?.router;
  if (!router) {
    ElMessage.error("路由未初始化，请刷新页面重试");
    return;
  }
  const target: any = { path: FORM_ROUTE };
  if (query) target.query = query;
  location.href = router.resolve(target).href;
}

export function createPage() {
  const Page = new (class extends AbstractPageQueryHook {
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
          name: "applyDept",
          label: "申请部门",
          component: () => ({ tag: "jh-select", items: OPTS.applyDept })
        },
        {
          name: "applicant",
          label: "申请人",
          component: () => ({ tag: "jh-select", items: OPTS.applicant })
        },
        {
          name: "approvalStatus",
          label: "审批状态",
          component: () => ({ tag: "jh-select", items: OPTS.approvalStatus })
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
          onClick: () => navigateToForm()
        },
        {
          label: "提交",
          type: "primary",
          plain: true,
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            const ids = rows.map((r: any) => r.id);
            ElMessageBox.confirm("确定提交选中申请？", "提示", { type: "info" })
              .then(() => {
                postAction(API_CONFIG.submit, { ids }).then(() => {
                  ElMessage.success("提交成功");
                  this.select();
                });
              })
              .catch(() => {});
          }
        },
        {
          label: "删除",
          type: "danger",
          plain: true,
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            this.removeBatch();
          }
        },
        {
          label: "审批驳回",
          type: "danger",
          plain: true,
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            const ids = rows.map((r: any) => r.id);
            ElMessageBox.confirm("确定驳回选中申请？", "提示", {
              type: "warning"
            })
              .then(() => {
                postAction(API_CONFIG.update, {
                  ids,
                  approvalStatus: "驳回"
                }).then(() => {
                  ElMessage.success("已驳回");
                  this.select();
                });
              })
              .catch(() => {});
          }
        },
        {
          label: "审批通过",
          type: "success",
          plain: true,
          onClick: () => {
            const rows = this.tableRef.value?.getSelectionRows();
            if (!rows?.length) {
              ElMessage.warning("请先选择数据");
              return;
            }
            const ids = rows.map((r: any) => r.id);
            ElMessageBox.confirm("确定审批通过？", "提示", { type: "success" })
              .then(() => {
                postAction(API_CONFIG.update, {
                  ids,
                  approvalStatus: "审批完成"
                }).then(() => {
                  ElMessage.success("审批通过");
                  this.select();
                });
              })
              .catch(() => {});
          }
        },
        {
          label: "导出",
          plain: true,
          onClick: () => {
            postAction(API_CONFIG.export, this.queryParam.value).then(() => {
              ElMessage.success("导出成功");
            });
          }
        }
      ];
    }

    columnsDef(): TableColumnDesc<any>[] {
      return [
        { type: "selection" },
        { type: "index" },
        {
          label: "申请编码",
          name: "applyCode",
          minWidth: 160,
          defaultSlot: ({ row }: any) =>
            h(
              "span",
              {
                style:
                  "color:#409eff;cursor:pointer;text-decoration:underline;",
                onClick: () => navigateToForm({ id: row.id })
              },
              row.applyCode
            )
        },
        { label: "申请类型", name: "applyType", minWidth: 100 },
        { label: "客户编码", name: "customerCode", minWidth: 120 },
        {
          label: "客户名称",
          name: "customerName",
          minWidth: 200,
          showOverflowTooltip: true
        },
        { label: "审批产品别", name: "approvalProduct", minWidth: 100 },
        { label: "申请原因", name: "applyReason", minWidth: 120 },
        { label: "申请人", name: "applicant", minWidth: 100 },
        { label: "申请部门", name: "applyDept", minWidth: 130 },
        {
          label: "申请组织",
          name: "applyOrg",
          minWidth: 180,
          showOverflowTooltip: true
        },
        { label: "创建人", name: "creator", minWidth: 100 },
        { label: "创建时间", name: "createTime", minWidth: 160 },
        {
          label: "审批状态",
          name: "approvalStatus",
          minWidth: 110,
          fixed: "right",
          defaultSlot: ({ row }: any) => renderStatusTag(row, "approvalStatus")
        },
        {
          label: "核实状态",
          name: "verifyStatus",
          minWidth: 100,
          fixed: "right",
          defaultSlot: ({ row }: any) => renderStatusTag(row, "verifyStatus")
        },
        {
          label: "操作",
          width: 140,
          fixed: "right",
          operations: [
            {
              name: "edit",
              label: "编辑",
              onClick: (row: any) => navigateToForm({ id: row.id })
            },
            {
              name: "remove",
              label: "删除",
              onClick: (row: any) => this.remove(row.id)
            }
          ]
        }
      ];
    }
  })();

  return (Page as any).create() as any;
}

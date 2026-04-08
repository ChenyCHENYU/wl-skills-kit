import { getAction, postAction } from "@jhlc/common-core/src/api/action";
import { ElMessage, ElMessageBox } from "element-plus";
import { useRouter } from "vue-router";

export const API_CONFIG = {
  getById: "/sale/tempCustomerArchive/getById",
  save: "/sale/tempCustomerArchive/save",
  convert: "/sale/tempCustomerArchive/convert",
  assign: "/sale/tempCustomerArchive/assign",
  claim: "/sale/tempCustomerArchive/claim",
  recycle: "/sale/tempCustomerArchive/recycle",
  returnBack: "/sale/tempCustomerArchive/return"
} as const;

export const OPTS = {
  useOrg: [
    { label: "不锈钢接单中心", value: "不锈钢接单中心" },
    {
      label: "江阴华新特殊合金材料有限公司",
      value: "江阴华新特殊合金材料有限公司"
    },
    { label: "採瞒管理中心", value: "採瞒管理中心" },
    { label: "烟台华鑫再生资源有限公司", value: "烟台华鑫再生资源有限公司" }
  ],
  product: [
    { label: "热轧", value: "热轧" },
    { label: "盘元", value: "盘元" },
    { label: "冷精", value: "冷精" },
    { label: "汽车", value: "汽车" }
  ],
  customerType: [
    { label: "SYCSR001-交易客户", value: "SYCSR001-交易客户" },
    { label: "SYCSR002-直采客户", value: "SYCSR002-直采客户" }
  ],
  customerLevel: [
    { label: "一般客户（A1）", value: "一般客户（A1）" },
    { label: "重要客户（A2）", value: "重要客户（A2）" },
    { label: "战略客户（A3）", value: "战略客户（A3）" }
  ],
  currency: [
    { label: "CNY", value: "CNY" },
    { label: "USD", value: "USD" }
  ],
  followType: [
    { label: "客户拜访", value: "客户拜访" },
    { label: "电话跟进", value: "电话跟进" },
    { label: "邮件跟进", value: "邮件跟进" }
  ]
};

export interface FollowRecord {
  id: string;
  useOrg: string;
  product: string;
  type: string;
  activityDate: string;
  activityCode: string;
  activityTitle: string;
  activityContent: string;
  attachment: string;
  createTime: string;
}

export interface TempCustomerForm {
  id: string;
  customerName: string;
  convertStatus: string;
  tempCode: string;
  formalCode: string;
  useOrg: string;
  product: string;
  lastFollowPerson: string;
  lastFollowDate: string;
  creator: string;
  createTime: string;
  customerType: string;
  customerLevel: string;
  businessLicense: string;
  contactPerson: string;
  contactPhone: string;
  companyPhone1: string;
  companyPhone2: string;
  companyFax: string;
  position: string;
  email: string;
  address: string;
  consignee: string;
  deliveryContact: string;
  deliveryAddress: string;
  currency: string;
  taxRate: string;
  bankType: string;
  bankAccountName: string;
  bankAccount: string;
  bankBranch: string;
  invoiceHeader: string;
  taxNumber: string;
  invoiceEmail: string;
  invoicePhone: string;
  invoiceAddress: string;
  followRecords: FollowRecord[];
}

export function createMockData(): TempCustomerForm {
  return {
    id: "mock-001",
    customerName: "烟台华新不锈钢智能化深加工基地",
    convertStatus: "未转换",
    tempCode: "10001170",
    formalCode: "10001170",
    useOrg: "不锈钢接单中心",
    product: "热轧",
    lastFollowPerson: "郭松",
    lastFollowDate: "",
    creator: "郭松",
    createTime: "",
    customerType: "SYCSR001-交易客户",
    customerLevel: "一般客户（A1）",
    businessLicense: "",
    contactPerson: "潘灵连",
    contactPhone: "18174058864",
    companyPhone1: "18174058864",
    companyPhone2: "18174058864",
    companyFax: "18174058864",
    position: "采购",
    email: "2140309447@qq.com",
    address: "上海市宝山区富锦路885号",
    consignee: "潘灵连",
    deliveryContact: "18174058864",
    deliveryAddress: "上海市宝山区富锦路885号",
    currency: "CNY",
    taxRate: "--",
    bankType: "中国工商银行股份有限公司",
    bankAccountName: "江苏金恒信息科技股份有限公司",
    bankAccount: "1001 1538 1900 3292 075",
    bankBranch: "中国工商银行股份有限公司七台河兴煤支行",
    invoiceHeader: "江苏金恒信息科技股份有限公司",
    taxNumber: "91310000631696382C",
    invoiceEmail: "2140309447@qq.com",
    invoicePhone: "18174058864",
    invoiceAddress: "上海市宝山区富锦路885号",
    followRecords: [
      {
        id: "1",
        useOrg: "",
        product: "",
        type: "客户拜访",
        activityDate: "2024-01-01",
        activityCode: "CV20241119003-07",
        activityTitle: "客户拜访商业洽谈",
        activityContent: "******",
        attachment: "查看附件",
        createTime: "2024-01-01 20:00"
      },
      {
        id: "2",
        useOrg: "",
        product: "",
        type: "客户拜访",
        activityDate: "2024-01-01",
        activityCode: "CV20241119003-07",
        activityTitle: "客户拜访商业洽谈",
        activityContent: "******",
        attachment: "查看附件",
        createTime: "2024-01-01 20:00"
      },
      {
        id: "3",
        useOrg: "",
        product: "",
        type: "客户拜访",
        activityDate: "2024-01-01",
        activityCode: "CV20241119003-07",
        activityTitle: "客户拜访商业洽谈",
        activityContent: "******",
        attachment: "查看附件",
        createTime: "2024-01-01 20:00"
      }
    ]
  };
}

export function useTempCustomerDetail() {
  const router = useRouter();
  const loading = ref(false);
  const form = reactive<TempCustomerForm>(createMockData());

  async function loadDetail(id: string) {
    loading.value = true;
    try {
      const res = await getAction(API_CONFIG.getById, { id });
      if (res?.data) Object.assign(form, res.data);
    } finally {
      loading.value = false;
    }
  }

  async function handleSave() {
    loading.value = true;
    try {
      const res = await postAction(API_CONFIG.save, { ...form });
      if (res?.code === 200) ElMessage.success("保存成功");
    } finally {
      loading.value = false;
    }
  }

  function handleTempSave() {
    ElMessage.info("暂存功能开发中");
  }

  async function handleConvert() {
    ElMessageBox.confirm("确定将该临时客户转化为正式客户？", "提示", {
      type: "info"
    })
      .then(async () => {
        loading.value = true;
        try {
          const res = await postAction(API_CONFIG.convert, { ids: [form.id] });
          if (res?.code === 200) {
            ElMessage.success("转化成功");
            router.back();
          }
        } finally {
          loading.value = false;
        }
      })
      .catch(() => {});
  }

  function handleAssign() {
    ElMessage.info("分配功能开发中");
  }
  function handleClaim() {
    ElMessage.info("认领功能开发中");
  }
  function handleRecycle() {
    ElMessage.info("回收功能开发中");
  }
  function handleReturn() {
    ElMessage.info("退回功能开发中");
  }

  function addFollowRecord() {
    form.followRecords.push({
      id: Date.now().toString(),
      useOrg: "",
      product: "",
      type: "客户拜访",
      activityDate: "",
      activityCode: "",
      activityTitle: "",
      activityContent: "",
      attachment: "",
      createTime: ""
    });
  }

  function removeFollowRecord(index: number) {
    ElMessageBox.confirm("确定删除该跟进记录？", "提示", { type: "warning" })
      .then(() => {
        form.followRecords.splice(index, 1);
      })
      .catch(() => {});
  }

  function handleCancel() {
    router.back();
  }

  return {
    loading,
    form,
    loadDetail,
    handleSave,
    handleTempSave,
    handleConvert,
    handleAssign,
    handleClaim,
    handleRecycle,
    handleReturn,
    addFollowRecord,
    removeFollowRecord,
    handleCancel
  };
}

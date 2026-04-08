import { postAction, getAction } from "@jhlc/common-core/src/api/action";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { createAddMockData } from "@/components/local/c_customerTabs/data";
import envConfig from "@jhlc/common-core/src/store/env-config";

export const API_CONFIG = {
  getById: "/sale/customerApply/getById",
  save: "/sale/customerApply/save",
  submit: "/sale/customerApply/submit",
  changeHistory: "/sale/customerApply/changeHistory"
} as const;

export function useApplyAddForm(tabsRef: any) {
  const router = useRouter();
  const loading = ref(false);
  const isEdit = ref(false);
  const currentId = ref<string>("");

  async function loadDetail(id: string) {
    loading.value = true;
    isEdit.value = true;
    currentId.value = id;
    try {
      const res = await getAction(API_CONFIG.getById, { id });
      if (res?.data) tabsRef.value?.loadData(res.data);
    } finally {
      loading.value = false;
    }
  }

  function loadMockData() {
    tabsRef.value?.loadData(createAddMockData());
  }

  async function handleSave() {
    const valid = await tabsRef.value?.validate();
    if (!valid) {
      ElMessage.warning("请完善必填项");
      return;
    }
    loading.value = true;
    try {
      const formData = tabsRef.value?.collectFormData();
      const payload = isEdit.value
        ? { ...formData, id: currentId.value }
        : formData;
      const res = await postAction(API_CONFIG.save, payload);
      if (res?.code === 200) {
        ElMessage.success("保存成功");
        if (!isEdit.value && res.data?.id) {
          currentId.value = res.data.id;
          isEdit.value = true;
        }
      }
    } finally {
      loading.value = false;
    }
  }

  async function handleSaveAndChange() {
    const valid = await tabsRef.value?.validate();
    if (!valid) {
      ElMessage.warning("请完善必填项");
      return;
    }
    loading.value = true;
    try {
      const formData = tabsRef.value?.collectFormData();
      const payload = isEdit.value
        ? { ...formData, id: currentId.value }
        : formData;
      const saveRes = await postAction(API_CONFIG.save, payload);
      if (saveRes?.code === 200) {
        const id = currentId.value || saveRes.data?.id;
        const submitRes = await postAction(API_CONFIG.submit, { ids: [id] });
        if (submitRes?.code === 200) ElMessage.success("保存并变更成功");
      }
    } finally {
      loading.value = false;
    }
  }

  const HISTORY_ROUTE = "/aiflow/mmwrCustomerApplyChangeHistory";
  function handleChangeHistory() {
    if (!currentId.value) {
      ElMessage.warning("请先保存申请后再查看变更历史");
      return;
    }
    const router = envConfig()?.router;
    if (!router) {
      ElMessage.error("路由未初始化，请刷新页面重试");
      return;
    }
    location.href = router.resolve({
      path: HISTORY_ROUTE,
      query: { id: currentId.value }
    }).href;
  }

  function handleCancel() {
    router.back();
  }

  return {
    loading,
    isEdit,
    loadDetail,
    loadMockData,
    handleSave,
    handleSaveAndChange,
    handleChangeHistory,
    handleCancel
  };
}

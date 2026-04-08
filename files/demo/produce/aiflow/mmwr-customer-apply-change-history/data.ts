import { getAction } from "@jhlc/common-core/src/api/action";
import { useRouter } from "vue-router";
import { createChangeMockData } from "@/components/local/c_customerTabs/data";
import type {
  BasicInfoForm,
  BusinessInfoRow
} from "@/components/local/c_customerTabs/data";

export const API_CONFIG = {
  changeHistoryList: "/sale/customerApply/changeHistory/list",
  getById: "/sale/customerApply/changeHistory/getById",
  getDiffById: "/sale/customerApply/changeHistory/getDiffById"
} as const;

export interface HistoryRecord {
  id: string;
  changeType: string;
  changeTime: string;
  changePerson: string;
}

/** 变更历史记录 mock 数据（对齐原型截图，首条为"数据变更"以便立即展示比对效果） */
function createHistoryListMock(): HistoryRecord[] {
  return [
    {
      id: "h001",
      changeType: "数据变更",
      changeTime: "2025/12/15 13:48:07",
      changePerson: "变更人姓名"
    },
    {
      id: "h002",
      changeType: "数据新增",
      changeTime: "2025/12/15 13:48:07",
      changePerson: "新增人姓名"
    },
    {
      id: "h003",
      changeType: "数据新增",
      changeTime: "2025/12/15 13:48:07",
      changePerson: "新增人姓名"
    },
    {
      id: "h004",
      changeType: "数据变更",
      changeTime: "2025/12/15 13:48:07",
      changePerson: "变更人姓名"
    },
    {
      id: "h005",
      changeType: "数据变更",
      changeTime: "2025/12/15 13:48:07",
      changePerson: "变更人姓名"
    },
    {
      id: "h006",
      changeType: "数据新增",
      changeTime: "2025/12/15 13:48:07",
      changePerson: "新增人姓名"
    },
    {
      id: "h007",
      changeType: "数据新增",
      changeTime: "2025/12/15 13:48:07",
      changePerson: "新增人姓名"
    }
  ];
}

/** 变更比对 mock：旧版数据（对齐原型截图中的上下比对效果）
 *  使用显示标签（非值码），以便 diff-old-value 直接展示中文。
 *  - basicInfo.taxCategory:   "小规模纳税人"（旧）vs "一级纳税人"（新）
 *  - basicInfo.relationType:  "02-合并关系人"（旧）vs "03-非关系人"（新）
 *  - businessInfoList[0]:     salesType "外销"（旧）vs "内销"（新），customerLevel "B3" vs "B1"
 */
function createDiffMockData(): {
  basicInfo: BasicInfoForm;
  businessInfoList: BusinessInfoRow[];
} {
  const current = createChangeMockData();
  return {
    basicInfo: {
      ...current.basicInfo,
      taxCategory: "小规模纳税人",
      relationType: "02-合并关系人"
    },
    businessInfoList: current.businessInfoList.map((row, idx) => {
      if (idx === 0) {
        return { ...row, salesType: "外销", customerLevel: "B3" };
      }
      return { ...row };
    })
  };
}

export function useChangeHistory(tabsRef: any) {
  const router = useRouter();
  const loading = ref(false);
  const historyLoading = ref(false);
  const historyList = ref<HistoryRecord[]>([]);
  const selectedId = ref<string>("");
  const isMockMode = ref(false);

  // ─── 真实接口模式（有 id 时调用） ───

  async function loadHistoryList(applyId: string) {
    isMockMode.value = false;
    historyLoading.value = true;
    try {
      const res = await getAction(API_CONFIG.changeHistoryList, { applyId });
      if (res?.data?.length) {
        historyList.value = res.data;
      }
    } finally {
      historyLoading.value = false;
      if (historyList.value.length > 0) {
        await loadHistoryDetail(historyList.value[0].id);
      }
    }
  }

  async function loadHistoryDetail(id: string) {
    selectedId.value = id;
    loading.value = true;
    const currentRecord = historyList.value.find((r) => r.id === id);
    const isChangeType = currentRecord?.changeType.includes("变更");
    try {
      const res = await getAction(API_CONFIG.getById, { id });
      if (res?.data) {
        tabsRef.value?.loadData(res.data);
        if (isChangeType) {
          const diffRes = await getAction(API_CONFIG.getDiffById, { id }).catch(
            () => null
          );
          if (diffRes?.data) {
            tabsRef.value?.loadDiffData(diffRes.data);
          } else {
            tabsRef.value?.clearDiffData?.();
          }
        } else {
          tabsRef.value?.clearDiffData?.();
        }
      }
    } finally {
      loading.value = false;
    }
  }

  // ─── Mock 模式（无 id 时调用，纯本地数据，零接口请求） ───

  function loadMockData() {
    isMockMode.value = true;
    historyList.value = createHistoryListMock();
    if (historyList.value.length > 0) {
      nextTick(() => selectMockDetail(historyList.value[0].id));
    }
  }

  function selectMockDetail(id: string) {
    selectedId.value = id;
    const currentRecord = historyList.value.find((r) => r.id === id);
    const isChangeType = currentRecord?.changeType.includes("变更");
    tabsRef.value?.loadData(createChangeMockData());
    if (isChangeType) {
      tabsRef.value?.loadDiffData(createDiffMockData());
    } else {
      tabsRef.value?.clearDiffData?.();
    }
  }

  // ─── 公共 ───

  function handleSelectHistory(item: HistoryRecord) {
    if (item.id === selectedId.value) return;
    if (isMockMode.value) {
      selectMockDetail(item.id);
    } else {
      loadHistoryDetail(item.id);
    }
  }

  function handleCancel() {
    router.back();
  }

  return {
    loading,
    historyLoading,
    historyList,
    selectedId,
    loadHistoryList,
    loadMockData,
    handleSelectHistory,
    handleCancel
  };
}

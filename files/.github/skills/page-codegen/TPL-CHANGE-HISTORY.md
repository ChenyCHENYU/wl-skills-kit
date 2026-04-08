# CHANGE_HISTORY：变更历史查询

> 见 SKILL.md 主文件（约束 + 按钮规则 + Mock 规范等共用规则）。


> 适用场景：左侧为变更历史时间线列表，右侧为变更详情（复用业务域组件如 `c_customerTabs`，view 模式只读）。
> 特征识别：原型中出现"变更记录"左面板 + "变更详情"右面板的双栏布局；左侧每条记录含类型（数据新增/数据变更）、时间、人员。

#### 识别规则

- 原型出现**左窄右宽双栏**布局
- 左侧为**时间线 / 历史记录列表**（含彩色圆点 + 类型 + 时间 + 人员）
- 右侧为**详情区域**（只读 view 模式），复用表单页的业务组件
- 页面为**隐藏菜单**，由表单页跳转而来

#### 文件结构

```
[kebab-name]-change-history/
├── index.vue     ← 双栏布局（左面板 + 右面板 + 业务组件）
├── data.ts       ← useChangeHistory composable + mock 数据
├── index.scss    ← 双栏 flex 布局样式
└── api.md        ← 接口约定
```

#### data.ts 模板

```typescript
import { getAction } from "@jhlc/common-core/src/api/action";
import { useRouter } from "vue-router";
import { create[Domain]MockData } from "@/components/local/c_[domainTabs]/data";
import type { BasicInfoForm, BusinessInfoRow } from "@/components/local/c_[domainTabs]/data";

export const API_CONFIG = {
  changeHistoryList: "/[服务缩写]/[资源]/changeHistory/list",
  getById: "/[服务缩写]/[资源]/changeHistory/getById",
  getDiffById: "/[服务缩写]/[资源]/changeHistory/getDiffById"  // 获取旧版比对数据
} as const;

export interface HistoryRecord {
  id: string;
  changeType: string;
  changeTime: string;
  changePerson: string;
}

/** 变更历史记录 mock 数据（对齐原型截图） */
function createHistoryListMock(): HistoryRecord[] {
  return [
    { id: "h001", changeType: "数据新增", changeTime: "2025/12/15 13:48:07", changePerson: "新增人姓名" },
    { id: "h003", changeType: "数据变更", changeTime: "2025/12/15 13:48:07", changePerson: "变更人姓名" },
    // ... 按原型增减
  ];
}

/** 变更比对 mock：旧版数据（体现字段级差异）
 *  修改目标字段使之与 createChangeMockData 产生差异，
 *  c_domainTabs.loadDiffData() 会自动对比并高亮。
 */
function createDiffMockData() {
  const current = create[Domain]MockData();
  return {
    basicInfo: { ...current.basicInfo, /* 修改需要比对的字段 */ },
    businessInfoList: current.businessInfoList.map((row, idx) => {
      if (idx === 0) return { ...row, /* 修改需要比对的字段 */ };
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

  // ── Mock 模式（后端接口未就绪时使用，关闭 mock 后切换到 loadHistoryList） ──
  function loadMockData() {
    isMockMode.value = true;
    // 数据变更记录排在首位，确保页面加载时立即可见 diff 比对效果
    historyList.value = createHistoryListMock();
    if (historyList.value.length > 0) {
      nextTick(() => selectMockDetail(historyList.value[0].id));
    }
  }

  function selectMockDetail(id: string) {
    selectedId.value = id;
    const record = historyList.value.find(r => r.id === id);
    tabsRef.value?.loadData(create[Domain]MockData());
    if (record?.changeType.includes("变更")) {
      tabsRef.value?.loadDiffData(createDiffMockData());
    } else {
      tabsRef.value?.clearDiffData();
    }
  }

  // ── 真实接口模式（有 id 时使用） ──
  async function loadHistoryList(applyId: string) {
    historyLoading.value = true;
    try {
      const res = await getAction(API_CONFIG.changeHistoryList, { applyId });
      historyList.value = res?.data?.length ? res.data : createHistoryListMock();
    } catch {
      historyList.value = createHistoryListMock();
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
    try {
      const res = await getAction(API_CONFIG.getById, { id });
      tabsRef.value?.loadData(res?.data || create[Domain]MockData());
      const diffRes = await getAction(API_CONFIG.getDiffById, { id }).catch(() => null);
      if (diffRes?.data) {
        tabsRef.value?.loadDiffData(diffRes.data);
      } else {
        tabsRef.value?.clearDiffData();
      }
    } catch {
      tabsRef.value?.loadData(create[Domain]MockData());
      tabsRef.value?.clearDiffData();
    } finally {
      loading.value = false;
    }
  }

  function handleSelectHistory(item: HistoryRecord) {
    if (item.id === selectedId.value) return;
    if (isMockMode.value) {
      selectMockDetail(item.id);
    } else {
      loadHistoryDetail(item.id);
    }
  }

  function handleCancel() { router.back(); }

  return { loading, historyLoading, historyList, selectedId, loadHistoryList, loadMockData, handleSelectHistory, handleCancel };
}
```

#### index.vue 模板

```vue
<template>
  <div class="app-container [page-class]">
    <!-- 左侧：变更历史记录面板 -->
    <div class="history-panel" v-loading="historyLoading">
      <div class="history-panel__header">变更记录</div>
      <div class="history-panel__list">
        <div v-for="item in historyList" :key="item.id" class="history-card"
          :class="{ 'is-active': item.id === selectedId }" @click="handleSelectHistory(item)">
          <span class="history-card__dot"
            :class="item.changeType.includes('新增') ? 'is-add' : 'is-change'"></span>
          <div class="history-card__content">
            <div class="history-card__type">{{ item.changeType }}</div>
            <div class="history-card__date">{{ item.changeTime }}</div>
            <div class="history-card__person">{{ item.changePerson }}</div>
          </div>
        </div>
        <div v-if="!historyList.length && !historyLoading" class="history-empty">暂无变更记录</div>
      </div>
    </div>
    <!-- 右侧：变更详情面板 -->
    <div class="detail-panel" v-loading="loading">
      <div class="page-header">
        <span class="page-title">[实体]变更详情</span>
        <span class="page-tag page-tag--change">变更</span>
        <span class="page-tag page-tag--status">未审核</span>
      </div>
      <div class="page-toolbar">
        <el-button @click="handleCancel">取消</el-button>
      </div>
      <div class="detail-panel__body">
        <c_[domainTabs] ref="tabsRef" mode="view" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { useChangeHistory } from "./data";
import c_[domainTabs] from "@/components/local/c_[domainTabs]/index.vue";

const tabsRef = ref();
const route = useRoute();
const { loading, historyLoading, historyList, selectedId, loadHistoryList, loadMockData, handleSelectHistory, handleCancel } = useChangeHistory(tabsRef);

onMounted(() => {
  const id = route.query.id as string;
  if (id) {
    loadHistoryList(id);   // 真实接口：有 id 时加载
  } else {
    loadMockData();        // Mock 模式：无 id 时纯 mock，零接口请求
  }
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

#### index.scss 模板

```scss
.[page-class] {
  display: flex !important;
  padding: 0 !important;
  height: 100%;
  overflow: hidden;

  .history-panel {
    width: 200px; flex-shrink: 0;
    border-right: 1px solid #e4e7ed;
    display: flex; flex-direction: column; overflow: hidden; background: #fff;
    &__header { padding: 12px 16px; font-size: 14px; font-weight: 600; border-bottom: 1px solid #e4e7ed; flex-shrink: 0; }
    &__list { flex: 1; overflow-y: auto; padding: 4px 0; }
  }

  .history-card {
    display: flex; align-items: flex-start; padding: 10px 16px; cursor: pointer;
    border-left: 3px solid transparent; transition: background 0.15s; gap: 8px;
    &:hover { background: #f5f7fa; }
    &.is-active { background: #ecf5ff; border-left-color: #409eff; }
    &__dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0;
      &.is-add { background: #409eff; }
      &.is-change { background: #e6a23c; }
    }
    &__content { flex: 1; min-width: 0; }
    &__type { font-size: 13px; font-weight: 500; color: #303133; line-height: 18px; }
    &__date { font-size: 12px; color: #909399; line-height: 18px; }
    &__person { font-size: 12px; color: #606266; line-height: 18px; }
  }

  .history-empty { padding: 32px 16px; text-align: center; color: #909399; font-size: 13px; }

  .detail-panel {
    flex: 1; overflow: hidden; display: flex; flex-direction: column; background: #fff;
    &__body { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
  }

  .page-header {
    display: flex; align-items: center; padding: 10px 16px; flex-shrink: 0;
    .page-title { font-size: 16px; font-weight: 600; margin-right: 10px; }
    .page-tag { display: inline-block; padding: 1px 8px; font-size: 12px; border-radius: 4px; margin-right: 8px;
      &--change { background-color: var(--el-color-primary-light-9); color: var(--el-color-primary); border: 1px solid var(--el-color-primary-light-7); }
      &--status { background-color: var(--el-color-warning-light-9); color: var(--el-color-warning); border: 1px solid var(--el-color-warning-light-7); }
    }
  }

  .page-toolbar { padding: 0 16px 8px; flex-shrink: 0; }
}
```

#### 导航方式

从表单页跳转到变更历史页（隐藏 → 隐藏），**必须使用 `location.href`**：

```typescript
const HISTORY_ROUTE = "/[subModule]/[kebabName]ChangeHistory";
function handleChangeHistory() {
  const router = envConfig()?.router;
  if (!router) { ElMessage.error("路由未初始化，请刷新页面重试"); return; }
  location.href = router.resolve({ path: HISTORY_ROUTE, query: { id: currentId.value } }).href;
}
```

> ⚠️ 不可使用 `useRouter().push()`，原因参见 §FORM_ROUTE 导航规则。

---

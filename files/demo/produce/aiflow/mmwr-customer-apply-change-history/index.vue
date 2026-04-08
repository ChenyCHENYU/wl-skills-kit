<template>
  <div class="app-container change-history-page">
    <!-- 左侧：变更历史记录面板 -->
    <div class="history-panel" v-loading="historyLoading">
      <div class="history-panel__header">变更记录</div>
      <div class="history-panel__list">
        <div
          v-for="item in historyList"
          :key="item.id"
          class="history-card"
          :class="{ 'is-active': item.id === selectedId }"
          @click="handleSelectHistory(item)"
        >
          <span
            class="history-card__dot"
            :class="item.changeType.includes('新增') ? 'is-add' : 'is-change'"
          ></span>
          <div class="history-card__content">
            <div class="history-card__type">{{ item.changeType }}</div>
            <div class="history-card__date">{{ item.changeTime }}</div>
            <div class="history-card__person">{{ item.changePerson }}</div>
          </div>
        </div>
        <div
          v-if="!historyList.length && !historyLoading"
          class="history-empty"
        >
          暂无变更记录
        </div>
      </div>
    </div>

    <!-- 右侧：变更详情面板 -->
    <div class="detail-panel" v-loading="loading">
      <div class="page-header">
        <span class="page-title">客户变更详情</span>
        <span class="page-tag page-tag--change">变更</span>
        <span class="page-tag page-tag--status">未审核</span>
      </div>
      <div class="page-toolbar">
        <el-button @click="handleCancel">取消</el-button>
      </div>
      <div class="detail-panel__body">
        <c_customerTabs ref="tabsRef" mode="view" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { useChangeHistory } from "./data";
import c_customerTabs from "@/components/local/c_customerTabs/index.vue";

const tabsRef = ref<InstanceType<typeof c_customerTabs>>();
const route = useRoute();

const {
  loading,
  historyLoading,
  historyList,
  selectedId,
  loadHistoryList,
  loadMockData,
  handleSelectHistory,
  handleCancel
} = useChangeHistory(tabsRef);

onMounted(() => {
  // TODO: 后端接口就绪后，启用真实接口：
  // const id = route.query.id as string;
  // if (id) { loadHistoryList(id); } else { loadMockData(); }
  loadMockData();
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>

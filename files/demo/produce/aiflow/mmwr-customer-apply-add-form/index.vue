<template>
  <div class="app-container app-page-container" v-loading="loading">
    <div class="page-header">
      <span class="page-title">客户申请详情</span>
      <span class="page-tag page-tag--add">新增</span>
      <span class="page-tag page-tag--status">未审核</span>
      <el-checkbox v-model="onlyRequired" class="only-required-check">只看必填项</el-checkbox>
    </div>
    <div class="page-toolbar">
      <el-button type="danger" @click="handleSaveAndChange">保存并变更</el-button>
      <el-button type="warning" @click="handleSave">保存</el-button>
      <el-button type="primary" plain @click="handleChangeHistory">变更历史查询</el-button>
      <el-button @click="handleCancel">取消</el-button>
    </div>
    <c_customerTabs ref="tabsRef" mode="add" :only-required="onlyRequired" />
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { useApplyAddForm } from "./data";
import c_customerTabs from "@/components/local/c_customerTabs/index.vue";

const tabsRef = ref();
const route = useRoute();
const onlyRequired = ref(false);

const { loading, loadDetail, loadMockData, handleSave, handleSaveAndChange, handleChangeHistory, handleCancel } =
  useApplyAddForm(tabsRef);

onMounted(() => {
  const id = route.query.id as string;
  if (id) {
    loadDetail(id);
  } else {
    loadMockData();
  }
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>

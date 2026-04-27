<template>
  <div class="top-right-btn" v-if="proVisible">
    <el-row>
      <el-tooltip
        class="item"
        effect="dark"
        :content="showSearch ? $t('隐藏搜索') : $t('显示搜索')"
        placement="top"
        v-if="showSearchTool"
      >
        <el-button
          circle
          icon="Search"
          @click="toggleSearch()"
          :disabled="disabled"
        />
      </el-tooltip>
      <el-tooltip
        class="item"
        effect="dark"
        :content="$t('刷新')"
        placement="top"
        v-if="showRefreshTool"
      >
        <el-button
          circle
          icon="Refresh"
          @click="refresh()"
          :disabled="disabled"
        />
      </el-tooltip>
      <el-tooltip
        class="item"
        effect="dark"
        :content="$t('显隐列')"
        placement="top"
        v-if="columns && showColumnTool"
      >
        <el-button
          circle
          icon="Menu"
          @click="showColumn()"
          :disabled="disabled"
        />
      </el-tooltip>
    </el-row>
    <div class="rightToolBarDialog">
      <el-dialog
        :title="title"
        v-model="open"
        append-to-body
        width="600px"
        @close="closeDialog"
        v-if="open"
      >
        <el-transfer
          ref="transferRef"
          :titles="[$t('显示'), $t('隐藏')]"
          v-model="modelValue"
          :data="data"
          @change="dataChange"
          target-order="push"
          filterable
        >
          <template #left-footer class="scopeStyle">
            <el-button link type="primary" size="small" @click="initColumns">{{
              $t("恢复默认")
            }}</el-button>
          </template>
          <template #right-footer class="scopeStyle">
            <el-button link type="primary" size="small" @click="clearValue">{{
              $t("清空")
            }}</el-button>
          </template>
          <template #default="{ option }">
            <el-tooltip
              class="item"
              effect="dark"
              :content="option.label"
              placement="bottom"
            >
              <span>{{ option.label }}</span>
            </el-tooltip>
          </template>
        </el-transfer>
        <template #footer>
          <div class="dialog-footer">
            <el-button @click="cancelBtn">{{ $t("取 消") }}</el-button>
            <el-button
              type="primary"
              @click="submitBtn"
              v-loading="submitLoading"
              >{{ $t("确 定") }}</el-button
            >
          </div>
        </template>
      </el-dialog>
    </div>
  </div>
  <C_OldVersion
    v-if="!proVisible"
    :columns="columnsProp"
    :showSearch="showSearchProp"
  />
</template>

<script setup>
import { nextTick } from "vue";
import C_OldVersion from "./old-version";
import { createRightToolbar } from "./data";

const props = defineProps({
  proVisible: { type: Boolean, default: false },
  showSearch: { type: Boolean, default: true },
  columns: { type: Array },
  tableId: { type: String },
  initialColumns: { type: Array },
  id: { type: String },
  propsValue: { type: Array },
  disabled: { type: Boolean, default: false },
  showRefreshTool: { type: Boolean, default: false },
  showSearchTool: { type: Boolean, default: false },
  showColumnTool: { type: Boolean, default: true }
});

const emits = defineEmits([
  "update:showSearch",
  "queryTable",
  "update:columns",
  "update:propsValue"
]);

const {
  transferRef,
  data,
  title,
  open,
  modelValue,
  columnsProp,
  showSearchProp,
  submitLoading,
  toggleSearch,
  refresh,
  closeDialog,
  dataChange,
  showColumn,
  initColumns,
  clearValue,
  cancelBtn,
  submitBtn,
  getColumns
} = createRightToolbar(props, emits);

defineExpose({ getColumns });
</script>

<style lang="scss" scoped src="./index.scss"></style>

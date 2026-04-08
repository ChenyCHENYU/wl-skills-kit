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
import { postAction, getAction } from "@jhlc/common-core/src/api/action";
import Sortable from "sortablejs";
import { deepClone } from "@/util";
import C_OldVersion from "./old-version";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const transferRef = ref(null);
const props = defineProps({
  // 新版本rightToolbar
  proVisible: {
    type: Boolean,
    default: false
  },
  showSearch: {
    type: Boolean,
    default: true
  },
  columns: {
    type: Array
  },
  // 列表id
  tableId: {
    type: String
  },
  // 初始数据
  initialColumns: {
    type: Array
  },
  // 后端生成id，第二次后使用
  id: {
    type: String
  },
  // 穿梭框右侧数据
  propsValue: {
    type: Array
  },
  disabled: {
    type: Boolean,
    default: false
  },
  // 控制表格刷新工具按钮显示/隐藏
  showRefreshTool: {
    type: Boolean,
    default: false
  },
  // 控制显隐搜索栏工具按钮显示/隐藏
  showSearchTool: {
    type: Boolean,
    default: false
  },
  // 控制动态列表字段工具按钮显示/隐藏
  showColumnTool: {
    type: Boolean,
    default: true
  }
});

const modelValue = ref([]);

watch(
  () => props.propsValue,
  (newVal) => {
    modelValue.value = newVal;
  },
  { immediate: true }
);

const columnsProp = computed({
  get: () => props.columns
});
const showSearchProp = computed({
  get: () => props.showSearch
});
const emits = defineEmits([
  "update:showSearch",
  "queryTable",
  "update:columns",
  "update:propsValue"
]);

const data = ref([]);
// 弹出层标题
const title = ref(t("设置显示字段"));
// 是否显示弹出层
const open = ref(false);
// 显示字段拼接的字符串
const showFields = ref("");
// 隐藏字段拼接的字符串
const hideFields = ref("");
// 初始字段
const defaultColumns = ref([]);
// 保存id
const columnId = ref("");

const temp = computed(() =>
  data.value.filter((item) => {
    return item.visible;
  })
);
const emitTemp = ref([]);
// 提交loading
const submitLoading = ref(false);

// 搜索
function toggleSearch() {
  emits("update:showSearch", !props.showSearch);
}

// 刷新
function refresh() {
  emits("queryTable");
}
// 关闭弹窗
const closeDialog = () => {
  initColumns();
};
// 穿梭变化函数
function dataChange(val) {
  if (val) {
    data.value.forEach((item) => {
      const index = val.findIndex((ele) => ele === item.key);
      if (index !== -1) {
        item.visible = false;
      } else {
        item.visible = true;
      }
    });
  }
  temp.value = data.value.filter((item) => {
    return item.visible;
  });
}
// 打开显隐列dialog
function showColumn() {
  open.value = true;
  data.value = [];
  defaultColumns.value = [];
  props.columns.forEach((item) => {
    defaultColumns.value.push(deepClone(item));
    data.value.push(deepClone(item));
  });
  // 拖动排序
  nextTick(() => {
    const transfer = transferRef.value.$el;
    const leftPanel = transfer
      .getElementsByClassName("el-transfer-panel")[0]
      .getElementsByClassName("el-transfer-panel__body")[0];
    const leftEl = leftPanel.getElementsByClassName(
      "el-transfer-panel__list"
    )[0];
    Sortable.create(leftEl, {
      onEnd: (evt) => {
        const { oldIndex, newIndex } = evt;
        temp.value = data.value.filter((item) => {
          return item.visible;
        });
        let _arr = temp.value.splice(oldIndex, 1);
        temp.value.splice(newIndex, 0, _arr[0]);
        let arr = [];
        temp.value.forEach((item) => arr.push(item));
        data.value.forEach((item) => {
          if (item.visible == false) {
            arr.push(item);
          }
        });
        data.value = [];
        arr.forEach((item) => {
          data.value.push(item);
        });
      }
    });
  });
}

// 恢复方法
function recoverTool(recoverData) {
  let dataTemp = [];
  let modelValueTemp = [];
  recoverData.forEach((item) => {
    dataTemp.push(deepClone(item));
    if (!item.visible) {
      modelValueTemp.push(item.key);
    }
  });
  data.value = dataTemp;
  modelValue.value = modelValueTemp;
}
// 穿梭框左侧恢复默认按钮
function initColumns() {
  recoverTool(defaultColumns.value);
}
// 穿梭框右侧清空按钮
function clearValue() {
  recoverTool(props.initialColumns);
}

function cancelBtn() {
  initColumns();
  open.value = false;
}

// 保存配置
function submitBtn() {
  showFields.value = "";
  hideFields.value = "";
  temp.value.forEach((item) => {
    showFields.value += `${item.key},`;
  });
  hideFields.value = modelValue.value.join();
  let paramsList = {
    id: columnId.value || props.id,
    tableId: props.tableId,
    showFields: showFields.value,
    hideFields: hideFields.value
  };
  submitLoading.value = true;
  postAction("system/pageShowFields/saveOrUpdate", paramsList)
    .then((res) => {
      temp.value.forEach((item) => {
        emitTemp.value.push(item);
      });
      data.value.forEach((item) => {
        if (!item.visible) {
          emitTemp.value.push(item);
        }
      });
      columnId.value = res.data.id;
      emits("update:columns", emitTemp.value);
      emits("update:propsValue", modelValue.value);
      emitTemp.value = [];
    })
    .catch(() => initColumns())
    .finally(() => {
      submitLoading.value = false;
      open.value = false;
    });
}

// 获取配置的列表字段信息
function getColumns(columnsInfo) {
  const _columnsInfo = deepClone(columnsInfo);
  _columnsInfo.propsValue = [];
  return getAction(
    `/system/pageShowFields/getByTableIdAndUserNo?tableId=${_columnsInfo.tableId}`
  ).then((res) => {
    if (res.data) {
      _columnsInfo.id = res.data.id;
      // 显示字段
      let showArr;
      if (res.data.showFields) {
        showArr = res.data.showFields.split(",");
      }

      // 隐藏字段
      let hideArr;
      if (res.data.hideFields) {
        hideArr = res.data.hideFields.split(",");
      }
      // 排序
      let flag = [];
      flag = showArr.reduce((res, item) => {
        const value = _columnsInfo.columns.find((val) => val.key === item);
        if (!value) {
          return res;
        }
        res.push(value);
        return res;
      }, []);
      let result = [...new Set(flag.concat(_columnsInfo.columns))];
      _columnsInfo.columns = [];
      result.forEach((item) => {
        _columnsInfo.columns.push(item);
      });
      _columnsInfo.columns.forEach((item) => {
        if (showArr) {
          const index1 = showArr.findIndex((val) => val === item.key);
          if (index1 !== -1) {
            item.visible = true;
          }
        }
        if (hideArr) {
          const index2 = hideArr.findIndex((val) => val === item.key);
          if (index2 !== -1) {
            item.visible = false;
          }
        }
      });
      // 右侧隐藏数据
      if (hideArr) {
        hideArr.forEach((item) => {
          _columnsInfo.propsValue.push(item);
        });
      }

      return _columnsInfo;
    }
  });
}

defineExpose({
  getColumns
});
</script>

<style lang="scss" scoped>
:deep(.rightToolBarDialog .el-dialog-body) {
  display: flex !important;
  justify-content: center !important;
}
:deep(.el-transfer__button) {
  display: block;
}

:deep(.el-transfer__button:first-child) {
  margin-bottom: 10px;
}
:deep(.el-transfer__button:nth-child(2)) {
  margin-left: 0px !important;
}

.my-el-transfer {
  text-align: center;
}

:deep(
    .el-transfer-panel
      .el-transfer-panel__header
      .el-checkbox
      .el-checkbox__label
      span
  ) {
  position: static;
}

:deep(.el-transfer-panel__footer button) {
  position: absolute;
  right: 5px;
  top: 12px;
}

:deep(.el-transfer-panel:first-child .el-checkbox__label) {
  cursor: move !important;
}
:deep(.el-transfer-panel) {
  width: 40%;
}
:deep(.el-transfer__buttons) {
  width: 20%;
}
</style>

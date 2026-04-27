import { ref, computed, watch, nextTick } from "vue";
import { postAction, getAction } from "@jhlc/common-core/src/api/action";
import Sortable from "sortablejs";
import { deepClone } from "@/util";
import { useI18n } from "vue-i18n";

// ===== 类型定义 =====
export interface RightToolbarProps {
  proVisible?: boolean;
  showSearch?: boolean;
  columns?: any[];
  tableId?: string;
  initialColumns?: any[];
  id?: string;
  propsValue?: any[];
  disabled?: boolean;
  showRefreshTool?: boolean;
  showSearchTool?: boolean;
  showColumnTool?: boolean;
}

// ===== 组件逻辑 =====
export function createRightToolbar(
  props: RightToolbarProps,
  emits: (event: string, ...args: any[]) => void,
) {
  const { t } = useI18n();

  const transferRef = ref<any>(null);
  const data = ref<any[]>([]);
  const title = ref(t("设置显示字段"));
  const open = ref(false);
  const showFields = ref("");
  const hideFields = ref("");
  const defaultColumns = ref<any[]>([]);
  const columnId = ref("");
  const emitTemp = ref<any[]>([]);
  const submitLoading = ref(false);

  const modelValue = ref<any[]>([]);
  watch(
    () => props.propsValue,
    (newVal) => {
      modelValue.value = newVal ?? [];
    },
    { immediate: true },
  );

  const columnsProp = computed(() => props.columns);
  const showSearchProp = computed(() => props.showSearch);

  const temp = computed(() => data.value.filter((item) => item.visible));

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

  // 穿梭变化
  function dataChange(val: any[]) {
    if (val) {
      data.value.forEach((item) => {
        const index = val.findIndex((ele) => ele === item.key);
        item.visible = index === -1;
      });
    }
  }

  // 打开显隐列dialog
  function showColumn() {
    open.value = true;
    data.value = [];
    defaultColumns.value = [];
    props.columns?.forEach((item) => {
      defaultColumns.value.push(deepClone(item));
      data.value.push(deepClone(item));
    });
    nextTick(() => {
      const transfer = transferRef.value.$el;
      const leftPanel = transfer
        .getElementsByClassName("el-transfer-panel")[0]
        .getElementsByClassName("el-transfer-panel__body")[0];
      const leftEl = leftPanel.getElementsByClassName(
        "el-transfer-panel__list",
      )[0];
      Sortable.create(leftEl, {
        onEnd: (evt: any) => {
          const { oldIndex, newIndex } = evt;
          const visible = data.value.filter((item) => item.visible);
          const [moved] = visible.splice(oldIndex, 1);
          visible.splice(newIndex, 0, moved);
          const hidden = data.value.filter((item) => !item.visible);
          data.value = [...visible, ...hidden];
        },
      });
    });
  }

  // 恢复工具
  function recoverTool(recoverData: any[]) {
    const dataTemp: any[] = [];
    const modelValueTemp: any[] = [];
    recoverData.forEach((item) => {
      dataTemp.push(deepClone(item));
      if (!item.visible) modelValueTemp.push(item.key);
    });
    data.value = dataTemp;
    modelValue.value = modelValueTemp;
  }

  function initColumns() {
    recoverTool(defaultColumns.value);
  }

  function clearValue() {
    recoverTool(props.initialColumns ?? []);
  }

  function cancelBtn() {
    initColumns();
    open.value = false;
  }

  function submitBtn() {
    showFields.value = "";
    hideFields.value = "";
    temp.value.forEach((item) => {
      showFields.value += `${item.key},`;
    });
    hideFields.value = modelValue.value.join();
    const paramsList = {
      id: columnId.value || props.id,
      tableId: props.tableId,
      showFields: showFields.value,
      hideFields: hideFields.value,
    };
    submitLoading.value = true;
    postAction("system/pageShowFields/saveOrUpdate", paramsList)
      .then((res: any) => {
        temp.value.forEach((item) => emitTemp.value.push(item));
        data.value.forEach((item) => {
          if (!item.visible) emitTemp.value.push(item);
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

  function getColumns(columnsInfo: any) {
    const _columnsInfo = deepClone(columnsInfo);
    _columnsInfo.propsValue = [];
    return getAction(
      `/system/pageShowFields/getByTableIdAndUserNo?tableId=${_columnsInfo.tableId}`,
    ).then((res: any) => {
      if (res.data) {
        _columnsInfo.id = res.data.id;
        let showArr: string[] | undefined;
        if (res.data.showFields) showArr = res.data.showFields.split(",");
        let hideArr: string[] | undefined;
        if (res.data.hideFields) hideArr = res.data.hideFields.split(",");

        let flag: any[] = [];
        if (showArr) {
          flag = showArr.reduce((acc: any[], key: string) => {
            const value = _columnsInfo.columns.find((v: any) => v.key === key);
            if (value) acc.push(value);
            return acc;
          }, []);
        }
        const result: any[] = [...new Set(flag.concat(_columnsInfo.columns))];
        _columnsInfo.columns = result;

        _columnsInfo.columns.forEach((item: any) => {
          if (showArr) {
            item.visible = showArr.includes(item.key) ? true : item.visible;
          }
          if (hideArr) {
            item.visible = hideArr.includes(item.key) ? false : item.visible;
          }
        });

        if (hideArr) {
          hideArr.forEach((item: string) => _columnsInfo.propsValue.push(item));
        }
        return _columnsInfo;
      }
    });
  }

  return {
    transferRef,
    data,
    title,
    open,
    modelValue,
    columnsProp,
    showSearchProp,
    temp,
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
    getColumns,
  };
}

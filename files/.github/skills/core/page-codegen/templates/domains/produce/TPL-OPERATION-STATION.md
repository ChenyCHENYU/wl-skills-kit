# OPERATION_STATION：工序操作站

> **适用场景**：生产域工序操作页，有"待处理清单"与"已完成清单"两个联动表格，选中行后填写操作表单执行动作（完轧/取消完轧/入炉/出炉等）。
> **识别特征**：原型中出现"待完X/待入炉/待处理"清单 + 操作区表单 + "已完X/已入炉"清单；操作按钮的可用性依赖当前选中行状态。
> **布局核心**：`jh-drag-row` 嵌套（待处理↔已处理↔操作区），或 `el-tabs` 包裹分功能区域。
> **⚠️ 重要约束**：此模板 index.vue 包含大量业务逻辑（computed 可用状态、watch 联动、多列表协调），**不同于 Template A/B 的薄 index.vue 风格**。data.ts 导出多个 `createXxxPage()`，不使用 `c_formModal`，改用内联 `BaseForm` + `el-button`。
> **参考标杆**：`src/views/produce/production-mmwr/sjgl/mmwr-rolling-management/`

---

## 识别规则

AI 识别此模式时需满足以下条件：

1. **双清单联动**：原型中有两个数据列表（待处理/已处理），且两个列表共享同一套查询条件
2. **操作表单内联**：表单字段不在弹窗内，直接展示在页面操作区域
3. **条件按钮**：主操作按钮（如"完轧"/"取消完轧"）的 `disabled` 状态取决于选中行 + 表单字段
4. **状态切换**：执行操作后两个清单同时刷新，选中状态清空

---

## data.ts 结构

```typescript
import {
  AbstractPageQueryHook,
  BaseQueryItemDesc,
  TableColumnDesc,
  ActionButtonDesc
} from "@/types/page";
import { postAction } from "@jhlc/common-core/src/api/action";
import { ElMessage, ElMessageBox } from "element-plus";

export const API_CONFIG = {
  pendingList: "/[服务缩写]/[资源名]/pendingList",   // 待处理清单
  completedList: "/[服务缩写]/[资源名]/completedList", // 已完成清单
  detailList: "/[服务缩写]/[资源名]/detailList",       // 明细（可选）
  doAction: "/[服务缩写]/[资源名]/[操作名]",           // 主操作（完轧/入炉等）
  cancelAction: "/[服务缩写]/[资源名]/cancel[操作名]"  // 取消操作
} as const;

// ===== 操作表单数据重置 =====
export function resetOperationFormData() {
  return {
    mainId: "",
    [formField1]: "",
    [formField2]: ""
  };
}

// ===== 操作表单字段配置 =====
export const operationFormItems = [
  { name: "[formField1]", label: "[字段名]", disabled: true },
  { name: "[formField2]", label: "[字段名2]" }
];

// ===== 待处理清单 =====
export function createPendingPage() {
  let Page = new (class extends AbstractPageQueryHook {
    constructor() {
      super({ url: { list: API_CONFIG.pendingList } });
    }
    queryDef(): BaseQueryItemDesc<any>[] {
      return [
        { name: "[queryField]", label: "[查询字段]", placeholder: "请输入" }
      ];
    }
    toolbarDef(): ActionButtonDesc[] { return []; }
    columnsDef(): TableColumnDesc<any>[] {
      return [
        { type: "index" },
        { label: "[列名]", name: "[fieldName]", minWidth: 120 }
      ];
    }
  })();
  return (Page as any).create() as any;
}

// ===== 已完成清单 =====
export function createCompletedPage() {
  let Page = new (class extends AbstractPageQueryHook {
    constructor() {
      super({ url: { list: API_CONFIG.completedList } });
    }
    queryDef(): BaseQueryItemDesc<any>[] { return []; }
    toolbarDef(): ActionButtonDesc[] { return []; }
    columnsDef(): TableColumnDesc<any>[] {
      return [
        { type: "index" },
        { label: "[列名]", name: "[fieldName]", minWidth: 120 }
      ];
    }
  })();
  return (Page as any).create() as any;
}

// ===== 明细清单（可选，如有第三级明细） =====
export function createDetailPage() {
  let Page = new (class extends AbstractPageQueryHook {
    constructor() {
      super({ url: { list: API_CONFIG.detailList } });
    }
    queryDef(): BaseQueryItemDesc<any>[] { return []; }
    toolbarDef(): ActionButtonDesc[] { return []; }
    columnsDef(): TableColumnDesc<any>[] {
      return [{ type: "index" }, { label: "[明细列]", name: "[fieldName]", minWidth: 120 }];
    }
  })();
  const created = (Page as any).create() as any;
  // 按主记录查询明细
  function selectByMain(row: any) {
    created.queryParam.value.mainId = row.id;
    created.select();
  }
  return { ...created, selectByMain };
}

// ===== 主操作（需回调刷新页面） =====
export async function handleDoAction(form: any, onSuccess: () => void) {
  await ElMessageBox.confirm("确认执行[操作名]？", "提示", { type: "warning" });
  await postAction(API_CONFIG.doAction, form);
  ElMessage.success("操作成功");
  onSuccess();
}

export async function handleCancelAction(form: any, onSuccess: () => void) {
  await ElMessageBox.confirm("确认取消[操作名]？", "提示", { type: "warning" });
  await postAction(API_CONFIG.cancelAction, form);
  ElMessage.success("取消成功");
  onSuccess();
}
```

---

## index.vue

```vue
<template>
  <div class="app-container app-page-container [page-class]">
    <jh-drag-row :top-height="300">
      <template #top>
        <!-- 查询区 -->
        <BaseQuery
          :form="queryParam"
          :items="queryItems"
          :columns="5"
          :auto-select="false"
          @select="handleQuery"
          @reset="handleQuery"
        />
        <!-- 待处理清单 -->
        <div class="list-section">
          <div class="section-header">
            <div class="title-bar"></div>
            <h3 class="section-title">待[处理/完X]清单</h3>
          </div>
          <BaseTable
            ref="pendingTableRef"
            :data="pendingList"
            :columns="pendingColumns"
            showToolbar
            highlight-current-row
            @current-change="handlePendingCurrentChange"
          />
          <jh-pagination
            v-show="pendingPage.total > 0"
            :total="pendingPage.total || 0"
            v-model:currentPage="pendingPage.current"
            v-model:pageSize="pendingPage.size"
            @current-change="pendingSelect"
            @size-change="pendingSelect"
          />
        </div>
      </template>

      <template #bottom>
        <jh-drag-row :top-height="280">
          <template #top>
            <!-- 已完成清单 -->
            <div class="list-section">
              <div class="section-header">
                <div class="title-bar"></div>
                <h3 class="section-title">已[完X/入炉]清单</h3>
              </div>
              <BaseTable
                ref="completedTableRef"
                :data="completedList"
                :columns="completedColumns"
                showToolbar
                highlight-current-row
                @current-change="handleCompletedCurrentChange"
              />
              <jh-pagination
                v-show="completedPage.total > 0"
                :total="completedPage.total || 0"
                v-model:currentPage="completedPage.current"
                v-model:pageSize="completedPage.size"
                @current-change="completedSelect"
                @size-change="completedSelect"
              />
            </div>
          </template>

          <template #bottom>
            <!-- 操作区 -->
            <div class="operation-area">
              <div class="operation-form">
                <BaseForm
                  :form="operationForm"
                  :items="operationFormItems"
                  :columns="4"
                  :label-width="120"
                />
              </div>
              <div class="operation-buttons">
                <!-- 选中待处理行时显示 -->
                <el-button
                  v-show="currentListType === 'pending'"
                  type="primary"
                  :disabled="!canDoAction"
                  @click="handleDoActionClick"
                >
                  [操作名]
                </el-button>
                <!-- 选中已完成行时显示 -->
                <el-button
                  v-show="currentListType === 'completed'"
                  type="danger"
                  :disabled="!canCancelAction"
                  @click="handleCancelActionClick"
                >
                  取消[操作名]
                </el-button>
              </div>
              <!-- 可选：明细区 -->
              <div class="detail-section">
                <div class="section-header">
                  <div class="title-bar"></div>
                  <h3 class="section-title">[明细名]</h3>
                </div>
                <div v-if="!selectedRow" class="empty-tip">
                  <el-empty description="请先在上方选择一行数据" />
                </div>
                <BaseTable v-else :data="detailList" :columns="detailColumns" showToolbar />
              </div>
            </div>
          </template>
        </jh-drag-row>
      </template>
    </jh-drag-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import {
  createPendingPage,
  createCompletedPage,
  createDetailPage,
  handleDoAction,
  handleCancelAction,
  operationFormItems,
  resetOperationFormData
} from "./data";

// ===== 状态 =====
const currentListType = ref<"pending" | "completed" | "">("");
const selectedRow = ref<any>(null);

// ===== 页面实例 =====
const PendingPage = createPendingPage();
const {
  tableRef: pendingTableRef,
  page: pendingPage,
  queryParam,
  list: pendingList,
  queryItems,
  columns: pendingColumns,
  select: pendingSelect
} = PendingPage;

const CompletedPage = createCompletedPage();
const {
  tableRef: completedTableRef,
  page: completedPage,
  list: completedList,
  columns: completedColumns,
  select: completedSelect
} = CompletedPage;

const DetailPage = createDetailPage();
const { list: detailList, columns: detailColumns, selectByMain } = DetailPage;

// ===== 操作表单 =====
const operationForm = ref(resetOperationFormData());

// ===== 可用状态 =====
const canDoAction = computed(
  () => currentListType.value === "pending" && selectedRow.value && !!operationForm.value.mainId
);
const canCancelAction = computed(
  () => currentListType.value === "completed" && selectedRow.value && !!operationForm.value.mainId
);

// ===== 清空选中 =====
const clearSelection = () => {
  selectedRow.value = null;
  currentListType.value = "";
  operationForm.value = resetOperationFormData();
};

// ===== 查询（同步刷新两个清单） =====
const handleQuery = () => {
  clearSelection();
  pendingSelect();
  completedSelect();
};

// ===== 行选中处理 =====
const handleRowChange = (row: any, listType: "pending" | "completed") => {
  selectedRow.value = row;
  currentListType.value = listType;
  if (row) {
    operationForm.value = {
      mainId: row.id || row.[mainIdField],
      [formField1]: row.[sourceField1] || "",
      [formField2]: row.[sourceField2] || ""
    };
    selectByMain(row);
  } else {
    clearSelection();
  }
};

const handlePendingCurrentChange = (row: any) => handleRowChange(row, "pending");
const handleCompletedCurrentChange = (row: any) => handleRowChange(row, "completed");

// ===== 操作按钮 =====
const handleDoActionClick = async () => {
  await handleDoAction(operationForm.value, () => {
    pendingSelect();
    completedSelect();
    clearSelection();
  });
};

const handleCancelActionClick = async () => {
  await handleCancelAction(operationForm.value, () => {
    pendingSelect();
    completedSelect();
    clearSelection();
  });
};

// ===== 初始化 =====
onMounted(() => handleQuery());
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

---

## index.scss

```scss
.[page-class] {
  .list-section {
    .section-header {
      display: flex;
      align-items: center;
      margin-bottom: 8px;

      .title-bar {
        width: 4px;
        height: 16px;
        background: var(--el-color-primary);
        border-radius: 2px;
        margin-right: 8px;
      }

      .section-title {
        font-size: 14px;
        font-weight: 600;
        color: #303133;
        margin: 0;
      }
    }
  }

  .operation-area {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;

    .operation-buttons {
      display: flex;
      gap: 8px;
    }
  }

  .empty-tip {
    display: flex;
    justify-content: center;
    padding: 24px 0;
  }
}
```

---

## 变体：el-tabs 包裹多功能区

当同一页面有"录入"与"查询"两个功能区（分 Tab 切换），在最外层包一个 `el-tabs`，每个 tab pane 内各自包含独立的查询/列表结构。参考 `mmwr-steel-stripping-operations`：

```vue
<el-tabs v-model="activeTab" type="border-card">
  <el-tab-pane label="[操作功能]" name="entry">
    <!-- jh-drag-row 内放待处理+操作区 -->
  </el-tab-pane>
  <el-tab-pane label="[查询功能]" name="query">
    <!-- 标准 BaseQuery + BaseTable + jh-pagination (Template A 结构) -->
  </el-tab-pane>
</el-tabs>
```

`watch(activeTab, (tab) => { if(tab === 'entry') entrySelect(); else querySelect(); })`

---

## 注意事项

- **不使用 c_formModal**：操作表单是内联的，不是弹窗
- **不使用 BaseToolbar 传递主操作按钮**：主操作按钮（完轧/取消完轧）用 `el-button` + `v-show` + `:disabled` 直接控制
- **两个清单同步刷新**：操作成功后 `pendingSelect()` 和 `completedSelect()` 同时调用
- **行选中互斥**：选中待处理行时清除已完成行的高亮，反之亦然（`highlight-current-row` 配合状态管理实现）
- **查询区只属于待处理清单**：已完成清单跟随相同的 queryParam，但不单独渲染 BaseQuery

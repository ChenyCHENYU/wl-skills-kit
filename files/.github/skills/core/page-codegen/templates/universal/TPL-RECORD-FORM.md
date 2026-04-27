# RECORD_FORM：录入型实绩页

> 见 SKILL.md 主文件（约束 + 按钮规则 + Mock 规范等共用规则）。


> 适用场景：通过 BaseQuery 选定主记录（如炉号、生产计划号），展示可编辑的 BaseForm 字段区 + BaseTable 明细行，**无分页**。
> 典型于生产域实绩录入（转炉实绩、精炼实绩、连铸实绩等）。
> 参考实现：`src/views/produce/production-omom/lgsj/mmsm-convert-progress/`

#### 识别规则

- 顶部 **BaseQuery** 仅用于"选择主记录"（1~3 个字段），**不用于列表翻页**
- 中部 **BaseForm**（editable），随查询结果填充，用户修改后保存
- 底部 **BaseTable**（明细行），**无分页**（`jh-pagination` 不需要）
- BaseToolbar 在 BaseForm 上方，含**保存 / 重置**等按钮，通过函数调用传入 `formRef`
- data.ts **不使用 `AbstractPageQueryHook`**，改为直接导出 `ref` + 函数（Composable 风格）
- 用 `c_spliterTitle` 将表单字段按业务分区（钢种信息 / 进程信息 / 实绩信息）

#### data.ts

```typescript
import {
  BaseQueryItemDesc,
  ActionButtonDesc,
  TableColumnDesc,
  BusLogicDataType
} from "@/types/page";
import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";
import c_spliterTitle from "@/components/local/c_spliterTitle/index.vue";
import { getAction, postAction } from "@jhlc/common-core/src/api/action";
import { debounce } from "lodash-es";

export const API_CONFIG = {
  getByKey:     "/[服务缩写]/[资源名]/getBy[Key]",    // 按主键查询（炉号/计划号/熔炼号）
  saveOrUpdate: "/[服务缩写]/[资源名]/saveOrUpdate"   // 保存实绩
} as const;

// ─────────────── 查询区 ───────────────
/** 查询参数（1~3 个主键字段） */
export const queryParam = ref<any>({});

/** 查询项配置 */
export const queryItems: BaseQueryItemDesc<any>[] = [
  {
    name: "[keyField]",
    label: "[主键名]",
    placeholder: "请输入[主键名]"
  }
  // 如需关联 Picker，使用 componentVNode 渲染（参考 mmsm-convert-progress PlanMainPicker）
];

/** 查询 → 加载主记录到表单 */
export const select = async () => {
  const res = await getAction(API_CONFIG.getByKey, queryParam.value);
  form.value = {
    ...queryParam.value,
    ...(res.data?.[主数据字段] || {})
  };
  bottomTableData.value = res.data?.[明细字段] || [];
};

/** 重置 */
export const reset = (formRef: any) => {
  queryParam.value = {};
  resetForm();
  formRef?.resetFields();
};

// ─────────────── 表单区 ───────────────
/** 表单数据 */
export const form = ref<any>({});

/** 重置表单到默认值 */
export const resetForm = () => {
  form.value = {
    // [有默认值的字段，如厂别等]
  };
};

/** 表单项配置（支持 c_spliterTitle 分区 + 各种 logicType） */
export const formItems: BaseFormItemDesc<any>[] = [
  // 分区标题（span=列数，通常为表单总列数）
  {
    name: "divider1",
    label: "",
    labelWidth: "0px",
    span: 4,
    componentVNode: () => h(c_spliterTitle, { title: "[分区名称]" })
  },
  // 普通文本
  { label: "[字段名]", name: "[fieldName]", placeholder: "请输入[字段名]" },
  // 字典下拉
  {
    label: "[字典字段]",
    name: "[dictField]",
    placeholder: "请选择[字典字段]",
    logicType: BusLogicDataType.dict,
    logicValue: "[dictCode]",
    required: true
  },
  // 时间
  {
    label: "[时间字段]",
    name: "[timeField]",
    placeholder: "请选择[时间字段]",
    logicType: BusLogicDataType.datetime
  },
  // 数值
  {
    label: "[数值字段]",
    name: "[numField]",
    placeholder: "请输入[数值字段]",
    logicType: BusLogicDataType.number
  }
];

/** 工具栏（需传入 formRef 以触发校验） */
export const toolbars = (formRef: any): ActionButtonDesc[] => [
  {
    label: "保存",
    type: "primary",
    icon: "Save",
    onClick: debounce(() => {
      formRef?.validate((valid: boolean) => {
        if (!valid) return ElMessage.error("请完善表单信息");
        ElMessageBox.confirm("确定保存吗？", "提示", {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          type: "warning"
        }).then(async () => {
          const res = await postAction(API_CONFIG.saveOrUpdate, { ...form.value });
          ElMessage.success(res?.message || "保存成功");
        });
      });
    }, 600)
  },
  {
    label: "重置",
    icon: "Refresh",
    type: "default",
    onClick: () => {
      resetForm();
      formRef?.resetFields();
    }
  }
];

// ─────────────── 明细表格区 ───────────────
/** 明细表格数据（全量，无分页） */
export const bottomTableData = ref<any[]>([]);

/** 明细表格列配置 */
export const bottomTableColumns: TableColumnDesc<any>[] = [
  { type: "index", width: 55 },
  {
    label: "[列名]",
    name: "[fieldName]",
    minWidth: 100,
    sortable: true,
    filterable: true
  }
  // 按原型顺序添加明细列，通常为只读（无操作列）
];
```

#### index.vue

```vue
<template>
  <div class="app-container app-page-container">
    <!-- 查询区（选择主记录） -->
    <BaseQuery
      :form="queryParam"
      :items="queryItems"
      :columns="[n]"
      :auto-select="false"
      @select="select"
      @reset="reset(formRef)"
    />
    <div class="form-table-content">
      <!-- 工具栏（传入 formRef 用于校验） -->
      <BaseToolbar :items="toolbars(formRef)" />
      <!-- 表单区（可编辑字段） -->
      <BaseForm
        ref="formRef"
        :form="form"
        :items="formItems"
        :columns="[n]"
        :label-width="[n]"
      />
      <!-- 明细表格（无分页） -->
      <BaseTable
        :data="bottomTableData"
        :columns="bottomTableColumns"
        :height="300"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  toolbars,
  form,
  formItems,
  queryParam,
  queryItems,
  select,
  reset,
  bottomTableData,
  bottomTableColumns,
  resetForm
} from "./data";

const formRef = ref<any>(null);

onMounted(() => {
  resetForm();
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

#### index.scss

```scss
.app-page-container {
  overflow-y: auto;

  .form-table-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }

  // 统一表单控件宽度
  :deep(.jh-select),
  :deep(.jh-date),
  :deep(.el-input-number) {
    width: 100%;
  }
}
```

#### 关键约束

| 约束 | 说明 |
|------|------|
| **不用 AbstractPageQueryHook** | 直接导出 `ref` + 函数，无 `createPage()` 包装 |
| **无分页** | `bottomTableData` 绑定全量数据，不加 `jh-pagination` |
| **auto-select: false** | BaseQuery 查询是"选择主记录"，不自动触发，用户主动点击 |
| **toolbars(formRef)** | template 中调用函数传入 `formRef`，不是直接绑定数组 |
| **debounce 保存** | 防止连点，来自 `lodash-es`，600ms |
| **c_spliterTitle 分区** | 表单字段按业务分组，每组前插分隔标题 |

#### Mock 文件要点

```typescript
// mock/[page-kebab-name].ts
import type { MockMethod } from "vite-plugin-mock";

const mockData = {
  [主数据字段]: {
    [keyField]: "MOCK-001",
    [field1]: "值1"
    // ...表单全部字段
  },
  [明细字段]: [
    { id: "1", [col1]: "值A", [col2]: "值B" }
  ]
};

const mockApi: MockMethod[] = [
  {
    url: "/dev-api/[服务缩写]/[资源名]/getBy[Key]",
    method: "get",
    response: ({ query }: any) => ({
      code: 2000,
      message: "操作成功",
      data: {
        ...mockData,
        [主数据字段]: {
          ...mockData[主数据字段],
          [keyField]: query.[keyField] || mockData[主数据字段].[keyField]
        }
      }
    })
  },
  {
    url: "/dev-api/[服务缩写]/[资源名]/saveOrUpdate",
    method: "post",
    response: () => ({ code: 2000, message: "保存成功", data: null })
  }
];

export default mockApi;
```

---

#### 变更比对（Inline Diff）

> 原型中若出现表单字段右侧显示带删除线的旧值（橙色文字），或表格行下方出现旧版对比行，则需要实现"变更比对"能力。

**业务域 Tabs 组件需要提供以下 diff 契约**（以 `c_customerTabs` 为参考实现）：

```
defineExpose({ loadData, collectFormData, validate, loadDiffData, clearDiffData })
```

| 方法 | 说明 |
|------|------|
| `loadDiffData(prevData)` | 接收旧版数据，组件内部对比并渲染差异指示 |
| `clearDiffData()` | 清除比对状态 |

**组件内部实现要点**：

1. **表单字段 diff**：用 `div.diff-field-col` 包裹 `jh-select` + `<span class="diff-old-value">`，旧值出现在字段**下方**（不破坏原布局）：
```html
<el-form-item label="纳税类型" prop="taxCategory">
  <div class="diff-field-col">
    <jh-select v-model="basicInfo.taxCategory" dict="tax_category" label="" placeholder="请选择" />
    <span v-if="diffBasicInfo && diffBasicInfo.taxCategory !== basicInfo.taxCategory"
          class="diff-old-value">{{ diffBasicInfo.taxCategory }}</span>
  </div>
</el-form-item>
```

> **数据约定**：`diffBasicInfo` 中存储显示标签（如 `"小规模纳税人"`），不存储 dict code，与 `basicInfo` 保持一致格式，才能正确比对和展示。

2. **表格行 diff**：使用 `computed` 在每条主数据行后插入带 `_isDiffRow: true` 标记的旧版行：
```typescript
const displayList = computed(() => {
  if (!diffList.value) return mainList.value;
  const result: any[] = [];
  mainList.value.forEach((row, i) => {
    result.push({ ...row, _seq: i + 1 });
    const old = diffList.value![i];
    if (old) {
      const changed = Object.keys(old).filter(k => !k.startsWith('_') && String(old[k]) !== String(row[k]));
      if (changed.length) result.push({ ...old, _isDiffRow: true, _changedFields: changed });
    }
  });
  return result;
});
```

3. **单元格级高亮**：每个 view 模式列的 `<span>` 加上 `diffCellClass(row, 'fieldName')`。

4. **CSS 样式**（在组件 scoped style 中）：
```scss
/* 表单字段 diff 包装器：列方向 flex，使旧值出现在 jh-select 下方 */
.diff-field-col {
  display: flex; flex-direction: column; width: 100%;
  :deep(.el-select) { width: 100% !important; }
}
/* 表单字段旧值：在字段下方，● 前缀不加删除线，文字橙色 + 删除线 */
.diff-old-value {
  display: block; font-size: 12px; color: #e6a23c;
  text-decoration: line-through; margin-top: 2px; line-height: 1.4;
  &::before { content: "● "; text-decoration: none; display: inline-block; }
}
/* 表格对比行：已变更字段 —— 橙色 + 删除线 */
.diff-changed { color: #e6a23c !important; text-decoration: line-through; }
.diff-row-marker { color: #e6a23c; font-size: 12px; }
/* 表格对比行：整行浅红背景 + 未变字段灰色，已变字段橙色覆盖 */
:deep(.el-table .is-diff-row) {
  background-color: #fef0f0 !important;
  td { background-color: #fef0f0 !important; color: #c0c4cc; }
  .diff-changed { color: #e6a23c !important; }
}
```

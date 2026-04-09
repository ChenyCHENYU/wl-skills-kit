# DETAIL_TABS：详情Tab+子表页

> 见 SKILL.md 主文件（约束 + 按钮规则 + Mock 规范等共用规则）。


> 适用场景：编辑/维护页面，上半区为多 Tab 表单（基本信息/客户信息/其他信息），下半区为子项表格。
> 布局核心：`C_Splitter direction="vertical"` 垂直分割上下区域。
> **参考标杆**：`src/views/sale/demo/add-demo/`、`src/views/sale/demo/domestic-trade-order-mainten/`

#### index.vue

```vue
<template>
  <div class="app-container app-page-container">
    <C_Splitter direction="vertical">
      <!-- 上：表单区 -->
      <el-card shadow="never" class="form-card">
        <!-- 页头工具栏 -->
        <div class="page-header">
          <div class="page-header__left">
            <span class="page-header__title">[主档维护]</span>
          </div>
          <div class="page-header__right">
            <el-button type="primary" @click="handleSave">保存</el-button>
            <el-button @click="handleCancel">取消</el-button>
          </div>
        </div>

        <!-- Tab 表单区 -->
        <el-tabs v-model="activeTab" class="form-tabs">
          <el-tab-pane label="基本信息" name="basic">
            <el-form
              ref="formRef"
              :model="form"
              :rules="rules"
              label-width="100px"
            >
              <el-row :gutter="20">
                <el-col :span="6" v-for="item in basicFields" :key="item.name">
                  <el-form-item :label="item.label" :prop="item.name">
                    <!-- 按 item.type 渲染对应控件 -->
                    <el-input
                      v-if="!item.type || item.type === 'input'"
                      v-model="form[item.name]"
                      :placeholder="item.placeholder || '请输入'"
                    />
                    <jh-select
                      v-else-if="item.type === 'select'"
                      v-model="form[item.name]"
                      :items="item.options"
                      label=""
                      style="width: 100%"
                    />
                    <jh-date
                      v-else-if="item.type === 'date'"
                      v-model="form[item.name]"
                      label=""
                      style="width: 100%"
                    />
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
          </el-tab-pane>
          <el-tab-pane label="[其他Tab名]" name="other">
            <!-- 同理 -->
          </el-tab-pane>
        </el-tabs>
      </el-card>

      <!-- 下：子项表格区 -->
      <el-card shadow="never" class="items-card">
        <div class="items-section">
          <div class="items-section__header">
            <span class="items-section__title">
              <el-icon><ArrowDown /></el-icon>
              子项信息
            </span>
            <el-button type="primary" size="small" @click="addItem">
              新增行
            </el-button>
          </div>
          <BaseTable
            ref="itemTableRef"
            :data="itemList"
            :columns="itemColumns"
            showToolbar
          />
          <jh-pagination
            v-show="itemPage.total > 0"
            :total="itemPage.total"
            v-model:currentPage="itemPage.current"
            v-model:pageSize="itemPage.size"
            @current-change="loadItems"
            @size-change="loadItems"
          />
        </div>
      </el-card>
    </C_Splitter>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import C_Splitter from "@/components/global/C_Splitter/index.vue";
import {
  form,
  rules,
  activeTab,
  basicFields,
  itemList,
  itemColumns,
  itemPage,
  formRef,
  itemTableRef,
  handleSave,
  handleCancel,
  addItem,
  loadItems,
  initPage
} from "./data";

onMounted(() => initPage());
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

#### data.ts

```typescript
import { ref, reactive } from "vue";
import { getAction, postAction } from "@jhlc/common-core/src/api/action";
import { ElMessage } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import type { TableColumnDesc } from "@/types/page";
import envConfig from "@jhlc/common-core/src/store/env-config";

export const API_CONFIG = {
  getById: "/[服务缩写]/[主资源]/getById",
  save: "/[服务缩写]/[主资源]/save",
  update: "/[服务缩写]/[主资源]/update",
  itemList: "/[服务缩写]/[子资源]/list",
  itemSave: "/[服务缩写]/[子资源]/save",
  itemRemove: "/[服务缩写]/[子资源]/remove"
} as const;

// ===== 表单状态 =====
export const formRef = ref<FormInstance>();
export const activeTab = ref("basic");
export const form = reactive({
  id: "",
  // [主表字段...]
});

export const rules: FormRules = {
  // [fieldKey]: [{ required: true, message: "请输入[字段名]", trigger: "blur" }],
};

// ===== 表单字段配置（驱动 template 动态渲染） =====
export const basicFields = [
  { name: "orderNo", label: "订单号", placeholder: "系统自动生成", disabled: true },
  { name: "customerName", label: "客户名称", required: true },
  {
    name: "orderType",
    label: "订单类型",
    type: "select",
    options: [
      { label: "期货合同", value: "期货合同" },
      { label: "现货合同", value: "现货合同" }
    ]
  },
  { name: "createDate", label: "创建日期", type: "date" }
];

// ===== 子项表格 =====
export const itemTableRef = ref();
export const itemList = ref<any[]>([]);
export const itemPage = reactive({ current: 1, size: 10, total: 0 });

export const itemColumns: TableColumnDesc<any>[] = [
  { type: "index", width: 55 },
  { label: "[子项字段]", name: "[fieldName]", minWidth: 120 },
  {
    label: "操作",
    width: 100,
    fixed: "right",
    operations: [
      {
        name: "remove",
        label: "删除",
        onClick: (row: any) => removeItem(row)
      }
    ]
  }
];

// ===== 数据加载 =====
export async function loadItems() {
  const res = await getAction(API_CONFIG.itemList, {
    mainId: form.id,
    current: itemPage.current,
    size: itemPage.size
  });
  const data = res.result || res.data;
  itemList.value = data?.records || data?.list || [];
  itemPage.total = data?.total || 0;
}

export function addItem() {
  itemList.value.push({
    id: `temp_${Date.now()}`,
    // [子项默认值...]
  });
}

async function removeItem(row: any) {
  if (String(row.id).startsWith("temp_")) {
    // 未保存的临时行直接移除
    itemList.value = itemList.value.filter((r) => r.id !== row.id);
    return;
  }
  await postAction(API_CONFIG.itemRemove, { ids: [row.id] });
  ElMessage.success("删除成功");
  loadItems();
}

// ===== 表单操作 =====
export async function handleSave() {
  await formRef.value?.validate();
  const api = form.id ? API_CONFIG.update : API_CONFIG.save;
  await postAction(api, { ...form, items: itemList.value });
  ElMessage.success("保存成功");
}

export function handleCancel() {
  const router = envConfig()?.router;
  if (router) {
    history.back();
  }
}

// ===== 页面初始化 =====
export async function initPage() {
  // 从 URL query 获取 id（编辑模式）
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");
  if (id) {
    const res = await getAction(API_CONFIG.getById, { id });
    const data = res.result || res.data || res;
    Object.assign(form, data);
    loadItems();
  }
}
```

#### index.scss

```scss
.app-page-container {
  overflow-y: auto;

  :deep(.my-splitter-container) {
    height: 100%;
  }

  .form-card {
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      &__title {
        font-size: 16px;
        font-weight: bold;
      }
    }

    .form-tabs {
      :deep(.el-tabs__header) {
        margin-bottom: 16px;
      }
    }

    // 统一表单控件宽度
    :deep(.el-select),
    :deep(.jh-select),
    :deep(.jh-date),
    :deep(.el-input-number) {
      width: 100%;
    }
  }

  .items-card {
    .items-section {
      &__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      &__title {
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 4px;
      }
    }
  }
}
```

---

### 弹窗模板

仅在“极个性弹窗”场景生成（c_modal 无法满足时），放在页面 `components/editModal.vue`：

通用新增/编辑弹窗应优先使用 `src/components/local/c_modal/` 局部公共组件。

```vue
<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="680px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" :disabled="mode === 'view'">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="[字段名]" prop="[fieldKey]">
            <el-input v-model="form.[fieldKey]" placeholder="请输入[字段名]" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="[状态]" prop="[statusField]">
            <jh-select v-model="form.[statusField]" dict="[dictCode]" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <template #footer>
      <el-button @click="handleClose">{{ mode === "view" ? "关闭" : "取消" }}</el-button>
      <el-button v-if="mode !== 'view'" type="primary" :loading="loading" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { getAction, postAction } from "@jhlc/common-core/src/api/action";
import { API_CONFIG } from "../data";
import type { FormInstance, FormRules } from "element-plus";

const emit = defineEmits<{ (e: "ok"): void }>();

const visible = ref(false);
const mode = ref<"add" | "edit" | "view">("add");
const loading = ref(false);
const formRef = ref<FormInstance>();

const title = computed(() =>
  mode.value === "add" ? "新增[实体名]" : mode.value === "edit" ? "编辑[实体名]" : "查看[实体名]"
);

const initialForm = () => ({
  id: ""
  // [表单字段初始值]
});

const form = reactive(initialForm());

const rules: FormRules = {
  // [必填字段校验]
  // [fieldKey]: [{ required: true, message: "请输入[字段名]", trigger: "blur" }],
};

async function open(id?: string, viewMode?: "edit" | "view") {
  if (id) {
    mode.value = viewMode || "edit";
    const res = await getAction(API_CONFIG.getById, { id });
    const data = res.result || res.data || res;
    Object.assign(form, initialForm(), data);
  } else {
    mode.value = "add";
    Object.assign(form, initialForm());
  }
  visible.value = true;
}

function handleClose() {
  formRef.value?.resetFields();
  visible.value = false;
}

async function handleSubmit() {
  await formRef.value?.validate();
  loading.value = true;
  try {
    const api = mode.value === "edit" ? API_CONFIG.update : API_CONFIG.save;
    await postAction(api, { ...form });
    ElMessage.success(mode.value === "edit" ? "编辑成功" : "新增成功");
    handleClose();
    emit("ok");
  } finally {
    loading.value = false;
  }
}

defineExpose({ open });
</script>
```

---

## 有弹窗时的 index.vue 调整

```vue
<template>
  <div class="app-container app-page-container">
    <BaseQuery
      :form="queryParam"
      :items="queryItems"
      @select="select"
      @reset="select"
    />
    <BaseToolbar :items="toolbars" />
    <BaseTable ref="tableRef" :data="list" :columns="columns" showToolbar />
    <jh-pagination
      v-show="page.total && page.total > 0"
      :total="page.total || 0"
      v-model:currentPage="page.current"
      v-model:pageSize="page.size"
      @current-change="select"
      @size-change="select"
    />
  </div>
  <!-- 弹窗放在根 div 之外 -->
  <AddModal ref="addModalRef" @ok="select" />
</template>

<script setup lang="ts">
import { createPage } from "./data";
import AddModal from "./components/addModal.vue";

const addModalRef = ref();
const Page = createPage(addModalRef);
const {
  tableRef,
  page,
  queryParam,
  list,
  queryItems,
  columns,
  toolbars,
  select
} = Page;

onMounted(() => select());
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

---

## 查询项组件配置参考

| 交互类型 | queryDef 配置                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文本输入 | `{ name, label, placeholder }`                                                                                                                                |
| 字典下拉 | `{ name, label, logicType: BusLogicDataType.dict, logicValue: "dictCode" }`                                                                                   |
| 单日期   | `component: () => ({ tag: "jh-date", type: "date" })`                                                                                                         |
| 月份     | `component: () => ({ tag: "jh-date", type: "month", showFormat: "YYYY-MM", format: "YYYYMM" })`                                                               |
| 日期范围 | `{ startName, endName, component: () => ({ tag: "jh-date", type: "daterange", rangeSeparator: "至", showFormat: "YYYY-MM-DD", valueFormat: "YYYY-MM-DD" }) }` |
| 用户选择 | `component: () => ({ tag: "jh-user-picker" })`                                                                                                                |
| 部门选择 | `component: () => ({ tag: "jh-dept-picker" })`                                                                                                                |

详细组件 API：`docs/jh-date.md`、`docs/jh-select.md`、`docs/jh-user-picker.md`、`docs/jh-dept-picker.md`
页面 Hook 最佳实践：`docs/page-query-hook-best-practices.md`
HTTP 方法参考：`docs/request.md`

---

## 视图切换模式（View Switch）

> 当原型中出现"管理视角 / 使用视角"等切换按钮，页面同一列表在不同视角下展示不同列时，需使用 `el-tabs` 实现视图切换。
> 参考：`mmwr-steel-stripping-operations`（剔钢实绩）的 `el-tabs` 用法。

### 识别规则

- 原型中出现"管理视角"/"使用视角"或类似视图切换按钮
- 两种视角下表格列数不同（管理视角列少，使用视角列多含业务明细）
- 数据源相同（list 接口同一个），仅 columns 不同

### page-spec 扩展

在 `features` 中增加视图切换描述：

```json
"features": {
  "viewSwitch": true,
  "viewItems": [
    { "label": "管理视角", "value": "management" },
    { "label": "使用视角", "value": "usage" }
  ]
}
```

### data.ts 模板

> 关键：每个视角的列定义独立导出为函数，不在 createPage 内做列切换逻辑。
> el-tabs 天然处理了切换，不需要手动封装 handleViewChange。

```typescript
let _editModalRef: any = null;

/** 管理视角列定义 */
export function managementColumns(): TableColumnDesc<any>[] {
  return [
    { type: "selection" },
    { type: "index" },
    // ... 管理视角列（按原型顺序）
    { label: "操作", width: 100, fixed: "right", operations: [...] }
  ];
}

/** 使用视角列定义（含业务明细字段） */
export function usageColumns(): TableColumnDesc<any>[] {
  return [
    { type: "selection" },
    { type: "index" },
    // ... 使用视角列（按原型顺序，通常比管理视角多出业务字段）
    { label: "操作", width: 100, fixed: "right", operations: [...] }
  ];
}

let Page: any = null;

export function createPage(editModalRef?: any) {
  _editModalRef = editModalRef;

  let Page_inst = new (class extends AbstractPageQueryHook {
    constructor() {
      super({ url: { list: API_CONFIG.list, remove: API_CONFIG.remove } });
    }
    queryDef() { return [...]; }
    toolbarDef() { return [...]; }
    columnsDef() { return managementColumns(); }  // 默认视角（基类需要）
  })();

  Page = Page_inst;
  return (Page_inst as any).create() as any;
}
```

### index.vue 模板（视图切换部分）

> 使用 `el-tabs` 组件，每个 `el-tab-pane` 内放独立的 `BaseTable`，通过 `v-if` 保证同一时刻只渲染一个表格。
> `ref="tableRef"` 在两个表格上相同，`v-if` 确保只有活跃的表格持有该 ref，toolbar 操作（如 getSelectionRows）自动作用于当前视角的表格。

```vue
<template>
  <div class="app-container app-page-container">
    <BaseQuery :form="queryParam" :items="queryItems" @select="select" @reset="select" />
    <BaseToolbar :items="toolbars" />
    <el-tabs v-model="activeView">
      <el-tab-pane label="管理视角" name="management">
        <BaseTable
          v-if="activeView === 'management'"
          ref="tableRef"
          :data="list"
          :columns="mgmtCols"
          showToolbar
        />
      </el-tab-pane>
      <el-tab-pane label="使用视角" name="usage">
        <BaseTable
          v-if="activeView === 'usage'"
          ref="tableRef"
          :data="list"
          :columns="useCols"
          showToolbar
        />
      </el-tab-pane>
    </el-tabs>
    <jh-pagination ... />
    <c_formModal ref="editModalRef" v-bind="modalConfig" @ok="select" />
  </div>
</template>

<script setup lang="ts">
import { createPage, modalConfig, managementColumns, usageColumns } from "./data";
import c_formModal from "@/components/local/c_formModal/index.vue";

const editModalRef = ref();
const Page = createPage(editModalRef);
const { tableRef, page, queryParam, list, queryItems, toolbars, select } = Page;

const activeView = ref("management");
const mgmtCols = managementColumns();
const useCols = usageColumns();

onMounted(() => select());
</script>
```

**要点**：
- ❌ 不使用 `el-radio-group` + 手动 `handleViewChange` 切换 columns
- ✅ 使用 `el-tabs` + 每个 pane 内放独立 BaseTable
- ✅ 两个表格共享同一 `list` 数据源和 `tableRef`
- ✅ `v-if` 保证同一时刻只有一个表格实例挂载到 `tableRef`
- ✅ 列定义函数从 data.ts 导出，在 index.vue 中调用（调用时机在 createPage 之后，确保闭包引用正确）

### Mock 数据要求

> **关键**：mock 生成的数据对象必须包含**所有视角**的全部字段，不可仅覆盖默认视角。
> 切换视角后表格使用同一数据源，如果 mock 数据缺少某视角的字段，切换后会显示空列。

```typescript
function genRecord() {
  return {
    // 管理视角字段
    customerCode: ...,
    customerName: ...,
    // 使用视角特有字段（管理视角不显示但数据中必须有）
    salesType: ...,
    customerNature: ...,
    businessPerson: ...,
    // ...所有视角的并集
  };
}
```

---

## 复杂表单 → 独立路由页（非弹窗）

> 当原型中"新增"/"编辑"打开的不是简单弹窗，而是一个**内容极多的独立页面**（多 Tab、多子表、状态信息区等），必须创建独立路由页而非使用 `c_formModal`。

### 识别规则

- 原型中点击"新增申请"/"编辑"后跳转到**独立页面**（URL 变化，有返回按钮）
- 页面内有**多个 Tab**（如基本信息、资质信息、地址信息、联系人信息、银行信息等）
- 表单字段**超过 15 个**或包含**子表格**（如业务信息表）
- 页面头部有**多个操作按钮**（保存并提交、保存、变更历史查询、取消等）

### 平台路由机制（必读）

> **核心原则**：平台通过 `generateCurrentRoute(to)` 实现按需路由注册，
> `hidden=true` 的菜单**仍然可路由**（已实测验证），只是不在侧边栏显示。
> ❗ `registerMenu` 对 hidden 菜单只是 `return` 跳过处理，但**不从 children 数组中移除**。
> 导致隐藏菜单仍被 `router.addRoute()` 注册，但 component 是原始字符串（非合法组件）。
> 因此 `router.push()` 会报 **"Invalid route component"** 错误。
> 必须使用 `location.href` 触发完整导航，让 `generateCurrentRoute` 用正确组件重新注册路由。

1. **路由路径格式** = `/{父菜单subModule}/{菜单路径camelCase}`，例如 `/aiflow/mmwrCustomerApplyAddForm`
   - 路径**不是**组件路径的 kebab-case 版本
   - 路径**不包含** `produce/production-mmwr` 等构建时前缀
   - 「菜单路径」字段（camelCase）才是真正的路由 path 段
2. **隐藏菜单 hidden: true**：独立表单/详情页**必须设为隐藏**，避免菜单栏多出无意义入口
3. **pages.ts 变更需重启** dev server（fullImportPlugin 只在首次 transform 时读取）
4. **local 组件必须显式 import**：`src/components/local/` 下的组件不会自动全局注册

### FORM_ROUTE 格式

```typescript
// ✅ 正确：/{subModuleKey}/{menuPath_camelCase}
const FORM_ROUTE = "/aiflow/mmwrCustomerApplyAddForm";

// ❌ 错误：不要用组件路径的 kebab-case
// const FORM_ROUTE = "/produce/production-mmwr/aiflow/mmwr-customer-apply-add-form";
```

如何确定 FORM_ROUTE：
- `subModuleKey`：取自 pages.ts 中 `gProd("xxx", { subModuleKey: [...] })` 的 key
- `menuPath`：取自后端菜单表的「菜单路径」字段（camelCase）
- 不确定时，在浏览器点击侧边栏已有菜单项，观察 URL 格式

### 实现模式

1. **创建独立表单页**：`mmwr-xxx-form/` 目录（index.vue + data.ts + index.scss）
2. **注册为隐藏菜单**：pages.ts 注册 + SYS_MENU_INFO.md 中 `是否隐藏: 是`（平台支持隐藏菜单按需路由）
3. **列表页使用 `navigateToForm`**：通过 `envConfig().router.resolve()` 生成 URL，始终用 `location.href` 导航（不用 `router.push`）

```typescript
import envConfig from "@jhlc/common-core/src/store/env-config";

// ✅ 使用 /{subModule}/{menuPath_camelCase} 格式
const FORM_ROUTE = "/aiflow/mmwrXxxForm";

/** 导航到表单页（隐藏菜单路由必须完整导航，触发 generateCurrentRoute 正确注册组件） */
function navigateToForm(query?: Record<string, string>) {
  const router = envConfig()?.router;
  if (!router) {
    ElMessage.error('路由未初始化，请刷新页面重试');
    return;
  }
  const target: any = { path: FORM_ROUTE };
  if (query) target.query = query;
  location.href = router.resolve(target).href;
}

export function createPage() {
  // ❗ 不需要传 router 参数，navigateToForm 通过 envConfig().router 获取
  // ...
  toolbarDef() {
    return [
      {
        name: "primary",
        label: "新增申请",
        onClick: () => navigateToForm()
      }
    ];
  }
  columnsDef() {
    return [
      // ...
      {
        label: "操作", fixed: "right",
        operations: [
          {
            name: "edit", label: "编辑",
            onClick: (row: any) => navigateToForm({ id: row.id })
          }
        ]
      }
    ];
  }
}
```

### index.vue 模板（列表页改造）

```vue
<script setup lang="ts">
import { createPage } from "./data";

const Page = createPage();
// ... 不再引入 c_formModal，不再使用 useRouter
</script>
```

### index.vue 模板（表单页）

```vue
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
      <el-button @click="handleCancel">取消</el-button>
    </div>
    <!-- ⚠️ local 组件必须显式 import，onlyRequired 传递给子组件 -->
    <c_customerTabs ref="tabsRef" mode="add" :only-required="onlyRequired" />
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import c_customerTabs from "@/components/local/c_customerTabs/index.vue";

const route = useRoute();
const tabsRef = ref();
const onlyRequired = ref(false);

onMounted(() => {
  const id = route.query.id as string;
  if (id) loadDetail(id);
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

---

## 表单页模式差异处理

> 同一共享组件（如 c_customerTabs）在不同模式下（add/change/view）可能有**不同的列、不同的操作、不同的 Tab 顺序**。

### 识别方式

1. **对比多个原型截图**：同一表单在新增 vs 变更模式下的表格列、按钮、Tab 顺序往往不同
2. **关键差异点**：
   - 表格列：变更模式可能多出「使用组织」「产品线」「银承贴息」列，而新增模式有「免息天数」「月需求量」等
   - 操作列：变更模式有「编辑 + 删除」，新增模式仅「删除」
   - 新增行方式：所有非查看模式均在表格底部显示 `+新增行` 链接
   - Tab 顺序：不同模式可能交换某些 Tab 的前后位置
   - 状态信息区：所有模式均显示（disabled 只读），用于展示创建时间、创建人、修改时间等

### 实现方式

```vue
<!-- 表格列：v-if 按 mode 控制 -->
<el-table-column v-if="isChange" label="使用组织" prop="useOrg" />
<el-table-column v-if="!isChange && !isView" label="免息天数" prop="interestFreeDays" />

<!-- 操作列：变更模式多一个编辑按钮 -->
<el-table-column v-if="!isView" label="操作" :width="isChange ? 120 : 80">
  <template #default="{ row, $index }">
    <el-button v-if="isChange" type="primary" link @click="editRow(row, $index)">编辑</el-button>
    <el-button type="danger" link @click="list.splice($index, 1)">删除</el-button>
  </template>
</el-table-column>

<!-- 底部新增行链接（变更模式） -->
<div v-if="isChange && !isView" class="add-row-link" @click="addRow">+新增行</div>

<!-- Tab 顺序差异：用 v-if 控制渲染位置 -->
<el-tab-pane v-if="isChange" label="地址信息" name="addressInfo">...</el-tab-pane>
<el-tab-pane label="联系人信息" name="contactInfo">...</el-tab-pane>
<el-tab-pane v-if="!isChange" label="地址信息" name="addressInfo">...</el-tab-pane>

<!-- 状态信息区（所有模式均显示，disabled 只读展示） -->
<div class="status-info-section">
  <el-form disabled label-width="100px">
    <el-row :gutter="20">
      <el-col :span="6"><el-form-item label="创建时间"><el-input v-model="statusInfo.createTime" /></el-form-item></el-col>
      <!-- ... -->
    </el-row>
  </el-form>
</div>
```

### Mock 数据

- **变更表单打开无 id** 时应加载 mock 数据展示 demo 效果
- Mock 数据工厂放在共享组件的 `data.ts` 中（如 `createChangeMockData()`）
- 表单页 data.ts 在 `onMounted` 中判断无 id 则调用 `loadMockData()`

---

## 生成后强制校验（必须执行，不可跳过）

> **校验目的**：逐项 diff page-spec JSON 与生成代码，确保零遗漏、零乱序。
> 校验不通过的项必须立即修复后再向用户报告。

### 第零轮：顺序保真度检查（最重要）

> **核心原则：原型顺序 = 代码顺序。** 查询字段、按钮、表格列的排列顺序体现了业务逻辑和用户习惯，不可随意调换。

```
spec.query 中字段顺序     === queryDef() return 数组中字段顺序？（逐个比对）
spec.columns 中字段顺序   === columnsDef() return 数组中字段顺序？（selection/index 在最前，其余逐个比对）
spec.toolbar 中按钮顺序   === toolbarDef() return 数组中按钮顺序？（逐个比对）
spec.operations 中按钮顺序 === 操作列 operations 数组中按钮顺序？
spec.features.tabItems 顺序 === 页面 Tab 组件中顺序？
```

**任何顺序不一致 → 立即调整为与 spec（即原型）一致。**

### 第一轮：字段计数 diff

对照 page-spec JSON，逐项计数：

```
spec.query.length        === queryDef() return 数组长度？
spec.columns.length      === columnsDef() return 数组长度（不含 selection/index）？
spec.toolbar.length      === toolbarDef() return 数组长度？
spec.operations.length   === 操作列 operations 数组长度？
```

**任何计数不等 → 停下来，找出缺失项补全。**

### 第二轮：字段名逐一比对

```
spec.query 中每个 field     → queryDef() 中存在 name === field 的项？
spec.columns 中每个 field   → columnsDef() 中存在 name === field 的项？
spec.toolbar 中每个 label   → toolbarDef() 中存在 label === label 的项？
spec.operations 中每个 label → 操作列 operations 中存在？
```

**任何字段找不到对应 → 立即补全。**

### 第三轮：子表交互完整性

```
spec.subTables 中 editable === true 的子表：
  □ 模板中有新增按钮（v-if="mode !== 'view'"）？
  □ 模板中有删除按钮/操作列？
  □ script 中有 addXxxRow() 方法？

spec.subTables 中 inlineEdit === true 的子表：
  □ 单元格使用 el-input / jh-select 等可编辑组件？
```

### 第四轮：字典 & 特殊交互

```
spec 中所有 type === "dict" 的字段：
  □ queryDef 对应项有 logicType: BusLogicDataType.dict + logicValue: dictCode？
  □ columnsDef 对应项有 logicType + logicValue？

spec.features.tabSwitch === true：
  □ index.vue 中有 Tab 切换组件？
  □ data.ts 中有 Tab 切换处理逻辑？
  □ 不同 Tab 切换后的列定义（如有差异）是否各自与原型一致？

spec.features.viewSwitch === true：
  □ index.vue 中有 el-tabs 视角切换组件？
  □ data.ts 中有 managementColumns()/usageColumns() 等多视角列定义？
  □ 每个视角的列数量、顺序与原型严格一致？
  □ el-tabs 各 pane 内 BaseTable 使用对应视角的 columns？
  □ mock 数据包含所有视角字段的并集（切换视角后不出现空列）？

spec.features.hiddenMenu === true：
  □ menu-config 标注为隐藏？
```

### 第五轮：文件完整性

```
□ index.vue — 模板 + createPage() 解构 + onMounted
□ data.ts — API_CONFIG + createPage()/useXxx() 工厂函数
□ index.scss — 存在（可为空）
□ api.md — 字段名与 data.ts 一致
□ pages.ts 注册行 — 已提供
□ style: @import "./index.scss"
□ 外层 class: "app-container app-page-container"
□ API: getAction/postAction（非 axios）
```

### 校验报告模板

校验完成后输出简要报告：

```
✅ query: spec 12 项 = code 12 项，顺序一致
✅ columns: spec 16 项 = code 16 项，顺序一致
✅ toolbar: spec 7 项 = code 7 项，顺序一致，颜色正确
✅ operations: spec 3 项 = code 3 项，顺序一致
✅ tabs: spec 3 项 = code 3 项，顺序一致
✅ subTables: businessInfo(editable) — 有新增/删除
✅ dict 字段: 8 个全部配置 logicType
✅ 文件完整性: 4/4
✅ mock URL: 全部带 /dev-api 前缀，list 用 GET + query
```

如有不通过项：

```
❌ columns: spec 35 项 ≠ code 34 项 — 缺少 customerName 列 → 已补全
❌ toolbar 顺序: spec [新增申请, 删除, 启用] ≠ code [新增, 启用, 删除] → 已调整
❌ operations: spec [查看, 编辑, 删除] ≠ code [编辑, 删除] — 缺少"查看" → 已补全
```

---

## 附加输出

### pages.ts 注册片段

```typescript
// 添加到 vite/plugins/shared/pages.ts 对应模块的数组中
["[kebab-case-目录名]", "[页面中文名]"],
```

### 菜单配置

> 菜单配置统一生成到 `.github/docs/SYS_MENU_INFO.md`（集中式），生成规则见 SKILL.md 主文件的「SYS_MENU_INFO 生成规则」章节。

---

### Mock 数据文件（mock/[页面kebab-name].ts）

在项目根目录 `mock/` 下生成，`vite-plugin-mock`（`mockPath: "./mock"`）自动加载，**无需手动注册**。

**要求**：
- URL 和字段与 api.md 完全一致
- 使用 `MockMethod[]` 类型 + `mockjs` 生成数据
- 分页查询返回 `{ code, msg, data: { records, total, size, current } }` 结构
- 字典字段的值从 api.md 字典表中取

**模板**：

```typescript
import type { MockMethod } from "vite-plugin-mock";
import Mock from "mockjs";

const Random = Mock.Random;

// 字典选项：从 api.md 字典表复制
const DICT = {
  status_code: ["值1", "值2"]
};

// 单条记录生成器：字段对齐 api.md Response
function genRecord() {
  return {
    id: Random.id(),
    fieldName: Random.cword(2, 4),
    statusField: Random.pick(DICT.status_code),
    createTime: Random.datetime("yyyy-MM-dd HH:mm:ss")
  };
}

const dataPool = Array.from({ length: 50 }, genRecord);

const mockApi: MockMethod[] = [
  {
    // ⚠️ URL 必须带 /dev-api 前缀（axios baseURL = /dev-api）
    url: "/dev-api/[服务缩写]/[资源名]/list",
    // ⚠️ AbstractPageQueryHook 默认 requestMethod = GET，所以 list 必须用 get
    method: "get",
    response: ({ query }: any) => {
      const current = Number(query?.current) || 1;
      const size = Number(query?.size) || 20;
      const start = (current - 1) * size;
      return {
        code: 200,
        msg: "操作成功",
        data: {
          records: dataPool.slice(start, start + size),
          total: dataPool.length,
          size,
          current
        }
      };
    }
  },
  {
    url: "/dev-api/[服务缩写]/[资源名]/getById",
    method: "get",
    response: ({ query }: any) => ({
      code: 200,
      msg: "操作成功",
      data: dataPool.find((d) => d.id === query.id) || dataPool[0]
    })
  },
  {
    url: "/dev-api/[服务缩写]/[资源名]/remove",
    method: "delete",
    response: ({ query, body }: any) => {
      const id = query?.id || body?.id;
      const ids = id ? [id] : (query?.ids?.split(",") || body?.ids || []);
      ids.forEach((rid: string) => {
        const idx = dataPool.findIndex((d) => d.id === rid);
        if (idx > -1) dataPool.splice(idx, 1);
      });
      return { code: 200, msg: "删除成功", data: null };
    }
  },
  {
    url: "/dev-api/[服务缩写]/[资源名]/save",
    method: "post",
    response: ({ body }: any) => {
      const newRecord = { ...genRecord(), ...body, id: Random.id() };
      dataPool.unshift(newRecord);
      return { code: 200, msg: "保存成功", data: { id: newRecord.id } };
    }
  },
  {
    url: "/dev-api/[服务缩写]/[资源名]/update",
    method: "post",
    response: ({ body }: any) => {
      const idx = dataPool.findIndex((d) => d.id === body?.id);
      if (idx > -1) Object.assign(dataPool[idx], body);
      return { code: 200, msg: "更新成功", data: null };
    }
  }
];

export default mockApi;
```

> **Mock URL 前缀规则**：项目 axios `baseURL` = `/dev-api`（由 `VUE_APP_BASE_API` 配置），
> `vite-plugin-mock` 用 `pathToRegexp` 严格匹配浏览器实际请求路径，
> 所以 mock URL 必须带 `/dev-api` 前缀才能拦截成功。
>
> 参考实现：`mock/customer-archive.ts`、`mock/temp-customer-archive.ts`、`mock/customer-apply.ts`

---

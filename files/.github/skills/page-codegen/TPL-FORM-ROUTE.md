# FORM_ROUTE：复杂表单独立路由页

> 见 SKILL.md 主文件（约束 + 按钮规则 + Mock 规范等共用规则）。


> 复杂表单（多 Tab、多子表、独立布局）使用独立路由而非弹窗。
> 表单页 `data.ts` **不继承 `AbstractPageQueryHook`**，改为导出 `useXxx` Composable。
> 需在 `pages.ts` 单独注册路由，路径规则见"FORM_ROUTE 表单页"章节。

#### data.ts

```typescript
import { getAction, postAction } from "@jhlc/common-core/src/api/action";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";  // ✅ 仅用于 router.back()

export const API_CONFIG = {
  getById: "/[服务缩写]/[资源名]/getById",
  save: "/[服务缩写]/[资源名]/save",
  submit: "/[服务缩写]/[资源名]/submit"
} as const;

export function use[PageName]Form(tabsRef: any) {
  const router = useRouter();
  const loading = ref(false);
  const isEdit = ref(false);
  const currentId = ref<string>("");

  async function loadDetail(id: string) {
    loading.value = true;
    isEdit.value = true;
    currentId.value = id;
    try {
      const res = await getAction(API_CONFIG.getById, { id });
      if (res?.data) tabsRef.value?.loadData(res.data);
    } finally {
      loading.value = false;
    }
  }

  async function handleSave() {
    const valid = await tabsRef.value?.validate();
    if (!valid) { ElMessage.warning("请完善必填项"); return; }
    loading.value = true;
    try {
      const formData = tabsRef.value?.collectFormData();
      const payload = isEdit.value ? { ...formData, id: currentId.value } : formData;
      const res = await postAction(API_CONFIG.save, payload);
      if (res?.code === 200) {
        ElMessage.success("保存成功");
        if (!isEdit.value && res.data?.id) {
          currentId.value = res.data.id;
          isEdit.value = true;
        }
      }
    } finally {
      loading.value = false;
    }
  }

  function handleCancel() {
    router.back();  // ✅ back() 允许，不影响菜单激活
  }

  return { loading, isEdit, loadDetail, handleSave, handleCancel };
}
```

#### index.vue

```vue
<template>
  <div class="app-container app-page-container" v-loading="loading">
    <div class="page-header">
      <span class="page-title">[页面标题]</span>
      <span class="page-tag page-tag--add">新增</span>
      <el-checkbox v-model="onlyRequired" class="only-required-check">只看必填项</el-checkbox>
    </div>
    <div class="page-toolbar">
      <el-button type="primary" @click="handleSave">保存</el-button>
      <el-button @click="handleCancel">取消</el-button>
    </div>
    <c_[业务名]Tabs ref="tabsRef" mode="add" :only-required="onlyRequired" />
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { use[PageName]Form } from "./data";
import c_[业务名]Tabs from "@/components/local/c_[业务名]Tabs/index.vue";

const tabsRef = ref();
const route = useRoute();
const onlyRequired = ref(false);
const { loading, loadDetail, handleSave, handleCancel } = use[PageName]Form(tabsRef);

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

### Template C: FLAT_DETAIL 平铺详情页

> 适用场景：单页平铺 Section 式详情/编辑页面（无 Tab 组件），如「临时客户档案详情」。
> 与 Template B 的区别：不使用 `c_[业务名]Tabs`，而是直接在 `el-form` 中按 Section 分块铺设表单字段。

#### C-1 data.ts 模板

```typescript
import { getAction, postAction } from "@jhlc/common-core/src/api/action";
import { ElMessage, ElMessageBox } from "element-plus";
import { useRouter } from "vue-router";

export const API_CONFIG = {
  getById: "/sale/[业务名]/getById",
  save: "/sale/[业务名]/save"
  // ...其他业务操作
} as const;

export const OPTS = {
  // 下拉选项集合
  // [字段名]: [{ label: "显示文本", value: "值" }]
};

export interface [PageName]Form {
  id: string;
  // ...所有字段
}

/** 开发期 Mock 数据 */
export function createMockData(): [PageName]Form {
  return {
    id: "mock-001"
    // ...所有字段的模拟值
  };
}

export function use[PageName]Detail() {
  const router = useRouter();
  const loading = ref(false);
  const form = reactive<[PageName]Form>(createMockData());

  async function loadDetail(id: string) {
    loading.value = true;
    try {
      const res = await getAction(API_CONFIG.getById, { id });
      if (res?.data) Object.assign(form, res.data);
    } finally {
      loading.value = false;
    }
  }

  async function handleSave() {
    loading.value = true;
    try {
      const res = await postAction(API_CONFIG.save, { ...form });
      if (res?.code === 200) ElMessage.success("保存成功");
    } finally {
      loading.value = false;
    }
  }

  function handleCancel() { router.back(); }

  return { loading, form, loadDetail, handleSave, handleCancel };
}
```

#### C-2 index.vue 模板

```vue
<template>
  <div class="app-container [page-class]" v-loading="loading">
    <!-- 标题栏 -->
    <div class="title-bar">
      <span class="customer-name">{{ form.[标题字段] }}</span>
      <el-tag type="warning" effect="plain" size="small">{{ form.[状态字段] }}</el-tag>
    </div>

    <!-- 工具栏 -->
    <div class="page-toolbar">
      <el-button type="primary" @click="handleSave">保存</el-button>
      <!-- ...其他按钮 -->
      <el-button @click="handleCancel">返回</el-button>
    </div>

    <el-form :model="form" label-position="top" class="detail-form">
      <!-- 头部信息网格 -->
      <div class="header-info">
        <el-row :gutter="12">
          <el-col :span="4">
            <el-form-item label="[字段名]">
              <el-input v-model="form.[字段]" disabled />
            </el-form-item>
          </el-col>
          <!-- ...更多头部字段 -->
        </el-row>
      </div>

      <!-- Section: 按业务分块，每个 Section 一个 .form-section -->
      <div class="form-section">
        <div class="section-title">[分区名称]</div>
        <el-row :gutter="12">
          <el-col :span="[n]">
            <el-form-item label="[字段名]">
              <el-input v-model="form.[字段]" />
            </el-form-item>
          </el-col>
          <!-- ...更多字段 -->
        </el-row>
      </div>

      <!-- 子表格 Section（如跟进记录） -->
      <div class="form-section">
        <div class="section-title">[表格标题]</div>
        <el-table :data="form.[列表字段]" border size="small">
          <el-table-column type="index" label="序号" width="55" align="center" />
          <!-- ...更多列 -->
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ $index }">
              <el-button type="primary" link size="small">编辑</el-button>
              <el-button type="danger" link size="small" @click="removeRecord($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="add-row-btn" @click="addRecord">+ 新增行</div>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { use[PageName]Detail, OPTS } from "./data";

const route = useRoute();
const { loading, form, loadDetail, handleSave, handleCancel } = use[PageName]Detail();

onMounted(() => {
  const id = route.query.id as string;
  if (id) loadDetail(id);
});
</script>

<style scoped lang="scss">
@import "./index.scss";
</style>
```

#### C-3 index.scss 要点

```scss
.[page-class] {
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .title-bar   { /* 标题 + 状态 Tag，灰色背景 */ }
  .page-toolbar { /* 按钮行，白底，底部边框 */ }
  .detail-form  { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
  .header-info  { padding: 12px 0 4px; border-bottom: 1px solid #f0f2f5; }
  .form-section { margin-top: 16px;
    .section-title { border-left: 3px solid var(--el-color-primary); padding-left: 10px; font-weight: 600; }
  }
  .add-row-btn  { color: #409eff; cursor: pointer; margin-top: 8px; }
  .el-form-item { margin-bottom: 10px; }
}
```

---

## Template D: MULTI_TABLE — 多表联动实绩页

> 适用场景：多个 BaseTable 上下/左右联动，选中上表行驱动下表查询。
> 典型页面：精整实绩（抛丸/倒棱/矫直/酸洗/剥皮/检验/包装）、加热管理（装炉/出炉）、剔钢操作。
>
> 项目中已有两种落地方式：
> - **配置驱动模板组件**：`FinishingAchievementTemplate`（7 个精整页面共用）
> - **独立页面编排**：`mmwr-heating-management`、`mmwr-steel-stripping-operations`

### D-0 核心特征

| 特征 | 说明 |
|---|---|
| **多 AbstractPageQueryHook 实例** | 每个表格区域一个实例，各自管理 `list/page/queryParam/columns` |
| **主从联动** | 选中上表行 → 调用下表实例的 `selectByPlan(row)` 驱动查询 |
| **可拖拽分隔** | `<jh-drag-row :top-height="N">` 上下分隔，可嵌套 |
| **Tab 切换** | `<el-tabs type="border-card">` 或 `<jh-tabs>` 切换录入/查询视角 |
| **操作区** | 在上下表之间放置 `BaseForm` + 按钮，或 `BaseToolbar` |
| **懒加载** | Tab 切换时才加载对应数据，避免首次全量查询 |

### D-1 判断何时使用配置驱动 vs 独立编排

| 条件 | 方式 |
|---|---|
| 3+ 页面布局完全相同，仅 API/工序代码/列不同 | 提取 `src/components/template/XxxTemplate/`，页面仅传 config |
| 页面布局有显著差异（不同 Tab 结构、不同表数量） | 独立页面，在 data.ts 中定义多个 `createXxxPage()` |

### D-2 配置驱动模板组件结构（参考 FinishingAchievementTemplate）

```
src/components/template/[TemplateName]/
├── index.vue       ← 模板组件（接收 config prop）
├── data.ts         ← createXxxPage() 工厂函数
├── types.ts        ← 配置类型定义（ApiConfig, ColumnsConfig, UiConfig 等）
├── index.scss      ← 模板样式
└── README.md       ← 使用说明

src/views/.../[page-name]/
├── index.vue       ← <TemplateName :config="xxxConfig" />（极简）
└── data.ts         ← export const xxxConfig: FinishingAchievementConfig = { ... }
```

**types.ts 要点**：
```typescript
export interface XxxTemplateConfig {
  api: Record<string, string>;     // 各表格 API 端点
  processCode: string;             // 工序标识，用于查询参数
  query?: { plan?: { items: BaseQueryItemDesc<any>[]; defaultParams?: Record<string, any> } };
  columns?: { planColumns: TableColumnDesc<any>[]; detailColumns: TableColumnDesc<any>[] };
  ui?: Partial<UiConfig>;          // 可选 UI 覆盖（Tab 标题、区域标题等）
}
```

**页面 data.ts 要点**（仅配置，不写逻辑）：
```typescript
import type { XxxTemplateConfig } from "@/components/template/XxxTemplate/types";

export const xxxConfig: XxxTemplateConfig = {
  api: { planList: "/mmwr/...", materialList: "/mmwr/..." },
  processCode: "PW",
  query: { plan: { items: [...], defaultParams: { firstProcess: "D", subBacklogCode: "PW" } } }
};
```

### D-3 独立编排页面结构（参考 mmwr-steel-stripping-operations）

**data.ts 要点**（多个 createPage 工厂函数）：
```typescript
// 上表
export function createEntryPage() {
  return new (class extends AbstractPageQueryHook {
    constructor() { super({ url: { list: API_CONFIG.planList }, page: { current: 1, size: 10 } }); }
    queryDef() { return [...]; }
    toolbarDef() { return []; }
    columnsDef() { return [...]; }
  })();
}

// 下表（主从联动）
export function createEntryBottomPage(rejectForm: any) {
  const Page = new (class extends AbstractPageQueryHook {
    constructor() { super({ url: { list: API_CONFIG.detailList } }); }
    queryDef() { return []; }
    toolbarDef() { return [...]; }
    columnsDef() { return [...]; }
    // 关键：由上表行驱动查询
    async selectByPlan(planRow: any) {
      this.queryParam.value.loNo = planRow.loNo;
      this.queryParam.value.lotNo = planRow.lotNo;
      await this.select();
    }
  })();
  return Page;
}
```

**index.vue 要点**：
```vue
<template>
  <div class="app-container app-page-container [page-class]">
    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="录入" name="entry">
        <jh-drag-row :top-height="420">
          <template #top>
            <BaseQuery :form="..." :items="..." @select="..." @reset="..." />
            <BaseTable ref="..." :data="..." :columns="..." highlight-current-row @current-change="handleRowClick" />
            <jh-pagination ... />
          </template>
          <template #bottom>
            <BaseToolbar v-if="selectedRow" :items="..." />
            <el-empty v-if="!selectedRow" description="请先在上方列表中选择一行数据" />
            <BaseTable v-else ref="..." :data="..." :columns="..." />
            <jh-pagination ... />
          </template>
        </jh-drag-row>
      </el-tab-pane>
      <el-tab-pane label="查询" name="query" lazy>
        <!-- 标准 LIST 模式 -->
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { createEntryPage, createEntryBottomPage, createQueryPage } from "./data";

const activeTab = ref("entry");
const selectedRow = ref(null);

const EntryPage = createEntryPage();
const { tableRef, page, queryParam, list, queryItems, columns, select } = EntryPage;

const BottomPage = createEntryBottomPage();
const { list: bottomList, columns: bottomColumns, select: bottomSelect, selectByPlan } = BottomPage;

const handleRowClick = (row: any) => {
  selectedRow.value = row;
  if (row) selectByPlan(row);
};

onMounted(() => select());
watch(activeTab, (tab) => { if (tab === "query") QueryPage.select(); });
</script>
```

### D-4 index.scss 要点

```scss
.[page-class] {
  .section-header { display: flex; align-items: center; gap: 6px; margin: 8px 0; }
  .section-header .title-bar { width: 3px; height: 14px; background: var(--el-color-primary); border-radius: 1px; }
  .section-header .section-title { font-size: 14px; font-weight: 600; margin: 0; }
  .empty-tip { padding: 40px 0; }
  .operation-area { padding: 8px 0; }
  .operation-buttons { display: flex; gap: 8px; margin: 8px 0; }
  .results-container { display: flex; gap: 16px; /* 左右分栏时 */ }
  .results-container .section { flex: 1; min-width: 0; }
}
```

---

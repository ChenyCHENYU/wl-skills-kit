# 02 — 代码结构与顺序规范

> **强制度**：🔴 必遵。AI 生成代码必须严格按下列顺序输出。

---

## 三文件分离原则 + 接口契约文档（页面目录结构）

```
src/views/[域]/[模块]/[子模块]/[kebab-case目录]/
├── index.vue    ← 纯模板 + 解构，不写业务逻辑
├── data.ts      ← AbstractPageQueryHook 类 + API_CONFIG（按需，见下方判定规则）
├── index.scss   ← 页面样式（可为空）
└── api.md       ← 接口约定文档（按需，见下方判定规则）
```

**禁止**：把业务逻辑写在 index.vue。

### `data.ts` 判定规则

满足以下**任意一项**的页面，必须拆出 `data.ts`：

- 有接口调用（request / getAction / postAction 等）
- 有分页查询 / 表格 columns / toolbar / query 配置
- 有表单 fields / rules / modalConfig 配置
- 有大量数据驱动配置（字段映射、枚举、状态机等）
- 有复杂状态管理（3+ 个 ref/reactive/computed/watch）
- 有业务方法（新增/编辑/删除/审批/导入/导出等）
- `<script setup>` 明显过长（参考 80 行以上）

以下场景**允许没有** `data.ts`（标记为"不适用"）：

- 纯静态说明页 / 路由容器页 / redirect 页
- 只组合子组件、不拥有业务状态的壳页面
- 数据完全由父组件 props 传入的简单详情展示页
- 无接口、无复杂状态、无数据驱动配置的极简页面

### `api.md` 判定规则

| 场景 | 要求 | 严重度 |
|---|---|---|
| AI 生成页面 | 必须有 `api.md` | 🔴 |
| 新增业务页面 | 必须有 `api.md` | 🔴 |
| 存量复杂接口页面 | 建议补充 | 🟡 |
| 无接口页面 / 纯静态页面 | 完全豁免 | 不报 |

> `api.md` 是前后端接口契约文档，用于对齐联调、追溯变更、AI 二次维护。它是**接口治理项**，不作为文件结构的硬性阻断项。

## 弹窗组件归属

| 场景                    | 位置                                 |
| ----------------------- | ------------------------------------ |
| 通用弹窗（2+ 页面复用） | `src/components/local/c_xxxModal/`   |
| 极个性弹窗（仅单页面）  | 页面目录下 `components/xxxModal.vue` |

---

## index.vue 三段式（顺序固定，不可调换）

```vue
<template>
  <!-- 纯模板 + 组件组合 -->
</template>

<script setup lang="ts">
/* 业务逻辑全部从 data.ts 导入，按下方 9 段式 */
</script>

<style scoped lang="scss">
@import "./index.scss";
/* 仅允许这一行 import，全部样式写在 index.scss */
</style>
```

---

## `<script setup>` 9 段式（按需使用，用到的必须遵守此顺序）

```typescript
// ===== 1. import 语句（外部库 → 内部模块 → 类型）=====
import { ref, computed, onMounted } from "vue";
import { createPage } from "./data";

// ===== 2. 组件宏（defineOptions / defineProps / defineEmits）=====
defineOptions({ name: "PageName" });

// ===== 3. 路由 & Store =====
const route = useRoute();

// ===== 4. createPage() 调用 + 解构（核心模式）=====
const Page = createPage();
const {
  tableRef,
  page,
  queryParam,
  list,
  queryItems,
  columns,
  toolbars,
  select,
} = Page;

// ===== 5. 页面补充状态（ref / reactive / computed）=====
const loading = ref(false);

// ===== 6. watch / watchEffect =====

// ===== 7. 业务方法（API 调用 / 事件处理）=====
async function handleSubmit() {}

// ===== 8. 生命周期 =====
onMounted(() => select());

// ===== 9. defineExpose =====
defineExpose({ select });
```

---

## data.ts 内部顺序（强制）

```typescript
// 1. import（类型 → 基类 → API 工具 → 工具函数）
// 2. API_CONFIG（接口路径集中声明，as const）
// 3. createPage()（constructor → queryDef → toolbarDef → columnsDef → 业务方法）
// 4. 页面共用辅助函数（可选，纯函数）
```

---

## index.scss 顺序（建议）

```scss
// 1. 变量覆盖
// 2. 容器级样式 (.app-page-container)
// 3. 区域级样式 (.search-area / .table-area)
// 4. 组件深层覆盖 (:deep(.el-table))
// 5. 响应式 (@media)
```

> 禁止 `::v-deep` / `/deep/`，统一使用 `:deep()`。

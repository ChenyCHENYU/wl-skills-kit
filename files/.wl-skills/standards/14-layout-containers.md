# 14 — 布局容器规范（jh-drag-col / jh-drag-row）

> **强制度**：🔴 必遵 + 阻断式（lint 命中即报错）。
> 所有左右分栏使用 `jh-drag-col`，所有上下分栏使用 `jh-drag-row`，禁止手写 flex 模拟分栏拖拽。

---

## 1. 强制对照

| 场景     | 必用                                                         | 禁用                       |
| -------- | ------------------------------------------------------------ | -------------------------- |
| 左右分栏 | `<jh-drag-col :leftWidth="240">` + `#left` / `#right` slot   | `el-aside` + `el-main` 手写 flex |
| 上下分栏 | `<jh-drag-row :topHeight="240">` + `#top` / `#bottom` slot   | 手写 flex 模拟拖拽         |
| 嵌套分栏 | 多层 `jh-drag-col` / `jh-drag-row` 直接嵌套                  | —                          |

> `@jhlc/common-core` 的 `jh-drag-col` / `jh-drag-row` 使用 Vue 原生 `<slot />` 直接渲染，不缓存 vnode，子组件响应式与父组件 ref 完全连通。

---

## 2. 标准用法

### 2.1 左树右表（最常见）

```vue
<template>
  <div class="app-container app-page-container" style="height: 100%">
    <jh-drag-col :leftWidth="240">
      <template #left>
        <C_Tree :data="treeData" @node-click="onNodeClick" />
      </template>
      <template #right>
        <BaseQuery ... />
        <BaseToolbar ... />
        <BaseTable v-if="activeModelId" ... />
      </template>
    </jh-drag-col>
  </div>
</template>
```

### 2.2 上表下详情（master-detail）

```vue
<jh-drag-row :topHeight="320">
  <template #top>
    <BaseTable ... @row-click="onRowClick" />
  </template>
  <template #bottom>
    <DetailPanel v-if="currentRow" :data="currentRow" />
  </template>
</jh-drag-row>
```

### 2.3 上 Tab 表单 + 下子表

```vue
<jh-drag-row :topHeight="280">
  <template #top>
    <el-tabs v-model="activeTab"> ... </el-tabs>
  </template>
  <template #bottom>
    <BaseTable ... />
  </template>
</jh-drag-row>
```

---

## 3. FAQ

**Q1：`jh-drag-col` 没有 `min-left-width` 怎么办？**
内部默认 200~600 阈值已可用；如需自定义，传 `:minLeftWidth` / `:maxLeftWidth`（数值，单位 px）。

**Q2：嵌套两层分栏会有性能问题吗？**
不会。`jh-drag-col` / `jh-drag-row` 都是直接 `<slot />`，没有 vnode 缓存或额外 watcher，嵌套层数与原生 div 等价。

---

## 关联

- `12-base-table.md` — BaseTable 内部高度撑满依赖父容器有明确高度，jh-drag-col/row 已正确给子区设 `height: 100%`
- 真实场景案例：`.wl-skills/templates/produce/aiflow/mmwr-customer-detail/`（master-detail 使用 jh-drag-row）

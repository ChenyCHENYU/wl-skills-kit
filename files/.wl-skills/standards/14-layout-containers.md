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

## 3. 长工作台滚动所有权（K20）

`app-page-container` 通常受外层工作区高度约束并裁切溢出内容。一个页面纵向连续放置多个固定高度表格时，内容总高度很容易超过可视区；此时必须由**页面根容器**承担纵向滚动，不能只依赖浏览器或表格内部滚动条。

以下条件同时成立时，`wl-skills validate` 的 K20 会阻断：

- 根元素包含 `app-page-container`；
- 页面包含至少 3 个 `BaseTable`，其中至少 2 个使用固定数值 `height` / `:height`；
- 页面不是 `jh-drag-row` / `jh-drag-col` 分栏布局；
- 根元素的静态 class 在 `index.scss` 或其递归引入的本地 SCSS 中没有 `overflow:auto/scroll` 或 `overflow-y:auto/scroll`。

错误写法：页面整体被裁切，右侧滚动条无法到达下部表格。

```scss
.transfer-page {
  min-height: calc(100vh - 132px);
}
```

正确写法：复用页面级公共容器作为唯一纵向滚动所有者。

```vue
<div class="app-container app-page-container steel-page transfer-page">
  <!-- 多个固定高度 BaseTable -->
</div>
```

```scss
// index.scss
@import "@/components/steelmaking/steel-page.scss";

// 被引入的共享 SCSS
.steel-page {
  height: 100%;
  min-height: 0;
  overflow: auto;
}
```

约束：

- 页面纵向滚动只放在根容器；表格保留自身固定高度和内部行滚动。
- 不额外给中间卡片、Tab 内容或左右子区制造第二条页面级纵向滚动条。
- K20 支持相对路径、`@/` 路径、扩展名省略及 SCSS partial 的递归 `@import` / `@use`。
- 特殊布局必须使用 `<!-- wl-skills:ignore K20 -->` 或项目豁免配置并写明原因，禁止无编号全局放行。

---

## 4. Tabs 分栏表格高度链（K21）

`el-tabs` 内嵌 `jh-drag-row/col` 和 AG Grid 时，高度必须从页面根容器逐级传到表格。只给最外层 `min-height: calc(...)`，或只给表格本身 `height: 100%`，都无法建立可计算高度；最终会出现接口已有数据、分页总数正常，但 AG Grid 高度为 0、表头和行均不可见。

K21 在以下条件同时成立时启用：页面包含 `el-tabs`、`jh-drag-row/col`，并包含 `render-type="agGrid"` 的 `BaseTable` 或 `SteelListPanel`。以下六段高度链缺任一级都会 error 阻断：

1. 页面根容器：`height: 100%; min-height: 0; display: flex; flex-direction: column`；
2. Tabs 静态 class：`min-height: 0; display: flex; flex: 1; flex-direction: column`；
3. `.el-tabs__content`：`min-height: 0; flex: 1`；
4. `.el-tab-pane`：`height: 100%; min-height: 0`；
5. `jh-drag-*` 的直接父容器：`min-height: 0; flex: 1`；
6. `.drager_row` / `.drager_col`：`height: 100%`。

```vue
<div class="app-container app-page-container split-grid-page">
  <el-tabs class="split-grid-page__tabs">
    <el-tab-pane>
      <div class="split-grid-page__split">
        <jh-drag-row :top-height="320">
          <template #top><BaseTable render-type="agGrid" ... /></template>
          <template #bottom><BaseTable render-type="agGrid" ... /></template>
        </jh-drag-row>
      </div>
    </el-tab-pane>
  </el-tabs>
</div>
```

样式可放在 `index.scss`、Vue SFC `<style>`，或由它们以相对路径/`@/` 递归引入的共享 SCSS。`validate --pre-commit` 会反查共享样式影响的页面。特殊布局仅可用 `<!-- wl-skills:ignore K21 -->` 或项目级豁免，并必须记录原因。

---

## 5. FAQ

**Q1：`jh-drag-col` 没有 `min-left-width` 怎么办？**
内部默认 200~600 阈值已可用；如需自定义，传 `:minLeftWidth` / `:maxLeftWidth`（数值，单位 px）。

**Q2：嵌套两层分栏会有性能问题吗？**
不会。`jh-drag-col` / `jh-drag-row` 都是直接 `<slot />`，没有 vnode 缓存或额外 watcher，嵌套层数与原生 div 等价。

---

## 关联

- `12-base-table.md` — BaseTable 内部高度撑满依赖父容器有明确高度，jh-drag-col/row 已正确给子区设 `height: 100%`
- 真实场景案例：`.wl-skills/templates/produce/aiflow/mmwr-customer-detail/`（master-detail 使用 jh-drag-row）

---

## 变更记录

- 2026-09-08：新增 K21 Tabs 分栏表格高度链门禁，补齐 SFC style 与共享 SCSS 反查。
- 2026-09-07：新增 K20 长工作台滚动所有权门禁，覆盖多固定高度表格被 `app-page-container` 裁切、共享 SCSS 引入和 pre-commit 样式变更反查。

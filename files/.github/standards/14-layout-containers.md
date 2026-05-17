# 14 — 布局容器规范（C_Splitter 禁用 + jh-drag-col/row 唯一推荐）

> **强制度**：🔴 必遵 + 阻断式（lint 命中即报错）。
> **背景**：2024 年 12 月一次真实事故，左树右表页面右侧面板永不刷新，最终定位为 `C_Splitter` 在 `onMounted` 中调用 `slots.default()` 冻结 vnode 快照，导致子树所有响应式绑定与父组件 ref 脱钩。
> **结论**：项目中**禁止再使用 `C_Splitter`**，所有左右/上下分栏一律用 `jh-drag-col` / `jh-drag-row`。

---

## 1. 强制对照

| 场景       | ✅ 必用                                | ❌ 禁用             |
| ---------- | -------------------------------------- | ------------------- |
| 左右分栏   | `<jh-drag-col :leftWidth="240">` + `#left` / `#right` slot | `C_Splitter`、`el-aside`+`el-main` 手写 flex |
| 上下分栏   | `<jh-drag-row :topHeight="240">` + `#top` / `#bottom` slot  | `C_Splitter direction="vertical"`、手写 flex |
| 嵌套分栏   | 多层 `jh-drag-col` / `jh-drag-row` 直接嵌套 | C_Splitter 嵌套（双倍 vnode 冻结） |

> `@jhlc/jh-ui` 的 `jh-drag-col` / `jh-drag-row` 使用 Vue 原生 `<slot />` 直接渲染，**不缓存 vnode**，子组件响应式与父组件 ref 完全连通。

---

## 2. C_Splitter 为什么必须废弃（根因）

`src/components/global/C_Splitter/index.vue` 内部实现：

```js
onMounted(() => {
  const defaultSlots = slots.default ? slots.default() : [];
  // ...
  vnodes.value = children;  // 冻结 vnode 列表
});
// 模板里
// <component :is="item" />
```

**反应链**：

1. `slots.default()` 只在 `onMounted` 执行一次 → 拿到的是**当时**的 vnode 快照
2. 模板用 `<component :is="item" />` 渲染快照 → 子组件的所有 props/slot props/ref 绑定**永远定格在 mount 那一刻**
3. 父组件后续修改 ref（`activeModelId.value = "xxx"`）→ 子组件 v-if/v-show/插值**全部失效**
4. 表现：点击树节点，右侧表格**永远显示初始数据**或空白；vue-devtools 看 ref 已变但 UI 不动

> 这是 Vue 3 slot 渲染模型的本质：`slots.default()` 是一次性的 render function 调用，**不能用 ref 缓存其结果当模板用**。任何"缓存 vnode 数组再 component is 渲染"的写法都有同样的 bug。

---

## 3. 标准用法

### 3.1 左树右表（最常见）

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

✅ `v-if`、`ref` 赋值、所有响应式都能正常驱动右侧重渲染。

### 3.2 上表下详情（master-detail）

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

### 3.3 上 Tab 表单 + 下子表

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

## 4. 兼容期处理

若现存项目仍引用 `C_Splitter`：

1. **当前版本**：保留组件文件，在 `onMounted` 顶部加 `console.warn("[C_Splitter 已废弃] ...")` 提示
2. **下一版本**：删除 `src/components/global/C_Splitter/`，全量替换为 `jh-drag-col/row`
3. **lint 规则**：`wl-skills validate` / `wl-skills doctor-ui` 命中 `import C_Splitter` 或 `<C_Splitter` 时报 ERROR

---

## 5. 自动迁移建议

```bash
# 项目根目录执行
grep -rln "C_Splitter" src/views | while read f; do
  echo "需要人工改造：$f"
done
```

迁移要点：

| 旧写法 | 新写法 |
| ------ | ------ |
| `<C_Splitter :left-width="220">` | `<jh-drag-col :leftWidth="220">` |
| `<C_Splitter direction="vertical">` | `<jh-drag-row :topHeight="...">` |
| 默认 slot 顺序：第一项 / 第二项 | 显式 `#left` `#right` / `#top` `#bottom` |
| 拖动配置：`min-left-width="200"` | `jh-drag-col` 内置阈值 |

---

## 6. lint / codegen 强制项

- `prototype-scan` / `page-codegen` 生成的模板**禁止**包含 `C_Splitter`
- TPL-TREE-LIST、TPL-DETAIL-TABS 等模板必须使用 `jh-drag-col` / `jh-drag-row`
- `wl-skills validate-page` 扫到 `C_Splitter` 直接 fail
- `wl-skills validate src/views`：业务页面扫描 `<C_Splitter` / `import C_Splitter` / 过时注释（error / info 三级）
- `wl-skills doctor-ui`：全仓扫描 `.vue/.ts/.scss/.md/.mdc`，区分**业务代码残留（error）**与**文档/规则残留（warn）**；含 `已废弃|DEPRECATED|严禁|不再需要|已迁移` 关键词的上下文自动豁免；`C_Splitter/` 组件目录自身豁免

> 推荐在 CI 非阻断阶段挂 `wl-skills doctor-ui`，残留明细一目了然；提交前 pre-commit 由 `lint-skills` 兜底，禁止任何新增引用流入仓库。

---

## 7. FAQ

**Q1：旧页面跑得好好的，为什么也要改？**
现状只是"还没踩到 ref 变更的场景"。一旦页面后续接入树节点切换 / 全屏刷新 / 编辑回填，就会出现 ref 改了 UI 不动的灵异 bug，排查成本远大于一次性迁移。

**Q2：`jh-drag-col` 没有 `min-left-width` 怎么办？**
内部默认 200~600 阈值已可用；如需自定义，传 `:minLeftWidth` / `:maxLeftWidth`（数值，单位 px）。

**Q3：嵌套两层分栏会有性能问题吗？**
不会。`jh-drag-col` / `jh-drag-row` 都是直接 `<slot />`，没有 vnode 缓存或额外 watcher，嵌套层数与原生 div 等价。

**Q4：必须保留 `C_Splitter` 组件文件吗？**
保留一段过渡期（带 deprecation warning）即可。等仓库扫描 0 命中后，下一个大版本直接删除 `src/components/global/C_Splitter/`。

---

## 关联

- `12-base-table.md` — BaseTable 内部高度撑满依赖父容器有明确高度，jh-drag-col/row 已正确给子区设 `height: 100%`
- `13-platform-components.md` — 平台组件对照表已同步移除 C_Splitter
- 真实场景案例：`demo/produce/aiflow/mmwr-customer-detail/`（master-detail 使用 jh-drag-row）

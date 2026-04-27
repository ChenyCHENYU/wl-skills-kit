# 12 — BaseTable 渲染与 AGGrid cid 唯一性规范

> **强制度**：🔴 必遵。

---

## 渲染模式（强制）

所有 `BaseTable` 必须默认使用 **AGGrid** 渲染：

```vue
<BaseTable
  ref="tableRef"
  render-type="agGrid"
  cid="mca-745831"
  :data="list"
  :columns="columns"
  showToolbar
/>
```

> 全局配置：`envConfig().componentConfig.table = { renderType: 'agGrid' }`
> 设置后所有未显式指定 `render-type` 的 BaseTable 默认 AGGrid。

---

## cid 命名规则（核心）

AGGrid 通过 `cid` 持久化列配置（列宽、顺序、显示），**cid 必须跨全部系统全局唯一**。

> ⚠️ 本项目包含 21 个 Module Federation 子应用，共享同一浏览器 origin（localStorage 共用）。
> 采用简短十进制后缀存在两个致命问题：①后 6 位每 ~11.5 天循环一次；②不同页面的首字母缩写高概率碰撞（如 `mca`、`dto`）。
> 因此后缀必须使用 **完整 base-36 时间戳**，保证毫秒级全局唯一且永不重复。

### 表格级 cid

```
格式：{页面目录首字母缩写}-{Date.now().toString(36)}
```

**生成规则（AI 执行）**：

1. 取页面 kebab-case 目录名，每个单词取首字母拼接为缩写
2. 执行 `Date.now().toString(36)`，将结果完整追加（当前约 9 位 base-36，只增不减）
3. 用 `-` 连接

**示例**：

| 页面目录                 | 缩写 | cid（base-36后缀）      |
| ------------------------ | ---- | ----------------------- |
| `mmwr-customer-archive`  | mca  | `mca-lhfge5hc`          |
| `domestic-trade-order`   | dto  | `dto-lhfge5hi`          |
| 同页面第二个表格（子表） | mca  | `mca-lhfge5hc-sub1`     |
| 同页面第三个表格         | mca  | `mca-lhfge5hc-sub2`     |

> **为什么不截断**：截断后缀（如后 6 位）会引入循环碰撞。完整 base-36 值为单调递增，毫秒级唯一，9 位 base-36 ≈ 2199 亿组合，同一毫秒只生成一次。

### 列级 cid

```
格式：{表格cid的缩写部分}-{fieldName}
```

```typescript
// 表格缩写为 mca
columnsDef(): TableColumnDesc<any>[] {
  return [
    { type: 'selection' },
    { type: 'index' },
    { label: '取样',     name: 'sampling',           cid: 'mca-sampling',           width: 70 },
    { label: '线上公告', name: 'onlineAnnouncement', cid: 'mca-onlineAnnouncement', width: 70 },
  ]
}
```

---

## 禁止事项

- ❌ 随机短字符串 `cid="ipiCfsb"`（AI 重新生成时极易碰撞）
- ❌ 纯字段名 `cid: "sampling"`（不同页面同名字段冲突）
- ❌ 省略 cid（列配置持久化完全失效）
- ❌ 跨页面复用同一 cid

---

## Pre-flight 声明示例

```
✅ cid 已生成：mca-lhfge5hc（mmwr-customer-archive）
✅ 列级 cid 前缀：mca-
```

---

## 完整代码示例

```vue
<!-- index.vue -->
<template>
  <BaseTable
    ref="tableRef"
    render-type="agGrid"
    cid="mca-lhfge5hc"
    :data="list"
    :columns="columns"
    showToolbar
  />
</template>
```

```typescript
// data.ts
columnsDef(): TableColumnDesc<any>[] {
  return [
    { type: 'selection' },
    { type: 'index' },
    { label: '客户名称', name: 'customerName', cid: 'mca-customerName', minWidth: 120 },
    { label: '状态',     name: 'status',       cid: 'mca-status',       minWidth: 80 },
  ]
}
```

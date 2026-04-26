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

AGGrid 通过 `cid` 持久化列配置（列宽、顺序、显示），**cid 必须全局唯一**。

### 表格级 cid

```
格式：{页面目录首字母缩写}-{Unix秒后6位}
```

**生成规则（AI 执行）**：

1. 取页面 kebab-case 目录名，每个单词取首字母拼接为缩写
2. 取 `Math.floor(Date.now() / 1000).toString().slice(-6)` 作为 6 位时间戳后缀
3. 用 `-` 连接

**示例**：

| 页面目录                 | 缩写 | cid               |
| ------------------------ | ---- | ----------------- |
| `mmwr-customer-archive`  | mca  | `mca-745831`      |
| `domestic-trade-order`   | dto  | `dto-745832`      |
| 同页面第二个表格（子表） | mca  | `mca-745831-sub1` |
| 同页面第三个表格         | mca  | `mca-745831-sub2` |

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
✅ cid 已生成：mca-745831（mmwr-customer-archive）
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
    cid="mca-745831"
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

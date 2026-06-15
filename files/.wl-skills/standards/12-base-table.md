# 12 — BaseTable 渲染与 AGGrid cid 唯一性规范

> **强制度**：🔴 必遵。

---

## 渲染模式（强制）

所有 `BaseTable` 必须默认使用 **AGGrid** 渲染：

```vue
<BaseTable
  ref="tableRef"
  render-type="agGrid"
  cid="mca-lhfge5hc"
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

> ⚠️ **AI 批量生成多个 cid 时的碰撞风险**：AI 在同一上下文中连续生成多个 `Date.now().toString(36)` 时，
> 返回值可能相同（AI 不会真实调用系统时钟，而是推断一个"合理值"）。
> **正确做法**：AI 批量生成时，在基准时间戳上依次 +1ms 递增，确保每个 cid 的数字部分唯一：
>
> ```typescript
> // 批量生成模板（AI 执行 code-fix / page-codegen 时使用）
> const base = Date.now()
> const cids = {
>   table:  `mca-${base.toString(36)}`,           // mca-lhfge5hc
>   sub1:   `mca-${(base+1).toString(36)}-sub1`,  // mca-lhfge5hd-sub1
>   sub2:   `mca-${(base+2).toString(36)}-sub2`,  // mca-lhfge5he-sub2
> }
> ```
>
> 人工在编辑器里每次手写一个 cid 时，直接用 `Date.now().toString(36)` 即可（不同时刻天然不同）。

### 列级 cid

```
格式：{完整表格 cid}-{fieldName}
```

> ✅ 用完整表格 cid（而非仅缩写部分）作前缀，是防碌撞的关键。
> 同一页面两张表都有 `steelCode` 列时：
> - 主表（cid=`mca-lhfge5hc`）：`mca-lhfge5hc-steelCode` ✅
> - 子表（cid=`mca-lhfge5hc-sub1`）：`mca-lhfge5hc-sub1-steelCode` ✅
> - 如果用缩写作前缀：两张表同名列都会得到 `mca-steelCode` → 碰撞 ❌

```typescript
// 主表 cid="mca-lhfge5hc"
columnsDef(): TableColumnDesc<any>[] {
  return [
    { type: 'selection' },
    { type: 'index' },
    { label: '取样',     name: 'sampling',           cid: 'mca-lhfge5hc-sampling',           width: 70 },
    { label: '线上公告', name: 'onlineAnnouncement', cid: 'mca-lhfge5hc-onlineAnnouncement', width: 70 },
  ]
}

// 子表 cid="mca-lhfge5hc-sub1"
subColumnsDef(): TableColumnDesc<any>[] {
  return [
    { type: 'index' },
    { label: '钢种编码', name: 'steelCode', cid: 'mca-lhfge5hc-sub1-steelCode', width: 100 },
    { label: '规格',     name: 'spec',      cid: 'mca-lhfge5hc-sub1-spec',      width: 80 },
  ]
}

---

## AGGrid 场景化判定（v2.3.8+）

> 默认所有业务列表表格必须使用 `BaseTable + AGGrid + cid`。
> 但部分特殊场景允许使用 `BaseTable` 非 AGGrid 模式，需在审查报告中标记理由。

### 必须使用 AGGrid 的场景

- 主列表页（分页查询列表）
- 台账类页面
- 数据量较大的列表
- 需要列配置持久化（列宽、顺序、显隐）
- 需要排序、筛选、拖拽列宽
- 业务核心列表

### 允许豁免 AGGrid 的场景（仍优先使用 BaseTable）

| 场景 | 判定 | 说明 |
|---|---|---|
| 弹窗内小型表格 | 🟢 可豁免 | 数据量小、无持久化需求 |
| 表单内行内编辑明细表 | 🟢 可豁免 | AGGrid 行编辑成本高于收益 |
| 嵌套子表（数据量极小） | 🟢 可豁免 | 无独立分页、无列配置需求 |
| 只读展示型小表格 | 🟢 可豁免 | 无交互需求 |
| 特殊合并单元格/复杂行列布局 | ⚠️ 待确认 | AGGrid 不易实现时允许降级 |
| 平台封装组件内部实现 | ⚠️ 待确认 | 封装层内部使用 el-table 需单独评审 |

### 豁免规则

- 豁免场景仍**优先使用 `BaseTable`**（非 AGGrid 模式），而非裸 `el-table`
- 豁免场景如果支持列持久化，仍**必须有 `cid`**
- 审查报告中豁免项必须标注**原因**，避免滥用
- 如果豁免场景后续升级为主列表，必须迁移到 AGGrid

### 审查报告中的分类

| 现状 | 审查判定 |
|---|---|
| 主列表使用 `el-table` | 🔴 严重 |
| 主列表 `BaseTable` 但非 AGGrid | 🔴/🟡 |
| 弹窗小表格 `BaseTable` 非 AGGrid | 🟢 可豁免 |
| 弹窗小表格 `el-table` | 🟡 建议改 BaseTable |
| 封装组件内部 `el-table` | ⚠️ 需确认，不直接报红 |

---

## 禁止事项

- ❌ 随机短字符串 `cid="ipiCfsb"`（AI 重新生成时极易碰撞）
- ❌ 纴字段名 `cid: "sampling"`（不同页面/不同表格同名字段必碰撞）
- ❌ 列级 cid 只用缩写 `cid: 'mca-steelCode'`（同页面两张表都有 steelCode 时碰撞）
- ❌ 省略 cid（列配置持久化完全失效）
- ❌ 跨页面复用同一 cid

---

## Pre-flight 声明示例

```
✅ cid 已生成：mca-lhfge5hc（mmwr-customer-archive）
✅ 列级 cid 前缀：mca-lhfge5hc-（完整表格 cid 加连接符）
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
    { label: '客户名称', name: 'customerName', cid: 'mca-lhfge5hc-customerName', minWidth: 120 },
    { label: '状态',     name: 'status',       cid: 'mca-lhfge5hc-status',       minWidth: 80 },
  ]
}
```

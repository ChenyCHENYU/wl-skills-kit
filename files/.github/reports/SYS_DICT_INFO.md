# SYS_DICT_INFO — 字典数据基线

> **写入方**：`dict-sync pull` 模式从线上拉取后覆盖；`dict-sync push` 完成后追加新增字典
> **读取方**：`dict-sync push / audit` 模式对比本地 vs 线上差异
> **格式约定**：每个字典码一个二级标题块，字典项以表格形式列出

---

## 字典码命名规范

```
全大写 + 下划线分隔，例如：ORDER_STATUS / SALES_COMPANY / PRODUCT_NAME
```

data.ts 中引用方式：
```typescript
{ logicType: BusLogicDataType.dict, logicValue: "ORDER_STATUS" }
```

---

## 字典数据

> ⚠️ 基线为空。请执行以下任一方式初始化：
>
> 1. **从线上拉取**：对 AI 说「刷新字典基线」→ dict-sync pull 模式自动填充此文件
> 2. **手动维护**：按以下格式手动添加，后续 push 模式以此为数据源

---

<!-- 以下为示例格式，执行 pull 后将被真实数据替换 -->

<!--
## ORDER_STATUS（订单状态）

| 值（value） | 显示名称（label） | 排序 | 备注 |
| ---------- | ---------------- | ---- | ---- |
| 0          | 草稿             | 1    |      |
| 1          | 待审核           | 2    |      |
| 2          | 审核通过         | 3    |      |
| 3          | 已驳回           | 4    |      |

## SALES_COMPANY（销售公司）

| 值（value） | 显示名称（label） | 排序 | 备注 |
| ---------- | ---------------- | ---- | ---- |
| 01         | 华北公司         | 1    |      |
| 02         | 华南公司         | 2    |      |
-->


# jh-picker - 通用关联挑选组件

> 平台统一的通用数据挑选组件，适用于需要从某一业务数据源中选择一条或多条数据的场景，常用于关联单据、基础资料等

## 📦 组件位置

```ts
import "@jhlc/common-core";
```

组件已全局注册，可直接在模板中使用 `<jh-picker />`。

---

## 基本用法

### 1️⃣ 单选关联数据（最常用）

```vue
<template>
  <jh-picker
    v-model="form.customerId"
    picker-type="customer"
    placeholder="请选择客户"
  />
</template>

<script setup lang="ts">
import { ref } from "vue";

const form = ref({
  customerId: ""
});
</script>
```

---

### 2️⃣ 多选关联数据

```vue
<jh-picker
  v-model="form.productIds"
  :single="false"
  :list-url="productListUrl"
  :value-attr="['id']"
  :label-attr="['name']"
  :columns="productColumns"
  start-placeholder="请选择商品"
/>
```

---

## Props 属性

| 参数                 | 说明                             | 类型                                                                     | 默认值        |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------ | ------------- |
| modelValue / v-model | 绑定值                           | `string \| string[]`                                                     | -             |
| single               | 是否单选（**多选请用 `:single="false"`**） | `boolean`                                                       | `true`        |
| placeholder          | 占位提示                         | `string`                                                                 | 运行时默认    |
| status               | 控件状态（禁用/只读请用此属性，非 `disabled`） | `"default" \| "disabled" \| "readonly"`                       | `"default"`   |
| dataType             | 返回数据类型（多选时）           | `"array" \| "string"`                                                    | 运行时默认    |
| showType             | 显示类型                         | `"" \| "button"`                                                         | `""`          |
| showLabel            | 按钮文本（showType="button" 时） | `string`                                                                 | -             |
| buttonType           | 按钮类型                         | `"default" \| "primary" \| "success" \| "info" \| "warning" \| "danger"` | `"default"`   |
| buttonIcon           | 按钮图标                         | `"Search" \| "Edit" \| "Delete" \| "Plus" \| "Refresh"`                  | -             |
| title                | 弹窗标题                         | `string`                                                                 | -             |
| width                | 弹窗宽度                         | `string`                                                                 | -             |
| listUrl              | 列表查询接口（**数据源核心配置**） | `string`                                                               | -             |
| listMethod           | 列表查询方法                     | `string`                                                                 | `""`          |
| listByIdsUrl         | 根据 ID 查询接口（回显）         | `string`                                                                 | -             |
| listByIdsMethod      | 回显请求方式                     | `"param" \| "body"`                                                      | `""`          |
| query                | 查询条件配置                     | `Array`                                                                  | -             |
| columns              | 表格列配置                       | `Array`                                                                  | -             |
| valueAttr            | 值字段路径                       | `string[] \| string`                                                     | `[""]`        |
| labelAttr            | 标签字段路径                     | `string[] \| string`                                                     | `[""]`        |
| dataAttr             | 数据字段路径                     | `string[] \| string`                                                     | `[""]`        |
| valueExpr / labelExpr | 值/标签表达式（attr 的表达式版） | `string`                                                                | -             |
| fixQueryParam        | 固定查询参数                     | `object`                                                                 | `{}`          |

> ⚠️ **关于 `pickerType`（重要澄清）**：`pickerType` **不是 `jh-picker` 的组件声明属性**（`PickerComponent.d.ts` 中无此 prop）。它是平台低代码运行时的一种配置概念——若平台已为某类型（如 `customer`）预置了选择器配置，运行时可能注入。**在标准业务代码中不能假设它一定生效**。可靠用法是显式配置 `listUrl` + `valueAttr`/`labelAttr`/`dataAttr` + `columns` + `query`。若沿用项目内已有的 `picker-type` 约定，请先确认平台确有对应配置注入，否则选择器将为空。

> **关联组件**：lib 中另有独立的 `TreePickerComponent`（`jh-tree-picker`），用于树形数据选择（如组织树、分类树），本组件（`jh-picker`）为平铺列表选择。

---

## Events 事件

| 事件名            | 说明           | 回调参数                              |
| ----------------- | -------------- | ------------------------------------- |
| update:modelValue | v-model 更新   | `(value: string \| string[]) => void` |
| change            | 选择变化时触发 | `() => void`                          |
| ok                | 确认选择时触发 | `() => void`                          |
| clear             | 清空时触发     | `() => void`                          |

---

## 常见场景

### 场景 1：选择关联客户

```vue
<jh-picker v-model="form.customerId" picker-type="customer" />
```

---

### 场景 2：选择关联单据

```vue
<jh-picker v-model="form.orderId" picker-type="order" />
```

---

### 场景 3：多选关联基础资料

```vue
<jh-picker v-model="form.materialIds" picker-type="material" :single="false" />
```

---

### 场景 4：详情页展示（配合 jh-text）

```vue
<jh-text :value="detail.customerName" />
```

> ⚠️ `jh-picker` 仅负责选择，展示请使用文本组件

---

## 与手动实现对比

### 使用 jh-picker（推荐）

```vue
<jh-picker v-model="form.customerId" picker-type="customer" />
```

### 手动实现（不推荐）

```vue
<el-input v-model="form.customerName" @click="openDialog" readonly />
```

❌ 需要自己实现弹窗  
❌ 需要处理列表查询  
❌ 需要维护回填逻辑

---

## 最佳实践

### 1️⃣ pickerType 必须语义清晰

```vue
<jh-picker picker-type="customer" />
<jh-picker picker-type="product" />
```

确保不同业务类型对应不同选择器配置

---

### 2️⃣ 编辑 & 展示分离

| 场景     | 编辑      | 展示               |
| -------- | --------- | ------------------ |
| 关联数据 | jh-picker | jh-text / 普通文本 |

---

### 3️⃣ 多选返回值说明

```ts
// 单选
customerId: "c001";

// 多选
productIds: ["p001", "p002"];
```

---

## 注意事项

1. **pickerType 由平台统一配置**
   - 不可随意填写
   - 必须是平台已支持的类型

2. **组件仅返回关联 ID**
   - 其他字段需自行处理或由后端返回

3. **多选注意字段类型**
   - 必须使用数组接收

---

## 🎯 真实项目示例

### 示例 1：销售订单选择客户

```vue
<jh-picker v-model="form.customerId" picker-type="customer" />
```

### 示例 2：采购单选择商品

```vue
<jh-picker v-model="form.productIds" picker-type="product" :single="false" />
```

---

## 🚀 快速开始

1. 确定业务类型（pickerType）
2. 使用 v-model 绑定 ID
3. 展示统一使用文本组件

**推荐作为平台统一的通用关联选择组件使用！**

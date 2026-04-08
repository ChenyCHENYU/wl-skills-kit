# jh-date - 日期选择组件

> 平台统一的日期选择组件，封装常用日期选择交互与默认格式，适用于表单、查询条件等需要选择单个日期的场景

## 📦 组件位置

```ts
import "@jhlc/common-core";
```

组件已全局注册，可直接在模板中使用 `<jh-date />`。

---

## 基本用法

### 1️⃣ 选择单个日期（最常用）

```vue
<template>
  <jh-date v-model="form.date" placeholder="请选择日期" />
</template>

<script setup lang="ts">
import { ref } from "vue";

const form = ref({
  date: ""
});
</script>
```

---

### 2️⃣ 查询条件使用

```vue
<jh-date v-model="query.bizDate" placeholder="业务日期" clearable />
```

---

## Props 属性

| 参数                 | 说明                         | 类型                                    | 默认值         |
| -------------------- | ---------------------------- | --------------------------------------- | -------------- |
| modelValue / v-model | 绑定值                       | `string \| Date`                        | -              |
| placeholder          | 占位提示                     | `string`                                | `"请选择日期"` |
| type                 | 日期类型                     | `"date" \| "week" \| "month" \| "year"` | `"date"`       |
| format               | 绑定值格式（返回给 v-model） | `string`                                | `"YYYY-MM-DD"` |
| showFormat           | 显示格式                     | `string`                                | `"YYYY-MM-DD"` |
| disabled             | 是否禁用                     | `boolean`                               | `false`        |
| clearable            | 是否可清空                   | `boolean`                               | `true`         |
| teleported           | 是否将下拉面板插入 body      | `boolean`                               | `true`         |

> **提示**: `valueFormat` 为 Element Plus 原生属性,此处统一使用 `format` 属性代替,控制返回值格式。

---

## Events 事件

| 事件名            | 说明           | 回调参数          |
| ----------------- | -------------- | ----------------- |
| change            | 日期变化时触发 | `(value) => void` |
| update:modelValue | v-model 更新   | `(value) => void` |

---

## 常见场景

### 场景 1：表单录入日期

```vue
<jh-date v-model="form.deliveryDate" placeholder="请选择交期" />
```

---

### 场景 2：列表查询日期

```vue
<jh-date v-model="query.createDate" placeholder="创建日期" />
```

---

### 场景 3：详情页日期展示（配合 jh-text / 普通文本）

```vue
<span>{{ detail.bizDate }}</span>
```

> ⚠️ `jh-date` 仅用于选择，详情展示建议直接展示字符串或统一格式化后展示

---

### 场景 3：BaseQuery 配置式用法

```ts
// data.ts 查询项配置
export const queryItemsConfig: BaseQueryItemDesc<any>[] = [
  {
    name: "deliveryDate",
    label: "交期日期",
    component: () => {
      return {
        tag: "jh-date",
        type: "date",
        showFormat: "YYYY-MM-DD",
        valueFormat: "YYYY-MM-DD" // 或使用 format
      };
    }
  },
  {
    name: "month",
    label: "月份",
    component: () => {
      return {
        tag: "jh-date",
        type: "month",
        showFormat: "YYYY-MM",
        valueFormat: "YYYY-MM"
      };
    }
  }
];
```

---

## 与 el-date-picker 对比

### 使用 jh-date（推荐）

```vue
<jh-date v-model="form.date" />
```

✅ 统一默认格式  
✅ 简化 props 配置  
✅ 风格一致

### 使用 el-date-picker（不推荐）

```vue
<el-date-picker
  v-model="form.date"
  type="date"
  value-format="YYYY-MM-DD"
  format="YYYY-MM-DD"
/>
```

❌ 每处都要重复配置格式  
❌ 样式与交互不统一

---

## 最佳实践

### 1️⃣ 统一返回字符串格式

推荐保持 `valueFormat="YYYY-MM-DD"`，避免 Date / string 混用：

```vue
<jh-date v-model="form.date" value-format="YYYY-MM-DD" />
```

---

### 2️⃣ 查询条件优先可清空

```vue
<jh-date v-model="query.date" clearable />
```

---

### 3️⃣ 与日期范围选择区分使用

- 单个日期：`jh-date`
- 日期范围：`jh-date-range`

---

## 注意事项

1. **v-model 返回值取决于 valueFormat**
   - 默认返回 `"YYYY-MM-DD"` 字符串
   - 若不配置可能返回 Date（取决于组件封装）

2. **后端字段格式建议统一**
   - 推荐后端/前端统一使用 `"YYYY-MM-DD"`

3. **不要在不同页面混用格式**
   - 避免接口参数混乱

---

## 🎯 真实项目示例

### 示例 1：订单交期

```vue
<jh-date v-model="form.deliveryDate" />
```

### 示例 2：查询条件

```vue
<jh-date v-model="query.bizDate" clearable />
```

---

## 🚀 快速开始

1. 直接使用 v-model 绑定字段
2. 默认返回 `"YYYY-MM-DD"` 字符串
3. 范围选择使用 `jh-date-range`

**推荐作为平台统一的单日期选择组件使用！**

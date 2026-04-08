# jh-text - 文本展示组件

> 统一的文本展示组件，内置平台字典、用户、部门的自动翻译能力，用于列表、详情等只读场景

## 📦 组件位置

```ts
import "@jhlc/common-core";
```

组件已全局注册，可直接在模板中使用 `<jh-text />`。

---

## 基本用法

### 1️⃣ 字典文本展示（最常用）

```vue
<template>
  <jh-text dict="order_status" :value="row.status" />
</template>
```

> 根据字典 code + value 自动翻译显示文本

---

### 2️⃣ 用户名称展示

```vue
<jh-text type="user" :value="row.createUserId" />
```

---

### 3️⃣ 部门名称展示

```vue
<jh-text type="dept" :value="row.deptId" />
```

---

### 4️⃣ 普通文本展示

```vue
<jh-text :value="row.remark" />
```

---

## Props 属性

| 参数 | 说明 | 类型 | 默认值 |
| --- | --- | --- | --- |
| content | 需要展示的值（优先级高于 value） | `string \| number \| Date \| Array` | `""` |
| value | 需要展示的值（与Content二选一） | `string \| number \| string[]` | - |
| dict | 字典名称（平台字典 code） | `string` | - |
| type | 文本类型 | `"text" \| "dict" \| "user" \| "dept"` | `"text"` |
| logicType | 逻辑类型（用于自动识别） | `BusLogicDataType` | - |
| logicValue | 逻辑值（字典code/用户/部门） | `string` | - |
| separator | 多值分隔符 | `string` | `"、"` |
| emptyText | 空值显示文本 | `string` | `"-"` |
| format | 文本格式 | `"default" \| "ellipsis" \| "html"` | `"default"` |
| rows | 多行显示时的行数 | `number` | `1` |
| fontSize | 字体大小 | `"extra-small" \| "small" \| "base" \| "medium" \| "large" \| "extra-large"` | - |
| fontWeight | 字体粗细 | `"light" \| "regular" \| "medium" \| "semi"` | - |

> **提示**: 
> - `dict` 传入时,会自动设置 `type="dict"`
> - 同时使用 `logicType` 和 `logicValue` 可以实现自动翻译

---

## 支持类型说明

| type 值 | 说明 |
| --- | --- |
| text | 普通文本（默认） |
| dict | 字典翻译 |
| user | 用户名称 |
| dept | 部门名称 |

> 当传入 `dict` 时，`type` 可省略

---

## 常见场景

### 场景 1：表格字典列展示（推荐）

```vue
<el-table-column label="订单状态">
  <template #default="{ row }">
    <jh-text dict="order_status" :value="row.status" />
  </template>
</el-table-column>
```

✅ **统一字典展示**  
✅ **避免每个页面手动转换**

---

### 场景 2：用户/部门字段展示

```vue
<jh-text type="user" :value="row.createUserId" />
<jh-text type="dept" :value="row.deptId" />
```

---

### 场景 3：详情页只读展示

```vue
<el-descriptions-item label="订单状态">
  <jh-text dict="order_status" :value="detail.status" />
</el-descriptions-item>
```

---

### 场景 4：多值展示

```vue
<jh-text
  dict="order_tag"
  :value="row.tags"
  separator=" / "
/>
```

### 场景 5：BaseDetail 配置式用法

```ts
// data.ts 详情项配置
export const detailItemsConfig: BaseFormDetailDesc[] = [
  {
    name: "status",
    label: "状态",
    logicType: BusLogicDataType.dict,
    logicValue: "order_status"
    // 会自动渲染为 jh-text 并翻译字典
  },
  {
    name: "createUserId",
    label: "创建人",
    logicType: BusLogicDataType.user,
    logicValue: "userId"
    // 会自动翻译用户名
  }
];
```

---

## 与手动处理对比

### 使用 jh-text（推荐）

```vue
<jh-text dict="order_status" :value="row.status" />
```

### 手动处理（不推荐）

```vue
{{ getDictLabel("order_status", row.status) }}
```

❌ 依赖工具函数  
❌ 每个页面重复实现  
❌ 不利于统一规范

---

## 最佳实践

### 1️⃣ 列表展示统一使用 jh-text

- 字典值
- 用户 / 部门 ID
- 多选值

```vue
<jh-text ... />
```

---

### 2️⃣ 表单编辑 + 展示组件配套使用

| 场景 | 编辑 | 展示 |
| --- | --- | --- |
| 字典 | jh-select | jh-text |
| 用户 | jh-user-picker | jh-text |
| 部门 | jh-dept-picker | jh-text |

---

### 3️⃣ 空值兜底处理

```vue
<jh-text :value="row.remark" empty-text="暂无" />
```

---

## 注意事项

1. **仅用于展示**
   - 不支持编辑
   - 不触发任何 change 事件

2. **字典值必须合法**
   - value 必须存在于字典中
   - 否则显示 `emptyText`

3. **多值类型**
   - value 为数组或逗号分隔字符串均可

---

## 🎯 真实项目示例

### 示例 1：列表页

```vue
<jh-text dict="order_status" :value="row.status" />
```

### 示例 2：详情页

```vue
<jh-text type="user" :value="detail.createUserId" />
```

---

## 🚀 快速开始

- **字典展示**：直接传 `dict`
- **用户/部门**：使用 `type`
- **空值兜底**：配置 `emptyText`

**推荐作为平台统一的文本展示组件使用！**

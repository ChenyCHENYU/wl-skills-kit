# 表单页 UI 细节规范

> 本文件由 page-codegen 主 Skill 路由，只有命中对应页面场景时才读取。
> 表单规则 API、依赖检查和 RuleSpec 复用方式同时读取
> `references/form-validation-library.md`，本文件只维护布局与交互细节。

## 表单页 UI 细节规范（FORM_TAB / 独立路由表单页）

> 适用于使用 el-form + el-row/col 布局的复杂表单页（如客户申请新增/变更）。
> 所有样式规则**写在组件或页面的 index.scss** 中，便于未来复用和移动，避免内联 style 散落。

### 1. 平台组件 label 隐藏

`jh-select`、`jh-date`、`jh-file-upload` 等平台组件自带 `label` prop（默认会渲染"下拉选择框："、"日期："等文字）。
**在 el-form-item 内使用时，必须传 `label=""` 隐藏组件自身标签**，避免与 el-form-item 的 label 重复。

```vue
<!-- ✅ 正确 -->
<el-form-item label="审批产品别">
  <jh-select v-model="form.productLine" dict="product_line" label="" placeholder="请选择" />
</el-form-item>
<el-form-item label="成立时间">
  <jh-date v-model="form.establishDate" label="" placeholder="请选择" />
</el-form-item>
<el-form-item label="营业执照">
  <jh-file-upload v-model="form.businessLicense" label="" :disabled="isView" />
</el-form-item>

<!-- ❌ 错误：不传 label=""，组件内部会额外渲染 "下拉选择框：" / "日期：" 等文字 -->
<jh-select v-model="form.productLine" dict="product_line" />
<jh-date v-model="form.establishDate" />
```

### 2. 表单控件宽度统一

`jh-select`、`jh-date`、`el-input-number`、`jh-file-upload` 默认宽度可能与 `el-input` 不一致。
在组件 scoped style 中统一设置 `width: 100%`：

```scss
:deep(.jh-select),
:deep(.jh-date),
:deep(.el-input-number) {
  width: 100%;
}
:deep(.jh-select .el-input),
:deep(.jh-date .el-input) {
  width: 100%;
}
:deep(.jh-file-upload) {
  width: 100%;
}
```

### 3. 页面滚动

独立表单页内容通常超出视口高度。全局 `.app-page-container` 已设 `height: calc(100vh - 100px); overflow: hidden`（列表页靠表格内部滚动），**表单页必须覆盖 `overflow` 为 `auto`**：

> ⚠️ 不要加 `height: 100%`，否则会产生双滚动条（与全局 height 冲突）。

```scss
.app-page-container {
  overflow-y: auto;
  padding-bottom: 24px;
}
```

### 4. 只看必填项（推荐 composable 方案）

**推荐方式**：用 `useFormRequiredOnly` composable 过滤 items 数组，而非 CSS 隐藏。

**原理**：表单数据在 `form` 对象中（不在 items 中），过滤 items 只控制渲染，切换不丢数据。

#### c_formModal 场景（零代码）

```vue
<c_formModal v-bind="modalConfig" show-required-toggle @ok="select" />
```

加 `show-required-toggle` 即可，组件内部自动处理切换 + clearValidate。

#### 独立路由表单（FORM_ROUTE）

```ts
import { useFormRequiredOnly } from "@/hooks/useFormRequiredOnly";
const { showRequiredOnly, visibleItems } = useFormRequiredOnly(formItems, formRef);
```

```vue
<el-switch v-model="showRequiredOnly" /> 仅必填
<BaseForm :items="visibleItems" :form="form" />
```

#### 自动检测（R17）

表单字段 ≥10 且混合必填时，`wl-skills validate` 会提示 R17 建议开启。
`wl-skills fix` 可自动补 `show-required-toggle`（幂等安全，F6）。

#### 旧 CSS 方案（已废弃，不推荐）

> 以下 CSS `:has()` 方案有浏览器兼容问题且隐藏后校验未清除，已被 composable 方案取代。

<details>
<summary>旧 CSS 方案（仅供参考）</summary>

```scss
&.only-required {
  :deep(.el-col:has(> .el-form-item:not(.is-required))) {
    display: none !important;
  }
}
```

</details>

### 5. 状态信息区域放置

状态信息（创建时间、修改时间、核实状态等只读字段）**仅在"基本信息"Tab 内展示**（业务表格下方），不放在 el-tabs 外部——否则切换到其他 Tab 时仍然可见，与原型不符。

### 6. 文件上传预览

使用 `jh-file-upload` 时，默认 `list-type="picture"` 会将已上传文件显示在组件下方。如需在框内预览（卡片样式），设 `list-type="picture-card"` + `:limit="1"`：

```vue
<jh-file-upload v-model="form.businessLicense" label="" list-type="picture-card" :limit="1" />
```

### 7. 企业核实 Drawer

客户名称输入框右侧加搜索图标，点击打开 `el-drawer` 展示工商信息（天眼查/企查查），使用 `el-descriptions` 两列表格布局。项目 `mockPolicy` 允许且需求明确演示时可先用契约化 Mock；`disabled` 时必须直接接真实 API，接口未就绪则记录阻断，不在业务页面硬编码静态数据。

### 8. 按钮位置

表单页操作按钮（保存、取消等）**左对齐**，放在 `.page-toolbar` 区域（标题行下方、tabs 上方）：

```vue
<div class="page-header">
  <span class="page-title">客户申请详情</span>
  <span class="page-tag page-tag--add">新增</span>
  <span class="page-tag page-tag--status">未审核</span>
  <el-checkbox v-model="onlyRequired" class="only-required-check">只看必填项</el-checkbox>
</div>
<div class="page-toolbar">
  <el-button type="danger" @click="handleSaveAndChange">保存并变更</el-button>
  <el-button type="warning" @click="handleSave">保存</el-button>
  <el-button @click="handleCancel">取消</el-button>
</div>
```

---

### 导入路径规范（@/types/page 桶文件）

> `src/types/page.ts` 是类型桶文件（barrel export），统一重导出 `@jhlc/common-core` 中的常用类型和基类。
> **所有 data.ts 文件必须从 `@/types/page` 导入，禁止直接引用 `@jhlc/common-core/src/...` 的深层路径。**

```typescript
// ✅ 正确：从桶文件导入
import {
  AbstractPageQueryHook,
  BaseQueryItemDesc,
  ActionButtonDesc,
  TableColumnDesc,
  BusLogicDataType
} from "@/types/page";

// ❌ 错误：直接从 common-core 深层路径导入
import { AbstractPageQueryHook } from "@jhlc/common-core/src/page-hooks/page-query-hook.ts";
import { BaseQueryItemDesc } from "@jhlc/common-core/src/components/form/base-query/type";
```

| 导出名                   | 说明                       |
| ------------------------ | -------------------------- |
| `AbstractPageQueryHook`  | 列表页基类                 |
| `BaseQueryItemDesc`      | 查询表单字段描述类型       |
| `ActionButtonDesc`       | 工具栏/操作列按钮描述类型  |
| `TableColumnDesc`        | 表格列描述类型             |
| `BusLogicDataType`       | 业务逻辑类型枚举（如 dict）|

> **例外**：`BaseFormItemDesc`（弹窗表单字段类型）仍直接从 common-core 导入：
> `import type { BaseFormItemDesc } from "@jhlc/common-core/src/components/form/common/type";`
> 因为 `src/types/page.ts` 当前未导出该类型。

---

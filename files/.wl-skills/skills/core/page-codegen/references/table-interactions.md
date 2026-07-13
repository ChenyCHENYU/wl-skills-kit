# 按钮、操作列、状态与视角切换

> 命中工具栏按钮、条件操作列、状态标签、viewSwitch 或 tabSwitch 时读取。

### 按钮颜色映射表

> **原型颜色优先**：当原型明确展示按钮颜色时，**必须以原型为准**，不可用语义推断覆盖。下方语义推断仅在原型未标颜色时使用。

| 原型按钮颜色 | `name` 值 | `plain` | 说明 |
| --- | --- | --- | --- |
| 蓝色填充（深蓝底白字） | `"primary"` | 不设 | 主操作-填充（新增申请、启用） |
| 蓝色线框（蓝边框蓝字） | `"primary"` | `true` | 次要操作-线框（变更申请） |
| 红色填充（红底白字） | `"danger"` | 不设 | 危险-填充（删除、批量删除） |
| 红色线框（红边框红字） | `"danger"` | `true` | 危险-线框（审批驳回、作废） |
| 橙色填充（橙底白字） | `"warning"` | 不设 | 警告-填充（停用） |
| 橙色线框（橙边框橙字） | `"warning"` | `true` | 警告-线框（撤回、退回、回收） |
| 绿色线框（绿边框绿字） | `"success"` | `true` | 正向确认-线框（审批通过、转化、认领） |
| 灰色线框（灰边框灰字） | 不设 name | `true` | 中性操作-线框（导出、导入、批量修改） |

> **`name` vs `type` 属性**：`name` 为按钮提供默认的颜色（`type`）和图标（`icon`）；`type` 可单独覆盖颜色，两者可共存，`type` 优先级更高。工具栏按钮优先使用 `name`，只在需要与 `name` 默认颜色不同时才加 `type` 覆盖。

**语义自动推断**（仅当原型未标颜色时使用，原型明确颜色时以原型为准）：
- 新增/新增申请/保存 → `name: "primary"`（蓝色填充）
- 变更申请 → `plain: true`（灰色线框）
- 提交 → `name: "primary", plain: true`
- 审批通过/认领/转化 → `name: "success", plain: true`
- 删除/批量删除 → `name: "danger"`（红色填充）
- 审批驳回/作废 → `name: "danger", plain: true`
- 启用 → `name: "primary"`（蓝色填充）
- 停用 → `name: "warning"`（橙色填充）
- 撤回/退回/回收 → `name: "warning", plain: true`
- 导出/导入/批量修改 → `plain: true`（灰色线框）

---

### 按钮交互实现规则

所有按钮 `onClick` 必须实现真实交互逻辑，按按钮语义选择以下模式：

| 按钮语义 | 交互实现 |
| --- | --- |
| **新增/新增申请** | `_editModalRef?.value?.open()` |
| **删除** | 校验选中 → `this.removeBatch()` |
| **提交** | 校验选中 → `ElMessageBox.confirm → postAction(API_CONFIG.submit, { ids })` |
| **审批通过** | 校验选中 → `ElMessageBox.confirm → postAction(API_CONFIG.update, { ids, approvalStatus: "审批完成" })` |
| **审批驳回** | 校验选中 → `ElMessageBox.confirm → postAction(API_CONFIG.update, { ids, approvalStatus: "驳回" })` |
| **启用/停用** | 校验选中 → `ElMessageBox.confirm → postAction(API_CONFIG.enable/disable, { ids })` |
| **撤回** | 校验选中 → `ElMessageBox.confirm → postAction(API_CONFIG.withdraw, { ids })` |
| **导出** | 客户端 XLSX 生成（见下方 §导出/导入实现模式） |
| **导入** | 文件选择器 → XLSX 解析 → postAction 批量导入（见下方 §导出/导入实现模式） |
| **其他** | `ElMessage.info("需业务确认交互逻辑")` |

**获取选中行的通用模式**：

```typescript
const rows = this.tableRef.value?.getSelectionRows();
if (!rows?.length) {
  ElMessage.warning("请先选择数据");
  return;
}
const ids = rows.map((r: any) => r.id);
```

**操作列按钮交互**：
- 编辑 → `_editModalRef?.value?.open(row.id)`
- 删除 → `this.remove(row.id)`（基类内置方法，自带确认弹窗）
- 查看 → `_editModalRef?.value?.view(row.id)`

---

### 操作列条件显示模式（`show` 属性）

> 原型中操作列可能在**不同行**显示**不同按钮**（如已核实行显示"修改+作废"，未核实行显示"编辑+删除"）。
> 此时需取**所有按钮的并集**，通过 `show: (row) => boolean` 按行条件显示。

**判断依据**：如果原型操作列中，不同行的按钮文字/数量不同，则属于条件操作。

**标准实现**（框架原生 `show` 属性）：

```typescript
{
  label: "操作",
  name: "_action",
  cid: `${TABLE_CID}-action`,
  width: 140,
  fixed: "right",
  align: "center",
  defaultSlot: ({ row }: any) =>
    renderOps([
      {
        type: "edit",
        label: "修改",
        show: () => row.verifyStatus === "已核实",
        onClick: () => _editModalRef?.value?.edit(row.id)
      },
      {
        type: "danger",
        label: "作废",
        show: () => row.verifyStatus === "已核实",
        onClick: () => handleCancel(row)
      },
      {
        type: "edit",
        label: "编辑",
        show: () => row.verifyStatus !== "已核实",
        onClick: () => _editModalRef?.value?.edit(row.id)
      },
      {
        type: "del",
        label: "删除",
        show: () => row.verifyStatus !== "已核实",
        onClick: () => Page?.remove(row.id)
      }
    ])
}
```

**关键规则**：
1. **width** 按并集中同时显示的最大按钮数计算（2 个≈140，3 个≈200）
2. **按钮 label** 必须与原型中每行实际显示的文字严格一致
3. **按钮语义→API 对应**："作废"→cancel API，"删除"→remove API，不可混用

---

### 状态列色块渲染模式

> 所有"XX状态"类列**必须用 `defaultSlot` + `h(ElTag)` 渲染彩色标签**，不可纯文本显示。

**标准实现模式：**

1. **文件顶部定义映射表 + 渲染函数**（与 `import` 同级）：
```typescript
import { h, resolveComponent } from "vue";

/** 状态色块映射 */
const STATUS_TAG_MAP: Record<string, Record<string, string>> = {
  convertStatus: { "已转化": "success", "未转化": "info" },
  customerStatus: { "临时客户": "warning", "正式客户": "success" },
  verifyStatus: { "已核实": "success", "未核实": "info" },
  enableStatus: { "已启用": "success", "已停用": "danger" },
  approvalStatus: { "开立审批中": "", "审批完成": "success", "驳回": "danger", "流程终止": "info" }
};
function renderStatusTag(row: any, field: string) {
  const val = row[field];
  const type = STATUS_TAG_MAP[field]?.[val];
  if (type === undefined) return val;
  return h(resolveComponent("ElTag") as any, { type: type || "", effect: "light", size: "small" }, () => val);
}
```

2. **列定义中使用 `defaultSlot`**：
```typescript
{ label: "转化状态", name: "convertStatus", minWidth: 100, fixed: "right",
  defaultSlot: ({ row }: any) => renderStatusTag(row, "convertStatus") },
```

**颜色映射规则**（按语义）：
| 语义 | ElTag type | 效果 |
|------|-----------|------|
| 成功/已完成/已启用/已核实/已转化/正式 | `success` | 绿色 |
| 警告/临时/待处理 | `warning` | 橙色 |
| 危险/已停用/驳回/已作废 | `danger` | 红色 |
| 默认/进行中/审批中 | `""` | 蓝灰 |
| 信息/未处理/未核实/未转化/终止 | `info` | 灰色 |

**注意**：当映射值中包含空字符串 `""` 时（如"开立审批中"），`renderStatusTag` 中判断条件必须用 `type === undefined` 而非 `!type`，否则空字符串会被跳过不渲染标签。

---

### 视角切换（viewSwitch）与 Tab 切换（tabSwitch）

#### viewSwitch — 同数据不同列（如"管理视角 / 使用视角"）

> 列定义放在 `class` **外部**作为独立 export 函数；`columnsDef()` 返回其中一个提供默认的 `columns` ref；`index.vue` 自行管理 `activeView`，用 `v-if` 切换 `BaseTable`。

外部列函数无法用 `this` 调用 Page 方法，需要**模块级变量**引用：

```typescript
// 模块顶部：外部列函数通过此变量回调 Page 的 select()/remove()
let Page: any = null;

export function managementColumns(): TableColumnDesc<any>[] {
  return defineColumns([
    // ...
    {
      label: "操作",
      name: "_action",
      cid: `${TABLE_CID}-management-action`,
      fixed: "right",
      width: 100,
      align: "center",
      defaultSlot: ({ row }: any) =>
        renderOps([
          { type: "del", label: "删除", onClick: () => Page?.remove(row.id) }
        ])
    }
  ] as any) as TableColumnDesc<any>[];
}
export function usageColumns(): TableColumnDesc<any>[] {
  return defineColumns([ /* 使用视角列... */ ] as any) as TableColumnDesc<any>[];
}

export function createPage(editModalRef?: any) {
  const inst = new (class extends AbstractPageQueryHook {
    columnsDef() { return managementColumns(); }  // 提供 columns ref 默认值
  })();
  Page = inst;
  return (inst as any).create() as any;
}
```

`index.vue` 核心片段：

```vue
<el-tabs v-model="activeView">
  <el-tab-pane label="管理视角" name="management">
    <BaseTable v-if="activeView === 'management'" ref="tableRef"
      :data="list" :columns="mgmtCols" showToolbar />
  </el-tab-pane>
  <el-tab-pane label="使用视角" name="usage">
    <BaseTable v-if="activeView === 'usage'" ref="tableRef"
      :data="list" :columns="useCols" showToolbar />
  </el-tab-pane>
</el-tabs>

<script setup lang="ts">
import { createPage, managementColumns, usageColumns } from "./data";
const editModalRef = ref();
const activeView = ref("management");
const mgmtCols = managementColumns();
const useCols = usageColumns();
const Page = createPage(editModalRef);
const { tableRef, page, queryParam, list, queryItems, toolbars, select } = Page;
</script>
```

#### tabSwitch — 同列不同数据（如"临时客户 / 正式客户 / 公海池"）

> `createPage()` 在 `return` 前把 `activeTab` + `handleTabChange` 挂到结果对象，`index.vue` 解构后直接绑定。

**data.ts（`createPage()` 末尾，return 之前）**：

```typescript
  const activeTab = ref<"temp" | "formal" | "pool">("temp");
  const handleTabChange = (val: typeof activeTab.value) => {
    activeTab.value = val;
    result.queryParam.value.tabType = val;
    result.select();
  };
  result.activeTab = activeTab;
  result.handleTabChange = handleTabChange;
  return result;
```

**index.vue 核心片段**：

```vue
<el-tabs v-model="activeTab" @tab-change="handleTabChange">
  <el-tab-pane label="临时客户" name="temp" />
  <el-tab-pane label="正式客户" name="formal" />
  <el-tab-pane label="公海池" name="pool" />
</el-tabs>

<script setup lang="ts">
const Page = createPage(editModalRef);
const { tableRef, page, queryParam, list, queryItems, toolbars, select,
        activeTab, handleTabChange } = Page;
</script>
```

---

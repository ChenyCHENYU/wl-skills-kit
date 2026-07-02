# 组件在线文档查询索引

> 当 kit 精简文档不够用时，**优先 webfetch 在线文档获取最新完整 API**。
> 在线文档由 `@jhlc/common-core/lib/*.d.ts` 真实声明驱动，准确性有保证。

---

## 查询方法

### 方式一：在线站点（推荐）

```
https://jh-agileteam-doc.vercel.app/frontend/pc/components/{component}
```

### 方式二：GitHub Raw（站点不可达时的兜底，永远可用）

```
https://raw.githubusercontent.com/ChenyCHENYU/jh-agileteam-doc/main/docs/frontend/pc/components/{component}.md
```

> 将 `{component}` 替换为下方组件名（kebab-case，不含 .md）。
> **不确定用哪个？** 直接 webfetch raw 源最可靠。

---

## 何时查在线文档

1. kit 精简文档里某 prop/事件不确定 → 查在线完整版
2. 需要用 kit 未收录的组件 → 查在线获取
3. 组件行为与文档描述不符 → 以在线文档为准（对照 common-core/lib 声明）

---

## 组件索引（35 个，按分类）

### Base 核心组件

| 组件 | 在线路径 |
| --- | --- |
| BaseTable | `base-table` |
| BaseForm | `base-form` |
| BaseQuery | `base-query` |
| BaseToolbar | `base-toolbar` |
| AGGrid | `ag-grid` |

### 表单输入

| 组件 | 标签名 | 在线路径 |
| --- | --- | --- |
| 输入框 | `<jh-input>` | `jh-input` |
| 数字输入 | `<jh-input-number>` | `jh-input-number` |
| 文本展示 | `<jh-text>` | `jh-text` |
| 多行文本 | `<jh-textarea>` | `jh-textarea` |
| 字典下拉 | `<jh-select>` | `jh-select` |
| 单选组 | `<jh-radio-group>` | `jh-radio-group` |
| 多选组 | `<jh-checkbox-group>` | `jh-checkbox-group` |
| 开关 | `<jh-switch>` | `jh-switch` |
| 级联选择 | `<jh-cascader>` | `jh-cascader` |
| 日期选择 | `<jh-date>` | `jh-date` |
| 日期范围 | `<jh-date-range>` | `jh-date-range` |

### 数据选择

| 组件 | 标签名 | 在线路径 |
| --- | --- | --- |
| 树选择 | `<jh-tree-picker>` | `jh-tree-picker` |
| 通用挑选 | `<jh-picker>` | `jh-picker` |
| 部门选择 | `<jh-dept-picker>` | `jh-dept-picker` |
| 用户选择 | `<jh-user-picker>` | `jh-user-picker` |
| 文件上传 | `<jh-file-upload>` | `jh-file-upload` |

### 布局与导航

| 组件 | 标签名 | 在线路径 |
| --- | --- | --- |
| 分页 | `<jh-pagination>` | `jh-pagination` |
| 标签页 | `<jh-tabs>` | `jh-tabs` |
| 上下分栏 | `<jh-drag-row>` | `jh-drag-row` |
| 左右分栏 | `<jh-drag-col>` | `jh-drag-col` |
| 进度条 | `<jh-progress>` | `jh-progress` |

### 反馈与操作

| 组件 | 标签名 | 在线路径 |
| --- | --- | --- |
| 按钮 | `<jh-button>` | `jh-button` |
| 图标 | `<jh-icon>` | `jh-icon` |
| 对话框 | `<jh-dialog>` | `jh-dialog` |
| 抽屉 | `<jh-drawer>` | `jh-drawer` |

### C_ / c_ 本地组件

| 组件 | 在线路径 |
| --- | --- |
| C_Tree 树形组件 | `c-tree` |
| C_TagStatus 状态标签 | `c-tag-status` |
| c_formModal 表单弹窗 | `c-form-modal` |
| c_formSections 表单分区 | `c-form-sections` |

---

## 组件属性权威源（最终验证）

属性准确性有三个层次，**从上到下优先级递减**：

### 1. props.ts（最权威，最完整）⭐

低代码 schema-component 的设计器属性清单，是产品定义，属性最全：

```
lowcode-engine/packages/common/common-lowcode/components-runtime/src/schema-component/{group}/{name}/props.ts
```

分组对应：
- `base-input-group/`：input/select/date/picker/user-picker 等表单输入
- `base-common-group/`：button/icon/text/pagination/tree/tag 等通用
- `base-container-group/`：dialog/drawer/tabs/drag-col/drag-row/card 等容器
- `base-show-group/`：avatar/badge/carousel 等
- `base-guide-group/`：breadcrumb/progress/step/steps

> ⚠️ **为什么 props.ts 比 .d.ts 权威**：`lib/*.d.ts` 的 `ExtractPropTypes` 只推断 `defineComponent` 显式声明的 props，大量属性（如 user-picker 的 26 个属性、select 的数据配置组）通过运行时 `v-bind`/配置注入，**不会出现在 .d.ts**（user-picker 的 .d.ts props 块直接是空 `{}`）。props.ts 是设计器全量属性清单，无遗漏。

### 2. lib/*.d.ts（编译声明，辅助参考）

```
@jhlc/common-core/lib/{PascalCase}Component.d.ts
```

映射规则：标签 `jh-input-number` → `InputNumberComponent.d.ts`

结构：`EpPropFinalized<T, Values, Resolved, Default>`，第 4 个泛型 = 默认值。emits 在 `// 事件` 注释后。

### 3. 在线文档站（webfetch 查询，基于上述源维护）

本文档上半部分的在线索引。属性表已基于 props.ts 维护。

# TPL-DRIVEN：配置驱动模板页（TEMPLATE_DRIVEN 模式代码生成模板）

> **本文件是 page-codegen 的正式代码生成模板。**
> 适用场景：项目中已有可复用的 Template 组件（如 `FinishingAchievementTemplate`），
> 当前页面的交互骨架与该组件完全一致时，`data.ts` 只需导出 config 对象，`index.vue` 极简到 3~5 行。

---

## 核心模式：config-only + 3 行 index.vue

这类页面的代码精简到极致：

```
data.ts    → 只导出一个 xxxConfig 常量（纯 TypeScript 对象，无任何业务逻辑）
index.vue  → 只有 <XxxTemplate :config="config" />，总计 3~5 行
index.scss → 空文件或极少样式（模板组件内部已处理样式）
```

所有业务逻辑（查询、表格列、API 调用、确认框、刷新等）全部在 Template 组件内部处理。
页面文件只是向模板传递"这个页面的具体配置"。

---

## 通用生成规范（适用于任意 Template 组件）

### 步骤 1：确认 Template 组件的 types.ts

生成 config 对象前，必须先读取该模板的类型定义文件：

```
src/components/template/{XxxTemplate}/types.ts
```

`data.ts` 的 config 对象结构必须完全遵循 `types.ts` 的 interface 定义，不得猜测字段。

### 步骤 2：生成 data.ts（纯 config 对象）

```typescript
// src/views/[域]/[模块]/[子模块]/[kebab-页面名]/data.ts
import type { XxxTemplateConfig } from "@/components/template/XxxTemplate/types";

export const [camelPageName]Config: XxxTemplateConfig = {
  // 按 types.ts 的 interface 逐字段填写
  // 所有 API path 格式："/[服务缩写]/[资源名]/[操作]"
  api: {
    list: "/[svc]/[resource]/list",
    // ... 其余 API 按 types.ts 定义
  },

  // 其他配置字段按 types.ts 补全
};
```

> **严格约束**：
> - ❌ 禁止在 data.ts 中写任何函数、class、ref、reactive
> - ❌ 禁止导入 `AbstractPageQueryHook` 或任何 hook 基类
> - ✅ 只有 import type + export const

### 步骤 3：生成 index.vue（3~5 行）

```vue
<!-- src/views/[域]/[模块]/[子模块]/[kebab-页面名]/index.vue -->
<template>
  <XxxTemplate :config="[camelPageName]Config" />
</template>

<script setup lang="ts">
import XxxTemplate from "@/components/template/XxxTemplate/index.vue";
import { [camelPageName]Config } from "./data";
</script>
```

> ⚠️ 注意：模板组件自身已包含 `app-container app-page-container` 外层，
> index.vue **不要再套一层 div**，避免双层容器导致布局错位。
> 若不确定，读模板组件的 index.vue 确认其根元素结构。

### 步骤 4：生成 index.scss

通常为空文件或只有极少页面级样式覆盖：

```scss
// src/views/[域]/[模块]/[子模块]/[kebab-页面名]/index.scss
// 如无特殊覆盖样式，保留空文件即可
// 模板组件内部已处理所有通用样式
```

### 步骤 5：pages.ts 注册（与其他模式相同）

```typescript
// router/pages.ts 追加
["[kebab-页面名]", "[页面中文名]"],
```

---

## 何时使用 TEMPLATE_DRIVEN（识别规则）

**必须同时满足以下两个条件**：

1. 项目 `src/components/template/` 目录下已存在可复用的 Template 组件
2. 当前页面与该模板的交互骨架**完全一致**（查询/操作/表格结构均与模板期望的 config 结构匹配）

**不确定时的决策**：

```
✅ 交互完全一致，template/types.ts 字段全部能对应 → 使用 TEMPLATE_DRIVEN
⚠️ 交互相似但有额外自定义逻辑 → 使用 LIST（更安全，不要强套模板）
❌ 项目无 Template 组件 → 不适用，直接用 LIST/DETAIL_TABS 等标准模板
```

---

## 已知配置驱动模板一览（cx-ui-produce 项目特定）

> ⚠️ 以下是 cx-ui-produce 项目已有的 Template 组件，仅在该项目中适用。
> 其他项目需根据自己项目的 `src/components/template/` 目录确认。

### 1. ResultQueryTemplate（轧钢实绩查询类）

**适用范围**：`production-mmwr/sjtj/` 下的各工序实绩查询页（查询+表格+导出，无新增/编辑/删除）

**识别特征**：
- 原型中只有查询区 + 数据表格 + 导出按钮
- 无 CRUD 操作，纯查询
- 字段较多，表格列数 10+

**生成规则**：

```typescript
// data.ts — 只导出一个 config 对象
import type { ResultQueryConfig } from "@/components/template/ResultQueryTemplate/types";
import { BusLogicDataType } from "@/types/page";

export const [pageName]Config: ResultQueryConfig = {
  api: {
    list: "/[服务缩写]/[资源名]/list",
    export: "/[服务缩写]/[资源名]/export"  // 有导出时才加
  },
  queryItems: [
    { name: "[field]", label: "[中文名]", placeholder: "请输入" },
    {
      name: "[dateField]",
      type: "range",
      startName: "[startDate]",
      endName: "[endDate]",
      label: "[日期名]",
      logicType: BusLogicDataType.date,
      rangeSeparator: "至"
    }
  ],
  columns: [
    { label: "[列名]", name: "[fieldName]", minWidth: 120 }
  ]
};
```

```vue
<!-- index.vue -->
<template>
  <ResultQueryTemplate :config="[pageName]Config" />
</template>

<script setup lang="ts">
import ResultQueryTemplate from "@/components/template/ResultQueryTemplate/index.vue";
import { [pageName]Config } from "./data";
</script>
```

---

### 2. FinishingAchievementTemplate（精整实绩类）

**适用范围**：`production-mmwr/jzsj/` 下的各精整工序实绩管理页（喷砂、倒棱、矫直、剥皮、检验、酸洗、包装）

**识别特征**：
- 原型标题含"实绩"二字且在精整工序列表中
- 有固定的查询区 + 实绩录入 + 汇总数据结构
- 字段结构高度统一（同一套模板 7 个页面共用）

**生成规则**：读 `src/components/template/FinishingAchievementTemplate/types.ts`，按 `FinishingAchievementConfig` interface 生成 config 对象。

---

### 3. ApplicationDeterminationTemplate（申请判定类）

**适用范围**：`production-mmwr/` 下的申请判定类页面（如 mmwr-application-determination-jz）

**识别特征**：原型中有"申请"列表 + "判定"操作的双状态工作流页面

---

### 4. SamplingCommissionTemplate（取样委托类）

**适用范围**：`production-mmwr/jhgl/` 下的取样委托管理页

**识别特征**：原型中有"委托单"列表 + 取样记录结构

---

## AI 操作规范

1. **识别阶段**：page-spec 前置检查时，若页面落入以上任一范围或项目有对应 Template 组件，将交互模式标记为 `TEMPLATE_DRIVEN` 并注明具体模板名
2. **生成阶段**：只生成 `data.ts`（config 对象）+ `index.vue`（3~5行）+ `index.scss`（空或极少样式）
3. **禁止行为**：
   - ❌ 不得手写 `createPage()` + `AbstractPageQueryHook` 结构
   - ❌ 不得添加独立的 `BaseQuery` / `BaseTable` / `jh-pagination`（模板内部已处理）
   - ❌ 不得将其他业务场景的页面识别为 TEMPLATE_DRIVEN 并强套 config 格式
4. **不确定时**：使用 LIST 模板代替，更安全


---

## 已知配置驱动模板一览

> ⚠️ **以下模板是基于高度相似的特定业务场景提炼的**，仅适用于列出的具体页面类型。不得因为"看起来相似"就套用到其他业务场景，否则会出现功能异常。

### 1. ResultQueryTemplate（轧钢实绩查询类）

**适用范围**：`production-mmwr/sjtj/` 下的各工序实绩查询页（查询+表格+导出，无新增/编辑/删除）

**识别特征**：
- 原型中只有查询区 + 数据表格 + 导出按钮
- 无 CRUD 操作，纯查询
- 字段较多，表格列数 10+

**生成规则**：

```typescript
// data.ts — 只导出一个 config 对象
import type { ResultQueryConfig } from "@/components/template/ResultQueryTemplate/types";
import { BusLogicDataType } from "@/types/page";

export const [pageName]Config: ResultQueryConfig = {
  api: {
    list: "/[服务缩写]/[资源名]/list",
    export: "/[服务缩写]/[资源名]/export"  // 有导出时才加
  },
  queryItems: [
    // 同 Template A 的 queryDef 格式
    { name: "[field]", label: "[中文名]", placeholder: "请输入" },
    {
      name: "[dateField]",
      type: "range",
      startName: "[startDate]",
      endName: "[endDate]",
      label: "[日期名]",
      logicType: BusLogicDataType.date,
      rangeSeparator: "至"
    }
  ],
  columns: [
    // 同 Template A 的 columnsDef 格式（无 selection/index/操作列）
    { label: "[列名]", name: "[fieldName]", minWidth: 120 }
  ]
};
```

```vue
<!-- index.vue -->
<template>
  <ResultQueryTemplate :config="[pageName]Config" />
</template>

<script setup lang="ts">
import ResultQueryTemplate from "@/components/template/ResultQueryTemplate/index.vue";
import { [pageName]Config } from "./data";
</script>
```

---

### 2. FinishingAchievementTemplate（精整实绩类）

**适用范围**：`production-mmwr/jzsj/` 下的各精整工序实绩管理页（喷砂、倒棱、矫直、剥皮、检验、酸洗、包装）

**识别特征**：
- 原型标题含"实绩"二字且在精整工序列表中
- 有固定的查询区 + 实绩录入 + 汇总数据结构
- 字段结构高度统一（同一套模板 7 个页面共用）

**生成规则**：参考 `src/components/template/FinishingAchievementTemplate/` 内的 `types.ts` 定义，只生成对应的 config 配置。

---

### 3. ApplicationDeterminationTemplate（申请判定类）

**适用范围**：`production-mmwr/` 下的申请判定类页面（如 mmwr-application-determination-jz、mmwr-application-determination-sj）

**识别特征**：原型中有"申请"列表 + "判定"操作的双状态工作流页面

---

### 4. SamplingCommissionTemplate（取样委托类）

**适用范围**：`production-mmwr/jhgl/` 下的取样委托管理页（如 mmwr-sampling-commission-jz、mmwr-sampling-commission-sj）

**识别特征**：原型中有"委托单"列表 + 取样记录结构

---

## AI 操作规范

1. **识别阶段**：在 page-spec 前置检查时，若页面落入以上任一范围，将交互模式标记为 `TEMPLATE_DRIVEN` 并注明具体模板名
2. **生成阶段**：只生成 `data.ts`（config 对象）+ `index.vue`（2-3行）+ `index.scss`（空或极少样式）
3. **禁止行为**：
   - ❌ 不得手写 `createPage()` + `AbstractPageQueryHook` 结构
   - ❌ 不得添加独立的 `BaseQuery` / `BaseTable` / `jh-pagination`（模板内部已处理）
   - ❌ 不得将其他业务场景的页面识别为 TEMPLATE_DRIVEN 并套用以上 config 格式
4. **不确定时**：如果不确定是否适用配置驱动模板，使用 Template A（LIST）代替，更安全

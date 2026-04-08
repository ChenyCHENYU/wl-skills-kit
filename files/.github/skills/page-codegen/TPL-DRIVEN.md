# TEMPLATE_DRIVEN：配置驱动模板页（识别参考）

> ⚠️ **本文件为识别参考，不是代码生成模板。**
> 配置驱动页面已由现有业务模板组件封装，AI **只需生成 config 配置对象**，不得套用 TPL-A 至 TPL-G 的结构重新手写页面逻辑。

---

## 什么是配置驱动模板页

这类页面的 `index.vue` 极为简单，只有 1-3 行：

```vue
<template>
  <div class="app-container app-page-container">
    <XxxTemplate :config="xxxConfig" />
  </div>
</template>

<script setup lang="ts">
import { xxxConfig } from "./data";
</script>
```

所有业务逻辑（查询、表格列、导出、翻译等）全部由模板组件内部处理，`data.ts` 只需导出一个 `config` 对象。

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

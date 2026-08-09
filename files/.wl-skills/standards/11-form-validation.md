# 11 — 表单与校验规范

> **强制度**：🔴 必遵。

---

## c_formModal / c_formSections 场景

平台已封装组件，**内置完整生命周期**：

```
open → 数据回填 → validate → submit → close / resetFields
```

✅ AI 直接按组件文档使用即可，**不需要重复写 validate / resetFields 逻辑**。

参考：`.wl-skills/src/components/local/c_formModal/README.md`

## 标准校验库

新生成的表单规则统一使用 `@robot-admin/form-validate` 3.4.1+：

- 当前平台是 Element Plus，UI-only 规则使用 `ELEMENT_RULES` / `ELEMENT_COMBOS`。
- 实时校验和提交前纯数据校验需要共享时，以 `SPEC_RULES` 为唯一事实源，
  通过 `toElementRules` 适配 UI，并复用到 `validateRecord/validateRows`。
- 禁止使用 Naive UI 兼容 API：`PRESET_RULES`、`RULE_COMBOS`、`NAIVE_COMBOS`、
  `toNaiveRule(s)`。
- 页面生成前检查项目 `package.json` 和可解析的实际安装版本，声明范围与安装版本均须满足
  `3.4.1+`。非标准版本范围不得伪装兼容，先提示人工确认。缺少依赖时在 Pre-flight 提示
  `pnpm add @robot-admin/form-validate@^3.4.1`，经确认安装后继续；禁止生成悬空 import。
- `@robot-admin/form-validate-core`、`@robot-admin/form-validate-element` 已废弃，
  新代码不得继续引用。

完整选择规则与示例见
`.wl-skills/skills/core/page-codegen/references/form-validation-library.md`。

---

## FORM_ROUTE 独立路由表单页（c_formModal 不适用时）

无 c_formModal 托管的复杂表单（多 Tab、多子表、向导式），**必须遵守**：

### 1. 提交前调用 validate

```typescript
async function handleSubmit() {
  const valid = await formRef.value?.validate();
  if (!valid) return;
  await postAction(API_CONFIG.save, formData.value);
}
```

### 2. 取消/离开调用 resetFields

```typescript
function handleCancel() {
  formRef.value?.resetFields();
  router.back();
}

onBeforeRouteLeave(() => {
  formRef.value?.resetFields();
});
```

### 3. rules 在 data.ts 中独立导出

```typescript
// data.ts
import { ELEMENT_COMBOS, ELEMENT_RULES } from "@robot-admin/form-validate";

export const formRules = {
  fieldName: [
    ELEMENT_RULES.required("字段名"),
    ELEMENT_RULES.maxLength("字段名", 50),
  ],
  mobile: ELEMENT_COMBOS.mobile("手机号"),
  status: [ELEMENT_RULES.required("状态", "change")],
};
```

❌ **禁止**：把 rules 写在 `<template>` 字面量里。
❌ **禁止**：重复手写 `{ required, message, trigger }`、格式正则或通用数值 validator。

---

## 校验时机

| 时机              | 触发                             |
| ----------------- | -------------------------------- |
| `blur` 失焦       | 字符串类、必填字段               |
| `change` 变更     | 选择类（select / date / picker） |
| 手动 `validate()` | 提交时全量校验                   |
| 字段间联动        | `watch` + 手动 `validateField()` |

## 字段长度、格式与数值边界

字段边界必须来自已确认的 `wl-api-contract`、数据库契约或需求规则，不得根据
字段名、中文标签或经验值猜测。统一在 `page-spec.json` / API 模型字段中声明：

```jsonc
{
  "name": "materialCode",
  "label": "物料编码",
  "type": "input",
  "required": true,
  "constraints": {
    "minLength": 1,
    "maxLength": 64,
    "pattern": "^[A-Z0-9-]+$"
  },
  "constraintSource": "api-contract:models.createRequest.materialCode"
}
```

数值字段使用同一结构：

```jsonc
{
  "name": "weight",
  "label": "重量",
  "type": "number",
  "constraints": {
    "minimum": 0,
    "minExclusive": true,
    "totalDigits": 16,
    "fractionDigits": 4,
    "step": 0.0001
  },
  "constraintSource": "db-contract:TASK.WEIGHT"
}
```

实现必须同时覆盖：

- 输入控件属性：文本 `maxlength`；数字 `min/max/precision/step`。
- 表单规则：文本 `min/max/pattern`；数字总位数、小数位和开闭区间校验。
- 提交端：后端 DTO/Bean Validation 仍是最终边界，前端校验不能代替服务端校验。

无明确来源时不生成臆测限制；在严格生成流程中写入 `openQuestions` 并暂停该
字段的最终实现。查询条件可按接口契约限制输入长度，但不得把数据库列长度
机械套成业务查询规则。

## 分页请求边界（R15）

- 分页初值与上限必须读取项目 `.wl-skills/contracts/wl-delivery-profile.v1.json`；
  无项目 Profile 时才使用包基线 `current: 1, size: 10, maxSize: 200`。
- 项目明确采用 `size=20`、`maxSize=1000` 等口径时允许并给出非阻断提示；代码、Mock、
  `api.md` 与生效 Profile 不一致才阻断。超过生效上限的全量读取必须改用经评审的导出、字典、
  级联选项或专用非分页接口，不能伪装成普通分页查询。
- 查询、重置、页大小变化后都要回到第一页。`total === 0` 时隐藏分页器属于展示策略，
  不代表页面没有分页能力。

## 响应式克隆与可理解异常（R16）

- 不要直接对 Vue `reactive/ref`、表格行、组件实例调用 `structuredClone`；其中可能
  含 Proxy、函数或不可克隆对象。先通过项目已验证的 `toRaw + cloneDeep` 或明确的
  DTO 序列化函数收敛提交字段。
- 不要把浏览器异常的 `error.message` 原样弹给用户。用户提示优先采用后端业务
  `message`，否则使用明确中文兜底；技术堆栈进入日志。
- 表单提交必须构造 API 契约允许的请求模型，禁止把整个响应式页面状态直接发送。

## 仅必填切换（大量表单场景）

表单字段不少于 10 项且混合必填/非必填时，新生成页面必须提供“全部/仅必填”切换；
存量页面由 R17 提示后渐进接入：

- **c_formModal**：加 `show-required-toggle` prop 即可（零代码）
- **c_formSections 页面**：加 `show-required-filter`，内部复用 composable
- **BaseForm / FORM_ROUTE 页面**：用 `useFormRequiredOnly(formItems, formRef)`，将
  `visibleItems` 传给 `BaseForm`
- **多 Tab 页面**：父页面持有 `showRequiredOnly`，每个子表单通过 composable 的
  `requiredOnly` 受控参数过滤自己的 items，并清理自己的表单校验

设计约束：
- 只有同时存在必填和非必填字段时才显示开关；全必填、全非必填或空表单不显示
- 切换用 computed 过滤 items/sections，而非删除字段或 CSS 隐藏；表单数据仍在 form
  对象中，切换不丢值
- 隐藏非必填项时同步 `clearValidate`，防止残留校验阻断提交
- 切回全部字段时清理旧校验状态，下次提交重新完整校验
- 特殊插槽无法静态判断必填性时默认保留；确认无必填内容后才显式隐藏
- 底层 composable 纯 Vue 3 零平台依赖，可独立测试
- F6 只自动补 `c_formModal` 的安全 prop；独立页面涉及 import、状态和布局，不做机械改写

## AI 检查清单

生成 FORM_ROUTE 模板代码时确认：

- [ ] 提交按钮 click 处理函数中调用了 `formRef.value?.validate()`
- [ ] 取消按钮 / 路由离开钩子中调用了 `resetFields()`
- [ ] rules 定义在 `data.ts` 而非 `<template>`
- [ ] 已确认项目声明 `@robot-admin/form-validate` 3.4.1+，未生成悬空 import
- [ ] Element Plus 页面未误用 `PRESET_RULES/RULE_COMBOS/toNaiveRule(s)`
- [ ] 必填字段使用 `ELEMENT_RULES.required`；c_formModal 字段仍保留 `required: true` UI 元数据
- [ ] 格式、长度、数值和通用校验未重复手写 callback/正则规则
- [ ] UI 与提交前校验需要复用时以 RuleSpec 为唯一事实源
- [ ] 字段 ≥10 且混合必填/非必填时已提供有效切换，不是只有开关却未过滤子表单
- [ ] 已声明 constraints 的字段同时具备控件边界和 rules 校验
- [ ] 每组 constraints 都有 constraintSource，可追溯且未凭经验猜测
- [ ] 分页初值、上限和 GET/POST 载荷位置与生效 Profile 一致；未用越界大页伪装全量接口
- [ ] 提交对象可序列化，用户提示不直接暴露浏览器技术异常

## 变更记录

- 2026-08-08：接入 `@robot-admin/form-validate` 3.4.1+，明确 Element/RuleSpec
  分层、依赖前置检查、废弃包迁移和提交校验复用规则。

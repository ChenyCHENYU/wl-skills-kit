# 表单校验库接入

页面包含新增、编辑、独立表单或可编辑明细时读取本文件。当前平台使用 Element Plus，
统一接入 `@robot-admin/form-validate` 3.4.1+；不得使用该包的 Naive UI 兼容 API。

## 前置检查

先读取项目 `package.json`：

- 已声明 `@robot-admin/form-validate`：验证声明范围及可解析安装版本均满足 `3.4.1+`
  后继续；低版本阻断，`workspace:*` 等无法判定的范围先人工确认并锁定兼容版本。
- 未声明且本页需要表单规则：在 Pre-flight 列出
  `pnpm add @robot-admin/form-validate@^3.4.1`，经用户确认安装后继续；不得先生成悬空 import。
- 存在已废弃的 `@robot-admin/form-validate-core` 或
  `@robot-admin/form-validate-element`：暂停并提出迁移到单包。

## API 选择

| 场景 | 使用方式 |
| --- | --- |
| 规则只供 Element Plus / BaseForm 实时校验 | `ELEMENT_RULES` / `ELEMENT_COMBOS` |
| 同一规则还用于提交前纯数据校验 | `SPEC_RULES` + `toElementRules` + `validateRecord` |
| 可编辑表格或主从明细批量校验 | `SPEC_RULES` + `toElementRules` + `validateRows` |
| 条件、跨字段或自定义规则 | 优先 `whenSpec` / `compareWithSpec` / `createSpec`，再适配 Element |

禁止使用 `PRESET_RULES`、`RULE_COMBOS`、`NAIVE_COMBOS`、`toNaiveRule(s)`；
它们返回 Naive UI 规则，不适用于当前平台。

## UI-only 表单

```ts
import { ELEMENT_COMBOS, ELEMENT_RULES } from "@robot-admin/form-validate";

export const formRules = {
  customerName: [ELEMENT_RULES.required("客户名称")],
  mobile: ELEMENT_COMBOS.mobile("手机号"),
  email: [ELEMENT_RULES.email("邮箱")], // 非必填，空值放行
};
```

`ELEMENT_COMBOS.mobile()` 表示“必填 + 手机号格式”；非必填字段只用
`ELEMENT_RULES.mobile()`，不要再手写空值判断。

## c_formModal / BaseFormItemDesc

`required: true` 同时承担必填标识、平台必填能力和“仅必填”筛选，必须保留；
格式、长度、数值边界通过 `rules` 使用校验库，不重复手写 required 对象。

```ts
import { ELEMENT_RULES } from "@robot-admin/form-validate";

{
  name: "mobile",
  label: "手机号",
  required: true,
  rules: [ELEMENT_RULES.mobile("手机号")],
}
```

## 实时校验与提交校验共享规则

规则需要复用时，以 `RuleSpec` 为唯一事实源，不分别维护 Element 规则和提交规则：

```ts
import {
  SPEC_RULES,
  numeric,
  toElementRules,
  validateRecord,
  type RuleSpec,
} from "@robot-admin/form-validate";

const materialCodeSpecs: RuleSpec[] = [
  SPEC_RULES.required("物料编码"),
  SPEC_RULES.maxLength("物料编码", 64),
];
const weightSpecs: RuleSpec[] = [
  SPEC_RULES.required("重量"),
  numeric(
    { totalDigits: 16, fractionDigits: 4, min: 0, minExclusive: true },
    "重量",
  ),
];

export const formRules = {
  materialCode: toElementRules(materialCodeSpecs),
  weight: toElementRules(weightSpecs),
};

export async function validateSubmit(form: Record<string, unknown>) {
  return validateRecord(form, {
    materialCode: materialCodeSpecs,
    weight: weightSpecs,
  });
}
```

多行明细使用 `validateRows(rows, ruleMap, { startIndex: 1 })`。嵌套记录必须使用
`validateRecord`，字段键可写 `address.city`、`items[0].qty`；`validateValue` 仅校验单值。

## 约束与边界

- 长度、正则、范围、`DECIMAL(p,s)` 精度必须来自 page-spec/API/数据库/需求契约，
  不得根据字段名或标签猜测。
- 输入控件的 `maxlength/min/max/precision/step` 与校验规则必须来自同一契约。
- 业务特有规则优先用 `createSpec/createAsyncSpec` 表达为 `RuleSpec`，不要直接复制
  callback validator；无法等价迁移的历史规则允许保留，并说明原因。
- 异步查重必须处理接口异常和竞态。当前不把防抖异步 API 作为默认模板；只有项目完成
  失败收敛与并发验证后才可采用。
- 前端校验用于交互反馈，不能替代后端 DTO/Bean Validation。

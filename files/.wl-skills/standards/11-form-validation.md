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
export const formRules = {
  fieldName: [
    { required: true, message: "请输入字段名", trigger: "blur" },
    { max: 50, message: "不超过 50 字符", trigger: "blur" },
  ],
  status: [{ required: true, message: "请选择状态", trigger: "change" }],
};
```

❌ **禁止**：把 rules 写在 `<template>` 字面量里。

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

- 标准分页初值统一为 `current: 1, size: 10`，不得为了“先拿全量”把
  `size` 写成 500/1000。
- 后端契约最大页大小为 200；超过上限的全量读取必须改用经评审的导出、字典、
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

## AI 检查清单

生成 FORM_ROUTE 模板代码时确认：

- [ ] 提交按钮 click 处理函数中调用了 `formRef.value?.validate()`
- [ ] 取消按钮 / 路由离开钩子中调用了 `resetFields()`
- [ ] rules 定义在 `data.ts` 而非 `<template>`
- [ ] 必填字段都加了 `required: true` 校验规则
- [ ] 已声明 constraints 的字段同时具备控件边界和 rules 校验
- [ ] 每组 constraints 都有 constraintSource，可追溯且未凭经验猜测
- [ ] 分页状态初值为 current=1、size=10；后续页请求仍满足 current>=1、1<=size<=200，未用大页伪装全量接口
- [ ] 提交对象可序列化，用户提示不直接暴露浏览器技术异常

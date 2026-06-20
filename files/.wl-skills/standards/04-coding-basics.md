# 04 — 基础编码规范

> **强制度**：🔴 必遵。
> 参考 jhat.tech 开发规范 + Robot_Admin 实践。

---

## 14 条核心约定

1. **变量声明**：优先 `const`，必须重新赋值时用 `let`，禁止 `var`
2. **解构赋值**：优先使用 `const { a, b } = obj`，而非 `obj.a` / `obj.b`
3. **异步处理**：统一 `async/await`，禁止 `.then()` 链式调用
4. **字符串引号**：统一单引号（以 `.prettierrc.js` 为准）
5. **模板字符串**：替代字符串拼接，`` `Hello ${name}` `` 而非 `'Hello ' + name`
6. **大括号**：所有代码块必须使用大括号包裹，即使只有一行
7. **条件层级**：最多三层，超过三层必须抽成函数
8. **模板表达式**：`<template>` 中只写简单表达式，复杂逻辑提取为 `computed` 或方法
9. **对象遍历**：禁止 `for...in`，使用 `Object.keys(obj).forEach()`
10. **undefined 判断**：使用 `typeof variable !== 'undefined'`
11. **v-for**：必须设置 `:key`，优先用业务主键 id 而非 index
12. **指令缩写**：统一 `:`（v-bind）、`@`（v-on）、`#`（v-slot）
13. **this 别名**：`<script setup>` 中无 `this`；旧 Options API 中的 `this` 别名用 `self`
14. **圈复杂度**：单函数圈复杂度 ≤ **10**（Mcabe），尽量小；超阈值必须拆分

---

## 圈复杂度（Mcabe）细则

> 对应确定性执行器 **R13**（`wl-skills validate` AST 引擎，阻断级）。

- **定义**：`复杂度 = 1 + 决策点数`，决策点 = `if` / `case` / `for` / `for-in` / `for-of` / `while` / `do-while` / `catch` / 三元 `?:` / `&&` / `||` / `??`。与 ESLint `complexity` 规则完全一致。
- **范围**：`index.vue <script>` 与 `data.ts` 中的**每一个**函数 / 方法 / 箭头函数独立计算（嵌套函数单独计，不叠加到父函数）。
- **上限**：`10`。`> 10` 由 R13 报 error 阻断提交。
- **豁免**：单函数加 `// wl-skills:ignore R13` 可精确豁免（仅限确有复杂第三方对接场景，需注释说明）。

**降低复杂度的手法**（按优先级）：

1. **提前 return**（Guard Clause）替代嵌套 `if`
2. 查表驱动（`map[cond]()`）替代 `if-else` / `switch` 长链
3. 按职责抽取子函数（每个子函数单一职责）
4. 策略 / 状态机模式消除多分支

**示例**：

```typescript
// ❌ 复杂度 6，难读
function getLabel(type: string, v: number) {
  if (type === "a") { if (v > 0) { return "A+" } else { return "A-" } }
  else if (type === "b") { if (v > 0) { return "B+" } else { return "B-" } }
  return v > 0 ? "OTHER+" : "OTHER-"
}

// ✅ 复杂度 2，查表驱动
const LABEL_MAP = { a: ["A-", "A+"], b: ["B-", "B+"] } as const
function getLabel(type: string, v: number) {
  const pair = LABEL_MAP[type as keyof typeof LABEL_MAP]
  if (pair) return pair[v > 0 ? 1 : 0]
  return v > 0 ? "OTHER+" : "OTHER-"
}
```

---

## 全局禁止事项

- ❌ index.vue 中写业务逻辑（逻辑全在 data.ts）
- ❌ 使用 Vuex（本项目用 Pinia）
- ❌ `::v-deep` / `/deep/`（用 `:deep()`）
- ❌ 直接用 axios（用 getAction/postAction，详见 13-platform-components.md）
- ❌ 手写查询表单/工具栏/分页（用 BaseQuery/BaseToolbar/jh-pagination）
- ❌ 每个页面重复写弹窗（优先用 `c_modal` / `c_formModal` 等局部公共组件）

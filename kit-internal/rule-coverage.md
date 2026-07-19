# 规则 → 执行器 覆盖矩阵（治理基线）

> **目的**：回答一个关键问题——*每条"必遵"约定，到底是谁在兜底？*
> 是 AST 规则（R*）、page-spec 比对（S*）、正则（regex）、还是仅靠 AI 自觉？
>
> **治理规则**：标记为「阻断」的约定必须至少有一个**确定性执行器**（R*/S*/regex），
> 否则 `lint-skills.js` 报错。这逼着"文档约定"持续向"代码卡控"收敛，不再退化为纯文档。

---

## 执行器图例

| 执行器 | 类型 | 位置 | 确定性 |
|---|---|---|---|
| `R1~R14` | AST 语义级 / 工具链委托 | `lib/ast-rules.js` | ✅ 确定性 |
| `S1~S5` | page-spec 比对 | `lib/page-spec.js` | ✅ 确定性 |
| `D1` | 页面字典契约与模块发布清单比对 | `lib/dict-contract.js` | ✅ 确定性 |
| `regex` | 正则/文件完整性 | `bin/wl-skills.js#runValidate` | ✅ 确定性 |
| `AI` | 仅 SKILL.md 约定 | 各 `SKILL.md` | ⚠️ 非确定性（靠 AI 自觉） |

---

## 覆盖矩阵

| 约定来源 | 规则描述 | 执行器 | 级别 | 阻断 |
|---|---|---|---|---|
| standards/02 | index.vue 不写业务逻辑（行数阈值） | R1 | warn | 否 |
| standards/02 | index.vue 禁止 getAction/sessionStorage | R2 | error | 是 |
| standards/02 | 强制 3 文件分离（有 API 必须有 data.ts） | R8 | error | 是 |
| standards/02 | api.md URL 与 data.ts 一致 | R9 / regex | warn | 否 |
| standards/12 | BaseTable 必须 render-type="agGrid" | regex | error | 是 |
| standards/12 | BaseTable 必须配置全局唯一 cid | regex / R4 | error | 是 |
| standards/12 | 列定义必须 defineColumns() | regex | error | 是 |
| standards/12 | 操作列禁止 operations 数组 | regex | error | 是 |
| standards/12 | el-table 必须替换 BaseTable | R3 | error | 是 |
| standards/13 | el-form/el-select/el-date 等替换平台组件 | R10 | error | 是 |
| standards/06 | 禁止 import axios | R6 | error | 是 |
| standards/06 | 禁止 eval / new Function | R7 | error | 是 |
| standards/10 | data.ts 禁止 import Pinia Store | R11 | error | 是 |
| standards/07 | 禁止硬编码 IP/URL | R12 | error/warn | 是 |
| standards/14 | 布局容器必须用 jh-drag-col/row | regex | error | 是 |
| standards/04 | 禁止空 onClick | regex | error | 是 |
| standards/04 | 单函数圈复杂度 ≤ 10（Mcabe） | **R13** | error | 是 |
| standards/09 | 文件类型错误零容忍（vue-tsc/tsc --noEmit） | **R14** | error | 是 |
| page-codegen 10 | 查询字段顺序 = 原型顺序 | **S1** | warn | 否 |
| page-codegen 11 | 表格列顺序 = 原型顺序 | **S2** | error | 是 |
| page-codegen 12 | 工具栏按钮顺序/颜色 = 原型 | **S3** | error | 是 |
| page-codegen 13 | 操作列按钮严格对应原型 | **S4** | error | 是 |
| page-codegen 15 | 按钮文字保真 | **S5** | warn | 否 |
| page-codegen 21 | 默认 Mock First | regex | warn | 否 |
| page-codegen 24 | 必须用 wl-skills-ui renderOps | regex | warn | 否 |
| api-contract / dict-sync | api.md dict-contract 必须完整汇总到模块 dicts.ts，枚举与排序一致 | **D1** | error | 是 |

---

## 仅 AI 约定（无确定性执行器，未来收敛目标）

以下约定目前仅靠 SKILL.md 告知 AI，没有代码兜底。**不标记为「阻断」**，
随规则成熟度逐步接入执行器后，再升级到上表：

- 按钮颜色语义推断（原型未标色时）—— 难以确定性判定原型颜色
- 可点击列（蓝色链接列）识别 —— 依赖原型视觉信息
- 状态列色块渲染 —— 部分可正则，误报率待验证
- 弹窗使用 c_formModal —— 跨文件、跨组件，确定性判定成本高
- Mock 端点必须修改 dataPool —— 需深度语义分析

> 收敛策略：每次实战发现某条 AI 约定被违反，评估能否写成 R*/S*/regex；
> 能则接入并在上表登记，不能则保留在本节并记录原因。

---

## lint-skills 校验联动

`scripts/lint-skills.js` 读取本文件，对标记「阻断」的行校验其执行器是否真实存在：

- `R1~R14` → 检查 `lib/ast-rules.js` 中存在对应 `rule: "R*"`
- `S1~S5` → 检查 `lib/page-spec.js` 中存在对应 `rule: "S*"`
- `regex` → 不强校验（散落在 runValidate，人工维护）

执行器缺失则 CI 报错，确保矩阵与代码不漂移。

> **R14 触发约定**：R14 执行器已实现（`runTypeCheck`），但体积较大（整项目 `vue-tsc --noEmit`），
> `validate` 默认不跑，需显式 `--typecheck`（CLI）/ `typecheck:true`（MCP）触发。
> 无 `tsconfig.json` 或无 checker 时优雅降级为 warn。CI 流水线应固定执行
> `wl-skills validate --typecheck --strict` 把 R14 纳入合并门禁。

---
name: code-fix
description: "Use when: fixing code convention issues found in convention-audit reports. Triggers on: 自动修复, 整改偏差, 修复报告, 规范整改, 修复偏差, code fix, 整改规范."
---

# Skill: 受控自动修复（code-fix）

读取 `reports/规范审查报告.md` 中的偏差条目，在用户确认 diff 后执行单条或分组修复。

> **前置**：必须先运行 `convention-audit` 生成审计报告，code-fix 依赖其输出。  
> **范围**：仅修复 🟡 / 🟢 等级偏差；🔴 严重偏差必须人工或 page-codegen 重新生成。

---

## 工作流

```
reports/规范审查报告.md（convention-audit 输出）
        │
        ▼
[1] 用户从报告挑选 issueId（或 issueGroup），或说"列出可修复项"
        │
        ▼
[2] 解析 issue → 定位文件 + 行号 + 偏差类型
        │
        ▼
[3] 选择修复策略：
    ├─ rule-based（如缺 :scoped、缺 cid 等）→ 直接按规则生成 patch
    └─ ai-based（语义性偏差）→ AI 生成 patch
        │
        ▼
[4] Pre-flight 输出 diff 预览（人读，必须等待确认）
        │
        ▼
[5] 用户 yes → 写入文件 + 在报告中标记该条目为 ✅ 已修复
    用户 no  → 跳过该 issue，回到挑选界面
        │
        ▼
[6] ★ 强制复扫验证（闭环关键步骤，不可跳过）
    ├─ 本轮修复完成后，自动执行 wl-skills validate 检测修复结果
    ├─ 如仍有 error → 提示未完全修复，建议继续处理
    └─ 全部通过 → 输出 ✔ 闭环完成，可安全提交
```

---

## 强制复扫验证（v2.11+ 闭环保障）

> **闭环原则**：code-fix 修复后必须验证修复效果，不允许"改完就走"。

AI 在完成**本轮全部修复**后（单条或批量），**必须自动执行**：

1. 调用 `wl-skills validate`（或 MCP `wls_validate_page`）对修复文件检测
2. 检测通过（0 error）→ 输出 "✔ 复扫通过，闭环完成"
3. 检测仍有 error → 输出残余问题清单，建议继续修复或标记人工
4. 完成摘要中记录复扫结果

```
## 完成摘要
- 修复项：{N} 条（rule-based {N} / ai-based {N}）
- 复扫结果：✔ 通过 / ✖ 残余 {N} 个 error
- 涉及文件：{file list}

## 复扫验证
- 执行：wl-skills validate
- error: 0 / warn: {N}
- 结论：可安全提交 / 需继续处理

## 建议下一步
- next_suggest：git add + git commit（复扫通过时）
- next_suggest：继续 code-fix 或人工处理（复扫未通过时）
```

**不可跳过**：即使用户说"不用验证了"，AI 也必须执行复扫。这是闭环完整性的硬性约束。

---

## 受控原则（严格执行，不可绕过）

| 原则 | 说明 |
| --- | --- |
| **不修 🔴** | 严重偏差必须人工或 page-codegen 处理，code-fix 不介入 |
| **不破坏功能** | 只改报告点名的行，不顺手"重构"周边代码 |
| **不批量盲改** | 每个文件都先 diff 预览，禁止跳过用户确认 |
| **不生成新逻辑** | 只修偏差，不做功能补全（那是 page-codegen 的职责） |
| **范围明确** | 若用户引导修改业务逻辑，必须拒绝并说明原因 |

---

## 偏差类型 → 修复策略

| 偏差类型 | 来源 standards | 策略 |
| --- | --- | --- |
| EColumn 缺 cid | standards/12-base-table.md | rule-based |
| 列级 cid 只用缩写前缀（如 `mca-steelCode`） | standards/12-base-table.md | rule-based |
| scss 文件缺 `:scoped` 包裹 | standards/02-code-structure.md | rule-based |
| import 路径不规范 | standards/04-coding-basics.md | rule-based |
| `any` 滥用（> 3 处/页） | standards/09-typescript.md | ai-based |
| API_CONFIG URL 命名偏差 | api-contract.md | ai-based |
| 表格列定义与 api.md 字段不一致 | api-contract + data-ts | ai-based |
| 业务语义偏差（流程不对）| 多 standards 综合 | **不修复，标记人工** |

---

## 触发命令形态

```
"修复 reports/规范审查报告.md 中的 issue#3"              → 单条修复
"修复 reports/规范审查报告.md 中所有 scss 偏差"          → 分组修复
"修复全部 rule-based 偏差，跳过 ai-based"                → 受控批量
"列出可修复的 issue"                                     → 仅列清单，不动任何文件
```

---

## Pre-flight 声明示例

```
🚀 已触发技能 ops/code-fix/SKILL.md → 受控自动修复偏差
✅ 已读取 reports/规范审查报告.md    → 找到 12 条偏差（rule-based 8 条，ai-based 4 条）
✅ 当前目标：issue#3（EColumn 缺 cid）→ 文件 src/views/sale/order/data.ts L42
⚠️  以下操作会修改文件，请在 diff 预览后确认
```

---

## 与其他 Skill 的关系

| Skill | 关系 |
| --- | --- |
| convention-audit | **前置**：必须先有审计报告，code-fix 才有输入 |
| wl-skills validate | **后置**：修复完成后必须复扫验证（闭环保障） |
| convention-audit（复扫） | **后置可选**：大规模修复后可触发 --quick 模式复扫 |
| page-codegen | 互斥：生成新页面用 codegen，不用 fix |
| template-extract | 无直接关系 |

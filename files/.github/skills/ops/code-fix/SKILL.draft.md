---
name: code-fix
description: "[PLANNED — DRAFT, not yet active] 受控自动修复 Skill 设计草稿。基于 convention-audit 报告，对单条/分组偏差执行 AI 修复，全程必须人工 review 通过 + 单测护栏。"
status: planned
---

# Skill: 受控自动修复（code-fix）— 草稿

> ⚠️ **本文件为设计草稿（SKILL.draft.md），未启用，不参与 AI 调度。**

---

## 1. 设计目标

`convention-audit` 已能产出偏差清单。`code-fix` 在此基础上提供**受控的自动修复**：

- **单条修复**：选定 1 条偏差 → AI 修改 → diff 确认 → 写入
- **分组修复**：选定一类偏差（如"全部缺少 :scoped"）→ 批量修改 → 总体 diff → 分文件确认 → 写入
- **预置修复模板**：常见偏差直接走规则，不调 AI

---

## 2. 工作流

```
convention-audit 报告 (reports/AUDIT_AI_*.md)
        │
        ▼
[1] 用户从报告挑选 issueId（或 issueGroup）
        │
        ▼
[2] 解析 issue → 定位文件 + 行号 + 偏差类型
        │
        ▼
[3] 选择修复策略：
    ├─ rule-based（如缺 :scoped、缺 cid 等）→ 走预置模板
    └─ ai-based（语义性偏差）→ 调 AI 生成 patch
        │
        ▼
[4] Pre-flight 输出 diff 预览（人读）
        │
        ▼
[5] 用户确认 yes/no
        │
        ├─ yes → 跑 lint + typecheck（如配置）
        │         ├─ 通过 → 写入文件 + 输出 reports/CODE_FIX_<YYYYMMDD>.md
        │         └─ 失败 → 回滚 + 标记 issue "待人工"
        │
        └─ no  → 跳过该 issue，回到挑选界面
```

---

## 3. 受控原则（关键）

| 原则                | 实现                                                          |
| ------------------- | ------------------------------------------------------------- |
| **不破坏功能**      | 修复前后跑 lint + typecheck，失败回滚                         |
| **不批量盲改**      | 每个文件改完都让用户看 diff，禁止全自动跳过确认               |
| **可回滚**          | 修改前内存保留原始内容，输出报告含还原 patch                  |
| **范围明确**        | 只改 issue 报告里点名的行，不顺手"重构"周边                   |
| **AI 不生成新逻辑** | code-fix 只修偏差，**不**做功能补全（那是 page-codegen 的活） |

---

## 4. 偏差类型 → 修复策略对照

| 偏差类型                            | 来源 standards         | 策略       | 难度 |
| ----------------------------------- | ---------------------- | ---------- | ---- |
| EColumn 缺 cid                      | data-ts.md             | rule-based | 易   |
| scss 文件缺 :scoped 包裹            | scss.md                | rule-based | 易   |
| import 路径不规范                   | imports.md             | rule-based | 易   |
| Hook 类未继承 AbstractPageQueryHook | page.md                | rule-based | 中   |
| API_CONFIG URL 不符合命名约定       | api-contract.md        | ai-based   | 中   |
| 表格列定义与 api.md 字段不一致      | api-contract + data-ts | ai-based   | 难   |
| 业务语义偏差（流程不对）            | 多 standards 综合      | **不修复** | -    |

---

## 5. 命令形态（拟定）

```
"修复 reports/AUDIT_AI_*.md 中的 issue#3"        → 单条
"修复 reports/AUDIT_AI_*.md 中所有 scss 偏差"    → 分组
"修复全部 rule-based 偏差，跳过 ai-based"        → 受控批量
"列出可修复的 issue"                            → 不动手，仅列清单
```

---

## 6. 与其他 Skill 关系

| Skill            | 关系                                    |
| ---------------- | --------------------------------------- |
| convention-audit | **前置**：必须先有审计报告才能 code-fix |
| page-codegen     | 互斥：生成新页面用 codegen，不要用 fix  |
| template-extract | 无直接关系                              |

---

## 7. 转正前的开发任务

- [ ] 沉淀至少 10 个 rule-based 修复模板
- [ ] 设计 patch 内联格式（diff/unified）
- [ ] 决定 lint/typecheck 失败的处理（默认回滚 + 标记，无须用户决策）
- [ ] PR review 集成（修复完是否自动建 PR、是否分 commit）
- [ ] 防御对抗性 prompt：用户能否引导 AI 顺手改业务逻辑？应在 SKILL.md 强制约束
- [ ] 灰度策略：先支持单文件、再支持单 issue 组、最后批量

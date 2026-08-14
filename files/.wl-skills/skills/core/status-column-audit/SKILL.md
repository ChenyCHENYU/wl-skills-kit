---
name: status-column-audit
description: "Use when: auditing list pages for dict-rendered columns still shown as plain text and upgrading them to semantic auto-color tags (renderAutoTag/dictAutoTag). Triggers on: 状态列审计, 字典列Tag, 状态tag补齐, 列表彩色化, dict column audit, status tag scan, 存量改造."
---

# Skill: 状态列审计（status-column-audit）v1

扫描列表页里「字典渲染但仍为纯文本」的列，按标签语义分级报告；`--fix` 把状态/类型类列
自动升级为**文案语义自动判色 Tag**（`@agile-team/wl-skills-ui` 的 `renderAutoTagByLabel`
驱动，状态词实心 Tag / 分类词镂空 Tag / 中性词保持纯文本兜底）。

> **核心价值**：存量项目几十个列表页、上百个字典列，肉眼不可维护。本技能把
> wl-ui-ep 存量改造验证过的「扫描 → 分级 → 自动转换 → 补 import → 清残留」
> 全流程固化，转换的 dict/字段取自 const 定义（无歧义源），最坏情况走中性
> 纯文本兜底，零风险。

---

## 触发词
`状态列审计` / `字典列Tag` / `状态tag补齐` / `列表彩色化` / `dict column audit`

---

## Pre-flight 声明（执行前必须输出）
```
🚀 已触发技能 status-column-audit/SKILL.md → 状态列审计：扫描字典列 + 分级报告 + 可选自动转换
✅ 已确认 @agile-team/wl-skills-ui >= 1.10.0（renderAutoTagByLabel 在该版本引入）
✅ 审计范围：--dir 指定目录或默认 src/views
✅ 模式：仅审计（加 --fix 转换 P1，--fix --all 全转）
```

---

## 用法（项目根目录执行）

```bash
# 0)（一次性）生成本地桥接文件 src/utils/dict-auto-tag.ts
node .wl-skills/skills/core/status-column-audit/audit-status-columns.mjs --init-bridge

# 1) 审计（只报告，不改代码）
node .wl-skills/skills/core/status-column-audit/audit-status-columns.mjs

# 2) 自动转换 P1（状态/类型类标签）
node .wl-skills/skills/core/status-column-audit/audit-status-columns.mjs --fix

# 3) 连中性列也转（计量单位等，转了也走纯文本兜底）
node .wl-skills/skills/core/status-column-audit/audit-status-columns.mjs --fix --all

# 可选参数
#   --dir src/views/xxx   指定扫描目录
#   --call dictAutoTag    转换目标调用名（默认 dictAutoTag，与桥接文件配套）
#   --import @/utils/dict-auto-tag  桥接 import 路径
```

## 分级

| 级别 | 判定 | 处理 |
|---|---|---|
| P1 | 列 label 含 状态/类型/级别/形态/维度/是否/结果 等语义词 | `--fix` 默认转换 |
| P2 | 字典列但 label 中性（单位/职务/周期…） | 仅报告；`--all` 才转（兜底纯文本） |
| P3 | `fmtDict(row.x, 'sn')` 助手写法 | 报告，需先配 dict ref，不自动转 |
| P4 | 其他自定义 formatter（版本号/日期拼接…） | 人工甄别 |
| P5 | `logicType:"dict"` 配置列（平台渲染） | 报告，中央挂钩候选 |

## 安全机制（全部来自 wl-ui-ep 实战验证）

1. 转换的 dict 表达式与字段名取自 `const fmtX = (row) => xDict.fmt(row.x)` 定义本身，
   不靠邻近行猜测（邻近行取 label 只用于 P1/P2 分级展示）；
2. 自动补 import（去重 / 扩展既有命名导入 / 多锚点插入）；
3. 转换后别名无引用则清理 const 定义；
4. 括号平衡 sanity 检查，不平衡则跳过该文件并告警；
5. 语义判色兜底：中性文案原样纯文本，**任何误转换最多"没变化"，不会破坏渲染**。

## 依赖

- `@agile-team/wl-skills-ui >= 1.10.0`（`renderAutoTagByLabel` / `AUTO_STATUS_RULES`）
- 桥接文件（`--init-bridge` 生成）适配项目各自的 dictRef 体系（`dictRef.fmt(value)`）。

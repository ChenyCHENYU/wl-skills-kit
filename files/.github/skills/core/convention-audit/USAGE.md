# 使用指南：convention-audit（规范审计）

> **谁读这个文档**：团队成员（主要前端、code reviewer）
> **AI 触发文件**：同目录 `SKILL.md`

---

## 这个 Skill 解决什么问题

对**指定文件/目录**或**全量项目**跑一遍 13 条 standards 检查，输出：

1. **AI 自查报告**（reports/AUDIT*AI*\*.md）— 给 AI 看的，含修复建议
2. **人读摘要报告**（reports/AUDIT*HUMAN*\*.md）— 给团队 review 用的，含通过率/Top 偏差

---

## 何时使用

- code review 前自检
- 接手老页面，想知道偏差有多大
- 重构大模块前，先量化欠债
- PR 卡住找原因（哪条规范没过）

---

## 触发关键词

`规范审计` / `代码审计` / `规范检查` / `对齐规范` / `规范偏差`

---

## 标准对话示例

```
你：审计 src/views/produce/aiflow/mmwr-customer-archive/ 这个页面
AI：[Pre-flight]
    审计目标：1 个页面（4 个文件）
    应用规范：13 条 standards
    输出：
    - reports/AUDIT_AI_mmwr-customer-archive_20260426.md
    - reports/AUDIT_HUMAN_mmwr-customer-archive_20260426.md
    [扫描中...]
    完成。13 条标准通过 11 条，2 条需关注：
    ⚠ standards/data-ts.md - EColumn.cid 缺失 1 处
    ⚠ standards/scss.md - 全局样式污染（缺 :scoped）
    详见 reports/。
```

---

## 输出物结构

### AI 自查报告（详细）

按规范逐条列：

- ✅ 通过：simple count
- ⚠ 偏差：文件路径 + 行号 + 偏差描述 + 修复建议（含代码片段）
- ❌ 严重：阻断性问题

### 人读摘要

- 总体通过率
- Top 5 偏差类型
- 最严重的 3 个文件
- 修复优先级建议（高/中/低）

---

## 团队使用流程

1. **PR 自检**：作者先跑一遍审计，修掉高优先级再提 PR
2. **CR 辅助**：reviewer 看人读摘要快速定位
3. **季度健康度**：每季度跑一次全量审计，跟踪趋势
4. **新人培训**：让新人审计自己写的页面，对照标准学

---

## 常见踩坑

| 现象                                 | 原因                                   | 解法                                    |
| ------------------------------------ | -------------------------------------- | --------------------------------------- |
| 审计跑很久（> 10 分钟）              | 一次性审了上千文件                     | 缩小范围到模块或页面级                  |
| 偏差数据"漂移"（同代码两次结果不同） | AI 模型版本不同                        | 锁定 IDE 模型版本，或以 AI 自查报告为准 |
| 误报字典字段未定义                   | 字典在 reports/SYS_DICT_INFO.md 但跨域 | 在 standards/data-ts.md 里允许跨域字典  |
| Pre-flight 没声明                    | AI 跳过了门控                          | 显式说"按 SKILL.md 执行 Pre-flight"     |

---

## FAQ

**Q：审计结果可以自动修复吗？**
A：单个偏差可以让 AI 修，但**不要让它批量自动改**。建议：人工挑 review 通过的，逐个让 AI 改。code-fix Skill（PLANNED）将提供受控自动修复。

**Q：两份报告为什么要分开？**
A：AI 报告冗长（含每行修复建议），人读摘要简洁（只看趋势/优先级）。两者读者不同。

**Q：自定义规范怎么加？**
A：往 `.github/standards/` 加一份 `*.md`，更新 `standards/index.md`，convention-audit 自动 pickup。

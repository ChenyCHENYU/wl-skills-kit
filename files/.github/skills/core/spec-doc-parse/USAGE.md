# 使用指南：spec-doc-parse（规范文档解构）

> **谁读这个文档**：团队成员（产品/前端/后端）
> **AI 触发文件**：同目录 `SKILL.md`（无需手动阅读）

---

## 这个 Skill 解决什么问题

把 **wl-skills-design 产出的标准《需求设计说明书》**（`docs/spec/` 下的 IPO 表、功能编码、流程五要素）**完整解构**为一份《页面清单》（page-spec JSON），作为后续 `api-contract` 和 `page-codegen` 的输入。

一句话：**design 负责「写标准文档」，spec-doc-parse 负责「读懂标准文档、转成可生成代码的结构」。**

---

## 双线分工（重要）

团队里有两条独立的输入线，**互不污染**：

| 线 | Skill | 输入 | 何时用 |
|----|-------|------|--------|
| **原型线** | `prototype-scan` | Axure 原型 / 截图 / 口述 / 零散详设 | 只有原型、没有规范文档时 |
| **规范线** | `spec-doc-parse`（本 Skill） | wl-skills-design 标准说明书 | 已有 `docs/spec/` 标准文档时 |

> 两条线最终都汇聚到**同一份 page-spec JSON**，下游代码生成完全一样。
> 所以：**有标准说明书就走规范线，精度最高（95-100%）；只有原型走原型线。**

---

## 何时使用

- 拿到 wl-skills-design 生成的 `docs/spec/{项目代号}/4.x-xxx.md`，要把它变成页面
- 说明书里有功能编码（如 PMMB001）、IPO 表、流程图说明
- 想把整卷说明书一次性解构成页面清单，再批量生成代码

---

## 触发关键词

`解析说明书` / `解析需求文档` / `规范文档转页面` / `根据说明书生成` / `IPO 转页面` / `功能编码`

---

## 标准对话示例

### 示例 1：解析单个子模块

```
你：解析 docs/spec/huaxin/4.1-target.md，生成页面清单。
AI：[读取 SKILL.md → 输出 Pre-flight]
    Pre-flight：
    ├─ 识别结构：doc-skeleton 单子模块（4.1 目标管理）
    ├─ 来源：docs/spec/huaxin/4.1-target.md
    ├─ 输出：reports/SPEC_PARSE_target_20260531.md
    └─ 不会生成代码
    [解析中...]
    完成，解析报告：
    - 功能 3 个 / 页面 5 个 / 待确认 2 项 / 自动修复 1 项 / 阻断 0 项
    请确认 2 项待确认后进入 api-contract。
```

### 示例 2：误用原型线的自动纠偏

```
你：扫描 docs/spec/huaxin/4.1-target.md 生成页面。
AI：检测到输入是 wl-skills-design 标准说明书（含功能编码 + IPO 表）。
    → 这属于「规范线」，已自动切换到 spec-doc-parse（精度更高）。
    [继续按规范线解析]
```

---

## 它会产出什么

1. **page-spec JSON**（与 prototype-scan 同格式）—— 喂给 page-codegen 直接生成 Vue 页面
2. **解析报告**（`reports/SPEC_PARSE_*.md`）—— 功能清单 + 待确认清单 + 自动修复记录 + 阻断清单
3. **权限码候选**（写在 notes）—— 供 permission-sync 注册

---

## 自闭环能力（这个 Skill 的特点）

| 能力 | 说明 |
|------|------|
| **自验证** | Pre-flight 校验文档结构 + Parse Validation 五项检查 |
| **自修复** | 活动编码旧格式、英文名空白、dictCode 缺失等无损问题自动修正 |
| **纠偏** | 架构性问题（功能编码错误、未知服务缩写）不捏造，标记 BLOCK |
| **报告** | 每次解析输出完整报告，待确认/阻断项可追溯 |
| **闭环** | 产物可被 convention-audit 的 spec 对齐模式回扫，生成 GAP 报告 |

---

## 边界提醒

- 本 Skill **不处理** Axure 原型、截图 —— 那是 `prototype-scan` 的职责
- 本 Skill **不生成代码** —— 代码由 `page-codegen` 承接
- 本 Skill **不捏造**架构决策 —— 触发事件、接口、编码缺失一律标注待确认

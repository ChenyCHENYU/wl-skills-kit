# 存量改造经验交叉引用

> wl-skills-kit 与 wl-skills-ui 的规范体系互相索引。本文档只做指路，正文以各包为准。

## wl-skills-ui 侧（视觉/运行时规范）

- `@agile-team/wl-skills-ui/standards/ui/06-legacy-migration-lessons.md`（随包发布）
  —— wl-ui-ep 存量改造十条实战沉淀：AG Grid 二级表头渲染根治、滚动条双轨主题色、
  默认居中可退出、状态列文案语义判色、操作图标三色定案、禁用按钮可辨识、搜索区间距、
  分页位置、联邦门户样式污染规避、字典列审计机制。

## wl-skills-kit 侧（流程/质量门禁）

- `standards/` 14 条模块化规范 + `skills/core/convention-audit`（偏差审计）
- `skills/core/status-column-audit`（2.17.0+）：字典列纯文本 → 自动判色 Tag 的
  扫描/分级/自动转换全流程，桥接 wl-skills-ui `renderAutoTagByLabel`（≥1.10.0）
- `lib/ast-rules.js` K1~K19（2.18.0 起 K 前缀，与 wl-skills-ui 的 R001~R040 解耦，
  旧 R 前缀豁免配置兼容）

## 规则编号速查

| 前缀 | 归属 | 范围 | 说明 |
|---|---|---|---|
| `K1~K19` | wl-skills-kit | AST/流程/结构门禁 | 2.18.0 起；旧 `R1~R19` 等价兼容 |
| `R001~R040` | wl-skills-ui | 模板/样式扫描 | `wl-scan` / `wl-ui` CLI 输出 |

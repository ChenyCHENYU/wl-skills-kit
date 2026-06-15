# 产品化前端编码指令

> ⚠️ 本文件是入口指引。**完整指令在 `.wl-skills/copilot-instructions-full.md`**，你必须在首次进入项目或开启新任务时读取该文件。
> 下方是核心要点摘要，确保你在读取完整指令前也不会犯严重错误。

## 必读（每次会话）

**你必须在每次会话开始时执行以下读取，否则无法正确执行任何任务：**

1. 读取 `.wl-skills/copilot-instructions-full.md` — 完整地图（Skill 路由表 + 规范清单 + 场景速查 + 护栏）

## 核心规则摘要（在读取完整指令前必须遵守）

- 页面三文件分离：index.vue（模板）+ data.ts（逻辑）+ api.md（接口）
- **禁止**在 index.vue 写业务逻辑，**禁止**直接用 axios
- **必须**用 BaseTable + `render-type="agGrid"` + 全局唯一 cid
- code-fix 完成后**必须**自动 `wl-skills validate` 复扫（不可跳过）
- 高风险 Skill（page-codegen / sync 类 / code-fix）触发前**必须**二次确认
- 匹配 2+ Skill 时**必须**询问用户意图

## 内容目录

| 内容 | 路径 |
|------|------|
| 完整指令（Skill路由+规范+场景+护栏） | `.wl-skills/copilot-instructions-full.md` |
| Skill 路由表（触发词→路径映射） | `.wl-skills/skills/_registry.md` |
| 场景索引（按场景的最佳实践） | `.wl-skills/skills/_best-practices.md` |
| I/O 契约（Skill 间串联协议） | `.wl-skills/skills/_pipeline.md` |
| 规范（01~14） | `.wl-skills/standards/` |
| 文档（组件用法） | `.wl-skills/docs/` |
| 指南 | `.wl-skills/guides/` |
| 报告 | `.wl-skills/reports/` |
| 模板 | `.wl-skills/templates/` |

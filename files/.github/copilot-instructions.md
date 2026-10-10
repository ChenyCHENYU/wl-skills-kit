# 产品化前端编码指令

## 项目适用边界

先确认目标项目自身的接入证据（本包安装清单、直接依赖或 `.wl-skills-scope.json` 显式启用），再判定任务。只在目标已接入且平台适用时读取规则；父目录安装、兄弟包、Vue 文件或触发词不能证明接入。未接入的开源项目不套用规则、不建议自动安装；UniApp/小程序/App/PDA/移动 H5 不适用。跨项目目标分别判定，沿最近项目边界停止，不能越过未接入子项目找父清单。工具返回 `scope` 作为静态范围证据，宿主加载仍需实际事件。


> ⚠️ 本文件是入口指引。**完整指令在 `.wl-skills/copilot-instructions-full.md`**，你必须在首次进入项目或开启新任务时读取该文件。
> 下方是核心要点摘要，确保你在读取完整指令前也不会犯严重错误。

## 必读（每次会话）

每次任务先调用本地 `wl-skills task "<任务>" --target <路径>`，简短说明本包判定、适用约束及未验证项；按返回路径读取必要 Skill。结束时运行实际校验并使用同一 `--run-id`，以 `wl-skills status --run-id <id>` 的工具记录收尾。意图匹配、安装清单和模型自报均不能证明执行或检查通过。原生发现入口为 `.agents/skills/wl-skills-kit/SKILL.md`。

编辑前必须展示实际 `notice`：包名/版本、判定、Skill 或基础约束、规则编号与名称、目标、runId 和尚未执行的检查；命令失败或版本不一致须明示，不能静默跳过。
同一用户任务在已安装且适用的包之间复用一个 `--run-id` / `WL_TASK_RUN_ID`，不创建互不关联的任务，也不要求安装未使用的兄弟包。

**你必须在每次会话开始时执行以下读取，否则无法正确执行任何任务：**

1. 读取 `.wl-skills/copilot-instructions-full.md` — 完整地图（Skill 路由表 + 规范清单 + 场景速查 + 护栏）

## 核心规则摘要（在读取完整指令前必须遵守）

- 页面三文件分离：index.vue（模板）+ data.ts（逻辑）+ api.md（接口）
- **禁止**在 index.vue 写业务逻辑，**禁止**直接用 axios
- 表格遵循项目已声明技术与适用约束；使用 AG Grid 时遵循对应 BaseTable/cid 规范，不凭技能触发迁移表格技术
- code-fix 完成后**必须**自动 `wl-skills validate` 复扫（不可跳过）
- 本地写入遵循用户已授权范围；后端写操作遵循查询、预览 planHash、明确确认、写入流程
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

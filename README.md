<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ChenyCHENYU/wl-skills-kit/main/assets/wl-kit-logo-dark.svg" />
    <img src="https://raw.githubusercontent.com/ChenyCHENYU/wl-skills-kit/main/assets/wl-kit-logo.svg" width="100%" alt="WL skills-kit · World Leading · Frontend Engineering" />
  </picture>
</p>

<p align="center"><strong>把需求、API 契约、Vue 页面与工程校验连起来，让 AI 按项目规范交付。</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agile-team/wl-skills-kit"><img src="https://img.shields.io/npm/v/@agile-team/wl-skills-kit?color=315E9F&label=npm" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A522-172634" alt="Node.js 22 or later" />
  <img src="https://img.shields.io/badge/Vue-3-315E9F" alt="Vue 3" />
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> · <a href="#一次任务怎么完成">任务流程</a> · <a href="#常用操作">常用操作</a> · <a href="./docs/agent-pipeline-runbook.md">工作流手册</a>
</p>

## 适合什么项目

面向**已接入 Kit 的 PC Vue 3 / Web 管理端**，支持新页面开发、存量整改和领域模板复用。移动 H5、UniApp、小程序、App / PDA 不套用 PC 规则；父工作区安装不会自动启用子项目。

AI Skill 模板包 v2.33.1：14 条编码规范、13 个 AI Skill、34 个 MCP Tool，配套 CLI、编辑器入口与项目内文档。

| 需要做什么 | Kit 提供什么 | 交付结果 |
| --- | --- | --- |
| 从需求到页面 | 原型 / 详设解析、page-spec、独立 API 契约、页面生成 | 页面、逻辑、接口说明与验收要求对应 |
| 按规范开发 | 文件职责、组件约定、AST 检查、类型与规格对齐 | 具体规则、文件位置和问题说明 |
| 整改存量代码 | 规范审计、确定性机械修复、复扫 | 已修复与需人工判断的项分开反馈 |
| 复用成熟页面 | 紧凑项目快照、脱敏 Blueprint、场景 JSON 确定性渲染 | 减少逐页读源码与重复生成 |
| 补齐交付配置 | 菜单、字典、角色与动作权限 MCP | 查询 → 预览 → 确认 → 写入 → 回查 |

## 快速开始

在**实际业务项目根目录**操作，沿用项目包管理器。以下以 pnpm 为例。

### 1. 安装本地工具并初始化

```bash
pnpm add -D -E @agile-team/wl-skills-kit@latest
pnpm exec wl-skills init
```

生成 `.wl-skills/` 规范与 Skill、`.agents/skills/wl-skills-kit/SKILL.md` 发现入口、编辑器与 MCP 配置。已有项目内容按受管归属保护；冲突先审阅，不用 `--force` 覆盖未知内容。

### 2. 检查接入并完成首扫

```bash
pnpm exec wl-skills check
pnpm exec wl-skills validate --typecheck
```

`check` 看安装、工具链、MCP 与 Hook 配置；`validate` 看实际页面问题。类型检查需要项目已安装并配置 `vue-tsc` 或 `tsc`。

### 3. 让编辑器按任务使用

刷新编辑器的 Skill / MCP 配置后，给出任务与目标，例如：

```text
审计 src/views/produce/order，先列出问题和修复范围；
确认后修复，再做页面与类型校验，反馈剩余问题。
```

看到实际任务回执中的**包版本、选定规则、目标、runId**，以及最终真实检查结果，才算本次能力被使用。安装或 AI 口头说明不能证明执行。

**团队质量接入：** 已用 Gate 管理的项目，直接走 [Gate 统一接入](https://github.com/ChenyCHENYU/wl-skills-gate#快速接入)，避免重复组装 Hook。Kit 独立初始化只在已有 Git 与 `.husky` 时追加提交 / 推送检查；还需验证 Hook 已激活。本地缺包会跳过该独立 Hook，服务端强制门禁由 Gate / CI 接线落实。

## 一次任务怎么完成

以 `wl-ui-produce` 订单列表增加查询条件为例：

| 步骤 | 执行内容 | 看什么结果 |
| --- | --- | --- |
| 明确任务 | 指定页面目录、查询行为与接口事实 | 任务匹配、适用规则、缺少的输入 |
| 修改实现 | 按 API 契约更新页面、逻辑与接口说明 | 变更范围与业务要求一致 |
| 校验反馈 | 检查页面、规格对齐和项目类型 | 文件位置、规则、错误与未验证项 |
| 整改复扫 | 机械问题用脚本，业务判断结合事实处理 | 同 runId 的最新执行与校验状态 |

编辑器可调用 CLI 或 MCP 完成这条流程。排查集成时可直接核对：

```bash
pnpm exec wl-skills task "修改订单列表页面查询条件" \
  --target src/views/produce/order --json
# 按返回的 Skill / 规则完成修改，复用本次返回的 runId
pnpm exec wl-skills validate src/views/produce/order \
  --typecheck --run-id <runId>
pnpm exec wl-skills status --run-id <runId> --json
```

`task` 只生成计划；`validate` 才实际检查，`status` 汇总证据和过期状态。没有运行、范围未覆盖、宿主读取未验证的内容会明确保留，不当作检查通过。

## 常用操作

| 目的 | 命令 / 入口 |
| --- | --- |
| 仅检查某个页面 | `wl-skills validate-page src/views/produce/order` |
| 预览机械修复 | `wl-skills fix --dry-run`；审阅范围后执行 `wl-skills fix`，再 `validate` |
| 先看项目摘要 | `wl-skills snapshot --path src/views --limit 50 --json` |
| 查找已有模板 | `wl-skills template search --domain produce --min-quality 70 --json` |
| 检查 UI 接入 | `wl-skills doctor-ui`，用于已接入 UI 的项目 |
| 接入已有组件 | `wl-skills component check`；缺件用 `component ensure` 预览后确认 |
| 更新规范和入口 | 升级本地依赖后执行 `wl-skills update --dry-run`，审阅后 `wl-skills update` |
| 查看宿主入口与版本漂移 | `wl-skills doctor-host --json` |
| 查看完整能力与参数 | `wl-skills --help` · `wl-skills protocol describe --json` |

上表省略 `pnpm exec`。机械修复只覆盖已实现的明确规则，不替代业务判断；适用表格技术以项目声明为准。部分生成模板使用 UI runtime 或项目 renderer，生成前核对其宿主依赖。

## 按需深入

| 需要了解什么 | 文档 |
| --- | --- |
| 原型 / 详设 → 契约 → 页面 → 复扫 | [工作流手册](./docs/agent-pipeline-runbook.md) · [页面规格](./docs/input-spec-page-spec.md) · [API 输入](./docs/input-spec-api.md) |
| 任务判定、真实回执与项目范围 | [任务可观测性](./docs/task-observability.md) · [结果阅读](./docs/result-reading.md) · [适用范围](./docs/project-scope.md) |
| 菜单、字典、权限与写入确认 | [MCP 风险矩阵](./docs/mcp-tool-risk-matrix.md) · [交付闭环](./docs/business-closure-playbook.md) |
| 模板、场景与环境配置 | [使用指南](./files/.wl-skills/guides/usage.md) · [前后端交付兼容](./files/.wl-skills/guides/delivery-compatibility.md) |

后端写入与外部报告推送须核对具体计划并确认；生产写入默认阻断。项目连接凭据放在被忽略的 `.wl-skills/skills/sync/env.local.json`，不提交仓库。

## WL 系列

**WL = World Leading。** Kit 可独立使用，按项目需要组合其他包。

| 包 | 职责 |
| --- | --- |
| [Gate](https://github.com/ChenyCHENYU/wl-skills-gate) | 统一接入、检查裁决、修复复扫、Review 与发布证据 |
| **Kit** | PC Vue 管理端需求、契约、代码生成与工程规范 |
| [UI](https://github.com/ChenyCHENYU/wl-skills-ui) | PC 管理端设计令牌、样式与交互质量 |
| [BD](https://github.com/ChenyCHENYU/wl-skills-bd) | Java 后端规范、契约与检查能力 |
| [Test](https://github.com/ChenyCHENYU/wl-skills-test) | 测试设计、执行与结果验证 |
| [Design](https://github.com/ChenyCHENYU/wl-skills-design) | 需求与设计模型、交付契约 |

UNLICENSED，使用须经授权。问题反馈请附包版本、Node 版本、目标编辑器、执行命令和最小复现，提交至 [Issues](https://github.com/ChenyCHENYU/wl-skills-kit/issues)。

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

AI Skill 模板包 v2.33.5：14 条编码规范、13 个 AI Skill、34 个 MCP Tool，配套 CLI、编辑器入口与项目内文档。

| 需要做什么 | Kit 提供什么 | 交付结果 |
| --- | --- | --- |
| 从需求到页面 | 原型 / 详设解析、page-spec、独立 API 契约、页面生成 | 页面、逻辑、接口说明与验收要求对应 |
| 按规范开发 | 文件职责、组件约定、AST 检查、类型与规格对齐 | 具体规则、文件位置和问题说明 |
| 整改存量代码 | 规范审计、确定性机械修复、复扫 | 已修复与需人工判断的项分开反馈 |
| 复用成熟页面 | 紧凑项目快照、脱敏 Blueprint、场景 JSON 确定性渲染 | 减少逐页读源码与重复生成 |
| 补齐交付配置 | 菜单、字典、角色与动作权限 MCP | 查询 → 预览 → 确认 → 写入 → 回查 |

**确认技能是否生效：**

- GPT、GLM 等模型由 Codex、Claude Code 或具体 VS Code 插件读取项目入口；模型名称本身不代表已加载技能。
- 先在实际项目根运行 `pnpm exec wl-skills doctor-host --host codex --json`，按实际宿主调整 `--host`；这是入口诊断，不能代替一次真实调用。
- 支持原生技能时可说：`$wl-skills-kit 请在 <项目绝对路径> 中 <完整任务>`；不支持该语法时，让 Agent 先读取 `.agents/skills/wl-skills-kit/SKILL.md`。
- 首条进度应展示真实 `notice.summary`（旧版 `notice`），交付用 `pnpm exec wl-skills status --run-id <runId> --json` 核对执行与待检查项；自动选择取决于宿主，不能据安装承诺每次隐式任务都会触发。

`doctor-host` 的 `discoveryCoverage` 会并列展示当前项目五包的安装版本、原生入口候选、需复核项与缺失入口。候选表示元数据可解析；本地修改、执行器版本、宿主加载和真实执行分别核验，未接入的兄弟包不会自动安装。

同时使用多个宿主时，在项目 `wlSkills.hosts` 或安装命令 `--hosts codex,claude,zcode` 中明确选择实际宿主；模型名不参与目录选择。五包各保留一个任务网关，具体 Skill 按需读取，不复制整套技能到每个编辑器。Qoder 使用 `.qoder/skills` 原生目录；Trae 当前仅核实规则引导和手动导入，不把 `.agents` 文件存在当作原生发现成功。

四个 MCP 服务会先显示简短中文调用回执，保留实际 `runId`、工具名与执行/验证状态；部分验证会说明未完成原因。机器调用方优先读取 `structuredContent`，兼容 JSON 保留在后续文本块，不再固定对 `content[0].text` 做 `JSON.parse`。仅工具返回、计划建立、检查通过分别展示；没有关联检查记录时明确说明。

ZCode 用户请使用 `--host zcode`，打开实际项目，在 Settings → Skills 刷新并核对启用；仍未出现时用新会话验证。ZCode 不会递归发现所有子项目，也不会合并子项目 AGENTS；不要为显示五包而复制同名入口。每包说明应把具体用途放在前 250 字符，超 1024 字符会被丢弃。显式选择和自然语言自动选择共用技能清单，自动选择还受元数据预算、当前 Agent 的工具开关与任务匹配影响。[官方技能说明](https://zcode.z.ai/en/docs/skill)

## 快速开始

在**实际业务项目根目录**操作，沿用项目包管理器。以下以 pnpm 为例。

### 1. 安装本地工具并初始化

```bash
pnpm add -D -E @agile-team/wl-skills-kit@latest
pnpm exec wl-skills init
```

默认使用 `compact`：规范、Skill、模板和适配逻辑留在 npm 包，只生成所选宿主的简短入口；清单、运行记录和缓存集中到 `.wl-skills/state/kit/`。已有项目内容按受管归属保护。

五包共用项目 `package.json` 的 `wlSkills` 配置，例如 `{"schemaVersion":1,"integration":"compact","hosts":["codex","zcode","kilo"],"mcp":false}`。没有 package.json 时使用 `.wl-skills/config.json`，不额外创建 npm 项目。CLI `--hosts` 优先，兼容 `--editor`；配置优先于已记录选择，不通过已有编辑器目录扩大宿主。上述三个宿主共用一个 `.agents/skills` 入口。

`init --hosts claude,cline` 按所选宿主生成入口；`--mcp` 才生成支持的 MCP 配置和本地凭据模板。需要把参考资源落到项目时，显式使用 `--integration expanded`。旧 `.windsurfrules`、`.cursorrules` 和逐技能多份副本退出默认输出；Windsurf 名称按 Devin Desktop 兼容识别。

MCP 按所选宿主生成项目原生配置：Codex 使用 `.codex/config.toml`，ZCode 使用 `.zcode/config.json`（复用已存在且有效的 `.agents/mcp.json` 回退配置），Kilo 复用唯一的现有配置或创建 `.kilo/kilo.jsonc`，Copilot 使用 `.mcp.json` 或已有 `.vscode/mcp.json`。Claude、Cursor、Kiro、Roo 使用各自已验证的项目配置。Cline 等尚无已验证项目配置契约的宿主显示手动接入诊断，不写猜测路径。只生成选中宿主的配置，不默认复制全部适配文件。

未显式选择宿主且没有项目配置或历史选择时，默认 `codex`。共用的 `.agents/skills` 可供兼容宿主发现技能；需要 ZCode MCP 时明确使用 `--hosts zcode --mcp`，技能目录兼容不代表已经生成该宿主的 MCP 配置。

启动参数使用项目本地 MCP 脚本的绝对路径，并设置 `WL_PROJECT_ROOT`，不依赖宿主启动目录或在线 npx。项目仍须安装本包依赖；`check` 按实际配置内容区分缺失、禁用、启动参数不同和运行依赖缺失，连接状态始终保留“未验证”。`update --no-mcp`、切换宿主和 `clean` 仅撤销本包未修改节点；同名外来服务及用户修改保留，`--force` 不覆盖这些内容。归属在 `managedMcp` 中记录，旧 `managedJson` 节点会迁移，初始化、更新和清理的写入失败恢复事务前文件与清单。

升级会预检配置、路径和所有权，再执行可回滚写入；仅退休本包拥有且未修改的文件或区块。用户规则、凭据、业务契约、报告与其他包的内容保留，`--dry-run` 可预览。`--force` 不授权删除已修改的退休入口。

### 2. 检查接入并完成首扫

```bash
pnpm exec wl-skills check
pnpm exec wl-skills validate --typecheck
```

`check` 看安装、工具链、MCP 与 Hook 配置；`validate` 看实际页面问题。类型检查需要项目已安装并配置 `vue-tsc` 或 `tsc`。

预提交按暂存页面及其本地静态依赖检查相关字典模块。修改字典或来源契约时校验模块完整引用闭包，明确的共享字典引用也独立检查。普通共享文件沿用页面跳过约定，`validate` 全量检查继续覆盖所选范围。

`diff` 与正常更新共用编辑器配置生成入口，生成失败会终止规划。正常更新继续按受管归属保留团队指令、外来区块与本地修改。

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

菜单、字典、角色与权限能力按任务目录的 `domain` / `baselinePolicy` 判定，不要求纯后端操作运行页面 `validate`；任务同时修改页面时仍保留页面检查。支持“批量创建 10 个菜单”“新增三个字典”等数量表达；明确禁止的动作不参与匹配。

后端任务将查询、预览、应用、回查分别记录为 `backend-query` / `backend-preview` / `backend-apply` / `backend-postverify`，MCP `_meta.wlExecution.backend` 与 status 工具摘要显示实际阶段。新写入任务首先要求预览；后续应用仍须原有确认标记与同一 `planHash`。预览不等于确认或写入，写入成功也不等于回查通过。纯后端阶段不冒充源码规则验证通过。

旧 `backend-preview-and-confirmation` 检查兼容读取；只有同一 runId 内存在相同工具、相同 planHash 的真实预览，并收到确认后的成功应用结果，才生成兼容完成事实。未知响应、查询或仅预览都不会完成旧检查。项目业务写入与生产环境护栏保持原有约定。

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

后端写入与外部报告推送须核对具体计划并确认；生产写入默认阻断。项目连接凭据放在被忽略的 `.wl-skills/config/kit-sync.local.json`，兼容读取旧 `.wl-skills/skills/sync/env.local.json`，不提交仓库。

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

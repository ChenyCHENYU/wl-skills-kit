# @agile-team/wl-skills-kit

**AI Skill 模板包 v2.13.1** — 一键将 14 条规范、12 个 AI Skill、21 个 MCP Tool、独立 API 契约、编辑器配置和文档导入 Vue 3 项目。

让 AI 编辑器（Copilot / Cursor / Windsurf / Claude Code / Cline / Kiro / Trae / Qoder / 通用 Agents）**真正理解项目规范**，从原型/详设到完整页面代码全流程自动化。

---

## TL;DR

```bash
pnpm dlx @robot-admin/git-standards init      # 工程化前置（必须）
pnpm dlx @agile-team/wl-skills-kit            # 安装 AI 体系
pnpm standards:init                           # 本包维护/业务项目均可复用的规范插件入口
# 在 AI 对话中：
"扫描 docs/prototypes/ 下的原型生成页面清单"
"基于上一步生成所有 api.md，再 codegen 出页面"
```

> 可选桥接：如业务项目也需要统一 UI 风格、老系统化妆层和 UI 扫描修复，可单独安装 `@agile-team/wl-skills-ui`。两包职责独立，不互相强依赖：`wl-skills-kit` 负责编码规范/页面生成/菜单字典权限，`wl-skills-ui` 负责视觉一致性/设计令牌/化妆层/Runtime 渲染。

> 包管理策略：本仓库维护链路 **pnpm-first**，使用 `pnpm-lock.yaml`、`pnpm verify`、`pnpm ci`；npm 只用于 `npm pack` / `npm publish` 发版环节，不提交 `package-lock.json` 和 npm token。

### 独立使用与前后端配套

kit 不依赖 design 或 bd 的产物才能工作。只有需求文档时，可先建立本项目契约：

```bash
# 默认只预览，不写文件
wl-skills contract init --contract-id mdm-task --service mdm --resource mdmTask \
  --module task --permission-prefix mdm_task --output contracts/mdm-task.json

# 确认写入，补齐字段/操作后将 contractStatus 改为 confirmed
wl-skills contract init ... --output contracts/mdm-task.json --confirm
wl-skills contract validate --input contracts/mdm-task.json --strict

# 后端契约存在时做完整握手
wl-skills contract compare --left contracts/mdm-task.json \
  --right contracts/mdm-task.backend-contract.json --strict
```

默认 profile 内置在包内，不需要联网或引用其他包。使用 design 时，页面 `externalId` 可选映射 `screen.id`；没有 design 时使用当前契约自己的 `pageId/contractId` 即可。

---

## 版本亮点

**v2.13.0**：前端独立闭环与后端天然兼容。

- **独立契约**：只有已评审需求也能用 `wl-skills contract init/validate/render` 建立前端 API 契约，不要求安装 design 或 bd。
- **严格握手**：有后端 manifest 时使用 `contract compare --strict` 比较 Profile、资源、transport、标准/扩展操作、model、API_CONFIG、permission、revision 和 completion，不再只比较 URL 文本。
- **统一 profile**：默认 `jh4j3-openapi3@1.0`；自定义 profile 和扩展操作仍允许，但偏差必须显式。
- **稳定门禁**：Windows Node 24 下的 CLI 黑盒回归按单 worker 顺序运行，避免同步子进程争用导致 Vitest RPC 假失败；断言与覆盖范围不减。
- **规格硬门**：page-spec 支持完整表单区块、子表、features、稳定 pageId、profile 和 openQuestions；严格模式阻断未决问题及占位交互。
- **质量稳定**：Vitest 超时按 Windows 多进程实际开销显式配置，消除固定 5 秒造成的非功能性失败。

**v2.12.6**：复杂度、MCP 写入安全和工程门禁完成系统治理。

- **复杂度清零**：原有 40 个告警全部消除，圈复杂度上限 10 升级为 error，ESLint 固定零告警。
- **写入快照确认**：菜单、角色、动作和角色授权统一使用线上快照 `planHash`，漂移时零写入。
- **工程基线升级**：最低 Node.js 22，CI 覆盖 Linux Node 22/24 与 Windows Node 24，并补齐发布检查和结构化契约测试。

**v2.12.5**：字典生成、聚合、全量协调和旧项目迁移形成安全闭环。

- **项目级全量协调**：自动发现全部模块 `dicts.ts`，统一比对线上并只补缺失项；单模块继续使用同一引擎。
- **旧项目灵活适配**：有 `api.md dict-contract` 可 bootstrap 本地契约；没有结构化契约时只盘点候选，不猜值上传。
- **无覆盖发布**：正式执行必须携带预览 `planHash`；冲突或漂移全局阻断，线上额外项不覆盖、不删除，失败后可幂等补齐。
- **统一写入闭环**：菜单、角色、动作和角色全量授权同样执行“线上快照预览 → `planHash` 确认 → 执行前重读”；旧计划失效时零写入。

**v2.12.4**：存量项目升级入口收口。

- **自动清理旧 Skill**：`update` 会移除旧 `skills/ops/env-config/`，避免与 `standard-env-config` 并存。
- **提示词更直接**：README 和使用指南补齐存量项目升级命令、最短提示词及自定义 Profile 表达。

**v2.12.3**：标准环境配置能力重构并完成真实存量项目验证。

- **独立标准能力**：新增 `standard-env-config` Skill、`standard-env` CLI 和 3 个 `wls_standard_env_*` MCP Tool，旧 `env` 写入口停用。
- **统一工程结构**：存量 Vite 子应用可迁移为单 `.env`、五环境、三开发模式和模块化配置，华新与自定义环境均需显式选择完整 Profile。
- **闭环防护**：默认只读或 dry-run，模块冲突阻断、事务备份、secret 脱敏、静态验证、五环境临时构建和二次 no-op 均已覆盖。

**v2.12.2**：前端环境迁移补齐 Vite 配置硬编码治理。

- **Vite 配置迁移**：`env-config` 现在会在 dry-run 报告中列出可安全迁移的 `vite.config.*`、`public/env-dev.json`，正式确认后与 `.env.*` 一起备份写入。
- **客户环境互切**：Profile 支持 `baseUrls` + `proxyPrefixes` 简写，适配 172、华新、其他客户环境互切，服务前缀保持 `sit-api` / `uat-api` / `pre-api` / `prod-api` / `prd-api` 规则。
- **可控关闭**：特殊项目可用 `--no-migrate-vite` 或 MCP `migrateViteConfig: false` 只处理 env 文件。

**v2.12.1**：补齐前端环境配置使用文档。

- **README 快速入口**：新增“前端环境配置怎么用”，覆盖 scan / dry-run / apply、MCP 调用、自定义客户 Profile 和报告位置。
- **env-config 使用手册**：补齐新项目初始化、172/旧客户迁移、生产前缀差异、团队评审与安全边界，方便团队按同一套流程落地。

**v2.12.0**：前端环境配置标准化能力。

- **新增 `env-config` Skill**：面向前端项目的 4/5 套环境标准化、客户迁移、172 地址迁移、baseURL 与 `/api` / `sit-api` / `uat-api` / `prod-api` / `prd-api` 梳理。
- **新增 `wl-skills env` CLI**：`env scan` 只读扫描，`env apply` 默认 dry-run，`env apply --apply` 才写入前端 env 文件并自动备份。
- **新增 `wls_env_scan` / `wls_env_apply` MCP Tool**：纯本地工具，不需要 token，不读取后端配置；`apply` 必须显式 `confirmApply: true` 才会写文件。

**v2.11.11**：MCP 稳定性与文档一致性补丁。
- **统一 `.wl-skills` 优先路径**：菜单/审计报告和 MCP 环境配置统一优先读取 `.wl-skills/`，旧 `.github/` 仅作兼容兜底。
- **角色授权全量覆盖护栏**：`wls_role_assign_menus` 必须显式传 `confirmFullReplace: true`，防止只传新增菜单导致覆盖已有授权。
- **文档去旧口径**：同步 14 条规范、字典三层模型、token 占位示例和 Agent Pipeline 风险说明。

**v2.11.10**：业务字典 MCP 三层同步闭环。

- **新增 `getPermissionMenuTree` 链路**：菜单同步工具（`wls_menu_query` / `wls_menu_sync_from_report`）在 `domainId` 缺失时自动反推，仅需 `token` + `sysAppNo` 即可倒推出 `domainId` / `parentMenuId` / `sysAppNo`，不再需要用户手动从 Network 面板抄取。已用主数据管理应用域真实接口验证通过

**v2.11.8**：属性权威源升级。

- **props.ts 标注为最权威属性源**：`lib/*.d.ts` 的 `ExtractPropTypes` 会漏掉运行时注入属性（如 user-picker 26 个属性在 .d.ts 里是空 `{}`），而 `schema-component/{group}/{name}/props.ts` 是设计器全量属性清单。在线索引 + copilot 三级优先级标注

**v2.11.7**：组件 API 在线查询机制。

- **新增在线查询索引**（`component-online-index.md`）：35 个组件名称→在线路径映射，AI 遇到 kit 未收录组件或 API 不确定时，主动 webfetch 在线文档获取权威用法，不再靠猜
- 三层保障：kit 精简参考（11 个）→ 在线完整文档（35 个）→ common-core/lib 声明最终仲裁
- copilot-instructions + 标准 13 增补在线查询入口

**v2.11.6**：与 `@agile-team/wl-skills-ui`（原 `wk-skills-ui`，已改名）对齐 + 平台包职责澄清。

- **全仓库 `wk-skills-ui` 旧名漂移清零（17 文件）**：6 个页面生成模板的 `import` 原写 `wk-skills-ui`（会生成无法 import 的业务代码）、`doctor-ui`/MCP 接入检测原查 `wk-skills-ui`（对真实包永远检测不到），全部改为 `wl-skills-ui` 并兼容新旧名
- **jh-* 组件归属错误修正**：`jh-drag-row`/`jh-drag-col` 来自 `@jhlc/common-core`，非 `@jhlc/jh-ui`（后者是纯 SCSS 包，零组件）。澄清两平台包职责：**common-core = 全部 `jh-*`/`Base*`/`C_*` 组件 + 运行时；jh-ui = 设计令牌 + Element Plus/Vant 主题覆盖**
- **jh-* 组件文档逐属性勘误（7 篇）**：基于 `common-core/lib/*Component.d.ts` 真实声明核对，修正 `pickerType`/`multiple`/`disabled`/`change`/`background`/`placeholder` 等多处虚构/不存在的 API 与 `enums→SelectComponent` 映射错误

**v2.11.3**：确定性闭环再加固 —— 编码最佳实践从"文档约定"接线到执行器，特殊场景豁免可配置。

- **新增 R13 圈复杂度执行器（standard 04）**：对每个函数计 McCabe 圈复杂度（与 ESLint `complexity` 一致），`>10` 报 error 阻断；补"降复杂度手法"示例
- **新增 R14 类型错误零容忍（standard 09 升级为 🔴必遵）**：委托 `vue-tsc/tsc --noEmit` 解析 TS error，`validate --typecheck` / MCP `typecheck:true` 触发，无 checker 优雅降级；ESLint 管风格、R14 管正确性，职责分离
- **新增 validate 项目级豁免配置**：`.wl-skills-validate.json` 对表单设计器/行内编辑明细表等 BaseTable 受限场景批量豁免 R3/R10，零功能影响（kit 不主动创建）；与单文件注释豁免互补

**v2.11.1**：精准卡控闭环 —— 把"约定"接线到确定性执行器，生成即精准。

- **新增 page-spec 落盘 + spec-align 确定性比对（S1~S5）**：`page-codegen` 生成页面时同步写出 `page-spec.json`（原型约定真值），`validate` 用 AST 解析 `data.ts` 的 `queryDef/columnsDef/toolbarDef` 与之逐项比对——查询字段顺序、表格列顺序、工具栏按钮顺序与颜色、操作列按钮集合、label 文字保真。过去只靠 AI 自觉的 6 条"精准实现"约定，现在变成可阻断的硬卡控
- **新增 `wl-skills fix` 确定性机械修复**：对幂等、零语义判断的偏差（BaseTable 补 `render-type`、`::v-deep`→`:deep()`、行尾空白、文件末尾换行）做确定性自动修复，AI 只处理需语义判断的部分；`--dry-run` 预览
- **新增「规则 → 执行器」覆盖矩阵治理**：`kit-internal/rule-coverage.md` 登记每条约定由谁兜底（R*/S*/regex/AI），`lint:skills` 校验标记「阻断」的规则必须有真实执行器，杜绝"文档约定"退化为纯文档
- **修复 v2.11 目录迁移遗留**：`lint-skills.js` / `verify-version.js` / `sync-version.js` 的 `.github/` 路径全部修正为 `.wl-skills/`，CI 自检链路恢复可用

**v2.8.0**：Mock 架构体系固化 + `mock-clean` CLI 命令。

- 新增 `docs/mock-architecture.md` — Mock 目录约定、开关机制、模块化规范、一键清理流程
- 新增 `mock/_utils.ts` 种子文件 — `init` 自动写入，提供 `pageResult`/`ok`/`paginate`/`nowStr`/`pick`
- 新增 CLI `mock-clean` 命令 — `--domain <name>` 按域清理、`--all` 全量清理（保留 `_utils.ts`）、`--dry-run` 预览
- `copilot-instructions.md` 新增 Mock 架构节（目录约定、开关、STORE 模式、URL 对齐）
- `page-codegen/SKILL.md` 规则 9/20/21 修正为按域分目录 + 强制引用 `_utils`
- `validate` 增强：检查 `_utils.ts` 存在、mock 文件是否按域分目录、是否引用共享工具

**v2.7.3**：工程质量提升 — MCP tools 单测覆盖、lint-skills 扩展到 core Skill、.gitattributes 消除行尾符噪音、permission-sync SKILL.md 精简。

- 新增 `tests/mcp-tools.test.js`（30 个测试）覆盖 menuSync/dictSync/permissionSync 核心纯函数与参数校验
- `lint-skills` 新增 core/ops SKILL.md 规则：有写操作 Skill 必须含 Pre-flight + standards 引用
- 新增 `.gitattributes` 统一 LF 行尾，消除 Windows 开发者提交噪音
- `permission-sync/SKILL.md` 压缩 275 → 240 行，命名规范表与报告示例精简

**v2.7.2**：sync 类 Skill 自愈闭环 + 场景索引路由。

- 新增 `skills/_best-practices.md` 场景索引（AI 每轮默认加载，弱化关键词命中）
- 新增 `skills/sync/_mcp-guardrail.md` 公共护栏（含 L0~L4 错误自愈剧本，MCP 失败时引导用户完善 `env.local.json` 而不是绕开自拼 HTTP）
- 修复 `dict-sync/SKILL.md` 旧版残留与错路径；统一 `menu-sync/USAGE.md` 字段命名
- MCP server 启动 banner（stderr，不污染 JSON-RPC）；client.js 401/4004 友好提示
- 新增 `pnpm lint:skills` 静态护栏，已串入 `prepublishOnly`

**v2.7.1**：JH 组件文档全面修正，基于 `@jhlc/common-core` 源码校准 Props/API/映射规则。

- 修正 `jh-drag-row` 6 个缺失 Props、`jh-date`/`jh-date-range` format 命名
- 补充 `defaultValue` 日期范围预设表、`BusLogicDataType` 组件映射表
- 新增 `jh-textarea.md`、`FormDialog` 编程式附件上传文档
- `page-query-hook-best-practices.md` 全面修正方法名（`select()` / `queryDef()` 等）

**v2.7.0**：一致性治理与可测性升级，安全防护加固。

- **CLI 未知 flag / 命令防护**：`pnpm dlx @agile-team/wl-skills-kit --version` 等未识别参数不再默认走 `init` 误装，而是退出非零并提示
- **MCP Tool auto-discovery**：新增 `mcp/registry.js`，17 个 Tool 描述符集中维护；`mcp/server.js` 从 496 行瘦身到 130 行，新增 Tool 仅改 registry
- **版本一致性自检**：`pnpm version:verify` 跨文件校验版本 + Skill 计数；`prepublishOnly` 在 `npm publish` 前自动运行它与 `vitest`，不一致则阻断发版
- **单元测试**：registry / CLI / version-tools 共 18 项覆盖，上面三项防护都有连动验证
- **单一数据源加固**：`SKILL_COUNT` 从常量改为从 `_registry.md` 动态计算；copilot-instructions 删除内嵌 Skill 表改为指针；dict-sync / code-fix 补 USAGE.md

2.6.x 以来重点补齐业务理解闭环：原型/详设 → 业务文档 → 接口契约 → 页面代码 → 复扫。

- **新增 `business-doc-extract` Skill**：语义级智能触发（不依赖固定关键词），在资料达模块/项目级完整度时建议生成业务文档：
  ```text
  docs/business/
  ├── index.md                # 项目业务全景 + 模块索引
  ├── open-questions.md       # 全局待确认问题汇总
  └── 0X-<module>/
      ├── index.md            # 模块全景 + 页面/API 索引
      ├── requirement.md      # 需求理解 + 流程 + 页面清单 + 模块待确认
      ├── dictionary.md       # 字典枚举
      └── field.md            # 字段清单
  ```
  碎片化问答、单截图、小修小改默认不触发，不污染轻量路径。页面级 `api.md` 仍然住页面目录，模块 `index.md` 只做链接索引。
- `init/update/diff/clean/check/validate/validate-page/doctor-ui/export` 覆盖安装、升级、对比、清理、体检、页面完整性检查、UI 接入诊断和基线导出
- 页面模板升级为 `BaseTable + render-type="agGrid" + cid + defineColumns + renderOps` 最终标准，融合 `wl-skills-ui` runtime，但保留 `common-core` 平台骨架
- 新增 `doctor-ui` / `validate-page`：检查 `wl-skills-ui` 接入、AGGrid/cid、操作列、mock-first、api.md 等关键偏差
- **`prototype-scan` Skill 补齐 Axure 访问前置说明**：明确 `index.html` 永久不可用（VS Code 内嵌 Chromium 不加载用户 Chrome 扩展），只能用 `open_browser_page(具体页.html)` 或 `read_file`；`(not visible)` 不等于不可访问
- **`page-codegen` Skill 统一隐藏页导航为 `navigateHidden` 主路**：懒注册 + router.push 无整页刷新，内部自动兜底防白屏；外部调用禁止直接 `location.href`，新增页面生成摘要步骤强提醒维护 `HIDDEN_ROUTE_MAP`
- 增强 Intent Router：用户只需说“做个页面 / 先 mock / 菜单同步 / 风格不生效”，AI 自动识别触发 Skill/MCP
- manifest 记录安装文件哈希，`reports/`、`src/components/`、`src/types/` 等关键资产受到保护
- 自动生成 Copilot、Claude Code、Cursor、Windsurf、Cline、Kiro、Trae、Qoder、通用 Agents 规则文件
- 内置 MCP Server，支持菜单、字典、权限和项目感知类工具
- 接入 `@robot-admin/git-standards`，仓库维护和业务项目可共用 lint、commitlint、husky、commitizen
- 可选桥接 `@agile-team/wl-skills-ui`：kit 负责页面/规范/菜单字典权限，wl-skills-ui 负责 UI 风格/化妆层/Runtime

---

## 这个包到底干什么？

```
原型/口述需求
    │
    ▼ [Skill: prototype-scan]          ← 可跳过（直接口述需求时）
《页面清单》(reports/PROTOTYPE_SCAN_*.md)
    │
    ▼ [Skill: business-doc-extract]    ← 可选，资料达模块级时建议走
docs/business/0X-xx/{index,requirement,dictionary,field}.md
    │
    ▼ [Skill: api-contract]
api.md（页面级前后端契约）
    │
    ▼ [Skill: page-codegen]
data.ts + index.vue + index.scss（14 条 standards 自动满足）
    │
    ▼ [Skill: convention-audit]        ← 也可对存量代码单独触发
reports/AUDIT_AI_*.md + AUDIT_HUMAN_*.md
    │
    ├─▶ [Skill: menu-sync]             ← 可单独运行
    │   线上菜单注册完毕，UI 可访问
    │
    └─▶ [Skill: dict-sync]             ← 可单独运行，与 menu-sync 互不依赖
        线上字典同步完毕
```

> **灵活组合原则**：每个 Skill 都可以单独触发，也可以串联使用。哪一步结果不满意，重跑哪步即可，不需要从头来过。

---

## ⚠️ 仓库结构 vs 业务项目安装结构（**必看**）

`wl-skills-kit` 是一个 **npm 模板包**：仓库本身的结构 ≠ 你 `npx` 之后业务项目里看到的结构。两者**严格区分**：

### A. 本仓库结构（开发/维护 wl-skills-kit 时）

```
wl-skills-kit/                            ← 你正看的这个仓库
├── README.md                             本文档（业务方 + 维护者都看）
├── CHANGELOG.md
├── package.json                          name: @agile-team/wl-skills-kit
│
├── bin/
│   └── wl-skills.js                      CLI 实现（init / update / clean / check / diff / validate / validate-page / fix / doctor-ui / export / mock-clean）
│
├── files/                                ★★★ 真正会被打包并复制到业务项目的内容 ★★★
│   ├── .wl-skills/                       统一隔离目录（所有 Skill/规范/指南/报告/模板）
│   │   ├── copilot-instructions-full.md  AI 主入口完整指令（业务项目根另有薄壳）
│   │   ├── standards/                    14 条规范
│   │   ├── skills/                       Skill 目录（含 _compat/ 多编辑器适配源）
│   │   ├── guides/                       人读指南
│   │   └── reports/                      领域基线模板（菜单/字典/权限）
│   ├── docs/                             组件 API 文档 + Mock 架构规范
│   ├── mock/                             Mock 共享工具种子（_utils.ts）
│   └── demo/                             领域样例
│
├── kit-internal/                         ★★ 仅仓库可见，不会安装到业务项目 ★★
│   ├── README.md                         维护者首页
│   ├── architecture.md                   架构总览
│   ├── CONTRIBUTING.md                   贡献流程
│   ├── standards.MAINTAIN.md             standards 维护要点
│   ├── templates.MAINTAIN.md             templates 维护要点
│   ├── jenkins-pipeline.md               Jenkins CI 参考模板（不强加业务项目）
│   ├── skills/                           各 Skill 的 *.MAINTAIN.md
│   └── history/                          归档：旧版 ARCHITECTURE-PLAN 等
│
└── .npmignore                            排除 kit-internal/ 等不发布的内容
```

> **维护准则**：
>
> - 业务规范要改 → 改 `files/.wl-skills/standards/*.md`
> - Skill 流程要改 → 改 `files/.wl-skills/skills/<scope>/<name>/SKILL.md`
> - 多 AI 编辑器适配要改 → 改 `files/.wl-skills/skills/_compat/`（**不是**改业务项目里的根配置文件）
> - 维护文档要写 → 进 `kit-internal/`（不会污染业务项目）

### B. 业务项目结构（执行 `pnpm dlx @agile-team/wl-skills-kit` 之后）

```
你的业务项目/
│
├── .wl-skills/                           ← 来自本包 files/.wl-skills/（统一隔离）
│   ├── copilot-instructions-full.md      Copilot 完整指令
│   ├── standards/                        14 条模块化规范 + index.md 门控
│   │   ├── 01-toolchain.md
│   │   ├── 02-code-structure.md
│   │   ├── ... (共 14 条)
│   │   └── 14-layout-containers.md
│   ├── skills/                           12 个启用 Skill（全部激活）
│   │   ├── _registry.md                  ★ 触发词 → SKILL 路径单一数据源
│   │   ├── _compat/                      多 AI 编辑器适配（配置 + headers）
│   │   ├── core/                         核心通用 Skill
│   │   │   ├── prototype-scan/   { SKILL.md, USAGE.md }
│   │   │   ├── spec-doc-parse/   { SKILL.md, USAGE.md }
│   │   │   ├── api-contract/     { SKILL.md, USAGE.md }
│   │   │   ├── page-codegen/     { SKILL.md, USAGE.md, templates/ }
│   │   │   ├── convention-audit/ { SKILL.md, USAGE.md }
│   │   │   ├── business-doc-extract/ { SKILL.md, USAGE.md, templates/ }
│   │   │   └── template-extract/ { SKILL.md, USAGE.md }
│   │   ├── sync/                         数据同步类
│   │   │   ├── menu-sync/        { SKILL.md, USAGE.md, env/ }
│   │   │   ├── dict-sync/        { SKILL.md }  已启用
│   │   │   └── permission-sync/  { SKILL.md, USAGE.md }  已启用（角色+授权+动作+permission 字段）
│   │   ├── ops/                          运维类
│   │   │   ├── code-fix/         { SKILL.md }  已启用
│   │   │   └── standard-env-config/ { SKILL.md, USAGE.md }  已启用
│   │   └── domain/                       领域专属（按需创建）
│   ├── guides/                           人读指南（usage.md / architecture.md）
│   ├── docs/                             组件 API 文档 + validate 豁免配置说明
│   └── reports/                          AI 生成报告（追加不覆盖）
│       ├── SYS_MENU_INFO.md              线上菜单基线
│       ├── SYS_DICT_INFO.md              线上字典基线
│       ├── SYS_PERMISSION_INFO.md        线上权限基线
│       └── AUDIT_*.md / PAGE_CODEGEN_*.md / ...   （随用随生成）
│
├── 多 AI 编辑器配置（解耦：可单独删除任意一个不影响其他）
├── CLAUDE.md                             Claude Code
├── AGENTS.md                             通用 Agents
├── .cursorrules                          Cursor 旧版
├── .cursor/rules/conventions.mdc         Cursor 新版（含 mdc frontmatter）
├── .windsurfrules                        Windsurf
├── .clinerules                           Cline
├── .kiro/steering/conventions.md         Kiro（含 inclusion frontmatter）
├── .trae/rules/conventions.md            Trae（含 alwaysApply frontmatter）
├── .qoder/rules/conventions.md           Qoder
│
├── .wl-skills-validate.json              ← 可选：validate 项目级豁免配置（kit 不创建）
├── mock/                                 ← 来自本包 files/mock/（init 自动写入）
│   ├── _utils.ts                         共享工具（pageResult / ok / paginate / nowStr / pick）
│   └── [业务域]/[模块].ts               按域分目录，page-codegen 自动生成
│
├── docs/                                 组件 API 文档 + mock-architecture.md
├── demo/                                 领域样例
└── src/
    ├── components/                       全局/局部/远程组件
    └── types/                            类型桶文件
```

> **业务项目方准则**：
>
> - 主入口是 `.wl-skills/copilot-instructions-full.md`（Copilot 用），业务项目根的薄壳文件指向它；**其他根配置文件是它的拷贝 + 各自特化 frontmatter**
> - 修改规范 → **不要**改业务项目里的副本，**升级 wl-skills-kit 包 + `update`** 才不会被覆盖
> - reports/ 里的内容是团队累积数据，`update` 不会覆盖，可放心 commit

---

## CLI 命令

所有命令默认作用于当前工作目录；如需先预览，请加 `--dry-run`。

```bash
# 全量安装（默认）
pnpm dlx @agile-team/wl-skills-kit

# 增量更新（仅覆盖有变化的文件，自动保护 reports/）
pnpm dlx @agile-team/wl-skills-kit update

# 环境预检（Node / 工具链 / MCP 配置 / manifest）
pnpm dlx @agile-team/wl-skills-kit check

# 对比已安装文件与当前 kit 版本差异
pnpm dlx @agile-team/wl-skills-kit diff

# 静态检查 src/views 页面文件完整性 + AGGrid/cid/skills-ui/mock
# 内含 AST 语义级检测 R1~R14（正则覆盖不到的语义约束）
# R13 圈复杂度 / R14 类型错误需 --typecheck 开启
pnpm dlx @agile-team/wl-skills-kit validate

# 含类型检查 R14（vue-tsc/tsc --noEmit，CI / 发版前用）
pnpm dlx @agile-team/wl-skills-kit validate --typecheck --strict

# 单页/指定目录校验
pnpm dlx @agile-team/wl-skills-kit validate-page src/views/mdata/model/mdata-model-config

# 特殊场景（表单设计器/行内编辑明细表等 BaseTable 受限）批量豁免 R3/R10：
# 在项目根创建 .wl-skills-validate.json（详见 .wl-skills/docs/validate-exempt.md）

# spec-align：页面目录存在 page-spec.json 时，确定性比对"约定 vs 代码"
# （查询字段/表格列顺序、工具栏按钮顺序与颜色、操作列严格对应、label 保真）
# 已内置于 validate，无需额外参数

# 确定性机械修复（缺 render-type、::v-deep→:deep、行尾空白等，幂等安全）
pnpm dlx @agile-team/wl-skills-kit fix
pnpm dlx @agile-team/wl-skills-kit fix --dry-run

# 检查 wl-skills-ui 是否真正接入
pnpm dlx @agile-team/wl-skills-kit doctor-ui

# 导出菜单/字典/权限基线为 xlsx
pnpm dlx @agile-team/wl-skills-kit export

# 构建前清理（保留 src/components + src/types）
pnpm dlx @agile-team/wl-skills-kit clean

# 清理但保留 reports/（菜单/字典/权限累积数据）
pnpm dlx @agile-team/wl-skills-kit clean --keep-reports

# 清理指定业务域的 mock 文件（保留 _utils.ts）
pnpm dlx @agile-team/wl-skills-kit mock-clean --domain mdata

# 清理全部 mock（保留 _utils.ts）
pnpm dlx @agile-team/wl-skills-kit mock-clean --all

# 标准环境配置：扫描、计划、确认迁移、五环境验证
pnpm dlx @agile-team/wl-skills-kit standard-env scan
pnpm dlx @agile-team/wl-skills-kit standard-env plan --profile walsin --module-name safe
pnpm dlx @agile-team/wl-skills-kit standard-env apply --profile walsin --module-name safe --confirm
pnpm dlx @agile-team/wl-skills-kit standard-env verify --profile walsin --build

# 任何命令都可加 --dry-run 预览
pnpm dlx @agile-team/wl-skills-kit update --dry-run
```

> 全局安装后也可直接用 `wl-skills` 命令（如 `wl-skills update`）。

---

## 标准环境配置怎么用

`standard-env-config` 面向存量 Vue/Vite 子应用，将旧网关或 `172 + 9000` 直连配置迁移为与当前模板一致的结构：一个公共 `.env`、`dev/sit/uat/pre/prd` 五套环境、远程/本地后端/public 本地联调三种模式，以及模块化 `vite/config/*.ts`。它不处理业务代码和后端配置。

存量项目先升级 Skill，`update` 会自动移除旧 `env-config`：

```bash
pnpm dlx @agile-team/wl-skills-kit@latest update
```

在 AI 对话中最短只需说：

```text
用标准环境配置能力检查并迁移当前项目，目标使用华新环境，先只生成计划，我确认后再修改并完整验证。
```

模块名或目标环境特殊时再补充：

```text
用 standard-env-config 迁移当前存量子应用，模块名是 safe，目标使用华新 Profile；先 scan 和 plan，不要直接写入，确认后 apply，最后完成五环境构建和二次 no-op。

目标不是华新，请使用 ./env-profile.customer.json 的完整五环境配置，其他流程不变。
```

推荐闭环：

```bash
# 1. 只读识别项目形态、模块名证据和旧地址
pnpm dlx @agile-team/wl-skills-kit standard-env scan

# 2. 显式选择目标环境并预览文件计划
pnpm dlx @agile-team/wl-skills-kit standard-env plan --profile walsin --module-name safe

# 3. 人工确认模块名、目标地址和增删文件后正式迁移
pnpm dlx @agile-team/wl-skills-kit standard-env apply --profile walsin --module-name safe --confirm

# 4. 静态验证；依赖已安装时再执行五环境临时构建
pnpm dlx @agile-team/wl-skills-kit standard-env verify --profile walsin
pnpm dlx @agile-team/wl-skills-kit standard-env verify --profile walsin --build
```

AI / MCP 使用同一安全边界：

```text
wls_standard_env_scan()
wls_standard_env_apply({ profile: "walsin", moduleName: "safe" })
wls_standard_env_apply({ profile: "walsin", moduleName: "safe", confirmApply: true })
wls_standard_env_verify({ profile: "walsin", runBuild: true })
```

华新地址不会静默写入。华新项目必须显式传 `--profile walsin`；其他客户、内网 IP 或不同端口使用 `--profile-file`，并完整提供五套 `webUrl + apiPrefix`。URL 支持 HTTP/HTTPS、域名、IP 和端口。

迁移后开发命令职责固定：`pnpm dev` 连接目标远程环境，`pnpm dev:local` 将 API 切到本地后端，`pnpm dev:public` 只将资源和基座联调切到本地 public。正式写入前自动备份，Git 项目放在 `.git/wl-skills/standard-env/`，非 Git 项目放在系统临时目录。

完整 Profile、代理范围和验收说明见 [标准环境配置使用指南](files/.wl-skills/skills/ops/standard-env-config/USAGE.md)。

---

## 生命周期文件

安装后会生成 `.wl-skills-manifest.json`，记录本次安装版本和文件哈希：

- `update`：对比 manifest 与包内文件，仅更新有变化的内容
- `diff`：查看当前项目与最新 kit 内容差异
- `clean`：按 manifest 清理 AI 辅助文件，默认保留 `src/components/` 和 `src/types/`
- `check`：检查 Node、MCP、manifest 和工程化配置

运行时最低要求 Node.js 22。仓库 CI 会在 Linux Node 22/24 与 Windows Node 24 上执行完整验证和打包验收。npm 发布只在 GitHub Release 正式发布后触发，并再次核对 Release tag、`package.json` 版本和全部质量门禁；仓库需在 npm 配置 Trusted Publisher，并为 `npm` environment 启用审批规则。

---

## MCP Tools 概览

| 类别     | Tools                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 菜单     | `wls_menu_query` / `wls_menu_upsert` / `wls_menu_sync_from_report`                                                                       |
| 字典     | `wls_dict_query` / `wls_dict_bootstrap` / `wls_dict_upsert`                                                                               |
| 权限     | `wls_role_query` / `wls_role_upsert` / `wls_assignable_menus_query` / `wls_role_assign_menus` / `wls_action_query` / `wls_action_upsert` |
| 环境     | `wls_standard_env_scan` / `wls_standard_env_apply` / `wls_standard_env_verify`                                                           |
| 项目感知 | `wls_code_scan` / `wls_route_check` / `wls_validate_page` / `wls_doctor_ui` / `wls_git_log_extract` / `wls_audit_report_push`            |

`wls_standard_env_scan`、`wls_standard_env_apply`、`wls_standard_env_verify`、`wls_code_scan`、`wls_route_check`、`wls_validate_page`、`wls_doctor_ui`、`wls_git_log_extract` 不依赖后端 token。其中所有 apply/upsert/sync 写工具默认只生成计划或预览，正式写入必须传对应确认参数。`environment=production` 或网关带明确生产标识时，后端写入默认阻断；审批后才可在本地显式开启 `allowProductionWrites`。

### 字典闭环与兼容模式

| 项目状态 | 推荐入口 | 行为 |
|---|---|---|
| 已有多个模块 `dicts.ts` | `wls_dict_upsert({ scope: "project" })` | 自动发现全部模块，统一预览并只补缺失项 |
| 只处理一个模块 | `wls_dict_upsert({ scope: "module", sourcePath })` | 使用同一差异和回查引擎局部执行 |
| 无 `dicts.ts`，但 `api.md` 有 `dict-contract` | `wls_dict_bootstrap({})` | 预览并聚合生成本地标准契约，不访问线上 |
| 无结构化 `api.md` | `wls_dict_bootstrap({})` | 仅列出 `logicValue/useDictOpts` 候选；先从需求补契约，不猜值上传 |

正式线上写入必须先取得预览 `planHash`：

```json
{
  "scope": "project",
  "confirmApply": true,
  "planHash": "<预览返回值>"
}
```

项目级策略固定为 `safe-additive`：完全一致的跳过，只新增缺失模块、字典和明细；名称、排序、value/label 或扩展字段漂移会阻断整个计划；线上额外项只报告，不覆盖、不删除。多请求中断返回已完成项，重新预览后可幂等补齐。

完整契约与状态机见 [字典契约](files/.wl-skills/docs/dictionary-contract.md) 和 [项目级字典协调](files/.wl-skills/docs/dictionary-reconcile.md)。

---

## 从早期版本升级

> **适用场景**：已安装 v1.x 或 v2.0 的业务项目，希望升级到当前版本。

```bash
# 执行增量更新即可
pnpm dlx @agile-team/wl-skills-kit update
```

`update` 命令会自动完成：

1. **写入新文件** — 新结构下的所有文件覆盖写入
2. **迁移清理** — 检测并移除旧版遗留文件（如 `skills/prototype-scan/`、`docs/menu-sync-design.md` 等），避免新旧路径并存产生歧义
3. **保护累积数据** — `reports/*.md` 已存在则跳过，团队累积的菜单/字典数据不丢失

> **本地配置保护**：模板位于 `.wl-skills/skills/sync/env.example.json`。`init` 只在缺失时创建 `env.local.json` 并写入 `.gitignore`；`update` 和 `clean` 均不覆盖、不删除该本地凭据文件。旧路径配置需人工合并一次到 `.wl-skills/skills/sync/env.local.json`。

---

## Skill 概览

| Skill              | 状态    | 路径                            | 核心用途                                    |
| ------------------ | ------- | ------------------------------- | ------------------------------------------- |
| `prototype-scan`   | ✅ 启用 | `skills/core/prototype-scan/`   | 原型线：Axure/截图/口述/非规范详设 → 页面清单 |
| `spec-doc-parse`   | ✅ 启用 | `skills/core/spec-doc-parse/`   | 规范线：wl-skills-design 标准说明书 → 页面清单 |
| `api-contract`     | ✅ 启用 | `skills/core/api-contract/`     | 生成 api.md 前后端契约                      |
| `page-codegen`     | ✅ 启用 | `skills/core/page-codegen/`     | 页面骨架生成 + 模板调度                     |
| `convention-audit` | ✅ 启用 | `skills/core/convention-audit/` | 14 条规范扫描 + 双报告                      |
| `business-doc-extract` | ✅ 启用 | `skills/core/business-doc-extract/` | 语义触发，业务文档抽取与维护            |
| `template-extract` | ✅ 启用 | `skills/core/template-extract/` | 现有页面 → 领域模板                         |
| `menu-sync`        | ✅ 启用 | `skills/sync/menu-sync/`        | 菜单基线 ↔ 后端接口                         |
| `dict-sync`        | ✅ 启用 | `skills/sync/dict-sync/`        | 字典基线 ↔ 后端接口                         |
| `permission-sync`  | ✅ 启用 | `skills/sync/permission-sync/`  | 角色管理 + 角色授权 + 挂动作 + permission 字段 |
| `code-fix`         | ✅ 启用 | `skills/ops/code-fix/`          | 受控自动修复偏差                            |
| `standard-env-config` | ✅ 启用 | `skills/ops/standard-env-config/` | 存量子应用标准环境迁移与验证             |

每个启用 Skill 同目录都有 **`SKILL.md`（AI 触发用）+ `USAGE.md`（团队成员阅读）**。

---

## 多 AI 编辑器适配（解耦设计）

`init` / `update` 读取 `files/.wl-skills/skills/_compat/editors.json` 生成对应配置：

| 编辑器         | 输出路径                          | Frontmatter                   |
| -------------- | --------------------------------- | ----------------------------- |
| GitHub Copilot | `.github/copilot-instructions.md` | -                             |
| Claude Code    | `CLAUDE.md`                       | -                             |
| Cursor (rules) | `.cursorrules`                    | -                             |
| Cursor (mdc)   | `.cursor/rules/conventions.mdc`   | description+globs+alwaysApply |
| Windsurf       | `.windsurfrules`                  | -                             |
| Cline          | `.clinerules`                     | -                             |
| Kiro           | `.kiro/steering/conventions.md`   | inclusion: always             |
| Trae           | `.trae/rules/conventions.md`      | description+globs+alwaysApply |
| 通用 Agent     | `AGENTS.md`                       | -                             |
| Qoder          | `.qoder/rules/conventions.md`     | description                   |

**解耦验证**：在 `editors.json` 中将任意编辑器 `enabled: false`，重新 `update` —— 该编辑器配置不再生成，其他编辑器**完全不受影响**。

---

## 受保护路径

| 命令                   | 保护路径                         | 说明                     |
| ---------------------- | -------------------------------- | ------------------------ |
| `init` / `update`      | `.wl-skills/reports/*.md`        | 已存在则跳过，不覆盖累积 |
| `clean`（默认）        | `src/components/` + `src/types/` | 业务代码必需，永不删除   |
| `clean --keep-reports` | + `.wl-skills/reports/`          | 保留菜单/字典/权限基线   |

---

## 与 wl-skills-ui 的边界

`wl-skills-kit` 和 `wl-skills-ui` 是可组合但不强耦合的两个包：

| 包              | 主要职责                                                         | 典型触发                                |
| --------------- | ---------------------------------------------------------------- | --------------------------------------- |
| `wl-skills-kit` | 编码规范、页面生成、菜单/字典/权限同步、Agent Pipeline           | “生成页面”“同步菜单”“规范审计”          |
| `wl-skills-ui`  | UI 风格一致性、老项目化妆层、设计令牌、Runtime 渲染、UI 扫描修复 | “统一 UI 风格”“老项目化妆”“UI 扫描修复” |

如果业务项目同时安装两者，`wl-skills-kit` 的页面模板会直接融合 `wl-skills-ui/runtime`：

- `defineColumns()`：列定义自动套用字段映射、宽度、状态渲染建议
- `renderOps()`：操作列统一为图标按钮系统
- `doctor-ui`：检查 tokens、styles、`installCommonPreset()` 是否真实接入

注意：不会生搬硬套 `wl-skills-ui` 通用模板里的 `usePageHook/el-form/el-pagination`。本包的最终页面标准仍是：

```text
AbstractPageQueryHook + BaseQuery + BaseToolbar + BaseTable(render-type="agGrid") + jh-pagination
```

---

## 进一步阅读

- 🧭 AI 工作流演进与多智能体协作：[AI工作流演进与多智能体协作交流文档.md](AI工作流演进与多智能体协作交流文档.md)
- 🔁 Agent Pipeline 运行手册：[docs/agent-pipeline-runbook.md](docs/agent-pipeline-runbook.md)
- 🛡️ MCP Tool 风险矩阵：[docs/mcp-tool-risk-matrix.md](docs/mcp-tool-risk-matrix.md)
- 标准环境配置 Skill：[files/.wl-skills/skills/ops/standard-env-config/USAGE.md](files/.wl-skills/skills/ops/standard-env-config/USAGE.md)
- 📝 业务文档抽取 Skill：[files/.wl-skills/skills/core/business-doc-extract/USAGE.md](files/.wl-skills/skills/core/business-doc-extract/USAGE.md)
- 📚 业务方使用指南：`.wl-skills/guides/usage.md`（业务项目内）
- 🏗️ 架构与决策：`.wl-skills/guides/architecture.md`（业务项目内）
- 🛡️ validate 豁免配置：[files/.wl-skills/docs/validate-exempt.md](files/.wl-skills/docs/validate-exempt.md)
- 🔧 维护者文档：[kit-internal/README.md](kit-internal/README.md)（仅本仓库）
- 🤖 多编辑器适配机制：[files/.wl-skills/skills/\_compat/README.md](files/.wl-skills/skills/_compat/README.md)
- 🛠️ Jenkins 流水线参考：[kit-internal/jenkins-pipeline.md](kit-internal/jenkins-pipeline.md)

---

## 反馈与贡献

- 使用问题 / Bug：联系 CHENY（`ycyplus@gmail.com`，工号 409322）
- 仓库贡献：见 [kit-internal/CONTRIBUTING.md](kit-internal/CONTRIBUTING.md)

---

## 许可证

UNLICENSED — 内部使用

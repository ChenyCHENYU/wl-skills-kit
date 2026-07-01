# @agile-team/wl-skills-kit

**AI Skill 模板包 v2.11.6** — 一键将 14 条规范、11 个 AI Skill、17 个 MCP Tool、编辑器 MCP 配置、文档导入 Vue 3 项目。

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

---

## 版本亮点

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
- **C_Splitter 彻底删除**：废弃组件（onMounted 冻 vnode 致响应式失效）从包内移除，`lint:skills` 全量禁止任何引用，无例外
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
│   ├── skills/                           11 个启用 Skill（全部激活）
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
│   │   │   └── permission-sync/  { SKILL.md, USAGE.md }  已启用（角色+授权+动作+v-permission）
│   │   ├── ops/                          运维类
│   │   │   └── code-fix/         { SKILL.md }  已启用
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

# 任何命令都可加 --dry-run 预览
pnpm dlx @agile-team/wl-skills-kit update --dry-run
```

> 全局安装后也可直接用 `wl-skills` 命令（如 `wl-skills update`）。

---

## 生命周期文件

安装后会生成 `.wl-skills-manifest.json`，记录本次安装版本和文件哈希：

- `update`：对比 manifest 与包内文件，仅更新有变化的内容
- `diff`：查看当前项目与最新 kit 内容差异
- `clean`：按 manifest 清理 AI 辅助文件，默认保留 `src/components/` 和 `src/types/`
- `check`：检查 Node、MCP、manifest 和工程化配置

---

## MCP Tools 概览

| 类别     | Tools                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 菜单     | `wls_menu_query` / `wls_menu_upsert` / `wls_menu_sync_from_report`                                                                       |
| 字典     | `wls_dict_query` / `wls_dict_upsert`                                                                                                     |
| 权限     | `wls_role_query` / `wls_role_upsert` / `wls_assignable_menus_query` / `wls_role_assign_menus` / `wls_action_query` / `wls_action_upsert` |
| 项目感知 | `wls_code_scan` / `wls_route_check` / `wls_validate_page` / `wls_doctor_ui` / `wls_git_log_extract` / `wls_audit_report_push`            |

`wls_code_scan`、`wls_route_check`、`wls_validate_page`、`wls_doctor_ui`、`wls_git_log_extract` 不依赖后端 token，可用于 Agent Pipeline 前置感知项目结构。

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

> **注意**：如果项目在旧的 `.wl-skills/skills/menu-sync/env/env.local.json` 中有自定义配置，`update` 会将其迁移位置。**请在 `update` 前备份** 或 `update` 后手动迁移到 `.wl-skills/skills/sync/menu-sync/env/env.local.json`。

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
| `permission-sync`  | ✅ 启用 | `skills/sync/permission-sync/`  | 角色管理 + 角色授权 + 挂动作 + v-permission |
| `code-fix`         | ✅ 启用 | `skills/ops/code-fix/`          | 受控自动修复偏差                            |

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

- 🧭 全盘分析与智能体搭建：[docs/全盘分析与智能体搭建指南.md](docs/全盘分析与智能体搭建指南.md)
- 🔁 Agent Pipeline 运行手册：[docs/agent-pipeline-runbook.md](docs/agent-pipeline-runbook.md)
- 🛡️ MCP Tool 风险矩阵：[docs/mcp-tool-risk-matrix.md](docs/mcp-tool-risk-matrix.md)
- 📝 业务文档抽取 Skill：[files/.wl-skills/skills/core/business-doc-extract/USAGE.md](files/.wl-skills/skills/core/business-doc-extract/USAGE.md)
- 📚 业务方使用指南：`.wl-skills/guides/usage.md`（业务项目内）
- 🏗️ 架构与决策：`.wl-skills/guides/architecture.md`（业务项目内）
- 🛡️ validate 豁免配置：[files/.wl-skills/docs/validate-exempt.md](files/.wl-skills/docs/validate-exempt.md)
- 🔧 维护者文档：[kit-internal/README.md](kit-internal/README.md)（仅本仓库）
- 🤖 多编辑器适配机制：[files/.wl-skills/skills/\_compat/README.md](files/.wl-skills/skills/_compat/README.md)
- 🛠️ Jenkins 流水线参考：[kit-internal/jenkins-pipeline.md](kit-internal/jenkins-pipeline.md)

---

## 反馈与贡献

- 使用问题 / Bug：联系 CHENY（工号 409322）
- 仓库贡献：见 [kit-internal/CONTRIBUTING.md](kit-internal/CONTRIBUTING.md)

---

## 许可证

UNLICENSED — 内部使用

# @agile-team/wl-skills-kit

**AI Skill 模板包 v2.19.0** — 一键将 14 条规范、13 个 AI Skill、29 个 MCP Tool、独立 API 契约、编辑器配置和文档导入 Vue 3 项目。

它把“理解需求、生成页面、校验代码、沉淀模板、同步菜单/字典/权限”拆成可验证、可组合的工程步骤。确定性工作交给 CLI、AST 和 MCP，AI 只处理需要语义判断的部分。

## 你能获得什么

| 目标 | 包提供的能力 | 带来的效果 |
| --- | --- | --- |
| 让 AI 理解项目 | 14 条规范、组件文档、项目扫描、Page Blueprint | 少猜项目结构，减少反复读取源码和上下文 token |
| 从需求生成页面 | 原型/详设解析、API 契约、Vue 页面生成、Mock 策略 | 输入和产物有明确契约，生成结果更稳定 |
| 阻止低质量代码进入仓库 | K1~K19 AST 规则、spec-align、类型检查、Git hooks | 生成后立即验证，错误在提交或 CI 前暴露 |
| 整改存量项目 | 规范审计、安全机械修复、状态列审计、UI 接入诊断 | 区分可自动修复与需人工判断，降低批量改造风险 |
| 沉淀领域模板 | snapshot、Blueprint extract/search/diff/audit | 模板以脱敏 JSON 保存，不复制整页业务代码 |
| 完成交付配置 | 菜单、字典、角色、动作权限 MCP | 查询、预览、确认、写入、复查形成闭环 |
| 统一项目环境 | 五环境 Profile、三种本地联调模式、迁移验证 | 环境配置可计划、可备份、可验证 |

这个包适合 Vue 3 企业后台、AI 辅助开发、存量项目治理和团队规范落地。运行时最低要求是 Node.js 22。

## 快速开始

```bash
# 1. 工程规范前置
pnpm dlx @robot-admin/git-standards init

# 2. 将 Skill、MCP、规范和编辑器配置安装到当前业务项目
pnpm dlx @agile-team/wl-skills-kit@latest init

# 3. 检查安装、Node、MCP 和 Git hooks
pnpm dlx @agile-team/wl-skills-kit@latest check

# 4. 校验现有页面
pnpm dlx @agile-team/wl-skills-kit@latest validate
```

安装后可以直接在支持 Skill 的 AI 编辑器中描述任务，例如：

```text
扫描 docs/prototypes 下的原型，生成页面清单和 page-spec。
根据 docs/spec/MDM101 说明书生成页面并校验。
为 src/views/produce/order 生成 api.md 和可运行列表页。
审计 src/views/mdata，修复可安全自动修复的问题并复扫。
把 src/views/produce/order 提取为脱敏 Blueprint 模板。
预览并同步这个模块的菜单和字典。
```

默认安全策略：只读能力可以自动执行；本地写入先预览或限定目标；菜单、字典、角色、授权等后端写入必须经过“查询 → 计划哈希 → 人工确认 → 写入 → 回查”。

## 能力地图

### 1. 理解需求和业务资料

| 输入 | 使用能力 | 主要产物 |
| --- | --- | --- |
| Axure、截图、口述、零散详设 | `prototype-scan` | 页面清单、page-spec、待确认问题 |
| 标准功能说明书、IPO、功能编码 | `spec-doc-parse` | 规范化 page-spec 和流程约束 |
| 模块级原型、字段、字典、现有页面 | `business-doc-extract` | 业务索引、模块说明、字段/字典资料 |

原型线和规范说明书线最终都收敛到结构化 page-spec，后续 API 契约与页面生成不再依赖 AI 重复理解原始资料。

### 2. 建立前后端 API 契约

只有需求文档、没有 design 或后端契约时，也能独立建立接口契约：

```bash
# 预览契约
wl-skills contract init --contract-id mdm-task --service mdm \
  --resource mdmTask --module task --permission-prefix mdm_task \
  --output contracts/mdm-task.json

# 确认写入并校验
wl-skills contract init --contract-id mdm-task --service mdm \
  --resource mdmTask --module task --permission-prefix mdm_task \
  --output contracts/mdm-task.json --confirm
wl-skills contract validate --input contracts/mdm-task.json --strict

# 前后端契约握手
wl-skills contract compare --left contracts/mdm-task.json \
  --right contracts/mdm-task.backend-contract.json --strict
```

契约固定接口操作、请求位置、分页、字段、字典和权限前缀，减少页面生成时猜 URL、字段名或响应结构。

### 3. 生成 Vue 页面

`page-codegen` 根据 page-spec、api.md、项目 Delivery Profile 和现有组件生成页面。默认遵守：

- Vue 3 + TypeScript 项目结构；
- `BaseTable + render-type="agGrid" + cid + defineColumns + renderOps`；
- 查询、表格、工具栏和操作列与 page-spec 对齐；
- Mock 按项目 `mockPolicy` 决定是否生成；
- 表单校验库按需检测，不静默安装依赖；
- 需要标准业务组件时先生成计划，确认后按需落盘。

生成后执行：

```bash
wl-skills validate-page src/views/produce/order
wl-skills doctor-ui                 # 项目接入 wl-skills-ui 时
wl-skills validate --typecheck      # CI 或交付前
```

### 4. 校验、审计和修复

```bash
# 全量页面检查：AST K1~K19、spec-align、Mock、组件契约
wl-skills validate

# 仅检查指定页面或目录
wl-skills validate-page src/views/mdata/model

# 增加 vue-tsc/tsc 类型检查，适合 CI/pre-push
wl-skills validate --typecheck --strict

# 预览确定性机械修复
wl-skills fix --dry-run

# 执行安全、幂等的机械修复并复扫
wl-skills fix
wl-skills validate
```

validate 使用 `.wl-skills-cache/` 内容哈希缓存。第二次扫描复用未变化页面的问题摘要；页面、规则、配置、page-spec 或 package.json 变化时自动失效，不缓存源码正文。

AI 层还有三类治理能力：

- `convention-audit`：按 14 条规范生成偏差报告；
- `code-fix`：按明确范围整改并自动复扫；
- `status-column-audit`：把存量字典状态列升级为语义化 Tag。

### 5. 低 token 项目感知和 JSON 模板

推荐调用顺序：

```text
project snapshot
→ Blueprint search
→ Blueprint extract
→ Blueprint audit
→ Blueprint diff
→ AI 只读取选中的局部事实或源码
```

对应 CLI：

```bash
# 项目页面摘要，不返回源码
wl-skills snapshot --path src/views --limit 200 --json

# 从成熟页面提取脱敏 Blueprint，默认只预览
wl-skills template extract --path src/views/produce/order --json
wl-skills template extract --path src/views/produce/order --confirm

# 按领域、场景、模式、组件和质量分检索；默认只返回摘要
wl-skills template search --domain produce --scene list \
  --min-quality 70 --limit 20 --json

# 结构、fingerprint 和脱敏质量门禁
wl-skills template validate \
  --path .wl-skills/templates/blueprints/produce/list/blueprint.json --json
wl-skills template audit \
  --path .wl-skills/templates/blueprints/produce/list/blueprint.json --json

# 比较两个模板的结构演进，忽略来源 hash 和质量元数据
wl-skills template diff --left path/to/left.json \
  --right path/to/right.json --json
```

Page Blueprint 不保存业务代码和真实接口路径，主要包含：

- `domain / scene / mode`；
- 组件能力和匿名查询、列、按钮、操作槽位；
- API 操作、HTTP 方法和请求位置；
- 匿名字典依赖、表单分区和交互约束；
- 来源 hash、质量分和 fingerprint。

模板建议分三层管理：

| 层级 | 用途 | 建议位置 |
| --- | --- | --- |
| Universal | 跨领域稳定页面模式 | 主 kit 或通用模板包 |
| Domain | 生产、销售、主数据等领域模式 | 独立领域包或受审查的领域库 |
| Project-private | 客户和项目特有模式 | 业务项目本地，不进入公共 npm 包 |

### 6. 标准业务组件按需落盘

```bash
# 检查源码使用了哪些标准组件，以及项目是否缺文件
wl-skills component check

# 先预览并获取 planHash
wl-skills component ensure --components c_formModal,c_formSections

# 确认后落盘；不会覆盖已有组件
wl-skills component ensure --components c_formModal,c_formSections \
  --confirm --plan-hash <preview-plan-hash>
```

适合团队从 kit 快照起步，再在项目内维护组件。组件源码一旦进入业务项目，`update` 和 `clean` 都不会覆盖或删除。

### 7. 标准环境配置

```bash
# 识别项目形态、模块名和历史地址
wl-skills standard-env scan

# 选择 Profile 并生成迁移计划
wl-skills standard-env plan --profile walsin --module-name safe

# 确认五套地址、模块名和文件计划后执行
wl-skills standard-env apply --profile walsin \
  --module-name safe --confirm

# 静态验证；依赖完整时执行五环境临时构建
wl-skills standard-env verify --profile walsin --build
```

非华新项目必须使用完整自定义 `--profile-file`，不会静默套用客户地址。迁移前自动备份，验证失败时回滚。

### 8. 菜单、字典和权限同步

这部分通过 MCP 完成，不建议用 curl 或临时脚本绕开确认机制。

| 目标 | 推荐流程 |
| --- | --- |
| 菜单 | 查询应用域/菜单 → 解析 SYS_MENU_INFO → 预览 planHash → 确认同步 → 路由复查 |
| 字典 | 读取项目 dicts.ts → 查询线上 → safe-additive 差异计划 → 确认写入 → 项目级回查 |
| 权限 | 查询角色/菜单/动作 → 预览角色与授权计划 → 确认写入 → 权限码复扫 |

后端连接配置位于：

```text
.wl-skills/skills/sync/env.local.json
```

该文件已加入 `.gitignore`，只能保存本地登录凭据，不得提交真实 token。生产写入默认阻断；角色授权是全量覆盖操作，必须显式确认最终 `menuIds`。

## 常用组合工作流

### 原型到可交付页面

```text
prototype-scan
→ business-doc-extract（资料达到模块级时）
→ api-contract
→ page-codegen
→ validate-page
→ doctor-ui（接入 wl-skills-ui 时）
→ convention-audit
→ menu/dict/permission sync（需要后台配置时）
```

### 标准说明书到页面

```text
spec-doc-parse
→ api-contract
→ page-codegen
→ validate --typecheck
→ convention-audit
```

### 接手存量项目

```text
wls_project_snapshot / wls_code_scan
→ convention-audit
→ code-fix
→ validate
→ status-column-audit（需要时）
→ convention-audit 复扫
```

### 从成熟项目沉淀领域模板

```text
wls_project_snapshot
→ wls_template_search（先查重）
→ wls_template_extract
→ wls_template_audit
→ 人工 review、分层归档
→ wls_template_diff（后续演进）
```

更完整的输入、输出、确认点和回退策略见 [Agent Pipeline 运行手册](docs/agent-pipeline-runbook.md)。

## 13 个 AI Skill

| 分组 | Skill | 什么时候用 |
| --- | --- | --- |
| Core | `prototype-scan` | Axure、截图、口述和非标准详设转页面规格 |
| Core | `spec-doc-parse` | 标准说明书、IPO、功能编码转页面规格 |
| Core | `api-contract` | 设计 api.md、字段、分页、字典和前后端契约 |
| Core | `page-codegen` | 生成 Vue 页面、Mock 和页面配套文件 |
| Core | `convention-audit` | 项目体检、规范偏差报告和交付复扫 |
| Core | `business-doc-extract` | 沉淀模块、字段、字典和待确认事项 |
| Core | `status-column-audit` | 存量字典状态列改为语义化 Tag |
| Core | `template-extract` | 从成熟页面提取和治理领域 Blueprint |
| Sync | `menu-sync` | 查询、预览和同步菜单 |
| Sync | `dict-sync` | 字典契约、差异审计和安全增量发布 |
| Sync | `permission-sync` | 角色、菜单授权和动作权限同步 |
| Ops | `code-fix` | 按审计结果修复代码并复扫 |
| Ops | `standard-env-config` | 五环境和本地联调配置迁移 |

AI 的权威路由表位于 `.wl-skills/skills/_registry.md`；团队成员可阅读各 Skill 同目录的 `USAGE.md`。

## 29 个 MCP Tool

| 分类 | Tool | 写入边界 |
| --- | --- | --- |
| 菜单 | `wls_domain_query`, `wls_menu_query`, `wls_menu_upsert`, `wls_menu_delete`, `wls_menu_sync_from_report` | query 只读；写入必须确认和 planHash |
| 字典 | `wls_dict_query`, `wls_dict_bootstrap`, `wls_dict_upsert` | bootstrap 本地预览；线上只做确认后的安全增量 |
| 权限 | `wls_role_query`, `wls_role_upsert`, `wls_assignable_menus_query`, `wls_role_assign_menus`, `wls_action_query`, `wls_action_upsert` | 授权覆盖和写入必须确认 |
| 环境 | `wls_standard_env_scan`, `wls_standard_env_apply`, `wls_standard_env_verify` | apply 默认只生成计划 |
| 项目感知 | `wls_code_scan`, `wls_route_check`, `wls_validate_page`, `wls_doctor_ui`, `wls_git_log_extract`, `wls_audit_report_push` | 前五项只读；报告推送必须确认 |
| Blueprint | `wls_project_snapshot`, `wls_template_extract`, `wls_template_validate`, `wls_template_search`, `wls_template_diff`, `wls_template_audit` | extract 默认预览；其余只读 |

完整输入参数、安全等级和确认要求见 [MCP Tool 风险矩阵](docs/mcp-tool-risk-matrix.md)。

## CLI 速查

| 命令 | 用途 |
| --- | --- |
| `init` / `update` | 安装或增量更新 Skill、规范、MCP 和编辑器配置 |
| `check` / `diff` | 检查环境，或比较项目与当前 kit 的差异 |
| `validate` / `validate-page` | 页面、AST 规则、spec-align 和类型检查 |
| `fix` | 只处理确定、安全、幂等的机械修复 |
| `doctor-ui` | 检查 wl-skills-ui 接入完整性 |
| `contract` | init、validate、compare、render、profile |
| `template` / `snapshot` | 低 token 项目感知和 Blueprint 治理 |
| `component` | 检查或按需落盘标准业务组件 |
| `standard-env` | scan、plan、apply、verify |
| `mock-clean` | 按域或全量清理 Mock，保留 `_utils.ts` |
| `export` | 将菜单、字典、权限报告导出为 xlsx |
| `clean` | 清理开发期 AI 文件，保护业务源码和类型文件 |

查看全部参数：

```bash
wl-skills --help
wl-skills --version
```

## 安装后的关键目录

```text
.wl-skills/
├── contracts/             API、Delivery Profile、Page Blueprint Schema
├── docs/                  项目内使用文档
├── guides/                架构、使用和 MCP 指南
├── reports/               审计、菜单、字典和权限报告
├── skills/                13 个 Skill、路由表和 Pipeline
├── standards/             14 条编码规范
└── templates/             通用、领域和 Blueprint 模板

.github/                   Copilot 指令
.cursor/ .kiro/ .kilo/     对应编辑器适配和 MCP 配置
.wl-skills-manifest.json   安装版本与受管文件哈希
.wl-skills-validate.json   项目校验策略（可选）
.wl-skills-cache/          validate 本地增量缓存（gitignored）
```

安装器先完整检查冲突。没有 `--force` 时，发现未受管本地文件会零写入停止；确认强制更新时，冲突文件先备份到 `.wl-skills/.state/backups/`。

## 配置和安全边界

- `.wl-skills-validate.json`：配置 `mockPolicy`、特殊页面豁免、集中定义校验器和扫描排除项；
- `.wl-skills/contracts/wl-delivery-profile.v1.json`：查询方法、载荷位置、分页和交付口径；
- `.wl-skills/skills/sync/env.local.json`：本地后端连接凭据，禁止提交；
- 所有 apply/upsert/sync 类能力默认先预览；
- 生产环境后端写入默认阻断；
- `clean` 不删除 `src/components/`、`src/types/` 和项目维护的业务源码；
- npm token 不应写入仓库、README、MCP 配置或项目 env 文件。

## 支持的 AI 编辑器

安装器为 GitHub Copilot、Cursor、Windsurf、Claude Code、Cline、Kiro、Kilo Code、Trae、Qoder 和通用 Agents 生成薄适配层。规范、Skill 和 MCP 注册表保持单一数据源，编辑器配置只负责发现和路由。

## 与 wl-skills-ui 的边界

| 包 | 职责 |
| --- | --- |
| `@agile-team/wl-skills-kit` | 需求理解、API 契约、代码生成、规范校验、模板、菜单/字典/权限和环境配置 |
| `@agile-team/wl-skills-ui` | 设计令牌、视觉一致性、存量项目化妆层和 UI Runtime |

两包可独立安装。组合使用时推荐：

```text
page-codegen → doctor-ui → validate-page → convention-audit
```

## 更新和清理

```bash
# 增量更新；保护本地定制和 reports
pnpm dlx @agile-team/wl-skills-kit@latest update

# 查看会发生什么
pnpm dlx @agile-team/wl-skills-kit@latest update --dry-run

# 清理开发期 AI 文件，保留业务组件和类型
wl-skills clean

# 同时保留累积报告
wl-skills clean --keep-reports
```

## 版本记录

- 面向使用者的版本演进：[版本记录](docs/version-history.md)
- 每个版本的完整变更：[CHANGELOG.md](CHANGELOG.md)

## 进一步阅读

- [Agent Pipeline 运行手册](docs/agent-pipeline-runbook.md)
- [MCP Tool 风险矩阵](docs/mcp-tool-risk-matrix.md)
- [API 输入规范](docs/input-spec-api.md)
- [页面规格输入规范](docs/input-spec-page-spec.md)
- [原型输入规范](docs/input-spec-prototype.md)
- [详设输入规范](docs/input-spec-detailed-design.md)
- [存量迁移经验](docs/legacy-migration-lessons.md)
- 安装后总览：`.wl-skills/guides/README.md`

## 反馈与贡献

提交问题时请附上 kit 版本、Node 版本、目标编辑器、执行命令和最小复现。新增领域 Blueprint 进入共享库前必须通过 validate、audit、人工脱敏检查和复用价值评审。

## 许可证

UNLICENSED — 仅限团队内部使用。

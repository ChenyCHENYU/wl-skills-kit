# wl-skills-kit 版本记录

本文面向使用者记录能力演进和升级影响。逐提交、逐修复的完整列表见根目录 [CHANGELOG.md](../CHANGELOG.md)。

## v2.26.0 — 公开集成协议与安装迁移事务化（2026-10-08）

### 公开集成协议

- 新增 describe/request 统一信封：外部宿主与适配器可稳定获取各包能力清单与路由语料，仅依赖公开入口；适配器移除后各包独立能力不受影响。
- 能力清单、路由语料经真实打包产物与混合版本（新旧包共存）验证。

### 安装迁移事务化

- `.clinerules` 等存量迁移改为事务化：字节级备份、失败回滚；`project` 参数区分缺值与未传参，边界行为可预期。

## v2.25.0 — 任务判定、真实执行回执与原生技能入口

### 任务可观测与宿主入口

- 新增 task/route/explain/status/doctor-host CLI 与 5 个 MCP 工具，确定性区分匹配、基础规范、歧义、能力/资产缺口、不适用和缺上下文。route/explain 只读，task 只登记计划，不把模型声明作为执行证据。
- 真实 CLI/MCP/Vite 调用记录独立执行/验证状态、实际检查文件、规则/配置快照、未运行检查与过期证据；同一任务跨已安装适用包复用 runId，仍可独立使用。
- 安装本包独有 `.agents/skills/wl-skills-kit/SKILL.md` 原生薄入口，按需读取 canonical Skill，保留既有贡献归属及用户修改规则。宿主发现/读取静态诊断始终未验证。
- 修复 Vite `apply: all` 导致 serve/build 未运行的问题；实际 Vite 回归覆盖启动、构建、AST 不可用、零页面与热更新去抖。插件只证明 AST 范围，完整 validate 与类型检查另行执行。

## 2.24.2 — 单一 BaseForm 与公开校验适配

- 新增按需落盘一次的 `useBaseForm`，通过平台字段公开挂载钩子复用 Element Plus 原生整表、单字段、清除和重置校验；缺少原生容器明确报告契约错误。
- 独立表单模板移除外层 `el-form` 和私有组件引用胶水，保留既有回调、全局尺寸、多实例隔离及动态字段/卸载清理。
- 同步表单与平台组件规范，新增真实 Vue 3.2 生命周期和页面生成契约回归，继续保留有效历史写法。

## 2.24.1 — 扁平表单范式与必要注释

- 补齐已合入的三文件 BaseForm 模板、组合函数复用、验证库及 Vue 3.2 宿主兼容规则的发布说明和升级指引。
- 页面保留字段和业务流程，共用技术能力按需落盘一次；新表单使用标准校验预设，历史兼容仅用于保留原有行为。
- 生成代码主动说明入口职责、关键动作、字段联动、特殊校验和兼容原因，不新增针对有效存量写法的风格硬门禁。

升级建议：在项目执行 `pnpm dlx @agile-team/wl-skills-kit@2.24.1 update`，查看受管文件差异；按实际宿主能力选择表单模板和兼容组合函数，并验证原页面的布局、校验及交互。本补丁不变更 CLI/MCP 运行行为。

## 2.24.0 — 独立能力与安装贡献保护

- 明确 CLI、安装器、MCP 与页面运行时的独立能力边界，统一公共 API 契约版本处理。
- 安装、更新和清理只维护本包贡献，保留用户及其他包内容；共享配置精确维护，并补齐单文件原子写入保护。

## 2.23.0 — 实现驱动的领域镜像与兼容规范

- 页面业务定义以 data.ts 为事实源，三文件分工、扁平组合函数和必要中文注释作为推荐写法。
- 新增镜像提取及本地依赖导出，识别自动导入组件；源码、声明和样式可隔离还原后重新提取。
- 知识镜像不参与运行或反向门禁；旧需求规格、scenario 和有效存量写法继续兼容。
- 真正无效代码、复杂度和明确接口/字段契约错误仍阻断，架构与风格差异只提示改进。

## 2.22.0 — 业务生成防漏闭环

- page-spec 可声明查询上下键、默认日期、长文本显示、真实业务去重规则和 selected-only 批量门禁；字段引用、来源和提示语由校验器阻断漂移。
- 业务去重覆盖新增/修改、有效数据和更新排除自身，技术化唯一键提示不再通过契约。
- acceptance 必须携带鉴权/租户上下文、查询 positive/negative/reset 三态和同租户写后回查，防止无公司账号或错误读路径制造伪缺陷。
- 原型、详设、业务文档、API 契约和页面生成 Skill 使用同一套验收事实，并新增完整闭环手册与回归测试。

升级建议：执行 `pnpm dlx @agile-team/wl-skills-kit@latest update`。存量 page-spec 不强制增加 acceptance；新需求一旦包含上述业务规则，就应结构化声明后再生成。

## 2.21.0 — 性能与安全加固

- validate 管线 I/O 提速：K18 表单依赖按项目缓存、page-spec 单次读取复用、目录遍历去 statSync；大项目全量 validate 明显更快。
- CLI 按命令懒加载重引擎，`--version` / `check` / `clean` / `diff` / `export` 等轻命令启动不再加载 AST / scenario 等模块。
- 生产闸门扩展：`prd`/`PRD` 环境与 `api-prd.*` 网关命中阻断；`wls_audit_report_push` 审计报告外发同样受生产环境阻断（显式 `allowProductionWrites: true` 可放行）。
- 发版口径门禁补全：README 与发布描述中的 MCP Tool 数、编码规范条数纳入 `version:verify` 自动校验。

升级建议：直接 `pnpm dlx @agile-team/wl-skills-kit@latest update`。无破坏性变更；若生产环境确需推送审计报告到飞书，在 env.local.json 显式设置 `allowProductionWrites: true` 并走审批。

## 2.20.x — 确定性页面治理与布局门禁

- K20 阻断长工作台缺少页面级纵向滚动所有者，防止下部内容不可达。
- K21 阻断 Tabs + jh-drag + AG Grid 高度链断裂，并解析 SFC `<style>` 与递归共享 SCSS。
- 菜单同步增加权限树可见性回查，角色授权补齐领域参数与查询回退。

## 2.19.0 — 低 token 项目感知与 Page Blueprint

- validate 引入页面级内容哈希缓存，只重扫变化页面；缓存不保存源码正文。
- 新增项目快照，AI 可先读取页面结构、组件、槽位和依赖摘要。
- 新增 Page Blueprint JSON Schema 和 extract/validate/search/diff/audit 完整治理链路。
- Blueprint 默认匿名化字段、接口路径和字典编码，并使用来源 hash、稳定依赖 ID 和 fingerprint 防漂移。
- API 依赖增加 HTTP 方法和 path/query/body 请求位置。
- MCP Tool 从 23 个扩展到 29 个，新增 Blueprint 和项目感知能力。

升级建议：执行 `pnpm dlx @agile-team/wl-skills-kit@latest update`；首次使用模板沉淀前先运行 `snapshot` 和 `template search`，落盘后必须运行 `template audit`。

## 2.18.x — 精准校验和工程治理

- 规则编号统一为 K1~K19，与 wl-skills-ui 的 R001~R040 解耦，同时兼容存量 R 前缀豁免。
- 强化表单校验库、仅必填切换、AG Grid 弹窗挂载和状态列 Tag 规范。
- Skill、编辑器适配、规则范围和版本计数收敛到单一事实源。
- MCP 工具逐项登记风险画像，统一参数校验、结构化输出和协议协商。
- HTTP 客户端复用 keep-alive，并遵守后端 Retry-After。

## 2.17.x — 状态列审计

- 新增 `status-column-audit`，识别字典列纯文本展示并按语义升级为状态 Tag。
- 提供可审计、可复扫的存量列表页改造流程。

## 2.16.x — 页面契约和环境配置成熟

- page-spec 增加进阶查询、选择回填、字典绑定和生命周期闭环。
- 建立 `standard-env-config` Skill 与 scan/plan/apply/verify 工具链。
- 安装器升级为冲突预检、零写入阻断、备份和项目 Delivery Profile 保护。
- 表单“全部/仅必填”、标准校验库和 K17/K18/K19 门禁完成闭环。

## 2.15.x — Delivery Profile 成为运行事实源

- 查询 GET/POST、请求载荷位置、分页大小和运行边界读取项目 Profile。
- 页面、API 契约和运行模型做集合级核对，减少基于字段名的猜测。

## 2.14.x — 跨包所有权保护

- kit 与 wl-skills-ui 的文件所有权和编辑器配置合并边界明确。
- update/clean 不再覆盖或清理其他包及项目维护的文件。

## 2.13.x — 独立 API 契约

- kit 不再依赖 design 或其他包才能定义前后端契约。
- 增加 contract init/validate/compare/render/profile 工作流。

## 2.12.x — Agent Pipeline 和安全计划

- Skill 之间建立输入输出、next_suggest、确认点和复扫协议。
- 菜单、字典、权限写入引入预览哈希和状态漂移保护。
- 项目组件改为按需检查和计划落盘。

## 2.11.x — 确定性规则执行器

- page-spec 落盘并通过 spec-align 比对查询、列、工具栏、操作和 API 字段。
- 新增 `fix` 处理可证明安全的机械修复。
- 引入规则到执行器覆盖矩阵，避免强制规范只有文档没有门禁。
- K13 圈复杂度和 K14 类型检查进入 validate。

## 2.10.x — 平台组件和生成精度

- BaseTable、AGGrid、BaseQuery、BaseForm 和常用 jh-* 组件文档持续校准。
- 生成模板和项目扫描开始以真实组件 API 为准。

## 2.9.x — Mock 与交付边界

- Mock 策略从默认强加改为 disabled/optional/required 三态。
- 页面生成优先使用真实接口契约，避免缺少主键时隐式切换假数据。

## 2.8.x — Mock 架构和清理

- 固化按领域组织的 Mock 结构、共享工具和 `mock-clean` CLI。
- clean 保留构建必需的业务组件和类型文件。

## 2.7.x — MCP 注册表和多编辑器适配

- MCP Tool 描述符集中到 registry，server 自动发现工具。
- 增加版本、Skill 数量、CLI 参数和 npm 发布完整性门禁。
- 扩展 GitHub Copilot、Cursor、Kiro、Kilo Code、Trae 等编辑器适配。

## 2.3–2.6 — 菜单、字典、权限闭环

- 菜单、字典、角色、菜单授权和动作权限逐步接入 MCP。
- query、预览、人工确认、写入和回查成为统一安全流程。
- 引入本地凭据配置隔离和生产写入保护。

## 2.0–2.2 — Skill 体系成型

- 建立 core/sync/ops/domain 分层、Skill 注册表和使用文档。
- 从单一页面生成模板扩展到原型解析、规范审计和后端同步工作流。

## 升级原则

- Patch：修复兼容问题，不改变主要工作流。
- Minor：增加 Skill、MCP、CLI、Schema 或新的可选门禁。
- Major：改变安装结构、产物契约或默认安全行为。

升级前建议运行：

```bash
pnpm dlx @agile-team/wl-skills-kit@latest update --dry-run
pnpm dlx @agile-team/wl-skills-kit@latest diff
```

升级后建议运行：

```bash
wl-skills check
wl-skills validate --typecheck
```

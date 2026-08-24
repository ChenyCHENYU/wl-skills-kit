# wl-skills-kit 版本记录

本文面向使用者记录能力演进和升级影响。逐提交、逐修复的完整列表见根目录 [CHANGELOG.md](../CHANGELOG.md)。

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

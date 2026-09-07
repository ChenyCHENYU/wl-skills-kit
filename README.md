# @agile-team/wl-skills-kit

**AI Skill 模板包 v2.20.2** — 一键将 14 条规范、13 个 AI Skill、29 个 MCP Tool、独立 API 契约、编辑器配置和文档导入 Vue 3 项目。

它把“理解需求、生成页面、校验代码、沉淀模板、同步菜单/字典/权限”拆成可验证、可组合的工程步骤。确定性工作交给 CLI、AST 和 MCP，AI 只处理需要语义判断的部分。

## 你能获得什么

| 目标 | 包提供的能力 | 带来的效果 |
| --- | --- | --- |
| 让 AI 理解项目 | 14 条规范、组件文档、项目扫描、Page Blueprint | 少猜项目结构，减少反复读取源码和上下文 token |
| 从需求生成页面 | 原型/详设解析、API 契约、Vue 页面生成、Mock 策略 | 输入和产物有明确契约，生成结果更稳定 |
| 阻止低质量代码进入仓库 | K1~K20 AST 规则、spec-align、类型检查、Git hooks | 生成后立即验证，错误在提交或 CI 前暴露 |
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

交互模式已在 `patterns.json` 标 `implemented`（7/9：list / master-detail / tree-list /
form-route 平铺变体 / record-form / change-history + runtime 轨 workstation）时，
**优先走确定性渲染**——规格写成 wl-scenario JSON 后
`wl-skills scenario render --confirm` 直接生成标准代码（AI 零自由度、模型 token 0），
详见下方 [场景模板怎么用](#场景模板怎么用wl-scenario)。

生成后执行：

**v2.18.1**：文档债务清偿——版本叙事与真实发布对齐。

- README 版本亮点历史条目标号修正（此前 v2.16.7/2.16.8 内容被误挂在更高版本标签下）。
- `guides/architecture.md` 版本表补齐 2.16.7–2.18.0 演进记录，`当前版本` 行同步真实日期。
- `docs/legacy-migration-lessons.md` 交叉引用 wl-skills-ui 存量改造十条沉淀（K/R 编号速查表）。

**v2.18.0**：规则编号 K 前缀化，与 wl-skills-ui 编号空间解耦。

- kit 规则在 v2.18.0 由 `R` 前缀迁移为 `K` 前缀（当时覆盖 1 至 19，当前范围以注册表为准）；wl-skills-ui scanner 保持 `R001~R040`，混合报告/跨包沟通不再歧义。
- `wl-skills:ignore` 行内标记与 `.wl-skills-validate.json` 豁免**同号等价**接受旧 R 前缀，存量项目配置零改动。
- 源码防回流守门（测试拦截字符串字面量旧编号）；MCP 风险等级 R0~R4 语义不受影响。

**v2.17.0**：status-column-audit 技能——存量列表字典列升级语义 Tag 全流程。

- 审计分级报告（P1 状态/类型类 / P2 中性 / P5 `logicType:"dict"` 配置列），`--fix` 自动转换并补 import 清残留，`--init-bridge` 一键桥接 wl-skills-ui `renderAutoTagByLabel`（≥1.10.0）。

**v2.16.7–2.16.9**：门禁健壮性三连修。

- v2.16.9：K19（时称 R19）弹窗内 AG Grid 必须 `v-if` 延迟挂载，防动画期零高度渲染。
- v2.16.8：`validate --pre-commit` 不再误拦截纯文档、规则快照或依赖升级提交。
- v2.16.7：`update --force` 保留项目显式定制的 delivery profile，通用基线不覆盖项目事实（query 参数删除、POST 查询、分页默认值等项目事实不被误改）。

**v2.16.6**：进阶查询/选择回填从页面隐式行为升级为可选机器契约。

- `features.lookupFlows` 显式声明触发动作、查询操作、打开刷新、取消隔离、单/多选及字段回填。
- S7 将查询响应字段与新增/更新目标字段精确闭合，避免按钮串线、旧缓存和炉号/身份字段错绑。
- 未声明该能力的存量页面不启用新门禁，不改变生成结果和运行逻辑。

**v2.16.5**：字典字段绑定从“存在字典”升级为“字段与显式字典契约一致”。

- **D3 字典绑定门禁**：`page-spec.json` 已声明 `dict/dictCode` 时，真实 `queryDef/columnsDef` 必须显式绑定同一编码；缺失或错绑直接报告字段、期望值和实际值。
- **集中定义语义闭环**：委托到共享 definitions 的页面必须通过 `.wl-skills-validate.json.definitionValidators` 执行项目级校验；普通模式提示，`--strict` 阻断未闭合来源。
- **零猜测边界**：不按 `status/type/flag` 等字段名推断通用是否字典，不内置任何客户或业务模块的字典编码和值域。

**v2.16.4**：统一弹窗、普通页面、分区页面和多 Tab 表单的“全部/仅必填”快速填写能力。

- **页面级能力闭环**：共享 `useFormRequiredOnly`，只过滤渲染项、不删除表单值，并同步清理隐藏字段校验。
- **生成与检查一致**：页面模板直接生成有效过滤逻辑；K17 逐表单检查弹窗、`BaseForm` 和 `c_formSections`，避免只生成无效开关。
- **依赖边界明确**：校验库继续由业务项目按需安装，kit 仅检查 `@robot-admin/form-validate` 3.4.1+，不与其运行时耦合。

**v2.16.3**：Kilo Code 原生适配、标准表单校验库闭环和 MCP 风险声明进一步收口。

- **表单校验标准化**：生成表单先检查 `@robot-admin/form-validate`；Element 页面复用 `ELEMENT_RULES / ELEMENT_COMBOS`，跨 UI 与提交前校验使用 `RuleSpec` 单一真相源，K18 阻断缺依赖、退役包和 Naive API 混入。
- **Kilo Code 原生兼容**：识别根目录 `kilo.jsonc / kilo.json` 与 `.kilo/kilo.jsonc`，无损保留 JSONC 注释、GLM provider、团队指令和既有 MCP，仅增量注册 wl-skills。
- **MCP 契约强化**：23 个 Tool 逐项登记唯一风险画像，协议协商、参数校验与结构化输出统一收口；未来新增 Tool 漏配风险声明会直接失败。
- **安全与可维护性**：拆分编辑器适配、表单字段分析和共享项目配置模块，移除 CLI 包误导性 `main` 入口，并升级存在安全公告的传递依赖。

**v2.16.2**：表单仅必填切换完整闭环（composable + c_formModal prop + K17 检测 + F6 修复 + 模板默认 + 文档）。

- **Mock 三态策略**：`disabled` 明确禁用、`optional` 默认按需、`required` 严格全量；不做 Mock 的团队不会再被生成规则或 strict 门禁误伤。
- **真实接口优先模板**：缺主键不再隐式切入本地假数据；表单空值、履历、导入和详情占位都先遵循项目策略与已确认契约。
- **安装冲突零写入**：`init/update` 先完整预检受管文件；发现本地改动时不创建 hook、配置或 manifest，显式 `--force` 才覆盖并逐文件备份。
- **只清理本包拥有的文件**：旧版目录不再递归清空；只有旧 manifest 证明由本包安装且内容未修改的退役文件才会移除，本地定制和所有权不明文件全部保留。
- **项目交付 Profile 优先**：项目已显式修改 `.wl-skills/contracts/wl-delivery-profile.v1.json` 时，`update --force` 也会保留该项目契约，避免把 query 参数删除、POST 查询等真实项目口径覆盖回通用基线。
- **Profile 口径一致**：文档、Skill、Mock 示例统一声明 GET/POST、载荷位置和分页来自生效 Delivery Profile，`POST + 1/10/200` 只作无配置基线。

**v2.15.0**：补齐“项目口径优先、通用基线兜底”的接口与交互闭环。

- **Profile 是运行事实源**：查询 GET/POST、载荷位置、默认页大小和最大页大小均读取项目 Delivery Profile；无项目 Profile 时才回退 `POST + 1/10/200`。合理覆盖只提示，代码与生效 Profile 漂移才阻断。
- **边界只来自证据**：写入约束、查询约束、数值精度、长度、正则和跨字段时间顺序必须在契约显式声明；不再按字段名或数据库宽度机械推断查询控件校验。
- **上下文职责清晰**：`client` 上下文按操作精确携带，`server` 上下文禁止由浏览器伪造；页面规范、API 契约和运行模型做集合级核对。
- **列表生命周期闭环**：首次进入查询；普通检索由搜索/重置触发而非失焦触发；保存回第一页，删除末页最后一条自动回退；特殊实时联想必须显式声明。
- **运行边界可理解**：继续阻断 Vue Proxy 直接 `structuredClone` 和原始技术异常透传，并通过反例测试保护 Profile 覆盖与分页漂移识别。

**v2.14.3**：增加跨包所有权保护；保留 `wl-skills-ui` 管理的编辑器规则，并合并共享 MCP 配置。

**v2.14.2**：修正项目自检对包生成的 Husky 直调命令的识别，确保安装与自检口径一致。

**v2.14.1**：集中式页面定义形成可配置、可审计的门禁闭环。

- `features.definitionSource` 只负责确认页面 `data.ts` 的 import/export 委托链；
  `.wl-skills-validate.json.definitionValidators` 再执行项目级语义校验，避免“跳过误报”演变为“跳过验证”。
- `excludePagePaths` 显式排除样式入口等非业务页面，不按目录名或客户项目硬编码。
- 普通 `validate` 仅由 error 阻断，warn 保留提示；`--strict` 仍对 error/warn 零容忍。
- K14 将业务源码类型错误与 `node_modules` 依赖源码错误分层，前者阻断、后者汇总提示，
  防止依赖噪声掩盖真实业务错误。

**v2.14.0**：页面、接口、字段边界和字典形成通用确定性闭环。

- **字段来源优先**：字符串长度、正则、数值范围和精度只读取机器契约及其 `constraintSource`，不按字段名、页面名或业务域猜测。
- **页面/API 精确对齐**：仅在页面存在机器 API 契约时启用 S6，核对查询、列表、表单、创建必填、固定上下文和多资源绑定；纯展示字段可用 `contractField:false` 单点豁免。
- **分页安全默认值**：无项目配置时回退 `current=1,size=10,maxSize=200`；K15 按生效 Profile 同时检查状态初值和实际请求，合理的项目覆盖不误报，越界请求才阻断。
- **运行时可理解性**：K16 提示直接 `structuredClone` 的兼容风险和直接展示原始异常消息的用户体验风险，引导使用项目级克隆与错误映射能力。
- **字典精确闭环**：D1/D2 比对结构化字典契约与真实字面量引用，不依赖 `status/type/flag` 等命名启发式。
- **通用性边界**：执行器不内置客户、模块、表名、页面路径或业务状态；没有足够机器证据时报告“待补契约”，不会猜测并修改业务代码。

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

**v2.12.4**：存量项目升级入口收口（当时的路径迁移策略；v2.16 起进一步受 manifest 所有权保护）。

- **旧 Skill 迁移**：当时引入 `env-config → standard-env-config` 路径迁移；v2.16 起仅清理旧 manifest 拥有且未修改的文件，所有权不明内容只提示不删除。
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

- **新增 K13 圈复杂度执行器（standard 04）**：对每个函数计 McCabe 圈复杂度（与 ESLint `complexity` 一致），`>10` 报 error 阻断；补"降复杂度手法"示例
- **新增 K14 类型错误零容忍（standard 09 升级为 🔴必遵）**：委托 `vue-tsc/tsc --noEmit` 解析 TS error，`validate --typecheck` / MCP `typecheck:true` 触发，无 checker 优雅降级；ESLint 管风格、K14 管正确性，职责分离
- **新增 validate 项目级豁免配置**：`.wl-skills-validate.json` 对表单设计器/行内编辑明细表等 BaseTable 受限场景批量豁免 K3/K10，零功能影响（kit 不主动创建）；与单文件注释豁免互补

**v2.11.1**：精准卡控闭环 —— 把"约定"接线到确定性执行器，生成即精准。

- **page-spec 落盘 + spec-align 确定性比对（S1~S7）**：`page-codegen` 生成页面时同步写出 `page-spec.json`（原型约定真值），`validate` 用 AST 解析 `data.ts` 并逐项比对查询字段、表格列、工具栏、操作列和 label；S6 核对页面/API 字段，S7 核对进阶查询/选择回填生命周期与字段绑定。
- **新增 `wl-skills fix` 确定性机械修复**：对幂等、零语义判断的偏差（BaseTable 补 `render-type`、`::v-deep`→`:deep()`、行尾空白、文件末尾换行）做确定性自动修复，AI 只处理需语义判断的部分；`--dry-run` 预览
- **新增「规则 → 执行器」覆盖矩阵治理**：`kit-internal/rule-coverage.md` 登记每条约定由谁兜底（R*/S*/regex/AI），`lint:skills` 校验标记「阻断」的规则必须有真实执行器，杜绝"文档约定"退化为纯文档
- **修复 v2.11 目录迁移遗留**：`lint-skills.js` / `verify-version.js` / `sync-version.js` 的 `.github/` 路径全部修正为 `.wl-skills/`，CI 自检链路恢复可用

**v2.8.0**：Mock 架构体系固化 + `mock-clean` CLI 命令。

- 新增 `docs/mock-architecture.md` — Mock 目录约定、开关机制、模块化规范、一键清理流程
- 新增 `mock/_utils.ts` 种子文件 — v2.8 当时由 `init` 自动写入；v2.16 起改为按 `mockPolicy`/已有业务 Mock 安装
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
- `init/update/diff/clean/check/validate/validate-page/doctor-ui/component/export` 覆盖安装、升级、对比、清理、体检、页面完整性检查、标准组件按需落盘、UI 接入诊断和基线导出
- 页面模板升级为 `BaseTable + render-type="agGrid" + cid + defineColumns + renderOps` 最终标准，融合 `wl-skills-ui` runtime，但保留 `common-core` 平台骨架
- 新增 `doctor-ui` / `validate-page`：检查 `wl-skills-ui` 接入、AGGrid/cid、操作列、按项目策略启用的 Mock、api.md 等关键偏差
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
│   │   ├── docs/                         组件 API 文档 + Mock 架构规范
│   │   ├── reports/                      领域基线模板（菜单/字典/权限）
│   │   ├── src/                          受隔离的组件参考实现（不直接覆盖业务源码）
│   │   └── templates/                    领域样例（只作参考，项目 Profile/策略优先）
│   └── mock/                             Mock 共享工具种子（_utils.ts，按策略安装）
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
│   ├── skills/                           13 个启用 Skill（全部激活）
│   │   ├── _registry.md                  ★ 触发词 → SKILL 路径单一数据源
│   │   ├── _compat/                      多 AI 编辑器适配（配置 + headers）
│   │   ├── core/                         核心通用 Skill
│   │   │   ├── prototype-scan/   { SKILL.md, USAGE.md }
│   │   │   ├── spec-doc-parse/   { SKILL.md, USAGE.md }
│   │   │   ├── api-contract/     { SKILL.md, USAGE.md }
│   │   │   ├── page-codegen/     { SKILL.md, USAGE.md, templates/ }
│   │   │   ├── convention-audit/ { SKILL.md, USAGE.md }
│   │   │   ├── business-doc-extract/ { SKILL.md, USAGE.md, templates/ }
│   │   │   ├── template-extract/ { SKILL.md, USAGE.md }
│   │   │   └── status-column-audit/ { SKILL.md, audit-status-columns.mjs }
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
│   ├── templates/                        领域样例（不直接复制其演示数据到业务源码）
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
├── kilo.jsonc / .kilo/kilo.jsonc         Kilo Code 项目规则 + MCP 增量注册（复用现有位置）
├── .kilo/rules/wl-skills.md              Kilo Code 项目规则入口
├── .kilo/skills/<skill>/SKILL.md          Kilo 原生发现薄适配器（流程仍指向 .wl-skills）
├── .trae/rules/conventions.md            Trae（含 alwaysApply frontmatter）
├── .qoder/rules/conventions.md           Qoder
│
├── .wl-skills-validate.example.json      ← validate 配置示例（mockPolicy/exclude/validator）
├── .wl-skills-validate.json              ← 可选：项目真实策略（kit 不创建、不覆盖）
├── mock/                                 ← 仅 mockPolicy=required 或已有业务 mock 时按需出现
│   ├── _utils.ts                         共享工具（pageResult / ok / paginate / nowStr / pick）
│   └── [业务域]/[模块].ts               按域分目录，page-codegen 自动生成
│
└── src/
    ├── components/                       项目业务组件；仅显式 component ensure 确认后按需落盘
    └── types/                            项目类型文件；kit update 不直接覆盖
```

> **业务项目方准则**：
>
> - 主入口是 `.wl-skills/copilot-instructions-full.md`（Copilot 用），业务项目根的薄壳文件指向它；**其他根配置文件是它的拷贝 + 各自特化 frontmatter**
> - 修改规范 → **不要**改业务项目里的副本，**升级 wl-skills-kit 包 + `update`** 才不会被覆盖
> - reports/ 里的内容是团队累积数据，`update` 不会覆盖，可放心 commit

---

## 场景模板怎么用（wl-scenario）

领域场景的"结构 + 展示方式"以 JSON 呈现，实现由 kit 确定性渲染（AI 零自由度）。
契约见 [wl-scenario-template.schema.json](files/.wl-skills/contracts/wl-scenario-template.schema.json)，
双轨/往返保证见 [场景模板契约](files/.wl-skills/docs/scenario-template.md)。

```bash
# 校验场景 JSON（create 按钮/handler 安全边界/runtime 标准动作等硬约束）
wl-skills scenario validate --input contracts/customer.scenario.json

# 预览 → 确认渲染（codegen 轨四件套；runtime 轨 definition + 薄壳）
wl-skills scenario render --input contracts/customer.scenario.json
wl-skills scenario render --input contracts/customer.scenario.json --confirm

# 存量页面反向沉淀为场景 JSON（旧形态兼容，产物 canonical 升级）
wl-skills scenario extract --page src/views/sale/customer --output contracts/customer.scenario.json

# 已有 page-spec 零手写引导为 scenario（原型扫描/说明书解析产物直接确定性渲染）
wl-skills scenario from-spec --input page-spec.json --service sale --resource customer --table-cid cust-0001 \
  --output contracts/customer.scenario.json --confirm
```

性能/算力（`node scripts/benchmark-scenario.js` 实测）：单页 render ~0.5ms、批量 20 页 ~8ms、
**模型 token 0**（vs AI 主流程每页输入 ~2 万 + 输出 ~3.5 千 token）；同一 JSON 字节级复现，
`tests/scenario-benchmark.test.js` 锁定量级承诺。防漂移：render 自动写入 `scenarioRef`，
`wl-skills validate` 内置 W1 逐字节核对，手改产物提交即拦截。

已实现 pattern（7/9）：codegen 轨 `list` / `master-detail` / `tree-list` / `form-route`（平铺分区变体）/
`record-form` / `change-history` + runtime 轨 `workstation`；全部达成 extract→compile 字节级定点往返。
runtime 的 `detail-tabs` / `tabs` 为 planned（渲染器组件形态待项目沉淀）。

---

## CLI 命令

所有命令默认作用于当前工作目录；如需先预览，请加 `--dry-run`。

```bash
wl-skills validate-page src/views/produce/order
wl-skills doctor-ui                 # 项目接入 wl-skills-ui 时
wl-skills validate --typecheck      # CI 或交付前
```

### 4. 校验、审计和修复

```bash
# 全量页面检查：AST K1~K20、spec-align、Mock、组件契约
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

K20 专门防止长工作台下部内容被裁切：当 `app-page-container` 中同时存在多个固定高度 `BaseTable` 且未使用 `jh-drag-row/col` 分栏时，根容器必须在 `index.scss` 或其递归引入的本地共享 SCSS 中声明 `overflow:auto/scroll`。`validate --pre-commit` 会识别仅暂存的 SCSS，并从共享样式反查受影响页面。

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

场景的"结构 + 展示方式"进一步落为 wl-scenario JSON 后可确定性渲染——见
[场景模板怎么用（wl-scenario）](#场景模板怎么用wl-scenario)；Blueprint 负责检索发现，
Scenario 负责生成还原。

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

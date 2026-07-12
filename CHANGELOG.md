# Changelog

## [2.12.5] - 2026-07-12

### Added

- **字典项目级协调**：`wls_dict_upsert` 支持自动发现当前项目全部模块 `dicts.ts`，一次建立线上索引并生成 `safe-additive` 计划；保留单模块范围，二者共用差异、执行和回查引擎。
- **旧项目标准化引导**：新增 `wls_dict_bootstrap`，可从页面 `api.md dict-contract` 预览并创建缺失的本地 `dicts.ts`；资料不足时只列 `logicValue/useDictOpts` 候选，不猜枚举、不访问线上。
- **字典契约门禁**：新增静态字典契约引擎和 D1 校验，覆盖页面契约聚合、唯一归属、显式排序、静态 AST 解析及项目内真实路径边界。

### Changed

- **发布确认升级**：正式字典写入必须携带预览 `planHash`；执行前重读本地与线上，状态变化时零写入并要求重新预览。
- **安全增量语义**：完全一致的跳过，只新增缺失模块、字典和明细；名称、排序、value/label、扩展字段或大小写归属漂移全局阻断；线上额外项不覆盖、不删除。
- **MCP 与凭据治理**：MCP Tool 增至 21 个，补齐协议协商、结构化输出、风险标注和业务错误处理；本地 token 改由 `env.example.json` 初始化，update/clean 保留且 npm 包不再携带 `env.local.json`。

### Fixed

- **字典顺序稳定性**：新字典使用明确的 `orderField/orderRule` 和确定性明细顺序，不再依赖创建先后；写入后完整分页回查。
- **并发与恢复**：同一应用和项目的发布串行化；多请求中断返回已完成项，重新预览后可幂等补齐，不执行危险回滚删除。

## [2.12.4] - 2026-07-11

### Fixed

- **存量项目升级清理**：`update` 自动移除已退役的 `skills/ops/env-config/` 文件，避免编辑器同时发现新旧两个环境 Skill。
- **使用入口补齐**：README 与 `standard-env-config/USAGE.md` 新增存量项目升级命令、最短自然语言提示词和自定义 Profile 表达。

## [2.12.3] - 2026-07-11

### Added

- **标准环境配置独立能力**：新增 `standard-env-config` Skill、`standard-env` CLI，以及 `wls_standard_env_scan` / `apply` / `verify` 三个 MCP Tool，覆盖扫描、计划、事务迁移、静态验证、五环境构建和幂等检查。
- **通用环境 Profile**：华新环境必须显式选择；其他域名、内网 IP、端口场景使用完整自定义五环境 Profile，避免静默混用客户地址。

### Changed

- **存量子应用统一结构**：将旧网关或 `172 + 9000` 项目迁移为单 `.env`、`dev/sit/uat/pre/prd` 五环境、三种开发模式和模块化 Vite 配置，同时保留可识别的 alias、插件与扩展代理。
- **旧入口退役**：停止 `wl-skills env` 写入能力和 `wls_env_*` 公共注册，并移除旧实现，防止过时规则继续改造项目。
- **真实项目验收**：使用 `wl-ui-safe` 完成迁移实验，五环境配置解析、静态验证、`dev/sit/uat/pre/prd` 全量构建与二次 no-op 均通过。

## [2.12.2] - 2026-07-04

### Changed

- **env-config 补齐 Vite 硬编码迁移**：扫描和 apply 计划新增 `configChanges`，可识别并迁移 `vite.config.*` 中的 `webMap` / `webApiMap` / `[baseApi]` 代理 target，以及 `public/env-dev.json` 的本地运行时地址。
- **客户环境 Profile 增强**：`profileData` / `profileFile` 支持 `{ appName, baseUrls, proxyPrefixes }` 简写，适配 172、华新、客户环境之间互切；服务前缀继续按 `sit-api`、`uat-api`、`pre-api`、`prod-api` / `prd-api` 规范沉淀。
- **安全开关与文档同步**：CLI 新增 `--no-migrate-vite`，MCP 新增 `migrateViteConfig: false`，特殊项目可只处理 env 文件；README、Skill、Pipeline 和风险矩阵同步更新边界说明。

## [2.12.1] - 2026-07-04

### Changed

- **补齐 env-config 使用文档**：README 新增“前端环境配置怎么用”，明确 scan、dry-run、apply、MCP 调用、自定义客户 Profile、报告与备份位置。
- **完善团队落地手册**：`env-config/USAGE.md` 补充新项目初始化、172/旧客户迁移、生产前缀差异、硬编码 URL 处理边界和人工确认流程，方便团队按统一闭环使用。
- **README 索引补齐**：Skill 概览和进一步阅读新增 `env-config` 入口，避免能力已发布但文档入口分散。

## [2.12.0] - 2026-07-04

### Added

- **前端环境配置标准化能力**：新增 `env-config` Skill，覆盖 4/5 套环境、客户迁移、172 地址迁移、baseURL 与 `/api` / `sit-api` / `uat-api` / `prod-api` / `prd-api` 梳理。能力边界限定为前端项目，不处理后端、Nginx、Docker、Java 或配置中心。
- **`wl-skills env` CLI**：`env scan` 只读扫描，`env apply` 默认 dry-run，`env apply --apply` 才正式写入前端 env 文件；写入前自动备份到 `.wl-skills/reports/env-backups/`，并输出 `ENV_CONFIG_*.md` 报告。
- **`wls_env_scan` / `wls_env_apply` MCP Tool**：纯本地工具，不需要 token；`wls_env_apply` 未传 `confirmApply: true` 时永远只预览，防止 Agent 误写环境文件。
- **文档与路由更新**：`_registry.md`、`_best-practices.md`、`_pipeline.md`、README 与风险矩阵同步新增环境配置场景，Skill 数量更新为 12，MCP Tool 数量更新为 19。

## [2.11.11] - 2026-07-04

### Changed

- **统一 `.wl-skills` 优先路径**：MCP 菜单同步、项目审计报告和 `wl-skills check` 均优先读取 `.wl-skills/reports` 与 `.wl-skills/skills/sync/env.local.json`，旧 `.github` 路径仅作向下兼容。
- **角色授权安全护栏**：`wls_role_assign_menus` 新增 `confirmFullReplace: true` 显式确认要求，避免把全量覆盖接口误当增量接口使用。
- **文档与模板收敛**：清理当前文档中的旧 `.github` 口径、13 条规范旧计数和 token 示例，补齐字典/授权同步的最新闭环说明。

### Security

- **依赖安全加固**：升级 `vitest` 并通过 pnpm overrides 固定 `vite`、`esbuild`、`tmp` 的安全版本，`pnpm audit --audit-level moderate` 无已知漏洞。

## [2.11.10] - 2026-07-04

### Fixed

- **业务字典 MCP 三层同步闭环**：`wls_dict_upsert` 改为业务模块 → 字典 → 字典明细的真实结构，补齐 `sysAppNo` 请求头、创建前查询、冲突保护、明细增量追加和 `value/label` 到 `strKey/strValue` 的稳定映射，避免把字典明细误建成模块污染左侧树

### Changed

- **字典规范前置统一**：原型、详设、page-spec、api.md 与 dict-sync 文档统一使用 `dictCode + dictName + items[{ value, label }]`，字典编码以线上/后端确认为准，不再强制命名风格；`strValueCode` 由 MCP 自动生成安全后缀

## [2.11.9] - 2026-07-03

### Added

- **菜单同步自动反推 domainId**：新增 `getPermissionMenuTree` 接口链路（`queryPermissionMenuTree` + `resolveDomainId` + `locateAppDomain`），仅需 `token` + `sysAppNo`（或应用域名称关键词）即可自动倒推 `domainId` / `parentMenuId` / `sysAppNo`，不再依赖用户手动从 Network 面板抄取。`handleMenuQuery` 与 `handleMenuSyncFromReport` 在 `domainId` 缺失或为占位符时自动反推，链路不再卡死。已用主数据管理（mdata）应用域真实接口验证通过

## [2.11.8] - 2026-07-02

### Changed

- **权威属性源标注升级**：在线索引（`component-online-index.md`）与 `copilot-instructions-full.md` 标注 **props.ts 为最权威属性源**（优于 `lib/*.d.ts`）。原因：`lib/*.d.ts` 的 `ExtractPropTypes` 只推断 `defineComponent` 显式声明 props，大量属性通过运行时注入（如 user-picker 26 个属性在 .d.ts 里是空 `{}`），而 `schema-component/{group}/{name}/props.ts` 是设计器全量属性清单，无遗漏。三级优先级：① props.ts ② lib/*.d.ts ③ 在线文档

## [2.11.7] - 2026-07-02

### Added

- **组件 API 在线查询机制（健壮性提升）**：新增 `files/.wl-skills/docs/component-online-index.md`，提供 **35 个组件**（Base×5 + jh-×25 + C_/c_×5）的名称→在线路径映射表。三层保障：kit 精简参考（11 个）→ webfetch 在线完整文档（35 个）→ common-core/lib 声明最终仲裁。双通道查询（Vercel 站点优先 + GitHub Raw 兜底）。当 AI 遇到 kit 未收录组件（jh-input/jh-dialog/jh-drawer/jh-cascader 等）或 API 不确定时，主动查在线文档，不再靠猜
- `copilot-instructions-full.md` 与 `standards/13-platform-components.md` 增补在线查询指引入口

### Changed

- `jh-user-picker.md`：标注声明层 props 为空（`UserPickerComponent.d.ts` 的 `ExtractPropTypes<{}>`），仅 `Record<string, any>` 透传；`disabled`/`clearable` → `status`（统一控件状态控制）

## [2.11.6] - 2026-07-01

### Fixed

- **全仓库 `wk-skills-ui` 旧名漂移清零（17 文件）**：真实配套包已改名 `@agile-team/wl-skills-ui`，但本仓大量残留旧名 `wk-skills-ui`，导致两个硬故障：
  - **6 个页面生成模板**（`TPL-LIST`/`TPL-TREE-LIST`/`TPL-MASTER-DETAIL`/`TPL-RECORD-FORM`/`TPL-FORM-ROUTE`/`TPL-DETAIL-TABS`）的 `import ... from "@agile-team/wk-skills-ui/runtime"` 直接生成无法 import 的业务代码 → 改为 `wl-skills-ui`
  - **doctor-ui / MCP `wls_doctor_ui` 接入检测**（`bin/wl-skills.js` + `mcp/tools/projectTools.js`）原查 `deps["@agile-team/wk-skills-ui"]`，对真实包**永远检测不到**（接入检查恒为失败）→ 改为兼容新旧名（`wl-skills-ui || wk-skills-ui`），正则放宽 `w[lk]-skills-ui`，迁移期老项目仍能命中；CLI 命令 `wk-ui`→`wl-ui`
- **jh-* 组件归属错误（4 处硬伤）**：`jh-drag-row`/`jh-drag-col` 实际来自 `@jhlc/common-core`（`@jhlc/jh-ui` 是纯 SCSS 包，零组件），修正 `standards/14-layout-containers.md`、`templates/sale/demo/metallurgical-spec`、`templates/sale/demo/add-demo`、`TPL-DETAIL-TABS` 中"@jhlc/jh-ui 全局注册组件"的错误表述
- **平台包职责澄清**：`copilot-instructions-full.md` 与 `guides/architecture.md` 增补 `@jhlc/common-core`（全部 `jh-*`/`Base*`/`C_*` 组件 + 运行时）与 `@jhlc/jh-ui`（纯 SCSS 设计令牌 + Element Plus/Vant 主题覆盖，零组件）的职责边界，消除"@jhlc/jh-ui 含组件"的误读

### Changed

- **jh-* 组件文档逐属性勘误（7 篇）**：基于 `@jhlc/common-core/lib/*Component.d.ts` 真实声明逐一核对，修正虚构/错误 API：
  - `jh-select.md`：`BusLogicDataType.enums → SelectComponent` **虚构**（源码实际落 `InputComponent`）；`disabled` → `status`；补全 `select`/`blur`/`visibleChange` 事件
  - `jh-picker.md`：`pickerType`/`multiple`/`disabled`/`clearable` **均不在声明**；`multiple` → `:single="false"`；`valueAttr`/`labelAttr`/`dataAttr` 默认值 `["id"]`/`["name"]`/`["data","records"]` 虚构（实为 `[""]`）
  - `jh-date-range.md`：**`placeholder` 属性不存在**（仅 `startPlaceholder`/`endPlaceholder`），基本示例原用不存在的属性；补 `DateTimeRangeComponent` 关联说明
  - `jh-date.md`：`change` 事件虚构（实为 `blur`）；`disabled` → `status`
  - `jh-textarea.md`：`change` 虚构（实为 `input`/`focus`/`blur`）；删 `disabled`/`clearable`
  - `jh-pagination.md`：**`background` 属性不存在**（动摇其"内置默认 layout/background"卖点）；补 `small`/`showTotal`/`showPageSize`/`showJumper`
  - `jh-dept-picker.md`：`checkStrictly`/`clearable` 虚构删除
  - `jh-file-upload.md`：`readonly` 不存在 → `:disabled="true"`；`relativeId` 类型修正为 `string`

## [2.11.5] - 2026-06-21

### Fixed

- **全仓库文档滞后清零**：v2.11.0 目录从 `.github/` 迁移到 `.wl-skills/`、v2.11.2 规则从 R1~R12/R1~R7 扩展到 R1~R14、Skill 从 10→11、规范从 13→14 后，多处当前生效文档/代码注释未同步：
  - `files/.wl-skills/guides/usage.md` 项目结构树整体仍用 `.github/` + 13 条/10 个 → 改为 `.wl-skills/` + 14 条/11 个
  - 代码注释滞后：`lib/ast-rules.js`/`bin/wl-skills.js`/`mcp/tools/projectTools.js` 仍写"R1~R7"/"7 条语义规则" → R1~R14
  - `files/.wl-skills/copilot-instructions-full.md`/`page-codegen SKILL.md` 豁免说明"R1~R12" → R1~R14
  - `kit-internal/README.md`/`convention-audit USAGE.md`/`docs/全盘分析`/`docs/ai全景分析`/`AI工作流演进` 中"13 条规范"/"10 个 Skill" → 14 条/11 个
  - CHANGELOG 历史条目与 `kit-internal/history/` 归档文件保留原样（记录当时状态）

## [2.11.4] - 2026-06-21

### Added

- **R14 类型检查自动接线（pre-push hook）**：`init`/`update` 自动创建 `.husky/pre-push`，推送前跑 `validate --typecheck`（R14 vue-tsc 类型检查）。补齐"pre-commit 跑 R1~R13、pre-push 跑 R14、CI 跑 R1~R14"三层确定性兜底，R14 不再是 opt-in 空规则
- **validate 端到端集成测试（tests/validate.test.js）**：通过真实 CLI 二进制跑完整 validate 流程，覆盖正则级（agGrid/cid/defineColumns）+ AST 级（R3/R13）+ 合规页 + 豁免配置。补齐 runValidate 主体的零覆盖缺口（"自吃狗粮"）
- **convention-audit 豁免项复核**：审计步骤新增"读取 .wl-skills-validate.json 列出所有豁免条目"，供人工逐条确认豁免是否仍需保留（豁免审计闭环）

### Changed

- **kit 自身代码质量门禁修复**：修复 13 个 eslint error（8 处未用变量 + 4 处嵌套过深 + 1 处死代码），`lint-staged` 匹配范围从无效的 `src/**` 改为 `bin/lib/scripts/**`，`pnpm lint` 纳入 `verify`/`prepublishOnly`。kit 自身代码不再绕开规范
- **runAstRules 重构降复杂度**：抽出 `checkR8FileSeparation`/`checkR13Complexity` 独立 helper，降低主函数圈复杂度（84→更低），消除 R9 死代码（hasInterfaceTable/hasEntityDef）

### Fixed

- **jenkins-pipeline.md 滞后**：3 处 `.github/` → `.wl-skills/`（v2.11.0 目录迁移遗留未同步）；Typecheck 独立 stage 合并进 `validate --strict --typecheck`（R14 不再割裂）
- **R14 配置错误误报**：`vue-tsc` 退出码非 0 但无标准 TS error 行时，区分 tsconfig 配置问题（warn，非类型错误）与未知失败（error），避免误导用户改类型
- **lint-skills printFixSuggestions 残留**：`.github/standards/` 引用修正为 `.wl-skills/`

## [2.11.3] - 2026-06-21

### Added

- **validate 项目级豁免配置（零功能影响）**：业务项目根可放 `.wl-skills-validate.json`，对表单设计器/行内编辑明细表等 BaseTable 受限场景批量豁免 `R3`/`R10`，kit 不主动创建、不存在时行为完全不变。新增 `lib/ast-rules.js` 的 `loadExemptions`，`runAstRules` 内部加载（CLI/MCP 自动一致）；与单文件注释豁免（`wl-skills:ignore R3`）互补。配置 schema 详见 `.wl-skills/docs/validate-exempt.md`
- **standards/12 豁免规则重写**：明确"标准列表强制 BaseTable+AGGrid / BaseTable 可胜任仍优先 BaseTable / BaseTable 受限特殊场景可降级 el-table"三层优先级，两层豁免机制（单文件注释 + 项目级配置），不再一棍子拍死

### Fixed

- **README/脚本系统性滞后修正**：v2.11.0 目录从 `.github/` 迁移到 `.wl-skills/` 后，README 大量路径残留未同步；`sync-version.js`/`verify-version.js` 仍硬编码"13 条"（规范已升 14 条），导致 verify-version 的 headers 校验**静默失效**、`npm version` 触发 sync-version 会把"14 条"**回写成 13 条**。全部修正为 14 条 + `.wl-skills/` 路径，校验链路恢复
- `_compat/headers/{cursor-mdc,trae,kiro}.txt` 源文件注释 `.github/copilot-instructions.md` → `.wl-skills/copilot-instructions-full.md`

## [2.11.2] - 2026-06-21

### Added

- **R13 圈复杂度执行器（standard 04，阻断级）**：新增 `lib/ast-rules.js` 的 R13，对 `index.vue`/`data.ts` 的每个函数计算 McCabe 圈复杂度（与 ESLint `complexity` 规则定义一致），`> 10` 报 error 阻断提交。补齐 standard 04 第 14 条核心约定 + 降复杂度手法示例（提前 return / 查表驱动 / 抽子函数）
- **R14 类型错误零容忍执行器（standard 09，阻断级）**：新增 `runTypeCheck`，委托 `vue-tsc --noEmit`（回退 `tsc`）解析 TS error；无 `tsconfig`/checker 时优雅降级 warn。CLI 新增 `--typecheck`、MCP `wls_validate_page` 新增 `typecheck` 入参双通道一致。CI 应固定 `validate --typecheck --strict`

### Changed

- **standard 09 由 🟡建议 升级为 🔴必遵 + 阻断**：`vue-tsc --noEmit` 必须 0 error，职责分离——ESLint 管风格，R14 管类型正确性
- `rule-coverage.md` 执行器图例 R1~R12 → R1~R14，登记 R13/R14 两条阻断约定；`convention-audit` 维度 09 改为 R14 委托
- `eslint.config.ts` 复杂度 `warn 60` 修正为 `warn 10`（项目级硬阻断由 R13 兜底，此处仅作 kit 自身开发提示）

## [2.11.1] - 2026-06-15

### Added

- **page-spec 落盘 + spec-align 确定性比对（S1~S5）**：新增 `lib/page-spec.js` 引擎，把"按原型精准实现"从 AI 自觉升级为代码卡控。page-codegen 生成时落盘 `page-spec.json`（单一真值），`validate` 自动比对 `data.ts` 实际实现：
  - S1 查询字段顺序（warn）/ S2 表格列顺序与集合（error）/ S3 工具栏按钮顺序·集合·颜色（error）/ S4 操作列按钮严格对应（error）/ S5 按钮·列 label 文字保真（warn）
  - 同步接入 MCP `wls_validate_page`，CLI 与 MCP 双通道一致
  - 新增 `.wl-skills/docs/page-spec-schema.md` 字段规范
- **`wl-skills fix` 确定性机械修复（F1~F5）**：新增 `lib/safe-fix.js`，对幂等零语义偏差自动修复——BaseTable 补 `render-type="agGrid"`、`::v-deep`/`/deep/` → `:deep()`、行尾空白、文件末尾换行；支持 `--dry-run` 预览。语义级偏差仍交 AI/人工
- **规则覆盖矩阵治理**：新增 `kit-internal/rule-coverage.md`，登记每条约定的执行器（R*/S*/regex/AI）；`lint-skills.js` 校验标记「阻断」的规则必须有确定性执行器，防止"文档约定"退化

### Changed

- **C_Splitter 彻底删除**：从 kit 移除 `C_Splitter` 组件（`onMounted` 冻结 vnode 导致响应式失效的 bug 写法），`lint-skills` 全量禁止 `<C_Splitter>` / `import C_Splitter`（无任何例外），standards/14 更新为"已删除"
- page-codegen SKILL.md 新增"生成时落盘 page-spec.json + 自检跑 spec-align"硬约束
- **维护链路统一 pnpm-first**：新增 `packageManager: pnpm@11.5.3`、`pnpm-lock.yaml`、`pnpm verify` / `pnpm ci`，删除 `package-lock.json`；npm 仅保留在 `npm pack` / `npm publish` 发版环节
- **导出依赖安全替换**：`wl-skills export` 从存在高危漏洞的 `xlsx@0.18.5` 迁移到 `write-excel-file`，并将运行时 Node 基线提升到 `>=18`

### Fixed

- 修复 `scripts/verify-version.js` / `scripts/sync-version.js` / `scripts/lint-skills.js` 仍指向旧版 `.github/` 路径导致 v2.11 后完全失效的问题（统一迁移到 `.wl-skills/`）
- 清理仓库根残留的旧版 `.wl-skills-manifest.json`（v2.6.0）
- 移除仓库 `.npmrc` 中误提交的 npm token，仅保留 registry 配置；本地私密 npmrc 已加入 ignore
- 修复 `export` 仍读取旧 `.github/reports` 的迁移漏点，现优先读取 `.wl-skills/reports` 并兼容旧目录

## [2.11.0] - 2026-06-14

### Changed

- **目录架构重构：.github/ 散落 → .wl-skills/ 统一隔离**：所有 Skill、规范、指南、报告、文档、模板统一收纳到 `.wl-skills/` 目录，项目根目录仅保留 7 个编辑器入口薄壳文件，一步清理、一步还原
- **入口文件薄壳化**：`copilot-instructions.md` 从 19KB 完整指令瘦身为 ~1KB 入口指引 + 内容目录，完整指令迁移到 `.wl-skills/copilot-instructions-full.md`（完整地图架构）
- **完整地图架构**：入口文件包含完整 Skill 路由表（11 个 Skill + 触发词 + 读取路径）、14 条规范清单、10 个场景速查、5 条护栏，AI 读完入口即知全貌，无需追链
- **_compat 适配层迁移**：`_compat/editors.json` + `headers/` 从 `.github/skills/_compat/` 移至 `.wl-skills/skills/_compat/`
- **init/update 自动迁移**：`wl-skills update` 自动检测并清理旧版 `.github/skills|standards|guides|reports/` 目录，迁移到新结构
- **clean 命令适配**：`--keep-reports` 同时兼容旧版 `.github/reports/` 和新版 `.wl-skills/reports/` 路径
- **保护路径扩展**：`.wl-skills/src/components/` 和 `.wl-skills/src/types/` 纳入 clean 保护

### Migration

- 已安装 v2.10.x 的项目执行 `pnpm dlx @agile-team/wl-skills-kit@latest update` 即可自动迁移
- 旧版 `.github/skills/`、`.github/standards/`、`.github/guides/`、`.github/reports/` 目录将被自动清理
- `.github/copilot-instructions.md` 自动替换为薄壳入口

## [2.10.1] - 2026-06-14

### Added

- **pre-commit 阻断修复建议输出**：`wl-skills validate` 阻断时自动输出格式化修复建议框，含 AST R1~R12 规则映射和正则检查建议，标注可自动修复项，引导触发 `规范审计 → 自动修复 → 复扫验证` 流程
- **code-fix 强制复扫验证**：新增步骤[6]闭环关键步骤，修复完成后必须自动执行 `wl-skills validate` 复扫，用户不可跳过
- **convention-audit --quick 复扫模式**：仅复查上次报告中的 🔴🟡 项，token 消耗约全量 10%，适用于 code-fix 后轻量级闭环验证
- **_pipeline.md 闭环强化**：code-fix→validate 从"建议"升级为"强制"约定，新增强制执行 vs 建议执行对照表
- **_registry.md 加固调度规则 10-12**：闭环强制约定、高风险 Skill 确认机制（page-codegen/sync 类/code-fix）、误触发防护
- **_best-practices.md 场景 5 闭环补全**：完整闭环流程含强制复扫步骤和触发话术
- **copilot-instructions.md AI 执行护栏**：新增 5 条强制约定（闭环强制、确认机制、误触发防护、Pre-flight 声明、修复建议输出规范）

### Fixed

- 修复 `printFixSuggestions` 对未知规则静默跳过的问题，新增兜底输出
- 修复 copilot-instructions.md 高风险 Skill 列表与 _registry.md 不一致的问题

## [2.10.0] - 2026-05-31

### Added

- **新增 `spec-doc-parse` Skill（规范线）**：专门解构 wl-skills-design 产出的标准《需求设计说明书》（IPO 表 / 功能编码 / 流程五要素），输出与 `prototype-scan` 完全相同格式的 page-spec JSON，自带 Pre-flight 校验 + Parse Validation 五项检查 + 自动修复纠偏 + 解析报告（`SPEC_PARSE_*.md`）
- **`convention-audit` 新增 `--mode spec-align`（GAP 报告）**：比对 spec 定义字段 vs 代码实际字段，输出 `SPEC_GAP_*.md`，完成「说明书 → 代码」零损耗闭环验证

### Changed

- **双线隔离（原型线 / 规范线）**：`_registry.md` 调度规则新增「优先级 0」——输入命中 `docs/spec/` / 功能编码 `/[A-Z]{2,6}[0-9]{3}/` / IPO 表特征时强制路由 `spec-doc-parse`，禁止 `prototype-scan` 接管；两线最终汇聚同一份 page-spec JSON，下游无感知
- **`prototype-scan` 模式 B 收敛**：由「详设文档」收敛为「非规范零散详设」，加入排除声明，避免与标准说明书混淆
- 同步更新 `_pipeline.md`（规范线分支 + I/O 契约）、`copilot-instructions.md`（Intent Router）、`kit-internal/architecture.md`（ADR-009）、`lint-skills.js`（spec-doc-parse 纳入写操作 Skill 校验）
- 启用 Skill 数 10 → 11

## [2.9.4] - 2026-05-18

### Fixed

- **规范条数 13→14 全面对齐**：`standards/index.md` 已升级至 14 条（新增 `14-layout-containers.md`），同步修复以下 7 个文件中残留的"13 条"引用：
  - `copilot-instructions.md`、`convention-audit/SKILL.md`、`_best-practices.md`、`guides/usage.md`、`page-codegen/USAGE.md`
- **`copilot-instructions.md` 任务类型映射去重**：移除与 `standards/index.md` 重复且过期的映射副本，改为唯一指针引用
- **`copilot-instructions.md` 导入路径纠正**：代码示例中 `@jhlc/common-core/src/...` 深路径改为 `@/types/page` 桶文件导入，与 `page-codegen` 模板及 `standards/09` 规范一致
- **`prototype-scan` 交互模式枚举对齐**：`FORM_TAB` → `DETAIL_TABS`，补齐 `FORM_ROUTE / CHANGE_HISTORY / RECORD_FORM / OPERATION_STATION / TEMPLATE_DRIVEN` 5 种模式，与 `page-codegen` 模板完全一致
- **`page-codegen` Pre-flight 补齐 `standards/14`**：任务类型 A 必读规范已含 14，Pre-flight 声明同步补齐
- **`convention-audit` 审计维度表补齐 14 行**：审计维度表和覆盖矩阵模板各补一行 `14 布局容器`

## [2.9.3] - 2026-05-17

### Fixed

- **`doctor-ui` C_Splitter 残留扫描噪音过大**：
  - 豁免词扩展为 `已废弃 / DEPRECATED / 严禁 / 禁用 / 禁止 / 废弃 / 不再需要 / 已迁移 / deprecated`
  - `standards/14-*` 文件路径整体豁免（文档本身就是讲 C_Splitter 的）
  - `*.d.ts` 和 `components.d.ts` 整体豁免（unplugin-vue-components 自动生成产物）
  - 文档/规则残留改为**纯警告**，不再参与 exitCode 判定（业务代码命中才阻断）
- 实战验证：wl-mdata 仓库二次扫描从 1 处业务残留 + 18 处误报 → **0 命中**

## [2.9.2] - 2026-05-17

### Added

- **`doctor-ui` 新增 C_Splitter 残留扫描（standards/14 一致性）**：
  - 业务代码（`.vue / .ts / .scss / .js`）命中 → `✖ error`，列出文件:行号:片段
  - 文档/规则（`.md / .mdc`）命中 → `⚠ warn`
  - 自动豁免：上下文 ±1 行含 `已废弃 / DEPRECATED / 严禁 / 不再需要 / 已迁移 / deprecated`；`C_Splitter/` 组件目录自身豁免
  - 明细分组打印，单次最多列 60 条，超出汇总"另有 X 处未列出"
- **`standards/14-layout-containers.md` 扩充**：
  - §6 lint/codegen 强制项追加 `validate` / `doctor-ui` 命令矩阵
  - 新增 §7 FAQ（旧页面是否要改、阈值配置、嵌套性能、过渡期保留）
- **`tests/doctor-ui.test.js`**：4 项新单测覆盖无残留、业务代码命中、豁免词、自身组件豁免

### Notes

- 测试矩阵：cli + lint-skills + doctor-ui + registry + version-tools 合计 **53 测试通过**
- 升级路径：`pnpm dlx @agile-team/wl-skills-kit@latest update` 同步 standards/14；CI 增挂 `wl-skills doctor-ui` 即可

## [2.9.1] - 2026-05-17

### Added

- **`validate` 三项新检查**（接 v2.9.0 的 standards/14 落地阻断）：
  - 🔴 `error`：页面 `index.vue` 出现 `<C_Splitter>` 标签
  - 🔴 `error`：`index.vue` / `data.ts` 出现 `import C_Splitter`
  - ℹ `info`：提及 `C_Splitter` 的过时注释（如 `已改为 C_Splitter`、`migrate to C_Splitter`、`TODO ... C_Splitter`）
- **`scripts/lint-skills.js` 新增规则 8**：扫描 `files/**/*.{vue,ts}`，禁止任何 `<C_Splitter>` 标签或 `import C_Splitter`（仅允许 `files/src/components/global/C_Splitter/index.vue` 自身保留废弃声明）。
- **`.husky/pre-commit` 接入 `lint-skills`**：维护者侧提交时自动守门，从源头阻止 C_Splitter 回潮。

### Notes

- 实战验证：wl-mdata 现网 28 个页面 0 命中（之前已全量迁移）；故意污染测试用例可精准触发 3 项检查。
- 兼容性：所有新检查均为加法，未改动既有 validate 规则；下游项目无需调整。

## [2.9.0] - 2026-05-17

### Added

- **`files/.github/standards/14-layout-containers.md`**（新规范，🔴 必遵 + 阻断）：布局容器规范。根因解析 `C_Splitter` 在 `onMounted` 中调用 `slots.default()` 冻结 vnode 快照、导致子树响应式完全失效；明确左右分割只用 `jh-drag-col`（`#left`/`#right`），上下分栈只用 `jh-drag-row`（`#top`/`#bottom`）；附迁移对照表、lint 规则、废弃路线图。
- **`files/src/components/global/C_Splitter/index.vue`** 加入 `@deprecated` 注释 + 运行时 `console.warn`（同会话仅警告一次），引导改用 `jh-drag-col` / `jh-drag-row`。

### Changed

- **`standards/index.md`**：13 条 → 14 条；任务 A（生成新页面）/ B（修改重构）必读集合纳入 `14`。
- **`standards/13-platform-components.md`** 与 `copilot-instructions.md`：「左右分割」推荐组件由 `C_Splitter` 改为 `jh-drag-col`；明确 `C_Splitter` 已废弃及根因。
- **TPL-TREE-LIST.md**：模板示例改为 `<jh-drag-col :leftWidth="220">` + `#left`/`#right` 显式插槽；SCSS 去除 `.my-splitter-container :deep` 残留；顶部加「布局硬约束」段。
- **TPL-DETAIL-TABS.md**：示例由 `<C_Splitter direction="vertical">` 改为 `<jh-drag-row :topHeight="380">` + `#top`/`#bottom`；移除 `import C_Splitter`。
- **`page-codegen/SKILL.md`** 与 `templates/_index.md`：TREE_LIST 描述同步至 jh-drag-col；上下分栈描述同步至 jh-drag-row。
- **`prototype-scan/SKILL.md`**：原型扫描产出物示例与说明同步至 jh-drag-col。
- **`demo/sale/demo/add-demo/`** 与 **`demo/sale/demo/metallurgical-spec/`**：示例 `<C_Splitter>` 全部迁移到 `<jh-drag-row>`；SCSS 注释、README 文案对齐。

### Notes

- 兼容性：`C_Splitter` 源文件保留但加废弃警告，**不删除**，避免外部业务项目升级时立即报错；下一个 major 版本前再做物理移除评估。
- 参考案例：`wl-ui-sale` 项目所有左树右表/上下分栈页面（material、materialCategory、transactionType、unit、price-maintain、ContractEditTab 等）均使用 `jh-drag-col` / `jh-drag-row`，未踩 `C_Splitter` 冻 vnode 坑——本次规范固化的正是该实战路径。

## [2.8.0] - 2026-05-16

### Added

- **`files/docs/mock-architecture.md`**（新文档）：Mock 架构规范，涵盖目录约定（按业务域分目录 `mock/[域]/[模块].ts`）、`_utils.ts` 共享工具、`ENV_MOCK` 开关机制、STORE 可变数组持久化模式、端点覆盖检查、一键清理流程。
- **`files/mock/_utils.ts`**（种子文件）：`init`/`update` 自动写入目标项目 `mock/_utils.ts`，提供 `pageResult`/`ok`/`paginate`/`nowStr`/`pick` 五个共享工具，消除各 mock 模块重复定义。
- **CLI `mock-clean` 命令**：`--domain <name>` 按域清理（如 `mock-clean --domain mdata`）、`--all` 全量清理（保留 `_utils.ts`）、支持 `--dry-run` 预览。清理后提示修改 `ENV_MOCK` 并运行 `validate`。

### Changed

- **`copilot-instructions.md`** 新增 Mock 架构节：目录结构约定、开关机制、URL 对齐、STORE 模式、模块自治原则、`mock-clean` CLI 用法。
- **`page-codegen/SKILL.md`** 规则修正：规则 9 → `mock/[业务域]/[模块].ts` 按域分目录 + 强制 `import ../_utils`；规则 20 → 自检 `mock/_utils.ts` 存在；规则 21 → 路径格式对齐；禁止 14 → 引用 `docs/mock-architecture.md`。
- **`validate` 增强**：新增 3 项 mock 架构质量检查 —— `_utils.ts` 存在性（warn）、mock 文件是否按域分目录（info）、是否引用共享工具（info）。输出新增 `ℹ` info 级别图标。
- **`_best-practices.md`** 场景 6 扩展：从一句话描述 → 完整 mock 架构速览 + 目录树 + 开关/清理说明。
- **`--domain` / `--all` 加入 `KNOWN_FLAGS`**；flag 校验兼容 `--domain=xxx` 等号格式。

### Notes

- Mock 架构为前端最佳实践固化，已在 wl-mdata 项目验证。新项目 `init` 后即获得 `mock/_utils.ts`；已有项目 `update` 后自动补充。

## [2.7.3] - 2026-05-13

### Added

- **`tests/mcp-tools.test.js`**（30 个测试）：覆盖 `menuSync` 8 个纯函数（cleanCell / splitMarkdownRow / isDividerRow / parseBoolean / normalizeTree / flattenMenus / findExisting / parseReport）、`dictSync.extractModules`、`handleDictUpsert` 参数校验、`handleRoleUpsert` / `handleRoleAssignMenus` 参数校验，填补最易出 Bug 的 MCP 工具层零覆盖空白。
- **`.gitattributes`**：统一 `eol=lf`，消除 Windows 开发者打开文件后 CRLF 行尾符变更噪音。

### Changed

- **`scripts/lint-skills.js`** 扩展 core/ops Skill 校验：有写操作的 5 个 Skill（page-codegen / convention-audit / business-doc-extract / template-extract / code-fix）必须包含 Pre-flight 声明 + standards 引用，防止关键约束被遗漏；同时清理旧版 AI-bypass 警告规则（误报率高，作用有限）。输出信息更新为"公共文件 N 个、sync Skill N 个、write Skill N 个全部合规"。
- **`mcp/tools/menuSync.js` / `dictSync.js`**：新增 `_internal` 导出，暴露纯工具函数供单测调用，不影响运行时行为。
- **`files/.github/skills/sync/permission-sync/SKILL.md`**：275 → 240 行（-13%），命名规范表从 9 行精简为 1 行覆盖范例、后端接口参考表删去冗余 Body 示例列、报告输出改为一句话描述。

### Notes

- 纯工程质量提升，无 Skill 行为变更、无 MCP API 变更，业务项目无需操作。

## [2.7.2] - 2026-05-13

### Added

- **`skills/_best-practices.md`**（新文档）：场景级最佳实践索引。AI 每轮对话默认读取，按场景（新建模块 / 补菜单 / 补字典 / 角色授权 / 项目体检等）路由 Skill，弱化"靠关键词猜触发"。人也可当 Runbook 查阅。
- **`skills/sync/_mcp-guardrail.md`**（新文档）：sync 类 Skill 通用护栏。明确 MCP 调用纪律 + 错误分层（L0~L4）+ **自愈闭环剧本**：MCP 调用失败时引导用户完善 `env.local.json`（token/domainId/gatewayPath 等）后重试，**禁止** AI 用 curl/PowerShell/fetch 绕开 MCP 自拼 HTTP。
- **`scripts/lint-skills.js`**（新脚本）+ **`tests/lint-skills.test.js`**：静态校验 sync SKILL.md 引用 guardrail、列出"严禁 curl"纪律、无残留 `TODO_CONFIRM`，`_registry.md` 引用的 Skill 路径必须存在。`prepublishOnly` 已串联。
- **`mcp/server.js` 启动 banner**：写入 stderr（不污染 stdio JSON-RPC），列出版本、`WL_PROJECT_ROOT`、已注册的 17 个工具，方便快速判断"MCP 是否真连上"。
- **`mcp/api/client.js` 友好错误提示**：401 / 4004 自动附排查指引（"token 仅填纯 JWT 不含 bearer 前缀" / "gatewayPath 可能缺前缀，不要让 AI 绕开 MCP 拼 HTTP"）。
- **`_registry.md` 增加「MCP 工具依赖」列**：明确每个 Skill 用到的 `wls_*` 工具，AI 加载 Skill 时一并核验工具可用性。

### Fixed

- **`dict-sync/SKILL.md`** 完全重写（451 → 215 行）：删除文件被错误拼接的旧版残留段、`TODO_CONFIRM` 错路径（`/system/dict/list` 等）、错字段名；改为 MCP 优先，明确 `wls_dict_query` / `wls_dict_upsert` 入参模板。
- **`menu-sync/SKILL.md`**：执行流程改为 `wls_menu_sync_from_report` 一步到位优先；HTTP body 显式标注「仅为 MCP 入参参考」，杜绝 AI 据此自行 fetch。
- **`menu-sync/USAGE.md`**：修正旧字段（`tenantId` / `rootMenuId` / 旧路径示例）→ 统一为 `sysAppNo` / `menu.parentMenuId` / `sync/env.local.json`。
- **`permission-sync/SKILL.md` §6**：标题从"无 MCP 时的兜底"改为"MCP 内部实现，AI 不得调用"，杜绝 AI 把它当 fallback 路径自己跑 HTTP。

### Changed

- **`copilot-instructions.md`** AI Skills 自动调度段：新增"首选场景索引（best-practices）"流程，三件套（best-practices + registry + pipeline）联合路由替代单纯关键词命中。
- **三个 sync SKILL.md 顶部纪律段统一**：均改为引用 `_mcp-guardrail.md`，错误处理走自愈闭环（不再"立即停止"）。

### Notes

- 纯文档 + MCP 运行时增强，无 SDK 行为破坏性变更，业务项目 `pnpm dlx @agile-team/wl-skills-kit update` 即可同步。

## [2.7.1] - 2026-05-13

### Fixed

- **jh-drag-row.md**：Props 表重写，补充 `isNest`/`sliderColor`/`sliderBgColor`/`sliderHoverColor`/`sliderBgHoverColor`，删除源码中不存在的 `bottomPercent`，修正 CSS 类名引用
- **jh-date.md / jh-date-range.md**：修正 `valueFormat` → `format`（jh-date 自有 prop），补充 `BusLogicDataType.date_yyyy`/`"month"` 类型映射
- **jh-date-range.md**：补充 `defaultValue` 预设值表（`recentDay7`/`recentDay30`/`rangeDatetimeToday` 等 8 个内置）
- **jh-select.md**：补充 `BusLogicDataType.company`/`enums` 也映射为 `SelectComponent`；新增 `historyTop` 置顶偏好说明
- **jh-text.md**：澄清 `content` prop 由框架 `form-detail-item.ts` 自动传入；补充 `BaseFormDetail` 自动渲染逻辑
- **jh-file-upload.md**：新增 `FormDialog.uploadAttach`/`previewAttach`/`previewAttachBatch` 编程式调用文档
- **jh-user-picker.md / jh-dept-picker.md**：补充 `BusLogicDataType.user`/`dept` → 对应 Picker 组件的配置式用法
- **page-query-hook-best-practices.md**：修正 `getTableList()` → `select()`、`formSchemas` → `queryDef()` 等错误方法名；补充源码构造参数表 / 核心属性表 / 关键方法一览

### Added

- **jh-textarea.md**（新文档）：`BusLogicDataType.textarea` 映射的多行文本组件文档

### Notes

- 纯文档修正，无功能变更，业务项目 `pnpm dlx @agile-team/wl-skills-kit update` 即可同步最新文档

## [2.7.0] - 2026-05-12

### Added

- **CLI 未知 flag/命令防护**：`bin/wl-skills.js` 引入 `KNOWN_COMMANDS` / `KNOWN_FLAGS` 白名单。`node bin/wl-skills.js --version` 等未识别参数不再默认走 `init`，而是**退出非零并提示**，彻底消除 v2.6.x 时段被验证过的"误装风险"。
- **MCP Tool auto-discovery**：新增 `mcp/registry.js` 集中维护 17 个工具描述符（含 `handle` / `needsBackendConfig`）。`mcp/server.js` 大幅瘦身（496 行 → 130 行），不再硬编码 17 项 switch case；新增 / 修改 Tool 仅改 `mcp/registry.js`。
- **版本一致性自检脚本**：新增 `scripts/verify-version.js`（`pnpm version:verify`），跨文件校验 `package.json#version` 与 CLI header / README / `guides/architecture.md` / headers 中描述行的一致性，并交叉校验 `_registry.md` 的 ✅ 启用 行数与 README / `package.json#description` 中的 "N 个 AI Skill" 数字一致。
- **prepublishOnly 守门**：`npm publish` 前自动运行 `version:verify` + `vitest run`，不一致或测试失败则阻断发版。
- **vitest 单元测试**：`tests/registry.test.js`（17 项 Tool 描述符 / Skill 计数 / package.json 一致性，9 测试）+ `tests/cli.test.js`（A1 防护黑盒测试 + dry-run 隔离验证，6 测试）+ `tests/version-tools.test.js`（version 工具脚本，3 测试）。共 **18 测试**全绿。
- 新增 `dict-sync` / `code-fix` 的 `USAGE.md`，与其他 8 个启用 Skill 文档结构一致。

### Changed

- **`scripts/sync-version.js` 改为 registry-driven**：`SKILL_COUNT` 不再是手动维护常量，自动从 `files/.github/skills/_registry.md` 解析 ✅ 启用 行数得到；`MCP_TOOL_COUNT` 自动从 `mcp/registry.js` 取。
- `files/.github/copilot-instructions.md` 删除内嵌的 Skill 状态表，改为单行指针 → `_registry.md`，消除三处独立维护。
- `kit-internal/architecture.md` 重写为 **ADR 索引 + 当前架构指针**，不再复制能力清单；当前能力盘点统一指向 `docs/全盘分析与智能体搭建指南.md` 等单一数据源。
- `package.json` 新增 `test` / `version:verify` / `prepublishOnly` 脚本与 `vitest` devDependency。

### Notes

- 业务项目升级 `pnpm dlx @agile-team/wl-skills-kit update` 即可，无破坏性变更。
- 维护者新增 Skill：仅改 `_registry.md` 与 `_pipeline.md` + 写 SKILL.md/USAGE.md，**不再需要手改 sync-version 常量与 copilot Skill 表**。
- 维护者新增 MCP Tool：仅改 `mcp/registry.js` 加一条描述符，**不再需要改 server.js**。
- 验证：`pnpm version:verify && pnpm test` 应全绿，CI 可直接接入。

## [2.6.0] - 2026-05-12

### Added

- 新增 `business-doc-extract` Skill（`files/.github/skills/core/business-doc-extract/`）：以**语义级智能触发**取代关键词列表，依据「资料源 + 用户意图 + 范围完整度」三因素判断是否进入业务文档生成态。
- 业务理解文档落点固化为 `docs/business/`：`index.md`（项目业务全景）、`open-questions.md`（全局待确认汇总）、`0X-<module>/{index.md,requirement.md,dictionary.md,field.md}`（模块四件套），并提供 6 个最小骨架模板。
- Skill 内置 4 种生成模式：`preview`（仅预览不落盘）/ `module`（单模块生成或更新）/ `project`（项目级刷新）/ `incremental`（基于字段表、字典表、新需求做增量维护）。
- 同步更新 `_registry.md`、`_pipeline.md`、`copilot-instructions.md`：在 Pipeline 中把 `business-doc-extract` 作为 `prototype-scan → api-contract` 之间的**建议性插入点**，碎片化任务默认跳过。

### Changed

- README 增补 2.6.x 版本亮点、`docs/business` 结构示意、新增 `business-doc-extract` USAGE 链接、Pipeline 流程图补 `business-doc-extract` 节点、Skill 数从 9 上调到 10。
- `docs/全盘分析与智能体搭建指南.md`、`docs/ai全景分析.md`、`docs/agent-pipeline-runbook.md`、`docs/mcp-tool-risk-matrix.md` 版本基线统一升级到 v2.6.0，并在能力总览补充 `business-doc-extract`。
- `scripts/sync-version.js` 把 `SKILL_COUNT` 调整为 10，并对齐 README 头部 `一键将 13 条规范、N 个 AI Skill、N 个 MCP Tool` 的当前文案。

### Notes

- 页面级 `api.md` 仍位于 `src/views/**/api.md`，是接口契约的唯一详细位置；模块 `docs/business/0X-xx/index.md` 只做链接索引，不重复维护字段。
- `business-doc-extract` 不引入新关键词列表，触发完全由 AI 自行判断；缺资料时 Skill 会暂停并要求用户提供原型/详设/字段资料路径，不会凭推断写入 `docs/business`。

## [2.5.2] - 2026-05-12

### Added

- 新增 `docs/mcp-tool-risk-matrix.md`，按只读、本地检查、后端写入、外部通知分级说明 MCP Tool 风险、确认要求和自动化边界。
- 新增 `docs/agent-pipeline-runbook.md`，定义 Agent Pipeline 执行顺序、人工确认点、运行报告字段和闭环验证建议。

### Changed

- 同步 `package.json`、`package-lock.json`、CLI header、README 的版本文案到 `2.5.2`，修复 2.5.x 发布后残留的旧版本描述。
- 升级 `docs/全盘分析与智能体搭建指南.md` 与 `docs/ai全景分析.md` 到 2.5.x 当前能力，补齐 17 个 MCP Tool、`validate-page`、`doctor-ui`、`wk-skills-ui` 桥接和 `navigateHidden` 隐藏页导航实践。

## [2.5.1] - 2026-05-09

### Changed

- `prototype-scan` Skill 补齐 Axure 原型文件访问前置说明：`index.html` 永久不可用（VS Code 内嵌 Chromium 不加载用户 Chrome 扩展）；只能用 `open_browser_page(具体页.html)` 或 `read_file`；`(not visible)` 不等于不可访问。
- `page-codegen` Skill 将隐藏页导航方案统一为 `navigateHidden` 主路（`src/util/navigate-hidden.ts`）：懒注册 + `router.push` 无整页刷新，内部自动 `location.href` 兜底防白屏；禁止外部调用侧直接使用 `location.href`；生成摘要后续步骤新增"维护 `HIDDEN_ROUTE_MAP`"强提醒。

## [2.5.0] - 2026-05-07

### Added

- 强化 page-codegen 模板，统一 `BaseTable render-type="agGrid"`、唯一 `cid`、`defineColumns()` 和 `renderOps()` 标准写法。
- 增强菜单同步、项目工具和 MCP 工作流能力，补齐 17 个 MCP Tool 的 README 描述。

### Changed

- 同步 README、Copilot 指南、Skill registry、page-codegen 文档和菜单同步文档。
- 明确 `wl-skills-kit` 与 `wk-skills-ui` 的协作边界：kit 负责规范化生成，ui 负责样式绝对管控。

## [2.4.2] - 2026-05-05

### Changed

- 更新 README、业务项目指南、架构说明和多编辑器兼容文档，补齐 2.4.x 生命周期、MCP、manifest、规范插件和桥接说明
- 同步版本文案到 2.4.2，避免发布文档仍停留在 2.4.0/2.4.1
- 明确 `@agile-team/wk-skills-ui` 仅为可选桥接包，两者不建立强依赖

## [2.4.1] - 2026-05-04

### Added

- CLI 安装完成后新增 `@agile-team/wk-skills-ui` 可选桥接提醒，保持两包独立分工、不强耦合
- 新增 `standards:init` 脚本，统一指向 `pnpm dlx @robot-admin/git-standards init`
- README 补充 wk-skills-ui 可选桥接说明与规范插件入口

## [2.4.0] - 2026-05-02

### 🚀 Agent Pipeline + MCP 项目感知 + CLI 质量工具

#### Agent Pipeline

- 新增 `.github/skills/_pipeline.md`
  - 定义 Skill 间 `input_from` / `output_file` / `next_suggest`
  - 明确 Agent 完成摘要和下一步建议格式
  - 保持建议式串联，涉及写文件/调接口/修复代码/推送通知仍需人工确认

#### MCP Tools 扩展

- 新增 `wls_code_scan`
  - 扫描 `src/views` 页面目录
  - 输出 `index.vue` / `data.ts` / `index.scss` / `api.md` 完整性和 `API_CONFIG` 概览
- 新增 `wls_route_check`
  - 检查页面目录是否在路由文件中可发现
  - 支持默认探测 `vite/plugins/shared/pages.ts` 等常见路由文件
- 新增 `wls_git_log_extract`
  - 提取最近 N 条提交摘要
  - 支持 convention-audit Git 规范检查和后续 changelog-gen
- 新增 `wls_audit_report_push`
  - 支持将最新审计报告推送到飞书 webhook
  - 未配置 `feishu_webhook` 时静默跳过，不阻断流程

#### CLI 扩展

- 新增 `wl-skills check`
  - 检查 Node 版本、工具链文件、manifest、MCP env 配置、MCP server 可发现性
- 新增 `wl-skills diff`
  - 对比业务项目已安装文件与当前 kit 版本差异
  - 输出新增/缺失、内容不同、旧版残留统计
- 新增 `wl-skills validate`
  - 静态扫描 `src/views` 页面文件完整性
  - 检测缺 `data.ts` / `index.scss` / 有 `API_CONFIG` 但缺 `api.md` 等提示项
- 新增 `wl-skills export`
  - 将 `SYS_MENU_INFO.md` / `SYS_DICT_INFO.md` / `SYS_PERMISSION_INFO.md` 导出为 xlsx
  - `xlsx` 调整为运行依赖，保证 npx 安装后可直接使用

#### 文档更新

- 新增 `docs/全盘分析与智能体搭建指南.md`
  - 重写当前能力盘点
  - 补充 L5 Agent Pipeline 搭建步骤
  - 明确 sale/produce 领域 Skill 暂不进入本轮扩展
- README 更新 9 个 Skill、14 个 MCP Tool、CLI 新命令说明

## [2.3.8] - 2026-05-02

### 📋 convention-audit v2 + 规范场景化 + 安装去重

#### 规范文件更新

- **02-code-structure.md**：「4 文件原则」改为「三文件分离 + 接口契约文档」
  - `data.ts` 按场景判定：有接口/表格/表单/复杂状态时强制，纯静态/壳页面豁免
  - `api.md` 按场景判定：AI 生成 / 新增业务页面必须；存量复杂接口 🟡 建议；无接口页面豁免
- **08-git.md**：Git 规范纳入审计范围（v2.3.7 及以前标注"审计时不检测"）
  - 新增审计检测项：husky/commit-msg/pre-commit 存在性、分支名、近期提交格式
  - 历史提交不强制追溯，后续提交必须合规，修复闭环检查
- **12-base-table.md**：新增「AGGrid 场景化判定」章节
  - 主业务列表必须 AGGrid；弹窗小表格/嵌套明细/行编辑允许豁免
  - 豁免仍优先 BaseTable，审查报告必须标注豁免原因

#### convention-audit SKILL.md 升级为 v2

- **报告模板全面升级**（11 个章节）：
  1. 扫描范围与数据量（目录数/文件数/页面数/类型分布）
  2. 工具链与 Git 状态
  3. 13 条规范覆盖矩阵（每条规范审查方式 + 结果 + 🔴🟡🟢 计数）
  4. 严重偏差（含 code-fix 能力标记 ✅/⚠️/❌）
  5. 警告偏差
  6. 提示与后续关注
  7. 豁免/不适用清单
  8. 本次建议 code-fix 修复清单
  9. 本次不建议修复/后续治理清单
  10. 目录/模块问题分布
  11. 修复闭环与复扫对比
- **审计方式分层**：静态扫描（高可信度）/ 工具链委托（高可信度）/ AI 场景判断（中可信度）
- **目录分层审查**：`src/views/` 最严格 → `components/local/` 中等 → 基础组件宽松
- **新增 vs 存量区分**：新增严格、存量渐进、本次修改不新增违规
- **阻断条件**：明确哪些问题阻断闭环、哪些后续治理
- **报告可信度说明**：标注各检查方式可信度，便于人工评审

#### CLI 安装去重机制

- **同版本跳过**：团队多人 `npx` 时，已安装相同版本自动跳过（基于 `.wl-skills-manifest.json` 版本比对）
- **跨版本智能升级**：检测到不同版本时自动切换增量更新模式，不全量覆盖
- **`--force` 参数**：强制重装，跳过版本检测
- 帮助信息同步更新

## [2.3.7] - 2026-04-29

### 🔐 permission-sync 闭环完善（数据驱动权限）

- **修正权限落地方式**：`action-attach` 模式改为在 `data.ts` 的 `ActionButtonDesc` 上加 `permission: []` 字段，而非错误的 `v-permission` 指令（`BaseToolbar` 内部已做权限拦截）
- **简化角色授权备份说明**：平台侧已防重复分配；AI 内部做"查旧 menuIds + 合并"，不再建议额外备份
- **联动说明更新**：`page-codegen` 预留 `permission: []` 占位；`convention-audit` 改为审计 `data.ts` 按钮是否有非空 `permission` 字段
- `USAGE.md` 补充"为什么不用 v-permission 指令"说明 + Q2 权限码写法示例

## [2.3.6] - 2026-04-29

### 🔐 permission-sync Skill 正式激活

新增完整的"角色 → 菜单授权 → 动作按钮 → v-permission"闭环能力。

#### 新增 6 个 MCP 工具

- `wls_role_query` — 查询角色列表（支持分页）
- `wls_role_upsert` — 批量新增角色（按 `code` 字段去重）
- `wls_assignable_menus_query` — 查询全量可授权菜单
- `wls_role_assign_menus` — 给角色批量分配菜单（**全量覆盖式**，使用前需确认）
- `wls_action_query` — 查询页面菜单下的动作（type=A）
- `wls_action_upsert` — 批量新增动作（按 `permission` 字段去重）

#### Skill 工作模式

- `role-manage` — 角色查询/创建
- `role-assign` — 角色授权菜单
- `action-attach` — 挂动作 + 自动改造代码加 `v-permission` 指令

#### 安全约束（强制）

- 生产环境拒绝直接 push（gatewayPath 含 `prod` / `.com` 时切换导出模式）
- 角色分配二次确认（Pre-flight 必须列出完整菜单清单）
- 仅新增不删除（防误删导致大面积失权）

#### 文档

- `files/.github/skills/sync/permission-sync/SKILL.md` — AI 触发协议
- `files/.github/skills/sync/permission-sync/USAGE.md` — 团队成员使用示例

#### 配套更新

- `_registry.md` permission-sync 状态 ⏳ → ✅
- `kit-internal/skills/_planned-skills.md` 已清空（无草稿状态 Skill）
- `kit-internal/architecture.md` 决策 7 更新
- `docs/ai全景分析.md` MCP Tools 表新增 6 个工具，路线图描述更新
- `README.md` skill 目录与概览表更新

## [2.3.5] - 2026-04-29

### 📄 文档与内容修正

- 新增 `docs/ai全景分析.md`：完整梳理 L0-L7 AI 辅助开发能力谱系，含各层深度解析、架构优势、升级路线图
- L7 自演化体系：添加飞轮模型、落地所需条件、技术路径（终极愿景，条件成熟后规划）
- `kit-internal/architecture.md` 修正两处过期描述：编辑器数量 8→10，dict-sync/code-fix 状态更新为已激活
- `docs/mcp建议.md` 归档至 `kit-internal/history/mcp建议-archived.md`

## [2.3.4] - 2026-04-28

### 🔌 全编辑器 MCP 支持 + Qoder 新增

#### MCP 配置自动生成（补全实现）

- `wl-skills init` 现在自动生成 4 个项目级 MCP 配置文件：
  - `.cursor/mcp.json` — Cursor
  - `.mcp.json` — Claude Code（project scope，随 VCS 共享）
  - `.vscode/mcp.json` — VS Code / GitHub Copilot（使用 `"servers"` 键，符合 VS Code MCP 规范）
  - `.kiro/settings/mcp.json` — Kiro（AWS）
- 修复 `usage.md` 中错误的配置路径描述（原来写的 `.claude/settings.json` 实际不存在）

#### 手动配置指南

- 新增 `.github/guides/mcp-setup.md`：Windsurf / Cline / Trae / Qoder 的手动 MCP 配置步骤

#### Qoder 编辑器支持（新增第 10 个编辑器）

- `editors.json` 新增 `qoder` 条目，自动生成 `.qoder/rules/conventions.md`
- Qoder 同时通过现有 `AGENTS.md` 天然兼容（无需额外操作）
- 新增 `_compat/headers/qoder.txt` 规则头部

#### 文档更新

- `usage.md` 推荐编辑器列表补全（Cline / Kiro / Trae / Qoder）
- `usage.md` 编辑器数量 8 → 9

---

## [2.3.1] - 2026-04-27

### 🔧 组件三文件分离规范补全 + 文档精准化

#### global/local 组件

- **C_SvgIcon**: Options API → `<script setup lang="ts">`，修复 `scope` typo，提取内联样式到 `index.scss`
- **C_Splitter / C_TagStatus**: 内嵌样式提取到 `index.scss`，改为外链引用
- **C_Tree**: 所有逻辑提取到 `data.ts`（`createTree()`），vue 文件精简为纯模板层
- **C_RightToolbar**: 业务逻辑（列显隐、拖拽、API 调用）提取到 `data.ts`，样式提取到 `index.scss`
- **c_listModal**: 新增 `index.scss`，消除空 style 块

#### 文档与规范

- `docs/request.md`: 补充 `ApiResult<T>` 显式类型定义，说明 mock `code:200` 与真实后端 `code:2000` 均被 interceptor 接受
- `page-codegen/SKILL.md` + `TPL-*.md`: mock 响应格式统一为 `code:2000 + message`
- `package.json`: `files` 补加 `mcp/`，修复 MCP server 从未被 npm 打包的 bug

---

## [2.1.4] - 2026-04-27

### 🔧 Mock 响应格式统一

- `page-codegen/SKILL.md`：mock 响应码 `code: 200` → `code: 2000`，`msg` → `message`，与真实后端格式完全一致
- `TPL-DETAIL-TABS.md`：全部 mock 端点（list/getById/remove/save/update）响应格式同步修正
- `TPL-RECORD-FORM.md`：getBy\*/saveOrUpdate mock 端点响应格式同步修正
- 修复后 AI 生成的 mock 文件与真实后端响应结构一致，避免前端 `res.code === 2000` 判断在 mock 模式下永远失败的问题

---

## [2.1.3] - 2026-04-27

### 🔧 组件规范补全 + API 文档修正 + MCP 发布修复

#### global 组件三文件分离规范补全

- **C_SvgIcon**: Options API → `<script setup lang="ts">` 重构；修复 `<style scope>` typo（改为 `scoped`）；提取内联样式到新增 `index.scss`
- **C_Splitter**: 将 `<style scoped>` 内嵌样式全部提取到新增 `index.scss`，vue 文件改为外链引用
- **C_TagStatus**: 将 `<style scoped>` 内嵌样式全部提取到新增 `index.scss`，vue 文件改为外链引用
- **C_Tree**: 将 `<script setup>` 中所有响应式逻辑提取到新增 `data.ts`（`createTree()` 函数），vue 文件精简为模板 + 调用层
- **C_RightToolbar**: 将全部业务逻辑（列显隐、拖拽排序、保存接口调用）提取到新增 `data.ts`（`createRightToolbar()` 函数）；将 `<style scoped>` 内嵌样式提取到新增 `index.scss`

#### local 组件规范补全

- **c_listModal**: 补充 `index.scss`（空 style 块改为外链引用）

#### API 文档修正 (code:200 → code:2000)

- `demo/produce/aiflow/mmwr-customer-apply-add/api.md`: 响应示例 `code:200, result:{}` → `code:2000, data:{}`
- `docs/request.md`: 响应示例 `code: 200` → `code: 2000`，保持与架构规范一致

#### MCP Server npm 发布修复

- `package.json` `files` 字段补充 `"mcp/"` 目录，修复之前 MCP Server 代码未被打包到 npm 的严重缺失（导致 `wl-skills init` 后 `.cursor/mcp.json` 指向的 `node_modules/.../mcp/server.js` 实际不存在）

---

## [2.1.2] - 2026-04-26

### 🔧 消除 npm 发布警告

- `package.json` bin 路径去掉 `./` 前缀（`"./bin/wl-skills.js"` → `"bin/wl-skills.js"`），符合 npm 规范化要求，消除发布时的 `warn: script name was invalid` 提示

---

## [2.1.1] - 2026-04-26

### 🔧 修复与迁移增强

#### bin 字段修复

- `package.json` 新增 `"main": "./bin/wl-skills.js"` —— 修复 npm v9+ 发布时 bin 条目被剔除导致 `npx` 无法找到入口的问题
- bin 命令从 `wl-skills-kit` 重命名为 `wl-skills`（避免与包名重复触发 npm 校验警告；全局安装后可直接用 `wl-skills update`）

#### 旧版用户升级支持

- `bin/wl-skills.js` 新增 `LEGACY_PATHS` 迁移清理机制：
  - `update` 时自动检测并移除 v1.x/v2.0 遗留文件（旧 flat 结构 Skill 路径、废弃 `docs/` 文件等）
  - 共 24 个旧版路径纳入清理名单，避免新旧结构并存产生 AI 调度歧义
  - 输出 "迁移: N 个旧版文件已移除" 统计信息
- README 新增"从早期版本升级"章节（含 `env.local.json` 迁移注意事项）

---

## [2.1.0] - 2026-04-26

### 🎯 多 AI 编辑器适配解耦 + 文档体系完善

#### 解耦的多 AI 配置层

- `files/.github/skills/_compat/` 由"说明文档"重构为**可执行配置层**：
  - 新增 `editors.json`：编辑器注册表（bin 读此文件决定生成什么）
  - 新增 `headers/`：每个编辑器特化 frontmatter 模板（cursor-mdc / kiro / trae 等）
  - 新增 `README.md`：解耦机制说明
- `bin/wl-skills.js` 重构 `getEditorConfigs()`：从 `editors.json` 动态加载，**任意编辑器 `enabled: false` 不影响其他**
- 各编辑器特化 frontmatter：Cursor 含 `description+globs+alwaysApply`，Kiro 含 `inclusion`，Trae 含 `description+globs`，等

#### Skill 分级目录

- `skills/` 重组为 `core/`（5 个）+ `sync/`（3 个）+ `ops/`（1 个）+ `domain/`（占位）
- 16 处旧路径引用已批量更新

#### 完善 Skill 文档（人读 vs AI 读）

- 每个启用 Skill 同目录新增 `USAGE.md`（团队成员阅读，含示例对话/踩坑/FAQ），与 `SKILL.md`（AI 触发用）并存
- 维护文档 `*.MAINTAIN.md` 已在 `kit-internal/skills/`

#### api-contract 基于真实响应重写

- 响应外壳：`{ code: 2000, message, data }`（**非 result，非 200**）
- 分页字段完整描述：`records / total / current / size / pages / countId / maxLimit / orders / searchCount`
- 增加成功/失败/字典/单条/数组各形态示例
- 业务代码 `.then(res => res)` 拿到的就是 `data`（拦截器已剥壳）

#### PLANNED Skill 草稿补全

- `dict-sync/SKILL.draft.md`：完整设计（数据流/三种模式/冲突策略/转正任务）
- `permission-sync/SKILL.draft.md`：权限码命名规范 + 三种模式 + 安全约束
- `code-fix/SKILL.draft.md`：受控修复工作流 + 偏差类型对照 + 防御对抗 prompt

#### 仓库结构治理

- `ARCHITECTURE-PLAN.md` 归档至 `kit-internal/history/`
- 新增 `kit-internal/jenkins-pipeline.md`（Jenkins 参考模板，不强加业务项目）
- README 重写：**严格区分** A. 本仓库结构（维护用）vs B. 业务项目安装结构（业务方用），杜绝混淆

#### 验证

- `npm pack --dry-run`：157 文件 / 247kB（kit-internal 已正确排除）
- 端到端 `init`：149 个文件正确生成；禁用 kiro 后只少 1 个文件（解耦验证通过）

---

## [2.0.0] - 2026-04-26

### 🚀 重大架构升级

#### 模块化规范 + 懒加载门控

- 将原 619 行单文件 `copilot-instructions.md` 中的 12 条规范抽出为独立 `standards/01 ~ 12.md`
- **新增第 13 条 `13-platform-components.md`**——平台组件对照表 + docs 前置读取清单（核心 AI 质量门控）
- 新增 `standards/index.md`，按任务类型（A 生成 / B 重构 / C 审计 / D 模板提取 / E 同步 / F Git）映射规范子集，按需加载
- `copilot-instructions.md` 精简至 ~320 行（减少 48%）

#### 模板分层（universal / domains）

- 8 个通用模板移到 `templates/universal/`：TPL-LIST、TPL-FORM-ROUTE、TPL-MASTER-DETAIL、TPL-TREE-LIST、TPL-DETAIL-TABS、TPL-CHANGE-HISTORY、TPL-RECORD-FORM、TPL-DRIVEN
- 领域专属模板移到 `templates/domains/`：produce 域 TPL-OPERATION-STATION 等
- 新增 `templates/_index.md` 模板注册表
- 新增 `templates/domains/_CONTRIBUTING.md` 领域模板贡献规范

#### 报告分类（reports/）

- 新增 `.github/reports/` 目录，三类文件分离：
  - **系统数据**：`SYS_MENU_INFO.md` / `SYS_DICT_INFO.md`[PLANNED] / `SYS_PERMISSION_INFO.md`[PLANNED]
  - **审计偏差**：`规范审查报告.md`
  - **提取建议**：`组件提取建议.md`
- 全部追加写入，不覆盖团队累积数据
- `init` / `update` 自动保护已存在的 reports 文件
- `clean --keep-reports` 标志可保留累积数据

#### Pre-flight 约定式输出

- 每个 Skill 触发后强制输出 Pre-flight 声明（已读文件、工具链状态、cid 等）
- 工具链检测失败强制暂停，输出 ❌ 红叉提示 + CHENY 工号 409322

#### 新增 Skill

- ✅ **template-extract** — AI 辅助的领域模板提取流程（开发者指路 + AI 读代码 + AI 写模板）
- ✅ **convention-audit**（重命名自 convention-extract 并升级）— 13 条规范全量扫描，输出双报告
- ⏳ **dict-sync** [PLANNED] — 字典数据批量同步
- ⏳ **permission-sync** [PLANNED] — 权限数据批量同步
- ⏳ **code-fix** [PLANNED] — 自动整改 🟢🟡 等级偏差

#### 多 AI 编辑器适配

- 新增 `skills/_compat/ai-model-matrix.md` — 8 种 AI 编辑器能力矩阵
- 新增 `skills/_compat/editor-setup.md` — 编辑器配置 + 5 步团队接入指南
- `bin/wl-skills.js` 已支持 8 种主流 AI 编辑器配置自动生成

#### 维护者文档目录

- 新增仓库根目录 `kit-internal/`（与 files/ 同级）
  - `README.md` / `CONTRIBUTING.md` / `architecture.md`
  - `standards.MAINTAIN.md` / `templates.MAINTAIN.md`
  - `skills/_planned-skills.md`
- 不在 `package.json` files 字段，自然排除于 npm 包外

#### 目录调整（破坏性变更）

- `docs/` → `guides/`（英文统一，避免 Windows 中文路径问题）
- `docs/SYS_MENU_INFO.md` → `reports/SYS_MENU_INFO.md`
- 删除 `docs/menu-sync-design.md`（合并至 `guides/architecture.md`）
- 删除 `docs/wl-skills-kit.md`（合并至 README.md）
- 重写 `docs/use-skill.md` → `guides/usage.md`

#### CLI 增强

- `init` / `update`：`.github/reports/*.md` 已存在则跳过（保护团队累积）
- `clean`：新增 `--keep-reports` 选项

### 迁移指南（从 v1.x 升级）

执行 `pnpm dlx @agile-team/wl-skills-kit@latest update` 即可。注意：

1. 老的 `docs/SYS_MENU_INFO.md` 需手动迁移到 `reports/SYS_MENU_INFO.md`
2. 老的 `docs/menu-sync-design.md` / `docs/wl-skills-kit.md` 已删除，相关内容见 `guides/architecture.md`
3. 老的 `convention-extract` Skill 重命名为 `convention-audit`，触发词扩展

---

## [1.2.1] - 2026-04-13

### 新增：自然语言输入模式（模式 0）

- **prototype-scan**：新增模式 0（自然语言），用户口述需求时 AI 内部自动构建 page-spec JSON，无需提供原型/文档
  - 触发区块改为三模式表格（模式 0/A/B）
  - 新增关键词→交互模式映射表、降级默认值策略、page-spec 骨架模板
- **page-codegen**：支持模式 0 快捷路径，无 page-spec 时自动调用 prototype-scan 模式 0
- **copilot-instructions.md**：Skill 注册表及流水线同步更新自然语言触发词

## [1.2.0] - 2026-04-10

### 新增：CLI v2.0 — update 增量更新 + clean 构建清理

- **`update` 命令**：基于 MD5 增量更新，仅覆盖有变化的文件
  - 对比 `.wl-skills-manifest.json` 清单中的 MD5 哈希
  - 输出新增/更新/未变文件数 + 版本变化提示
  - 支持 `--dry-run` 预览
- **`clean` 命令**：构建前清理 AI 开发辅助文件
  - 删除 `.github/`、`docs/`、`demo/`、编辑器配置等非组件文件
  - **保护路径**：`src/components/` + `src/types/` 永远不会被清理
  - 删除空父目录（自动清理目录树）
  - 清除 `.wl-skills-manifest.json` 自身
  - 支持 `--dry-run` 预览
- **Manifest 清单系统**（`.wl-skills-manifest.json`）：
  - `init` / `update` 执行后自动生成，记录版本 + 文件路径 → MD5 映射
  - 供 `update` 做增量比对、`clean` 做精准删除
  - 已加入 `.gitignore`
- CLI 重构为 3 个子命令：`init`（默认，向后兼容）、`update`、`clean`
- README.md 新增「CLI 命令」章节，更新「快速开始」「更新策略」「安装行为说明」

## [1.1.7] - 2026-04-10

### 修复：menu-sync SKILL.md 漏同步

- `files/.github/skills/menu-sync/SKILL.md` 未随 v1.1.6 同步源仓库版本
- 修复内容：sysAppNo 字段补齐（配置模板/表格/示例）、`{appNo}` → `{sysAppNo}` 变量统一、响应码说明补充
- 全量审计确认 19 个同步文件 + 9 个 TPL 模板零差异

## [1.1.6] - 2026-04-10

### 修复：menu-config.md 残留引用 + env 模板字段缺失

- **5 处 `menu-config.md` 残留 → 统一为 `SYS_MENU_INFO.md`**：
  - `use-skill.md`：page-codegen 输出列 + changelog 条目
  - `menu-sync-design.md`：当前工作流 + 过渡路径
  - `TPL-DETAIL-TABS.md`：校验清单
- **env.local.json 模板补齐 `sysAppNo` 字段**（v1.1.4 发版时遗漏）
- **guide.md 补齐 `sysAppNo`**：文件结构示例、字段说明表、获取方式小节

## [1.1.5] - 2026-04-09

### 修复：page-codegen → menu-sync 数据闭环

- **问题**：page-codegen 生成分散的 `menu-config.md`（各页面目录下），menu-sync 却读取集中式 `SYS_MENU_INFO.md`，两者断裂
- **修复**：page-codegen 统一输出到 `.github/docs/SYS_MENU_INFO.md`（追加/覆盖模式，生成前必须询问用户）
- TPL-DETAIL-TABS 原有的 menu-config.md 模板移除，改为引用 SKILL.md 主文件的统一规则
- 新增「api.md 生成时序」章节：明确 api.md 先于 page-codegen（Step 2 → Step 3），确保 API_CONFIG 与接口一致
- copilot-instructions.md 流水线描述更新：Step 3 注明"追加/覆盖 SYS_MENU_INFO.md"，新增数据闭环说明
- use-skill.md 工作流 A 更新：Step 6 增加写入模式确认，Step 8 增加手动/自动两种菜单创建方式说明

## [1.1.4] - 2026-04-09

### 修复

- 补充遗漏的 `env.local.json` 模板文件到 `files/.github/skills/menu-sync/env/`
- 文件内容为占位符模板（非真实凭据），安装后用户按 `guide.md` 填写实际值

## [1.1.3] - 2026-04-09

### 重构：convention-extract → convention-audit（规范审计）

- **定位翻转**：从"扫描代码提炼规范"改为"用规范审计代码"
  - 旧：项目代码 → 提炼 → 规范文档（代码乱则规范乱）
  - 新：copilot-instructions.md（标准） → 审计 → 偏差报告 + 整改建议
- SKILL.md 完全重写：10 项审计维度、偏差严重度定义、报告模板、执行步骤
- copilot-instructions.md 注册表触发关键词更新：提炼规范 → 规范审计/代码审计/规范检查
- use-skill.md、wl-skills-kit.md 相关描述同步更新

## [1.1.2] - 2026-04-09

### 新增：Skills 自动调度注册表

- `copilot-instructions.md` 末尾新增 **Skills 自动调度** 章节，包含：
  - Skill 注册表（触发关键词 → 必须读取的 SKILL.md 文件映射）
  - 完整流水线（prototype-scan → api-contract → page-codegen → menu-sync）
  - 单独使用模式（只触发单个 Skill）
  - 组件文档按需查阅表 + 领域样例参考表
- 所有编辑器配置文件（8 个）均继承此注册表，实现 **全编辑器 Skill 自动调度**
- README 更新：Skill 识别列从 "⚠️ 需手动引用" → "✅ 通过注册表自动 read_file"

## [1.1.1] - 2026-04-09

### 修复

- 修复 wl-skills-kit.md 中 10 处 `@jhlc/wl-skills-kit` 过时包名引用 → `@agile-team/wl-skills-kit`
- README 新增「多编辑器 / AI 工具支持」章节，详细说明 8 个编辑器的使用姿势差异
- License 从 MIT 改为 UNLICENSED（内部使用）

## [1.1.0] - 2026-04-09

### 新增：多编辑器支持（v1.1）

- CLI 安装时自动生成 8 个编辑器配置文件（单源头：从 `copilot-instructions.md` 动态生成）
  - `AGENTS.md` — Linux Foundation 通用标准，绝大多数 AI 工具均支持
  - `CLAUDE.md` — Claude Code / Claude CLI
  - `.clinerules` — Roo Code / Cline
  - `.cursorrules` — Cursor（legacy 格式，兼容新版）
  - `.cursor/rules/conventions.mdc` — Cursor（新格式，带 `alwaysApply: true`）
  - `.windsurfrules` — Windsurf (Cascade)
  - `.kiro/steering/conventions.md` — Kiro
  - `.trae/rules/conventions.md` — Trae
- `--dry-run` 分两阶段展示：静态文件 + 编辑器配置文件
- `--help` 信息更新，列出所有新增写入路径

## [1.0.0] - 2026-04-08

### 初始发布

- 5 个 AI Skills（prototype-scan / api-contract / page-codegen / menu-sync / convention-extract）
- page-codegen 含 9 个独立模板（TPL-LIST / TPL-FORM-ROUTE / TPL-MASTER-DETAIL / TPL-TREE-LIST / TPL-DETAIL-TABS / TPL-CHANGE-HISTORY / TPL-RECORD-FORM / TPL-OPERATION-STATION / TPL-DRIVEN）
- 12 个平台组件 API 文档（jh-select / jh-date / jh-drag-row 等）
- 通用组件（global 6 个 + local 4 个 + remote 5 个 README）
- 类型桶文件 src/types/page.ts
- 领域样例 demo/（produce 8 页 + sale 5 页）
- CLI 工具 bin/wl-skills.js（--dry-run 预览）

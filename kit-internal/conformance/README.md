# WL 独立能力与组合验收

这个目录只用于开发和发布前验收，不是第六个运行时产品包。五个产品包单独发布、单独运行，不依赖本目录或其他包的安装器。公共支持文件以固定快照内置到各包，离线使用仍可工作。

验收源码随 kit 仓库保存在 `kit-internal/conformance`，不进入 npm 发布文件。它自动寻找包含五个源码仓库的父目录；CI 分别检出候选版本时，可通过 `WL_PACKAGES_ROOT` 指定共同目录。`.check.cjs` 文件由这里的 Node 验收命令显式运行，不由 kit 的单包 Vitest 自动收集。

## 能力边界

各包的 `lib/capabilities.json`（UI 为 `bin/capabilities.json`）声明领域、意图、输入、输出及宿主要求。增加场景时先明确归属及输入输出，再补单包行为测试和实际下游消费测试；不能通过安装顺序改变业务或校验口径。

声明中的 `inputs` 是可接受输入类型，具体场景按已有实现选择必要资料，不要求列表全部齐备。后续拆分子能力时，应明确每个场景的必要输入、可选输入与未决事实处理。

| 包 | 负责的事实和行为 | 组合时的边界 |
| --- | --- | --- |
| design | 需求、设计文档、可选设计模型及追踪 | 下游缺少设计模型仍能从评审需求独立工作 |
| kit | 前端页面规格、页面生成、前端 API 契约 | 视觉策略由项目 UI profile 明确；生成页面的宿主/runtime 要求必须声明 |
| ui | 视觉规范、样式、渲染 runtime、扫描与视觉修复 | 不替代页面业务、后端接口或项目业务规则 |
| bd | 后端领域契约、Java/数据库生成、治理与对外 API Manifest | 生效项目 Profile 必须解析进交付契约 |
| test | 测试设计、脚本、执行及报告 | 显式 API 契约优先，缺少接口事实不得由页面路由替代 |

CLI 可独立运行不代表生成物无需宿主。kit 编译器输出导入 UI runtime 时，该产物明确需要 UI runtime；它的契约建立和检查仍不依赖 UI。测试设计也可以从需求独立进行，契约驱动执行则需要相应真实输入。

## 共享内容与所有权协议 v1

- Markdown 贡献标记固定为 `<!-- wl-skills-<包>:begin -->` 和 `<!-- wl-skills-<包>:end -->`，同一路径每包至多一个区块。正文仍按任务加载各包自己的 Skill。
- 独占文件、共享 Markdown 区块、JSON 项分别记录安装基线。文件预先存在且内容相同，只引用、不自动认领。
- 更新比较安装基线、工作区当前内容和新版内容；本包贡献以外的文字、区块、JSON 项保持不变。`--force` 不授予外来内容所有权。
- 卸载只撤销未被用户修改的本包贡献。保留修改内容及其归属信息，不能递归删除编辑器、skills 或 standards 的共享目录。
- 安装前检查目标、父目录类型及真实边界，已知路径形态冲突不得留下半安装内容；dry-run 也执行冲突检查而不落盘。逐贡献比较基线和当前内容，避免覆盖用户及其他包贡献。
- 老版本普通编辑器文件转为目录规则时，保留原内容。缺少可信归属或内容已改时保留并报告，不能以目录迁移为理由删除用户配置。

组合安装、升级和卸载应串行编排。五包安装都对本次计划内的入口、配置、退休贡献和清单提供预检、备份或字节快照，以及失败恢复；事务边界以各包计划和恢复测试为准。单文件原子替换与计划级恢复分别验证，不表示五包合并操作具有跨进程事务。跨包同时写共享文件不属于已验证保证；客户端若开放并发安装，需统一项目锁并增加并发回归，不能用各包分别持有的锁假定相互排斥。

## 技能发现与 MCP 调用

`host-profiles.cjs` 是宿主名称、别名、发现目录、compact 入口和静态诊断的唯一来源；`project-integration.cjs` 消费该定义生成安装策略。gateway 的 name、description 与归属哈希必须有效，才可报告静态入口就绪。MCP 请求开关、配置文件和实际连接分开报告；文件存在不证明已配置本包服务，也不证明连接。

`mcp-config.cjs` 消费同一宿主定义的 `mcpLayout`，只产生项目级文件计划和本包服务项归属，不直接写文件。Kit、UI、BD、Test 的安装器将计划纳入原有预检、确认、锁、写前重检和失败回滚；更新、切换宿主、关闭 MCP 与卸载共用规划器。Codex 使用 TOML，ZCode、Kilo、Copilot 等按各自真实字段映射，不生成通用占位符或自动批准策略。没有已核实项目配置协议的宿主返回 `unsupported-manual`，Design 返回 `not-provided`。

JSONC 服务项保存值、原文、完整属性及插入空白归属；TOML 保存本包标记块。撤销只处理归属证据仍匹配的贡献，保留用户新增注释、其他服务和设置；无修改的已有配置支持字节还原。旧清单按原算法与序列化方式导入，不能凭相同内容认领。ZCode 已有生效的兼容服务时复用兼容配置，避免新建原生文件使其他服务被遮蔽；Kilo 多个候选项目配置存在时明确歧义并保留内容。

`doctor-host` 会实际检查服务项、启动参数、根目录、启用字段类型和本地执行器身份，配置状态与连接状态独立。`protocol describe.inventory.mcpIntegration` 公开同源服务身份、入口、项目根环境变量和宿主布局，客户端可据此消费本包事实；`configured` 只表示静态启动配置有效，真实连接还需 `initialize` 与 `tools/list`，技能发现与模型读取还需宿主事件。

技能路由使用各包能力元数据；旧工具名只投影同一次任务判定，不另建关键词路由。Kit 的 domain、baselinePolicy、checks 同时投影到公开 inventory，后端任务不附加页面检查；BD inventory 复用 capabilities 读取器，programmatic 只由实际公开 executor 映射决定。

四个提供 MCP 的包共用 `schema-validation.cjs`：复用已有 Ajv 依赖，按 Schema 方言惰性编译、缓存，禁止修改调用参数。tools/list 声明的 Schema 与 tools/call 实际校验同源；Design 当前无独立 MCP 服务。业务失败用 isError 和结构结果报告，协议错误与实际执行尝试分别记录。业务输入只读与持久化回执是不同副作用，不能因写回执就串行化所有查询。

后端 query、preview、apply、postverify 分阶段提供事实，预览不代表确认或写入，写入不代表全部业务验证。真实用户确认、原 planHash、项目权限和既有回滚边界继续生效；历史引用、否定动作和只解释请求不产生检查授权。

## 契约与版本协议 v1

公共 API Schema 和默认 Profile 由同源快照定义；项目生效 Profile、后端内部契约、页面规格及需求追踪仍各有归属。公共 Schema 校验结构，项目 Profile 校验实际语义，不能把默认分页值固化成所有项目的唯一合法值。

## 公开集成协议 v1

五包提供统一 `<bin> protocol describe --json` 与 `<bin> protocol request --input-file <request.json> --json` 入口：`describe` 返回能力目录、协议版本、操作映射与错误码；`request` 以统一 JSON 信封提供 route/explain/task/status/doctor-host 五个原操作，以及 execute / executor-invoke-v1 结构化执行入口，机器结果与 diagnostics 分离。协议实现是同源快照 `integration-protocol.cjs`（各包接线文件只做映射，复用各包原执行器，不复制业务实现）。bd 的 `integration` 命令属于业务系统集成域，与 `protocol` 命令互不相干。跨包一致性由 `test/integration-protocol.check.cjs` 验收：信封形状、六操作、错误码、退出码、快照同源哈希。

联动优先消费已经解析项目 Profile 的 `wl-api-contract`。兼容原始后端契约时必须使用同一生效 Profile；页面规格声明 `apiContract` 时应读取该引用，不能用页面路由猜接口。未知显式协议版本拒绝或进入显式迁移；未决业务事实保留为未决，不伪造完成状态。

页面规格单独提供时仍支持 UI 场景与浏览器测试；页面操作意图不等于 API 方法和地址。接口事实未决时明确提示所需契约，不能生成可误执行的推测请求。

浏览器模板中的通用请求模拟用于 UI 交互验收；真实接口的方法、路径和业务结果仍需由已确认契约及实际接口测试验证，模拟通过不能作为完整后端契约证据。

## 验收

在五个源码包旁运行：

```sh
npm ci
node --test test/*.check.cjs
WL_FULL_MATRIX=1 node --test test/coexistence.check.cjs
```

默认覆盖单包生命周期、全部双包双向安装，以及真实契约跨包消费。完整矩阵覆盖五包全部 120 种安装顺序，并验证升级和逐包卸载后剩余贡献完整。全部命令只作用于自动创建的临时项目。

公共支持快照变更后运行 `node scripts/sync-support.cjs`，再运行各包自身验证和组合验收。快照随各包发布，无运行时跨包导入。内置 JSONC parser 固定为 3.3.1，保留 MIT 许可。

`support/shared-distribution.cjs` 定义同步器和打包自检共用的分发路径，包含公共支持文件、JSONC parser、原子写入、公共 API Schema 和交付 Profile。修改源文件和分发映射后统一生成各包快照。运行时清单 v3 的 `sourceRevision` 覆盖共同运行时代码和资产，`distributionRevision` 校验各包实际分发的文件。开发验收脚本用源码仓内的 `scripts/shared-development-manifest.json` 独立校验。只改开发脚本时运行时清单字节保持一致。内部清单支持旧版 v2，公开集成协议沿用 v1。

Gate 可通过 `sync-support.cjs --packages gate` 同步到 `lib/shared-support`，复用同一公开协议及完整运行时支持；它不分发 Kit API Schema、交付 Profile 或五包历史升级脚本，使用独立 `gate` 分发配置和相同 `sourceRevision`。默认同步集合仍只有五包，五包 CI 和运行时无需检出或安装 Gate。`--root` 与 `--packages` 可单独选择 Gate 所在仓库。

五个产品包仓库的 `npm run support:check` 独立校验全部生成文件、源与目标 hash 关系和路径边界，不需要兄弟仓库或联网。源中有而 npm allowlist 漏掉的文件由 `npm run support:pack-check` 检出；它调用真实 `npm pack --dry-run --ignore-scripts --json`，不执行安装或打包钩子。运行时归档无需开发脚本；存在的受管开发脚本仍校验 hash。两个门禁已经接入五包 CI 和发布前校验。

Kit 的普通 CI 额外执行 `sync-support.cjs --packages kit --check` 和完整性破坏测试，单仓即可证明本包与 canonical 一致。集中验证五仓时使用 `sync-support.cjs --root <五包父目录> --check`；它只检查显式选择的仓库，`--check` 零写入。新能力仍维护在所属包，消费端读取公开目录；修改共同协议则需要生成、验证并发布所有受影响快照，发布新 npm 版本不会擅自改客户项目的锁文件。

`.github/workflows/composition.yml` 提供可选的固定提交组合 CI。仓库变量 `WL_COMPOSITION_CHECKOUTS` 必须显式配置四个兄弟仓（`ui`、`bd`、`design`、`test`），每项仅允许 `repository: "owner/repository"` 与 `ref: "<40位小写提交SHA>"`。Kit 使用触发工作流的当前提交。私有仓访问需显式配置只读 `WL_COMPOSITION_READ_TOKEN`；不配置时使用本仓 token，只适用于其实际可读的仓库，不假设有跨私仓权限。未配置变量时工作流明确记录“组合未运行”，不把跳过说成通过。

组合任务先核对五仓与 canonical 的字节一致，再锁定安装各包依赖，运行离线完整性、npm 文件清单与公开协议/真实契约消费/生命周期共存验收。该任务只通过人工触发或主分支相关变更启动，不向外部 PR 暴露跨仓凭证。本地验证和远端 CI 状态应分别记录；加入工作流文件不等于远端已经运行。

开发分发工具对明确的 `vendor/jsonc-parser/LICENSE.md` 有一个精确例外：源与目标的 Git 属性都声明文本/LF 时，比较允许 CRLF 与 LF 等价，新分发按 LF 写入；`--check` 始终零写入，真实许可证内容改变仍报漂移。离线清单只对该目标许可证记录 LF 规则，归档校验仍能在没有 Git 的环境识别允许的 CRLF；许可证字词变化仍失败。核心支持快照、清单 hash 和其他 vendor 文件继续严格比较原始字节，不放宽其他文件的换行或空白。

验收目录的 Ajv 开发依赖用于校验真实生成的完整 JSON Schema 契约，不进入五个产品包；MCP 入参校验复用产品包已有 Ajv 依赖，工具输入 Schema 不替代业务契约及其生效 Profile 验证。Codex 配置编辑使用固定的 `smol-toml@1.9.1` 解析快照，只序列化本包表，不重排用户全文；源码、许可证与来源校验一同分发，并纳入共享快照哈希。

包发版门禁应同时运行本包独立验证和这里的组合验收；旧版迁移、用户修改、失败回滚及最终生成物消费是必测行为。不同仓库可在 CI 中检出固定候选版本组合，避免仅靠源码中的模拟字符串证明兼容。

各包独立发布任务用 `scripts/pack-integrity-check.cjs stage` 保存候选 tarball 和 `candidate.json`。准备作业用同一文件完成干净安装、实际检查、旧版升级和共存验收。提供 MCP 的包还核对真实 stdio 调用与回执，UI 会验证消费者实际导入运行时入口。发布作业在 `npm` 环境中下载同一工作流的候选产物，核对提交及摘要后上传，再按精确版本从 npm registry 回读验证字节数、SRI 与 SHA-256。同版本只在字节一致时允许跳过。GitHub Actions 保留 `npm-release-evidence-<attempt>` 和 `npm-publication-receipt-<attempt>`。Kit、UI 和 Test 从 GitHub Release 触发，BD 和 Design 可手动选择与包版本一致的 `vX.Y.Z` 标签。

候选回执保存已安装包的 CLI ID、Skill 正文字节摘要、MCP 工具 ID。真实 `tools/list` 必须与公开目录逐项同名且参数 Schema 一致。目录证据和代表性工具调用分别记录。`consumer/package.json` 与 `consumer/package-lock.json` 使用相邻 tarball 的相对路径，下载整份发布证据后可在 `consumer/` 运行 `npm ci --ignore-scripts` 复现依赖图。发布作业核对两份消费者文件的摘要。

### 独立仓库普通升级与发布版共存

`scripts/compatibility-check.cjs` 是可复制到任意一个 WL 包 `scripts/` 后独立运行的开发验收脚本；只需当前仓库、Node22+ 和 npm，不寻找兄弟源码或业务目录，不调用 DSH。默认打包脚本所在包的真实源码候选；候选版本必须高于固定发布基线，禁止桥接/预发布和 `--force`。

```bash
node scripts/compatibility-check.cjs --package-root /checkout/wl-skills-kit --output ./artifacts/compatibility
node scripts/compatibility-check.cjs --candidate-lock ./candidate-lock.json --key bd --output ./artifacts/compatibility
WL_COMPAT_NPM_CACHE=/ci/npm-cache node scripts/compatibility-check.cjs --package-root /checkout/wl-skills-design --node20 /opt/node20/bin/node --output ./artifacts/compatibility
node --test test/compatibility-runner.check.cjs
```

脚本内固定当前发布基线 kit 2.31.1 / ui 1.20.1 / bd 0.38.0 / design 0.18.0 / test 0.32.0；更新发布基线时统一修改脚本并分发，不能让浮动 latest 代替验收版本。锁格式为 `{"packages":[{"key":"bd","name":"@agile-team/wl-skills-bd","newVersion":"0.39.0","artifact":"tarballs/bd.tgz","sha256":"<64位实际sha256>"}]}`；相对产物路径以锁文件所在目录解析，包身份、递进版本和字节 hash 均校验。

每轮只在本轮临时目录真实安装旧版、init、安装精确候选 tgz、普通 update、检查所有权/gateway/用户字节、task notice/同 runId status、安装版本漂移拒绝，再安全 clean。BD 生命周期使用真实预览 planHash 与确认。随后候选与其余四个精确发布版真实安装，共存 describe/status 身份分别检查，同 runId 不串包，独立子项目不继承父安装。

默认缓存也位于临时目录；可用 `WL_COMPAT_NPM_CACHE` 指定 CI 依赖缓存。`--output` 指定证据父目录，每轮创建独立子目录保存精确 tgz、sha256、commands.jsonl、原始 cli.log、summary.json；无网络/安装失败/断言失败均退出非零。Design/Test 的可选 Node20 测试必须配置真实节点，禁用 require(esm) 并实测；未提供时摘要明确 `not-requested`，不宣称已通过。

`compatibility-runner.check.cjs` 只验证输入拒绝、锁身份/hash、升级递进和沙盒护栏；合成 tgz 从不安装，不能冒充真实升级或共存结果。实际网络矩阵单独运行上述入口，以 summary 和原始日志验收。

## 任务与执行证据协议 v1

五包都独立提供任务判定、解释、执行状态和宿主入口诊断。每包保留自己的技能目录、领域路由、基础规则、项目 Profile 和执行器；共同内置的 `task-observability.cjs` 只处理事件格式、快照和状态，不承载跨包业务规则。Schema 与 helper 由这里的固定快照同步，独立 npm 包自带所需内容。

每个请求都应获得明确判定：`matched` 选中专门技能，`baseline` 应用基础约束，`ambiguous` 需要明确候选，`gap` 提出相关能力缺口，`not-applicable` 有明确职责外证据，`needs-context` 尚不足以判断。未知请求不能直接算作无关。缺口只产生建议，不自动改业务规则或授予写权限。需要人工审阅的语义项继续保留人工边界。

任务匹配是计划；实际 CLI/MCP 执行才写工具事件。`executionStatus=completed` 只说明调用完成，不能替代 `validationStatus`。空检查、空目标、被跳过的检查或未覆盖的规则必须保持 `unverified`/`partial`。规则、配置、源码或执行器版本变化使旧证据过期；重新执行对应检查才能更新结果，规则计划过期还需重新判定。

同一用户任务组合使用多个已安装包时，显式复用一个 `runId`（命令 `--run-id` 或 `WL_TASK_RUN_ID`）。事件分别保存于各包声明的 `composition.observability.storage`，不同 runId 的结果不得拼成一个全通过结论。不可变事件文件支持同一任务的并发回执；这不扩大共享安装文件的并发写保证。

同工具、同目标的复验按开始时间保留最新结果，旧检查晚结束不会覆盖较新的失败。跨进程开始时间相同时无法证明先后，保留并列证据并标记 `executionOrderUnverified`，任何失败仍显示失败，其余保持部分验证；不能按结束顺序任意挑选通过结果。

每包安装 `.agents/skills/wl-skills-<包>/SKILL.md` 原生发现网关，并纳入自己的安装所有权。网关只转到所选 canonical Skill。`doctor-host` 只检查文件、入口和参考大小预算；`hostDiscovery`、模型阅读及 MCP 连接在没有宿主事件时仍为 `unverified`。不能凭目录存在、模型自述或静态诊断就承诺所有宿主一定触发。

宿主路径和激活说明由 `host-profiles.cjs` 同源分发；模型名或编辑器名不代替具体宿主。安装器生成各宿主所需的薄网关，当前 ZCode 复用兼容的 `.agents` 入口，避免 `.zcode` 同名副本重复注入；既有双入口只诊断并提示人工核对，不自动删除用户内容。`notice.summary` 可直接显示包、版本、项目、目标、runId、规则与检查状态；`usageChain` 区分发现、读取、路由、执行和验证，`nextActions` 给出当前缺口及经过身份核对的本地命令。JSON 输出不会证明宿主已经展示这些信息。

后续完善某包的场景时，先调整本包目录与声明式路由，再补正向、负向、歧义和缺口用例；共同协议保持兼容或显式升版。正式验收同时验证真实 CLI/MCP 回执、源码/规则过期、同任务关联、独立发布内容，以及五包 120 种安装、升级和卸载顺序的所有权。

### 真实宿主行为回归

中文用例在 `test/fixtures/host-skill-eval.zh-CN.json`。同一任务族放在同一个 `dev` 或 `holdout` 分组。开发时用 `dev` 定位问题，确认候选方案后再跑 `holdout`。大多数任务仅安装其负责的单包。少量反例有意安装容易误选的包，或同时安装五包以观察互相干扰。

普通 CI 只跑确定性测试。真实模型运行是显式命令，建议用于发布候选，每次使用全新的临时项目和合成素材。菜单用例启动本机只读模拟服务，独立记录写入尝试，同时核对页面与路由字节。用例运行不读取真实业务项目，不接受业务环境或凭据配置。

使用 `candidate`、`baseline` 和 `no-skill` 分别运行同一个 case。前两种各传自己的产物锁与已预热的 npm 缓存。产物锁使用 `{"schemaVersion":1,"packages":{"kit":{"file":"./candidate.tgz","version":"2.33.5","sha256":"<64 位摘要>"}}}`，路径相对于锁文件。`baseline` 使用公开 registry 的精确版本 tarball，`candidate` 使用发布流程留存的真实 tarball。`no-skill` 不传产物锁与缓存，仍执行相同的结果和边界检查。

```sh
npm run eval:host -- run \
  --catalog test/fixtures/host-skill-eval.zh-CN.json --case kit-menu-sort-preview \
  --variant candidate --artifacts "$WL_EVAL_CANDIDATE_LOCK" --npm-cache "$WL_EVAL_NPM_CACHE" \
  --model "$WL_EVAL_MODEL" --effort low --repeat 3 --out "$WL_EVAL_REPORT"

npm run eval:summary -- test/fixtures/host-skill-eval.zh-CN.json \
  "$WL_EVAL_CANDIDATE_REPORT" "$WL_EVAL_BASELINE_REPORT" "$WL_EVAL_NO_SKILL_REPORT"
```

锁定并记录宿主版本和模型，保留原始版本对照。报告只保留有限证据字段、事件标识、产物摘要、会话结果、`runId` 和可观测的用量，不保留原始会话或凭据。原生发现、读取技能文件、调用工具、返回结构化结果和产物验收分别计分。缺少读取事件或宿主失败时保留 `unknown`。评测显式请求和隐式请求时分别使用对应样本，Codex 文本中的 `$wl-skills-test` 表示显式请求，仍需实际加载证据。比较摘要按宿主、版本、模型、分组和产物版本拆开，准确率的分母只含可判定样本，耗时和 token 单列样本数。初次样本数少时使用原始分子分母复核。

表单扫描、接口设计和测试断言审计用例同时要求本地检查器在同一 `runId` 留下回执、生成约定产物，并保持指定源码不变。后端配置体检用例检查原始结果包含 Nacos 检查，且未请求连通性探测。触发或工具完成只证明对应阶段，产物和文件边界仍独立评分。

Codex 的 `hostFailureKinds` 仅计数会话流报告的连接重试、鉴权、限流等错误类别。它可与工具本身的失败原因分开复核，报告不会保存错误原文。重试后完成的回合仍按执行结果评分。

排查 Codex 菜单工具时，可以把 `run` 换为 `probe`，保留候选锁和 `kit-menu-sort-preview` 用例，省略模型、推理档位、重复和严格评分参数。它在隔离的 App Server 线程中列出 MCP 并直接执行本机模拟菜单查询，记录成功与拒绝的读取、写入尝试及同一 `runId` 的包回执。探针不启动模型回合，其回执独立于模型评测摘要。菜单模型用例还会核对实际子技能、具体预览动作、`planHash` 格式和执行回执。摘要分别记录任务结果和文件边界。

运行菜单模型用例时，只有当前用例要求的查询或预览工具会获得本次进程的单工具自动批准。验收器核对固定的 Kit 产物和本次模拟服务，限制该 MCP 后端只能连接分配给它的本机端口。模拟服务拒绝并记录所有写入请求。其他工具和宿主设置仍按原有审批规则执行。

ZCode 等宿主可以用 `eval:host -- ingest --catalog <目录文件> --case <用例> --evidence <事件摘要> --out <新报告>` 导入经过脱敏的宿主事件。导入信息需要写明宿主与模型、同一 `runId`、事件类型与 ID、完成状态和观测覆盖。仅有模型回复或技能列表时不填写实际技能或工具事件。导入模式没有独立的文件前后快照，文件断言保持未知。原生自动验收可以增加 `--strict true`，遇到失败或未知的必需证据返回非零。

```json
{
  "schemaVersion": 1,
  "variant": "candidate",
  "host": { "name": "zcode", "version": "<宿主版本>", "model": "<模型>" },
  "runId": "eval-example",
  "status": "completed",
  "coverage": { "skill": false, "tools": false },
  "events": []
}
```

示例表示会话已结束但缺少宿主事件。只有在宿主导出证明相应动作时才添加事件。技能事件使用 `kind: "skill"`、`skill: "kit"`、`invocation: "implicit"` 和 `status: "completed"`。工具事件使用 `kind: "tool"`、`channel: "mcp"`、精确 `tool` 和真实 `status`。每个事件都需要原始事件 ID，CLI 事件额外需要 `package` 和同一 `runId`。只有完整轨迹才能把相应的 `coverage` 设为 `true`。

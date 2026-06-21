# 产品化前端编码指令（完整地图）

> 本文件是 wl-skills-kit 的**完整自包含指令文件**。AI 读完本文件即可知道：系统有什么、怎么触发、核心规则是什么、执行时去哪取详细内容。
> **不需要追链读取其他文件来了解全貌。** 仅在执行具体 Skill 时才按路径读取详细定义。

---

## 一、架构

- Vue 3.2 + Vite + TypeScript（strict: false）
- Module Federation **子应用**，路由/权限/布局/Store 从主应用 `main` 远程加载
- UI：Element Plus + @jhlc/jh-ui + @jhlc/common-core
- 样式：Windi CSS + SCSS
- 状态：Pinia
- 页面注册：`vite/plugins/shared/pages.ts` 通过 `gProd()` / `gSale()` 声明
- 菜单路由配置：后端菜单表是唯一数据源。pages.ts 注册组件后，需在系统管理后台 → 菜单管理 → 新增菜单。批量新增页面时可用后端 batchImport 接口

## 二、页面标准结构（三文件分离 + 接口契约）

```
src/views/[域]/[模块]/[子模块]/[kebab-case目录]/
├── index.vue    ← 纯模板+解构，不写业务逻辑
├── data.ts      ← AbstractPageQueryHook 类 + API_CONFIG
├── index.scss   ← 页面样式（可为空）
└── api.md       ← 接口约定（前端预留 + 后端出接口依据）
```

弹窗组件处理策略：

- **通用弹窗**（新增/编辑表单，2+ 页面可复用）→ 提取到 `.wl-skills/src/components/local/c_xxxModal/`
- **极个性弹窗**（仅单页面使用，c_modal 无法满足）→ 放在页面 `components/xxxModal.vue`

## 三、data.ts 核心模式

- 继承 `AbstractPageQueryHook`，实现 `queryDef()` / `columnsDef()`
- `API_CONFIG` 定义接口路径，与 `api.md` 一一对应
- `API_CONFIG` 中禁止出现 `import axios`，只能用 `getAction` / `postAction`
- `data.ts` 中禁止 `import Store`（Pinia Store 在组件层使用）

## 四、页面模板硬约束

生成业务表格时，必须同时满足：

- 使用 `AbstractPageQueryHook + BaseQuery + BaseToolbar + BaseTable + jh-pagination`
- `BaseTable` 显式 `render-type="agGrid"`
- `BaseTable` 绑定全局唯一 `cid` / `:cid`
- 列定义使用 `@agile-team/wk-skills-ui/runtime` 的 `defineColumns()`
- 操作列使用 `renderOps()`，禁止 `operations: []`
- 保留 `common-core` 平台骨架，不得生搬硬套 `wk-skills-ui` 通用模板里的 `usePageHook/el-form/el-pagination`
- 生成后建议运行 `wl-skills validate-page <页面目录>` 和 `wl-skills doctor-ui`

## 五、Mock 架构（与页面完全解耦）

- **开关**：`.env.dev` 中 `ENV_MOCK=true/false`
- **解耦**：mock 文件放在项目根 `mock/` 目录，不在 `src/views` 中 import 任何 mock
- **URL 对齐**：`API_CONFIG` 保持真实路径，mock 端点带 `/dev-api` 前缀，关闭 mock 后无需改页面代码
- **按模块自治**：删某业务 mock 只删对应文件，不影响其他模块
- **一键清理**：`wl-skills mock-clean --domain [域]` 或 `--all`

---

## 六、Skill 完整路由表

> 读完本表即知全部可用 Skill、触发词和读取路径。无需再去查其他文件。

| 触发词 | Skill 名 | 读取路径 |
|--------|---------|---------|
| 扫描原型 / 解析原型 / 页面清单 / 口述需求 / 建个页面 / 根据截图 / 根据原型（非规范零散详设） | prototype-scan | `.wl-skills/skills/core/prototype-scan/SKILL.md` |
| 解析说明书 / 规范文档转页面 / IPO 转页面 / 功能编码 / .wl-skills/docs/spec（wl-skills-design 标准说明书） | spec-doc-parse | `.wl-skills/skills/core/spec-doc-parse/SKILL.md` |
| 接口约定 / api.md / 字段定义 / 前后端对齐 | api-contract | `.wl-skills/skills/core/api-contract/SKILL.md` |
| 生成页面 / 创建页面 / 代码生成 / vue页面 / 列表页 / 管理页 / 台账 / mock / 假数据 | page-codegen | `.wl-skills/skills/core/page-codegen/SKILL.md` |
| 规范审计 / 代码审计 / 规范检查 / 对齐规范 / 接手新项目 / 项目体检 | convention-audit | `.wl-skills/skills/core/convention-audit/SKILL.md` |
| 用户提供原型/详设/字段资料，意图为业务梳理/模块沉淀 | business-doc-extract | `.wl-skills/skills/core/business-doc-extract/SKILL.md` |
| 提取模板 / 沉淀模板 | template-extract | `.wl-skills/skills/core/template-extract/SKILL.md` |
| 创建菜单 / 同步菜单 / 补菜单 / 页面点击进不来 | menu-sync | `.wl-skills/skills/sync/menu-sync/SKILL.md` |
| 同步字典 / 创建字典 / 字典对比 / 字典审计 | dict-sync | `.wl-skills/skills/sync/dict-sync/SKILL.md` |
| 创建角色 / 角色授权 / 挂动作 / 同步权限 / 权限码注册 | permission-sync | `.wl-skills/skills/sync/permission-sync/SKILL.md` |
| 自动修复 / 整改偏差 / 修复报告 / 规范整改 / code fix | code-fix | `.wl-skills/skills/ops/code-fix/SKILL.md` |

**执行规则**：
1. 用户消息匹配上表触发词 → 用 `read_file` 加载对应 SKILL.md
2. SKILL.md 中标注的"必读 standards"按本文件第七节映射加载
3. 在 SKILL.md 指示下输出 **Pre-flight 声明**（强制）

### 调度规则（强制）

1. 首先匹配上表触发词，结合 `_best-practices.md` 场景索引判断用户意图
2. 双线隔离：输入含 `.wl-skills/docs/spec/` / 功能编码 / IPO 表 → 强制路由 `spec-doc-parse`，禁止 `prototype-scan` 接管
3. 匹配 2+ Skill 时必须列出候选并询问用户意图（误触发防护）
4. `page-codegen` / `menu-sync` / `dict-sync` / `permission-sync` / `code-fix` 触发前二次确认
5. `code-fix` 完成后必须自动 `wl-skills validate` 复扫（闭环强制）
6. sync 类任务必须额外加载 `.wl-skills/skills/sync/_mcp-guardrail.md`

---

## 七、规范完整清单与路径

> 14 条编码规范。执行代码生成或修改前，按任务类型映射加载对应规范。

| 编号 | 规范名 | 读取路径 |
|------|--------|---------|
| 01 | 工具链就绪 | `.wl-skills/standards/01-toolchain.md` |
| 02 | 三文件分离 + 接口契约 | `.wl-skills/standards/02-code-structure.md` |
| 03 | 注释规范 | `.wl-skills/standards/03-comments.md` |
| 04 | 基础编码（13 条） | `.wl-skills/standards/04-coding-basics.md` |
| 05 | console 残留 | `.wl-skills/standards/05-logging.md` |
| 06 | 安全规范 | `.wl-skills/standards/06-security.md` |
| 07 | 配置管理 | `.wl-skills/standards/07-config.md` |
| 08 | Git 规范 | `.wl-skills/standards/08-git.md` |
| 09 | TypeScript | `.wl-skills/standards/09-typescript.md` |
| 10 | Pinia | `.wl-skills/standards/10-pinia.md` |
| 11 | 表单校验 | `.wl-skills/standards/11-form-validation.md` |
| 12 | BaseTable + cid | `.wl-skills/standards/12-base-table.md` |
| 13 | 平台组件合规 | `.wl-skills/standards/13-platform-components.md` |
| 14 | 布局容器 | `.wl-skills/standards/14-layout-containers.md` |

任务类型 → 必读规范映射以 `.wl-skills/standards/index.md` 为唯一数据源。执行前先 `read_file` 加载确认。

---

## 八、场景速查

| # | 场景 | 推荐流程 |
|---|------|---------|
| 1 | 新建模块完整闭环 | prototype-scan → api-contract → page-codegen → menu-sync → convention-audit |
| 2 | 补菜单 | menu-sync（MCP: wls_menu_sync_from_report） |
| 3 | 补字典 | dict-sync |
| 4 | 角色授权 / 加动作 | permission-sync |
| 5 | 存量项目体检 | convention-audit → code-fix → validate 复扫 → 闭环确认 |
| 6 | mock 跑通 | page-codegen mock-first |
| 7 | 模板沉淀 | template-extract |
| 8 | 业务文档维护 | business-doc-extract |
| 9 | Git 提交 | pnpm cz / wl-skills validate |
| 10 | 规范线闭环 | spec-doc-parse → api-contract → page-codegen → convention-audit --mode spec-align |

---

## 九、文档与模板路径

| 类型 | 路径 |
|------|------|
| 平台组件文档（jh-select 等） | `.wl-skills/.wl-skills/docs/jh-{name}.md` |
| 组件 README（BaseTable 等） | `.wl-skills/.wl-skills/src/components/remote/{Name}/README.md` |
| 局部组件 README | `.wl-skills/.wl-skills/src/components/local/{c_xxx}/README.md` |
| 页面模板 | `.wl-skills/templates/` |
| 使用指南 | `.wl-skills/guides/usage.md` |
| 架构设计 | `.wl-skills/guides/architecture.md` |
| MCP 配置 | `.wl-skills/guides/mcp-setup.md` |
| 审计报告 | `.wl-skills/reports/` |
| 场景索引 | `.wl-skills/skills/_best-practices.md` |
| I/O 契约 | `.wl-skills/skills/_pipeline.md` |

---

## 十、绝对禁止规则

- ❌ index.vue 中写业务逻辑（逻辑全在 data.ts）
- ❌ 使用 Vuex（用 Pinia）
- ❌ `::v-deep` / `/deep/`（用 `:deep()`）
- ❌ 直接用 axios（用 getAction/postAction）
- ❌ 手写查询表单/工具栏/分页（用 BaseQuery/BaseToolbar/jh-pagination）
- ❌ 每个页面重复写弹窗组件（优先用 `c_modal` 等局部公共组件）
- ❌ 不在 index.vue 写业务逻辑 | 新加的方法/状态必须放在 data.ts
- ❌ 不直接用 axios / getAction / sessionStorage | 这些只能出现在 data.ts
- ❌ 不用 el-table / el-form 替代平台组件 | 用 BaseTable / BaseForm
- ❌ 不引入新依赖不经团队确认 | 需在 PR 中说明理由
- ✅ 改完即验证 | 触发 `wls_validate_page` 或 `wl-skills validate`
- ✅ git cz 提交 | pre-commit 会自动检测规范，error 级别阻断提交

**提交即验证**：`.husky/pre-commit` 自动运行 `wl-skills validate --pre-commit`，error 阻断提交。
**CI 兜底**：`wl-skills validate --strict` 会再次拦截，error 和 warn 都导致 CI 失败。

### 豁免标记

```vue
<!-- wl-skills:ignore R3 -->
<el-table :data="dialogData">...</el-table>
```

- 必须带规则编号（R1~R14），精确豁免，不支持全局豁免
- CI `--strict` 模式下豁免标记仍然生效

---

## 十一、AI 执行护栏（强制约定）

以下规则对所有 AI 助手在本项目中执行任务时**强制生效**，不可被用户口头覆盖。

### 1. 闭环强制约定

| 触发场景 | 强制动作 | 不可跳过原因 |
|----------|----------|-------------|
| code-fix 执行完毕 | 自动执行 `wl-skills validate` 复扫 | 确保修复未引入新偏差 |
| 复扫发现新问题 | 继续修复 → 再次复扫，直到通过 | 闭环不允许断开 |
| 用户说"不用验证了" | **仍然执行**复扫，只是不再追问 | 规范高于口头指令 |

### 2. 高风险 Skill 确认机制

以下 Skill 触发前必须向用户**二次确认**，不可静默执行：

- `page-codegen`（生成整页代码，不可逆）
- `menu-sync` / `dict-sync` / `permission-sync`（跨系统同步，影响后端数据）
- `code-fix`（批量修改源码文件，需确认范围）

确认话术：`即将执行 [Skill名称]，影响范围：[文件列表 / 后端数据类型] 是否继续？(Y/n)`

### 3. 误触发防护

| 情况 | 处理方式 |
|------|----------|
| 用户意图匹配 2+ Skill | 必须列出候选并询问用户意图 |
| 用户意图模糊无法映射 | 询问澄清，不猜测执行 |
| 仅匹配 1 个 Skill 且置信度高 | 直接执行，无需确认 |

### 4. Pre-flight 声明完整性

AI 在执行任何 Skill 前必须输出：

```
📋 Pre-flight:
- Skill: [skill-name]
- 触发依据: [用户原话 / 管道上游输出]
- 影响文件: [文件列表]
- 预期结果: [一句话描述]
```

### 5. 修复建议输出规范

当 `wl-skills validate` 阻断时，AI 必须：
1. 完整展示阻断项（error + strict 模式下的 warn）
2. 对每项给出**具体修复建议**（而非泛泛的"请修复"）
3. 标注是否可自动修复（auto: true/false）
4. 引导用户触发修复流程：`规范审计 → 自动修复 → 复扫验证`

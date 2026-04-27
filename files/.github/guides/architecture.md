# wl-skills-kit 架构设计与决策记录

> **读者**：团队技术负责人 / wl-skills-kit 维护者 / 对体系设计感兴趣的团队成员  
> **更新方式**：重大架构变更后追加对应章节，旧章节原文保留（历史可溯）  
> **当前版本**：v2.1.8（2026-04-27）

---

## 目录

1. [这个体系解决什么问题](#1-这个体系解决什么问题)
2. [npm 包工作机制](#2-npm-包工作机制)
3. [整体运行时架构](#3-整体运行时架构)
4. [分层架构详解](#4-分层架构详解)
   - 4.1 规范层（standards/）
   - 4.2 Skill 层（skills/）
   - 4.3 适配层（\_compat/）
   - 4.4 报告层（reports/）
   - 4.5 模板层（page-codegen/templates/）
5. [Pre-flight 约定式输出机制](#5-pre-flight-约定式输出机制)
6. [三层文档体系](#6-三层文档体系)
7. [Skill 生命周期管理](#7-skill-生命周期管理)
8. [菜单/字典/权限同步机制](#8-菜单字典权限同步机制)
9. [工具链前置检测](#9-工具链前置检测)
10. [版本演进历史](#10-版本演进历史)
11. [关键决策记录（ADR）](#11-关键决策记录adr)

---

## 1. 这个体系解决什么问题

### 根本问题：AI 不了解"你的项目"

AI 编辑器（Copilot / Cursor / Windsurf 等）知道通用编程知识，但不知道：

- 这个项目用 `AbstractPageQueryHook` 而不是手写 `ref` + `axios`
- 表格必须用 `AGGrid` 的封装，不能直接用 `el-table`
- API 响应外壳是 `{ code: 2000, data: {...} }`，不是 `{ code: 200, result: {} }`
- 页面目录必须是 4 文件（data.ts / index.vue / index.scss / api.md）
- 菜单注册有专门的后端接口流程，不是手改路由文件

不了解这些，AI 每次都会生成"语法正确但不合规"的代码，增加 review 成本。

### 传统方案的缺陷

| 方案                                 | 问题                                              |
| ------------------------------------ | ------------------------------------------------- |
| 把规范写进 wiki                      | AI 不读 wiki；wiki 和代码脱节                     |
| 把规范贴进每次对话                   | 重复劳动；规范长了 token 爆炸；换 AI 工具就要重来 |
| 一个超长的 `copilot-instructions.md` | v1.x 试过，膨胀到 600+ 行，AI 全量加载不看实际    |

### 本方案的核心思路

> **把规范做成 AI 可自动加载的结构化知识库，以 Skill 为粒度按需调度，形成"口述意图 → 符合规范的完整实现"的闭环。**

具体体现为：

1. 规范分层、按任务类型懒加载（token 高效利用）
2. Skill 触发词驱动（开发者用自然语言，AI 读结构化 SKILL.md）
3. Pre-flight 约定式声明（消除 AI "假执行"黑盒问题）
4. 多 AI 编辑器适配（一套内容，自动生成 9 种根配置，解耦可扩展）
5. 报告层追加不覆盖（累积团队知识，不丢失审计历史）

---

## 2. npm 包工作机制

`wl-skills-kit` 是一个**一次性初始化型 npm 包（scaffolding CLI）**，不是运行时依赖：

```
npx @agile-team/wl-skills-kit         ← 下载 → 执行 → 完成，不留在 dependencies
npx @agile-team/wl-skills-kit update  ← 增量更新，可在业务项目生命周期中多次运行
```

### 仓库目录 vs 业务项目目录

| 仓库目录        | 说明                                      | 会被安装？ |
| --------------- | ----------------------------------------- | ---------- |
| `bin/`          | CLI 实现（`wl-skills.js`）                | ✅ 会      |
| `files/`        | 所有要复制到业务项目的文件                | ✅ 会      |
| `kit-internal/` | 维护者文档（architecture / CONTRIBUTING） | ❌ 不会    |
| `CHANGELOG.md`  | 版本记录                                  | ✅ 会      |

> **关键**：`kit-internal/` 通过 `package.json` 的 `files` 白名单机制严格排除，永远不会进入业务项目。

### bin/wl-skills.js 工作流程

```
wl-skills.js init/update
    │
    ├─ 1. 递归读取 files/ 目录下所有文件
    │
    ├─ 2. 读取 files/.github/copilot-instructions.md（主体内容）
    │
    ├─ 3. 读取 _compat/editors.json（编辑器注册表）
    │      对每个 enabled editor：
    │        读取 _compat/headers/{editor}.txt（特化 frontmatter）
    │        拼接：header + 自动生成注释 + 主体内容
    │        写入 editor.outputPath（如 CLAUDE.md / .cursorrules / ...）
    │
    ├─ 4. 写入其他 files/ 文件到目标目录
    │      - reports/*.md 已存在则跳过（保护团队累积数据）
    │      - 其他文件：覆盖写入
    │
    └─ 5. 写入/更新 .wl-skills-manifest.json（文件哈希快照）
```

---

## 3. 整体运行时架构

```
开发者
  │ 在 AI 对话中说出意图
  │ "帮我生成客户管理列表页"
  ▼
AI 编辑器（Copilot / Cursor / Windsurf / Claude Code / Cline / Kiro / Trae）
  │
  │ 自动加载根配置文件（各编辑器读自己的文件）：
  │   Copilot  → .github/copilot-instructions.md
  │   Claude   → CLAUDE.md
  │   Cursor   → .cursorrules + .cursor/rules/conventions.mdc
  │   Windsurf → .windsurfrules
  │   Cline    → .clinerules
  │   Kiro     → .kiro/steering/conventions.md
  │   Trae     → .trae/rules/conventions.md
  │   通用     → AGENTS.md
  │
  │ 根配置包含：
  │   - 项目架构概要（栈、4文件原则、API契约）
  │   - Skill 调度规则（触发词 → 读 _registry.md → 读 SKILL.md）
  │   - Pre-flight 输出要求
  │
  ▼
.github/skills/_registry.md
  │ 触发词 → SKILL 路径映射
  │ "生成页面" → skills/core/page-codegen/SKILL.md
  │
  ▼
.github/skills/core/page-codegen/SKILL.md
  │ 声明：必读 standards 列表 + 完整生成流程 + 输出规范
  │
  ▼
.github/standards/（按 index.md 门控，按需加载）
  │ page-codegen 需要：02/06/07/08/12/13 共 6 条
  │ convention-audit 需要：全部 13 条
  │
  ▼
AI 生成代码/报告/api.md
  │
  └─ 写入到：
       src/views/<域>/<模块>/<子模块>/<page>/
       .github/reports/（追加写入）
```

---

## 4. 分层架构详解

### 4.1 规范层（standards/）

**目录结构**：

```
standards/
├── index.md            ← 门控：任务类型 → 规范子集映射
├── 01-toolchain.md     工具链前置检测（🔴 阻断）
├── 02-code-structure.md 4文件原则 + 三段式 + script 9段顺序（🔴 必遵）
├── 03-comments.md      注释规范（🟡 建议）
├── 04-coding-basics.md 基础编码 13 条（🔴 必遵）
├── 05-logging.md       日志输出规范（🔴 必遵）
├── 06-security.md      安全规范（🔴 必遵）
├── 07-config.md        配置管理 / 环境变量（🔴 必遵）
├── 08-git.md           Git 分支 & 提交规范（🔴 必遵）
├── 09-typescript.md    TypeScript 类型规范（strict:false 环境）（🟡 建议）
├── 10-pinia.md         Pinia 状态管理规范（🔴 必遵）
├── 11-form-validation.md 表单与校验规范（🔴 必遵）
├── 12-base-table.md    BaseTable + AGGrid cid 命名规范（🔴 必遵）
└── 13-platform-components.md  平台组件对照表（🔴 必遵 + 阻断）
```

**懒加载门控设计**：

`index.md` 维护任务类型 → 规范子集的映射表。AI 接到任务时，先查 `index.md` 确认本次任务需要加载哪些规范文件，而不是每次全部读取 13 条。典型负载：

| 任务类型         | 加载规范数 | 说明                        |
| ---------------- | ---------- | --------------------------- |
| 生成新页面       | 5 条       | 01 / 02 / 04 / 12 / 13（按需 +09/10/11） |
| 修改/重构页面    | 3 条       | 02 / 04 / 13（按需 +09/10/11） |
| 规范审计（全量） | 13 条      | 全部加载                    |
| 菜单/同步操作    | 1 条       | 07（环境变量不硬编码）       |
| 仅 Git 提交      | 1 条       | 08                          |

**第 13 条的特殊地位**：`13-platform-components.md` 是最核心的 AI 行为约束，强制 AI 在生成代码时优先使用平台封装组件（`@jhlc/jh-ui` / `@jhlc/common-core`），禁止随意使用原始 `el-table` / `el-form`。与第 12 条（BaseTable/AGGrid 封装）并列为质量门控最高优先级。

---

### 4.2 Skill 层（skills/）

**分级目录**：

```
skills/
├── _registry.md         触发词 → SKILL 路径（单一数据源，禁止其他地方重复定义触发词）
├── _compat/             多 AI 编辑器适配层（见 4.3）
│
├── core/                核心通用 Skill（任何前端项目均可使用）
│   ├── prototype-scan/      原型/口述 → 页面清单
│   ├── api-contract/        页面清单 → api.md 前后端契约
│   ├── page-codegen/        api.md → 4文件骨架代码
│   ├── convention-audit/    现有代码 → 规范偏差报告
│   └── template-extract/    成熟页面 → 领域模板（沉淀复用）
│
├── sync/                数据同步类（与后端系统联动）
│   ├── menu-sync/           ✅ 启用：菜单基线 ↔ 后端菜单接口
│   ├── dict-sync/           ⏳ PLANNED
│   └── permission-sync/     ⏳ PLANNED
│
├── ops/                 运维/质量类
│   └── code-fix/            ⏳ PLANNED：受控自动修复偏差
│
└── domain/              领域专属 Skill（按需创建，初始为空）
    └── README.md
```

**Skill 调度流程**：

```
用户说出意图
    → AI 扫描 _registry.md 触发词表
    → 命中 → read_file 加载对应 SKILL.md
    → SKILL.md 声明必读 standards → AI 按需加载规范
    → 输出 Pre-flight 声明 → 执行任务
```

**扩展边界**：当 `domain/` 下某域 Skill 超过 5 个，或出现跨团队复用需求时，拆为独立 npm 包（如 `@agile-team/wl-skills-produce`），本包保留 `core/sync/ops`。

---

### 4.3 适配层（\_compat/）

**核心问题**：9 种 AI 编辑器读取格式各异，有的需要 frontmatter，有的不需要，字段也不同：

| 编辑器       | 加载路径                          | frontmatter 要求                    |
| ------------ | --------------------------------- | ----------------------------------- |
| Copilot      | `.github/copilot-instructions.md` | 无                                  |
| Claude       | `CLAUDE.md`                       | 无                                  |
| Cursor（旧） | `.cursorrules`                    | 无                                  |
| Cursor（新） | `.cursor/rules/*.mdc`             | `description + globs + alwaysApply` |
| Windsurf     | `.windsurfrules`                  | 无                                  |
| Cline        | `.clinerules`                     | 无                                  |
| Kiro         | `.kiro/steering/*.md`             | `inclusion: always`                 |
| Trae         | `.trae/rules/*.md`                | `description + alwaysApply`         |
| 通用         | `AGENTS.md`                       | 无                                  |

**解耦设计**：

```
_compat/
├── editors.json         ← 编辑器注册表（bin 读此决定生成什么）
├── headers/             ← 各编辑器特化头部模板（含 frontmatter）
│   ├── cursor-mdc.txt     description + globs + alwaysApply
│   ├── kiro.txt           inclusion: always
│   ├── trae.txt           description + alwaysApply
│   └── ...（无 frontmatter 的也有对应 txt，写版权注释）
└── README.md
```

**解耦效果**：

- 主体内容（规范 + Skill 调度逻辑）来自 `copilot-instructions.md`，**单一数据源**
- 每个编辑器的差异只在 `headers/*.txt` 里定义，互不干扰
- 在 `editors.json` 中将某编辑器 `enabled: false`，重跑 `update` 后该文件不再生成，其他编辑器配置**完全不受影响**（已验证）

---

### 4.4 报告层（reports/）

**设计原则：追加不覆盖**

`reports/` 是团队的**累积知识资产**，`init`/`update` 命令遇到已存在的报告文件一律跳过。

```
reports/
├── SYS_MENU_INFO.md          线上菜单基线（menu-sync 的数据来源）
├── SYS_DICT_INFO.md          线上字典基线（dict-sync PLANNED）
├── SYS_PERMISSION_INFO.md    线上权限基线（permission-sync PLANNED）
├── PROTOTYPE_SCAN_*.md       原型扫描结果（prototype-scan 生成）
├── PAGE_CODEGEN_*.md         代码生成摘要（page-codegen 生成）
├── AUDIT_AI_*.md             规范审计详细报告（convention-audit 生成，AI 读）
├── AUDIT_HUMAN_*.md          规范审计摘要（convention-audit 生成，人读）
├── MENU_SYNC_*.md            菜单同步操作日志（menu-sync 生成）
└── CODE_FIX_*.md             自动修复操作日志（code-fix PLANNED）
```

**三类报告的写入规则**：

| 类别     | 文件                  | 写入方式                     | 用途                          |
| -------- | --------------------- | ---------------------------- | ----------------------------- |
| 系统基线 | `SYS_*.md`            | pull 时全量刷新              | 作为 sync 系列 Skill 的数据源 |
| 过程报告 | `PROTOTYPE_SCAN_*` 等 | 每次生成追加，文件名带时间戳 | 可追溯历史                    |
| 操作日志 | `MENU_SYNC_*` 等      | 每次操作追加，含回滚 SQL     | 出了问题可查回滚              |

---

### 4.5 模板层（page-codegen/templates/）

**分层策略**：

```
templates/
├── _index.md              模板注册表（单一数据源）
├── universal/             通用交互模式模板（跨业务域通用）
│   ├── TPL-LIST.md            普通列表页
│   ├── TPL-MASTER-DETAIL.md   主从详情页
│   ├── TPL-TREE-LIST.md       树形列表页
│   ├── TPL-DETAIL-TABS.md     详情 Tabs 页
│   ├── TPL-FORM-ROUTE.md      路由级表单页
│   ├── TPL-RECORD-FORM.md     记录级表单
│   ├── TPL-CHANGE-HISTORY.md  变更历史页
│   └── TPL-DRIVEN.md          配置驱动页
└── domains/               领域专属模板（单领域高频）
    ├── _CONTRIBUTING.md       贡献规范
    ├── produce/               生产域
    │   └── TPL-OPERATION-STATION.md
    └── sale/                  销售域（占位，待沉淀）
```

**模板选择优先级**：

```
命中 domains/{域}/{场景} → 优先使用领域模板
未命中 → 回落 universal/{类型} → 通用模板
两者都不匹配 → AI 基于规范 + 上下文自由生成（并在完成摘要中标注）
```

**`template-extract` 配套**：团队成员可通过 `template-extract` Skill，只需提供一个目录路径，AI 自动将成熟页面分析提取为 `.tpl` 格式模板并写入 `domains/`，**门槛极低**是驱动团队贡献的关键。

---

## 5. Pre-flight 约定式输出机制

### 问题

AI "假执行"——声称读了规范，实际按惯性输出。没有强制约束时，Pre-flight 形同虚设。

### 机制

三层保障：

**第一层**：`copilot-instructions.md` 主入口明文要求：

> 触发任何 Skill 时，**必须在回复第一段输出 Pre-flight 声明**，列出已读文件、检测结果、关键参数（cid 等）。跳过 Pre-flight = 未执行 Skill，开发者有权要求重来。

**第二层**：每个 `SKILL.md` 文件顶部重复声明：

```
## Pre-flight 声明

在开始任何操作之前，必须输出：
🚀 已触发技能 page-codegen/SKILL.md → 页面代码生成
✅ 已读取 standards/02-code-structure.md → 4文件原则
✅ 工具链检测：.prettierrc.js ✓ eslint.config.ts ✓ .husky/ ✓
✅ cid 已生成：cl-745831
```

**第三层**：错误回退——如 AI 未输出 Pre-flight，开发者一句"补 Pre-flight 声明"，AI 必须补充，否则视为工具失效，升级处理。

### 为什么用约定式输出而不是工具调用

见 [ADR-001](#adr-001约定式输出而非工具调用)。

---

## 6. 三层文档体系

每个启用的 Skill 有三类配套文档，面向不同读者：

| 文件            | 读者           | 位置                     | 内容                               |
| --------------- | -------------- | ------------------------ | ---------------------------------- |
| `SKILL.md`      | AI 编辑器/模型 | `skills/{scope}/{name}/` | 触发词、Pre-flight、执行步骤、约束 |
| `USAGE.md`      | 团队成员       | `skills/{scope}/{name}/` | 示例对话、踩坑、FAQ、快速上手      |
| `*.MAINTAIN.md` | kit 维护者     | `kit-internal/skills/`   | 设计背景、修改要点、版本依赖       |

**设计意图**：

- `SKILL.md` 写给机器看：精确、结构化、无废话
- `USAGE.md` 写给人看：有温度、有示例、有踩坑经验
- `MAINTAIN.md` 写给维护者看：为什么这么设计、改的时候要注意什么

三者严格分离，避免"AI 读到人类语气的废话"或"人类读到机器格式"的不适。

---

## 7. Skill 生命周期管理

```
需求识别
    │
    ▼
⏳ PLANNED（SKILL.draft.md）
    │  包含：设计目标、数据流、工作模式、转正条件
    │  不参与 AI 调度（_registry.md 中不注册）
    │
    ▼  满足转正条件：
    │  ① 设计草稿评审通过
    │  ② 至少一个真实项目端到端跑通
    │  ③ 文档完整（SKILL.md + USAGE.md + MAINTAIN.md）
    │  ④ 触发词不与现有 Skill 冲突
    │
    ▼
✅ 启用（SKILL.md）
    │  注册到 _registry.md
    │  参与 AI 调度
    │
    ▼  技术过时 / 被更好方案替代
    │
⚠️ 废弃（SKILL.deprecated.md）
    │  从 _registry.md 移除
    │  保留文件 + 废弃说明，不直接删除
```

---

## 8. 菜单/字典/权限同步机制

三类 sync Skill 共用同一模式，以 `menu-sync` 为基准（已启用）：

```
本地基线文件（reports/SYS_MENU_INFO.md）
    │
    ├─ pull 模式：从线上拉取 → 全量刷新基线
    │
    └─ push 模式：
           ① 读取基线
           ② 扫描业务项目（src/views/ 下的页面）
           ③ 对比：基线 vs 线上 → 找出缺失条目
           ④ Pre-flight 输出操作预览（必须用户确认）
           ⑤ 调用后端接口写入
           ⑥ 输出操作日志（含回滚 SQL）到 reports/MENU_SYNC_*.md
```

**关键设计约束**：

- **env.local.json 不入 git**：包含 token / gatewayPath，每个开发者本地配置
- **永远不主动删除**：sync 系列 Skill 只做新增/更新，删除走人工 + 后台
- **生产环境保护**：检测到 gatewayPath 含生产域名时，强制输出 SQL 而不直接调用接口
- **二次确认**：任何写操作，Pre-flight 声明后必须等用户 `yes` 才执行

---

## 9. 工具链前置检测

`page-codegen` / `convention-audit` 等代码生成/审计类 Skill 在执行前，必须检查项目是否安装了 `@robot-admin/git-standards`（提供 prettier / eslint / husky 配置）：

```
检测文件：.prettierrc.js / eslint.config.ts / .husky/

全部存在 → ✅ 继续执行

任一缺失 → ❌ 暂停执行，输出：
  工具链检测失败：未找到 [具体文件]
  → 请执行：npx @robot-admin/git-standards init
  → 原因：生成代码必须在统一格式化/lint 规则下有效，否则代码写完就报错
  ⛔ 代码生成已暂停
```

> 使用 `npx` 而非 `npm install` 的原因：`@robot-admin/git-standards` 是一次性初始化工具，运行后只留下配置文件，包本身不需要出现在 `devDependencies`（零运行时依赖，零污染）。

---

## 10. 版本演进历史

| 版本 | 核心变化                                                                                                                                  | 状态      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| v1.x | 5 个 Skill 平铺 + 9 个 TPL 平铺 + 单一超长 copilot-instructions                                                                           | ✅ 已发布 |
| v2.0 | 规范模块化（13 条）+ 模板分层（universal/domains）+ 报告分类 + Pre-flight + 工具链门控                                                    | ✅ 已发布 |
| v2.1 | Skill 分级目录（core/sync/ops/domain）+ 多 AI 适配解耦（editors.json）+ 各 Skill USAGE.md + api-contract 真实响应 + 3 个 PLANNED 草稿补全 | ✅ 当前   |
| v2.2 | dict-sync / permission-sync / code-fix 从 PLANNED → 转正（视后端接口稳定情况）                                                            | ⏳ 规划中 |
| v2.3 | CI 流水线接入（convention-audit 报告注入 PR 评论）+ Skill 版本感知                                                                        | ⏳ 规划中 |

---

## 11. 关键决策记录（ADR）

### ADR-001：约定式输出而非工具调用

**背景**：如何强制 AI 输出 Pre-flight 声明？

**决策**：用 `SKILL.md` 内文本约定（约定式输出），不用自定义工具函数（如 `pre_flight()`）。

**理由**：

- 约定式输出：所有 AI 模型都支持（Copilot/Claude/GPT/本地模型）
- 工具调用：需要编辑器支持函数调用协议，且各编辑器实现不同——与"多 AI 适配"目标矛盾

---

### ADR-002：文件命名全英文

**背景**：部分工具在中文路径上有编码问题（Git / Node.js / Windows cmd）。

**决策**：所有文件名使用英文（kebab-case），文件内容使用中文。

**效果**：路径安全 + 内容可读，两全其美。

---

### ADR-003：PLANNED Skill 用 `.draft.md` 后缀

**背景**：PLANNED Skill 需要在仓库中占位（体现架构意图），但不能被 AI 调度。

**决策**：用 `SKILL.draft.md` 后缀代替 `SKILL.md`，`_registry.md` 只注册 `SKILL.md` 文件。

**效果**：AI 按触发词只会加载 `SKILL.md`，`SKILL.draft.md` 不参与调度，但对维护者可见且路径明确。

---

### ADR-004：模板提取用"开发者指路 + AI 分析"混合模式

**背景**：如何让团队成员以极低门槛贡献领域模板？

**方案对比**：

| 方案           | 门槛 | 质量                          | 结论          |
| -------------- | ---- | ----------------------------- | ------------- |
| 全自动扫描     | 极低 | 低（AI 不知道"哪个值得提取"） | ❌            |
| 纯手写模板     | 高   | 高                            | ❌ 团队不会用 |
| 指路 + AI 分析 | 低   | 高                            | ✅            |

**决策**：开发者只需提供目录路径，AI 读代码 → 分析 → 生成模板，90% 工作量由 AI 完成。

---

### ADR-005：多 AI 编辑器适配解耦（editors.json 注册表）

**背景**：v2.0 的 `getEditorConfigs()` 把 9 个编辑器硬编码在 `bin/wl-skills.js` 里，frontmatter 也只有 Cursor 做了特化，其他编辑器全部用相同格式。

**问题**：

1. 添加新编辑器 → 改 JS 代码
2. 移除某编辑器 → 改 JS 代码 + 需要小心不影响其他
3. Kiro / Trae 没有专属 frontmatter → 不满足编辑器官方最佳实践

**决策**：

- 提取 `_compat/editors.json` 作为编辑器注册表（数据 vs 代码分离）
- 提取 `_compat/headers/` 作为各编辑器 frontmatter 模板文件
- `bin/wl-skills.js` 只有读取逻辑，不再硬编码任何编辑器信息

**效果**：

- 添加新编辑器：加 `headers/xxx.txt` + 在 `editors.json` 注册，JS 不改
- 禁用某编辑器：`enabled: false` 一行，其他编辑器完全不受影响（已端到端验证）
- 每个编辑器 frontmatter 独立维护，Kiro 有 `inclusion: always`，Trae 有 `description + alwaysApply`

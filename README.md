# @agile-team/wl-skills-kit

**AI Skill 模板包 v2.3** — 一条命令将 13 条编码规范、8 个 AI Skill、MCP 工具层、组件文档、领域样例导入 Vue 3 项目。

让 AI 编辑器（Copilot / Cursor / Windsurf / Claude Code / Cline / Kiro / Trae / 通用 Agents）**真正理解项目规范**，从原型/详设到完整页面代码全流程自动化。

---

## TL;DR

```bash
npx @robot-admin/git-standards init      # 工程化前置（必须）
npx @agile-team/wl-skills-kit            # 安装 AI 体系
# 在 AI 对话中：
"扫描 docs/prototypes/ 下的原型生成页面清单"
"基于上一步生成所有 api.md，再 codegen 出页面"
```

---

## 这个包到底干什么？

```
原型/口述需求
    │
    ▼ [Skill: prototype-scan]
《页面清单》(reports/PROTOTYPE_SCAN_*.md)
    │
    ▼ [Skill: api-contract]
api.md（页面级前后端契约）
    │
    ▼ [Skill: page-codegen]
data.ts + index.vue + index.scss（13 条 standards 自动满足）
    │
    ▼ [Skill: convention-audit]
reports/AUDIT_AI_*.md + AUDIT_HUMAN_*.md
    │
    ▼ [Skill: menu-sync]
线上菜单注册完毕，UI 可访问
```

---

## 文档地图 — 谁该读什么

> 这个项目覆盖了多个角色和多层目录，先花 30 秒定位自己，再按需深入。

### 按角色找入口

| 你的身份 | 你要做的事 | 从这里开始 |
|---|---|---|
| **业务团队（首次接入）** | 安装、跑通 AI 代码生成流程 | 本文档 → CLI 命令 → 业务项目内 `.github/guides/usage.md` |
| **设计师 / 产品经理** | 了解如何制作让 AI 精确识别的原型 | [docs/input-spec-prototype.md](docs/input-spec-prototype.md) |
| **业务分析师** | 了解详设文档需要提供哪些结构化内容 | [docs/input-spec-detailed-design.md](docs/input-spec-detailed-design.md) |
| **后端开发者** | 了解接口命名/响应格式规范，如何确认 api.md | [docs/input-spec-api.md](docs/input-spec-api.md) |
| **前端开发者** | 理解 page-spec JSON 结构，手写或校验 | [docs/input-spec-page-spec.md](docs/input-spec-page-spec.md) |
| **wl-skills-kit 维护者** | 修改规范、Skill、模板、CLI | [kit-internal/README.md](kit-internal/README.md) |

### 各目录职责一览

```
wl-skills-kit/
│
├── files/            ← ★ 打包分发给业务项目的全部内容
│   ├── .github/         AI 指令体系（规范+Skill+适配层+报告模板）
│   ├── docs/            随包分发的组件 API 文档（12 个组件）
│   └── demo/            领域样例代码（供 AI 参考学习）
│
├── mcp/              ← ★ MCP Server（随包分发，Cursor 自动注册）
│                        4 个工具：菜单查询/写入 + 字典查询/写入
│
├── bin/              ← CLI 实现（init / update / clean）
│
├── docs/             ← 仅本仓库可见（不分发）
│                        输入规范文档系列（面向团队各角色）
│
└── kit-internal/     ← 仅本仓库可见（不分发）
                         维护者文档（架构 ADR、贡献流程、踩坑记录）
```

### 读哪个 README

| README 文件 | 内容 | 读者 |
|---|---|---|
| 本文件（根 README.md） | 包概述、安装使用、Skill 全景 | 所有人 |
| `kit-internal/README.md` | 维护者工作空间总览 | 维护者 |
| `files/.github/guides/usage.md` | 业务项目安装后的完整使用流程 | 业务团队 |
| `files/.github/guides/architecture.md` | AI 体系架构与设计决策 | 想深入了解的技术同学 |
| `files/.github/skills/*/USAGE.md` | 每个 Skill 的触发方式和效果说明 | 业务团队按需查阅 |
| `docs/input-spec-*.md` | 各角色的输入规范最佳实践 | 设计/分析/后端/前端 |

---

## 设计理念 & 演进路线

### 核心设计理念

**"一次写好 Skill，人人获益"** — wl-skills-kit 不是项目脚手架，而是一套 **AI 行为规范体系**。

通过将团队的编码规范、业务模式、设计决策编码到 SKILL.md 中，让每一个 AI 编辑器在每一次对话里都能遵守相同的规范——无论是 Copilot、Cursor 还是 Claude Code，无论是老成员还是新同学，AI 的行为都是可预期的、一致的。

**三层分工**：

```
SKILL.md（语义层）     AI 编辑器理解"该怎么做"
      │
      ▼
MCP tools / CLI（执行层）  跨越 AI 上下文边界，调用真实系统
      │
      ▼
mcp/api/ / 后端 HTTP API  实际的数据读写
```

- **SKILL.md** — 静态知识，放在 AI 编辑器的上下文里，零运行时开销
- **MCP 工具** — 当 Skill 需要读写真实系统（菜单树/字典表）时，通过 MCP 调用，跨越 AI 上下文边界
- **纯查询/生成类 Skill**（如 page-codegen / convention-audit）不需要 MCP，SKILL.md 直接驱动

### 当前能力全景（v2.3）

```
输入层                  AI 推理层                   输出层
─────────              ─────────────────────       ─────────────────
Axure HTML 原型    →   prototype-scan          →   page-spec JSON
详设 Markdown 表   →   prototype-scan          →   page-spec JSON
口述需求           →   prototype-scan (推断)   →   page-spec JSON
                        │
                        ▼
                   api-contract            →   api.md（逐页面）
                        │
                        ▼
                   page-codegen            →   data.ts + index.vue
                   （8 种内置模板）              + index.scss + pages.ts
                        │
                        ▼
                   convention-audit        →   AUDIT_AI.md（AI 自查）
                                               AUDIT_HUMAN.md（人工检查）
                        │
                        ▼
                   code-fix                →   受控自动整改偏差
                        │
                        ▼
                   menu-sync (MCP)         →   线上菜单注册完毕
                   dict-sync (MCP)         →   线上字典同步完毕
                        │
                        ▼
                   template-extract        →   领域模板沉淀复用
```

### 下一步计划（Roadmap）

| 优先级 | 功能 | 状态 |
|---|---|---|
| 🔴 高 | `permission-sync` — 页面级/按钮级权限批量注册 | ⏳ SKILL.draft.md 已有设计 |
| 🟡 中 | `domain/` 领域模板扩展 — 补充 sale / hrms 等领域样例 | ⏳ 规划中 |
| 🟡 中 | `page-codegen` 支持更多 Template 组件（cx-ui-produce 的配置驱动页面）| ⏳ 持续补充 |
| 🟢 低 | MCP 增加 permission 工具（`wls_permission_query/upsert`）| ⏳ 依赖 permission-sync Skill |
| 🟢 低 | `code-fix` 完善 — 覆盖更多自动修复场景 | ⏳ 持续完善 |

### 未来设想

当 permission-sync 完成后，一个新页面从 0 到线上可访问的完整链路将全自动化：

```
原型 → AI 生成代码 → convention-audit 验收 → menu-sync 注册菜单
                                             → dict-sync 同步字典
                                             → permission-sync 注册权限
                                                     ↓
                                              UI 可访问，权限可分配
```

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
│   └── wl-skills.js                      CLI 实现（init / update / clean）
│
├── files/                                ★★★ 真正会被打包并复制到业务项目的内容 ★★★
│   └── .github/
│       ├── copilot-instructions.md       源 AI 主入口（编辑这里，不要编辑业务项目里的副本）
│       ├── standards/                    13 条规范
│       ├── skills/                       Skill 目录（含 _compat/ 多编辑器适配源）
│       ├── guides/                       人读指南
│       └── reports/                      领域基线模板（菜单/字典/权限）
│   ├── docs/                             组件 API 文档
│   └── demo/                             领域样例
│
├── docs/                                 ★★ 仅仓库可见，不会安装到业务项目 ★★
│   ├── mcp建议.md                        MCP 进化路线与三层架构建议
│   ├── input-spec-prototype.md           原型输入规范（面向设计师/产品）
│   ├── input-spec-detailed-design.md     详设文档输入规范（面向业务分析师）
│   ├── input-spec-api.md                 API 契约确认规范（面向后端开发者）
│   └── input-spec-page-spec.md           page-spec JSON 参考手册（面向前端开发者）
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
> - 业务规范要改 → 改 `files/.github/standards/*.md`
> - Skill 流程要改 → 改 `files/.github/skills/<scope>/<name>/SKILL.md`
> - 多 AI 编辑器适配要改 → 改 `files/.github/skills/_compat/`（**不是**改业务项目里的根配置文件）
> - 维护文档要写 → 进 `kit-internal/`（不会污染业务项目）

### B. 业务项目结构（执行 `npx @agile-team/wl-skills-kit` 之后）

```
你的业务项目/
│
├── .github/                              ← 来自本包 files/.github/
│   ├── copilot-instructions.md           Copilot 主入口（精简 ~320 行）
│   ├── standards/                        13 条模块化规范 + index.md 门控
│   │   ├── 01-toolchain.md
│   │   ├── 02-code-structure.md
│   │   ├── ... (共 13 条)
│   │   └── 13-platform-components.md
│   ├── skills/                           8 个启用 Skill + 1 个 PLANNED 草稿
│   │   ├── _registry.md                  ★ 触发词 → SKILL 路径单一数据源
│   │   ├── _compat/                      多 AI 编辑器适配（配置 + headers）
│   │   ├── core/                         核心通用 Skill
│   │   │   ├── prototype-scan/   { SKILL.md, USAGE.md }
│   │   │   ├── api-contract/     { SKILL.md, USAGE.md }
│   │   │   ├── page-codegen/     { SKILL.md, USAGE.md, templates/ }
│   │   │   ├── convention-audit/ { SKILL.md, USAGE.md }
│   │   │   └── template-extract/ { SKILL.md, USAGE.md }
│   │   ├── sync/                         数据同步类
│   │   │   ├── menu-sync/        { SKILL.md, USAGE.md, env/ }
│   │   │   ├── dict-sync/        { SKILL.md }  已启用
│   │   │   └── permission-sync/  [PLANNED] SKILL.draft.md  设计中
│   │   ├── ops/                          运维类
│   │   │   └── code-fix/         { SKILL.md }  已启用
│   │   └── domain/                       领域专属（按需创建）
│   ├── guides/                           人读指南（usage.md / architecture.md）
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
│
├── docs/                                 12 个组件 API 文档
├── demo/                                 13 个领域样例
└── src/
    ├── components/                       全局/局部/远程组件
    └── types/                            类型桶文件
```

> **业务项目方准则**：
> - 主入口是 `.github/copilot-instructions.md`（Copilot 用），**其他 8 个根配置文件是它的拷贝 + 各自特化 frontmatter**
> - 修改规范 → **不要**改业务项目里的副本，**升级 wl-skills-kit 包 + `update`** 才不会被覆盖
> - reports/ 里的内容是团队累积数据，`update` 不会覆盖，可放心 commit

---

## CLI 命令

```bash
# 全量安装（默认）
npx @agile-team/wl-skills-kit

# 增量更新（仅覆盖有变化的文件，自动保护 reports/）
npx @agile-team/wl-skills-kit update

# 构建前清理（保留 src/components + src/types）
npx @agile-team/wl-skills-kit clean

# 清理但保留 reports/（菜单/字典/权限累积数据）
npx @agile-team/wl-skills-kit clean --keep-reports

# 任何命令都可加 --dry-run 预览
npx @agile-team/wl-skills-kit update --dry-run
```

> 全局安装后也可直接用 `wl-skills` 命令（如 `wl-skills update`）。

---

## 从早期版本升级

> **适用场景**：已安装 v1.x 或 v2.0 的业务项目，希望升级到当前版本。

```bash
# 执行增量更新即可
npx @agile-team/wl-skills-kit update
```

`update` 命令会自动完成：
1. **写入新文件** — 新结构下的所有文件覆盖写入
2. **迁移清理** — 检测并移除旧版遗留文件（如 `skills/prototype-scan/`、`docs/menu-sync-design.md` 等），避免新旧路径并存产生歧义
3. **保护累积数据** — `reports/*.md` 已存在则跳过，团队累积的菜单/字典数据不丢失

> **注意**：如果项目在旧的 `.github/skills/menu-sync/env/env.local.json` 中有自定义配置，`update` 会将其迁移位置（删旧、新路径文件由 `init` 写入默认模板）。**请在 `update` 前备份** 或 `update` 后手动迁移到 `.github/skills/sync/menu-sync/env/env.local.json`。

---

## Skill 概览

| Skill              | 状态      | 路径                                     | 核心用途                      |
| ------------------ | --------- | ---------------------------------------- | ----------------------------- |
| `prototype-scan`   | ✅ 启用    | `skills/core/prototype-scan/`            | 原型/详设/口述 → 页面清单     |
| `api-contract`     | ✅ 启用    | `skills/core/api-contract/`              | 生成 api.md 前后端契约        |
| `page-codegen`     | ✅ 启用    | `skills/core/page-codegen/`              | 4 文件骨架生成 + 模板调度    |
| `convention-audit` | ✅ 启用    | `skills/core/convention-audit/`          | 13 条规范扫描 + 双报告        |
| `template-extract` | ✅ 启用    | `skills/core/template-extract/`          | 现有页面 → 领域模板           |
| `menu-sync`        | ✅ 启用    | `skills/sync/menu-sync/`                 | 菜单基线 ↔ 后端接口（MCP）  |
| `dict-sync`        | ✅ 启用    | `skills/sync/dict-sync/`                 | 字典基线 ↔ 后端接口（MCP）  |
| `code-fix`         | ✅ 启用    | `skills/ops/code-fix/`                   | 受控自动修复偏差              |
| `permission-sync`  | ⏳ PLANNED | `skills/sync/permission-sync/`           | 权限基线 ↔ 后端接口（设计中） |

每个启用 Skill 同目录都有 **`SKILL.md`（AI 触发用）+ `USAGE.md`（团队成员阅读）**。

---

## 多 AI 编辑器适配（解耦设计）

`init` / `update` 读取 `files/.github/skills/_compat/editors.json` 生成对应配置：

| 编辑器         | 输出路径                            | Frontmatter             |
| -------------- | ----------------------------------- | ----------------------- |
| GitHub Copilot | `.github/copilot-instructions.md`   | -                       |
| Claude Code    | `CLAUDE.md`                         | -                       |
| Cursor (rules) | `.cursorrules`                      | -                       |
| Cursor (mdc)   | `.cursor/rules/conventions.mdc`     | description+globs+alwaysApply |
| Windsurf       | `.windsurfrules`                    | -                       |
| Cline          | `.clinerules`                       | -                       |
| Kiro           | `.kiro/steering/conventions.md`     | inclusion: always       |
| Trae           | `.trae/rules/conventions.md`        | description+globs+alwaysApply |
| 通用 Agent     | `AGENTS.md`                         | -                       |

**解耦验证**：在 `editors.json` 中将任意编辑器 `enabled: false`，重新 `update` —— 该编辑器配置不再生成，其他编辑器**完全不受影响**。

---

## 受保护路径

| 命令                     | 保护路径                          | 说明                       |
| ------------------------ | --------------------------------- | -------------------------- |
| `init` / `update`        | `.github/reports/*.md`            | 已存在则跳过，不覆盖累积   |
| `clean`（默认）          | `src/components/` + `src/types/`  | 业务代码必需，永不删除     |
| `clean --keep-reports`   | + `.github/reports/`              | 保留菜单/字典/权限基线     |

---

## 进一步阅读

- 📚 业务方使用指南：`.github/guides/usage.md`（业务项目内）
- 🏗️ 架构与决策：`.github/guides/architecture.md`（业务项目内）
- 🔧 维护者文档：[kit-internal/README.md](kit-internal/README.md)（仅本仓库）
- 🤖 多编辑器适配机制：[files/.github/skills/_compat/README.md](files/.github/skills/_compat/README.md)
- 🛠️ Jenkins 流水线参考：[kit-internal/jenkins-pipeline.md](kit-internal/jenkins-pipeline.md)
- 📝 输入规范（如何提供高精度输入）：[docs/](docs/)

---

## 反馈与贡献

- 使用问题 / Bug：联系 CHENY（工号 409322）
- 仓库贡献：见 [kit-internal/CONTRIBUTING.md](kit-internal/CONTRIBUTING.md)

---

## 许可证

UNLICENSED — 内部使用

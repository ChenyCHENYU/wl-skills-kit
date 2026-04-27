# @agile-team/wl-skills-kit

[![npm version](https://img.shields.io/npm/v/@agile-team/wl-skills-kit?label=wl-skills-kit&color=brightgreen)](https://www.npmjs.com/package/@agile-team/wl-skills-kit)

**AI Skill 模板包 v2.1.8** — 一条命令将 13 条编码规范、6 个 AI Skill、组件文档、领域样例导入 Vue 3 项目。

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
│   │   │   ├── dict-sync/        { SKILL.md, env/ }
│   │   │   └── permission-sync/  [PLANNED] SKILL.draft.md
│   │   ├── ops/                          运维类
│   │   │   └── code-fix/         { SKILL.md }
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
| `menu-sync`        | ✅ 启用    | `skills/sync/menu-sync/`                 | 菜单基线 ↔ 后端接口          |
| `dict-sync`        | ✅ 启用    | `skills/sync/dict-sync/`                 | 字典基线 ↔ 后端接口                           |
| `permission-sync`  | ⏳ PLANNED | `skills/sync/permission-sync/`           | 权限基线 ↔ 后端接口          |
| `code-fix`         | ✅ 启用    | `skills/ops/code-fix/`                   | 受控自动修复偏差                  |

每个启用 Skill 同目录都有 **`SKILL.md`（AI 触发用）+ `USAGE.md`（团队成员阅读）**。

---

## AGGrid cid 唯一性规则

> 21 个系统共享同一浏览器 origin（localStorage 共用），cid 碰撞会导致列配置互相覆盖。

```typescript
// ✅ 正确：Date.now().toString(36) — 毫秒级唯一，永不重复，约 9 位 base-36
cid="mca-lhfge5hc"                           // 表格级：{页面首字母缩写}-{base36时间戳}
cid: 'mca-lhfge5hc-customerName'             // 列级：{完整表格cid}-{fieldName}
cid: 'mca-lhfge5hc-sub1-customerName'        // 子表列级：{完整子表cid}-{fieldName}

// ❌ 错误：截断十进制后6位（每11.5天循环一次）
cid="mca-745831"
// ❌ 错误：列级只用缩写（同页面两张表都有steelCode → mca-steelCode 碰撞）
cid: 'mca-customerName'
```

**Pre-flight 中 AI 自动输出**：`✅ cid 已生成：mca-lhfge5hc（mmwr-customer-archive）`  
`convention-audit` 遇到旧格式 cid 会标记为 🟡 偏差提示。

---

## 技能触发 & 验证

> **所有编辑器使用相同的触发词**，无需区分编辑器类型。Copilot / Cursor / Windsurf / Claude Code / Cline / Kiro / Trae 读取各自对应的配置文件，内容完全一致，仅 frontmatter 格式不同。

**触发成功的标志 — Pre-flight 声明**（技能触发后 AI 必须先输出）：

```
🚀 已触发技能 page-codegen/SKILL.md → 页面代码生成：4文件 + 模板调度 + 前置检查
✅ 已读取 templates/_index.md        → 模板注册表，匹配 → TPL-LIST.md
✅ 已读取 standards/02-code-structure.md → 4文件原则 + 三段式 + script 9段顺序
✅ cid 已生成：cXxxx（首字母缩写）
```

> 看到这段输出 = 技能路径已激活，AI 遵循 Skill 规则而非默认推断。  
> 没有这段输出 = AI 走了默认推断，补充说：「请先读取 `.github/skills/core/xxx/SKILL.md`，再按其执行」。

### 单技能触发

| 技能 | 说任意一个即可触发 | 输出结果 | 验证方法 |
| ---- | ------------------ | -------- | -------- |
| `prototype-scan` | 扫描原型 / 页面清单 / 口述需求 / 建个页面 / 帮我建一个XX页面 | `reports/PROTOTYPE_SCAN_*.md` 结构化页面清单 | reports/ 下有新文件 |
| `api-contract` | 接口约定 / api.md / 字段定义 / 前后端对齐 | 每个页面目录下生成 `api.md` | 对应目录有 api.md |
| `page-codegen` | 生成页面 / 创建页面 / 代码生成 / 帮我生成 | `index.vue + data.ts + index.scss + api.md` 4 文件 | 4 文件完整 + Pre-flight ✅ |
| `convention-audit` | 规范审计 / 规范检查 / 代码审计 / **接手新项目** / **项目体检** | `reports/规范审查报告.md` + `reports/组件提取建议.md` 追加新章节 | 报告文件有新内容追加 |
| `template-extract` | 提取模板 / 沉淀模板 / 模板贡献 | `skills/core/page-codegen/templates/domains/{域}/TPL-*.md` | templates/ 下有新模板文件 |
| `menu-sync` | 创建菜单 / 同步菜单 / 补菜单 | API 调用结果表 + `reports/SYS_MENU_INFO.md` 更新 | 系统管理后台出现新菜单 |

### 流程组合触发

**完整链路：原型 → 上线可访问（分步连续触发）**

```
① "扫描 docs/prototypes/ 下的原型，生成页面清单"      → prototype-scan
② "基于清单，逐页生成 api.md"                         → api-contract
③ "按 api.md 生成所有页面代码"                         → page-codegen
④ "对刚生成的页面做规范审计"                            → convention-audit
⑤ "补菜单"                                             → menu-sync
```

**快捷链路：口述直接生成（单句触发）**

```
"帮我建一个客户管理页面，有名称、编码、状态三个查询字段，支持新增编辑删除"
  → prototype-scan（内部推断）→ page-codegen → 直接输出 4 文件
```

**接手存量项目（逐步推进）**

```
"扫描 src/views/ 下所有页面，做规范审计，输出偏差报告"  → convention-audit
  → 人工确认整改优先级（报告中标 🔴 / 🟡 / 🟢）
  → "对 {偏差文件} 做规范整改"                          → code-fix
```

### 触发异常处理

| 现象 | 原因 | 应对 |
| ---- | ---- | ---- |
| 输出以 `🚀 已触发技能 xxx/SKILL.md` 开头 | ✅ 技能路径正确激活 | 继续即可 |
| 直接输出代码，无 Pre-flight 声明 | AI 走了默认推断，未加载 Skill | 补充说：「先读取 `.github/skills/core/xxx/SKILL.md`，再按其执行」 |
| Pre-flight 含 `❌ 工具链检测失败` | 缺少 `.prettierrc.js` / `eslint.config.ts` / `.husky/` | 执行 `npx @robot-admin/git-standards init` |
| reports/ 无新文件 | 输出写到了错误路径 | 明确告知 AI：「报告写入 `.github/reports/` 目录」 |

> 详细使用示例和踩坑 FAQ 见安装后的 `.github/guides/usage.md`（每个 Skill 同目录的 `USAGE.md` 也有完整示例）。

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

| 命令                     | 保护路径                                               | 说明                       |
| ------------------------ | --------------------------------------------------- | -------------------------- |
| `init` / `update`        | `.github/reports/*.md`                              | 已存则跳过，不覆盖累积   |
| `init` / `update`        | `.github/skills/sync/env.local.json`                | 已存则跳过，保护同步配置（菜单+字典+权限统一） |
| `init` / `update`        | `.github/skills/sync/menu-sync/env/env.local.json`  | 旧版兼容，已存则跳过     |
| `clean`（默认）          | `src/components/` + `src/types/`                    | 业务代码必需，永不删除     |
| `clean --keep-reports`   | + `.github/reports/`                                | 保留菜单/字典/权限基线     |

---

## 进一步阅读

- 📚 业务方使用指南：`.github/guides/usage.md`（业务项目内）
- 🏗️ 架构与决策：`.github/guides/architecture.md`（业务项目内）
- 🔧 维护者文档：[kit-internal/README.md](kit-internal/README.md)（仅本仓库）
- 🤖 多编辑器适配机制：[files/.github/skills/_compat/README.md](files/.github/skills/_compat/README.md)
- 🛠️ Jenkins 流水线参考：[kit-internal/jenkins-pipeline.md](kit-internal/jenkins-pipeline.md)

---

## 反馈与贡献

- 使用问题 / Bug：联系 CHENY（工号 409322）
- 仓库贡献：见 [kit-internal/CONTRIBUTING.md](kit-internal/CONTRIBUTING.md)

---

## 许可证

UNLICENSED — 内部使用

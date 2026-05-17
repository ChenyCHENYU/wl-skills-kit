# wl-skills-kit 使用指南

> **目标读者**：使用 `@agile-team/wl-skills-kit` 的 Vue 3 业务项目团队成员。
> **适用版本**：v2.4.x
> **维护者**：CHENY（工号 409322）

---

## 5 分钟上手

### 第 1 步：安装工具链

```bash
# 进入你的 Vue 3 项目根目录
cd your-vue3-project

# 安装工程化规范（强制前置）
npx @robot-admin/git-standards init

# 安装 AI Skill 体系
npx @agile-team/wl-skills-kit
```

### 第 2 步：确认编辑器

推荐使用以下任一 AI 编辑器：

- VS Code + GitHub Copilot
- Cursor
- Windsurf
- Claude Code
- Cline
- Kiro
- Trae
- Qoder

打开项目后，AI 会按编辑器自动加载对应规则文件：Copilot 读 `.github/copilot-instructions.md`，Claude Code 读 `CLAUDE.md`，Cline 读 `.clinerules`，通用 Agent 读 `AGENTS.md`，Qoder 读 `.qoder/rules/conventions.md`。

### 第 3 步：开始使用

在 AI 对话中直接说出需求即可：

```
"帮我生成一个客户管理列表页"
"扫描这份原型 HTML"
"审计 src/views/sale 这个目录的代码规范"
"提取 mmwr-rolling-management 这个页面作为模板"
"同步菜单到后端"
"帮我做个台账页面，后端没好先 mock，菜单也加上"
```

AI 会自动识别意图，触发对应的 Skill。

---

## 10 个 Skill 速览

| Skill              | 触发关键词                     | 用途                                                 |
| ------------------ | ------------------------------ | ---------------------------------------------------- |
| `prototype-scan`   | 扫描原型 / 解析原型 / 口述需求 | 原型 / 详设 → page-spec JSON                         |
| `api-contract`     | 接口约定 / api.md / 字段定义   | 生成接口约定文档                                     |
| `page-codegen`     | 生成页面 / 帮我生成            | 生成页面骨架 + 菜单注册                              |
| `menu-sync`        | 创建菜单 / 同步菜单            | 菜单数据同步到后端（MCP 自动 / prompt 手动两种模式） |
| `dict-sync`        | 同步字典 / 创建字典 / 字典审计 | 字典基线同步到后端（MCP 自动 / prompt 手动两种模式） |
| `convention-audit` | 规范审计 / 代码审计            | 14 条规范扫描 + 偏差报告                             |
| `business-doc-extract` | 语义级智能触发（无关键词列表） | 原型/详设/字段/字典/现有页面 → docs/business 业务文档 |
| `template-extract` | 提取模板 / 抄取模板            | 从现有页面沉淀领域专属模板                         |
| `permission-sync`  | 创建角色 / 角色授权 / 同步权限 | 角色+授权+动作权限同步（MCP）                        |
| `code-fix`         | 自动修复 / 整改偏差 / 规范整改 | 受控自动修复审计报告中的偏差                         |

完整调度规则见 `.github/skills/_registry.md`。

---

## 项目目录结构

安装后业务项目得到的关键目录：

```
你的项目/
├── .github/
│   ├── copilot-instructions.md      AI 主入口
│   ├── standards/                   13 条模块化规范
│   ├── skills/                      10 个启用 Skill + 多编辑器适配
│   ├── guides/                      使用指南 + 架构设计
│   └── reports/                     AI 生成报告（SYS_MENU_INFO 等）
├── docs/                            12 个组件 API 文档（jh-* / request 等）
├── demo/                            13 个领域样例（生产 + 销售）
└── src/
    ├── components/                  全局/局部/远程组件
    └── types/
```

---

## 完整流水线（从原型到上线）

```
1. 原型/详设 → prototype-scan          → page-spec JSON
2. page-spec → api-contract            → api.md
3. api.md    → page-codegen            → 页面骨架 + reports/SYS_MENU_INFO.md
4. SYS_MENU_INFO → menu-sync           → 后端菜单表
5. 代码完成  → dict-sync               → 字典基线同步到后端字典表
6. 完成      → convention-audit        → 偏差报告（reports/规范审查报告.md）
7. 报告      → code-fix                → 受控自动修复 🟡/🟢 偏差，逐条 diff 确认
8. 沉淀      → template-extract        → 从标杆页面提取领域专属模板
```

> **说明**：每一步都可以单独触发，也可以按用户意图自动接续。
>
> - `dict-sync`：首次使用先跑 **pull 模式**（「刷新字典基线」）建立本地基线，再跑 push 模式同步差异。
> - `code-fix`：只修复 🟡/🟢 偏差；🔴 严重偏差必须人工或 page-codegen 处理。每条修复前强制 diff 预览确认。

### 页面生成最终标准

`page-codegen` 生成的业务列表/台账/主从/树表页面必须满足：

- `AbstractPageQueryHook + BaseQuery + BaseToolbar + BaseTable + jh-pagination`
- `BaseTable` 必须 `render-type="agGrid"`
- 每个 `BaseTable` 必须有全局唯一 `cid`
- 列定义必须使用 `@agile-team/wk-skills-ui/runtime` 的 `defineColumns()`
- 操作列必须使用 `renderOps()`，禁止旧式 `operations: []`
- mock-first：后端未就绪时生成 `mock/*.ts`，关闭 mock 后业务代码不需要改

生成后建议运行：

```bash
wl-skills validate-page src/views/<页面目录>
wl-skills doctor-ui
```

---

## 常见问题

**Q: AI 生成的代码不符合规范怎么办？**
A: 触发 `convention-audit`，输出偏差报告到 `reports/规范审查报告.md`，按 🔴 严重 → 🟡 轻微的优先级修复。

**Q: 工具链检测一直失败？**
A: 检查 `.prettierrc.js` / `eslint.config.ts` / `.husky/` 是否齐全。重新执行 `npx @robot-admin/git-standards init`，或联系 CHENY（工号 409322）。

**Q: 本团队有特殊的页面模式，通用模板不适用？**
A: 触发 `template-extract`，从现有标杆页面提取为领域专属模板，沉淀到 `templates/domains/{你的领域}/`。

**Q: 多个 AI 编辑器之间会冲突吗？**
A: 不会。`bin/wl-skills.js` 已自动生成 9 种主流 AI 编辑器配置文件（含 Qoder），所有内容来自同一份 `copilot-instructions.md`，保持一致。

**Q: MCP Server 是什么？需要额外配置吗？**
A: `wl-skills init` 会自动为 **Cursor**（`.cursor/mcp.json`）、**Claude Code**（`.mcp.json`）、**VS Code / GitHub Copilot**（`.vscode/mcp.json`）、**Kiro**（`.kiro/settings/mcp.json`）生成项目级 MCP 配置文件。

Windsurf、Cline、Trae、Qoder 仅支持全局配置，需手动操作一次，详见 `.github/guides/mcp-setup.md`。

配置完成后在 `.github/skills/sync/env.local.json` 中填好 `token`、`gatewayPath`、`menu.domainId`，重启编辑器，对 AI 说「扩展菜单」或「加字典」，AI 会自动调用 MCP 工具完成同步，无需手动粘贴接口响应。

**Q: 如何和 wk-skills-ui 一起用？**
A: 两个包不互相依赖。先用 `wl-skills-kit` 做页面生成、规范审计、菜单字典权限同步；如需统一 UI 风格或老系统化妆层，再单独安装 `@agile-team/wk-skills-ui` 并执行 `wk-ui init/update`。

**Q: 部署到生产环境前如何清理 AI 文件？**
A: 执行 `npx @agile-team/wl-skills-kit clean`。会移除所有 AI 辅助文件，保留 `src/components/` 和 `src/types/`。

---

## 升级与维护

### 生命周期命令

```bash
npx @agile-team/wl-skills-kit check        # 环境/MCP/manifest 体检
npx @agile-team/wl-skills-kit diff         # 查看与当前包版本差异
npx @agile-team/wl-skills-kit validate-page src/views/xxx # 单页/目录强校验
npx @agile-team/wl-skills-kit doctor-ui    # wk-skills-ui 接入体检
npx @agile-team/wl-skills-kit update       # 增量更新
npx @agile-team/wl-skills-kit clean        # 清理 AI 文件，保留 src/components + src/types
npx @agile-team/wl-skills-kit export       # 导出菜单/字典/权限基线 xlsx
```

### 增量更新

```bash
npx @agile-team/wl-skills-kit@latest update
# 仅覆盖有变化的文件，未变文件不动
```

### 预览模式

任何命令都可加 `--dry-run` 预览变更：

```bash
npx @agile-team/wl-skills-kit update --dry-run
npx @agile-team/wl-skills-kit clean --dry-run
```

---

## Pre-flight 声明阅读指南

每次 AI 触发 Skill 时会输出"Pre-flight 声明"，告诉你它读取了哪些文件、做了哪些前置检查：

```
🚀 已触发技能 page-codegen/SKILL.md   → 页面代码生成
✅ 已读取 standards/02-code-structure.md → 三文件分离+接口契约 + 三段式 + script 9 段顺序
✅ 工具链检测：.prettierrc.js ✓  eslint.config.ts ✓  .husky/ ✓
✅ cid 已生成：cl-745831
```

如果 AI 没输出此声明，说明它跳过了前置检查，**请提示它"补 Pre-flight 声明"**，或重新触发。

---

## 反馈与贡献

- 使用问题 / Bug：联系 CHENY（工号 409322）
- 模板贡献：使用 `template-extract` Skill 自动提取并 PR
- 规范修改：在 `standards/` 编辑后，团队评审通过后合入

---

## 进一步阅读

- 架构与决策记录：[architecture.md](architecture.md)
- 编辑器适配说明：`.github/skills/_compat/README.md`

# wl-skills-kit 使用指南

> **目标读者**：使用 `@agile-team/wl-skills-kit` 的 Vue 3 业务项目团队成员。
> **适用版本**：v2.0+
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

打开项目后，AI 会自动加载 `.github/copilot-instructions.md`，你不用做任何配置。

### 第 3 步：开始使用

在 AI 对话中直接说出需求即可：

```
"帮我生成一个客户管理列表页"
"扫描这份原型 HTML"
"审计 src/views/sale 这个目录的代码规范"
"提取 mmwr-rolling-management 这个页面作为模板"
"同步菜单到后端"
```

AI 会自动识别意图，触发对应的 Skill。

---

## 8 个 Skill 速览

| Skill              | 触发关键词                     | 用途                         |
| ------------------ | ------------------------------ | ---------------------------- |
| `prototype-scan`   | 扫描原型 / 解析原型 / 口述需求 | 原型 / 详设 → page-spec JSON |
| `api-contract`     | 接口约定 / api.md / 字段定义   | 生成接口约定文档             |
| `page-codegen`     | 生成页面 / 帮我生成            | 生成 4 文件 + 菜单注册       |
| `menu-sync`        | 创建菜单 / 同步菜单            | 菜单数据同步到后端           |
| `dict-sync`        | 同步字典 / 创建字典 / 字典审计   | 字典基线同步到后端           |
| `convention-audit` | 规范审计 / 代码审计            | 13 条规范扫描 + 偏差报告     |
| `template-extract` | 提取模板 / 抄取模板            | 从现有页面沉淠领域专属模板   |
| `code-fix`         | 自动修复 / 整改偏差 / 规范整改   | 受控自动修复审计报告中的偏差 |

完整调度规则见 `.github/skills/_registry.md`。

---

## 项目目录结构

安装后业务项目得到的关键目录：

```
你的项目/
├── .github/
│   ├── copilot-instructions.md      AI 主入口
│   ├── standards/                   13 条模块化规范
│   ├── skills/                      8 个 Skill + 1 个 PLANNED 草稿
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
3. api.md    → page-codegen            → 4 文件 + reports/SYS_MENU_INFO.md
4. SYS_MENU_INFO → menu-sync           → 后端菜单表
5. 完成     → convention-audit          → 报告 + 提取建议（人工评审）
```

每一步都可以单独触发，也可以按用户意图自动接续。

---

## 常见问题

**Q: AI 生成的代码不符合规范怎么办？**
A: 触发 `convention-audit`，输出偏差报告到 `reports/规范审查报告.md`，按 🔴 严重 → 🟡 轻微的优先级修复。

**Q: 工具链检测一直失败？**
A: 检查 `.prettierrc.js` / `eslint.config.ts` / `.husky/` 是否齐全。重新执行 `npx @robot-admin/git-standards init`，或联系 CHENY（工号 409322）。

**Q: 本团队有特殊的页面模式，通用模板不适用？**
A: 触发 `template-extract`，从现有标杆页面提取为领域专属模板，沉淀到 `templates/domains/{你的领域}/`。

**Q: 多个 AI 编辑器之间会冲突吗？**
A: 不会。`bin/wl-skills.js` 已自动生成 8 种主流 AI 编辑器配置文件，所有内容来自同一份 `copilot-instructions.md`，保持一致。

**Q: 部署到生产环境前如何清理 AI 文件？**
A: 执行 `npx @agile-team/wl-skills-kit clean`。会移除所有 AI 辅助文件，保留 `src/components/` 和 `src/types/`。

---

## 升级与维护

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
✅ 已读取 standards/13-platform-components.md → 平台组件对照表
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

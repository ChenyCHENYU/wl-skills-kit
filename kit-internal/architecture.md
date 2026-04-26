# wl-skills-kit v2.0 架构升级 ADR

> **作者**：CHENY（工号 409322）
> **日期**：2026-04-26
> **状态**：已实施

---

## 背景

v1.x 的几个痛点：

1. `copilot-instructions.md` 单文件 619 行，AI 全量加载浪费 token
2. 9 个 TPL 平铺在 `page-codegen/` 根目录，无法区分通用/领域
3. `SYS_MENU_INFO.md` 与设计文档混放在 `docs/`，定位混乱
4. 没有"组件提取建议"输出闭环，`convention-audit` 单纯指出问题不指出复用机会
5. 缺少 Pre-flight 约定，AI 跳过规范前置读取没有可观测信号
6. 没有"维护者专属"目录，仓库自身的设计讨论无处安放

---

## 决策

### 1. 模块化规范 + 懒加载门控

将 12 条规范从 copilot-instructions.md 抽出到 `standards/01 ~ 12.md`，并新增第 13 条 `13-platform-components.md`（核心 AI 质量门控）。`standards/index.md` 提供任务类型 → 子集映射。

### 2. 模板分层

```
templates/
├── universal/        通用（不与业务域绑定）
├── domains/          领域专属
│   ├── _CONTRIBUTING.md
│   ├── produce/
│   └── sale/
└── _index.md
```

### 3. 报告分类 + 追加不覆盖

新建 `reports/` 目录，区分系统数据（SYS\_\*.md）、审计报告、提取建议三类。**全部追加，最新章节在顶部**。

### 4. Pre-flight 约定式输出

每个 Skill 触发后强制输出 Pre-flight 声明，列出已读文件、工具链状态、cid 等。不依赖任何工具调用，纯约定。

### 5. 多 AI 编辑器支持

`bin/wl-skills.js` 自动从 `copilot-instructions.md` 生成 8 种 AI 编辑器配置文件。

### 6. kit-internal/ 维护文档目录

仓库根目录新增 `kit-internal/`，**不在 package.json files 字段**，自然排除于 npm 包外。

### 7. 三个 [PLANNED] Skill

`dict-sync` / `permission-sync` / `code-fix` 留空占位（`SKILL.draft.md`），不参与触发词调度，但保持架构可见性。

---

## 取舍

### 为什么不用 JSON Schema 描述规范？

JSON 对人类可读性差，AI 加载后还要解释。Markdown 更适合"AI 阅读 + 团队人工 review"的双重场景。

### 为什么不让 AI 自动同步多 AI 编辑器配置？

不同 AI 编辑器对 frontmatter / 路径 / 触发机制各有差异。强行统一会拉低单平台体验。让 `bin/wl-skills.js` 在 init/update 时一次性生成，避免运行时差异。

### 为什么 reports/ 中的"组件提取建议"不直接调用 template-extract？

避免误判。AI 识别"这 5 个页面看起来一样"的准确率不高，强行自动化会污染团队代码。**人工 review 是必要的过滤层**。

---

## 影响面

| 业务项目           | 影响                                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| 已使用 v1.x 的项目 | 升级后路径有变更（docs/ → guides/ + reports/），需手动迁移 SYS_MENU_INFO.md |
| 新接入项目         | 直接享受新架构                                                              |

迁移指南：见 `kit-internal/migration-v1-to-v2.md`（如有用户反馈再补充）。

---

## 后续演进

| 阶段 | 内容                                                        |
| ---- | ----------------------------------------------------------- |
| v2.1 | dict-sync / permission-sync / code-fix 转正                 |
| v2.2 | CI/CD 集成（PR 自动跑 convention-audit，不合规阻断）        |
| v2.3 | 模板版本化（每个 TPL 文件加 version frontmatter，便于回滚） |
| v3.0 | 多语言生态（不限 Vue 3）                                    |

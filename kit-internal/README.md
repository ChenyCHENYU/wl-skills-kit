# kit-internal/ — 仓库维护者专属文档

> ⚠️ **本目录仅 wl-skills-kit 仓库内可见**，不通过 npm 包安装到业务项目。
> 业务项目使用方请阅读 `files/.github/guides/usage.md`。

---

## 目录用途

`kit-internal/` 是 wl-skills-kit 维护者（CHENY 团队 + 后续接手人）的工作空间，存放：

- 整体架构 ADR（决策记录）
- 各 Skill 的维护要点（含历史踩坑）
- 模板贡献流程的运营记录
- 规划中的扩展（PLANNED）的设计草稿

---

## 与 `files/.github/guides/` 的区别

| 维度     | `files/.github/guides/`       | `kit-internal/`               |
| -------- | ----------------------------- | ----------------------------- |
| 安装范围 | ✅ 安装到业务项目             | ❌ 仅在 kit 仓库可见          |
| 读者     | 业务项目团队成员              | wl-skills-kit 维护者          |
| 是否打包 | `package.json` files 字段包含 | 不在 files 字段，npm 自动排除 |
| 内容性质 | 使用指南 / 设计概览           | 维护要点 / ADR / 内部讨论     |

---

## 文件清单

| 文件                              | 内容                                                   |
| --------------------------------- | ------------------------------------------------------ |
| `README.md`                       | 本文件                                                 |
| `CONTRIBUTING.md`                 | 如何向 kit 贡献（规范、模板、Skill）                   |
| `architecture.md`                 | v2.0 架构升级 ADR（历史归档；v2.1 综合版见 `files/.github/guides/architecture.md`） |
| `standards.MAINTAIN.md`           | 13 条规范的维护要点                                    |
| `templates.MAINTAIN.md`           | 模板分层与贡献流程要点                                 |
| `skills/{skill-name}.MAINTAIN.md` | 各 Skill 的维护要点（避坑、扩展、版本演进）            |
| `skills/_planned-skills.md`       | PLANNED 列表（dict-sync / permission-sync / code-fix） |

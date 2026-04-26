# Skill 维护要点目录

| Skill            | 维护文档                       |
| ---------------- | ------------------------------ |
| prototype-scan   | `prototype-scan.MAINTAIN.md`   |
| api-contract     | `api-contract.MAINTAIN.md`     |
| page-codegen     | `page-codegen.MAINTAIN.md`     |
| menu-sync        | `menu-sync.MAINTAIN.md`        |
| convention-audit | `convention-audit.MAINTAIN.md` |
| template-extract | `template-extract.MAINTAIN.md` |
| **PLANNED 集合** | `_planned-skills.md`           |

> 每个 Skill 的 MAINTAIN.md 记录：核心设计、版本演进、已知坑、未来增强方向。
> 维护文档可后续按需补充，不强制每个 Skill 都立刻完整。

## 共性维护原则

1. **YAML frontmatter** 中的 `description` 是 AI 触发判断的关键，修改时极其慎重
2. **触发词** 必须同步到 `_registry.md`
3. **跨 Skill 引用** 修改时检查上下游影响
4. **Pre-flight 声明格式** 全 Skill 统一，由 `copilot-instructions.md` 强制约定

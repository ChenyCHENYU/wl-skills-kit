# 贡献指南（仅 wl-skills-kit 维护者）

> 业务项目用户的反馈与改进建议请通过仓库 Issue 提出。本文档面向 kit 维护者。

---

## 一、添加新规范条目

1. 在 `files/.github/standards/` 下创建 `14-xxxx.md`（编号递增）
2. 更新 `standards/index.md` 任务类型 → 规范子集映射
3. 更新 `kit-internal/standards.MAINTAIN.md` 记录新增背景
4. 评估是否需要在 `convention-audit/SKILL.md` 添加对应审计维度
5. CHANGELOG.md 添加 minor 版本记录

**原则**：

- 新增规范前，先在团队内评审是否真有必要（避免规范膨胀）
- 一条规范只解决一类问题，不混合
- 必须给出"违反时的修复路径"

---

## 二、添加新模板

详见 `files/.github/skills/core/page-codegen/templates/domains/_CONTRIBUTING.md`，要点：

- **通用模板**（universal/）：必须 3+ 业务领域复用才能进入
- **领域模板**（domains/{域}/）：单领域专属，门槛较低
- 命名：`TPL-{KEBAB-NAME}.md`
- 必须更新 `templates/_index.md` 注册表

**强烈推荐**：用 `template-extract` Skill 自动提取，而非手写。

---

## 三、添加新 Skill

1. 在 `files/.github/skills/{core|sync|ops|domain}/{skill-name}/` 创建 `SKILL.md`（PLANNED 用 `SKILL.draft.md`）
2. 必须包含：
   - YAML frontmatter（name + description + 触发词）
   - Pre-flight 声明部分
   - 核心流程（编号步骤）
   - 与其他 Skill 的关系
3. 更新 `skills/_registry.md` 触发词表
4. 更新 `files/.github/copilot-instructions.md` Skill 调度表
5. 添加 `kit-internal/skills/{skill-name}.MAINTAIN.md`
6. CHANGELOG 记录

**Skill 转正条件**（从 PLANNED → 启用）：

- 设计草稿评审通过
- 至少在一个真实项目跑通端到端
- 文档完整（SKILL.md + MAINTAIN.md）
- 触发词不与现有 Skill 冲突

---

## 四、目录命名约定

| 类型          | 命名                        | 示例                        |
| ------------- | --------------------------- | --------------------------- |
| 目录          | kebab-case                  | `convention-audit/`         |
| 普通 Markdown | kebab-case 或 业务编号-名称 | `01-toolchain.md`           |
| 注册表/索引   | `_` 前缀                    | `_registry.md`、`_index.md` |
| 维护文档      | `.MAINTAIN.md` 后缀         | `standards.MAINTAIN.md`     |
| 草稿/PLANNED  | `.draft.md` 后缀            | `code-fix/SKILL.draft.md`   |

---

## 五、发布流程

1. 本地验证：`npm pack --dry-run` 确认 kit-internal/ 不在 tarball 中
2. CHANGELOG 更新（按 SemVer）
3. `package.json` 版本号 bump
4. 在测试项目跑一遍 `init` / `update` / `clean`
5. 发布：`npm publish --registry={内部 registry}`
6. 在团队群通知，附 CHANGELOG 链接

---

## 六、版本号规则

- **MAJOR**：架构破坏性变更（如 v1 → v2 重构）
- **MINOR**：新增 Skill / 规范 / 模板，向后兼容
- **PATCH**：Bug 修复 / 文档纠错 / 触发词调整

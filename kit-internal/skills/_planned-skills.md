# PLANNED Skills 设计草稿

> dict-sync 和 code-fix 已于 v2.1.8 正式激活（✅ 启用），本文档已移除其条目。

---

## permission-sync（权限同步）

**目标**：将菜单按钮权限码汇总，批量同步到后端权限表。

**输入**：`reports/SYS_PERMISSION_INFO.md`
**输出**：调用后端 `/system/permission/batchImport`

**关键点**：

- 权限码生成规则：`{服务缩写}:{资源名}:{动作}`
- 与 menu-sync 联动（菜单存在才能挂权限）
- 数据来源：page-codegen 生成时同步收集

**设计草稿**：`files/.github/skills/sync/permission-sync/SKILL.draft.md`

---

## 新增 PLANNED 的流程

参考 `kit-internal/CONTRIBUTING.md` 第三节"添加新 Skill"。

# PLANNED Skills 设计草稿

## dict-sync（字典同步）

**目标**：将业务代码中分散的字典定义汇总，并批量同步到后端字典管理。

**输入**：`reports/SYS_DICT_INFO.md`（由 dict-collect Skill 扫描生成）
**输出**：调用后端 `/system/dict/batchImport`

**关键点**：

- 需要先实现 dict-collect 扫描 Skill（识别 `logicValue: "dictCode"` 中的字典码）
- 字典项数据来源待定：硬编码 / mock 文件 / 团队 Excel？
- 去重策略：先查后端已有字典，跳过已存在

**设计草稿**：`files/.github/skills/sync/dict-sync/SKILL.draft.md`

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

## code-fix（自动整改）

**目标**：读取 `reports/规范审查报告.md`，自动整改 🟢🟡 等级偏差。

**关键点**：

- **不能整改 🔴 严重偏差**（架构性问题，必须人工 / page-codegen 重新生成）
- 安全保障：每次整改前 git diff 预览，用户确认后再写入
- 整改后追加修复记录到 `规范审查报告.md`（标记原条目为 ✅ 已修复）

**风险**：

- 误改的代价较高，必须有 dry-run 模式
- 是否要求每次整改一个文件 commit 一次？

**设计草稿**：`files/.github/skills/ops/code-fix/SKILL.draft.md`

---

## 新增 PLANNED 的流程

参考 `kit-internal/CONTRIBUTING.md` 第三节"添加新 Skill"。

# Standards 规范门控（懒加载入口）

> **版本**：v1.1.0 **维护者**：CHENY (工号 409322)
> **加载策略**：AI 按当前任务类型，**只读取相关条目**，不全量加载。

---

## 14 条规范清单

| 编号 | 文件                        | 主题                   | 强制度         |
| ---- | --------------------------- | ---------------------- | -------------- |
| 01   | `01-toolchain.md`           | 工具链前置检测         | 🔴 阻断        |
| 02   | `02-code-structure.md`      | 代码结构与顺序         | 🔴 必遵        |
| 03   | `03-comments.md`            | 注释规范               | 🟡 建议        |
| 04   | `04-coding-basics.md`       | 基础编码（14 条）      | 🔴 必遵        |
| 05   | `05-logging.md`             | 日志输出               | 🔴 必遵        |
| 06   | `06-security.md`            | 安全规范               | 🔴 必遵        |
| 07   | `07-config.md`              | 配置管理               | 🔴 必遵        |
| 08   | `08-git.md`                 | Git 分支 & 提交 + 审计 | 🔴 必遵        |
| 09   | `09-typescript.md`          | TypeScript 类型 + 类型错误零容忍 | 🔴 必遵 + 阻断 |
| 10   | `10-pinia.md`               | Pinia 状态管理         | 🔴 必遵        |
| 11   | `11-form-validation.md`     | 表单与校验             | 🔴 必遵        |
| 12   | `12-base-table.md`          | BaseTable + AGGrid cid | 🔴 必遵        |
| 13   | `13-platform-components.md` | 平台组件合规（核心）   | 🔴 必遵 + 阻断 |
| 14   | `14-layout-containers.md`   | 布局容器与长工作台滚动所有权 | 🔴 必遵 + 阻断 |

---

<!-- task-map:begin -->
## 任务规范映射

映射事实源为 `task-map.json`，本表由 `node scripts/sync-task-standards.cjs` 派生。按实际目标和条件加载规范，基础约束不代表检查已执行。

| 任务 / Skill | 必需标准编号 |
| --- | --- |
| 普通前端修改（baseline） | 02 / 03 / 04 / 09 / 13 / 14 |
| page-codegen | 01 / 02 / 03 / 04 / 12 / 13 / 14 |
| convention-audit | 01 / 02 / 03 / 04 / 05 / 06 / 07 / 08 / 09 / 10 / 11 / 12 / 13 / 14 |
| code-fix | 02 / 03 / 04 / 09 / 13 / 14 |
| api-contract | 02 / 06 / 09 |
| prototype-scan | 02 / 13 / 14 |
| spec-doc-parse | 02 / 13 / 14 |
| business-doc-extract | 02 / 03 |
| template-extract | 02 / 13 |
| menu-sync | 07 |
| dict-sync | 07 |
| permission-sync | 06 / 07 |
| standard-env-config | 01 / 07 |
| status-column-audit | 02 / 12 / 13 |

- 涉及 表单、校验、新增/编辑、可编辑明细、form 时补充：11。
- 涉及 Pinia、Store、状态管理 时补充：10。
- 仅 Git 操作读取 08；没有前端代码变更时不宣称页面检查已执行。
<!-- task-map:end -->

---

## 加载方式（Pre-flight 声明示例）

```
✅ 已读取 standards/index.md            → 规范门控，匹配任务类型 A（生成新页面）
✅ 已读取 standards/02-code-structure.md → 三文件分离+接口契约 + 三段式 + script 9 段顺序
✅ 已读取 standards/12-base-table.md     → AGGrid 必用 + cid 命名规范
✅ 已读取 standards/13-platform-components.md → 平台组件对照表
```

> **不要** 一次性读取全部 14 条。错误示范：`✅ 已读取 standards/01 ~ standards/14`（浪费 token，违反懒加载原则）。

---

## 规范变更管理

- 新增规范条目：编号顺序追加，不复用废弃编号
- 修改既有规范：在文件末尾追加 `## 变更记录` 章节，登记日期 + 变更摘要
- 整体破坏性变更：升级本文件顶部 `version`，并在根 `CHANGELOG.md` 标注

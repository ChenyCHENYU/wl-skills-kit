# wl-skills-kit 架构升级规划

> **文档性质**：执行前确认基准 + 追溯凭证
> **创建时间**：2026-04-26
> **状态**：待执行（所有文件操作尚未开始）

---

## 一、升级背景与目标

**当前问题：**

- `copilot-instructions.md` 已膨胀至 600+ 行，AI 每次全量加载，浪费 token
- 12 条规范全部堆在一个文件里，无法按需加载
- 9 个 TPL 模板平铺在 `page-codegen/` 根目录，没有通用/领域分层
- 没有机制约束 AI 必须使用平台封装组件（第 13 条规范缺失）
- 没有固定的报告输出目录，生成产物散落
- 没有多 AI 编辑器适配层
- 没有模板提取机制，领域模板库无法扩展

**升级目标：**

- 规范模块化（13 条独立文件 + 门控索引）
- 模板分层化（通用/领域）
- 报告目录化（系统数据 / 审计报告 / 提取建议 分类存放）
- 技能注册化（单一数据源触发词映射）
- Token 最优化（门控前置，按需加载，Pre-flight 缓存声明）
- 多 AI 兼容化（`_compat/` 适配层）

---

## 二、报告目录分类设计（重要）

`报告/` 下三类文件，职责完全不同，不可混淆：

### A. 系统数据文件（由 Skill 写入，供同步 Skill 读取）

| 文件                     | 写入者                         | 读取者          | 说明                   |
| ------------------------ | ------------------------------ | --------------- | ---------------------- |
| `SYS_MENU_INFO.md`       | page-codegen                   | menu-sync       | 页面生成时追加菜单条目 |
| `SYS_DICT_INFO.md`       | dict-collect `[PLANNED]`       | dict-sync       | 字典数据汇总           |
| `SYS_PERMISSION_INFO.md` | permission-collect `[PLANNED]` | permission-sync | 权限数据汇总           |

**写入规则**：**追加**，不覆盖；每条目带生成时间戳。

### B. 审计偏差报告（由 convention-audit 写入，人工看 → 喂给 code-fix）

| 文件              | 写入者           | 读取者              | 说明                    |
| ----------------- | ---------------- | ------------------- | ----------------------- |
| `规范审查报告.md` | convention-audit | 人工确认 → code-fix | 不合规项清单 + 整改建议 |

**写入规则**：**追加**，最新章节在顶部，时间戳分节，不删历史记录。

### C. 提取建议报告（由 convention-audit 写入，人工验看 → 触发 template-extract）

| 文件              | 写入者           | 读取者                      | 说明                          |
| ----------------- | ---------------- | --------------------------- | ----------------------------- |
| `组件提取建议.md` | convention-audit | 人工确认 → template-extract | 3+ 页面复用但未封装的模式清单 |

**写入规则**：**追加**，时间戳分节。每条建议含：目录路径、文件名、文件头解析的菜单位置、模式描述。

---

## 三、Token 效率策略

**原则**：最少读取，最准定位，最明声明。

| 策略            | 实现方式                                                                             |
| --------------- | ------------------------------------------------------------------------------------ |
| 门控前置        | `standards/index.md` 按任务类型仅下发 2~4 条规范路径                                 |
| 模板快查        | `templates/_index.md` 一次读取，直接拿到 TPL 路径                                    |
| 按需读取        | `standards/13-platform-components.md` 的 docs 前置读取清单，涉及哪个组件才读哪个 doc |
| Pre-flight 缓存 | 声明已读文件 = 本次对话内不重复读取                                                  |
| 文件聚焦        | 每个 standards 文件目标 60~80 行，只写 AI 执行需要的规则，不写背景介绍               |
| Skill 解耦      | SKILL.md 只写调度逻辑，具体规则 delegate 到 standards/                               |

---

## 四、Pre-flight 声明标准格式

```
📋 Pre-flight 规范声明
────────────────────────────────────────────────────────
🚀 已触发技能 page-codegen/SKILL.md       → 页面代码生成：4文件 + 模板调度 + 前置检查
────────────────────────────────────────────────────────
✅ 已读取 templates/_index.md             → 模板注册表，当前匹配：TPL-LIST（标准列表页）
✅ 已读取 templates/universal/TPL-LIST.md → BaseQuery+BaseToolbar+BaseTable+分页结构规则
✅ 已读取 standards/02-code-structure.md  → 4文件原则 + 三段式 + script setup 9段顺序
✅ 已读取 standards/12-base-table.md      → AGGrid必用 + cid命名规范（{缩写}-{Unix秒后6位}）
✅ 已读取 standards/13-platform-components.md → 平台组件对照表 + docs前置读取清单
✅ 已读取 docs/jh-select.md               → 本页涉及下拉组件，读取使用规范
✅ 工具链检测：.prettierrc.js ✓  eslint.config.ts ✓  .husky/ ✓  [全部就绪]
✅ cid 已生成：cl-745831（customer-list 首字母缩写）
────────────────────────────────────────────────────────
⏳ 开始生成...
```

**工具链检测失败时（红叉 + 暂停，无灰色警告）：**

```
❌ 工具链检测失败：未找到 .prettierrc.js / eslint.config.ts / .husky/
   → 请执行：npx @robot-admin/git-standards init
   → 或联系 CHENY 409322 解决
   → ⛔ 代码生成已暂停，修复后重新触发
```

**生成完成摘要：**

```
📦 本次生成完成
────────────────────────────────────────────────────────
✅ src/views/sale/customer/customer-list/index.vue
✅ src/views/sale/customer/customer-list/data.ts
✅ src/views/sale/customer/customer-list/index.scss
✅ src/views/sale/customer/customer-list/api.md
✅ 报告/SYS_MENU_INFO.md  → 已追加菜单条目（第 N 条）
────────────────────────────────────────────────────────
📌 后续步骤：
   1. 在 router/pages.ts 注册路由
   2. 提交：git cz（禁止直接 git commit）
   3. 可选：触发 convention-audit 扫描本次生成文件
────────────────────────────────────────────────────────
```

---

## 五、目标完整目录结构

```
.github/
│
├── copilot-instructions.md              精简总入口（目标 ~150 行）
│                                        保留：技术栈速查 + 组件速查 + 规范懒加载指令 + Skill调度表
│                                        移除：12条规范（已迁入 standards/）
│
├── standards/                           规范层（13条独立文件 + 门控）
│   ├── index.md                         规范总纲：按任务类型下发需加载的规范清单（懒加载门控）
│   ├── 01-toolchain.md                  工具链检测规范 | @robot-admin/git-standards 检测 + 未装暂停
│   ├── 02-code-structure.md             代码结构顺序规范 | 4文件原则 + 三段式 + script 9段 + data.ts顺序 + scss
│   ├── 03-comments.md                   注释规范 | koroFileHeader文件头 + 函数注释 + 行内注释原则
│   ├── 04-coding-basics.md              基础编码规范 | const优先/解构/async-await/条件层级 等13条
│   ├── 05-logging.md                    日志规范 | console管控 + pre-commit兜底
│   ├── 06-security.md                   安全规范 | v-html/Token/输入参数/eval禁用
│   ├── 07-config.md                     配置管理规范 | VITE_前缀 + API不硬编码 + env分层
│   ├── 08-git.md                        Git提交规范 | 强制git cz + 分支命名 + type枚举
│   ├── 09-typescript.md                 TypeScript规范 | interface优先 + any约束 + strict兼容
│   ├── 10-pinia.md                      Pinia规范 | Store边界 + 禁止在data.ts里import Store
│   ├── 11-form-validation.md            表单校验规范 | c_formModal内置 vs FORM_ROUTE手动validate
│   ├── 12-base-table.md                 BaseTable规范 🔴强制 | agGrid必用 + cid命名规范
│   └── 13-platform-components.md       平台组件合规规范 🔴强制 | 组件对照表 + docs前置读取清单
│                                        ※ 有封装组件优先用；无封装才用el-；
│                                           3+页面相同el-模式→convention-audit输出提取建议
│
├── skills/
│   ├── _registry.md                     技能注册表：触发词 → SKILL路径 + pipeline编排（单一数据源）
│   │
│   ├── _compat/                         多AI/编辑器适配层
│   │   ├── ai-model-matrix.md           各模型能力矩阵（文件读取支持度/Pre-flight兼容性/调度能力）
│   │   └── editor-setup.md              VS Code/Cursor/Windsurf/Kiro/Trae 配置说明
│   │
│   ├── prototype-scan/
│   │   └── SKILL.md                     原型扫描：自然语言/Axure HTML/详设文档 → 交互模式识别 + page-spec
│   │
│   ├── api-contract/
│   │   └── SKILL.md                     接口约定：生成 api.md，前后端联调基准文档
│   │
│   ├── page-codegen/                    ← 核心 Skill
│   │   ├── SKILL.md                     主规则：Pre-flight声明 + 模板调度 + 规范门控 + 生成摘要
│   │   └── templates/
│   │       ├── _index.md                模板注册表：交互模式关键词 → TPL路径（单一数据源）
│   │       ├── universal/               通用交互模式模板（8个，无业务域绑定）
│   │       │   ├── TPL-LIST.md          标准列表页（BaseQuery+BaseToolbar+BaseTable+分页）
│   │       │   ├── TPL-FORM-ROUTE.md    复杂表单独立路由页（多Tab/多子表/手动validate）
│   │       │   ├── TPL-MASTER-DETAIL.md 主从表页（jh-drag-row上下分栏）
│   │       │   ├── TPL-TREE-LIST.md     左树右列表页（C_Splitter布局）
│   │       │   ├── TPL-DETAIL-TABS.md   详情Tab页（上方表单+下方Tab子表）
│   │       │   ├── TPL-CHANGE-HISTORY.md 变更历史比对页（时间线+字段差异）
│   │       │   ├── TPL-RECORD-FORM.md   录入型实绩页（无分页，查询+内联表单）
│   │       │   └── TPL-DRIVEN.md        配置驱动识别参考（非代码生成模板）
│   │       └── domains/
│   │           ├── _CONTRIBUTING.md     领域模板贡献规范（提取规则/命名格式/提交要求）
│   │           ├── produce/             生产域专属模板
│   │           │   └── TPL-OPERATION-STATION.md  工序操作站（双清单联动+内联表单）
│   │           └── sale/               销售域专属模板（待沉淀）
│   │               └── README.md        占位说明
│   │
│   ├── template-extract/               ← 新增：模板提取 Skill
│   │   └── SKILL.md                    从现有项目页面提取领域模板，追加到 domains/
│   │                                   【混合模式流程】
│   │                                   1. 开发者指定目标页目录路径（一句话触发）
│   │                                   2. AI 读取目标页4文件，识别当前交互模式
│   │                                   3. 对比已有TPL清单，判断重复/可复用程度
│   │                                   4. 问答确认：领域归属 / 模板命名 / 脱敏需求
│   │                                   5. 生成标准 TPL 文件 → 写入 domains/{domain}/
│   │                                   6. 自动更新 templates/_index.md 注册条目
│   │                                   7. 输出 _CONTRIBUTING.md 规范提交步骤提示
│   │
│   ├── menu-sync/
│   │   ├── SKILL.md                    菜单同步（SYS_MENU_INFO.md 路径更新：报告/ → 同步后端）
│   │   └── env/guide.md                env.local.json 4字段配置说明
│   │
│   ├── dict-sync/                      [PLANNED] 字典同步（机制同 menu-sync）
│   │   └── SKILL.draft.md              草稿占位，_registry.md 中不注册，不参与调度
│   │
│   ├── permission-sync/                [PLANNED] 权限同步（机制同 menu-sync）
│   │   └── SKILL.draft.md
│   │
│   ├── convention-audit/               规范审计（原 convention-extract，全面升级）
│   │   └── SKILL.md                    对照13条规范扫描源码 → 偏差报告 + 提取建议
│   │                                   扫描粒度：单文件 / 指定目录 / 全项目
│   │                                   输出1：追加写入 报告/规范审查报告.md（不覆盖，时间戳分节）
│   │                                   输出2：追加写入 报告/组件提取建议.md（3+页面复用未封装模式）
│   │
│   └── code-fix/                       [PLANNED] 自动代码修复（与 convention-audit 形成闭环）
│       └── SKILL.draft.md              按审查报告自动整改不合规项
│
├── 文档/                               人工维护说明文档（原 docs/，重命名）
│   ├── 使用指南.md                     全套 Skill 使用说明（彻底重写，基于新架构）
│   └── 架构设计.md                     本次架构升级设计文档（决策记录 + 演进路线）
│
└── 报告/                               AI 生成物统一存放（新建）
    ├── README.md                        目录用途说明 + 管理规则
    │                                   （三类文件说明：系统数据/审计报告/提取建议，均追加不覆盖）
    ├── SYS_MENU_INFO.md                系统数据文件 | page-codegen追加 → menu-sync读取
    ├── SYS_DICT_INFO.md                系统数据文件 [PLANNED] | dict-sync
    ├── SYS_PERMISSION_INFO.md          系统数据文件 [PLANNED] | permission-sync
    ├── 规范审查报告.md                  审计报告 | convention-audit追加写入（最新在顶，时间戳分节）
    └── 组件提取建议.md                  建议报告 | convention-audit追加写入，人工验看后触发提取
```

---

## 六、执行计划（分阶段，有序推进）

### 阶段 1：创建 standards/ 目录（14个文件）

| 操作 | 文件                                  | 内容来源                             |
| ---- | ------------------------------------- | ------------------------------------ |
| 新建 | `standards/index.md`                  | 新写：按任务类型分组的规范加载清单   |
| 新建 | `standards/01-toolchain.md`           | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/02-code-structure.md`      | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/03-comments.md`            | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/04-coding-basics.md`       | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/05-logging.md`             | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/06-security.md`            | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/07-config.md`              | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/08-git.md`                 | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/09-typescript.md`          | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/10-pinia.md`               | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/11-form-validation.md`     | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/12-base-table.md`          | 从 copilot-instructions.md 迁移      |
| 新建 | `standards/13-platform-components.md` | 新写：平台组件合规规范（全新第13条） |

### 阶段 2：精简 copilot-instructions.md

- 删除：12条规范内容（约450行）
- 保留：技术栈速查 + 组件速查 + 命名规范速查 + 规范懒加载指令 + Skill调度表
- 新增：`standards/index.md` 加载指引
- 目标：~150 行

### 阶段 3：重构 skills/ 目录（14个操作）

| 操作   | 详情                                                                   |
| ------ | ---------------------------------------------------------------------- |
| 移动   | 8个通用 TPL → `page-codegen/templates/universal/`                      |
| 移动   | `TPL-OPERATION-STATION.md` → `page-codegen/templates/domains/produce/` |
| 新建   | `page-codegen/templates/_index.md`（模板注册表）                       |
| 新建   | `page-codegen/templates/domains/_CONTRIBUTING.md`（贡献规范）          |
| 新建   | `page-codegen/templates/domains/sale/README.md`（占位）                |
| 更新   | `page-codegen/SKILL.md`（路径 + Pre-flight + 生成摘要）                |
| 新建   | `skills/_registry.md`（技能注册表）                                    |
| 新建   | `skills/_compat/ai-model-matrix.md`                                    |
| 新建   | `skills/_compat/editor-setup.md`                                       |
| 重命名 | `convention-extract/` → `convention-audit/`，升级 SKILL.md             |
| 新建   | `skills/template-extract/SKILL.md`                                     |
| 更新   | `menu-sync/SKILL.md`（SYS_MENU_INFO 路径 → `报告/`）                   |
| 新建   | `skills/dict-sync/SKILL.draft.md`                                      |
| 新建   | `skills/permission-sync/SKILL.draft.md`                                |
| 新建   | `skills/code-fix/SKILL.draft.md`                                       |

### 阶段 4：重组 文档/ 目录

| 操作   | 详情                                                      |
| ------ | --------------------------------------------------------- |
| 重命名 | `docs/` → `文档/`                                         |
| 重写   | `use-skill.md` → `文档/使用指南.md`（基于新架构完全重写） |
| 新建   | `文档/架构设计.md`（记录本次架构决策）                    |
| 删除   | `docs/menu-sync-design.md`                                |
| 删除   | `docs/wl-skills-kit.md`                                   |

### 阶段 5：创建 报告/ 目录（6个文件）

| 操作 | 文件                                              | 说明                               |
| ---- | ------------------------------------------------- | ---------------------------------- |
| 新建 | `报告/README.md`                                  | 目录用途 + 三类文件说明 + 管理规则 |
| 移入 | `docs/SYS_MENU_INFO.md` → `报告/SYS_MENU_INFO.md` | 同时更新内容（追加格式说明）       |
| 新建 | `报告/SYS_DICT_INFO.md`                           | 占位（含 `[PLANNED]` 说明）        |
| 新建 | `报告/SYS_PERMISSION_INFO.md`                     | 占位（含 `[PLANNED]` 说明）        |
| 新建 | `报告/规范审查报告.md`                            | 时间戳追加模板（含格式示例）       |
| 新建 | `报告/组件提取建议.md`                            | 时间戳追加模板（含列表格式示例）   |

### 阶段 6：更新 bin/wl-skills.js

- 更新 TPL 文件路径（8个 → `universal/`，1个 → `domains/produce/`）
- 新增 `standards/` 目录复制逻辑
- 更新 `docs/` → `文档/`（含 `SYS_MENU_INFO.md` 排除，它在 `报告/`）
- 新增 `报告/` 目录复制逻辑（`报告/规范审查报告.md` + `报告/组件提取建议.md` 需标记为 `不覆盖` 模式）
- 注：`报告/SYS_MENU_INFO.md` 等数据文件安装时**不覆盖**目标（避免抹掉已有记录）

---

## 七、文件变更汇总（Before → After）

### 删除（3个文件）

```
docs/menu-sync-design.md      已过时，内容合并进架构设计.md
docs/wl-skills-kit.md         已有 README.md，重复
```

> ⚠️ 删除前再次人工确认

### 重命名（2个目录）

```
.github/docs/                → .github/文档/
skills/convention-extract/   → skills/convention-audit/
```

### 移动（10个文件）

```
page-codegen/TPL-LIST.md              → templates/universal/TPL-LIST.md
page-codegen/TPL-FORM-ROUTE.md        → templates/universal/TPL-FORM-ROUTE.md
page-codegen/TPL-MASTER-DETAIL.md     → templates/universal/TPL-MASTER-DETAIL.md
page-codegen/TPL-TREE-LIST.md         → templates/universal/TPL-TREE-LIST.md
page-codegen/TPL-DETAIL-TABS.md       → templates/universal/TPL-DETAIL-TABS.md
page-codegen/TPL-CHANGE-HISTORY.md    → templates/universal/TPL-CHANGE-HISTORY.md
page-codegen/TPL-RECORD-FORM.md       → templates/universal/TPL-RECORD-FORM.md
page-codegen/TPL-DRIVEN.md            → templates/universal/TPL-DRIVEN.md
page-codegen/TPL-OPERATION-STATION.md → templates/domains/produce/TPL-OPERATION-STATION.md
docs/SYS_MENU_INFO.md                 → 报告/SYS_MENU_INFO.md
```

### 新建（30+个文件，见阶段1~5详情）

### 修改（3个文件）

```
.github/copilot-instructions.md    精简 ~150行
skills/page-codegen/SKILL.md       更新路径 + Pre-flight + 生成摘要
skills/menu-sync/SKILL.md          更新 SYS_MENU_INFO 路径
bin/wl-skills.js                   更新所有路径映射
```

---

## 八、待确认事项（执行前最后核对）

- [ ] `docs/menu-sync-design.md` 和 `docs/wl-skills-kit.md` 确认删除
- [ ] `文档/` 中文目录名 bin/wl-skills.js 能正确处理（Windows 路径 + 中文）
- [ ] `报告/` 下 SYS\_\*.md 数据文件在 `init` 时创建，在 `update` 时跳过（不覆盖）
- [ ] `规范审查报告.md` 和 `组件提取建议.md` 安装时只创建空文件，不覆盖已有内容

---

_本文档在架构升级全部完成后，迁入 `.github/文档/架构设计.md` 作为永久存档。_

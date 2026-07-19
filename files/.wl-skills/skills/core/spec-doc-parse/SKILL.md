---
name: spec-doc-parse
description: "Use when: parsing STANDARD requirement-design specification documents produced by wl-skills-design (path contains .wl-skills/docs/spec/, files like ch1-3.md / 4.x-{module}.md / 4.N-data-report.md, with function codes like PMMB001, IPO tables containing 处理逻辑, and flow descriptions with five-elements) into the SAME page-spec JSON consumed by page-codegen. This is the 规范线 (spec line) counterpart to prototype-scan (原型线). Self-validating, self-correcting, report-producing. Triggers on: 解析说明书, 解析需求文档, 解析详设, 规范文档转页面, 根据说明书生成, spec doc parse, IPO 转页面, .wl-skills/docs/spec, 功能编码, 需求设计说明书."
---

# Skill: 规范文档解构（spec-doc-parse）

将 **wl-skills-design 产出的标准《需求设计说明书》**（`.wl-skills/docs/spec/{项目代号}/` 下的 `ch1-3.md` + `4.x-{子模块}.md` + `4.N-data-report.md`）解构为与 `prototype-scan` **完全相同格式的 page-spec JSON**，作为 `api-contract` / `page-codegen` 的输入。

> **双线汇聚原则**：原型线（prototype-scan）和规范线（本 Skill）是两条独立的输入线，但**汇聚点只有一个 —— page-spec JSON + api.md**。下游 `page-codegen` 不感知来源，两线代码完全共享。
> **职责边界**：design 负责「生成标准」，kit 负责「解构标准、完整读取」。本 Skill 是 kit 侧解构能力的承载者。

---

## 与 prototype-scan 的硬隔离（必读）

| 维度 | prototype-scan（原型线） | spec-doc-parse（规范线） |
|------|--------------------------|--------------------------|
| 输入 | Axure HTML / 截图 / 口述 / **非规范**详设 | **wl-skills-design 标准说明书** |
| 识别特征 | 视觉原型、自由格式文档 | `.wl-skills/docs/spec/` 路径 / 功能编码 `/[A-Z]{2,6}[0-9]{3}/` / IPO 表「处理逻辑」/ 流程五要素 |
| 解析方式 | 视觉/语义推断，全部标记来源 | 规范结构映射，并由 page-spec/API contract 校验 |
| 禁区 | **不得处理** `.wl-skills/docs/spec/` 标准文档 | **不接受** Axure HTML / 截图 |

> 当用户输入命中规范线特征时，**强制走本 Skill**，禁止 prototype-scan 接管（见 `_registry.md` 调度规则「优先级 0」）。

---

## Pre-flight 声明（执行前必须输出）

```
🚀 已触发技能 spec-doc-parse/SKILL.md       → 规范文档解构：标准说明书 → page-spec JSON
✅ 已读取 standards/index.md                 → 规范门控（任务类型：解析规范文档转页面）
✅ 已读取 core/prototype-scan/SKILL.md       → page-spec JSON 结构定义（统一汇聚格式）
✅ 已读取 standards/12-base-table.md         → AGGrid 列定义约束（供下游 page-codegen）
✅ 已识别文档结构：{doc-skeleton 5 文件 / 单卷 / 单子模块}
✅ 来源文件：{.wl-skills/docs/spec/{项目代号}/...}
✅ 输出：reports/SPEC_PARSE_{模块}_{日期}.md（page-spec JSON + 解析报告）
✅ 不会生成代码（解析 + 报告，代码生成由 page-codegen 承接）
```

**结构不合规时（红叉 + 暂停）**：

```
❌ 文档结构校验失败：未找到 ch1-3.md 或任何 4.x-*.md，或文档不含功能编码/IPO 表
   → 这可能不是 wl-skills-design 标准说明书
   → 若为非规范详设，请改用 prototype-scan（原型线）
   → ⛔ 解析已暂停
```

---

## 前置检查

```
□ 文档来源路径：.wl-skills/docs/spec/{项目代号}/
□ 文件清单：ch1-3.md（概述）+ 4.x-{子模块}.md（详细设计）[+ 4.N-data-report.md]
□ 目标项目路径：src/views/[域]/[模块]/[子模块]/
□ 服务缩写：从功能编码前缀推断（pm / mmwr / mmsm / sale / hrms / base）
□ 解析范围：整卷 / 指定子模块 / 指定功能编码
```

---

## 解析流水线（9 步）

```
Step 1  结构识别    识别 doc-skeleton 5 文件结构，确认卷归属与子模块清单
Step 2  章节拆解    按 4.x.y.z 编号解析  子模块 → 流程 → 功能
Step 3  IPO 解析    每个 4.x.4.z 功能 → 提取「画面逻辑（原型）」+「处理逻辑（IPO）」
Step 4  字段提取    从画面逻辑字段说明表提取 字段名/控件类型/必填/数据来源/校验规则
Step 5  模式推断    根据「页面类型」映射到 prototype-scan 同款 pattern 枚举
Step 6  接口推算    功能编码 → 服务缩写 → /{服务}/{资源CamelCase}/{操作}
Step 7  权限提取    流程活动编码 [流程编码]-[E/C/M]-[NN] → v-permission code 候选
Step 8  生成产物    输出与 prototype-scan 完全相同格式的 page-spec JSON
Step 9  自验证+报告  Parse Validation 五项检查 + 自动修复 + 解析报告
```

---

## Step 1 — 结构识别

依据 `wl-skills-design` 的 `doc-skeleton.md` 5 文件结构识别：

```
.wl-skills/docs/spec/{项目代号}/
├── ch1-3.md              ← 第 1~3 章（总体概述、术语、范围）
├── 4.1-{子模块名}.md     ← 子模块详细设计（流程 + IPO）
├── 4.2-{子模块名}.md
├── ...
└── 4.N-data-report.md    ← 数据需求表 + 报表设计
```

- 从 `ch1-3.md` 提取：项目名称、项目代号、模块清单、术语表（供字段命名参考）
- 从每个 `4.x-*.md` 提取：子模块编码、流程清单、功能清单
- 从 `4.N-data-report.md` 提取：数据实体字段（**优先作为字段英文名权威来源**，减少推断）

---

## Step 2 — 章节拆解

按 wl-skills-design 编号体系逐层拆解：

| 层级 | 编号格式 | 含义 | 映射 |
|------|---------|------|------|
| 子模块 | `4.x` | 业务子模块 | 目录层 `[子模块]/` |
| 流程 | `4.x.{流程编码}` | 业务流程 | 不直接出页面，提供活动 → 权限码 |
| 功能 | `4.x.4.z`（功能编码 `[子模块代码][NNN]`） | 单个功能页面集 | **一个功能 → 1~N 个 page-spec** |

---

## Step 3 — IPO 表解析（核心）

每个 `4.x.4.z` 功能包含两部分（对应 wl-skills-design `sub/03-function-ipo.md`）：

### 3.1 画面逻辑（原型）→ 页面结构

从「画面逻辑」小节的**字段说明表**提取：

```
| 字段名 | 控件类型 | 必填 | 数据来源 | 字段规则 |
```

映射到 page-spec：

| 画面逻辑来源 | → page-spec 字段 | 说明 |
|-------------|------------------|------|
| 页面类型（列表页/新增页/修改页/详情页） | `pattern` | 见 Step 5 映射表 |
| 列表页 - 搜索区字段 | `query[]` | 搜索条件一律「选填」 |
| 列表页 - 操作按钮 | `toolbar[]` | 顺序严格保持 |
| 列表页 - 显示列 | `columns[]` | 顺序严格保持 |
| 列表页 - 操作列 | `operations[]` | 编辑/删除/查看/审批等 |
| 新增/修改页 - 字段 | `formSections[].fields[]` | 含 required |
| 字段控件类型 | `query/columns/fields.type` | 见 3.3 控件映射 |
| 字段字典 | `dictCode` | 从字段规则/数据来源提取 |
| 子表（明细表） | `subTables[]` | 含 editable/inlineEdit |

### 3.2 处理逻辑（IPO）→ notes + 接口推算

「处理逻辑」描述确认按钮三段式（数据校验 + 数据处理 + 触发事件），用于：

- **触发事件** → `notes[]`（写入哪张表、推送哪个模块），并辅助 Step 6 接口路径命名
- **数据校验** → 字段 `required` / 校验规则补充
- 凡处理逻辑中标注 `【待确认：...】` → 原样保留进 `notes[]`，不得擅自填充

### 3.3 控件类型 → page-spec type 映射

| IPO 控件类型 | page-spec type | 补充 |
|-------------|----------------|------|
| 文本框 / 输入框 | `input` | — |
| 下拉选择 | `dict` | 需 `dictCode` |
| 单日期 | `date` | — |
| 日期范围 | `dateRange` | 需 `startName`/`endName` |
| 月份选择 | `month` | — |
| 用户选择 | `userPicker` | — |
| 部门选择 | `deptPicker` | — |
| 文件上传 | `fileUpload` | — |

---

## Step 4 — 字段英文名提取（优先权威源）

英文名来源优先级（高 → 低）：

1. **`4.N-data-report.md` 数据实体字段**（权威，wl-skills-design 已定义）→ 直接采用
2. IPO 表字段说明中显式英文名 → 直接采用
3. 均无 → 从中文名推断 camelCase，`notes[]` 标注 `[推断英文名，请确认]`

---

## Step 5 — 交互模式推断

复用 `prototype-scan` 同款 pattern 枚举（保证下游一致）：

| 文档「页面类型」描述 | pattern |
|---------------------|---------|
| 列表页 / 查询页 / 管理页（默认） | `LIST` |
| 主从 / 上下表 / 主表+明细 | `MASTER_DETAIL` |
| 左树右表 / 树形分类 | `TREE_LIST` |
| 多 Tab 详情 / 详情页 | `DETAIL_TABS` |
| 独立路由表单 / 复杂表单 | `FORM_ROUTE` |
| 变更历史 / 变更记录 | `CHANGE_HISTORY` |
| 记录表单 / 无分页录入 | `RECORD_FORM` |
| 工位 / 操作站 | `OPERATION_STATION` |

无法判断 → 写入 `openQuestions[]` 并阻断该页面代码生成；只有需求明确说明为标准列表时才能选择 `LIST`。

---

## Step 6 — 接口路径推算

功能编码前缀 → 服务缩写 → URL：

```
功能编码 PMMB001  →  前缀 PM  →  服务 pm  →  /pm/{资源CamelCase}/{操作}
```

| 服务缩写 | 含义 | 示例 |
|---------|------|------|
| pm | 生产管理 | `/pm/omptMillPlanOrder/queryPage` |
| mmwr | 精整作业 | `/mmwr/mmwrTechFinish/queryPage` |
| mmsm | 炼钢管理 | `/mmsm/mmsmRsltLadleUse/queryPage` |
| sale | 销售管理 | `/sale/saleOrder/queryPage` |
| hrms | 人力资源 | `/hrms/hrmsEmployee/queryPage` |
| base | 基础数据 | `/base/cmUserGroup/queryPage` |

> 仅生成 page-spec 与 api.md 草案的 URL 建议；真实接口契约由后续 `api-contract` Skill 落地。

---

## Step 7 — 权限码提取

从子模块流程的活动编码提取 v-permission code 候选：

```
流程活动编码：[流程编码]-[操作类型]-[NN]    操作类型 E(在线展示)/C(创建)/M(修改)
PMMB-A-01-E-01（查询目标列表）→ permission:pmmb:target:list
PMMB-A-01-C-02（新增目标）     → permission:pmmb:target:add
PMMB-A-01-M-03（修改目标）     → permission:pmmb:target:edit
```

权限码写入 page-spec `notes[]`，供后续 `permission-sync` Skill 注册。

---

## Step 8 — 生成 page-spec JSON

输出格式**与 `core/prototype-scan/SKILL.md` 的 page-spec 结构完全一致**（字段名、层级、枚举均不变）。
执行前必须先 `read_file` 加载 prototype-scan SKILL.md 的「输出格式：page-spec JSON」章节，按同一模板逐字段填充，**禁止用「等」「...」省略字段**。

`notes[]` 中规范线特有的补充：

```jsonc
"notes": [
  "[规范线] 来源：.wl-skills/docs/spec/huaxin/4.1-target.md §4.1.4.1 PMMB001",
  "[规范线] 权限码候选：permission:pmmb:target:list / :add / :edit",
  "[规范线] 触发事件：提交后写入 bom_ratio 表并触发重算（见处理逻辑）",
  "[待确认] status 字段 dictCode 推断为 target_status，需后端确认"
]
```

---

## Step 9 — 自验证 + 自修复 + 报告

### 9.1 Parse Validation（五项检查）

```
□ 每个功能至少有一个页面类型声明（缺 → BLOCK + openQuestions）
□ 输入字段都有控件类型（缺 → 从字段名推断 + 标注【推断，待确认】）
□ 确认按钮有触发事件描述（缺 → notes 写【待确认：提交后触发哪些下游操作】）
□ 活动编码符合 [流程编码]-[E/C/M]-[NN]（格式偏差 → 自动修复 + 报告差异）
□ 服务缩写在已知列表（pm/mmwr/mmsm/sale/hrms/base）（不在 → BLOCK + 报告）
```

### 9.2 自动修复纠偏（Auto-Correction）

| 发现问题 | 自动修复 | 报告标记 |
|---------|---------|---------|
| 活动编码用旧格式（仅 `E-NN` 无操作类型分位） | 对齐为 `[流程编码]-E-[NN]`（系统在线默认 E） | `[AUTO-FIX]` |
| 字段英文名空白 | 优先取 data-report 实体字段，否则推断 camelCase | `notes` 追加 `[推断，请确认]` |
| 页面类型无法映射 | **不自动降级** | `[BLOCK]` + `openQuestions` |
| dictCode 缺失 | **不生成可运行字典绑定** | `[BLOCK]` + `openQuestions` |
| 功能编码格式错误（不匹配 `/[A-Z]{2,6}[0-9]{3}/`） | **不自动修复**（编码是架构决策） | `[BLOCK]`，暂停该功能解析 |
| 服务缩写未知 | **不自动修复** | `[BLOCK]`，列入报告待人工补充 |

> 自动修复只处理**无损/可逆**问题；涉及架构决策（编码、服务划分、触发事件）一律 BLOCK 或 待确认，绝不捏造。

### 9.3 解析报告（reports/SPEC_PARSE_{模块}_{日期}.md）

```markdown
# Spec-Doc Parse 报告
- 生成时间：{YYYY-MM-DD HH:mm}
- 来源文件：.wl-skills/docs/spec/{项目代号}/4.x-{子模块}.md
- 解析范围：{整卷 / 子模块 / 功能编码}

## 解析摘要
- 功能总数：N    成功：N    待确认：N    自动修复：N    阻断：N

## 功能清单
| 功能编码 | 功能名称 | 页面数 | page-spec | 状态 |
|---------|---------|-------|-----------|------|
| PMMB001 | BOM 钢种配比 | 2 | ✅ 生成 | ready |
| PMMB002 | 目标管理 | 3 | ⚠️ 待确认 | 7 项待确认 |
| PMMB003 | 计划管理 | 1 | ❌ 阻断 | 功能编码格式错误 |

## 待确认清单
| # | 功能 | 字段/项目 | 问题 | 建议 |
|---|-----|----------|------|------|
| 1 | PMMB001 | submitBtn.触发事件 | 未描述下游操作 | 请补充 |
| 2 | PMMB002 | status.dictCode | 推断 target_status | 需后端确认 |

## 自动修复记录
| # | 位置 | 修复内容 |
|---|------|---------|
| 1 | PMMB001-A-01-E-01 | 活动编码格式已对齐新规范 |

## 阻断清单（需人工处理）
| # | 功能 | 原因 |
|---|-----|------|
| 1 | PMMB003 | 功能编码格式错误，不符合 [子模块代码][NNN] |
```

---

## 完成摘要（执行结束后输出）

```
## 完成摘要
- 产物：reports/SPEC_PARSE_{模块}_{日期}.md（含 page-spec JSON 数组）
- 关键数据：功能 N 个 / 页面 N 个 / 待确认 N 项 / 自动修复 N 项 / 阻断 N 项
- 风险：{阻断项与待确认项需人工确认后再进 page-codegen}

## 建议下一步
- next_suggest：先处理阻断项与待确认项 → api-contract（生成 api.md）→ page-codegen
- 原因：page-spec 已就绪，可进入接口约定与代码生成
- 是否需要用户确认：是
```

---

## 闭环验证（与 convention-audit 联动）

解析产出可被 `convention-audit` 的「spec 对齐扫描」模式回扫：

```
spec-doc-parse 输出 page-spec JSON
  → page-codegen 生成代码
  → convention-audit --mode spec-align（比对 spec 字段 vs 代码字段）
  → 输出 GAP 报告（spec 中有但代码缺失的字段 / 代码多出 spec 未定义的字段）
```

详见 `core/convention-audit/SKILL.md` §「spec 对齐扫描（GAP 报告）」。

# AI 辅助开发全景分析 & 架构演进蓝图

> **基于 wl-skills-kit v2.3 架构**
> **日期**：2026-04-28
> **目标**：企业级通用 · 质量精度高 · 速度快 · 节省 token · 还原度高 · 开箱即用

---

## 目录

1. [AI 辅助开发能力维度全景图](#1-ai-辅助开发能力维度全景图)
2. [各维度深度解析](#2-各维度深度解析)
3. [当前项目架构优势](#3-当前项目架构优势)
4. [冗余与待清理内容](#4-冗余与待清理内容)
5. [架构升级路线图](#5-架构升级路线图)
6. [关键指标目标](#6-关键指标目标)

---

## 1. AI 辅助开发能力维度全景图

```
AI 辅助开发能力谱系（从低到高）

L0  氛围编程（Vibe Coding）
    │  纯对话 → AI 自由发挥 → 高随机性 → 低还原度
    │
L1  提示词工程（Prompt Engineering）
    │  结构化 Prompt → 少样本示例 → CoT → 上下文注入
    │
L2  Skills（结构化技能文件）              ← 当前项目核心
    │  触发词驱动 → SKILL.md → 规范门控 → Pre-flight 声明
    │
L3  MCP（模型上下文协议）                 ← 当前项目已接入
    │  工具调用 → 实时 I/O → 副作用执行 → 跨系统联动
    │
L4  CLI（命令行工具）                     ← 当前项目已实现
    │  独立可执行 → 无 AI 依赖 → 自动化脚本 → CI/CD 集成
    │
L5  Agent Pipeline（智能体流水线）        ← 近期目标
    │  Skill 链式自动触发 → 减少人工干预 → 批量处理
    │
L6  Multi-Agent 协同                      ← 远期目标（L5 稳定后再看）
    │  专家 Agent 分工 → 并发处理 → 质量仲裁
    │
L7  自演化体系（Self-Evolving）            ← 终极形态（条件成熟后规划）
       高质量产出反哺规范/模板 → 精度持续提升 → 正向飞轮
```

### CLI 是终极形态吗？

不是。CLI 是"无 AI 时的兜底执行节点"，把 AI 生成的结果固化为可复现的命令。更高阶是 L5 Agent Pipeline：让 AI 自主串联多个 Skill，减少人工触发每一步的摩擦。CLI 和 Agent Pipeline 并不冲突，前者是后者的可靠底座。

---

## 2. 各维度深度解析

### L1 · 提示词工程

本项目的 L1 实现：

| 能力 | 实现方式 |
|------|----------|
| 系统级规则注入 | `copilot-instructions.md`（10 个编辑器 `_compat` 适配） |
| 任务型少样本 | 各 `SKILL.md` 的示例输出段落 |
| 思维链引导 | Pre-flight 声明 + 前置检查清单 |
| 上下文压缩 | `standards/index.md` 任务类型 → 规范子集映射，懒加载 |
| 领域词汇锚定 | `_registry.md` 触发词单一数据源 |

**待提升**：
- 关键 Skill（page-codegen / convention-audit）缺少"❌ 错误示范"反例段落，AI 在边界场景容易滑回默认行为
- 同时命中多个触发词时无消歧机制，可在 `_registry.md` 增加互斥组声明

---

### L2 · Skills

**当前已有（8 个启用）**：

```
用户触发 → AI 匹配 _registry.md 触发词
         → 加载 SKILL.md + 前置规范子集
         → 输出 Pre-flight 声明（可观测）
         → 按 SKILL 流程执行 → 生成产物 + reports/ 追加
```

**可扩展方向**（按价值排序）：

| Skill 候选 | 描述 | 前置依赖 |
|------------|------|----------|
| `prototype-diff` | 新版原型 vs 已生成代码，输出变更清单 | prototype-scan |
| `api-impact-scan` | api.md 字段变更 → 扫描受影响的 data.ts | api-contract |
| `changelog-gen` | 从 git diff 提炼 Conventional Commits 条目 | wls_git_log_extract |
| `perf-audit` | 扫描 AGGrid 列配置的性能反模式 | convention-audit |

---

### L3 · MCP

> 赋予 AI "手"和"眼"，从"说"到"做"的关键跃迁

#### 已实现的 Tools

| Tool | 能力 | 场景 |
|------|------|------|
| `wls_menu_query` | 查询完整菜单树 | menu-sync 前置读取 |
| `wls_menu_upsert` | 批量新增/更新菜单 | menu-sync 执行 |
| `wls_dict_query` | 查询字典模块 | dict-sync 前置读取 |
| `wls_dict_upsert` | 新增/更新字典 | dict-sync 执行 |
| `wls_role_query` | 查询角色列表 | permission-sync · role-manage |
| `wls_role_upsert` | 批量新增角色（按 code 去重） | permission-sync · role-manage |
| `wls_assignable_menus_query` | 查询全量可授权菜单 | permission-sync · role-assign 前置 |
| `wls_role_assign_menus` | 给角色批量分配菜单（全量覆盖） | permission-sync · role-assign 执行 |
| `wls_action_query` | 查询页面下的动作（type=A） | permission-sync · action-attach 前置 |
| `wls_action_upsert` | 批量新增动作（按 permission 去重） | permission-sync · action-attach 执行 |

效果量化：菜单同步 token 节省约 87%，从 20 分钟 10 次手动操作 → 1 分钟 0 次手动操作。权限同步（角色+授权+挂动作）原本 3 个后台界面切换 + 表单填写 ≥ 15 分钟，现在 1 分钟 0 次手动操作。

#### 待扩展 Tools（含流程衔接设计）

**设计原则：每个 Tool 独立可用，也可组合调用，缺失任何一个不影响其他 Tool 正常运行。**

| Tool | 优先级 | 独立用途 | 组合用途 | 无此 Tool 的降级 |
|------|--------|----------|----------|-----------------|
| `wls_code_scan(path)` | P0 | 扫描 `src/views/` 返回页面清单 + API_CONFIG | convention-audit 直接感知项目结构；prototype-scan 识别已有页面 | AI 猜测目录（当前行为），不阻断 |
| `wls_route_check()` | P1 | 读取 `pages.ts`，检查路由注册情况 | menu-sync 完成后验证路由是否遗漏 | 用户手动检查 pages.ts |
| `wls_git_log_extract(n)` | P1 | 提取最近 N 次 commit 摘要 | changelog-gen Skill 的数据源 | 用户粘贴 git log 给 AI |
| `wls_audit_report_push()` | P2 | 将 audit 报告推送到飞书群 | convention-audit 完成后自动通知 | 不推送，报告留 reports/ |

> **飞书集成说明**：`wls_audit_report_push` 使用飞书自定义机器人 webhook（只需在 `env.local.json` 配置 `feishu_webhook` 字段，无需 OAuth）。未配置则静默跳过，不影响任何其他 Tool。

#### MCP 三原语说明

**Tools（当前在用）**：AI 主动调用，有副作用（读写/调接口）。所有主流编辑器均支持。

**Resources（未启用，按需考虑）**：应用层暴露只读数据源，AI 订阅变更。适合内部 Swagger/OpenAPI 动态接口场景。当前静态文档用文件直接引用即可，引入 Resources 是过度设计。

**Prompts（了解即可，暂不实现）**：

Prompts 是在 MCP server 里注册"预制 slash command 模板"。用户输入 `/gen-page` 时，MCP server 直接向 AI 注入完整的结构化 prompt，跳过 AI 自己读 SKILL.md 这一步。

需要编辑器侧实现 `prompts/list` + `prompts/get` 两个 API 调用才能使用。当前支持情况：Claude Code ✅；Cursor ⚠️ 部分；VS Code Copilot / Windsurf / Cline ❌ 未支持。

不实现的原因：团队主力是 VS Code Copilot，而它不支持 Prompts 原语。现有 Skills 触发词方案兼容所有编辑器，效果等价，没有迁移必要。待 Copilot 跟进支持后再评估。

---

### L4 · CLI

#### 当前能力

| 命令 | 功能 |
|------|------|
| `init` | 全量安装 + 多编辑器配置 + MCP 配置 |
| `update` | 增量更新（MD5 比对，保护 reports/） |
| `clean` | 移除 AI 文件（保留 components + types） |
| `--dry-run` | 预览模式（全命令通用） |
| `--keep-reports` | clean 时保留 reports/ |

#### 值得做的扩展

| 命令 | 价值点 | 优先级 |
|------|--------|--------|
| `wl-skills check` | 一键环境预检：Node 版本 / 工具链 / env.local.json 填写状态 / MCP server 能否连通。新成员接手项目第一步就跑这个，比手动排查省 30 分钟 | P0 |
| `wl-skills diff` | 比对业务项目已安装文件与最新 kit 版本的差异，输出"哪些 Skill/规范有更新"清单，让 `update` 决策有据可依 | P0 |
| `wl-skills export` | 把 `reports/SYS_MENU_INFO.md` + `SYS_DICT_INFO.md` 导出为 Excel（`xlsx` 包已在 devDependencies）。产品/后端需要菜单字典清单时直接给文件，不再截图或手抄 | P1 |
| `wl-skills validate` | 无 AI、纯静态扫描 `src/views/`：检查每个模块是否有完整 4 文件（data.ts / index.vue / index.scss / api.md），缺失直接列出。适合 CI 阶段快速卡门 | P1 |

---

### L5 · Agent Pipeline

> 从"人触发每一步"到"AI 自主串联多步"

#### 实现难度与成本

**难度**：低到中。不需要新框架——Cursor / Copilot 的 Agent 模式 + 长上下文已经支持多步骤自主执行。核心工程量是**写好 `_pipeline.md` 协议文件**，定义每个 Skill 的输入输出契约和推荐后续动作。

**Token 成本**：比单次 Skill 高 2-3 倍（上下文需要保持连续），但比目前人工多轮触发的总消耗低很多。批量处理时收益最明显。

**当前阻碍**：Skill 间没有状态传递协议。prototype-scan 的输出（页面清单）需要人工告诉 api-contract 去读哪个文件——这一步人工传递就是流水线缺失的根因。

#### 核心设计：`_pipeline.md` 协议

```
新增：files/.github/skills/_pipeline.md

每个 Skill 声明标准 I/O 契约：

  prototype-scan
    output_file: reports/PROTOTYPE_SCAN_*.md
    next_suggest: api-contract（可批量触发，每页一次）

  api-contract
    input_from: prototype-scan output 或用户口述
    output_file: src/views/**/api.md
    next_suggest: page-codegen

  page-codegen
    input_from: api-contract output
    output_files: 4文件 + SYS_MENU_INFO.md 追加
    next_suggest: convention-audit → [menu-sync, dict-sync]（并行可选）

  convention-audit
    input_from: 任意 .vue / data.ts 文件
    output_file: reports/AUDIT_*.md
    next_suggest: code-fix（有 P0 偏差时）
```

有了这个协议，AI 完成一步后主动提示"下一步建议执行 xxx"，用户确认即可——不强制自动执行，保留人的 review 节点。

#### 流程灵活性（重要）

Pipeline 不是强制线性流水线，**可组合、可拆开、任一步骤可单独触发**：

```
完整流程（有原型文档时）：
  prototype-scan → api-contract → page-codegen → convention-audit → menu-sync

跳过原型（直接口述需求时）：
  [口述] → page-codegen → convention-audit → menu-sync

只需要审计现有代码：
  convention-audit → code-fix（如有偏差）

只需要同步字典：
  dict-sync（独立运行，不依赖其他 Skill）

哪步结果不满意，重跑哪步：
  api-contract（重新生成接口约定）→ page-codegen（重新生成代码）
```

---

### L6 · Multi-Agent 协同

**实现难度**：高。需要 Agent 编排框架（AutoGen / LangGraph 或编辑器 Agent 模式串联），上下文隔离设计，以及 Agent 间通信协议。Token 消耗是单 Agent 的 3-5 倍。

**适用场景**：20 个页面以上的批量生成，单 AI 上下文装不下时才有必要。

**当前结论**：L5 跑通后的自然演进，现阶段不主动规划。

---

### L7 · 自演化体系（Self-Evolving）

> 终极形态——AI 的产出反哺体系自身，形成精度持续提升的正向飞轮

#### 飞轮模型

```
高质量生成代码（page-codegen）
        │
        ▼ [template-extract] 提炼为新领域模板
        │
        ▼ 人工 review → 合并到 files/
        │
        ▼ kit 升级发布（npx 即可获取）
        │
        ▼ 下次生成精度更高 ──────────────┐
                                         │（循环）
convention-audit 报告积累                │
        │                                │
        ▼ 偏差统计（哪条规范最常被违反） │
        │                                │
        ▼ 规范权重调整 → Skill 描述强化  │
        │                                │
        └────────────────────────────────┘
```

#### 落地所需条件

当以下条件**同时具备**时，可以启动 L7 规划：

| 条件 | 说明 | 当前状态 |
|------|------|----------|
| L5 Pipeline 稳定运转 | Skill 链式触发已常态化，产出量足够大 | ⏳ 未达到 |
| 审计报告数量 ≥ 50 份 | 有足够的偏差样本做统计 | ⏳ 积累中 |
| 模板提取 ≥ 3 次成功 | template-extract 流程验证可靠 | ⏳ 未达到 |
| 跨项目质量数据汇总 | 单项目偏差不足以发现系统性问题 | ⏳ 需 v4.0 基础设施 |

#### 技术路径（届时参考）

```
短期飞轮（L5 稳定后即可启动）：
  模式触发：同类页面出现 ≥ 5 次 → 自动推荐 template-extract
  规范强化：某偏差出现 ≥ 3 次 → 对应 SKILL.md Pre-flight 加重警告

中期飞轮（v4.0 基础设施就绪后）：
  质量数据库：convention-audit 报告结构化入库，跨项目聚合
  规范自动建议：AI 分析高频偏差 → 生成规范修订草稿 → 人工 review 合并

长期飞轮（AI 能力充分成熟后）：
  模板自动生成：AI 直接从代码库提炼新模板，人工只做 review
  规范冲突检测：新规范与现有规范的逻辑冲突由 AI 自动发现
```

**与当前项目的关系**：`template-extract` Skill + `convention-audit` 报告积累机制已经是这个飞轮的雏形——L7 不是全新建设，是现有机制的系统性放大。

---

## 3. 当前项目架构优势

**单一数据源贯穿全体系**：`copilot-instructions.md` 是规范源，`_registry.md` 是触发词源，`_index.md` 是模板源，`editors.json` 是编辑器源。修改一处全员同步，结构上无法产生不一致。

**token 三层优化**：规范懒加载（`standards/index.md` 任务映射）+ 触发词精准路由 + 静态文档文件直接引用代替实时请求，三层叠加削减无效 token。

**防污染机制完整**：`reports/` 追加不覆盖 + `--keep-reports` 保护 + `clean` 保留 `components/types` + `update` MD5 比对——生产数据和 AI 指令文件彻底分离，误操作代价极低。

**可观测性**：每个 Skill 强制输出 Pre-flight 声明，列出已读文件和工具链状态。AI 没有读规范、没有检测工具链，一眼可见，不依赖盲目信任。

**npm 包机制精准**：`files/` 精确映射业务项目结构，`kit-internal/` 完全隔离，维护者和使用者关注点零交叉。

---

## 4. 冗余与待清理内容

### 已完成

| 操作 | 状态 |
|------|------|
| `docs/mcp建议.md` 归档到 `kit-internal/history/` | ✅ 已执行 |
| `kit-internal/architecture.md` 悬挂的 `migration-v1-to-v2.md` 引用 | ✅ 已修复 |

### 待处理

| 位置 | 问题 | 建议 |
|------|------|------|
| _无_ | 截至 v2.3.6，已无遗留过期描述需要处理 | — |

---

## 5. 架构升级路线图

### 当前位置

```
✅  L1 提示词工程   — copilot-instructions + standards 懒加载
✅  L2 Skills        — 9 个 Skill 全部启用，pre-flight，registry，模板分层
✅  L3 MCP           — 10 个 Tool（菜单+字典+角色+授权+动作），4 编辑器自动配置
✅  L4 CLI           — init / update / clean
▶   L5 Agent Pipeline — 下一个突破点
⏳  L6 Multi-Agent   — L5 稳定后再看
🔭  L7 自演化体系   — 条件就绪后规划（见第 2 节 L7 落地条件）
```

### v2.4（近期）：夯实 L3/L4

```
L3 MCP：
  ✦ wls_code_scan 实现（P0）
    — 消除 convention-audit / prototype-scan 的目录猜测
    — 独立可用：任何需要"扫描项目结构"的场景都能调

  ✦ wls_route_check 实现（P1）
    — menu-sync 完成后可自动触发，也可单独运行
    — 降级：无此工具时用户手动检查 pages.ts，不阻断流程

  ✦ wls_git_log_extract 实现（P1）
    — changelog-gen Skill 的数据源，也可单独提取 commit 摘要

  ✦ wls_audit_report_push 飞书 webhook 预留（P2）
    — env.local.json 增加可选 feishu_webhook 字段
    — 未配置静默跳过，不影响其他工具

L4 CLI：
  ✦ wl-skills check（P0）
    — 新成员接入、排查 MCP 问题的第一工具

  ✦ wl-skills diff（P0）
    — update 前先知道哪些文件有变化

  ✦ wl-skills export（P1）
    — 导出菜单/字典 Excel，用 devDependencies 中已有的 xlsx 包

  ✦ wl-skills validate（P1）
    — 静态扫描 src/views/ 的 4 文件完整性，CI 阶段可用

L2 Skills（精度提升）：
  ✦ page-codegen + convention-audit 补充"❌ 错误示范"反例段落
  ✦ sale 域专属模板（从 demo/sale/domestic-trade-order 提取）
```

### v3.0（中期）：进入 L5

```
  ✦ 新增 files/.github/skills/_pipeline.md（Skill 间 I/O 协议）
    — 定义每个 Skill 的 input / output_file / next_suggest 契约
    — AI 完成一步后主动提示后续动作，用户确认触发

  ✦ MCP Resources 原语（按需）
    — 仅当内部 Swagger 频繁变更时引入
    — 静态文档继续用文件引用，不强制升级

  ✦ 多语言适配层破冰
    — copilot-instructions.md 拆分 base.md + vue3-adapter.md
    — CLI 支持 --framework 参数预留
```

### v4.0（远期）：企业级平台

```
  ✦ 规范版本化（每条 standard 有 semver，支持团队 override）
  ✦ 模板市场（贡献 → review → 发布流程）
  ✦ CI/CD 集成（PR 自动 convention-audit，偏差可配置阻断）
  ✦ 跨项目质量数据汇总（哪条规范最常被违反）
```

---

## 6. 关键指标目标

| 指标 | 现状 | v2.4 目标 | v3.0 目标 |
|------|------|-----------|-----------|
| 模板命中率 | ~85% | 92% | 97% |
| 规范符合率（audit 无 P0 偏差） | ~75% | 88% | 93% |
| 单页面全流程耗时 | ~30 min | ~15 min | ~8 min |
| 10 页面批量耗时 | ~5 h | ~2 h | ~30 min |
| 新成员接入配置耗时 | ~60 min | ~15 min（check 引导） | ~10 min |

---

## 附：能力矩阵速查

```
              L0氛围  L1提示词  L2 Skills  L3 MCP    L4 CLI    L5 Pipeline
规范持久化     ✗       △         ✅         ✅         ✅         ✅
实时 I/O       ✗       ✗         ✗          ✅         △         ✅
副作用执行     ✗       ✗         ✗          ✅         ✅         ✅
跨会话一致     ✗       △         ✅         ✅         ✅         ✅
Token 效率     ✗       △         ★★★       ★★★★     N/A        ★★★★
自动化程度     ✗       ✗         △（人触）  △（人触）  ✅         ✅（半自动）
批量处理       ✗       ✗         △          △          ✅         ✅
可审计性       ✗       ✗         ✅         ✅         ✅         ✅
企业级适用     ✗       ✗         ✅         ✅         ✅         ✅
```














# Skills 注册表（单一数据源）

> 触发词 → SKILL 路径的唯一映射。所有 AI 编辑器/模型从此处查路由，**禁止在其他文件重复定义触发词**。

---

## 目录分级（v2.0+）

```
skills/
├── _registry.md         ← 本文件
├── _compat/             多 AI 编辑器适配（配置 + 注入逻辑）
│
├── core/                核心通用 Skill（任何前端业务项目通用）
│   ├── prototype-scan/
│   ├── api-contract/
│   ├── page-codegen/
│   ├── convention-audit/
│   ├── business-doc-extract/
│   └── template-extract/
│
├── sync/                数据同步类（与后端联动）
│   ├── menu-sync/
│   ├── dict-sync/
│   └── permission-sync/  ✅ v2.3.6 激活
│
├── ops/                 运维/构建类
│   └── code-fix/
│
└── domain/              领域专属 Skill（按域扩展，初始为空）
```

> **扩展策略**：
>
> - Skill 数 ≤ 15 个：留在本仓库分子目录管理
> - Skill 数 > 15 或出现领域强相关 Skill 集群：拆为独立 npm 包（如 `@agile-team/wl-skills-produce`），主包仅保留 core/sync/ops

---

## 启用 Skill 路由表

| Skill 名         | 状态    | 路径                                    | MCP 工具依赖                                                                                                              | 触发关键词                                                                                                                              |
| ---------------- | ------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| prototype-scan   | ✅ 启用 | `skills/core/prototype-scan/SKILL.md`   | —                                                                                                                          | 扫描原型 / 解析原型 / 页面清单 / 详设文档 / 口述需求 / 建个页面 / 写个页面 / 根据截图 / 根据原型                                        |
| api-contract     | ✅ 启用 | `skills/core/api-contract/SKILL.md`     | —                                                                                                                          | 接口约定 / api.md / 字段定义 / 前后端对齐 / 接口设计                                                                                    |
| page-codegen     | ✅ 启用 | `skills/core/page-codegen/SKILL.md`     | `wls_validate_page` / `wls_doctor_ui`                                                                                      | 生成页面 / 创建页面 / 代码生成 / vue页面 / 按原型生成 / 帮我生成 / 列表页 / 管理页 / 台账 / mock / 假数据 / 先能跑 / AGGrid / skills-ui |
| convention-audit | ✅ 启用 | `skills/core/convention-audit/SKILL.md` | `wls_code_scan` / `wls_audit_report_push`                                                                                  | 规范审计 / 代码审计 / 规范检查 / 对齐规范 / 规范偏差 / 接手新项目 / 存量代码分析 / 项目体检                                             |
| business-doc-extract | ✅ 启用 | `skills/core/business-doc-extract/SKILL.md` | —                                                                                                                          | **语义级触发，不依赖固定关键词**：用户提供原型 / 详设 / 字段或字典资料 / 现有页面 + api.md，且意图为业务梳理 / 模块沉淀 / 字段字典维护 / 待确认事项整理时触发；碎片化问答、单截图、小修小改默认不触发 |
| template-extract | ✅ 启用 | `skills/core/template-extract/SKILL.md` | —                                                                                                                          | 提取模板 / 抽取模板 / 沉淀模板 / 模板贡献                                                                                               |
| menu-sync        | ✅ 启用 | `skills/sync/menu-sync/SKILL.md`        | `wls_menu_sync_from_report` / `wls_menu_query` / `wls_menu_upsert`                                                         | 创建菜单 / 注册菜单 / 同步菜单 / 补菜单 / 页面点击进不来 / 菜单打不开                                                                   |
| dict-sync        | ✅ 启用 | `skills/sync/dict-sync/SKILL.md`        | `wls_dict_query` / `wls_dict_upsert`                                                                                       | 同步字典 / 创建字典 / 刷新字典基线 / 字典对比 / 字典审计                                                                                |
| permission-sync  | ✅ 启用 | `skills/sync/permission-sync/SKILL.md`  | `wls_role_query` / `wls_role_upsert` / `wls_assignable_menus_query` / `wls_role_assign_menus` / `wls_action_query` / `wls_action_upsert` | 创建角色 / 角色管理 / 角色授权 / 给角色分配菜单 / 挂动作 / 添加动作按钮 / 同步权限 / 权限码注册                                         |
| code-fix         | ✅ 启用 | `skills/ops/code-fix/SKILL.md`          | —                                                                                                                          | 自动修复 / 整改偏差 / 修复报告 / 规范整改 / 修复偏差 / code fix                                                                         |

> **MCP 工具依赖说明**：sync 类 Skill 必须通过列出的 MCP 工具执行。工具不可用或返回错误时，遵循 `skills/sync/_mcp-guardrail.md` §2 自愈剧本（引导用户完善 `env.local.json` 后重试），**不允许** AI 用 curl/PowerShell/fetch 等绕开 MCP。

---

## 调度规则

1. **首先加载** `_best-practices.md`（场景索引，语义级路由依据），结合用户意图判断属于哪个场景
2. 按场景指向的 Skill，`read_file` 加载对应 SKILL.md
3. SKILL.md 中标注的 `必读 standards` 按 `standards/index.md` 任务类型映射加载
4. sync 类（菜单/字典/权限）任务必须额外加载 `skills/sync/_mcp-guardrail.md`
5. 如用户表达连续交付/智能体/全流程意图，同时读取 `_pipeline.md` 获取 Skill I/O 与 `next_suggest`
6. 在 SKILL.md 指示下输出 **Pre-flight 声明**（强制约定式输出）
7. 页面生成任务必须额外读取 `standards/12-base-table.md`，并执行 `BaseTable + render-type="agGrid" + cid + defineColumns + renderOps` 硬约束
8. 若消息包含"风格 / skills-ui / 状态标签 / 操作列 / AGGrid"，同时建议运行 `wl-skills doctor-ui`
9. `business-doc-extract` 不依赖关键词匹配，AI 必须按 `资料源 + 意图 + 范围` 三因素自行判断；缺资料时先询问用户提供原型/详设/字段资料路径，不要凭推断写入 `docs/business`

---

## 多触发词时的优先级

当用户消息同时匹配多个 Skill 时（如"扫描原型并生成页面"）：

1. 优先识别**完整流水线意图**：读取 `_pipeline.md`，按 `prototype-scan` → `api-contract` → `page-codegen` → `convention-audit` → sync/ops 的顺序建议下一步
2. 否则按**最具体的触发词**匹配单个 Skill
3. 用户明确指定时（如"只扫描，不生成"），按用户指示

---

## 配套人读文档

每个启用 Skill 同目录下都有 `USAGE.md`：

| 文件            | 读者                      | 用途                                                     |
| --------------- | ------------------------- | -------------------------------------------------------- |
| `SKILL.md`      | AI 编辑器/模型            | 触发规则、流程步骤、Pre-flight 声明                      |
| `USAGE.md`      | 团队成员                  | 示例对话、踩坑、FAQ、快速上手                            |
| `_pipeline.md`  | AI 编辑器/模型 + 团队成员 | Skill 间 I/O 契约、next_suggest、Agent Pipeline 调度协议 |
| `*.MAINTAIN.md` | kit 维护者                | 维护要点（在 `kit-internal/skills/` 目录）               |

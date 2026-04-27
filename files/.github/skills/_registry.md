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
│   └── template-extract/
│
├── sync/                数据同步类（与后端联动）
│   ├── menu-sync/
│   ├── dict-sync/
│   └── permission-sync/  [PLANNED]
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

| Skill 名         | 状态       | 路径                                         | 触发关键词                                                                 |
| ---------------- | ---------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| prototype-scan   | ✅ 启用    | `skills/core/prototype-scan/SKILL.md`        | 扫描原型 / 解析原型 / 页面清单 / 详设文档 / 口述需求 / 建个页面 / 写个页面 |
| api-contract     | ✅ 启用    | `skills/core/api-contract/SKILL.md`          | 接口约定 / api.md / 字段定义 / 前后端对齐 / 接口设计                       |
| page-codegen     | ✅ 启用    | `skills/core/page-codegen/SKILL.md`          | 生成页面 / 创建页面 / 代码生成 / vue页面 / 按原型生成 / 帮我生成           |
| convention-audit | ✅ 启用    | `skills/core/convention-audit/SKILL.md`      | 规范审计 / 代码审计 / 规范检查 / 对齐规范 / 规范偏差 / 接手新项目 / 存量代码分析 / 项目体检 |
| template-extract | ✅ 启用    | `skills/core/template-extract/SKILL.md`      | 提取模板 / 抽取模板 / 沉淀模板 / 模板贡献                                  |
| menu-sync        | ✅ 启用    | `skills/sync/menu-sync/SKILL.md`             | 创建菜单 / 注册菜单 / 同步菜单 / 补菜单                                    |
| dict-sync        | ✅ 启用    | `skills/sync/dict-sync/SKILL.md`             | 同步字典 / 创建字典 / 刷新字典基线 / 字典对比 / 字典审计                           |
| permission-sync  | ⏳ PLANNED | `skills/sync/permission-sync/SKILL.draft.md` | （草稿，不参与调度）                                                       |
| code-fix         | ✅ 启用    | `skills/ops/code-fix/SKILL.md`               | 自动修复 / 整改偏差 / 修复报告 / 规范整改 / 修复偏差 / code fix               |

---

## 调度规则

1. AI 收到用户消息 → 匹配上表 `触发关键词` → `read_file` 加载 `路径` 列对应的 SKILL.md
2. SKILL.md 中标注的 `必读 standards` 按 `standards/index.md` 任务类型映射加载
3. 在 SKILL.md 指示下输出 **Pre-flight 声明**（强制约定式输出）

---

## 多触发词时的优先级

当用户消息同时匹配多个 Skill 时（如"扫描原型并生成页面"）：

1. 优先识别**完整流水线意图**：触发 `prototype-scan` → 串接 `api-contract` → 串接 `page-codegen` → 串接 `menu-sync`
2. 否则按**最具体的触发词**匹配单个 Skill
3. 用户明确指定时（如"只扫描，不生成"），按用户指示

---

## 配套人读文档

每个启用 Skill 同目录下都有 `USAGE.md`：

| 文件            | 读者           | 用途                                       |
| --------------- | -------------- | ------------------------------------------ |
| `SKILL.md`      | AI 编辑器/模型 | 触发规则、流程步骤、Pre-flight 声明        |
| `USAGE.md`      | 团队成员       | 示例对话、踩坑、FAQ、快速上手              |
| `*.MAINTAIN.md` | kit 维护者     | 维护要点（在 `kit-internal/skills/` 目录） |

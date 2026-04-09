# @agile-team/wl-skills-kit

**AI Skill 模板包** — 一条命令，将 AI 编码指令、组件文档、通用组件、领域样例导入到你的 Vue 3 前端项目。

让 AI（Copilot / Cursor / Windsurf 等）**直接理解你的项目规范和组件体系**，从 Axure 原型 / 详细设计文档 → 生成可运行的完整页面代码。

---

## 快速开始

```bash
# 在你的项目根目录执行（无需安装，直接运行）
npx @agile-team/wl-skills-kit

# 预览将写入哪些文件（不实际写入）
npx @agile-team/wl-skills-kit --dry-run

# 更新到最新版
npx @agile-team/wl-skills-kit@latest
```

就这样。108 个文件按原始路径导入到你的项目，**无其他副作用**。

---

## 导入了什么？

执行后你的项目会新增以下内容：

```
你的项目/
├── .github/
│   ├── copilot-instructions.md          ← AI 自动加载的编码规范（项目总纲）
│   ├── skills/                          ← 5 个 AI Skill
│   │   ├── prototype-scan/SKILL.md      ←   ① 原型扫描（Axure HTML / 详设文档 → page-spec JSON）
│   │   ├── api-contract/SKILL.md        ←   ② 接口约定（page-spec → api.md）
│   │   ├── page-codegen/               ←   ③ 页面代码生成
│   │   │   ├── SKILL.md                ←     主规则文件（约束 + 规范）
│   │   │   ├── TPL-LIST.md             ←     标准列表页模板
│   │   │   ├── TPL-FORM-ROUTE.md       ←     复杂表单独立路由模板
│   │   │   ├── TPL-MASTER-DETAIL.md    ←     主从表模板
│   │   │   ├── TPL-TREE-LIST.md        ←     左树右列表模板
│   │   │   ├── TPL-DETAIL-TABS.md      ←     详情 Tab + 子表模板
│   │   │   ├── TPL-CHANGE-HISTORY.md   ←     变更历史比对模板
│   │   │   ├── TPL-RECORD-FORM.md      ←     录入型实绩页模板
│   │   │   ├── TPL-OPERATION-STATION.md←     工序操作站模板
│   │   │   └── TPL-DRIVEN.md           ←     配置驱动模板识别参考
│   │   ├── menu-sync/SKILL.md           ←   ④ 菜单同步（pages.ts → 后端菜单表）
│   │   └── convention-extract/SKILL.md  ←   ⑤ 规范审计（用规范审计代码，输出偏差报告）
│   └── docs/                            ← 设计文档
│       ├── use-skill.md                 ←   Skill 使用 + 移植一站式指南
│       ├── menu-sync-design.md          ←   菜单同步方案设计
│       ├── SYS_MENU_INFO.md             ←   菜单注册记录模板
│       └── wl-skills-kit.md             ←   本包详细设计文档
│
├── docs/                                ← 12 个平台组件 API 文档
│   ├── request.md                       ←   getAction / postAction 等 HTTP 工具
│   ├── page-query-hook-best-practices.md ←  AbstractPageQueryHook 最佳实践
│   ├── jh-select.md                     ←   下拉选择组件
│   ├── jh-date.md / jh-date-range.md    ←   日期 / 日期范围选择
│   ├── jh-drag-row.md                   ←   上下分栏拖拽组件
│   ├── jh-pagination.md                 ←   分页组件
│   ├── jh-file-upload.md                ←   文件上传
│   ├── jh-text.md                       ←   文本翻译
│   ├── jh-picker.md                     ←   通用选择器
│   ├── jh-user-picker.md                ←   用户选择器
│   └── jh-dept-picker.md                ←   部门选择器
│
├── src/
│   ├── components/
│   │   ├── global/                      ← 6 个全局自动注册组件
│   │   │   ├── C_Splitter/              ←   左右分割面板
│   │   │   ├── C_Tree/                  ←   带搜索的树形面板
│   │   │   ├── C_TagStatus/             ←   状态标签（彩色 Tag）
│   │   │   ├── C_ParentView/            ←   父级视图容器
│   │   │   ├── C_SvgIcon/               ←   SVG 图标
│   │   │   └── C_RightToolbar/          ←   右侧工具栏
│   │   ├── local/                       ← 4 个按需导入组件
│   │   │   ├── c_formModal/             ←   通用表单弹窗（add/edit/view 三模式）
│   │   │   ├── c_formSections/          ←   表单分区组件
│   │   │   ├── c_listModal/             ←   列表选择弹窗
│   │   │   └── c_spliterTitle/          ←   分栏标题
│   │   └── remote/                      ← 5 个远程组件 README（API 文档）
│   │       ├── BaseQuery/               ←   声明式查询区
│   │       ├── BaseTable/               ←   声明式表格
│   │       ├── BaseToolbar/             ←   声明式工具栏
│   │       ├── BaseForm/                ←   声明式表单
│   │       └── AGGrid/                  ←   高性能数据网格
│   └── types/
│       └── page.ts                      ← 类型桶文件（统一 re-export）
│
└── demo/                                ← 13 个领域样例页面（AI 学习 + 开发参考）
    ├── README.md                        ←   样例索引 + 模板类型标注
    ├── produce/aiflow/                  ←   生产域 8 个页面
    │   ├── mmwr-customer-archive/       ←     LIST + Tabs + c_formModal
    │   ├── mmwr-temp-customer-archive/  ←     LIST
    │   ├── mmwr-customer-apply-add/     ←     LIST
    │   ├── mmwr-customer-apply-add-form/←     FORM_ROUTE
    │   ├── mmwr-customer-apply-change/  ←     LIST
    │   ├── mmwr-customer-apply-change-form/ ← FORM_ROUTE
    │   ├── mmwr-customer-apply-change-history/ ← CHANGE_HISTORY
    │   └── mmwr-customer-detail/        ←     DETAIL_TABS
    └── sale/demo/                       ←   销售域 5 个页面
        ├── domestic-trade-order/        ←     LIST 标准列表
        ├── metallurgical-spec/          ←     MASTER_DETAIL 上下分栏
        ├── add-demo/                    ←     FORM_ROUTE 表单页
        ├── billet-flame-cut-plan/       ←     LIST 变体
        └── heat-batch-return/           ←     LIST + 自定义弹窗
```

---

## 核心价值：5 个 AI Skill

安装后，AI 编辑器自动识别这些 Skill，形成完整的**原型 → 代码**流水线：

```
  Axure 原型 / 详设文档
         │
         ▼
  ① prototype-scan ─── 扫描 → page-spec JSON（结构化页面描述）
         │
         ▼
  ② api-contract ───── 生成 → api.md（前后端接口约定）
         │
         ▼
  ③ page-codegen ───── 生成 → index.vue + data.ts + index.scss + api.md + mock
         │                     （4 文件/页 + pages.ts 注册 + mock 数据）
         ▼
  ④ menu-sync ──────── 同步 → 后端菜单表（AI 自动调 API 创建菜单）
                       
  ⑤ convention-audit    按需：用规范审计代码 → 偏差报告 + 整改建议
```

### 支持 9 种页面模板

| 模板 | 模式 | 说明 |
|------|------|------|
| TPL-LIST | LIST | 查询 + 工具栏 + 表格 + 分页 |
| TPL-FORM-ROUTE | FORM_ROUTE | 复杂表单（多 Tab、多子表）独立路由 |
| TPL-MASTER-DETAIL | MASTER_DETAIL | jh-drag-row 上下分栏主从表 |
| TPL-TREE-LIST | TREE_LIST | C_Splitter 左树 + 右列表 |
| TPL-DETAIL-TABS | DETAIL_TABS | 上方表单 + 下方 Tab 子表 |
| TPL-CHANGE-HISTORY | CHANGE_HISTORY | 左变更时间线 + 右字段比对 |
| TPL-RECORD-FORM | RECORD_FORM | 查询 + 表单录入（无分页） |
| TPL-OPERATION-STATION | OPERATION_STATION | 待处理 + 已处理联动操作 |
| TPL-DRIVEN | TEMPLATE_DRIVEN | 配置驱动模板页识别参考 |

---

## 使用方式

### 方式一：完整流程（Axure 原型 → 代码）

> 最推荐。一个模块 5-8 个页面，约 5-10 分钟出完整代码。

**对 AI 说**：

```
帮我扫描 C:\Users\xxx\原型包\ 下的所有HTML
```

AI 自动执行 5 步：扫描 → 生成接口约定 → 生成页面代码 → 注册路由 → 创建菜单。

### 方式二：详设文档 → 代码（更高精度）

**对 AI 说**：

```
按照这份详设文档帮我生成页面

## 前置声明
- 业务域/模块：生产 > 生产棒线材 > AI流程
- 服务前缀：/mmwr/
- 页面清单：客户档案、临时客户档案
```

详设文档中明确写出字段英文名和字典 code，精度可达 95-100%。

### 方式三：碎片化使用（按需调用单个 Skill）

| 你想做什么 | 对 AI 说 | 触发的 Skill |
|-----------|---------|-------------|
| 扫描原型，输出页面清单 | "扫描这些原型" | prototype-scan |
| 给页面生成接口文档 | "生成 api.md" | api-contract |
| 只生成单个页面代码 | "帮我生成客户档案页面" | page-codegen |
| 把 pages.ts 同步到菜单表 | "帮我创建菜单" | menu-sync |
| 审计项目代码是否合规 | "审计项目规范" / "规范检查" | convention-audit |
| 查看组件怎么用 | "jh-select 怎么用" | AI 读取 docs/jh-select.md |
| 参考样例写代码 | "参考 demo 里的客户档案" | AI 读取 demo/ 下的代码 |

### 方式四：新项目初始化

```bash
# 1. 创建项目后，导入 Skill 体系
npx @agile-team/wl-skills-kit

# 2. 对 AI 说 "提炼项目规范"
#    → 自动扫描你的代码生成 copilot-instructions.md

# 3. 改写 page-codegen 模板（替换基类、组件、API 调用方式）
#    → 详见 .github/docs/use-skill.md 第四章

# 4. 开始使用：发 Axure 原型给 AI
```

---

## 多编辑器 / AI 工具支持

安装后自动生成 **8 个编辑器配置文件**，内容统一来自 `copilot-instructions.md`（单一源头），确保所有 AI 工具读取到相同的项目规范。

### 各工具配置一览

| AI 工具 | 配置文件路径 | 规范加载 | Skill 自动调度 | 备注 |
|---------|-------------|---------|---------------|------|
| **GitHub Copilot** (VS Code) | `.github/copilot-instructions.md` | ✅ 自动 | ✅ 原生 Skill 识别 + 注册表双保险 | **主力工具，体验最完整** |
| **Cursor** | `.cursorrules` + `.cursor/rules/conventions.mdc` | ✅ 自动 | ✅ 通过注册表自动 `read_file` | `.mdc` 带 `alwaysApply: true` 前缀 |
| **Windsurf (Cascade)** | `.windsurfrules` | ✅ 自动 | ✅ 通过注册表自动 `read_file` | 规范内嵌调度指令 |
| **Kiro** | `.kiro/steering/conventions.md` | ✅ 自动 | ✅ 通过注册表自动 `read_file` | steering/ 下的 md 自动加载 |
| **Trae** | `.trae/rules/conventions.md` | ✅ 自动 | ✅ 通过注册表自动 `read_file` | rules/ 下的 md 自动加载 |
| **Claude Code / CLI** | `CLAUDE.md` | ✅ 自动 | ✅ 通过注册表自动 `read_file` | 也支持 `@import` 语法 |
| **Roo Code / Cline** | `.clinerules` | ✅ 自动 | ✅ 通过注册表自动 `read_file` | 支持 tool_use 读文件 |
| **AGENTS.md 兼容** | `AGENTS.md` | ✅ 自动 | ✅ 通过注册表自动 `read_file` | Linux Foundation 通用标准，兜底 |

### Skill 自动调度机制（v1.1.2+）

所有编辑器配置文件均由 `copilot-instructions.md` 生成，其中内嵌了 **Skills 自动调度注册表**。
该注册表以强制指令形式告知 AI：

1. **触发关键词匹配** — 用户说"生成页面"/"扫描原型"/"接口约定"等关键词时，AI 必须先 `read_file` 对应的 `SKILL.md`
2. **完整流水线** — 用户提供原型/详设并要求批量生成时，按 prototype-scan → api-contract → page-codegen → menu-sync 顺序依次执行
3. **单独使用** — 用户只说"帮我生成客户档案页面"时，只读取 page-codegen 的 SKILL.md，不必跑完整流水线

这意味着 **所有支持 `read_file` / tool_use 的 AI 工具都能自动调度 Skill**，无需手动引用。

> **总结**：v1.1.2 起，**编码规范 + Skill 调度** 均为全编辑器自动加载（零配置）。各工具唯一的区别仅在于原生 Skill 识别（Copilot 独有） vs 注册表驱动的 `read_file` 调度（通用）。

---

## 安装行为说明

| ✅ 会做                             | ❌ 不会做                    |
| ----------------------------------- | ---------------------------- |
| 写入 `.github/` `docs/` `src/` `demo/` | 不修改 `package.json`      |
| 已存在的同名文件会被覆盖           | 不修改 `node_modules/`       |
| 自动创建不存在的目录               | 不执行 postinstall           |
|                                     | 不删除任何文件               |

### 安全路径（不会被覆盖）

以下路径不在分发范围，本地修改永远安全：

```
.github/skills/my-domain-skill/   ← 自定义 Skill
.github/docs/my-domain-doc.md     ← 自定义文档
src/components/local/my_custom/    ← 自定义组件
src/views/                         ← 业务页面代码
mock/                              ← Mock 数据
```

---

## 注意事项

### 1. Skill 生成代码的前置依赖

AI 生成的代码依赖以下包，**首次使用前请确认已安装**：

```bash
# 核心依赖（项目大概率已有）
vue / vue-router / element-plus / @jhlc/common-core

# 易遗漏的依赖
pnpm add -D mockjs vite-plugin-mock    # Mock 数据支持
pnpm add lodash-es                      # RECORD_FORM 模板用到 debounce
pnpm add xlsx                           # 仅导出/导入功能需要
```

> ⚠️ `lodash` ≠ `lodash-es`，模板代码 import 的是 ESM 版 `lodash-es`，必须单独安装。

### 2. Vite 配置检查

确保 `vite.config.ts` 已注册 mock 插件：

```typescript
import { viteMockServe } from "vite-plugin-mock";
// plugins 中添加：
viteMockServe({ mockPath: "./mock", enable: command === "serve" })
```

### 3. 类型桶文件

`src/types/page.ts` 统一 re-export 以下类型，避免在 data.ts 中写长路径 import：

```typescript
import { AbstractPageQueryHook, BaseQueryItemDesc, ActionButtonDesc, TableColumnDesc, BusLogicDataType } from "@/types/page";
```

### 4. menu-sync 的 env.local.json

菜单同步需要网关地址和 Token，首次使用时按 `.github/skills/menu-sync/env/guide.md` 填写：

```
.github/skills/menu-sync/env/env.local.json  ← 本地维护，已 gitignore
```

### 5. 更新策略

```bash
# 拉取最新模板（会覆盖内置文件，不动安全路径）
npx @agile-team/wl-skills-kit@latest
```

- **通用改进** → 提 PR 到 wl-skills-kit 仓库，合并后所有项目受益
- **领域专有** → 放在安全路径下，永远不会被覆盖

---

## 技术栈适配

当前模板基于以下技术栈：

| 层面 | 技术 |
|------|------|
| 框架 | Vue 3.2 + Vite + TypeScript |
| UI | Element Plus + @jhlc/jh-ui + @jhlc/common-core |
| 状态 | Pinia |
| 样式 | Windi CSS + SCSS |
| 架构 | Module Federation 子应用 |
| 页面模式 | AbstractPageQueryHook 配置化驱动 |

> 移植到其他技术栈项目需改写 page-codegen 模板，详见 `.github/docs/use-skill.md` 第四章。

---

## 贡献

```bash
git clone git@github.com:ChenyCHENYU/wl-skills-kit.git
cd wl-skills-kit
# 修改 files/ 下的内容
npx . --dry-run    # 本地预览
# 提 PR → Review → 合并 → npm publish
```

### 可贡献内容

| 类型 | 路径 | 说明 |
|------|------|------|
| Skill 修复 | `files/.github/skills/` | 修正生成规则或模板 bug |
| 组件文档 | `files/docs/` | 新增或更新 jh-* 文档 |
| 领域样例 | `files/demo/{domain}/` | 各业务域贡献真实页面样例 |
| 通用组件 | `files/src/components/` | 新增可复用组件 |

---

## License

UNLICENSED — 内部使用，未授权外部分发。

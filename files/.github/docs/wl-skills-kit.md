# wl-skills-kit — AI Skill 模板包

> 统一维护、一键分发：AI 指令 + 组件文档 + 通用组件 + 领域样例。
> 安装即导入，无副作用，各项目通过 `npx @jhlc/wl-skills-kit` 同步更新。

---

## 一、定位

**wl-skills-kit** 是公司前端 AI 生态的基础设施包。

| 是什么                                   | 不是什么                            |
| ---------------------------------------- | ----------------------------------- |
| 文件模板包，安装后按目录结构导入项目     | 不是运行时依赖                      |
| AI 指令 + 文档 + 组件 + 样例的统一维护源 | 不修改 package.json / node_modules  |
| 各项目同步更新的唯一通道                 | 不执行 postinstall / 不删除任何文件 |

**一句话**：`npx @jhlc/wl-skills-kit` = 把模板文件复制到你的项目。完毕。

---

## 二、包目录结构

```
@jhlc/wl-skills-kit/
├── package.json                         ← name: "@jhlc/wl-skills-kit"
├── README.md
├── CHANGELOG.md
├── bin/
│   └── wl-skills.js                     ← CLI 入口（文件拷贝 + 进度提示）
│
└── files/                               ← 1:1 映射到目标项目根目录
    │
    ├── .github/                         ← ① AI 指令（核心）
    │   ├── copilot-instructions.md      ←   项目规范总纲
    │   ├── skills/
    │   │   ├── prototype-scan/SKILL.md  ←   原型扫描
    │   │   ├── api-contract/SKILL.md    ←   接口约定
    │   │   ├── page-codegen/            ←   页面代码生成
    │   │   │   ├── SKILL.md             ←     主规则（~825 行）
    │   │   │   └── TPL-*.md             ←     9 个模板（LIST / FORM-ROUTE / MASTER-DETAIL /
    │   │   │                                   TREE-LIST / DETAIL-TABS / CHANGE-HISTORY /
    │   │   │                                   RECORD-FORM / OPERATION-STATION / DRIVEN）
    │   │   ├── menu-sync/
    │   │   │   ├── SKILL.md             ←   菜单同步
    │   │   │   └── env/guide.md         ←   env.local.json 配置说明（json 本身不分发）
    │   │   └── convention-extract/SKILL.md ← 规范提炼
    │   └── docs/
    │       ├── use-skill.md             ←   使用 + 移植一站式指南
    │       ├── menu-sync-design.md      ←   菜单同步方案设计
    │       ├── SYS_MENU_INFO.md         ←   菜单注册记录模板
    │       └── wl-skills-kit.md         ←   本文档
    │
    ├── docs/                            ← ② 组件文档（12 个 md）
    │   ├── request.md                   ←   HTTP 请求工具
    │   ├── page-query-hook-best-practices.md
    │   ├── jh-select.md / jh-date.md / jh-date-range.md
    │   ├── jh-drag-row.md / jh-pagination.md / jh-file-upload.md
    │   └── jh-text.md / jh-user-picker.md / jh-dept-picker.md / jh-picker.md
    │
    ├── src/
    │   ├── components/                  ← ③ 通用组件
    │   │   ├── global/                  ←   C_Splitter / C_Tree / C_TagStatus
    │   │   │                                 C_ParentView / C_SvgIcon / C_RightToolbar
    │   │   ├── local/                   ←   c_formModal / c_formSections
    │   │   │                                 c_listModal / c_spliterTitle
    │   │   └── remote/                  ←   BaseQuery / BaseTable / BaseToolbar
    │   │                                     BaseForm / AGGrid（仅 README）
    │   └── types/page.ts               ← ④ 类型桶文件
    │
    └── demo/                            ← ⑤ 领域样例（AI 学习 + 开发参考）
        ├── README.md                    ←   样例索引 + 模板类型标注
        ├── produce/
        │   └── aiflow/                  ←   生产域 8 个页面
        │       ├── mmwr-customer-archive/              ← LIST + Tabs + c_formModal
        │       ├── mmwr-temp-customer-archive/         ← LIST
        │       ├── mmwr-customer-apply-add/            ← LIST
        │       ├── mmwr-customer-apply-add-form/       ← FORM_ROUTE
        │       ├── mmwr-customer-apply-change/         ← LIST
        │       ├── mmwr-customer-apply-change-form/    ← FORM_ROUTE
        │       ├── mmwr-customer-apply-change-history/ ← CHANGE_HISTORY
        │       └── mmwr-customer-detail/               ← DETAIL_TABS
        └── sale/
            └── demo/                    ←   销售域 5 个页面（平台默认样例）
                ├── domestic-trade-order/               ← LIST 标准列表
                ├── metallurgical-spec/                 ← MASTER_DETAIL 上下分栏
                ├── add-demo/                           ← FORM_ROUTE（c_formSections）
                ├── billet-flame-cut-plan/              ← LIST 变体
                └── heat-batch-return/                  ← LIST + 自定义弹窗
```

> `files/` 下所有内容按原始路径写入项目根目录。**仅此而已，无其他逻辑。**

### 不分发的内容

| 路径                                        | 原因                                     |
| ------------------------------------------- | ---------------------------------------- |
| `src/components/template/*`                 | 高阶封装，v2.0 稳定后再纳入              |
| `src/components/local/c_customerTabs/`      | 客户域专用                               |
| `src/components/local/c_applyDetailDialog/` | 客户域专用                               |
| `src/components/local/c_actionModal/`       | 客户域专用                               |
| `menu-sync/env/env.local.json`              | 含 Token，各项目本地维护（已 gitignore） |

---

## 三、使用方式

```bash
# 安装 / 初始化（首次）
npx @jhlc/wl-skills-kit

# 同步更新（拉取最新模板）
npx @jhlc/wl-skills-kit@latest

# 预览变更（不写入，仅输出文件列表）
npx @jhlc/wl-skills-kit --dry-run
```

| ✅ 做什么                      | ❌ 不做什么          |
| ------------------------------ | -------------------- |
| 写入 .github/ docs/ src/ demo/ | 不修改 package.json  |
| 覆盖同名文件                   | 不修改 node_modules/ |
| 创建不存在的目录               | 不执行 postinstall   |
|                                | 不删除任何文件       |

### 安全路径（不会被覆盖）

以下路径不在分发范围内，本地修改永远安全：

```
.github/skills/my-domain-skill/   ← 自定义 Skill（非内置名）
.github/docs/my-domain-doc.md     ← 自定义文档
src/components/local/my_custom/    ← 自定义组件
src/views/                         ← 业务页面
mock/                              ← Mock 数据
```

| 修改类型 | 做法                                                |
| -------- | --------------------------------------------------- |
| 通用改进 | **提 PR 到 wl-skills-kit 仓库**，合并后所有项目受益 |
| 领域专有 | 放在上述安全路径，不会被覆盖                        |

---

## 四、多编辑器支持

v1.0 聚焦 **GitHub Copilot**（`.github/` 目录即完整配置）。

v1.1 规划：将各编辑器配置**预生成**并包含在 `files/` 中（发布前由开发脚本从 `.github/` 源转换，安装时原样拷贝，**无运行时转换逻辑**）。

| 编辑器             | 配置路径                                       | 状态    |
| ------------------ | ---------------------------------------------- | ------- |
| **GitHub Copilot** | `.github/copilot-instructions.md` + `skills/`  | ✅ v1.0 |
| **Cursor**         | `.cursor/rules/*.mdc`                          | 🔜 v1.1 |
| **Windsurf**       | `.windsurf/rules/*.md`                         | 🔜 v1.1 |
| **Kiro**           | `.kiro/steering/*.md`                          | 🔜 v1.1 |
| **Trae**           | `.trae/rules/*.md`                             | 🔜 v1.1 |
| **Claude Code**    | `CLAUDE.md`                                    | 🔜 v1.1 |
| **Roo / Cline**    | `.clinerules`                                  | 🔜 v1.1 |
| **AGENTS.md**      | `AGENTS.md`（Linux Foundation 标准，通用兜底） | 🔜 v1.1 |

> **原则**：AGENTS.md 是跨工具兜底标准，新工具出来大概率支持它。

---

## 五、发布策略

| 方式                 | 场景        | 命令                                                 |
| -------------------- | ----------- | ---------------------------------------------------- |
| **npm 公有**（优先） | 公开发布    | `npm publish --access public`                        |
| **私有 npm**（备选） | 内网团队    | `npm config set @jhlc:registry http://npm.nisco.cn/` |
| **Git 直装**         | 无 npm 仓库 | `npx git+http://git.nisco.cn/PSQF/wl-skills-kit.git` |
| **离线 tgz**         | 隔离网络    | `npm pack` → `npx ./jhlc-wl-skills-kit-x.x.x.tgz`    |

---

## 六、贡献指南

### 可贡献内容

| 类型       | 示例                                | 贡献者         |
| ---------- | ----------------------------------- | -------------- |
| Skill 修复 | 修复 page-codegen 生成 bug          | 任何使用者     |
| 组件文档   | 新增 jh-xxx 文档                    | 平台组件开发者 |
| 领域样例   | `demo/{domain}/{submodule}/{page}/` | 各域开发者     |
| 通用组件   | 新增 c_xxxModal                     | 架构组         |

### 样例贡献规范

每个样例目录必须包含：

| 文件         | 必须 | 说明                                     |
| ------------ | ---- | ---------------------------------------- |
| `index.vue`  | ✅   | 视图层                                   |
| `data.ts`    | ✅   | 逻辑层（必须用 `createPage()` 标准模式） |
| `index.scss` | ✅   | 样式层                                   |
| `api.md`     | 可选 | 有 API 约定时提供                        |

**质量要求**：使用 Mock 数据（不依赖后端即可运行），脱敏处理（无真实手机号、客户名等）。

### 贡献流程

```
① clone wl-skills-kit 仓库 → 创建 feature 分支
② 修改 + 本地测试（npx . --dry-run）
③ 提 PR → Review → 合并
④ npm version → npm publish
⑤ 各项目 npx @jhlc/wl-skills-kit@latest
```

---

## 七、移植到新项目

详见 [use-skill.md](use-skill.md)「第四章：移植到新项目」。核心步骤：

1. `npx @jhlc/wl-skills-kit` → 导入全部文件
2. 执行 convention-extract Skill → 生成适配新项目的 copilot-instructions.md
3. 改写 page-codegen 代码模板（替换基类、组件、API 调用方式）
4. 验证：拿一个页面走完整 Skill 流程

### 依赖检查（⚠️ 必做）

Skill 生成的代码依赖以下包，新项目需确认已安装：

| 包名               | 类型   | 用途                    | 安装命令                       |
| ------------------ | ------ | ----------------------- | ------------------------------ |
| `mockjs`           | devDep | Mock 数据生成           | `pnpm add -D mockjs`           |
| `vite-plugin-mock` | devDep | Vite 自动加载 mock/     | `pnpm add -D vite-plugin-mock` |
| `lodash-es`        | dep    | debounce（RECORD_FORM） | `pnpm add lodash-es`           |
| `xlsx`             | dep    | 导出/导入按钮（按需）   | `pnpm add xlsx`                |

> ⚠️ `lodash` ≠ `lodash-es`，两者不互通，模板代码 import 的是 `lodash-es`（ESM）。

---

## 八、版本管理

```
MAJOR.MINOR.PATCH
  │     │     └── Skill bug fix / 文档修正
  │     └──────── 新增 Skill / 组件 / 领域样例 / 编辑器支持
  └────────────── 目录结构变更（breaking）
```

---

## 九、路线图

| 阶段     | 内容                                                              | 优先级 |
| -------- | ----------------------------------------------------------------- | ------ |
| **v1.0** | Skills + 文档 + 组件 + demo 样例（Copilot）                       | 🔴 高  |
| **v1.1** | 多编辑器配置预生成（Cursor / Windsurf / Kiro / Trae / AGENTS.md） | 🟡 中  |
| **v1.2** | `--dry-run` 预览 + `--diff` 变更对比                              | 🟡 中  |
| **v2.0** | 纳入 `components/template/`（成熟后）                             | 🟢 低  |

---

## 附录：社区参考

| 项目          | 说明                            |
| ------------- | ------------------------------- |
| Ruler         | 30+ AI agent 规则集中管理       |
| rule-porter   | Cursor ↔ AGENTS.md 双向转换     |
| killer-skills | 社区 Skill 安装器               |
| AGENTS.md     | Linux Foundation 跨工具指令标准 |

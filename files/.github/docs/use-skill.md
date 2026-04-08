# AI Skill 使用与复用指南

> 如何使用 cx-ui-produce 的 5 个 AI Skill 高精度还原 Axure 原型 / 详设文档，以及如何将 Skill 体系移植到其他项目。

> **v1.4 更新**：page-codegen SKILL.md 已拆分为主文件 + 9 个独立模板文件（按模式名命名：TPL-LIST / TPL-MASTER-DETAIL / ... / TPL-DRIVEN），新增 OPERATION_STATION 和配置驱动模板识别规范。

---

## 一、Skill 体系概览

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ prototype-   │    │ api-         │    │ page-        │    │ menu-        │    │ convention-  │
│ scan         │───→│ contract     │───→│ codegen      │───→│ sync         │    │ extract      │
│              │    │              │    │              │    │              │    │              │
│ Axure HTML   │    │ page-spec    │    │ page-spec    │    │ pages.ts     │    │              │
│ → page-spec  │    │ → api.md     │    │ → 4文件+注册 │    │ → 后端菜单表 │    │ 源码→规范文档│
│   JSON       │    │   每页一个   │    │   +菜单配置  │    │ （Phase 1）  │    │ →instructions│
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

| Skill              | 输入                    | 输出                                              | 必须执行 | 移植时需要改吗          |
| ------------------ | ----------------------- | ------------------------------------------------- | -------- | ----------------------- |
| prototype-scan     | Axure HTML / 详设文档   | page-spec JSON                                    | ✅ 必须  | 不用改，直接复制        |
| api-contract       | page-spec JSON          | api.md                                            | ✅ 推荐  | 微调 URL 命名规范       |
| page-codegen       | page-spec JSON + api.md | index.vue + data.ts + index.scss + menu-config.md | ✅ 必须  | **必须改**，代码模板绑项目（含 9 个 TPL-*.md 模板文件，按模式名命名） |
| menu-sync          | SYS_MENU_INFO.md + env.local.json | 后端菜单表记录（AI 调 `/system/menu/save`） | ✅ 推荐  | 不用改，配置 env.local.json 即可（Phase 2 script 待接口就绪） |
| convention-extract | 项目源码                | copilot-instructions.md                           | ❌ 一次性 | 不用改，每个项目执行一次 |

**核心结论：prototype-scan 直接复制，page-codegen 必须适配新项目的代码模板，convention-extract 在新项目执行一次自动产出。**

---

## 二、日常使用

### 工作流 A：Axure 原型 → 代码（最常用）

```
Step 1  发送 Axure HTML 文件夹路径
        "帮我扫描 c:\Users\xxx\原型包\ 下的所有 HTML"

Step 2  AI 执行 prototype-scan → 输出 page-spec JSON

Step 3  确认 page-spec（检查字段数量，注意 notes 中的歧义项）

Step 4  AI 执行 api-contract → 输出每个页面的 api.md

Step 5  确认接口（服务缩写、资源名是否正确）

Step 6  AI 执行 page-codegen → 输出：
        - index.vue + data.ts + index.scss + api.md（每页 4 文件）
        - pages.ts 注册片段（已写入）
        - mock/[页面名].ts（与 api.md URL/字段一致，vite-plugin-mock 自动加载）
        - SYS_MENU_INFO.md 追加/更新（.github/docs/ 下）

Step 7  AI 输出校验报告（✅/❌ 各轮 diff 结果）

Step 8  菜单推送（menu-sync Skill）
        对 AI 说「帮我创建菜单」
        → AI 读取 SYS_MENU_INFO.md + env.local.json → 调 /system/menu/save 逐条创建
        → 输出 created/skipped 结果表
        （Phase 2 就绪后改用 pnpm run menu:push 脚本，详见 menu-sync/SKILL.md）

Step 9  启动开发验证
        pnpm run dev → 打开页面，mock 数据自动生效，可立即调试
```

**耗时预估**：1 个模块（5-8 页面）约 5-10 分钟

### 工作流 B：详设文档 → 代码（更高精度）

```
Step 1  发送详设文档（MD/Word/表格）
        "按照这份详设文档帮我生成页面"

Step 2  AI 执行 prototype-scan 模式B → 输出 page-spec JSON
        （字段英文名、字典code 直接读取，无需推断）

Step 3  其余步骤同工作流 A 的 Step 3-9
```

**精度对比**：
- Axure → 90-95%（英文名/字典需推断）
- **详设文档（规范格式）→ 95-100%（字段名直接读取）**

**推荐在详设文档中明确写出的信息**（精度最大化）：

```markdown
| 字段名(camelCase) | 中文名 | 类型 | 字典code |
|customerCode | 客户编码 | input | - |
|enableStatus | 启用状态 | dict | enable_status |
```

### 前置声明（放在详设文档或对话开头）

只需 3 个必填项，AI 自动推导目录结构、pages.ts 注册语法和命名前缀。

**必填**：

```markdown
## 前置声明

- 业务域/模块：生产 > 生产棒线材 > AI流程
- 服务前缀：/mmwr/
- 页面清单：客户档案、临时客户档案、客户申请新增、客户申请变更、客户详情
```

**按需补充**（有就写，没有不写）：

```markdown
- 参考样例：src/views/produce/production-mmwr/aiflow/mmwr-customer-archive/
- 共享组件：新增/变更/详情共用 Tab 面板 → src/components/local/c_customerTabs/
- 特殊约定：带 _1 后缀的 HTML 是同一组件不同上下文，不重复生成
```

> **AI 推导规则**：业务域→注册函数（生产=`gProd` / 销售=`gSale`），模块→目录名（kebab-case），页面名→文件目录（kebab-case + 模块前缀）。无需手写 pages.ts 语法。

---

## 三、精度提升技巧

### 技巧 1：一次只处理一个模块

❌ 同时发 30 个 HTML → AI 上下文窗口压力大，容易遗漏
✅ 按业务模块分批（每批 5-8 页面）→ 精度更高

### 技巧 2：提前说明约定

在 Step 1 时附加说明，直接覆盖 AI 的推断：

```
帮我扫描这些原型：
- 服务缩写统一用 sale
- 所有带 _1 后缀的文件是同一组件在不同上下文（不重复生成）
- productLine 字典 code 用 product_line
```

### 技巧 3：确认 page-spec 再生成代码

**不要让 AI 跳过 Step 3 直接生成代码。**

page-spec JSON 是唯一可以低成本修正的节点：

```
page-spec 有误 → 改一行 JSON → 重新生成代码（秒级）
代码生成后发现遗漏 → 找具体文件/函数/字段 → 修复成本×10
```

### 技巧 4：subTables 要明确交互意图

最常见的漏项是子表"能不能编辑"没讲清楚：

```
❌ 含糊："页面有一个业务信息表"
✅ 明确："业务信息表可以新增删除行（editable: true），但不能行内编辑"
```

### 技巧 5：共享组件提前识别

如果多个页面共用同一个 Tab 面板 / 弹窗，在 Step 3 时告诉 AI：

```
基本信息/联系人/银行信息 等 8 个 Tab 在新增、变更、详情 3 个页面共用，
请提取到 src/components/local/c_customerTabs/
```

---

## 四、移植到新项目

### 第 1 步：复制 Skill 文件

```
目标项目/
├── .github/
│   ├── copilot-instructions.md   ← 第2步生成
│   └── skills/
│       ├── prototype-scan/SKILL.md   ← 直接复制，不改
│       ├── api-contract/SKILL.md     ← 直接复制，微调命名规范
│       ├── page-codegen/SKILL.md     ← 需要重写代码模板
│       └── convention-extract/SKILL.md  ← 直接复制，不改
```

### 第 2 步：生成编码规范

**情况 A：新项目已有页面代码** → 执行 convention-extract 自动扫描

**情况 B：新项目空白** → 复制 `.github/copilot-instructions.md` 作为基础模板，修改：
- 路由注册方式（`gSale`/`gProd` → 新项目的函数名）
- 组件库（如果仍是 Element Plus + @jhlc/jh-ui 则不改）
- 页面目录层级、服务缩写前缀

**前置条件清单**：

```
□ 技术栈（Vue2/Vue3）
□ 页面目录结构和命名规则
□ 状态管理方案（Pinia / Vuex）
□ API 调用方式（axios 封装、基类模式、独立API层）
□ UI 组件库和自定义组件清单
□ 样式方案（SCSS / Tailwind / ...）
□ 路由/菜单注册方式
```

**各 AI 工具加载方式**：

| AI 工具 | Skill 读取方式 | copilot-instructions 加载 |
| --- | --- | --- |
| VS Code Copilot | 自动读取 `.github/skills/*/SKILL.md` | ✅ 自动（`.github/copilot-instructions.md`） |
| Cursor | `.cursor/rules/` 下的 `.mdc` 文件 | ✅ 自动（`.cursorrules` 或 `.cursor/rules/`） |
| Windsurf (Cascade) | 自动读取 `.github/skills/*/SKILL.md` | ✅ 自动（`.windsurfrules`） |
| Kiro | `.kiro/steering/` 下的 `*.md` 文件 | ✅ 自动 |
| Trae | 工作区规则配置 | ✅ 自动 |
| Claude Code / Roo / Cline | `AGENTS.md` 或 `CLAUDE.md` | ❌ 手动注入或 AGENTS.md |
| Qodo / Qoder | `.qodo/` 配置 | ❌ 手动 |
| Gemini CLI | `GEMINI.md` | ❌ 手动 |

### 第 3 步：改写 page-codegen 代码模板

| 需改写的部分 | cx-ui-produce 当前写法    | 新项目要替换为                       |
| ------------ | ------------------------- | ------------------------------------ |
| 基类         | `AbstractPageQueryHook`   | 新项目的页面基类或 Composition API   |
| 查询组件     | `BaseQuery`               | 新项目的查询封装                     |
| 表格组件     | `BaseTable`               | `el-table` 或自定义封装              |
| 分页组件     | `jh-pagination`           | `el-pagination` 或自定义             |
| API 调用     | `getAction / postAction`  | 项目封装的请求方法                   |
| 字典翻译     | `BusLogicDataType.dict`   | 项目的字典方案                       |
| 路由注册     | `pages.ts` + `gSale()`   | 项目的路由配置方式                   |

> **注意**：page-codegen 现为多文件结构（文件名即模式名，如 TPL-LIST.md、TPL-MASTER-DETAIL.md）。移植时需同时复制 `SKILL.md`（主规则文件）和全部 `TPL-*.md` 模板文件，然后替换模板中的组件写法。

**改写方法：从新项目中找 1-2 个标杆页面，提取其模式，替换模板中的对应部分。**

### 第 3.5 步：依赖安装检查（⚠️ 必做）

> Skill 生成的代码会 import 以下依赖。**新项目必须确认已安装**，否则生成后编译/运行报错。

#### 核心依赖（dependencies）

| 包名 | 用途 | 当前版本参考 | 说明 |
|---|---|---|---|
| `vue` | 框架 | ~3.2.25 | 新项目一定有 |
| `vue-router` | 路由（location.href 导航） | 4.4.3 | 新项目一定有 |
| `element-plus` | UI 组件（ElTag/ElMessage/ElMessageBox/ElTabs） | 2.2.6-prod.3 | 新项目一定有 |
| `@jhlc/common-core` | 平台核心（AbstractPageQueryHook/BaseQuery/BaseTable/getAction/postAction） | 3.1.0-prod.9 | 同平台项目一定有 |
| `lodash-es` | `debounce`（RECORD_FORM 保存防连点） | ^4.17.21 | ⚠️ **易遗漏**：package.json 可能只有 `lodash`，但代码 import 的是 `lodash-es`（ES module 版）。若缺失需手动安装：`pnpm add lodash-es` |
| `xlsx` | 导出/导入按钮功能 | ^0.18.5 | ⚠️ 仅在页面有"导出"/"导入"按钮时需要。若无此功能可跳过 |

#### 开发依赖（devDependencies）

| 包名 | 用途 | 当前版本参考 | 安装命令 |
|---|---|---|---|
| `mockjs` | Mock 数据生成（`Mock.mock`/`@cname`/`@date`） | ^1.1.0 | `pnpm add -D mockjs` |
| `vite-plugin-mock` | Vite 开发服自动加载 `mock/` 目录 | ^3.0.2 | `pnpm add -D vite-plugin-mock` |

#### Vite 配置检查

Mock 依赖安装后还需在 `vite.config.ts` 中注册插件：

```typescript
import { viteMockServe } from "vite-plugin-mock";

export default defineConfig(({ command }) => ({
  plugins: [
    viteMockServe({
      mockPath: "./mock",
      enable: command === "serve",  // 仅 dev 模式启用
    }),
  ],
}));
```

#### 项目配置检查

| 检查项 | 预期 | 缺失后果 |
|---|---|---|
| `src/types/page.ts` 桶文件 | 导出 `AbstractPageQueryHook`、`BaseQueryItemDesc`、`ActionButtonDesc`、`TableColumnDesc`、`BusLogicDataType` | TS 编译报错：找不到导出 |
| `tsconfig.json` 的 `paths` | `@/*` → `src/*` | import `@/types/page` 报错 |
| `mock/` 目录存在 | 项目根目录下有 `mock/` 文件夹 | vite-plugin-mock 无文件可加载 |
| `.env.dev` 含 `ENV_MOCK=true` | 控制 mock 开关 | mock 数据不生效 |

> **AI 生成代码时的自检规则**：生成完成后，AI 应检查 `package.json` 中是否存在上述依赖，若缺失则提示用户执行安装命令。

### 第 4 步：验证

拿一个中等复杂度的 Axure 页面走一遍完整流程，确认五轮校验无遗漏。

---

## 五、已知局限与应对

| 局限 | 应对 |
|------|------|
| Axure 导出 HTML 结构不统一 | 团队统一 Axure 9.0+ 和导出设置 |
| 静态 HTML 看不出交互行为 | 检查 page-spec 的 notes 字段，补充交互说明 |
| 联动逻辑需人工补充 | 在 api.md 或详设文档中写明联动关系 |

---

## 六、演进方向

| 方向                  | 做什么                                        | 状态   |
| --------------------- | --------------------------------------------- | ------ |
| page-spec JSON Schema | 定义正式 Schema，AI 输出后自动校验完整性      | 计划中 |
| 生成后字段 diff 脚本  | 对比 page-spec 字段 vs 代码实际字段，报缺失项 | 计划中 |
| 截图对比验证          | Axure 截图 ↔ Dev 页面截图，标注差异区域       | 远期   |
| .rp 原生解析          | 跳过 HTML 导出，直接读 Axure 源文件           | 远期   |

---

## 七、Skill 迭代记录

| 版本 | 日期    | 改动                                                        |
| ---- | ------- | ----------------------------------------------------------- |
| v1.0 | 2026-03 | 初版 4 个 Skill + copilot-instructions.md                   |
| v1.1 | 2026-04 | prototype-scan 输出改为 JSON page-spec + notes              |
| v1.1 | 2026-04 | page-codegen 增加五轮强制校验 + menu-config.md 生成         |
| v1.1 | 2026-04 | 修复子表交互遗漏（editable / inlineEdit 字段提取）          |
| v1.2 | 2026-04 | page-codegen 补全 FORM_ROUTE 模板 + @/types/page 导入规范  |
| v1.2 | 2026-04 | 模板 C（TREE_LIST）补全 data.ts + 模板 D（DETAIL_TABS）新增 |
| v1.2 | 2026-04 | 合并 use-skill.md 和 skill-reuse-guide.md                   |
| v1.2 | 2026-04 | 4 个 SKILL.md 添加 YAML frontmatter 兼容 skills.sh         |
| v1.3 | 2026-04 | 新增 menu-sync Skill（Phase 1：AI 调 /system/menu/save）    |
| v1.3 | 2026-04 | Template E diff 改为 diff-field-col 包装器（旧值在字段下方）|
| v1.3 | 2026-04 | 路由导航规则修正：hidden→hidden 也必须用 location.href      |
| v1.4 | 2026-04 | Template F（RECORD_FORM）录入型实绩页新增                   |
| v1.4 | 2026-04 | page-codegen 拆分为主 SKILL.md（~825行）+ 9 个 TPL-*.md（按模式名命名） |
| v1.4 | 2026-04 | Template G（OPERATION_STATION）工序操作站新增               |
| v1.4 | 2026-04 | TPL-DRIVEN.md 配置驱动模板页识别参考新增                    |
| v1.4 | 2026-04 | jh-dialog 只读例外规则补充（纯查看弹窗可不用 c_formModal）  |

---

## 八、各 Skill 的触发词

| 操作            | 触发方式                                              |
| --------------- | ----------------------------------------------------- |
| 扫描 Axure 原型 | "扫描这些原型"、"解析 axure"、"页面清单"              |
| 解析详设文档    | "按详设生成"、"从这份文档生成"、"详设文档"            |
| 生成接口约定    | "接口约定"、"生成 api.md"、"api contract"             |
| 生成页面代码    | "生成页面"、"代码生成"、"按原型生成"、"生成 vue 页面" |
| 同步菜单        | "帮我创建菜单"、"同步菜单"、"补菜单"、"注册菜单"      |

---

## 九、文件清单

```
.github/
├── copilot-instructions.md          ← AI 自动加载的编码规范
├── AGENTS.md                        ← Claude Code / Roo / Cline 专用入口
├── docs/
│   ├── use-skill.md                 ← 本文档（使用 + 复用 + 移植一站式指南）
│   ├── menu-sync-design.md          ← 菜单配置方案设计
│   ├── wl-skills-kit.md             ← wl-skills-kit 包说明与跨域复用指南
│   └── SYS_MENU_INFO.md             ← 菜单注册记录
└── skills/
    ├── prototype-scan/SKILL.md      ← Axure HTML → page-spec JSON
    ├── api-contract/SKILL.md        ← page-spec → api.md
    ├── page-codegen/
    │   ├── SKILL.md                 ← 主规则文件（约束+规范+模板索引，~825行）
    │   ├── TPL-LIST.md              ← LIST：标准列表页
    │   ├── TPL-MASTER-DETAIL.md     ← MASTER_DETAIL：主从表
    │   ├── TPL-TREE-LIST.md         ← TREE_LIST：树形+列表
    │   ├── TPL-DETAIL-TABS.md       ← DETAIL_TABS：详情Tab+子表
    │   ├── TPL-FORM-ROUTE.md        ← FORM_ROUTE：复杂表单独立路由
    │   ├── TPL-CHANGE-HISTORY.md    ← CHANGE_HISTORY：变更历史查询
    │   ├── TPL-RECORD-FORM.md       ← RECORD_FORM：录入型实绩页
    │   ├── TPL-OPERATION-STATION.md ← OPERATION_STATION：工序操作站
    │   └── TPL-DRIVEN.md            ← TEMPLATE_DRIVEN：配置驱动识别参考
    ├── menu-sync/SKILL.md           ← pages.ts → 后端菜单表
    └── convention-extract/SKILL.md  ← 项目源码 → 编码规范
docs/
├── page-query-hook-best-practices.md
├── request.md
└── jh-*.md                          ← 平台组件使用文档
```

> **一句话总结**：prototype-scan 通用可直接复制，page-codegen 需按目标项目改写代码模板，convention-extract 在每个新项目执行一次即可。三步完成 Skill 体系移植。

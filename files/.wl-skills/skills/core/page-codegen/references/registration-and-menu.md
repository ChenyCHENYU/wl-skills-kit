# 页面注册与菜单报告规则

> 本文件由 page-codegen 主 Skill 路由，只有命中对应页面场景时才读取。

## SYS_MENU_INFO 生成规则（所有模板通用）

page-codegen 生成页面代码后，**必须追加写入菜单配置信息到 `reports/SYS_MENU_INFO.md`**。

## pages.ts 分组注册规则（Module Federation 子应用）

多页面子应用必须使用与 `wl-mdata` 验证一致的分组模式，禁止扁平追加：

```typescript
import type { SharedPageItem } from "./utils";

type PageTuple = [string, string];
type SubModuleMap = Record<string, PageTuple[]>;

const gProd = (module: string, subModules: SubModuleMap): SharedPageItem[] =>
  Object.entries(subModules).flatMap(([subModule, pages]) =>
    pages.map(([page, label]) => ({
      name: `${module}/${subModule}/${page}/index.vue`,
      label
    }))
  );

const mdataModule = gProd("mdata", {
  model: [
    ["mdata-model-config", "主数据模型配置"],
    ["mdata-attr-mapping", "属性映射管理"]
  ],
  integration: [
    ["mdata-integ-system", "集成系统管理"]
  ]
});

export const list: SharedPageItem[] = mdataModule;
export default list;
```

生成规则：

| 字段 | 规则 |
| --- | --- |
| `module` | 来自项目启动参数 `--module=xxx`，如 `mdata` |
| `subModule` | 来自页面目录第二级，如 `src/views/mdata/model/...` → `model` |
| `page` | 页面 kebab 目录名，如 `mdata-model-config` |
| `name` | `${module}/${subModule}/${page}/index.vue` |
| `label` | 页面中文名 |

> menu-sync 的 `component` 必须与 `pages.ts` 生成的 `name` 完全一致，否则菜单能创建但点击无法加载页面。

### 写入策略（默认追加，不覆盖）

- **默认为追加模式**：保留已有内容，在末尾追加本次生成的菜单。避免覆盖团队之前累积的菜单记录。
- **如需重置**：用户明确说“覆盖”才走覆盖逻辑。

> AI 询问示例（仅当用户意图不明时）：`本次生成了 N 个页面的菜单配置，默认追加到 reports/SYS_MENU_INFO.md，是否需要覆盖已有内容？`

### 生成模板

多级菜单必须先写目录（`type=M`），再在目录下写页面菜单（`type=C`）。格式如下：

```markdown
# 系统菜单配置 — [项目名] [业务模块]

> **module 命名**：`[module]`
> **父级菜单**：来自 `.wl-skills/skills/sync/env.local.json` 的 `menu.parentMenuId`

## 一级目录（type=M）

| # | 菜单名 | path | orderNum | 备注 |
| - | ------ | ---- | -------- | ---- |
| 1 | [目录中文名] | `[目录pathCamel]` | 1 | 含 N 个子菜单 |

## 二级菜单（type=C）

### 1. [目录中文名] 子菜单

| 菜单名 | path | component | permission |
| ------ | ---- | --------- | ---------- |
| [页面中文名] | `[pageCamel]` | `[module]/[subModule]/[pageKebab]/index.vue` | `[module]:[pageCamel]:list` |
```

### 字段生成规则

| 字段 | 来源 | 规则 |
|------|------|------|
| 菜单路径 | page-spec.kebabName | kebab-case → camelCase（`mmwr-customer-archive` → `mmwrCustomerArchive`） |
| 菜单名称 | page-spec.pageName | 直接使用中文名 |
| 组件路径 | pages.ts 注册路径 | `[module]/[subModule]/[kebab-目录名]/index.vue` |
| 权限标识 | module + 菜单路径 | `[module]:[pageCamel]:list` |
| 是否隐藏 | page-spec.features.hiddenMenu | `true` → 是，`false` → 否 |
| 上级目录 | 用户指定 / page-spec 推断 | 如果用户在原型扫描阶段指定了上级目录，使用该值 |
| 应用选择 | pages.ts 域名 | `produce` → 生产，`sale` → 销售 |
| 显示排序 | 页面在模块内的序号 | 从 1 开始递增 |

### 隐藏页面判断规则

以下页面类型应设置 `是否隐藏: 是`：
- 目录名含 `-form`（独立路由表单页）
- 目录名含 `-detail`（详情页）
- 目录名含 `-history`（历史查询页）
- page-spec.features.hiddenMenu === true

### SYS_MENU_INFO.md 文件结构

```markdown
# 系统菜单配置 — [项目名] [模块名]

> **父级菜单**：`[parentMenuId]`
> **应用编码**：`[sysAppNo]`
> **module 命名**：`[module]`

## 一级目录（type=M）

| # | 菜单名 | path | orderNum | 备注 |
| - | ------ | ---- | -------- | ---- |
| 1 | [目录名] | `[目录pathCamel]` | 1 | 含 N 个子菜单 |

## 二级菜单（type=C）

### 1. [目录名] 子菜单

| 菜单名 | path | component | permission |
| ------ | ---- | --------- | ---------- |
| [页面名称] | `[pageCamel]` | `[module]/[subModule]/[pageKebab]/index.vue` | `[module]:[pageCamel]:list` |

> pages.ts 对应：`gProd("[module]", { [subModule]: [["[pageKebab]", "[页面名称]"]] })`
```

### 与 menu-sync 的衔接

SYS_MENU_INFO.md 是 menu-sync Skill 的输入数据源：
- **自动创建**：用户说"帮我创建菜单" → menu-sync 读取 SYS_MENU_INFO.md → 调 API 逐条创建
- **手动创建**：用户也可直接按 SYS_MENU_INFO.md 的表格在系统管理后台手动创建菜单
- 两种方式等价，菜单创建后通过 `组件路径` 字段与 pages.ts 注册的文件路径关联
- **自动创建顺序**：必须先调用 `wls_menu_query` 获取当前 domain 菜单树，再 `wls_menu_upsert` 创建/更新一级目录（type=M），拿到目录 id 后再创建二级菜单（type=C）。不得把二级页面全部直接挂到根 `parentMenuId`。

---

# 菜单配置方案设计

## 背景

本项目为 Module Federation 子应用，页面渲染链路如下：

```
后端菜单表 → 主应用加载菜单树 → Module Federation 分发路由 → 子应用渲染页面
                                                            ↑
                                              pages.ts 注册组件（纯构建配置）
```

`pages.ts` 和菜单表职责不同：

- **pages.ts**：告诉 Vite "这个路径有个 Vue 组件"（构建时）
- **菜单表**：告诉系统 "页面叫什么名字、在哪个目录下、谁能访问"（运行时）

新增页面后必须在菜单表中注册，否则系  统无法路由到该页面。以下对比四种方案。

---

## 方案对比

### 方案 A：纯手动配置

前端在 `pages.ts` 注册组件后，开发者登录系统管理后台手动创建菜单。

```
开发者写 pages.ts → 登录后台 → 菜单管理 → 逐个新增 → 配权限
```

| 优点 | 缺点 |
|------|------|
| 零开发成本 | 每新增一个页面都要切后台手动填 12 个字段 |
| 零副作用 | 批量新增（如 AI 生成 20 个页面）效率极低 |
| 后端无改动 | 容易填错组件路径导致菜单打不开 |

### 方案 B：双向同步脚本（已否决）

前端维护 `pnpm run menu:sync`，读取 `pages.ts` 和菜单表做双向 diff，增删改菜单。

```
pages.ts ←→ 菜单表 (双向 diff & sync)
```

| 优点 | 缺点 |
|------|------|
| 全自动 | **改名/改路径** → 旧记录匹配不到 → 一删一增 → 权限丢失 |
|        | **删页面** → 自动删菜单 → 可能误删已配好权限的菜单 |
|        | **父级冲突** → 路径推算的父级名（如 `production-plan`）和手动建的（如"生产计划"）不一致 |
|        | **双数据源** → pages.ts 和菜单表永远存在不一致风险 |

> 社区主流框架（Vben Admin、Pure Admin、RuoYi）无一采用双数据源同步方案。**此方案已否决。**

### 方案 C：只增不删的批量导入

后端提供 `POST /system/menu/batchImport`，按 `componentPath` 判断：存在则跳过，不存在则新增。

```
前端生成 JSON → POST batchImport → 只增不改不删
```

| 优点 | 缺点 |
|------|------|
| 不碰已有数据 | 页面改名后重新导入会**产生重复记录**（旧的还在） |
| 后端逻辑简单 | 只能用于首次导入，后续维护仍需手动操作 |
| 无权限丢失风险 | 改名/调整排序/改父级目录 → 都要手动改 |

### 方案 D：前端推送覆盖（推荐）

前端是**菜单结构的唯一源**，后端是**权限配置的唯一源**，通过一个推送接口实现职责分离。

```
pages.ts + menuMeta  ──POST──→  /system/menu/batchPush  ──→  菜单表
   (结构定义)                     (upsert by componentPath)
                                   仅写结构字段，不碰权限字段
```

| 优点 | 缺点 |
|------|------|
| 一条命令完成菜单创建 | 后端需新增 1 个接口 |
| 改名/改排序 → 再推一次即覆盖 | 首次需约定字段分区规则 |
| **不删除**后端多余的菜单 | — |
| **不碰**权限/角色绑定字段 | — |
| 幂等 — 推多少次结果一致 | — |

---

## 四方案横评

| 维度 | A 手动 | B 双向同步 | C 只增不删 | D 推送覆盖 |
|------|--------|-----------|-----------|-----------|
| 后端改动 | 无 | 大（双向 diff） | 小（1 接口） | 小（1 接口） |
| 日常效率 | ❌ 低 | ✅ 高 | ⚠️ 仅首次 | ✅ 高 |
| 批量场景 | ❌ 逐个填 | ✅ 自动 | ✅ 自动 | ✅ 自动 |
| 改名安全 | ✅ 手动改 | ❌ 权限丢失 | ⚠️ 产生重复 | ✅ 覆盖更新 |
| 删除安全 | ✅ 手动删 | ❌ 可能误删 | ✅ 不删 | ✅ 不删 |
| 权限影响 | 无 | ❌ 可能丢失 | 无 | 无 |
| 幂等性 | — | ❌ | ⚠️ 重复则跳过 | ✅ 完全幂等 |
| 副作用 | 无 | **有** | 无 | 无 |

---

## 推荐：方案 D — 前端推送覆盖

### 核心原则

- **菜单结构**（名称、路径、排序、父级、图标、隐藏状态）→ 前端定义，推送覆盖
- **菜单权限**（角色绑定、按钮权限、数据权限）→ 后端管理，推送不碰
- **不删除** → 前端只管"我有什么"，后端多出来的菜单（手动创建的）不受影响

### 前端侧：扩展 pages.ts

在 `SharedPageItem` 中增加可选的菜单元数据：

```typescript
// vite/plugins/shared/pages.ts
export interface SharedPageItem {
  name: string;      // 组件路径（已有）
  label: string;     // 菜单名称（已有）
  // ↓ 菜单推送用（可选，仅需推送的页面填写）
  menuMeta?: {
    parentName: string;    // 上级目录名称（后端按名称匹配）
    menuPath: string;      // 菜单路径（camelCase）
    sortOrder: number;     // 显示排序
    appCode: string;       // 应用选择（"produce" | "sale"）
    hidden?: boolean;      // 是否隐藏（默认 false）
    icon?: string;         // 菜单图标
    permCode?: string;     // 权限标识（默认取 menuPath）
  };
}
```

使用示例：

```typescript
const saleModule = gSale("demo", {
  khda: [
    ["customer-archive", "客户档案", {
      parentName: "客户档案管理", menuPath: "customerArchive",
      sortOrder: 1, appCode: "sale"
    }],
    ["customer-detail", "客户详情", {
      parentName: "客户档案管理", menuPath: "customerDetail",
      sortOrder: 5, appCode: "sale", hidden: true
    }]
  ]
});
```

### 推送脚本

```bash
pnpm run menu:push          # 推送所有含 menuMeta 的页面到后端
pnpm run menu:push --dry    # 预览模式，仅打印将要推送的内容
```

脚本逻辑（`scripts/menu-push.ts`，vite-node 执行）：
1. 读取 pages.ts 导出的 `SharedPageItem[]`
2. 过滤出有 `menuMeta` 的条目
3. 组装请求体，POST 到后端接口

### 后端侧：1 个接口

```
POST /system/menu/batchPush
```

**Request**：

```json
{
  "items": [
    {
      "componentPath": "sale/demo/khda/customer-archive/index.vue",
      "menuName": "客户档案",
      "menuPath": "customerArchive",
      "parentName": "客户档案管理",
      "sortOrder": 1,
      "appCode": "sale",
      "hidden": false,
      "icon": "",
      "permCode": "customerArchive"
    }
  ]
}
```

**后端逻辑**（伪代码）：

```
for item in items:
    existing = SELECT * FROM sys_menu WHERE component_path = item.componentPath
    if existing:
        // 只更新结构字段，不动权限字段
        UPDATE sys_menu SET
            menu_name = item.menuName,
            menu_path = item.menuPath,
            parent_id = (SELECT id FROM sys_menu WHERE menu_name = item.parentName),
            sort_order = item.sortOrder,
            hidden = item.hidden,
            icon = item.icon
        WHERE id = existing.id
        // ⚠️ 不动: role_ids, perm_code(如已配置), button_perms, data_scope
    else:
        INSERT INTO sys_menu (component_path, menu_name, menu_path, parent_id,
            sort_order, app_code, hidden, icon, perm_code)
        VALUES (...)
```

**字段分区规则**：

| 分区 | 字段 | 推送覆盖？ |
|------|------|-----------|
| 结构字段 | menu_name, menu_path, parent_id, sort_order, hidden, icon, component_path | ✅ 是 |
| 权限字段 | role_menu 关联表, button_perms, data_scope | ❌ 否 |
| 标识字段 | perm_code | 仅新增时写入，已存在则不覆盖 |

### 工作流

```
日常开发:
  AI生成页面 → pages.ts 注册(含 menuMeta) → pnpm run menu:push → 菜单出现 → 管理员配权限

改名/调整:
  修改 pages.ts 的 label/menuMeta → pnpm run menu:push → 菜单自动更新，权限不受影响

删除页面:
  删除 pages.ts 条目 → 手动去后台删菜单（推送不会自动删）
```

---

## 当前实现状态

### ✅ Phase 1（已实现）：AI 直接调 `/system/menu/save`

menu-sync Skill 已实现 Phase 1：AI 读取 `SYS_MENU_INFO.md` + `env.local.json`，逐条调用 `/system/menu/save` 接口创建菜单。

**使用方式**：对 AI 说"帮我创建菜单" → AI 自动读取配置并调接口

**当前工作流**：

```
page-codegen 生成代码
  → 自动生成 menu-config.md（含菜单字段）
  → 追加更新 SYS_MENU_INFO.md
  → 对 AI 说"帮我创建菜单"
  → AI 读取 SYS_MENU_INFO.md + env.local.json → 调 /system/menu/save
  → 输出 created/skipped 结果表
```

---

### ⏳ Phase 2（待后端接口）：`pnpm run menu:push` 脚本

方案 D 的批量推送脚本需要后端提供 `POST /system/menu/batchPush` 接口。在接口就绪前，继续使用 Phase 1（AI 调接口）。

**过渡路径**：

1. ✅ page-codegen Skill 自动生成 `menu-config.md`（已实现）
2. ✅ menu-sync Skill Phase 1：AI 调 `/system/menu/save`（已实现）
3. ⏳ 后端实现 `POST /system/menu/batchPush` 接口
4. ⏳ 前端 `scripts/menu-push.ts` 读 `pages.ts` → POST batchPush
5. ⏳ 切换到 `pnpm run menu:push`，废弃手动/AI 调接口流程

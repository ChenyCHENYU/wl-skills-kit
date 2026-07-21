# 弹窗、链接列与隐藏路由

> 命中 CRUD 弹窗、蓝色链接列或 FORM_ROUTE 隐藏路由时读取。

### c_formModal 使用规范

> kit 提供 `c_formModal` 标准模板，页面生成前必须按 `component-materialization.md` 将其按需落盘到项目 `src/components/local/c_formModal/`；支持 add/edit/view 三模式。
> 所有标准 CRUD 弹窗**必须使用此组件**，不可重复编写。

**data.ts 中定义 modalConfig：**

```typescript
import type { BaseFormItemDesc } from "@jhlc/common-core/.wl-skills/src/components/form/common/type";

export const modalConfig = {
  titlePrefix: "客户",       // 标题前缀：新增客户 / 编辑客户 / 查看客户
  width: "850px",
  columns: 2,
  labelWidth: "110px",
  formItems: [
    { name: "code", label: "编码", disabled: true, placeholder: "系统自动生成" },
    { name: "name", label: "名称", required: true, placeholder: "请输入" },
    // 下拉用 jh-select 组件
    {
      name: "type",
      label: "类型",
      component: () => ({ tag: "jh-select", items: OPTS.type })
    }
  ] as BaseFormItemDesc<any>[],
  api: {
    getById: API_CONFIG.getById,
    save: API_CONFIG.save,
    update: API_CONFIG.update
  }
};
```

**index.vue 中使用：**

```vue
<c_formModal ref="editModalRef" v-bind="modalConfig" @ok="select" />

<script setup lang="ts">
import { createPage, modalConfig } from "./data";
import c_formModal from "@/components/local/c_formModal/index.vue";
</script>
```

**调用方式**（在 data.ts 中）：
- 新增：`_editModalRef?.value?.open()`
- 编辑：`_editModalRef?.value?.edit(row.id)`
- 查看：`_editModalRef?.value?.view(row.id)`

---

### 可点击列（蓝色链接列）

原型中以蓝色文字凸显的列（通常是编码、编号类字段）表示"可点击查看详情"。

**识别规则**：
- 原型中蓝色/带下划线的列文字 → 必须实现为可点击
- 常见目标列：客户编码、申请编码、订单编号、合同编号、计划编号等"XX编码/编号"字段

**实现方式**：在 `columnsDef()` 中使用 `defaultSlot` + `h()` 渲染蓝色链接：

```typescript
import { h } from "vue";

// 在 columnsDef() 中：
{
  label: "客户编码",
  name: "customerCode",
  minWidth: 120,
  defaultSlot: ({ row }: any) => {
    return h(
      "span",
      {
        style: "color: #409eff; cursor: pointer; text-decoration: underline;",
        onClick: () => handleCodeClick(row)
      },
      row.customerCode
    );
  }
}
```

**点击处理逻辑**（按优先级选择）：
1. 有编辑弹窗 → `_editModalRef?.value?.open(row.id, "view")` （查看模式打开同一弹窗）
2. 如果有详情路由 → `navigateToForm({ id: row.id, mode: "view" })`
3. Mock 阶段暂无详情页 → `ElMessage.info(\`查看详情: ${row.fieldValue}\`)`

**handleCodeClick 推荐实现**：

```typescript
let _editModalRef: any = null;

function handleCodeClick(row: any) {
  _editModalRef?.value?.open(row.id, "view");
}
```

> 注意：`_editModalRef` 在 `createPage(editModalRef?)` 中赋值，详见 §弹窗模板

---

### FORM_ROUTE 表单页（路由跳转式表单）

> 当表单足够复杂（如多 Tab、多子表、独立布局）时，使用**独立路由**替代弹窗（c_formModal）。
>
> **导航方式选择**（按场景区分）：
>
> | 场景 | 方式 | 原因 |
> |---|---|---|
> | **菜单页 → 隐藏页 / 隐藏页 → 隐藏页** | `navigateHidden(path, query?)` from `src/util/navigate-hidden.ts` | 懒注册 + router.push，无整页刷新；内部自动兜底 location.href 防白屏 |
> | **返回上一页** | `useRouter().back()` | 任何页面均可用 |
>
> ⚠️ `navigateHidden` 依赖 `src/util/navigate-hidden.ts` 的 `HIDDEN_ROUTE_MAP`。**每新增一个隐藏页，必须在该 Map 里追加一行**，否则兜底会退化为整页刷新。

#### 路由路径命名规则

| 目录名（kebab-case）              | 路由路径（camelCase）                       |
| ---------------------------------- | -------------------------------------------- |
| `mmwr-customer-apply-add-form`     | `/aiflow/mmwrCustomerApplyAddForm`           |
| `mmwr-customer-apply-change-form`  | `/aiflow/mmwrCustomerApplyChangeForm`        |

**规则**：`/[子模块名-camelCase]/[完整页面目录名转PascalCase]`
- 子模块名取 pages.ts 的 key，如 `aiflow`
- 页面目录名整体转 PascalCase（含 `mmwr` 前缀），如 `mmwr-customer-apply-add-form` → `mmwrCustomerApplyAddForm`

#### navigate-hidden.ts 标准实现（首次使用时创建，后续只追加 Map 条目）

```typescript
// src/util/navigate-hidden.ts
import envConfig from "@jhlc/common-core/src/store/env-config";
import { ElMessage } from "element-plus";

/**
 * 隐藏页路由懒注册表
 * 每新增一个 hiddenMenu=true 的页面，在此追加一行
 */
const HIDDEN_ROUTE_MAP: Record<string, () => Promise<any>> = {
  // "/aiflow/mmwrCustomerApplyAddForm": () => import("@/views/produce/aiflow/mmwr-customer-apply-add-form/index.vue"),
};

export async function navigateHidden(path: string, query?: Record<string, string>) {
  const router = envConfig()?.router;
  if (!router) { ElMessage.error("路由未初始化，请刷新页面重试"); return; }

  const matched = router.resolve({ path }).matched;
  if (!matched.length || matched[0].path === "/:pathMatch(.*)*") {
    const loader = HIDDEN_ROUTE_MAP[path];
    if (!loader) {
      // 降级兜底：路由 Map 未配置时整页跳转，不白屏
      location.href = router.resolve({ path, query } as any).href;
      return;
    }
    router.addRoute({ path, component: loader });
  }
  await router.push({ path, query } as any);
}
```

#### 调用侧标准实现（data.ts）

```typescript
// ✅ 正确：用 navigateHidden
import { navigateHidden } from "@/util/navigate-hidden";

// 在 createPage() 外部定义，避免每次调用都重新创建
const FORM_ROUTE = "/aiflow/mmwrCustomerApplyAddForm";

function navigateToForm(query?: Record<string, string>) {
  navigateHidden(FORM_ROUTE, query);
}

export function createPage() {
  const Page = new (class extends AbstractPageQueryHook {
    toolbarDef(): ActionButtonDesc[] {
      return [
        {
          name: "primary",
          label: "新增申请",
          onClick: () => navigateToForm()        // 无参：新增
        }
      ];
    }
    columnsDef(): TableColumnDesc<any>[] {
      return defineColumns([
        // ...
        {
          label: "操作",
          name: "_action",
          cid: `${TABLE_CID}-action`,
          fixed: "right",
          align: "center",
          defaultSlot: ({ row }: any) =>
            renderOps([
              { type: "edit", onClick: () => navigateToForm({ id: row.id }) }  // 带 id：编辑
            ])
        }
      ] as any) as TableColumnDesc<any>[];
    }
  })();
  return Page.create() as any;
}
```

> **✅ 正确做法**：
> - 跳转隐藏页 → `navigateHidden(path, query?)`（懒注册 + router.push，无刷新，内部兜底防白屏）
> - 返回上一页 → `useRouter().back()`
>
> **❌ 禁止**：
> - 直接 `router.push({ path: "..." })` — 主应用过滤了 hidden 路由，路由未注册直接 push 会白屏或报 "Invalid route component"
> - 直接 `location.href = router.resolve(...).href` — 触发整页重载，有加载动画刷新感；`navigateHidden` 内部已兜底，**外部调用侧禁止直接使用**
> - kebab-case 路径（`/mmwr-xxx-form`）— 路由路径必须是 camelCase
>
> ⚠️ **新增隐藏页时必须同步维护 `src/util/navigate-hidden.ts` 的 `HIDDEN_ROUTE_MAP`**，否则 `navigateHidden` 降级为整页刷新，失去无刷新优势。

---

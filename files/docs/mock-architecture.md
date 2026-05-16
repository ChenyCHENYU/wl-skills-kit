# Mock 架构规范

> **适用范围**：所有基于 wl-skills-kit 的 Vue 3 业务子应用
> **技术依赖**：`vite-plugin-mock` + `mockjs`
> **源码参考**：wl-mdata 项目实践（v2.7.x 基线）

---

## 一、设计目标

| 目标 | 实现方式 |
|---|---|
| **与页面代码完全解耦** | Mock 文件独立放在 `mock/` 目录，不在 `src/views` 中 import 任何 mock |
| **开关零污染** | `ENV_MOCK=false` → vite-plugin-mock 整体不挂载，不拦截任何请求 |
| **按业务模块自治** | 每个模块一个 mock 文件，删除模块只需删除对应 mock 文件 |
| **共享工具复用** | `_utils.ts` 提供标准响应构造器，子模块 import 而非重复定义 |
| **会话内数据可见** | `let STORE = [...]` 可变数组，CRUD 操作直接修改内存，下次查询可见 |
| **跨会话重置** | dev server 重启时模块重新加载，STORE 恢复初始状态 |
| **真实接口无缝切换** | `API_CONFIG` 保持真实路径，mock 端点带 `/dev-api` 前缀，关闭 mock 后无需改代码 |

---

## 二、目录结构

```
项目根目录/
├── .env.dev                    ← ENV_MOCK=true（Mock 总开关）
├── vite.config.ts              ← viteMockServe({ mockPath: "./mock", enable: ... })
├── mock/
│   ├── _utils.ts               ← 共享工具（pageResult / ok / paginate / nowStr / pick）
│   └── [业务域]/               ← 镜像 src/views 第一级目录
│       ├── [模块].ts           ← 一个模块可覆盖多个相关页面
│       ├── [模块].ts
│       └── ...
└── src/
    └── views/
        └── [业务域]/
            └── [模块]/
                └── [页面]/
                    ├── index.vue
                    ├── data.ts   ← API_CONFIG 保持真实路径
                    └── api.md
```

**命名约定**：

| src/views 路径 | mock 文件路径 | 说明 |
|---|---|---|
| `src/views/mdata/model/` | `mock/mdata/model.ts` | 一个模块一个文件 |
| `src/views/mdata/management/` | `mock/mdata/master.ts` | 可按业务语义命名 |
| `src/views/sale/customer/` | `mock/sale/customer.ts` | 镜像第一级域 |
| `src/views/sale/contract/` | `mock/sale/contract.ts` | 同域不同模块 |

> **一个 mock 文件可覆盖同模块下多个页面的接口**，只要它们属于同一业务实体（如"客户管理"和"客户申请"可共用 `mock/sale/customer.ts`）。

---

## 三、`_utils.ts` 共享工具

> 该文件由 `wl-skills init` 自动写入 `mock/_utils.ts`。无 `export default`，vite-plugin-mock 会安全跳过。

```typescript
import Mock from "mockjs";

export const Random = Mock.Random;
export const pick = <T>(arr: T[]): T => Random.pick(arr) as T;
export const bool = () => Random.boolean();

/** 标准分页响应 */
export function pageResult(records: any[], total: number) {
  return { code: 2000, message: "操作成功", data: { records, total } };
}

/** 标准成功响应 */
export function ok(data: any = null) {
  return { code: 2000, message: "操作成功", data };
}

/** 通用分页截取（兼容 pageNo/current、pageSize/size） */
export function paginate(pool: any[], query: any) {
  const current = Number(query?.current || query?.pageNo) || 1;
  const size = Number(query?.size || query?.pageSize) || 10;
  const start = (current - 1) * size;
  return pageResult(pool.slice(start, start + size), pool.length);
}

/** 当前时间字符串 */
export function nowStr() {
  return new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
}
```

所有 mock 模块文件统一通过 `import { paginate, ok, pick, nowStr } from "../_utils"` 引入。

---

## 四、Mock 文件编写规范

### 4.1 文件头注释

每个 mock 文件顶部必须声明覆盖的业务模块和接口：

```typescript
/**
 * [业务模块名] Mock
 * 覆盖接口：[接口前缀1] / [接口前缀2]
 */
import type { MockMethod } from "vite-plugin-mock";
import Mock from "mockjs";
import { paginate, ok, pick, nowStr } from "../_utils";
```

### 4.2 STORE 模式

```typescript
// ─── 数据生成器 ──────────────────────────────────────────────────
function genRecord() {
  return {
    id: Mock.Random.id(),
    code: `MDM${Mock.Random.string("number", 8)}`,
    name: Mock.Random.cword(4, 10),
    status: pick(["ACTIVE", "DRAFT", "FROZEN"]),
    createBy: Mock.Random.cname(),
    createTime: Mock.Random.datetime("yyyy-MM-dd HH:mm:ss"),
  };
}

// ─── 可变存储（dev server 会话内持久化）──────────────────────────
let STORE: any[] = Array.from({ length: 50 }, genRecord);
```

**核心规则**：
- 用 `let`（非 `const`）声明 STORE，允许 splice/unshift/assign
- 生成器函数 `genRecord()` 封装单条数据的随机逻辑
- 初始数据量建议 20-100 条，支持分页验证

### 4.3 端点编写

```typescript
export default [
  // ── 列表（分页）──
  {
    url: "/dev-api/[服务]/[资源]/list",
    method: "get",
    response: ({ query }: any) => paginate(STORE, query),
  },

  // ── 新增 ──
  {
    url: "/dev-api/[服务]/[资源]/save",
    method: "post",
    response: ({ body }: any) => {
      STORE.unshift({ ...genRecord(), ...body, id: Mock.Random.id(), createTime: nowStr() });
      return ok(null);
    },
  },

  // ── 编辑 ──
  {
    url: "/dev-api/[服务]/[资源]/update",
    method: "post",
    response: ({ body }: any) => {
      const idx = STORE.findIndex((r) => r.id === body?.id);
      if (idx >= 0) Object.assign(STORE[idx], body, { updateTime: nowStr() });
      return ok(null);
    },
  },

  // ── 删除 ──
  {
    url: "/dev-api/[服务]/[资源]/remove",
    method: "post",
    response: ({ body }: any) => {
      const ids = Array.isArray(body?.ids) ? body.ids : [body?.id];
      ids.forEach((id: string) => {
        const idx = STORE.findIndex((r) => r.id === id);
        if (idx >= 0) STORE.splice(idx, 1);
      });
      return ok(null);
    },
  },

  // ── 详情 ──
  {
    url: "/dev-api/[服务]/[资源]/getById",
    method: "get",
    response: ({ query }: any) => ok(STORE.find((r) => r.id === query?.id) || null),
  },
] as MockMethod[];
```

### 4.4 端点覆盖检查

**每个 `API_CONFIG` 的 key 都必须在 mock 文件中有对应端点**，零遗漏。

| 操作 | STORE 修改方式 |
|---|---|
| 删除 | `STORE.splice(idx, 1)` |
| 新增 | `STORE.unshift({ ...genRecord(), ...body, id })` |
| 编辑 | `Object.assign(STORE[idx], body)` |
| 启用/停用 | 修改 `item.status` |
| 提交/审批 | 修改 `item.approvalStatus` |
| 作废 | `STORE.splice(idx, 1)` 或修改状态 |

> ❌ 禁止端点只返回 `{ code: 2000 }` 不修改 STORE — 否则 `select()` 刷新后看不到变化。

---

## 五、开关机制

### 5.1 环境变量

```bash
# .env.dev
ENV_MOCK=true    # true = 启用 mock，false = 关闭 mock 走真实接口
```

### 5.2 Vite 配置

```typescript
// vite.config.ts
import { viteMockServe } from "vite-plugin-mock";

plugins: [
  viteMockServe({
    mockPath: "./mock",
    enable: command === "serve" && config.ENV_MOCK !== "false",
    logger: true,
  }),
]
```

**关键**：`enable` 判断只在 `serve` 模式且 `ENV_MOCK` 不为 `"false"` 时挂载。生产构建永远不包含 mock。

### 5.3 切换流程

```
开发阶段（Mock）：ENV_MOCK=true  → 所有接口走 mock，Network 可见
联调阶段（真实）：ENV_MOCK=false → mock 插件不加载，接口走 proxy → 后端
部分联调：       ENV_MOCK=false + 仅保留需要 mock 的端点（手动注释其余）
```

> 切换时**无需修改任何页面代码**。`API_CONFIG` 始终保持真实路径，mock 端点的 `/dev-api` 前缀由 Vite proxy 统一处理。

---

## 六、一键清理

CLI 提供 `mock-clean` 命令，支持按模块清理或全量清理：

```bash
# 清理指定业务域的 mock
npx @agile-team/wl-skills-kit mock-clean --domain mdata

# 清理全部 mock（保留 _utils.ts）
npx @agile-team/wl-skills-kit mock-clean --all

# 预览将要删除的文件（dry-run）
npx @agile-team/wl-skills-kit mock-clean --all --dry-run
```

清理后建议：
1. 将 `.env.dev` 中 `ENV_MOCK` 改为 `false`
2. 确认 `vite.config.ts` 中 proxy 已配置正确的后端地址
3. 运行 `wl-skills validate` 确认页面无 mock 依赖残留

---

## 七、validate 检查项

`wl-skills validate` 对 mock 的检查（自动执行）：

| 检查项 | 级别 | 说明 |
|---|---|---|
| `mock/_utils.ts` 是否存在 | warn | 缺失则提示 `wl-skills init` 补充 |
| API_CONFIG URL 是否有对应 mock 端点 | warn | 每个 URL 在 mock 文件中必须有 `/dev-api` 前缀的端点 |
| mock 文件是否 import `_utils` | info | 未使用共享工具则提示 |
| mock 文件是否按域分目录 | info | 扁平放在 `mock/` 根目录则提示迁移 |

---

## 八、常见问题

### Q: mock 和真实接口返回格式不一致怎么办？

确保 `_utils.ts` 中 `pageResult` / `ok` 的返回格式与后端统一：
```typescript
// 如果后端用 code: 200
export function ok(data: any = null) {
  return { code: 200, message: "操作成功", data };
}

// 如果后端用 code: 2000（平台默认）
export function ok(data: any = null) {
  return { code: 2000, message: "操作成功", data };
}
```

> 在 `_utils.ts` 中统一修改一处即可，无需改每个 mock 文件。

### Q: 多个页面共享同一套数据怎么办？

同一个 mock 模块文件中声明一个 STORE，多个端点共享。例如"客户列表"和"客户申请"可共享 `CUSTOMER_STORE`。

### Q: 某个接口需要走真实后端，其余走 mock？

方案一：删除该接口在 mock 文件中的端点，vite-plugin-mock 找不到匹配就会放行到 proxy。
方案二：保持 `ENV_MOCK=true`，在 vite proxy 中对特定路径单独配置 target。

---

## 九、架构要点速查

| 能力 | 实现方式 |
|---|---|
| **新增数据可见** | 每个模块维护 `let STORE = [...]` 可变数组，save 用 `unshift` 置顶，下次 list 查询即可看到 |
| **关闭 mock 零污染** | `ENV_MOCK=false` → vite-plugin-mock 整体不挂载，不会有任何 mock handler 拦截真实请求 |
| **按模块独立** | 每个文件自治，未来删某业务模块 mock 只删对应文件 |
| **共享工具复用** | `_utils.ts` 提供 `pageResult` / `ok` / `paginate` / `nowStr` / `pick`，子模块 import 而非重复定义 |
| **跨会话重置** | dev server 重启时内存清空，mock 数据恢复初始状态（符合预期） |
| **URL 零修改切换** | `API_CONFIG` 保持真实路径，mock URL 带 `/dev-api` 前缀，关闭 mock 后业务代码无需任何改动 |

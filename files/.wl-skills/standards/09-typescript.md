# 09 — TypeScript 类型规范

> **强制度**：🔴 必遵。
> 项目使用 `strict: false` 宽松模式起步，但**类型错误零容忍**：`vue-tsc --noEmit` 必须 0 error。

---

## 类型错误零容忍（R14）

> 对应确定性执行器 **R14**（`wl-skills validate --typecheck` / MCP `wls_validate_page {typecheck:true}`，阻断级）。

- **基线**：`vue-tsc --noEmit`（无 `vue-tsc` 时回退 `tsc --noEmit`）必须退出码 0。
- **何时跑**：
  - **CI 必跑**：流水线中 `wl-skills validate --typecheck`（与 `--strict` 组合），任何 TS error 阻断合并
  - **pre-push / 发版前必跑**：本地 `pnpm wl-skills validate --typecheck`
  - **pre-commit 不建议开启**：全量类型检查较慢，避免拖慢日常提交
- **优雅降级**：项目无 `tsconfig.json` 或未安装 `vue-tsc` / `tsc` 时，R14 输出 warn 不阻断（提示安装后纳入 CI）。
- **为什么必遵**：类型错误在运行时才暴露，成本高；CI 阶段拦截是 ROI 最高的质量门。

```bash
# CI / 发版前
wl-skills validate --typecheck --strict

# MCP（AI 编辑器中）
wls_validate_page({ path: "src/views", typecheck: true })
```

---

## 类型定义优先级

- **`interface`**：可扩展的对象类型
- **`type`**：联合类型 / 工具类型 / 字面量类型

```typescript
// ✅ interface 用于对象
interface User {
  id: string;
  name: string;
}

// ✅ type 用于联合 / 工具类型
type Status = "pending" | "active" | "closed";
type PartialUser = Partial<User>;
```

## any 使用约束

❌ 禁止滥用 `any`。`as any` 仅允许出现在以下场景：

1. 对接外部 SDK 返回值的边界处
2. `AbstractPageQueryHook.create()` 的返回值接收（框架限制）
3. 确实无法确定类型时，加注释 `// TODO: 待补充类型`

```typescript
// ✅ 允许（框架限制）
return Page.create() as any

// ✅ 允许（外部边界，加注释）
const sdkResult = thirdPartySdk.call() as any // TODO(cheny): SDK 1.5 后补充类型

// ❌ 禁止（懒省事）
function handleClick(row: any) { ... }
```

## 类型导入

- 业务类型统一从 `@/types/page` 桶文件引入
- ❌ 不重复定义同名类型
- ✅ 复杂类型在 `@/types/` 下分文件管理

## 字段类型

- 业务字段优先用 `string` / `number` / `boolean`
- ❌ 不默认用 `any`
- ⚠️ 可选字段用 `?`，可空字段用 `| null`

```typescript
interface Customer {
  id: string;
  name: string;
  remark?: string; // 可选
  closedAt: string | null; // 可空（后端明确返回 null）
}
```

## 与 @robot-admin/git-standards 兼容

| 项目状态             | 处理                                       |
| -------------------- | ------------------------------------------ |
| 已有 `tsconfig.json` | ✅ 直接安装 git-standards，零冲突          |
| 无 TS 环境           | 先 `tsc --init` 初始化，再装 git-standards |

> ESLint TS 规则维持 `warn`（风格类，不阻断提交）；**类型错误阻断由 R14 兜底**（`vue-tsc --noEmit` 非零退出码 → error），二者职责分离：ESLint 管风格，R14 管正确性。

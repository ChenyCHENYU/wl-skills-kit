# 最佳实践索引（Best Practices Playbook）

> **本文件是 AI 与团队成员共享的"按场景查手册"**。
>
> - 对 AI：**每次进入项目对话时默认读取一次**，用于把用户的自然表达精准映射到推荐流程，减少"靠关键词猜触发"
> - 对人：当成 Runbook 用，按场景找最佳实践、触发话术、避坑要点
>
> 维护策略：场景由实战沉淀，每次踩坑都回写到对应条目；新增 Skill / MCP 工具必须在此登记典型用法。

---

## 0. 通用前置规则（任一场景共用）

| # | 规则 |
|---|---|
| 1 | 用户的"自然表达"优先于"关键词命中"。先理解意图再决定是否触发 Skill |
| 2 | 涉及 **sync 类**（菜单/字典/权限）操作时，**必读** `skills/sync/_mcp-guardrail.md`，调用失败不绕开 MCP，按 guardrail §2 自愈剧本引导用户 |
| 3 | 每个场景都允许「单步执行」或「流水线执行」两种方式，由用户决定 |
| 4 | 写文件 / 调写接口 / 修改代码前，输出 Pre-flight 声明并等待用户确认 |
| 5 | 报告类产物统一写入 `.github/reports/`，**追加不覆盖** |

---

## 1. 场景：新建模块完整闭环（最常用）

> 从原型/详设 → 页面 → 菜单注册 → 字典/权限补齐 → 审计通过

**用户典型话术**：
- "帮我做一个新模块"
- "根据原型/详设生成 XX 模块"
- "我要新建客户管理模块"

**推荐流程**：

```
prototype-scan
  → business-doc-extract（资料完整时）
  → api-contract
  → page-codegen           ← 产物：src/views/.../{index.vue,data.ts,api.md,SYS_MENU_INFO.md}
  → menu-sync              ← 推荐工具：wls_menu_sync_from_report
  → dict-sync（页面用到字典时）
  → permission-sync（需角色授权 / 动作按钮时）
  → convention-audit
```

**关键检查点**：
- pages.ts 是否注册了新页面（否则路由不存在）
- `.github/reports/SYS_MENU_INFO.md` 是否包含本次新增页面
- 同步菜单后端 4004 / 401 → 走 guardrail 引导用户改 env.local.json

---

## 2. 场景：补菜单 / 注册菜单

**用户典型话术**：
- "帮我创建菜单"
- "同步菜单"
- "页面写完了点不进去"
- "补菜单"

**推荐流程**（默认一步到位）：

```
wls_menu_sync_from_report  ← MCP 工具，自动读报告 + 查菜单树 + 一二级有序创建
  └─ 首次先传 dryRun: true 预览，确认无误再正式执行
```

**前置**：
- `.github/reports/SYS_MENU_INFO.md` 已生成（由 page-codegen 产出，或手工维护）
- `env.local.json` 配齐：gatewayPath / token（纯 JWT）/ sysAppNo / menu.parentMenuId / menu.domainId

**典型故障 → 处理**：
- 工具列表里没有 `wls_menu_sync_from_report` → guardrail §2.2
- 报错"请填写真实的 domainId" → guardrail §2.3
- 返回 401 → guardrail §2.4
- 返回 4004（路径不存在）→ guardrail §2.5

---

## 3. 场景：补字典 / 同步字典

**用户典型话术**：
- "同步字典"
- "data.ts 里 logicValue 缺字典"
- "字典对比 / 字典审计"

**推荐流程**：

```
1. 用 wls_dict_query 查线上已有
2. 扫 data.ts 收集所有 logicValue（DICT_CODE）
3. 差集 = 待新建 → 用户确认
4. 逐个调 wls_dict_upsert（含 module + items）
5. 更新 .github/reports/SYS_DICT_INFO.md
```

**配置依赖**：env.local.json → `dict.moduleId`

---

## 4. 场景：角色授权 / 加动作按钮

**用户典型话术**：
- "给 XX 角色分配菜单"
- "给页面挂动作按钮"
- "注册权限码"

**推荐流程**：

| 子场景 | MCP 工具序列 |
|---|---|
| 创建角色 | `wls_role_query`（查重）→ `wls_role_upsert` |
| 角色授权 | `wls_role_query` → `wls_assignable_menus_query` → `wls_role_assign_menus`（⚠️ **全量覆盖**，AI 需自动合并旧 menuIds + 新增）|
| 挂动作 | `wls_menu_query` 找页面 id → `wls_action_query` 查重 → `wls_action_upsert` 批量新增 → 修改 `data.ts` 给按钮加 `permission: [xxx]` 字段 |

**避坑**：
- 角色分配是**全量覆盖**，传 `[A,B]` 会把原有 C 移除，必须先查再合并
- 权限码命名遵循项目既有风格（`资源_动作` 或 `模块:资源:动作`）

---

## 5. 场景：存量项目体检 / 接手新项目

**用户典型话术**：
- "接手新项目"
- "项目体检"
- "规范审计"

**推荐流程**：

```
wls_code_scan          ← 概览：页面目录、API_CONFIG、文件完整性
  → convention-audit   ← 14 条规范全量扫描，产出 AUDIT_*.md
  → code-fix（可选）   ← 自动修复可整改项
```

---

## 6. 场景：仅 mock 跑通 / 后端没好先能跑

**用户典型话术**："先 mock 一下"、"假数据"、"后端没好先能跑"

**推荐**：`page-codegen` 的 mock-first 规则。Mock 架构详见 `docs/mock-architecture.md`。

```
mock/
├── _utils.ts              ← 共享工具（kit init 自动写入）
└── [业务域]/[模块].ts     ← 按 src/views 第一级域分目录
```

- 生成页面自动生成 `mock/[业务域]/[模块].ts`，import `../_utils` 共享工具
- 开关：`.env.dev` 中 `ENV_MOCK=true/false`，零污染切换
- 清理：`wl-skills mock-clean --domain [域]` 按域清理，`--all` 全量清理（保留 `_utils.ts`）

---

## 7. 场景：模板沉淀

**用户典型话术**："这页面成熟了，沉淀成模板"

**推荐**：`template-extract` Skill → 产出 `templates/domains/**/TPL-*.md` → 下次 `page-codegen` 复用。

---

## 8. 场景：业务文档/字段字典维护

**用户典型话术**：用户提供完整原型/详设/字段或字典资料，意图为业务沉淀

**推荐**：`business-doc-extract`（**语义级触发**，碎片需求默认跳过）

---

## 9. 场景：Git 提交 / 分支管理

**用户典型话术**："提交"、"发布"、"打 tag"

**推荐**：遵循 `standards/08-*.md` Git 规范，使用 `pnpm cz` / `pnpm release:*` 命令。

---

## 10. 索引：Skill / MCP 工具速查

### Skills（详见 `_registry.md`）

| Skill | 一句话 |
|---|---|
| prototype-scan | 原型/详设 → 页面清单 |
| business-doc-extract | 模块级资料 → 业务文档沉淀 |
| api-contract | 生成 `api.md` 接口约定 |
| page-codegen | 生成 Vue 页面三件套 + api.md + SYS_MENU_INFO.md |
| convention-audit | 14 条规范审计 |
| code-fix | 按审计报告自动修复 |
| menu-sync | 后端菜单同步（MCP）|
| dict-sync | 后端字典同步（MCP）|
| permission-sync | 角色 / 授权 / 动作（MCP）|
| template-extract | 成熟页面沉淀为模板 |

### MCP 工具（详见 `mcp/registry.js`）

| 工具 | 用途 |
|---|---|
| `wls_menu_query` / `wls_menu_upsert` / `wls_menu_sync_from_report` | 菜单 |
| `wls_dict_query` / `wls_dict_upsert` | 字典 |
| `wls_role_query` / `wls_role_upsert` / `wls_assignable_menus_query` / `wls_role_assign_menus` / `wls_action_query` / `wls_action_upsert` | 角色 / 授权 / 动作 |
| `wls_code_scan` / `wls_validate_page` / `wls_doctor_ui` / `wls_route_check` / `wls_git_log_extract` / `wls_audit_report_push` | 辅助 |

---

## 11. 如何扩展本文件

新增场景请按此模板：

```markdown
## N. 场景：{一句话描述}

**用户典型话术**：
- "..."

**推荐流程**：
- 用什么 Skill / MCP 工具
- 关键顺序
- 配置依赖

**避坑**：
- ...
```

---

> ✅ AI 在每轮对话开始时（首次进入项目或长时间未刷新上下文时），优先 `read_file` 加载本文件 + `_registry.md` + `_pipeline.md`，三者联合作为路由依据。

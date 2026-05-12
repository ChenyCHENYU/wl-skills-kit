# Skill Pipeline 协议

> 本文件定义 Skill 间的输入/输出契约和推荐后续动作，是 Agent Pipeline 的调度依据。
> Pipeline 只做**建议式串联**：AI 完成一步后提示下一步，是否继续由用户确认。

---

## 1. 基本原则

- **可单独触发**：任何 Skill 都必须能独立运行，不依赖前一步强制存在
- **可链式建议**：若存在明确后续动作，AI 必须在完成摘要中给出 `next_suggest`
- **可回退重跑**：任一步骤结果不满意，只重跑该步骤及其后续步骤
- **人工确认**：涉及写文件、调接口、修复代码、发通知的动作必须等待用户确认
- **报告可追溯**：跨步骤传递优先使用文件路径，而不是仅依赖聊天上下文

---

## 2. Pipeline 总览

```text
prototype-scan
  → business-doc-extract（可选，资料达模块级时推荐）
  → api-contract
  → page-codegen
  → convention-audit
  → code-fix（可选）
  → menu-sync / dict-sync / permission-sync（按页面需要选择）
  → template-extract（成熟页面沉淀，可选）
```

常见变体：

```text
口述需求 → page-codegen → convention-audit                  // 碎片化，不走业务文档
存量项目反向梳理 → business-doc-extract → convention-audit
原型/详设 → business-doc-extract → api-contract → page-codegen
存量项目体检 → convention-audit → code-fix
只同步菜单 → menu-sync
只同步字典 → dict-sync
只做权限 → permission-sync
```

> `business-doc-extract` 是**建议性插入点**，不是必经步骤：仅在资料达到模块/项目级完整度、且用户意图为业务沉淀时才走；碎片需求默认跳过。

---

## 3. Skill I/O 契约

| Skill | input_from | output_file | next_suggest |
|---|---|---|---|
| `prototype-scan` | 原型/详设/口述需求 | `.github/reports/PROTOTYPE_SCAN_*.md` | `business-doc-extract`（资料达模块级）或 `api-contract` |
| `business-doc-extract` | 已发布原型目录 / 详设 / 字段实体 / 字典资料 / 现有页面 + `api.md` / `prototype-scan` 输出 | `docs/business/index.md` + `docs/business/open-questions.md` + `docs/business/0X-xx/{index,requirement,dictionary,field}.md` | `api-contract` 或 `page-codegen`（项目需求依据） |
| `api-contract` | `prototype-scan` 输出、`docs/business/0X-xx/requirement.md` + `field.md` 或用户口述接口信息 | `src/views/**/api.md` | `page-codegen` |
| `page-codegen` | `api.md` / page-spec / 用户口述需求 | `src/views/**/{index.vue,data.ts,index.scss,api.md}` + `.github/reports/SYS_MENU_INFO.md` | `convention-audit`；如有菜单则 `menu-sync` |
| `convention-audit` | 任意源码目录或文件 | `.github/reports/AUDIT_*.md` | 有可自动修复项时 `code-fix`；有菜单/字典/权限差异时对应 sync Skill |
| `code-fix` | `convention-audit` 报告 | 源码 diff / 修复摘要 | `convention-audit` 复扫 |
| `menu-sync` | `.github/reports/SYS_MENU_INFO.md` | 后端菜单数据 + 同步摘要 | `permission-sync`（如需角色授权/动作） |
| `dict-sync` | `.github/reports/SYS_DICT_INFO.md` | 后端字典数据 + 同步摘要 | `convention-audit` 复扫（如页面依赖字典） |
| `permission-sync` | `.github/reports/SYS_PERMISSION_INFO.md` 或用户口述权限需求 | 后端角色/授权/动作数据 + 同步摘要 | `convention-audit` 复扫权限码使用 |
| `template-extract` | 成熟页面目录 | `templates/domains/**/TPL-*.md` 或模板草案 | `page-codegen` 复用新模板 |

---

## 4. Agent 执行规范

AI 每完成一个 Skill，必须输出：

```text
## 完成摘要
- 产物：{output_file}
- 关键数据：{counts / changed files / backend ids}
- 风险：{manual review items}

## 建议下一步
- next_suggest：{skill-name}
- 原因：{why}
- 是否需要用户确认：是
```

---

## 5. MCP/CLI 辅助能力

| 能力 | 推荐调用时机 | 用途 |
|---|---|---|
| `wls_code_scan` | Pipeline 开始或审计前 | 获取页面目录、文件完整性、API_CONFIG 概览 |
| `wls_route_check` | `page-codegen` 或 `menu-sync` 后 | 检查页面目录是否在路由文件中可被发现 |
| `wls_git_log_extract` | `convention-audit` 或 `changelog-gen` 前 | 提取近期提交，辅助 Git 规范审计 |
| `wl-skills check` | 新成员接入/问题排查 | 本地工具链与 MCP 配置预检 |
| `wl-skills diff` | `update` 前 | 预览 kit 文件变化 |
| `wl-skills validate` | CI 或审计前 | 无 AI 静态检查页面文件完整性 |

---

## 6. 不进入本轮 Pipeline 的内容

领域专属 Skill（例如 sale/produce 的合同审批流模板）暂不纳入本轮 Pipeline 基础协议。此类能力应在通用 Pipeline 稳定后，由具体业务域单独评估、提取和注册。

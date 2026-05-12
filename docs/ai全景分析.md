# AI 辅助开发全景分析 & 架构演进蓝图

> **基于 wl-skills-kit v2.5.2 架构**
> **日期**：2026-05-12
> **目标**：企业级通用 · 质量精度高 · 速度快 · 节省 token · 还原度高 · 开箱即用 · 支持 Agent Pipeline

---

## 1. 能力层级

```text
L1 提示词工程         ✅ copilot-instructions + 多编辑器适配 + standards 懒加载
L2 Skills             ✅ 9 个启用 Skill + registry + pre-flight
L3 MCP                ✅ 17 个 Tool（菜单/字典/权限/项目感知/页面校验/UI 体检/通知）
L4 CLI                ✅ init/update/clean/check/diff/validate/validate-page/doctor-ui/export
L5 Agent Pipeline     🟡 已落地协议与运行手册，可进入试运行
L6 Multi-Agent        🔭 L5 稳定后再评估
L7 自演化体系         🔭 需要足够审计报告与模板样本后再规划
```

---

## 2. 当前核心资产

| 资产 | 数量/状态 | 说明 |
|---|---:|---|
| Standards | 13 条 | 场景化 code-structure、Git 审计、AGGrid 判定均已纳入 |
| Skills | 9 个 | core/sync/ops 全部启用，domain 暂不扩展 |
| MCP Tools | 17 个 | 覆盖 code_scan / route_check / validate_page / doctor_ui / git_log_extract / audit_report_push 等 |
| CLI 命令 | 9 个 | init / update / clean / check / diff / validate / validate-page / doctor-ui / export |
| Pipeline 协议 | 1 份 | `.github/skills/_pipeline.md` |
| 全盘分析文档 | 1 份 | `docs/全盘分析与智能体搭建指南.md` |

---

## 3. v2.5.x 关键能力

### 3.1 Agent Pipeline

已新增：

```text
files/.github/skills/_pipeline.md
```

用于定义：

- Skill 输入来源
- Skill 产物路径
- 推荐后续动作
- Agent 完成摘要格式
- 人工确认边界

### 3.2 MCP 项目感知工具

| Tool | 价值 |
|---|---|
| `wls_code_scan` | 扫描页面目录、文件完整性、API_CONFIG 分布 |
| `wls_route_check` | 检查页面是否可被路由发现 |
| `wls_validate_page` | 校验 AGGrid/cid/api.md/mock/操作列等页面规范 |
| `wls_doctor_ui` | 检查 wk-skills-ui tokens、styles、preset 和 runtime 接入 |
| `wls_git_log_extract` | 提取最近提交，支撑 Git 审计/变更日志 |
| `wls_audit_report_push` | 可选推送审计报告到飞书 webhook |

### 3.3 CLI 质量工具

| 命令 | 价值 |
|---|---|
| `wl-skills check` | 新成员接入和环境排查 |
| `wl-skills diff` | update 前评估文件变化 |
| `wl-skills validate` | 无 AI 静态检查页面完整性、AGGrid、cid、mock、api.md |
| `wl-skills validate-page` | 针对单页/目录做即时校验 |
| `wl-skills doctor-ui` | 检查 wk-skills-ui 是否真实接入 |
| `wl-skills export` | 导出菜单/字典/权限基线为 xlsx |

---

## 4. 智能体搭建建议

### 4.1 最小可用 Agent

```text
用户目标
  → 读取 _registry.md 匹配 Skill
  → 读取 _pipeline.md 判断上下游
  → wls_code_scan 感知项目结构
  → validate-page / doctor-ui 做本地校验
  → 执行 Skill
  → 输出完成摘要 + next_suggest
  → 用户确认后继续下一步
```

### 4.2 推荐主链路

```text
prototype-scan
  → api-contract
  → page-codegen
  → validate-page
  → convention-audit
  → code-fix（可选）
  → convention-audit 复扫
  → menu-sync / dict-sync / permission-sync（按需）
```

### 4.3 存量项目治理链路

```text
wls_code_scan
  → convention-audit
  → code-fix
  → convention-audit 复扫
  → wl-skills validate / doctor-ui
```

---

## 5. 后续路线

### 短期

- 在真实项目中试跑 Agent Pipeline
- 将 `wl-skills validate` / `doctor-ui` 接入 CI 非阻断阶段
- 持续收集 convention-audit 报告样本
- 为复杂任务生成 `PIPELINE_RUN_YYYYMMDD_HHmm.md` 运行报告

### 中期

- `prototype-diff`：新版原型 vs 已有代码
- `api-impact-scan`：api.md 变更影响面
- `changelog-gen`：基于 `wls_git_log_extract` 生成变更摘要
- `perf-audit`：AGGrid 性能反模式扫描

### 暂不推进

- sale/produce 领域 Skill
- Multi-Agent 编排框架
- 自演化自动合并规范

---

## 6. 结论

v2.5.x 后，wl-skills-kit 已具备搭建通用智能体的基础条件：

- 有 Skills 作为结构化能力单元
- 有 MCP 作为实时项目感知与副作用执行工具
- 有 CLI 作为无 AI 的质量兜底
- 有 `_pipeline.md` 作为 Agent 串联协议
- 有 `wk-skills-ui` 可选桥接作为 UI Runtime 治理边界

下一步应先在真实业务项目中稳定跑通通用 Pipeline，再考虑领域 Skill 或 Multi-Agent。

# Agent Pipeline 运行手册

> **版本基线**：wl-skills-kit v2.5.2  
> **定位**：给 AI 编辑器、团队成员和 CI 统一一套可追踪、可回退、可复扫的 Agent Pipeline 执行方法。

---

## 1. 核心目标

Agent Pipeline 不是让 AI 一次性自动做完所有事，而是把复杂任务拆成可验证步骤：

```text
项目感知 → Skill 调度 → 生成/同步/修复 → 本地校验 → 人工确认 → 复扫闭环
```

每一步都必须有：

- **输入**：用户需求、原型、详设、报告或文件路径
- **动作**：触发的 Skill、CLI 或 MCP Tool
- **输出**：文件、报告、后端数据或检查结果
- **确认点**：是否涉及写文件、写后端或外部推送
- **下一步**：`next_suggest`

---

## 2. 标准链路

### 2.1 原型到页面

```text
prototype-scan
→ api-contract
→ page-codegen
→ validate-page
→ convention-audit
→ code-fix（可选）
→ convention-audit 复扫
```

适用场景：有 Axure、截图、详设、page-spec 或较完整口述需求。

### 2.2 口述需求到可运行页面

```text
page-codegen
→ validate-page
→ doctor-ui（如接入 wk-skills-ui）
→ convention-audit
```

适用场景：用户只描述“做个页面”“先 mock 能跑”。

### 2.3 存量项目体检

```text
wls_code_scan
→ wls_git_log_extract
→ convention-audit
→ code-fix（仅修明确可自动修复项）
→ validate / validate-page
→ convention-audit 复扫
```

适用场景：接手存量模块、评估规范偏差、准备重构。

### 2.4 菜单/字典/权限闭环

```text
page-codegen 产出 SYS_* 报告
→ query 类 MCP Tool 获取现状
→ 展示差异和写入计划
→ 用户确认
→ upsert / sync 类 MCP Tool
→ route_check / validate_page / convention-audit 复扫
```

适用场景：页面已生成，需要同步后台菜单、字典、角色授权或动作权限。

---

## 3. Pipeline 运行报告

建议每次复杂任务生成：

```text
.github/reports/PIPELINE_RUN_YYYYMMDD_HHmm.md
```

报告字段：

| 字段 | 说明 |
|---|---|
| 用户目标 | 原始需求摘要 |
| 触发 Skill | 实际执行的 Skill 列表 |
| 必读规范 | 已加载的 standards 文件 |
| 调用工具 | CLI/MCP Tool 调用清单 |
| 输入产物 | 原型、详设、api.md、审计报告等 |
| 输出产物 | 新增/修改文件、报告、后端同步摘要 |
| 风险项 | 需要人工 review 或后续治理的问题 |
| 人工确认点 | 写文件、调接口、授权覆盖、外部推送等 |
| 复扫结果 | validate、doctor-ui、route_check、convention-audit 结果 |
| next_suggest | 下一步建议 |

---

## 4. Agent 输出规范

每个阶段完成后，Agent 必须输出：

```text
## 完成摘要
- 产物：{output_file}
- 关键数据：{counts / changed files / backend ids}
- 风险：{manual review items}

## 建议下一步
- next_suggest：{skill-name / cli / mcp tool}
- 原因：{why}
- 是否需要用户确认：是/否
```

涉及以下动作时，`是否需要用户确认` 必须为“是”：

- 写源码文件
- 修改 `.github/reports/` 基线
- 调用后端写接口
- 覆盖角色授权
- 推送飞书/外部通知
- 发版、提交、推送远端

---

## 5. 推荐验证组合

### 本地页面质量

```bash
npx @agile-team/wl-skills-kit validate
npx @agile-team/wl-skills-kit validate-page src/views/xxx/yyy
npx @agile-team/wl-skills-kit doctor-ui
```

### MCP 项目感知

```text
wls_code_scan({ path: "src/views" })
wls_route_check({ path: "src/views" })
wls_git_log_extract({ n: 20 })
```

### 发布前自检

```bash
node --check bin/wl-skills.js
node --check mcp/server.js
node --check mcp/tools/projectTools.js
npm pack --dry-run
git diff --check
```

---

## 6. 回退策略

- **单步失败**：只重跑当前 Skill 和后续步骤，不从头重跑。
- **页面生成不满意**：保留 `api.md`，重跑 `page-codegen`。
- **审计修复不满意**：回退源码 diff，保留审计报告。
- **菜单/字典同步异常**：基于报告和后台查询结果人工校正，再重跑 query 类工具验证。
- **权限授权异常**：优先重新确认全量 `menuIds`，再执行覆盖式授权。

---

## 7. 与 wk-skills-ui 的协作

当业务项目接入 `@agile-team/wk-skills-ui` 时，Pipeline 需要额外检查：

- design tokens 是否引入
- styles preset 是否引入
- `installCommonPreset()` 是否调用
- 页面列定义是否使用 `defineColumns()`
- 操作列是否使用 `renderOps()`

推荐步骤：

```text
page-codegen
→ doctor-ui
→ validate-page
→ convention-audit
```

---

## 8. 当前不建议自动化的事项

- 不建议让 Agent 自动执行 R3/R4 MCP Tool。
- 不建议自动合并规范自演化结论。
- 不建议直接启动 Multi-Agent 编排框架。
- 不建议把 sale/produce 等领域专属流程塞入主包，成熟后应拆为独立领域包。

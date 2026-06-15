# 使用指南：code-fix（受控自动修复）

> **谁读这个文档**：团队成员（前端 / 接手老项目时）
> **AI 触发文件**：同目录 `SKILL.md`

---

## 这个 Skill 解决什么问题

`convention-audit` 跑完会生成 `reports/规范审查报告.md`，里面列出 N 条偏差，按 🔴/🟡/🟢 分级。如果手动一条一条改，效率很低；但**全量交给 AI 自动改**又会引入隐性破坏。

`code-fix` 的定位是：**只修 🟡 / 🟢 级偏差，且每条都要 diff 预览 + 用户确认**。

---

## 何时使用

- `convention-audit` 报告里堆积了大量 🟡 / 🟢 偏差（如缺 `:scoped` / 缺 `cid` / 缺导入顺序等）
- 接手老项目，想批量整改 ESLint 之外的项目内规范
- PR 评审前快速把"低风险偏差"清干净，让 reviewer 只看业务逻辑

**不适用场景**：

- 🔴 严重偏差（结构错误 / 用错组件 / 接口契约不符等）→ 用 `page-codegen` 重新生成或人工重写
- 业务逻辑变更 → code-fix 不参与；这是 PR 的活
- 没跑过 `convention-audit` → 必须先有报告，code-fix 不会自己扫代码

---

## 触发关键词

`自动修复` / `整改偏差` / `修复报告` / `规范整改` / `code fix`

---

## 前置条件

1. 项目根有 `reports/规范审查报告.md`（来自 `convention-audit` 的最新一次输出）
2. 报告里 issue 项明确（含 issueId / 文件路径 / 行号 / 偏差类型）

---

## 标准对话示例

```
你：把规范审查报告里 🟡 级的偏差都修一下
AI：[Pre-flight]
    步骤 1：读取 reports/规范审查报告.md，识别到：
       - 🔴 严重 3 项（不修）
       - 🟡 中 12 项（可修）
       - 🟢 低 8 项（可修）
    步骤 2：本次修复目标：12 + 8 = 20 项
    步骤 3：分组展示前 5 项 diff：

       [issue-001] src/views/sale/order/index.vue:24
       - <style lang="scss">
       + <style lang="scss" scoped>

       [issue-002] src/views/sale/order/index.vue:80
       - <BaseTable :columns="columns" />
       + <BaseTable :cid="ORDER_CID" :columns="columns" />

       ... (再展示 3 项)

    [需你确认] 这 5 项 yes 后继续看后续 15 项？逐组 yes/no？
你：yes，全部一起改了吧
AI：执行第 1 组（5 项）写入 → 标记报告条目为 ✅ 已修复 → 显示下一组
    ...
```

---

## 输出物

1. **修改后的源文件**（每条 issue 命中的文件被精准 patch）
2. **报告条目状态更新**：`reports/规范审查报告.md` 中对应 issueId 标记为 ✅ 已修复 + 时间戳
3. **修复摘要**（可选）：`reports/CODE_FIX_<YYYYMMDD>.md` —— 本次共修复 N 项，按文件聚合

---

## 受控原则（严格执行）

| 原则 | 说明 |
|---|---|
| **不修 🔴** | 严重偏差必须人工或 page-codegen 处理，code-fix 不介入 |
| **不破坏功能** | 只改报告点名的行，不顺手"重构"周边代码 |
| **不批量盲改** | 每个文件都先 diff 预览，禁止跳过用户确认 |
| **不生成新逻辑** | 只修偏差，不做功能补全（那是 page-codegen 的职责） |
| **范围明确** | 若用户引导修改业务逻辑，必须拒绝并说明原因 |

---

## 常见踩坑

| 现象 | 原因 | 解法 |
|---|---|---|
| diff 看着对，但 lint 又报新错 | 修复策略与项目 ESLint 配置不一致 | 先跑 `npm run lint` 看新报错；调整 SKILL 里的 rule-based 策略 |
| 报告里 issueId 被改回去了 | code-fix 修完后又有人手工改回旧写法 | PR 评审环节加"不要逆向修改"约束 |
| AI 想"顺手优化"周边逻辑 | 模型主动性过强 | 在指令里加"严格按 issueId 修复，不做其他改动" |
| 两次 code-fix 的 diff 不一致 | 中间 convention-audit 没重跑 | code-fix 之前必须先 audit，保证报告是最新快照 |

---

## 团队协作流程

```
[每次 PR 之前]
1. wl-skills validate-page <修改过的页面>      # 单页快速校验
2. convention-audit                             # 生成最新偏差报告
3. code-fix                                      # 修 🟡/🟢
4. 再跑一次 convention-audit                     # 复扫确认 🟡/🟢 → 0
5. PR 提交（reviewer 只看 🔴 处理 + 业务逻辑）
```

> 复扫这一步**必做**：避免 code-fix 改完之后又引入新偏差。

---

## FAQ

**Q：能跳过用户确认直接全部改吗？**
A：**不允许**。code-fix 的核心定位就是"受控"，跳过确认会变成黑盒整改。要全自动请用 ESLint --fix。

**Q：和 ESLint --fix 有什么区别？**
A：ESLint 修语法/格式（自动化没风险），code-fix 修**项目内规范**（如 cid/operations/`:scoped`/导入顺序/AGGrid 写法 等 ESLint 不覆盖的规则）。两者互补，建议先 ESLint 再 code-fix。

**Q：code-fix 改完会不会破坏 mock-first？**
A：不会。code-fix 只动报告点名的行，mock-first 相关字段（`API_CONFIG.useMock` 等）不在受控修复范围。

**Q：和 page-codegen 重新生成有什么区别？**
A：`page-codegen` 是"重写整个页面骨架"，适合 🔴 级整页结构错误；`code-fix` 是"按 issue 精准修",  适合 🟡/🟢 级零碎偏差。两者互补，混用即可。

# 使用指南：template-extract（模板提取）

> **谁读这个文档**：团队成员（主要前端，模板贡献者）
> **AI 触发文件**：同目录 `SKILL.md`

---

## 这个 Skill 解决什么问题

把项目里**已经写得很好的页面**抽取成 wl-scenario JSON 场景模板，沉淀到
`.wl-skills/templates/scenarios/<域>/`。下次同类页面不再让 AI 从零写代码，
而是 `wl-skills scenario render` 确定性生成 —— 同一个 JSON 永远得到同一份标准代码。

检索阶段用 **Page Blueprint**（不含业务代码的结构事实，`wl-skills snapshot` +
`wl-skills template search` / `wls_template_*` MCP 工具）以低 token 判断"是否已有可复用场景"；
落盘阶段用 **wl-scenario JSON**（可确定性渲染的事实源）。蓝图负责找得像，场景负责还原得出来。

---

## 何时使用

- 写完一个"代表性强、规范度高"的页面，想沉淀给团队复用
- 同模块内重复结构出现 ≥ 3 次，应抽场景模板
- 季度/版本末整理沉淀产出

---

## 触发关键词

`提取模板` / `抽取模板` / `沉淀模板` / `模板贡献` / `提取场景`

---

## 标准对话示例

```
你：把 src/views/sale/demo/domestic-trade-order/ 提取成场景模板
AI：[Pre-flight]
    ✅ wl-skills template search --query "内贸 订单"   → 无高相似蓝图（继续提取）
    ✅ wl-skills scenario extract --page src/views/sale/demo/domestic-trade-order
    提取结果：pattern=list（codegen 轨）
      - 9 个查询字段（5 字典 / 1 日期范围 / 3 输入）
      - 12 列 / 16 个工具栏按钮 / 2 个标准操作（编辑、删除）
      - 12 个表单字段（弹窗）
    ⚠ 检测到 useTableDelete：将按标准 deleteById 生命周期重建
    ⚠ 检测到 renderType 切换演示：未纳入 scenario 核心
    建议：补充 matchHints ["内贸", "订单列表"]，脱敏 apiConfig 后入库
你：好，入库到 sale 域
AI：✅ 已写入 .wl-skills/templates/scenarios/sale/domestic-trade-order.scenario.json
    📌 scenario validate 通过；render 定点验证与源页面语义一致
```

---

## 输出物（唯一落盘口径）

```
templates/scenarios/<域>/
└── <场景名>.scenario.json    wl-scenario JSON（kind: "wl-scenario"）
```

JSON 结构、双轨说明、extensions 契约见 `.wl-skills/docs/scenario-template.md`
与 `contracts/wl-scenario-template.schema.json`。

结构检索参考（Blueprint，只读不落盘业务代码）：

```
templates/blueprints/<domain>/<scene>/   wl-page-blueprint 结构事实（脱敏）
```

> 旧版 `.tpl` / TPL markdown 产物口径已废弃；codegen 主流程的 TPL 参考实现不受影响。

---

## 常见踩坑

| 现象 | 原因 | 解法 |
| --- | --- | --- |
| 提取后 render 的页面少了自定义方法 | 方法没进 extensions.customMethods | 按 warnings 提示逐条确认，把方法体逐字移入 extensions |
| 模板下次命中率低 | matchHints 太具体 | 用场景词（"工位实绩"优于"电炉LF"），保留 3~5 个 |
| handler 里写了 import 被阻断 | extensions 禁止模块语句 | import 移到 customImports 逐行声明 |
| 字典列变纯文本 | 提取时漏了 dictCode | 补显式 dictCode；禁止按字段名猜 |
| runtime 模板 render 失败 | 项目无 PatternPageRenderer | 先落渲染器组件，或改 codegen 轨模板 |

---

## FAQ

**Q：贡献的模板要走 review 吗？**
A：至少同事 review 一次 matchHints + extensions 必要性；直接落盘容易污染场景库。

**Q：新 pattern（形态没人登记过）怎么办？**
A：业务项目内只能存 scenario JSON 样例；pattern 登记 + 编译器实现是 kit 仓库变更，
提 issue/PR 给 kit 维护者（CHENY）。

**Q：模板出问题谁负责？**
A：贡献者维护一个版本周期，稳定后由 kit 维护者接管；JSON 内 `notes` 写明 author 与来源页面。

**Q：能否私有领域只抽到本仓库不发布？**
A：可以。`templates/scenarios/` 跟业务项目走，kit 包不强制收集。

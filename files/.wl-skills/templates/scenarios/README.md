# 场景模板库（scenario templates）

本目录是 **wl-scenario JSON 场景模板库**：结构与展示方式以 JSON 呈现（单一事实源），
实现由 kit 按最佳实践确定性渲染（`wl-skills scenario render`），不依赖 AI 逐行补代码。

```
templates/scenarios/
├── README.md                            本文档
├── universal/
│   └── list.scenario.json               标准列表页（codegen 轨，已实现）
└── produce/
    └── workstation-record.scenario.json 工位实绩（runtime 轨，已实现；需项目渲染器）
```

## 使用方式

```bash
# 1. 复制最接近的模板为项目内 scenario JSON，改 params（pageId/page/字段/字典码）
cp .wl-skills/templates/scenarios/universal/list.scenario.json contracts/customer.scenario.json

# 2. 校验结构（S0/create 按钮规则/handler 安全边界）
wl-skills scenario validate --input contracts/customer.scenario.json

# 3. 预览 → 确认渲染（codegen 轨产四件套；runtime 轨产 definition+薄壳）
wl-skills scenario render --input contracts/customer.scenario.json
wl-skills scenario render --input contracts/customer.scenario.json --confirm

# 4. 存量页面反向沉淀
wl-skills scenario extract --page src/views/sale/customer --output contracts/customer.scenario.json
```

## 往返保证

- **声明式核心**（query/columns/toolbar/operations/formSections/API/cid）：
  `extract(render(doc))` 与 `doc` 定点一致，`data.ts / index.vue / page-spec.json` 字节级还原；
  测试 `tests/scenario-roundtrip.test.js` 锁定，回归即红。
- **非声明式定制代码**：只能进 `extensions`（customImports/customMethods/template.afterToolbar），
  编译时打 `@wl-scenario-ext` 标记逐字嵌入，提取时按标记字节级回捞 —— 无损，但代码不做语义改写。
- 旧形态页面（`operations:` 写法 / 无 cid / dataTable 渲染）可提取，产物按 canonical 升级。

## 模板贡献

新场景先在 kit 仓库 `templates/patterns.json` 登记 pattern（含 track/status），
编译器实现后状态改 `implemented`，样例 JSON 落本目录。流程详见
`skills/core/template-extract/SKILL.md`。

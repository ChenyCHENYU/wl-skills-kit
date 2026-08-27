# wl-scenario 场景模板契约

> **定位**：领域场景的"结构 + 展示方式"以 JSON 呈现（单一事实源）；
> 实现由 kit 按最佳实践**确定性渲染**（双轨），AI 不参与代码补全。
> JSON Schema：`contracts/wl-scenario-template.schema.json`；模式注册表：`skills/core/page-codegen/templates/patterns.json`。

## 设计动机

平台 `AbstractPageQueryHook` 是单资源单表格模型，复杂嵌套页（多 Tab × 主从 × 多表）的
分页状态、生命周期、return 接线呈 N 倍乘法增长（实测对照页 1101 行 vs 运行时化薄壳 15 行）。
解法不是更好的模板，而是：

1. **声明式核心 JSON 化**（query/columns/toolbar/operations/formSections/features 与 page-spec 同源）；
2. **双轨编译**：简单页出全代码（A/codegen 轨），复杂编排页出 definition+薄壳（B/runtime 轨）；
3. **非声明式定制代码逐字进 extensions**，不做语义改写，保证往返无损。

## 字段速览

| 字段 | 说明 |
| --- | --- |
| `kind` / `schemaVersion` | 固定 `wl-scenario` / `1` |
| `templateId` / `domain` / `matchHints` | 模板层标识与命中提示（编译忽略） |
| `pattern` / `renderTrack` | 模式注册表键 + 轨道（codegen / runtime），必须与注册表一致 |
| `page` / `pageId` / `dir` | 页面中文名 / 项目内稳定唯一 ID / 输出目录 |
| `serviceShort` / `resourceName` / `apiConfig` | API 路径推导（`/{service}/{resource}/{op}`）或显式覆盖 |
| `treeResource` | tree-list：树资源名（推导 `/{service}/{treeResource}/tree`） |
| `tableCid` / `pageAbbr` | AGGrid cid（确定性渲染建议显式固定 tableCid；change-history 豁免） |
| `deliveryProfile` | 查询传输与分页基线（缺省包基线 post/1/10） |
| `query` / `columns` / `toolbar` / `operations` | 四大顺序数组，语义与 page-spec 完全同源 |
| `formSections` | 表单分区（存在时 codegen 轨产 modalConfig + c_formModal） |
| `subTables` / `features` | 与 page-spec 同源（lookupFlows / listLifecycle / tabSwitch…） |
| `requires.renderer` | runtime 轨渲染器组件路径（项目内提供，render 前置检查） |
| `extensions[]` | `{slot, code}` 逐字代码区：customImports / customMethods / template.afterToolbar |

## 硬约束（校验阻断）

- 创建类按钮（新增/新建/添加/创建）强制 `primary` 填充、禁 `plain`
- `type: "dict"` 必须显式 `dictCode`；`dictCode` 不得用于非 dict 字段（D3 同源）
- toolbar/operations 的 `custom` 动作必须携带 `handler`（onClick 源码文本）
- handler / extensions 禁止 `import` / `export`（含动态 `import()`）；依赖走 customImports 逐行
- runtime 轨 v1 仅支持标准动作（openModal/edit/del/view）——custom handler 需要 eval，一律拒绝
- pattern 必须已登记；`planned` 状态只允许 validate，不允许 render
- page-spec 投影必须通过 `validateSpecShape`（strict 字段齐全、openQuestions 清零）
- **渲染产物禁止手改**：改动需求必须改 JSON 后重新 render；`scenario verify` 逐字节比对兜底（执行器登记见 `kit-internal/rule-coverage.md`）

## 双轨产物

### codegen 轨（pattern: list 已实现）

```
{dir}/data.ts        canonical 全代码（TPL-LIST 形态逐字符对齐）
{dir}/index.vue      标准骨架（agGrid + cid + BaseToolbar size=small + 生命周期）
{dir}/index.scss     留空占位
{dir}/page-spec.json S1~S7 门禁真值
```

### runtime 轨（pattern: workstation 已实现）

```
{dir}/definition.ts  纯 JSON 字面量导出 pageDefinition（请勿手改，改 JSON 重渲染）
{dir}/index.vue      10 行薄壳 <PatternPageRenderer :definition="pageDefinition" />
{dir}/data.ts        2 行转发（features.definitionSource 委托链校验锚点）
{dir}/page-spec.json 同上
```

## 往返保证（tests/scenario-roundtrip.test.js 机器锁定）

| 维度 | 保证级别 |
| --- | --- |
| 声明式核心（字段/顺序/label/颜色/字典/API/cid） | `extract(render(doc)) === doc` 定点；三产物**字节级**一致 |
| extensions 代码 | 标记块字节级回捞，无损 |
| 旧形态页面（operations: 写法 / 无 cid / dataTable） | 可提取；产物 canonical **升级**，语义保真由 S1~S5+D3 零偏差证明 |
| 已知不可还原项 | 提取 warnings 显式报告（如 useTableDelete 重建为标准 deleteById），不静默丢弃 |

## CLI

```bash
wl-skills scenario validate  --input x.scenario.json
wl-skills scenario render    --input x.scenario.json [--track codegen|runtime] [--output dir] [--confirm]
wl-skills scenario verify    --input x.scenario.json --page src/views/<域>/<模块>/<页面>
wl-skills scenario extract   --page src/views/<域>/<模块>/<页面> [--output x.scenario.json] [--json]
wl-skills scenario from-spec --input <page-spec.json> --service <s> --resource <r> --table-cid <c> \
                             [--output x.scenario.json --confirm]
```

- render 默认预览不写盘，`--confirm` 才落盘；落盘的 page-spec.json 自动携带 `scenarioRef`
  （相对页面目录的事实源指针）；落盘后必须 `wl-skills validate-page <dir>` 复扫。
- **verify 是防漂移执行器**：重新编译 JSON 并与磁盘产物逐字节比对，手改产物未回写 JSON 即报
  drift（codegen 轨要求显式 `tableCid` 保证确定性）。
- **validate 已内置 W1 防漂移**：`wl-skills validate` 遇到带 `scenarioRef` 的 page-spec 自动执行
  同样的逐字节核对，手改产物在提交/CI 阶段即被拦截，无需记得手动 verify。
- **from-spec 是 page-spec → scenario 的引导转换器**：把 prototype-scan / spec-doc-parse 产出的
  page-spec 零手写转为 scenario JSON；业务按钮 onClick 语义不猜测（生成 TODO stub + notes 提示），
  未登记 mode 与 planned 模式显式报错/提示。

## 性能/算力（scripts/benchmark-scenario.js，可重复执行）

| 指标 | 实测（本机） | 说明 |
| --- | --- | --- |
| render 单页 | **0.4~0.6ms**（p95 < 1.5ms） | 三档场景：5 列小页 / 20 列大页 / 主从 24+16 列 |
| extract / verify | 各 ~0.4~0.9ms | 均为本地确定性解析 |
| 批量吞吐 | 20 页连续 render ≈ 8ms | 每页 ~0.4ms |
| 模型 token | **0**（render/extract/verify 全程） | 对比 AI 主流程每页：输入上下文 ≈ 1.9~2.0 万 token（仓库实测 SKILL+TPL+standards+references）+ 输出 ≈ 3.4~3.7 千 token |
| 确定性 | 同一 JSON 两次编译**字节级一致** | tests/scenario-benchmark.test.js 锁定 |

Token 估算方法（disclosed）：`ceil(ASCII非空白/4 + CJK×1.2)`。AI 路径未计入 api.md 生成、
多轮自检与会话系统提示——实际成本只会更高。

## 与既有体系的关系

- **page-spec.json**：scenario 的投影子集（`scenarioToPageSpec`），继续作为 S1~S7 门禁真值
- **api-contract**：scenario 不替代契约；`apiConfig` 路径应与 wl-api-contract 操作对齐（S6 会核）
- **page-codegen**：scenario render 是其确定性前置层（`references/scenario-templates.md`）
- **template-extract**：产物统一为 scenario JSON（本契约）
- **运行时分发**：kit 不内置渲染器；项目自带 PatternPageRenderer（如炼钢 SteelPageRenderer 形态），
  未来成熟后可独立为 `@agile-team/wl-page-runtime`，scenario 的 `requires` 声明保持不变

## v1 已知边界

- codegen 轨已实现 6 个 pattern：`list`、`master-detail`（单从表）、`tree-list`（需 treeResource）、
  `form-route`（平铺分区变体 FLAT_DETAIL；多 Tab Tabs 变体仍走 page-codegen 主流程）、
  `record-form`（需显式 getByKey/saveOrUpdate + features.responseMapping）、
  `change-history`（需 requires.components[0] 业务 Tabs 组件；产物不依赖 cid）
- runtime 轨仅 `workstation` 实现且限标准动作；多 Tab 编排（tabs）、明细页签（detail-tabs）为 planned
- master-detail v1：从表为只读明细（序号列 + 数据列，无操作列/无查询区）；多从表校验阻断
- **非列表分页页面**（record-form / form-route / change-history）：page-spec 投影不含 query/columns
  （S1~S5 列表比对不适用），结构真值由 W1 字节级防漂移兜底；record-form/form-route 的
  formSections 经 `@wl-scenario-section` 标记字节级往返
- from-spec 转换的业务按钮 handler 为 TODO stub，人工实现前不建议 render --confirm
- mock 文件不参与确定性渲染（按 mockPolicy 由 page-codegen 主流程处理）
- 弹窗表单（list/tree-list/master-detail）归一为 base 分区；多分区弹窗走 FORM_ROUTE pattern

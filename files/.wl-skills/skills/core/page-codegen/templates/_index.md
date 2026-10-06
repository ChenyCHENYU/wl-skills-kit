# 模板注册表（page-codegen 模板单一数据源）

> AI 在生成页面前，**先读取本文件**，定位匹配的 TPL 路径，再读取该 TPL。
>
> **生成入口**：普通新页面优先使用通用 TPL 的平铺写法；列表通用查询按需复用
> `templates/composables/usePageQuery.ts`，需要列扩展才复用 `useBaseTable.ts`。
> 独立表单默认复用 FORM_ROUTE 的 BaseForm 示例；宿主版本兼容可一次落盘
> `useTemplateRef.ts`。`formRules.ts` 仅在确有历史校验差异时按需复用，新表单直接用库预设。
> 用户明确选择 scenario，或已有页面维护 `scenarioRef` 时，继续使用确定性编译器及其往返规则。
> 编译器当前保留类式列表产物；它和直接编码模板是两条兼容路径，不能强迫普通业务维护 JSON。

---

## 确定性渲染状态（与 patterns.json 同源）

| 交互模式 | pattern | 轨道 | 状态 | 生成入口 |
| --- | --- | --- | --- | --- |
| LIST | `list` | codegen | ✅ implemented | `wl-skills scenario render`（显式 scenario 路径；普通页面参考 TPL-LIST） |
| MASTER_DETAIL | `master-detail` | codegen | ✅ implemented | `wl-skills scenario render`（显式 scenario 路径；兼容原有类式模板） |
| TREE_LIST | `tree-list` | codegen | ✅ implemented | `wl-skills scenario render`（显式 scenario 路径；需 treeResource） |
| FORM_ROUTE | `form-route` | codegen | ✅ implemented | `wl-skills scenario render`（显式 scenario 路径；平铺分区变体 FLAT_DETAIL；多 Tab Tabs 变体仍走 TPL） |
| RECORD_FORM | `record-form` | codegen | ✅ implemented | `wl-skills scenario render`（显式 scenario 路径；需显式 getByKey/saveOrUpdate + responseMapping） |
| CHANGE_HISTORY | `change-history` | codegen | ✅ implemented | `wl-skills scenario render`（显式 scenario 路径；需 requires.components[0] 业务 Tabs 组件） |
| WORKSTATION | `workstation` | runtime | ✅ implemented | `wl-skills scenario render`（需项目渲染器；产物 = definition + 薄壳） |
| DETAIL_TABS | `detail-tabs` | runtime | planned | TPL + AI 主流程 |
| FORM_TAB | `tabs` | runtime | planned | TPL + AI 主流程 |

> 确定性编译器及旧领域模板保留兼容；其已实现状态不代表所有页面都必须改成配置驱动。
> TEMPLATE_DRIVEN 与领域模板 OPERATION_STATION 暂无对应 pattern，仍走 TPL 主流程。

---

## 通用模板（与业务域无关）

| 交互模式        | TPL 路径                                    | 适用场景                                |
| --------------- | ------------------------------------------- | --------------------------------------- |
| LIST            | `templates/universal/TPL-LIST.md`           | 标准列表页（查询+工具栏+表格+分页）     |
| FORM_ROUTE      | `templates/universal/TPL-FORM-ROUTE.md`     | 复杂表单独立路由页（多 Tab / 多子表）   |
| MASTER_DETAIL   | `templates/universal/TPL-MASTER-DETAIL.md`  | 主从表页（jh-drag-row 上下分栏）        |
| TREE_LIST       | `templates/universal/TPL-TREE-LIST.md`      | 左树右列表页（jh-drag-col 布局）         |
| DETAIL_TABS     | `templates/universal/TPL-DETAIL-TABS.md`    | 详情 Tab 页（上方表单 + 下方 Tab 子表） |
| CHANGE_HISTORY  | `templates/universal/TPL-CHANGE-HISTORY.md` | 变更历史比对页（时间线 + 字段差异）     |
| RECORD_FORM     | `templates/universal/TPL-RECORD-FORM.md`    | 录入型实绩页（无分页，查询 + 内联表单） |
| TEMPLATE_DRIVEN | `templates/universal/TPL-DRIVEN.md`         | 配置驱动页面（项目已有 Template 组件，data.ts 只需 config 对象，index.vue 3~5 行） |

---

## 领域专属模板

### produce（生产域）

| 模板              | TPL 路径                                             | 适用场景                            |
| ----------------- | ---------------------------------------------------- | ----------------------------------- |
| OPERATION_STATION | `templates/domains/produce/TPL-OPERATION-STATION.md` | 工序操作站（双清单联动 + 内联表单） |

### sale（销售域）

> 暂无领域专属模板。可通过 `template-extract` Skill 从现有页面提取并贡献。

---

## 选择规则

1. AI 优先匹配通用模板（universal/）
2. 若用户明确指定领域且通用模板不适用，匹配 `domains/{domain}/`
3. 若都不匹配，反问用户描述更详细的交互模式，或建议使用 template-extract 先提取标杆页面

---

## 贡献新模板

使用 `template-extract` Skill 从现有项目页面自动提取，详见 `templates/domains/_CONTRIBUTING.md`。

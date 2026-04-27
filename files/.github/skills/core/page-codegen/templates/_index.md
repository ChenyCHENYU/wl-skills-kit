# 模板注册表（page-codegen 模板单一数据源）

> AI 在生成页面前，**先读取本文件**，定位匹配的 TPL 路径，再读取该 TPL。

---

## 通用模板（与业务域无关）

| 交互模式        | TPL 路径                                    | 适用场景                                |
| --------------- | ------------------------------------------- | --------------------------------------- |
| LIST            | `templates/universal/TPL-LIST.md`           | 标准列表页（查询+工具栏+表格+分页）     |
| FORM_ROUTE      | `templates/universal/TPL-FORM-ROUTE.md`     | 复杂表单独立路由页（多 Tab / 多子表）   |
| MASTER_DETAIL   | `templates/universal/TPL-MASTER-DETAIL.md`  | 主从表页（jh-drag-row 上下分栏）        |
| TREE_LIST       | `templates/universal/TPL-TREE-LIST.md`      | 左树右列表页（C_Splitter 布局）         |
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

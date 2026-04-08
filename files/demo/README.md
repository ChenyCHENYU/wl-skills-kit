# demo — 领域样例索引

> AI 学习参考 + 开发者速查。每个样例均可独立运行（Mock 数据，不依赖后端）。
> 安装 wl-skills-kit 后自动导入此目录，**不要在此目录下放业务代码**。

---

## produce/aiflow/ — 生产域（客户档案模块，8 个页面）

| 目录                                  | 模板类型       | 说明                                |
| ------------------------------------- | -------------- | ----------------------------------- |
| `mmwr-customer-archive/`              | LIST + Tabs    | 客户档案列表（带 c_formModal 弹窗） |
| `mmwr-temp-customer-archive/`         | LIST           | 临时客户档案列表                    |
| `mmwr-customer-apply-add/`            | LIST           | 客户新增申请列表                    |
| `mmwr-customer-apply-add-form/`       | FORM_ROUTE     | 客户新增申请表单（独立路由）        |
| `mmwr-customer-apply-change/`         | LIST           | 客户变更申请列表                    |
| `mmwr-customer-apply-change-form/`    | FORM_ROUTE     | 客户变更申请表单（独立路由）        |
| `mmwr-customer-apply-change-history/` | CHANGE_HISTORY | 客户变更历史比对                    |
| `mmwr-customer-detail/`               | DETAIL_TABS    | 客户详情（多 Tab）                  |

## sale/demo/ — 销售域（平台默认样例，5 个页面）

| 目录                     | 模板类型      | 说明                             |
| ------------------------ | ------------- | -------------------------------- |
| `domestic-trade-order/`  | LIST          | 标准内贸订单列表                 |
| `metallurgical-spec/`    | MASTER_DETAIL | 冶金规范（jh-drag-row 上下分栏） |
| `add-demo/`              | FORM_ROUTE    | 新增表单演示（c_formSections）   |
| `billet-flame-cut-plan/` | LIST          | 坯料火焰切割计划列表             |
| `heat-batch-return/`     | LIST + Modal  | 炉批退判（含自定义弹窗）         |

---

## 样例标准

每个目录必须包含：

- `index.vue` — 视图层（纯模板 + createPage 解构）
- `data.ts` — 逻辑层（AbstractPageQueryHook 或 composable）
- `index.scss` — 样式层
- `api.md` — 接口约定（可选）

## 贡献

新增样例请放在 `demo/{domain}/{submodule}/{page-name}/`，提 PR 到 wl-skills-kit 仓库。

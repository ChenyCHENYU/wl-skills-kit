# 使用指南：template-extract（模板提取）

> **谁读这个文档**：团队成员（主要前端，模板贡献者）
> **AI 触发文件**：同目录 `SKILL.md`

---

## 这个 Skill 解决什么问题

把项目里**已经写得很好的页面**抽取成可复用模板，沉淀到 `skills/core/page-codegen/templates/domains/` 下。下次 codegen 时同类页面优先复用。

---

## 何时使用

- 写完一个"代表性强、规范度高"的页面，想沉淀给团队复用
- 同模块内重复结构出现 ≥ 3 次，应抽模板
- 季度/版本末整理沉淀产出

---

## 触发关键词

`提取模板` / `抽取模板` / `沉淀模板` / `模板贡献`

---

## 标准对话示例

```
你：把 src/views/produce/aiflow/mmwr-customer-archive/ 这个页面抽取成模板
AI：[Pre-flight]
    源：mmwr-customer-archive (LIST 类型，含审批工作流)
    建议落位：templates/domains/produce/customer/list-with-approval/
    将抽取：
    - data.ts.tpl  （EColumn 字段保留 + 字段名占位化）
    - index.vue.tpl
    - index.scss.tpl
    - meta.json    （记录适用场景、字段规则、字典）
    占位约定：
    - 资源名 → {{resourceName}}
    - 服务缩写 → {{serviceShort}}
    - 字典 logicValue → {{statusDict}}
    通过 convention-audit 后才落盘。
```

---

## 输出物

```
templates/domains/<域>/<场景>/
├── data.ts.tpl
├── index.vue.tpl
├── index.scss.tpl
├── meta.json    适用条件 / 占位字段说明 / 字典依赖
└── README.md   场景说明 + 何时复用 + 已知限制
```

---

## 模板分级

| 层级         | 路径                             | 复用范围                            |
| ------------ | -------------------------------- | ----------------------------------- |
| `universal/` | `templates/universal/<类型>/`    | 跨业务通用（LIST/DETAIL/TREE_LIST） |
| `domains/`   | `templates/domains/<域>/<场景>/` | 同域同场景                          |

抽取的模板**默认进 domains/**。如果发现真的全员通用，可由维护者升级到 universal/。

---

## 常见踩坑

| 现象                               | 原因                 | 解法                                                            |
| ---------------------------------- | -------------------- | --------------------------------------------------------------- |
| 抽出来的模板里夹着业务字段         | 占位化不彻底         | meta.json 里**穷举所有占位**，AI 才会替换干净                   |
| 模板下次 codegen 命中率低          | 命名/scope 太具体    | 起更通用的场景名（list-with-approval 比 mmwr-customer-list 好） |
| 字典硬编码进模板                   | 没用 logicValue 占位 | 改用 `{{statusDict}}` 占位 + meta 里描述                        |
| 不同业务字段长度不一时模板生成报错 | 列宽硬编码           | 模板里只给推荐值，meta 标"可调"                                 |

---

## FAQ

**Q：贡献的模板要走 review 吗？**
A：建议至少同事 review 一下 meta.json + 是否真有复用价值。直接落盘容易污染模板库。

**Q：模板出问题谁负责？**
A：贡献者维护一段时间，稳定后由 kit 维护者接管。模板里要写 author + lastUpdate。

**Q：能否私有领域只抽到本仓库不发布？**
A：可以。`templates/domains/` 在 `.github/skills/` 下，跟着业务项目走。kit 包不强制收集。

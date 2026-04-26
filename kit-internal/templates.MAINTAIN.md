# templates/ 维护要点

## 当前模板分布（v2.0）

```
templates/
├── _index.md                                    模板注册表
├── universal/   8 个通用模板
│   ├── TPL-LIST.md
│   ├── TPL-MASTER-DETAIL.md
│   ├── TPL-TREE-LIST.md
│   ├── TPL-DETAIL-TABS.md
│   ├── TPL-FORM-ROUTE.md
│   ├── TPL-CHANGE-HISTORY.md
│   ├── TPL-RECORD-FORM.md
│   └── TPL-DRIVEN.md
└── domains/
    ├── _CONTRIBUTING.md
    ├── produce/
    │   └── TPL-OPERATION-STATION.md
    └── sale/
        └── README.md  （placeholder，等贡献）
```

## 添加新模板的判断树

```
新模式出现
  ├─ 是否跨 3+ 业务领域复用？
  │    ├─ 是 → 进 universal/
  │    └─ 否 → 进 domains/{域}/
  └─ 是否能在现有模板基础上改造？
       ├─ 是 → 不新增模板，扩展现有 TPL 的"变体"章节
       └─ 否 → 新增 TPL
```

## TPL-\*.md 必备结构

- 适用场景
- 目录结构
- index.vue 完整代码
- data.ts 完整代码
- index.scss 完整代码
- api.md 模板
- 注意事项 / 已知坑

## 模板提取流程

`template-extract/SKILL.md` 实现了"开发者指路 + AI 读代码 + AI 写模板"的混合流程，强烈推荐替代手写。

## 已知讨论

- 是否需要 TPL 版本化？v2.3 候选
- 大型模板拆分（如 OPERATION-STATION 单文件 1200+ 行）：可考虑用代码块加 `<file>` 标签的方式分段

# 使用指南：page-codegen（页面代码生成）

> **谁读这个文档**：团队成员（主要前端）
> **AI 触发文件**：同目录 `SKILL.md`

---

## 这个 Skill 解决什么问题

基于《页面清单》+ `api.md`，**自动生成符合项目规范的 Vue 页面**（标准页面骨架：index.vue / data.ts / index.scss + api.md + mock 按需），并跑一遍内部规范自检（Pre-flight + 完成摘要）。

生成出来的代码**满足 13 条 standards**，无需手工改语法/命名。

---

## 何时使用

- 已完成 prototype-scan + api-contract，需要批量生成页面代码
- 复用相同模板做新页面（基于 templates/domains/）
- 教新人时希望"按一键就能看到合规示例"

---

## 触发关键词

`生成页面` / `创建页面` / `代码生成` / `vue 页面` / `按原型生成` / `帮我生成` / `列表页` / `管理页` / `台账` / `mock` / `先能跑` / `AGGrid` / `skills-ui`

用户不需要精确说出 Skill 名。只要表达“做个页面”“根据截图生成”“先用假数据”“菜单也加上”“风格没生效”，AI 应自动进入 Intent Router，读取 `page-codegen/SKILL.md`、模板索引、匹配模板和 `standards/12-base-table.md`。

---

## 标准对话示例

```
你：基于 reports/PROTOTYPE_SCAN_客户管理_20260426.md 和各页面的 api.md，生成全部 7 个页面代码
AI：[Pre-flight]
    将创建 7 个目录到 src/views/produce/aiflow/
    每个目录包含：data.ts / index.vue / index.scss / api.md（已存在则跳过）
    模板基线：templates/domains/produce/customer/
    13 条 standards 自检通过项预估：
    ✓ AbstractPageQueryHook 正确继承
    ✓ BaseTable render-type="agGrid"
    ✓ TABLE_CID / 列级 cid 完整
    ✓ defineColumns / renderOps 已使用
    ✓ scoped scss
    ⚠ 待确认：customerStatus 字典 logicValue 名
    [生成中... 8 分钟]
    完成摘要：
    - 新建 7 个页面共 28 个文件
    - 5 处需要人工 review（详见报告）
    - 输出报告：reports/PAGE_CODEGEN_客户管理_20260426.md
```

---

## 输出物

每个页面目录：

```
src/views/<域>/<模块>/<子模块>/<page-name>/
├── data.ts        API_CONFIG、Hook 类、TABLE_CID、defineColumns/renderOps
├── index.vue      template + script + import data.ts
├── index.scss     页面专属样式（已 :deep / scoped 包好）
├── api.md         （由 api-contract 生成，codegen 不覆盖）
└── mock/*.ts      mock-first 场景下生成，端点与 API_CONFIG 对齐
```

外加生成报告：`.github/reports/PAGE_CODEGEN_<模块>_<YYYYMMDD>.md`

---

## 模板复用机制

`page-codegen` 读取 `templates/` 下两个层级：

- **`templates/universal/`**：跨业务通用骨架（LIST / MASTER_DETAIL / TREE_LIST）
- **`templates/domains/<域>/<场景>/`**：领域专属（如 produce/customer/、sale/order/）

**优先级**：domain 命中则用 domain，未命中回落 universal。

> 想沉淀新模板？用 `template-extract` Skill 从已有页面抽取。

---

## 常见踩坑

| 现象                                | 原因                                   | 解法                                                                          |
| ----------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| 生成出来的页面 console 报字典查不到 | 字典还没在 reports/SYS_DICT_INFO.md 中 | 先跑 `dict-sync` 拉取，或手动补 dict                                          |
| 表单弹窗未加 v-loading              | api.md 没标记 save/update 为耗时操作   | 在 api.md 接口清单中加 `**预计耗时：> 2s**` 标记                              |
| `EColumn` 字段缺 `width`            | 模板默认不指定 width                   | 模板里手动加，或选用 `templates/domains/` 下的成品                            |
| AGGrid cid 重复                     | cid 生成不规范                         | 使用 `{页面目录首字母缩写}-{Date.now().toString(36)}`，多表追加 `-sub1/-sub2` |
| 表格不是 AGGrid                     | 模板未写 `render-type="agGrid"`        | 使用最新模板，或运行 `wl-skills validate-page <页面目录>`                     |
| 操作列还是旧按钮                    | 生成了 `operations: []`                | 改成 `defaultSlot + renderOps()`                                              |
| skills-ui 安装但风格没生效          | tokens/styles/preset/runtime 未接入    | 运行 `wl-skills doctor-ui` 查看缺项                                           |

---

## 生成后建议命令

```bash
wl-skills validate-page src/views/<module>/<subModule>/<page>
wl-skills doctor-ui
```

若 AI 可调用 MCP，优先使用：

- `wls_validate_page`
- `wls_doctor_ui`

---

## FAQ

**Q：生成完了但 build 报错？**
A：跑一下 `convention-audit` Skill，会扫出 14 条规范偏差并给出修复建议。

**Q：能否只生成 data.ts 不生成 index.vue？**
A：可以，告诉 AI"只生成 data.ts"。但通常一起生成，因为它们字段必须对齐。

**Q：能否覆盖已有页面？**
A：默认不覆盖。需要明确说"覆盖现有 src/views/xxx/" + AI 会让你二次确认。

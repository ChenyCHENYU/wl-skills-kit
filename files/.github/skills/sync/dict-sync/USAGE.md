# 使用指南：dict-sync（字典同步）

> **谁读这个文档**：团队成员（前端 + 后端联调时）
> **AI 触发文件**：同目录 `SKILL.md`

---

## 这个 Skill 解决什么问题

业务页面里 `data.ts` 引用的字典（`logicType: BusLogicDataType.dict, logicValue: "DICT_CODE"`）需要在低代码平台 **数据字典模块** 中真实存在，否则下拉项为空、表头标签为空。

`dict-sync` 负责：

1. 拉取**线上字典模块及字典项**到 `reports/SYS_DICT_INFO.md`（团队基线）
2. 对比 `data.ts` 引用的字典码 vs 线上字典，**列出缺失字典码**
3. 调用字典模块/字典项保存接口（或生成对照报告供后端建数据）

---

## 何时使用

- 业务页面下拉/状态列空白，怀疑字典码没建
- 一次性从原型/详设里抽取出 N 个新字典，需批量同步
- 同步线上字典基线（DEV / UAT / PROD 拉齐）
- `convention-audit` 报告里出现 "字典码不存在" 类偏差

---

## 触发关键词

`同步字典` / `创建字典` / `刷新字典基线` / `字典对比` / `字典审计`

---

## 前置条件

`.github/skills/sync/env.local.json`（已 gitignore，每个开发者本地填自己的 token）：

```json
{
  "gatewayPath": "http://192.168.10.50:9000",
  "sysAppNo": "QjQuXy1kbKxZyjhS5N2",
  "token": "eyJhbGci...",
  "dict": {
    "moduleId": "7C909G0U2F8HI7E305LV0135LSJ3UBIO"
  }
}
```

`dict.moduleId` 获取方式：低代码平台 → 数据字典 → 新增一条 → DevTools Network → 抓 `moduleId` 字段。

> **向下兼容**：`env.local.json` 不存在时回落到旧路径 `skills/sync/menu-sync/env/env.local.json`。

---

## 标准对话示例

```
你：把 src/views/produce/aiflow/ 里所有页面用到的字典同步一下
AI：[Pre-flight]
    步骤 1：扫描 data.ts，提取 logicValue 形成字典码集合（共 12 个）
    步骤 2：调用 wls_dict_query 拉线上字典模块（已有 8 个，缺 4 个）
    步骤 3：建议新增字典模块 + 字典项：
       - APPLY_STATUS（申请状态：待审核/审核中/已通过/已驳回）
       - CUSTOMER_TYPE（客户类型：临时/正式/合作/战略）
       - ...
    [需你确认]
    - 排序 sortPriority 自动从 1 递增？yes/no
    - 字典名 strName 我直接用截图里的中文，对吗？yes/no
```

---

## 输出物

1. **基线文件**：`reports/SYS_DICT_INFO.md` —— 当前所有线上字典模块 + 字典项的本地基线
2. **同步报告**（可选）：`reports/DICT_SYNC_<YYYYMMDD>.md` —— 本次新增了哪些字典/字典项
3. **缺失对照**：报告附 "未在线上找到的字典码" 列表，便于后端预先建数据

---

## 与 business-doc-extract 的关系

| 维度 | `business-doc-extract` | `dict-sync` |
|---|---|---|
| 职责 | 业务理解 / 设计意图 | 线上事实 / 数据落地 |
| 输出 | `docs/business/0X-xx/dictionary.md`（人读） | 后端字典表（系统读） |
| 时机 | 项目/模块沉淀阶段 | 联调前 / 上线前 |

两者**互不替代**：业务文档说的是"应该有什么字典"，dict-sync 解决"线上有没有"。建议顺序：`business-doc-extract` 整理出 dictionary.md 草案 → 评审 → `dict-sync` 落地。

---

## 常见踩坑

| 现象 | 原因 | 解法 |
|---|---|---|
| 下拉空白但接口返回正常 | 字典码大小写不一致 | 字典码全部 UPPER_SNAKE_CASE，data.ts 与后端对齐 |
| 401/403 报错 | env.local.json 的 token 过期 | 重新登录系统，从 Network 抓 Authorization 替换 |
| 模块新增成功但取不到 id | 接口异步延迟 | dict-sync 已自动 re-query，无需手动处理 |
| 字典项重复创建 | 没读基线就 push | 先跑 `wls_dict_query` 取线上数据 → 对比 → 增量 push |

---

## 团队协作流程

1. **每周一**由 lead 跑一次 `刷新字典基线`，更新 `reports/SYS_DICT_INFO.md`
2. 业务页面 PR 提交前自查 "我加的字典码是否进了基线"
3. 上线前再 sync 一次到生产环境（切换 env 文件中的 gatewayPath）

---

## FAQ

**Q：业务字典 vs 系统字典 vs 状态枚举怎么区分？**
A：状态枚举（如 `APPLY_STATUS`）走系统字典；业务高频可枚举字段（如 `CUSTOMER_TYPE`）走系统字典；纯文本备注、复杂联动数据不走字典。

**Q：能不能让 AI 直接根据 data.ts 自动建字典？**
A：可以，但 **建议人工确认 strName**。AI 从字段中文猜出来的字典名往往不够标准，PR 评审难。先生成对照报告，人工 review 后再 push。

**Q：和 menu-sync / permission-sync 关系？**
A：菜单是入口，字典是值域，权限是访问控制。三者独立但配合。建议顺序：`menu-sync` → `permission-sync` → `dict-sync`。

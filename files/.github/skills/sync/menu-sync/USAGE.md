# 使用指南：menu-sync（菜单同步）

> **谁读这个文档**：团队成员（前端 + 后端联调时）
> **AI 触发文件**：同目录 `SKILL.md`

---

## 这个 Skill 解决什么问题

新页面写完后，需要在系统菜单中**注册一条菜单记录**才能从 UI 访问。这个 Skill：

1. 拉取**线上菜单数据**到 `reports/SYS_MENU_INFO.md`（团队基线）
2. 对比已生成页面 vs 线上菜单，**自动补齐缺失菜单项**
3. 调用菜单注册接口（或生成 SQL 让后端执行）

---

## 何时使用

- 新增页面后，从 UI 访问报"菜单不存在"
- 一次性创建一批页面，需要批量注册菜单
- 同步线上菜单基线（PROD/UAT/DEV 拉齐）

---

## 触发关键词

`创建菜单` / `注册菜单` / `同步菜单` / `补菜单`

---

## 前置条件

`.github/skills/sync/menu-sync/env/env.local.json`（首次使用先填写）：

```json
{
  "gatewayPath": "https://uat-api.example.com",
  "token": "Bearer xxx",
  "tenantId": "10001",
  "rootMenuId": "1234567890"
}
```

> **`env.local.json` 不入 git**（已加 .gitignore）。每个开发者本地填自己的 token。

---

## 标准对话示例

```
你：把 src/views/produce/aiflow/ 下新建的 7 个页面同步到菜单
AI：[Pre-flight]
    步骤 1：读取线上菜单基线 reports/SYS_MENU_INFO.md（最新更新：2025-04-20）
    步骤 2：扫描 src/views/produce/aiflow/ 共 7 个页面
    步骤 3：对比缺失：5 项缺失，2 项已存在
    步骤 4：将调用 /sys/menu/save 创建 5 项
    [需你确认]：
    - 父菜单：精整作业 → 客户管理（rootMenuId: xxx）
    - 排序：sortNo 自动递增
    - 权限标识：mmwr:customer:list 等
    确认 yes/no？
```

---

## 输出物

1. **基线文件**：`.github/reports/SYS_MENU_INFO.md` —— 线上菜单的本地基线（团队 review 用）
2. **同步报告**：`.github/reports/MENU_SYNC_<YYYYMMDD>.md` —— 本次新增/更新了哪些菜单
3. **回滚 SQL**：报告里附带 DELETE SQL，用于回退

---

## 常见踩坑

| 现象                 | 原因                         | 解法                                           |
| -------------------- | ---------------------------- | ---------------------------------------------- |
| 同步成功但 UI 看不到 | 用户角色没分配新菜单         | 跑 permission-sync（PLANNED）或后台手工分配    |
| 401/403 报错         | env.local.json 的 token 过期 | 重新登录系统，从 Network 抓 Authorization 替换 |
| 同名菜单重复创建     | 没读 SYS_MENU_INFO.md 基线   | 先跑一遍"刷新基线"再 sync                      |
| 父菜单 ID 不对       | rootMenuId 配错              | 从浏览器开发者工具看父菜单的 dom data-id       |

---

## 团队协作流程

1. 新人入职，让他先把 `env.local.json` 填一份（参考 env.example.json）
2. **每周一**由 lead 跑一次"刷新基线"，确保 reports/SYS_MENU_INFO.md 最新
3. PR 提交前自查"我加的菜单有没有提交进基线"
4. 上线前再 sync 一次到生产环境（切换 env 文件中的 gatewayPath）

---

## FAQ

**Q：env.local.json 泄露 token 危险吗？**
A：危险。token 视同密码。已加 .gitignore + .npmignore。**不要 commit**。

**Q：能不能直接给 SQL 让后端跑？**
A：能。在指令里加"只生成 SQL，不调用接口"即可。

**Q：和 dict-sync / permission-sync 关系？**
A：菜单是入口，字典是值域，权限是访问控制。三者独立但配合。建议顺序：menu-sync → permission-sync → dict-sync。

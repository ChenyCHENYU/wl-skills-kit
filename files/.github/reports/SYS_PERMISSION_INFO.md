# SYS_PERMISSION_INFO — 权限数据汇总 [PLANNED]

> ⚠️ 本文件为 [PLANNED] 状态。等 `permission-sync` Skill 转正后启用。
>
> 设计草稿：`.github/skills/sync/permission-sync/SKILL.draft.md`

---

## 预期格式

```markdown
| 菜单     | 按钮 | 权限码               | 权限标识   | 备注 |
| -------- | ---- | -------------------- | ---------- | ---- |
| 客户档案 | 新增 | mmwr:customer:add    | btn-add    |      |
| 客户档案 | 编辑 | mmwr:customer:edit   | btn-edit   |      |
| 客户档案 | 删除 | mmwr:customer:delete | btn-delete |      |
```

写入方：page-codegen / permission-collect（PLANNED）
读取方：permission-sync Skill（PLANNED）

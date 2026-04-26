# SYS_DICT_INFO — 字典数据汇总 [PLANNED]

> ⚠️ 本文件为 [PLANNED] 状态。等 `dict-sync` Skill 转正后启用。
>
> 设计草稿：`.github/skills/sync/dict-sync/SKILL.draft.md`

---

## 预期格式

```markdown
| 字典编码 | 字典名称 | 字典项编码 | 字典项名称 | 排序 | 备注 |
| -------- | -------- | ---------- | ---------- | ---- | ---- |
| status   | 状态     | 1          | 启用       | 1    |      |
| status   | 状态     | 0          | 停用       | 2    |      |
```

写入方：dict-collect Skill（PLANNED）从代码扫描汇总
读取方：dict-sync Skill（PLANNED）调用后端批量导入接口

# PLANNED Skills 设计草稿

> ✅ 截至 v2.3.6，所有原 PLANNED Skill 均已激活：
>
> - `dict-sync` — v2.1.8 激活
> - `code-fix` — v2.1.8 激活
> - `permission-sync` — v2.3.6 激活（角色管理 + 角色授权 + 挂动作 + v-permission 闭环）
>
> 当前无草稿状态的 Skill。新增 PLANNED Skill 时，请参考下方流程。

---

## 新增 PLANNED Skill 的流程

参考 `kit-internal/CONTRIBUTING.md` 第三节"添加新 Skill"。简要步骤：

1. 在 `files/.github/skills/<分类>/<skill-name>/` 创建 `SKILL.draft.md`
2. frontmatter 中 `status: planned`
3. 在 `files/.github/skills/_registry.md` 追加一行 `⏳ PLANNED` 路由记录
4. 在本文件追加该 Skill 的设计要点（数据流 / API / 转正前任务清单）
5. 设计完成后转正：将 `SKILL.draft.md` 改名为 `SKILL.md`，更新 frontmatter `status: active`，registry 改为 ✅

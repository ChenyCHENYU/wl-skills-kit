# 08 — Git 分支 & 提交规范

> **强制度**：🔴 必遵。
> 本项目强制使用 `@robot-admin/git-standards`（commitlint + cz-customizable + husky）。

---

## 分支命名

```
feat/xxx       新功能
fix/xxx        Bug 修复
refactor/xxx   重构
docs/xxx       文档更新
chore/xxx      构建/工具变更
perf/xxx       性能优化
test/xxx       测试相关
```

## 提交方式（强制）

```bash
git add .
git cz   # 交互式选择 type + scope + 描述
```

❌ **禁止**：`git commit -m "xxx"` 直接提交（绕过规范校验）

## 提交类型（type）枚举

`feat` / `fix` / `perf` / `docs` / `style` / `refactor` / `test` / `chore` / `revert` / `build` / `deps` / `wip`

## scope 强制要求

提交时必须填写影响范围，格式：`type(scope): 中文描述`

```
feat(mmwr-customer): 新增客户档案页面
fix(domestic-trade): 修复订单状态切换闪烁
refactor(c_formModal): 重构表单回填逻辑
```

## husky 钩子未生效时

1. 检查 `@robot-admin/git-standards` 是否已执行 `init`
2. 检查 `.husky/` 目录及 `pre-commit`、`commit-msg` 钩子文件
3. 联系 CHENY（工号 409322）

## AI 生成 commit message 参考

AI 在协助提交时，按以下格式输出建议：

```
feat(模块名): 中文描述

- 变更点 1
- 变更点 2
```

不主动执行 `git commit`，由开发者通过 `git cz` 交互式确认。

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

---

## 规范审计时的 Git 检查（convention-audit 适用）

> 旧版本此处标注"审计时不检测"。自 v2.3.8 起，Git 规范纳入审计范围。

### 审计检测项

| 检查项 | 方式 | 严重度 |
|---|---|---|
| `.husky/` 目录存在 | 文件检测 | 🔴 |
| `.husky/pre-commit` 钩子存在 | 文件检测 | 🔴 |
| `.husky/commit-msg` 钩子存在 | 文件检测 | 🔴 |
| `@robot-admin/git-standards` 已初始化 | 配置文件检测 | 🔴 |
| 当前分支名符合规范 | `git branch --show-current` | 🟡 |
| 最近 N 条提交符合 `type(scope): 描述` | `git log` 检查 | 🟡 |

### 审计原则

- **历史提交不强制追溯**：已有不规范的历史提交只做提示（🟢），不要求重写 `git rebase`
- **后续提交必须合规**：审计报告发出后，所有新提交必须通过 `git cz` 交互式提交
- **修复闭环检查**：`code-fix` 修复后的提交如果不符合规范，视为闭环失败
- **工具链优先**：核心目标是确保 husky + commitlint 工具链已安装生效，工具链在位则后续自然合规

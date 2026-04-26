# 01 — 工具链前置检测

> **强制度**：🔴 阻断式。检测未通过 → AI 必须暂停代码生成。

---

## 检测目标

确认项目已正确安装 `@robot-admin/git-standards`，工具链有效。

## 检测项

AI 在执行任何代码生成任务**之前**，必须检查以下三个特征文件是否存在于项目根目录：

```
✓ .prettierrc.js
✓ eslint.config.ts
✓ .husky/  （目录）
```

## 判定规则

| 状态         | 处理                        |
| ------------ | --------------------------- |
| 三者全部存在 | ✅ 工具链就绪，继续执行任务 |
| 缺任意一个   | ❌ 暂停任务，输出下方提示   |

## 暂停提示标准格式

```
❌ 工具链检测失败：未找到 .prettierrc.js / eslint.config.ts / .husky/
   → 请执行：npx @robot-admin/git-standards init
   → 或联系 CHENY（工号 409322）解决
   → ⛔ 代码生成已暂停，修复后重新触发
```

## Pre-flight 声明示例

工具链就绪：

```
✅ 工具链检测：.prettierrc.js ✓  eslint.config.ts ✓  .husky/ ✓  [全部就绪]
```

工具链缺失：

```
❌ 工具链检测：未检测到 .husky/  → 已暂停，提醒已发出
```

---

## 为什么必须前置

- `eslint.config.ts` 缺失 → 代码风格无法约束，AI 生成代码可能不通过 lint
- `.prettierrc.js` 缺失 → 格式不统一，团队协作冲突
- `.husky/` 缺失 → 提交前钩子失效，console.log / 死代码会进入仓库

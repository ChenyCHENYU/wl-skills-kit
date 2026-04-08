# @jhlc/wl-skills-kit

AI Skill 模板包 — 一键导入 AI 指令 + 组件文档 + 通用组件 + 领域样例到你的项目。

## 安装 / 更新

```bash
npx @jhlc/wl-skills-kit
```

## 预览（不写入）

```bash
npx @jhlc/wl-skills-kit --dry-run
```

## 导入内容

| 目录        | 内容                                                     |
| ----------- | -------------------------------------------------------- |
| `.github/`  | copilot-instructions.md + 5 个 Skills（含 9 个代码模板） |
| `docs/`     | 12 个平台组件 API 文档                                   |
| `src/`      | 通用组件（global + local + remote）+ 类型定义            |
| `demo/`     | 领域样例（produce 8 页 + sale 5 页）                     |

## 特性

- **纯文件拷贝**：`files/` 目录 1:1 映射到项目根目录，无其他副作用
- **不修改** package.json / node_modules
- **不执行** postinstall / 不删除任何文件
- **覆盖同名文件**：通用改进请提 PR，领域专有放安全路径

## 安全路径（不会被覆盖）

```
.github/skills/my-domain-skill/   ← 自定义 Skill
src/components/local/my_custom/    ← 自定义组件
src/views/                         ← 业务页面
mock/                              ← Mock 数据
```

## 详细文档

安装后查看 `.github/docs/wl-skills-kit.md`

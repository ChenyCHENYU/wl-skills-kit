# \_compat — 多 AI 编辑器适配层

> ⚠️ **本目录是配置层，不是说明文档。**
> `bin/wl-skills.js` 在 `init` / `update` 时读取本目录的模板，**生成业务项目根目录下各 AI 编辑器需要的配置文件**。

---

## 设计原则

1. **解耦**：每个 AI 编辑器的配置文件**独立**，移除/新增任意编辑器不影响其他
2. **零污染**：每个编辑器**只读自己的配置文件**，不会读到其他编辑器的内容
3. **特化注入**：各编辑器的 frontmatter / 头部规范由对应模板决定（Cursor 需 `description+globs+alwaysApply`，Kiro 需 `inclusion`，Trae 需 `description`，Cline/Windsurf 无 frontmatter）
4. **内容统一**：所有编辑器的"主体内容"来自 `copilot-instructions.md`，**单一数据源**修改一处全员同步

---

## 目录结构

```
_compat/
├── README.md            ← 本文件
├── editors.json         ← 编辑器注册表（bin/wl-skills.js 读取）
└── headers/             ← 各编辑器特化头部模板
    ├── github-copilot.txt
    ├── claude-code.txt
    ├── cursor-rules.txt        （.cursorrules 用，无 frontmatter）
    ├── cursor-mdc.txt          （.cursor/rules/conventions.mdc 用，含 frontmatter）
    ├── windsurf.txt
    ├── cline.txt
    ├── kiro.txt                （.kiro/steering/conventions.md，含 frontmatter）
    ├── trae.txt                （.trae/rules/conventions.md，含 frontmatter）
    └── agents.txt              （AGENTS.md 通用代理）
```

---

## 工作流程

```
bin/wl-skills.js (init/update)
    │
    ├─ 读取 files/.github/copilot-instructions.md  → MAIN_BODY
    │
    ├─ 读取 _compat/editors.json                   → 编辑器列表
    │
    └─ 对每个 editor in editors.json:
         ├─ 读取 headers/{editor.headerFile}        → HEADER（含特化 frontmatter）
         ├─ 拼接：HEADER + AUTO_HEADER_NOTE + MAIN_BODY
         └─ 写入到业务项目：editor.outputPath
```

---

## 解耦验证

| 场景                                  | 受影响文件                    | 不受影响文件                |
| ------------------------------------- | ----------------------------- | --------------------------- |
| 团队不用 Cursor，从 editors.json 删除 | `.cursorrules`、`.cursor/`    | `.github/`、CLAUDE.md、其他 |
| 团队新增某 AI 编辑器（如 Augment）    | 加 headers/augment.txt + 注册 | 其他文件不动                |
| `copilot-instructions.md` 内容更新    | 全部 8 个根配置同步更新       | headers/ 不变（只是模板）   |

---

## 修改 / 扩展示例

### 添加新编辑器（如 Augment）

1. 在 `headers/` 创建 `augment.txt`（含该编辑器要求的 frontmatter）
2. 在 `editors.json` 追加：
   ```json
   {
     "name": "augment",
     "headerFile": "augment.txt",
     "outputPath": ".augment/rules.md",
     "enabled": true
   }
   ```
3. `npm publish`，业务项目执行 `update` 即可

### 临时禁用某编辑器

```json
{
  "name": "kiro",
  "headerFile": "kiro.txt",
  "outputPath": ".kiro/...",
  "enabled": false
}
```

`enabled: false` 的编辑器**不生成**对应根配置文件，已存在的用户可手动删除。

---

## 与官方机制的对应关系（截至 2026-04）

| 编辑器         | 官方加载路径                           | 是否需要 frontmatter | 备注                             |
| -------------- | -------------------------------------- | -------------------- | -------------------------------- |
| GitHub Copilot | `.github/copilot-instructions.md`      | ❌                   | 唯一识别 .github/ 子目录的编辑器 |
| Claude Code    | `CLAUDE.md` (root)                     | ❌                   | 自动加载根目录 CLAUDE.md         |
| Cursor         | `.cursorrules` + `.cursor/rules/*.mdc` | ❌ / ✅              | 双形式，新版 mdc 需 frontmatter  |
| Windsurf       | `.windsurfrules` (root)                | ❌                   | 单文件                           |
| Cline          | `.clinerules` (root)                   | ❌                   | 单文件                           |
| Kiro           | `.kiro/steering/*.md`                  | ✅                   | 需 inclusion 字段                |
| Trae           | `.trae/rules/*.md`                     | ✅                   | 需 description 字段              |
| 通用 Agent     | `AGENTS.md` (root)                     | ❌                   | 新兴跨平台规范                   |

> 所有这些编辑器在加载完根配置后，**都支持按指令读取项目内任意文件**（含 `.github/standards/`、`.github/skills/`、`.github/guides/`），所以本架构的"懒加载门控 + 子目录规范"对所有编辑器**有效**。

"use strict";

// CLI 和规范索引共用 task-map，保留各标准正文与人工说明。
const fs = require("node:fs");
const path = require("node:path");
const directory = path.resolve(__dirname, "../files/.wl-skills/standards");
const mapping = require(path.join(directory, "task-map.json"));
const start = "<!-- task-map:begin -->";
const end = "<!-- task-map:end -->";
const body = [start, "## 任务规范映射", "", "映射事实源为 `task-map.json`，本表由 `node scripts/sync-task-standards.cjs` 派生。按实际目标和条件加载规范，基础约束不代表检查已执行。", "", "| 任务 / Skill | 必需标准编号 |", "| --- | --- |", `| 普通前端修改（baseline） | ${mapping.baseline.join(" / ")} |`, ...Object.entries(mapping.skills).map(([skill, ids]) => `| ${skill} | ${ids.join(" / ")} |`), "", ...mapping.conditional.map((entry) => `- 涉及 ${entry.keywords.join("、")} 时补充：${entry.rules.join(" / ")}。`), "- 仅 Git 操作读取 08；没有前端代码变更时不宣称页面检查已执行。", end].join("\n");
const file = path.join(directory, "index.md");
const source = fs.readFileSync(file, "utf8");
const from = source.indexOf(start) >= 0 ? source.indexOf(start) : source.indexOf("## 任务类型 → 必读规范映射");
const to = source.indexOf(end) >= 0 ? source.indexOf(end) + end.length : source.indexOf("## 加载方式", from);
if (from < 0 || to < from) throw new Error("规范索引映射区不存在");
const updated = source.slice(0, from) + body + "\n\n---\n\n" + source.slice(to).replace(/^\s*(?:---\s*)?/, "");
if (process.argv.includes("--check")) {
  if (updated !== source) { console.error("任务规范索引未同步"); process.exitCode = 1; }
} else fs.writeFileSync(file, updated);

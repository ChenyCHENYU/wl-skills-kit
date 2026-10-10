"use strict";

const GATEWAY_PATH = ".agents/skills/wl-skills-kit/SKILL.md";

function taskGateway() {
  return `---
name: wl-skills-kit
description: Only for adopted PC Vue/Web admin projects; excludes mobile and unadopted projects. Frontend page implementation, API contracts, page conventions and project synchronization. Decide the applicable kit workflow and verify code using the local package tools.
---

# wl-skills-kit task gateway

This is a discovery adapter. Read the canonical Skill selected by the task decision; resolve its relative references from that canonical directory. Do not load every Skill.
For the same user task, reuse one run ID across installed applicable packages via \`--run-id\` or \`WL_TASK_RUN_ID\`; do not install unused sibling packages.

先确认目标项目自身的接入证据（本包安装清单、直接依赖或 \`.wl-skills-scope.json\` 显式启用），再判定任务。只在目标已接入且平台适用时读取规则；父目录安装、兄弟包、Vue 文件或触发词不能证明接入。未接入的开源项目不套用规则、不建议自动安装；UniApp/小程序/App/PDA/移动 H5 不适用。跨项目目标分别判定，沿最近项目边界停止，不能越过未接入子项目找父清单。工具返回 \`scope\` 作为静态范围证据，宿主加载仍需实际事件。

多项目工作区先沿目标路径向上找到本包安装清单与项目 AGENTS，切到该项目根再调用工具；不要以聚合工作区根代替 projectRoot，也不要在聚合根安装。不同项目分别保存项目身份，同一用户任务复用 runId。

1. At the start of each relevant task run \`node node_modules/@agile-team/wl-skills-kit/bin/wl-skills.js task "<task>" --target <path> --json\` from the adopted PC project's root. Before editing, show the returned \`notice\`: actual package/version, decision, selected Skill or baseline, rule IDs/names, target, runId and checks not yet executed. This visible start notice is required even for baseline, gap or not-applicable. If the command is missing/unsupported, visibly report the version/prerequisite failure; do not silently skip it. A decision is a plan, not execution evidence. Resolve ambiguous, gap or needs-context results before implementing the selected workflow.
2. Read only the selected \`.wl-skills/skills/**/SKILL.md\` and required standards. For an ordinary frontend change apply the reported baseline even if no specialized Skill matches. Other domains are not applicable.
3. Run the actual relevant CLI/MCP checks. For page changes use \`wl-skills validate <page-directory> --run-id <id>\`; add \`--typecheck\` when type checking is required. These tools record execution and verification separately.
4. Finish with \`node node_modules/@agile-team/wl-skills-kit/bin/wl-skills.js status --run-id <id> --json\` and visibly report execution separately from verification, actual checked files, stale evidence and pending checks. Read standard mappings from \`.wl-skills/standards/task-map.json\` and selected canonical files. An installed file, intent match or model statement does not prove host discovery, reading, execution or verification.

If the package is missing, report that prerequisite and do not claim checks ran. \`wl-skills doctor-host\` diagnoses static entry configuration; host discovery remains unverified without host events.
If \`ready: false\` or \`missingInputs\` is reported, resolve the missing own assets before claiming the selected workflow is available. Routing covers the published catalog and explicit unsupported intents; it does not understand every possible natural-language request.
`;
}

module.exports = { GATEWAY_PATH, taskGateway };

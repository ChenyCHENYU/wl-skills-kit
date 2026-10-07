"use strict";

const GATEWAY_PATH = ".agents/skills/wl-skills-kit/SKILL.md";

function taskGateway() {
  return `---
name: wl-skills-kit
description: Frontend page implementation, API contracts, page conventions and project synchronization. Decide the applicable kit workflow and verify code using the local package tools.
---

# wl-skills-kit task gateway

This is a discovery adapter. Read the canonical Skill selected by the task decision; resolve its relative references from that canonical directory. Do not load every Skill.
For the same user task, reuse one run ID across installed applicable packages via \`--run-id\` or \`WL_TASK_RUN_ID\`; do not install unused sibling packages.

1. At the start of a task run \`node node_modules/@agile-team/wl-skills-kit/bin/wl-skills.js task "<task>" --target <path>\`. Retain the returned run ID. A decision is a plan, not execution evidence. For ambiguous, gap or needs-context results resolve the reported uncertainty before implementing it.
2. Read only the selected \`.wl-skills/skills/**/SKILL.md\` and required standards. For an ordinary frontend change apply the reported baseline even if no specialized Skill matches. Other domains are not applicable.
3. Run the actual relevant CLI/MCP checks. For page changes use \`wl-skills validate <page-directory> --run-id <id>\`; add \`--typecheck\` when type checking is required. These tools record execution and verification separately.
4. Finish with \`wl-skills status --run-id <id>\` and briefly report the real outcome, checked scope and unverified items. An installed file, intent match or model statement does not prove host discovery, reading, execution or verification.

If the package is missing, report that prerequisite and do not claim checks ran. \`wl-skills doctor-host\` diagnoses static entry configuration; host discovery remains unverified without host events.
If \`ready: false\` or \`missingInputs\` is reported, resolve the missing own assets before claiming the selected workflow is available. Routing covers the published catalog and explicit unsupported intents; it does not understand every possible natural-language request.
`;
}

module.exports = { GATEWAY_PATH, taskGateway };

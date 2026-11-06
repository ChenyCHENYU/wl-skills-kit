"use strict";

const GATEWAY_PATH = ".agents/skills/wl-skills-kit/SKILL.md";
const { version } = require("../package.json");

function taskEntryGuidance() {
  return [
    "终端可用时在实际项目根运行 `node node_modules/@agile-team/wl-skills-kit/bin/wl-skills.js task \"<任务>\" --target <路径> --json`。",
    "终端不可用时，如果当前宿主已连接本项目的 Kit MCP 并列出工具，用 `wls_task` 传 `task` 和 `targets`，用 `wls_status` 传原 `runId` 回查。先核对返回的项目和包身份。",
    "传给 `task` 的是用户原始任务；保留原话中的只预览、不要检查及禁止修改等限制，目标路径用独立参数传入。",
    "只查能力或解释用法时用本地 `route` / `explain` 或已连接的 `wls_route` / `wls_explain`，保持只读。如果用户给出具体菜单、字典或权限变更并要求实际预览，用 `task` 建立范围，再调用所选 MCP 的预览，不提交写入。",
    `终端可用但项目缺少本地执行器时，只使用已有的同版本离线缓存 \`npx --offline --yes --package @agile-team/wl-skills-kit@${version} wl-skills task "<任务>" --target <路径> --json\`。后续沿用实际入口和版本。`,
    "两个入口均不可用时，直接说明当前未执行及缺少的条件。MCP 被宿主审批拦截时，明确说明工具名、当前未执行和审批状态，等待宿主审批结果。",
  ].join("\n\n");
}

function taskGateway() {
  return `---
name: wl-skills-kit
description: PC Vue 管理端页面开发、接口对接、菜单新增与排序预览、字典同步、前端规范检查与修复。适用于目标自身已接入 Kit 的项目，不适用 UniApp、小程序、App/PDA、移动 H5 或未接入项目。
---

# WL 前端开发与菜单字典任务入口

可在宿主技能列表选择本包并给出实际项目、任务与目标。Codex 显式调用示例 \`$wl-skills-kit 检查当前项目的 <页面路径>\`。

先确认目标项目自身已接入 Kit。沿目标找到最近项目根和项目规则，聚合目录、父目录安装、兄弟包及 Vue 文件都不证明接入。UniApp、小程序、App/PDA、移动 H5 或未接入项目不适用。跨项目分别判定，已接入且适用的包复用本次任务的 \`runId\` 或 \`WL_TASK_RUN_ID\`。

${taskEntryGuidance()}

首条进度根据真实 \`notice.summary\`（旧版用 \`notice\`）说明匹配技能、执行状态和待检查项。按 \`requiredFiles\` 和 \`resources\` 只读本次所需规范和技能，从实际文件位置解析相对引用。普通前端变更可应用基础约束。发生缺口时说明原因，组合任务按用户已明确的步骤分别判定，只有实质选择不明确时才询问。

按回执 \`action.mode\`、\`checksAllowed\` 和用户授权行动。纯解释或文字方案止于说明。业务预览返回原工具的 \`planHash\`，只有用户明确确认后才进入写入。页面检查在同 \`runId\` 下用本地 \`wl-skills validate <页面目录> --run-id <id>\` 或已连接的 \`wls_validate_page\`（传 \`path\`、\`runId\`），需要类型检查时再启用。后端写入遵循查询、预览、确认和回查。

收尾查询同 \`runId\` 的本地 \`wl-skills status --run-id <id> --json\` 或已连接的 \`wls_status\`。报告实际工具、验证结果、待检查项和过期证据。包版本放在详情。路由命中只表明匹配，宿主加载和模型读取另需证据。排查静态入口用 \`doctor-host --host <实际宿主ID>\` 或 \`wls_doctor_host\`。
`;
}

module.exports = { GATEWAY_PATH, taskGateway, taskEntryGuidance };

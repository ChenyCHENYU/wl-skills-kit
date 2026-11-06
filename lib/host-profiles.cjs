"use strict";

// Static, project-scoped discovery conventions. These paths never prove that a
// running host enabled, loaded, invoked, or followed a skill.
const CHECKED_AT = "2026-10-21";
const DEFINITIONS = {
  codex: {
    name: "OpenAI Codex", aliases: ["agents", "agents-generic", "codex-cli", "codex-vscode", "vscode-codex", "openai-codex", "openai.codex", "openai.chatgpt"],
    entries: ["AGENTS.md"], roots: [".agents/skills"], mcp: [".codex/config.toml"],
    mcpLayout: { format: "toml", paths: [".codex/config.toml"], container: ["mcp_servers"], style: "codex" },
    activation: "在实际项目根目录开启新会话，输入 $<skill> 并从技能列表选择；确认项目受信任。",
    verify: "在当前会话确认技能列表包含本包，再查看真实 task 工具 notice 与同 runId 的 status；父工作区不会因此自动发现所有子项目技能。",
    docs: ["https://developers.openai.com/codex/skills", "https://developers.openai.com/codex/guides/agents-md", "https://learn.chatgpt.com/docs/extend/mcp?surface=cli"],
    checkedAt: "2026-10-22", discoveryRules: { childProjectsRecursive: false, defaultMetadataBudgetContextPercent: 2, unknownContextMetadataBudgetChars: 8000, mayOmitSkills: true, source: "official-docs-and-local-codex-skills-list", hostConfigurationObserved: false },
  },
  zcode: {
    name: "智谱 ZCode Agent", aliases: ["z-code", "zcode-agent", "zhipu-zcode", "智谱zcode"],
    entries: ["AGENTS.md"], roots: [".zcode/skills", ".agents/skills"], compactRoot: ".agents/skills", mcp: [".zcode/config.json", ".agents/mcp.json"],
    mcpLayout: { format: "jsonc", paths: [".zcode/config.json"], container: ["mcp", "servers"], style: "zcode", fallback: ".agents/mcp.json" },
    activation: "打开实际项目，在 Settings → Skills 点击 Refresh，确认本包的 agents 来源与启用开关；输入 $<skill> 或 / 从列表选择。当前兼容版复用 .agents/skills，避免再复制到 .zcode 形成同名重复。若旧版只接受原生路径，明确仅使用一个 .zcode/skills/<skill>/SKILL.md 入口。",
    verify: "技能须出现在当前工作区列表且已启用；工作区不会递归发现所有子项目的 Skills，也不会合并子项目 AGENTS。先打开实际项目，再 Refresh。自动选择取决于描述匹配、技能/工具启用及元数据预算；MCP 在 Settings → MCP Servers 单独确认连接，再核对真实 task/status 回执。",
    checkedAt: "2026-10-22",
    discoveryRules: { childProjectsRecursive: false, descriptionMaxChars: 1024, metadataDescriptionMaxChars: 250, defaultMetadataBudgetChars: 20000, source: "official-docs-and-local-zcode-3.16.2-parser", hostConfigurationObserved: false },
    docs: ["https://zcode.z.ai/en/docs/skill", "https://zcode.z.ai/en/docs/qa", "https://zcode.z.ai/en/docs/mcp-services"],
  },
  claude: {
    name: "Claude Code", aliases: ["claude-code", "claude-vscode", "vscode-claude"],
    entries: ["CLAUDE.md"], roots: [".claude/skills"], mcp: [".mcp.json"],
    mcpLayout: { format: "jsonc", paths: [".mcp.json"], container: ["mcpServers"], style: "stdio" },
    activation: "在实际项目开启 Claude Code 会话，输入 /<skill>；若未列出，检查项目目录、技能启用和会话权限后重新加载。",
    verify: "核对 /<skill> 可选、实际 Skill 工具调用以及 task/status 回执；CLAUDE.md 存在只构成静态入口证据。项目 .mcp.json 首次使用还须在 Claude 中确认服务，Pending approval 只代表待批准，不能当作已连接。",
    docs: ["https://code.claude.com/docs/en/skills", "https://code.claude.com/docs/en/mcp"],
    checkedAt: "2026-10-22", discoveryRules: { source: "official-docs-and-local-claude-init", hostConfigurationObserved: false, instructionsNote: "AGENTS.md 原生读取需 Claude Code 2.1.277+；较早版本仍需 CLAUDE.md 或原生 Skills，不能只依赖 AGENTS.md。" },
  },
  cline: {
    name: "Cline", aliases: ["cline-vscode", "vscode-cline", "saoudrizwan.claude-dev"],
    entries: ["AGENTS.md"], roots: [".cline/skills", ".clinerules/skills", ".claude/skills"], shareGatewayWith: "claude", mcp: [],
    activation: "在 Cline 面板点击天平图标 → Skills，确认本包启用；输入 /<skill> 从列表显式调用。",
    verify: "规则开关与 Skills 开关分别检查；实际 skills 工具调用及 task/status 回执才能证明本次执行。MCP 通过 Cline 的 MCP 设置单独配置。",
    docs: ["https://docs.cline.bot/customization/skills", "https://docs.cline.bot/customization/cline-rules", "https://docs.cline.bot/mcp/mcp-overview"],
    checkedAt: "2026-10-22", discoveryRules: { descriptionMaxChars: 1024, hostConfigurationObserved: false, source: "official-docs" },
  },
  roo: {
    name: "Roo Code", aliases: ["roo-code", "roocode", "roo-vscode", "vscode-roo", "rooveterinaryinc.roo-cline"],
    entries: ["AGENTS.md"], roots: [".roo/skills", ".agents/skills"], compactRoot: ".agents/skills", mcp: [".roo/mcp.json"],
    mcpLayout: { format: "jsonc", paths: [".roo/mcp.json"], container: ["mcpServers"], style: "roo" },
    activation: "在 Roo Code 的实际项目会话明确要求使用 <skill>，核对技能列表和当前模式；通用 skills 目录可跨模式使用。",
    verify: "查看实际技能读取和 task/status 回执；模式专用目录、同名技能覆盖及禁用工具会影响调用。MCP 在 Roo 面板单独确认连接。",
    docs: ["https://docs.roocode.com/features/skills", "https://docs.roocode.com/features/custom-instructions", "https://docs.roocode.com/features/mcp/using-mcp-in-roo"],
    checkedAt: "2026-10-22", discoveryRules: { descriptionMaxChars: 1024, hostConfigurationObserved: false, source: "official-docs" },
  },
  kilo: {
    name: "Kilo Code", aliases: ["kilo-code", "kilocode", "kilo-cli", "kilo-vscode", "vscode-kilo", "kilocode.kilo-code"],
    entries: ["AGENTS.md"], roots: [".kilo/skills", ".agents/skills"], compactRoot: ".agents/skills", mcp: ["kilo.jsonc", "kilo.json", ".kilo/kilo.jsonc", ".kilo/kilo.json"],
    mcpLayout: { format: "jsonc", paths: ["kilo.jsonc", "kilo.json", ".kilo/kilo.jsonc", ".kilo/kilo.json"], defaultPath: ".kilo/kilo.jsonc", container: ["mcp"], style: "kilo", multiple: "ambiguous" },
    activation: "当前版 Kilo 开启新会话或 /reload 后输入 /<skill>；核对 kilo.jsonc 中 instructions。旧 .kilocode/rules 仍兼容，但不能据此确认当前技能目录已加载。",
    verify: "区分新版 .kilo 与旧版 .kilocode；核对实际扩展版本、技能列表及 task/status 回执。项目规则需有效 instructions 配置。",
    docs: ["https://kilo.ai/docs/customize/skills", "https://kilo.ai/docs/customize/custom-rules", "https://kilo.ai/docs/customize/agents-md", "https://kilo.ai/docs/automate/mcp/using-in-cli"],
  },
  copilot: {
    name: "GitHub Copilot", aliases: ["github-copilot", "vscode-copilot", "github.copilot", "github.copilot-chat"],
    entries: [".github/copilot-instructions.md"], roots: [".agents/skills", ".github/skills", ".claude/skills"], mcp: [".mcp.json", ".vscode/mcp.json"],
    mcpLayout: { format: "jsonc", paths: [".mcp.json", ".vscode/mcp.json"], container: ["mcpServers"], style: "stdio", variants: { ".vscode/mcp.json": { container: ["servers"], style: "vscode" } } },
    activation: "在 VS Code 确认当前使用的 Copilot/Local harness，打开 Chat → Open Customizations → Skills，选择本包技能。",
    verify: "查看当前 harness 的 Customizations/References 和真实工具回执；MCP 两种文件格式分别使用 servers 与 mcpServers，不能直接互换。",
    docs: ["https://code.visualstudio.com/docs/agent-customization/agent-skills", "https://code.visualstudio.com/docs/agent-customization/mcp-servers", "https://code.visualstudio.com/docs/agents/reference/mcp-configuration"],
  },
  cursor: {
    name: "Cursor", aliases: ["cursor-agent", "cursor-mdc", "cursor-rules"],
    entries: ["AGENTS.md"], roots: [".cursor/skills", ".agents/skills", ".claude/skills"], compactRoot: ".agents/skills", mcp: [".cursor/mcp.json"],
    mcpLayout: { format: "jsonc", paths: [".cursor/mcp.json"], container: ["mcpServers"], style: "stdio" },
    activation: "在实际项目的 Cursor Agent 中选择本包技能；检查规则相关性和技能来源，更新后重新加载会话。",
    verify: "项目 Skills 的作用域与当前工作文件一致后，核对实际技能读取和 task/status 回执。",
    docs: ["https://cursor.com/help/customization/skills", "https://cursor.com/docs/mcp"],
  },
  kiro: {
    name: "Kiro", aliases: ["kiro-cli", "kiro-ide"],
    entries: [".kiro/steering/<skill>.md"], roots: [".kiro/skills"], mcp: [".kiro/settings/mcp.json"],
    mcpLayout: { format: "jsonc", paths: [".kiro/settings/mcp.json"], container: ["mcpServers"], style: "kiro" },
    activation: "在 Kiro 的 Agent Steering & Skills 中确认本包，输入 /<skill>；CLI 自定义 agent 还需对应 skill:// resources。",
    verify: "核对技能列表、steering 模式、实际技能读取以及 task/status 回执；文件存在不代表当前 agent 已启用。",
    docs: ["https://kiro.dev/docs/skills/", "https://kiro.dev/docs/mcp/configuration/"],
    checkedAt: "2026-10-22", discoveryRules: { descriptionMaxChars: 1024, hostConfigurationObserved: false, source: "official-docs" },
  },
  devin: {
    name: "Devin Desktop", aliases: ["windsurf", "devin-desktop"], entries: ["AGENTS.md"], roots: [".devin/skills", ".agents/skills"], compactRoot: ".agents/skills", mcp: [],
    activation: "在实际项目确认 Skills 来源并选择 <skill>；旧 Windsurf 名称映射到当前 Devin Desktop，共用 .agents 入口。",
    verify: "核对当前会话实际技能列表和 task/status 回执；旧 .windsurfrules 不再默认生成。",
    docs: ["https://docs.devin.ai/desktop/cascade/skills"],
  },
  qoder: {
    name: "Qoder", aliases: ["qoder-cli", "qoder-ide"], entries: [".qoder/rules/<skill>.md"], roots: [".qoder/skills"], mcp: [],
    activation: "在实际项目使用 .qoder/skills 原生入口；IDE 输入 / 选择 <skill>，CLI 使用 /skills reload 刷新后选择。自然语言按技能描述匹配。",
    verify: "核对当前项目列表、技能启用及真实 task/status；原生目录协议已核实，本机 Qoder 会话发现与自动选择尚未实测。保留规则入口兼容早期接入。",
    checkedAt: "2026-10-22", docs: ["https://docs.qoder.com/zh/extensions/skills", "https://docs.qoder.com/cli/Skills"],
  },
  trae: {
    name: "Trae", aliases: [], entries: [".trae/rules/<skill>.md"], roots: [".agents/skills"], mcp: [],
    activation: "显式启用项目规则，按规则入口的本地命令执行 <skill>；本适配只确认规则引导与可读取资源。",
    verify: "当前版本原生技能扫描与自动触发未实测；核对实际规则引用和 task/status，不将通用目录存在视为已加载。",
    discoveryMode: "rule-guidance",
    checkedAt: "2026-10-22", docs: ["https://docs.trae.ai/ide/rules"],
  },
};

function skillName(packageName) {
  const name = String(packageName || "").replace(/^@agile-team\//, "");
  if (!/^wl-skills-(?:kit|ui|bd|test|design)$/.test(name)) throw new Error("host profile requires a supported WL package name");
  return name;
}

function resolveHostId(host) {
  const normalized = String(host || "").trim().toLowerCase().replace(/\s+/g, "-");
  return Object.keys(DEFINITIONS).find((id) => id === normalized || DEFINITIONS[id].aliases.includes(normalized)) || null;
}

function compactHostIntegration(host, selectedHosts = []) {
  const id = resolveHostId(host);
  if (!id) throw new Error(`Unsupported WL host: ${host}`);
  const definition = DEFINITIONS[id];
  const shared = definition.shareGatewayWith && selectedHosts.includes(definition.shareGatewayWith) ? DEFINITIONS[definition.shareGatewayWith] : null;
  return { hostId: id, gatewayRoot: shared ? shared.compactRoot || shared.roots[0] : definition.compactRoot || definition.roots[0], entryFiles: [...definition.entries] };
}

function resolveHostProfile(host, packageName) {
  const skill = skillName(packageName);
  const requested = String(host || "unspecified").trim();
  const normalized = requested.toLowerCase().replace(/\s+/g, "-");
  const hostId = resolveHostId(requested);
  if (!hostId) {
    const model = /^(?:glm|gpt|chatgpt|deepseek|openai|zhipu|智谱)(?:[-.\d].*)?$/i.test(normalized);
    const editor = ["vscode", "vs-code", "visual-studio-code", "vs-code插件", "vscode插件", "unknown", "unspecified", ""].includes(normalized);
    const status = model || editor ? "needs-host" : "unsupported";
    const message = model
      ? `${requested} 是模型或服务名称，不能确定技能由哪个宿主发现；请指定 codex、zcode、cline、roo、kilo 或其他实际宿主。`
      : editor ? "请指定 VS Code 中实际使用的插件/Agent：codex、zcode、cline、roo、kilo 或 copilot；编辑器名称不能证明技能加载。"
        : `未支持或无法识别宿主 ${requested}；不会回退到 AGENTS.md 并报告就绪。`;
    return { hostId: null, requested, status, name: requested, entryFiles: [], gatewayPaths: [], mcpConfigFiles: [], activation: [], help: [message], message, docs: [], checkedAt: CHECKED_AT, evidenceLevel: "static-host-conventions" };
  }
  const definition = DEFINITIONS[hostId];
  const replace = (text) => text.replaceAll("<skill>", skill);
  return { hostId, requested, status: "known", name: definition.name,
    entryFiles: definition.entries.map(replace), gatewayPaths: definition.roots.map((root) => `${root}/${skill}/SKILL.md`),
    mcpConfigFiles: [...definition.mcp], activation: [replace(definition.activation)], help: [replace(definition.verify)],
    message: "仅诊断本项目静态入口与安装条件；发现、加载、调用和校验须分别取得当前会话证据。",
    docs: [...definition.docs], mcpLayout: definition.mcpLayout ? JSON.parse(JSON.stringify(definition.mcpLayout)) : null,
    discoveryMode: hostDiscoveryMode(definition),
    discoveryRules: definition.discoveryRules ? { ...definition.discoveryRules } : null,
    checkedAt: definition.checkedAt || CHECKED_AT, evidenceLevel: "static-host-conventions" };
}

function hostDiscoveryMode(definition) { return definition.discoveryMode || "native-skills"; }

function gatewayInstallPaths(packageName, options = {}) {
  const skill = skillName(packageName);
  // ZCode 3.16.2 discovers .agents and .zcode together and injects both copies
  // without name deduplication. Reuse its verified .agents compatibility root.
  const policy = options.gatewayRoots ? options : require("./project-integration.cjs").resolveIntegration(options);
  return policy.gatewayRoots.map((root) => `${root}/${skill}/SKILL.md`);
}

module.exports = { resolveHostProfile, resolveHostId, compactHostIntegration, gatewayInstallPaths, hostProfiles: Object.freeze(Object.keys(DEFINITIONS)), CHECKED_AT };

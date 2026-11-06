"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const PACKAGES = Object.freeze(["kit", "ui", "bd", "design", "test"]);
const MCP_SERVERS = Object.freeze({ kit: "wl-skills", ui: "wl-skills-ui", bd: "wl-skills-bd", test: "wl-skills-test" });
const VARIANTS = new Set(["candidate", "baseline", "no-skill"]);
const ASSERTIONS = new Set(["unchanged", "exists", "absent", "contains"]);
const FIXTURES = new Set(["pc", "backend", "generic", "mobile"]);
const HOST_TOOL_TYPES = new Set(["command_execution", "mcp_tool_call", "web_search"]);
const EVENT_TYPES = new Set(["thread.started", "turn.started", "turn.completed", "turn.failed", "item.started", "item.updated", "item.completed", "error"]);
const TOOL = /^(?:[\w.-]{1,128}|mcp:[\w.-]{1,128}|cli:(?:kit|ui|bd|design|test):[\w.-]{1,128})$/;
const IDENTIFIER = /^[\w.-]{1,128}$/;
const RESULT_FIELDS = new Set(["ok", "state", "mode", "executionStatus", "validationStatus"]);
const VALIDATION_STATES = new Set(["unverified", "passed", "failed", "partial", "not-applicable"]);
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const hash = data => createHash("sha256").update(data).digest("hex");
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isId = value => typeof value === "string" && IDENTIFIER.test(value);
const isSkillId = value => typeof value === "string" && value.length <= 128 && /^[\w-]+(?:[./][\w-]+)*$/u.test(value);

function readJSON(file) {
  if (fs.statSync(file).size > MAX_FILE_BYTES) throw new Error("JSON input exceeds 4 MiB");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function relativePath(value) {
  if (typeof value !== "string" || !value.length || value.length > 240 || /[\x00-\x1f\\:]/u.test(value)
    || value.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("fixture path must be a non-traversing POSIX relative path");
  }
  return value;
}

function validateExpectation(expect) {
  if (!validSkillExpectation(expect)) throw new Error("invalid expected skill");
  validateSkillExpectation(expect);
  validateTools(expect.requiredTools ?? []);
  validateTools(expect.forbiddenTools ?? []);
  validateTools(expect.requiredReceipts ?? []);
  validateResults(expect.expectedMcpResults ?? []);
  validateAssertions(expect.assertions ?? []);
}

function validateSkillExpectation(expect) {
  if (expect.invocation !== undefined && !["implicit", "explicit"].includes(expect.invocation)) throw new Error("invalid invocation mode");
  if (expect.subskill !== undefined && !validSubskillExpectation(expect)) throw new Error("invalid expected subskill");
  if (expect.requiredReceipts !== undefined && !expect.skill) throw new Error("receipt expectation needs a package");
}

function validSubskillExpectation(expect) {
  const selected = Array.isArray(expect.subskill) ? expect.subskill : [expect.subskill];
  return Boolean(expect.skill) && selected.length > 0 && selected.length <= 8 && new Set(selected).size === selected.length && selected.every(isSkillId);
}

function validSkillExpectation(expect) {
  return isObject(expect) && (expect.skill === undefined || expect.skill === null || PACKAGES.includes(expect.skill));
}

function validateTools(tools) {
  if (!Array.isArray(tools) || tools.length > 32 || tools.some(tool => typeof tool !== "string" || !TOOL.test(tool))) throw new Error("invalid tool expectation");
}

function validateResults(results) {
  if (!Array.isArray(results) || results.length > 16) throw new Error("invalid MCP result expectations");
  for (const result of results) {
    if (!validMcpExpectation(result)) throw new Error("invalid MCP result expectation");
    if (result.menuPlan !== undefined && (result.tool !== "wls_menu_upsert" || !menuActions(result.menuPlan))) {
      throw new Error("invalid expected menu plan");
    }
  }
}

function validMcpExpectation(result) {
  return isObject(result) && isId(result.tool) && isObject(result.fields) && Object.keys(result.fields).length > 0
    && Object.entries(result.fields).every(([key, value]) => RESULT_FIELDS.has(key) && resultScalar(value));
}

function validateAssertions(assertions) {
  if (!Array.isArray(assertions) || assertions.length > 32) throw new Error("invalid assertions");
  for (const assertion of assertions) {
    if (!isObject(assertion) || !ASSERTIONS.has(assertion.kind)) throw new Error("unsupported assertion");
    relativePath(assertion.path);
    if (assertion.kind === "contains" && (typeof assertion.value !== "string" || !assertion.value.length || assertion.value.length > 500)) {
      throw new Error("contains needs a bounded literal string");
    }
  }
}

function fixtureFile(relative, value) {
  relativePath(relative);
  const [head] = relative.split("/");
  const reserved = /^(?:\.(?:git|agents|codex|claude|zcode|kilo|mcp|npmrc|env|wl-skills)(?:[.-]|$)|node_modules$|package(?:-lock)?\.json$)/u;
  if (reserved.test(head)) {
    throw new Error("fixture files cannot override installation, host or credential inputs");
  }
  if (typeof value !== "string" || Buffer.byteLength(value) > 64 * 1024) throw new Error("fixture seed is not bounded UTF-8 text");
}

function validateFixture(fixture, expect) {
  if (!isObject(fixture) || !FIXTURES.has(fixture.kind)) throw new Error("invalid fixture kind");
  if (fixture.service !== undefined && fixture.service !== "kit-menu") throw new Error("unknown fixture service");
  if (fixture.packages !== undefined) validateFixturePackages(fixture.packages, expect.skill);
  if (fixture.files === undefined) return;
  if (!isObject(fixture.files) || Object.keys(fixture.files).length > 80) throw new Error("fixture seed must be a bounded file map");
  for (const [name, value] of Object.entries(fixture.files)) fixtureFile(name, value);
}

function validateFixturePackages(packages, skill) {
  if (!Array.isArray(packages) || packages.some(key => !PACKAGES.includes(key))
    || new Set(packages).size !== packages.length || (skill && !packages.includes(skill))) throw new Error("invalid fixture package selection");
}

function validCase(row) {
  return isObject(row) && isId(row.id) && isId(row.family) && ["dev", "holdout"].includes(row.split)
    && typeof row.prompt === "string" && row.prompt.trim() && Buffer.byteLength(row.prompt) <= 8000;
}

function catalogCases(catalog) {
  if (!validCatalog(catalog)) throw new Error("unsupported evaluation catalog");
  const seen = new Set();
  const families = new Map();
  for (const row of catalog.cases) {
    if (!validCase(row) || seen.has(row.id)) throw new Error("invalid case, family or prompt");
    if (families.has(row.family) && families.get(row.family) !== row.split) throw new Error("case family crosses dev/holdout");
    seen.add(row.id);
    families.set(row.family, row.split);
    validateExpectation(row.expect);
    validateFixture(row.fixture, row.expect);
  }
  return catalog.cases;
}

function validCatalog(catalog) {
  return isObject(catalog) && catalog.schemaVersion === 1 && Array.isArray(catalog.cases) && catalog.cases.length > 0 && catalog.cases.length <= 200;
}

function wantedPackages(row, variant) {
  if (variant === "no-skill") return [];
  return row.fixture.packages ?? (row.expect.skill ? [row.expect.skill] : []);
}

function safePath(root, relative) {
  const parts = relativePath(relative).split("/");
  let target = root;
  for (const part of parts) {
    target = path.join(target, part);
    try {
      if (fs.lstatSync(target).isSymbolicLink()) throw new Error("fixture evidence crosses a symlink");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return target;
}

function fileFact(full, budget, literal) {
  let stat;
  try { stat = fs.lstatSync(full); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (--budget.entries < 0 || stat.isSymbolicLink()) throw new Error("unsafe or oversized fixture snapshot");
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(full).sort().map(name => [name, fileFact(path.join(full, name), budget)]);
    return { type: "directory", hash: hash(JSON.stringify(entries)) };
  }
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES || (budget.bytes -= stat.size) < 0) throw new Error("unsafe or oversized fixture snapshot");
  const data = fs.readFileSync(full);
  return { type: "file", hash: hash(data), ...(literal ? { contains: data.includes(Buffer.from(literal)) } : {}) };
}

function snapshotAssertions(root, assertions = []) {
  const budget = { entries: 2000, bytes: 16 * 1024 * 1024 };
  return assertions.map(assertion => {
    try { return { observable: true, value: fileFact(safePath(root, assertion.path), budget, assertion.value) }; }
    catch { return { observable: false }; }
  });
}

function readJournal(root, packages, runId) {
  const evidence = [];
  let complete = true;
  for (const [key, packageFact] of Object.entries(packages)) {
    const prefix = key === "kit" ? ".wl-skills" : ".wl-skills-" + key;
    for (const dir of [`.wl-skills/state/${key}/runs/${runId}`, `${prefix}/runs/${runId}`]) {
      try { addJournalEvidence(root, dir, key, packageFact.version, runId, evidence); }
      catch { complete = false; }
    }
  }
  return { evidence: [...new Map(evidence.map(row => [row.id, row])).values()], complete };
}

function addJournalEvidence(root, relative, key, version, runId, evidence) {
  const dir = safePath(root, relative);
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort();
  if (entries.length > 160) throw new Error("too many journal records");
  for (const name of entries) {
    const file = safePath(root, `${relative}/${name}`);
    if (!fs.lstatSync(file).isFile() || fs.statSync(file).size > MAX_FILE_BYTES) throw new Error("invalid journal record");
    const bytes = fs.readFileSync(file);
    const row = JSON.parse(bytes.toString("utf8"));
    if (!validJournal(row, key, version, runId)) throw new Error("unbound journal record");
    const event = journalEvidence(row, key, bytes);
    if (event) evidence.push(event);
  }
}

function validJournal(row, key, version, runId) {
  return row.recordVersion === 1 && row.packageName === "@agile-team/wl-skills-" + key
    && row.packageVersion === version && row.runId === runId && isId(row.eventId);
}

function journalEvidence(row, key, bytes) {
  const event = row.kind === "task-decision" ? journalDecision(row) : journalTool(row);
  return event && { id: row.eventId, package: key, source: "journal", runId: row.runId, sha256: hash(bytes), ...event };
}

function journalDecision(row) {
  if (!Array.isArray(row.decision?.selectedSkills)) return null;
  return { kind: "decision", selected: row.decision.selectedSkills.filter(isSkillId).slice(0, 20) };
}

function journalTool(row) {
  if (!["tool-started", "tool-finished"].includes(row.kind) || !isId(row.tool)) return null;
  const mcp = row.invocation?.channel === "mcp" && isId(row.invocation.tool);
  return { kind: "tool", channel: mcp ? "mcp" : "cli",
    tool: mcp ? row.invocation.tool : row.tool, checker: row.tool,
    status: row.kind === "tool-started" ? "started" : row.executionStatus === "completed" ? "completed" : "failed",
    ...receiptValidation(row),
    ...receiptPlan(row) };
}

function receiptValidation(row) {
  return row.kind === "tool-finished" && VALIDATION_STATES.has(row.validationStatus) ? { validationStatus: row.validationStatus } : {};
}

function receiptPlan(row) {
  const backend = row.summary?.backend;
  return backend?.preview === "passed" ? planFingerprint(backend.planHash) : {};
}

function planFingerprint(value) {
  return typeof value === "string" && SHA256.test(value) ? { planFingerprint: hash(value) } : {};
}

function usage(value) {
  if (!isObject(value)) return {};
  const accepted = {};
  for (const key of ["input_tokens", "cached_input_tokens", "output_tokens", "total_tokens", "reasoning_output_tokens", "duration_ms", "host_tool_calls"]) {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0) accepted[key] = value[key];
  }
  return accepted;
}

function hostMetadata(value) {
  if (!isObject(value)) throw new Error("invalid host metadata");
  const result = {};
  for (const key of ["name", "version", "model", "effort", "profile"]) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !/^[\w./@+-]{1,120}$/.test(value[key]))) throw new Error("invalid host identity");
    if (value[key] !== undefined) result[key] = value[key];
  }
  if (!result.name) throw new Error("host identity is required");
  return result;
}

function resultScalar(value) {
  return typeof value === "boolean" || (typeof value === "string" && IDENTIFIER.test(value));
}

function resultFields(value) {
  const fields = {};
  if (isObject(value)) for (const key of RESULT_FIELDS) if (resultScalar(value[key])) fields[key] = value[key];
  return fields;
}

function menuActions(actions) {
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > 40) return null;
  const projected = actions.map(menuAction);
  if (projected.includes(null)) return null;
  return projected.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function menuAction(item) {
  if (!isObject(item)) return null;
  if (item.action === "update" && isId(item.id) && (item.orderNum === undefined || Number.isSafeInteger(item.orderNum))) {
    return { action: item.action, id: item.id, orderNum: item.orderNum };
  }
  if (item.action === "create" && typeof item.menuName === "string" && item.menuName.length > 0 && item.menuName.length <= 120) {
    return { action: item.action, nameSha256: hash(item.menuName) };
  }
  return null;
}

function mcpResult(value, tool) {
  const fields = resultFields(value);
  if (tool !== "wls_menu_upsert" || !isObject(value)) return fields;
  const actions = menuActions(value.actions);
  const plan = planFingerprint(value.planHash);
  return { ...fields, ...plan, hasPlanHash: Boolean(plan.planFingerprint), ...(actions ? { actions } : {}) };
}

// Only accept a successful standalone read of a known fixture gateway. A shell echo,
// a larger shell program and the assistant's prose are not skill-selection evidence.
function readGateway(command, root) {
  if (typeof command !== "string" || command.length > 800) return null;
  const shell = command.match(/^\/(?:bin|usr\/bin)\/(?:zsh|bash|sh) -(?:lc|c) (['"])([\s\S]*)\1$/u);
  const body = shell?.[2] ?? command;
  const simple = body.match(/^(?:cat |sed -n (?:'\d+,\d+p'|"\d+,\d+p"|\d+,\d+p) )(?:"([^"]+)"|'([^']+)'|([^\s"'|;&<>$()]+))$/u);
  if (!simple) return null;
  const resolved = path.resolve(root, simple[1] ?? simple[2] ?? simple[3]);
  return PACKAGES.find(key => resolved === path.join(root, ".agents", "skills", "wl-skills-" + key, "SKILL.md")) ?? null;
}

function codexTool(item, root, type, id) {
  const finished = type === "item.completed";
  if (item.type === "command_execution" && finished && item.exit_code === 0 && item.status === "completed") {
    const skill = readGateway(item.command, root);
    if (skill) return { id, kind: "skill", skill, status: "completed", via: "gateway-read", source: "codex-jsonl" };
  }
  return item.type === "mcp_tool_call" && isId(item.tool) ? codexMcp(item, id, finished) : null;
}

const mcpErrorKinds = [
  ["input-schema", /参数校验失败|invalid params|invalid arguments/i],
  ["output-schema", /工具输出不符合契约|output schema/i],
  ["local-config", /配置加载失败|配置文件不存在|填写真实的|加载本包项目配置/i],
  ["host-approval-required", /MCP tool call requires approval|MCP tool call approval (?:was )?(?:denied|rejected)/i],
  ["host-cancelled", /tool call (?:was )?cancel(?:l)?ed|request (?:was )?cancel(?:l)?ed/i],
  ["host-transport", /(?:MCP server|transport|connection) (?:has )?(?:closed|disconnected|not found)|unknown server/i],
  ["access-denied", /\b(?:EPERM|EACCES)\b|operation not permitted|permission denied/i],
  ["network-connection", /\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT)\b|请求超时|connection refused/i],
  ["task-scope", /尚未 task|没有任务记录|源码边界未通过/i],
];

function mcpErrorKind(item, result) {
  const content = Array.isArray(result.content) ? result.content.slice(0, 7) : [];
  const message = [item.error?.message ?? item.error, ...content.map(entry => entry?.text)]
    .filter(value => typeof value === "string").map(value => value.slice(0, 1200)).join("\n");
  return mcpErrorKinds.find(([, pattern]) => pattern.test(message))?.[0] ?? "tool-failure-unclassified";
}

function codexMcp(item, id, finished) {
  const result = item.result ?? {};
  const fields = mcpResult(result.structured_content ?? result.structuredContent, item.tool);
  const status = codexMcpStatus(item, result, fields, finished);
  return { id, kind: "tool", channel: "mcp", tool: item.tool, source: "codex-jsonl",
    status, ...(isId(item.server) ? { server: item.server } : {}), argumentShape: argumentShape(item),
    ...(status === "failed" ? { failureKind: mcpErrorKind(item, result), failureOrigin: mcpFailureOrigin(item) } : {}),
    ...(Object.keys(fields).length ? { result: fields } : {}) };
}

function argumentShape(item) {
  if (!Object.hasOwn(item, "arguments")) return "absent";
  if (item.arguments === null) return "null";
  if (Array.isArray(item.arguments)) return "array";
  return typeof item.arguments;
}

function mcpFailureOrigin(item) {
  if (item.error) return "host-error";
  if (item.result) return "tool-result";
  return "terminal-status";
}

function codexMcpStatus(item, result, fields, finished) {
  if (!finished) return "started";
  return item.status === "completed" && !item.error && !result.isError && !result.is_error && fields.ok !== false ? "completed" : "failed";
}

function parseCodex(trace, { root, exitCode, infrastructure, durationMs, host }) {
  const evidence = [];
  let complete = false;
  let invalid = false;
  let metrics = {};
  const events = trace.split(/\r?\n/u).filter(line => line.trim()).map(parseTraceLine);
  for (const event of events) {
    if (!event) { invalid = true; continue; }
    if (event.type === "turn.completed") { complete = true; metrics = usage(event.usage); }
    if (!["item.started", "item.completed"].includes(event.type) || !isObject(event.item)) continue;
    if (!isId(event.item.id)) { invalid = true; continue; }
    const observed = codexTool(event.item, root, event.type, event.item.id);
    if (observed) evidence.push(observed);
  }
  // The Codex stream can prove a recorded gateway read, but cannot establish that
  // every implicit skill activation had a visible event in this protocol version.
  const { hostToolCalls, counts, failures } = eventSummary(events);
  const status = infrastructure ?? terminalStatus(exitCode, complete, invalid, counts["turn.failed"] > 0);
  return { host: hostMetadata(host), status, coverage: { skill: false, tools: status === "completed" },
    evidence, traceEventCounts: counts, ...(Object.keys(failures).length ? { hostFailureKinds: failures } : {}),
    metrics: usage({ ...metrics, duration_ms: durationMs, host_tool_calls: hostToolCalls }) };
}

const hostErrorKinds = [
  ["connection-retry", /^reconnecting\b/iu],
  ["authentication", /(?:status(?: code)?[ :]+401\b|unauthori[sz]ed|authentication failed)/iu],
  ["rate-limit", /(?:status(?: code)?[ :]+429\b|rate limit exceeded|too many requests)/iu],
  ["sandbox-permission", /operation not permitted|permission denied|\b(?:EPERM|EACCES)\b/iu],
  ["connection-failure", /stream disconnected|error sending request|connection (?:refused|reset)|dns error|\b(?:ECONNRESET|ETIMEDOUT)\b/iu],
];

function hostErrorKind(event) {
  if (event.type !== "error" && event.type !== "turn.failed") return null;
  const message = event.error?.message ?? event.message;
  if (typeof message !== "string") return "unclassified";
  return hostErrorKinds.find(([, pattern]) => pattern.test(message.slice(0, 1200).trim()))?.[0] ?? "unclassified";
}

function eventSummary(events) {
  const tools = new Set();
  const counts = {};
  const failures = {};
  for (const event of events.filter(Boolean)) {
    if (EVENT_TYPES.has(event.type)) counts[event.type] = (counts[event.type] ?? 0) + 1;
    if (event.item && HOST_TOOL_TYPES.has(event.item.type) && isId(event.item.id)) tools.add(event.item.id);
    const failure = hostErrorKind(event);
    if (failure) failures[failure] = (failures[failure] ?? 0) + 1;
  }
  return { hostToolCalls: tools.size, counts, failures };
}

function parseTraceLine(line) {
  try { const event = JSON.parse(line); return isObject(event) ? event : null; } catch { return null; }
}

function terminalStatus(exitCode, complete, invalid, failed) {
  if (invalid) return "invalid-trace";
  return exitCode === 0 && complete && !failed ? "completed" : "host-error";
}

function portableEvent(row, runId) {
  if (!isObject(row) || !isId(row.id)) throw new Error("invalid portable event");
  if (row.kind === "skill") {
    if (!PACKAGES.includes(row.skill) || row.status !== "completed" || !["implicit", "explicit"].includes(row.invocation)) {
      throw new Error("invalid portable skill observation");
    }
    return { id: row.id, kind: row.kind, skill: row.skill, invocation: row.invocation, status: "completed", via: "reported-native-event", source: "portable" };
  }
  return portableTool(row, runId);
}

function portableTool(row, runId) {
  if (!validPortableTool(row, runId)) throw new Error("invalid portable tool observation");
  return { id: row.id, kind: row.kind, channel: row.channel, tool: row.tool, status: row.status, source: "portable",
    ...(row.channel === "mcp" && row.result ? { result: mcpResult(row.result, row.tool) } : {}),
    ...(row.channel === "mcp" && row.server !== undefined ? { server: row.server } : {}),
    ...(row.channel === "cli" ? { package: row.package, runId } : {}) };
}

function validPortableTool(row, runId) {
  return row.kind === "tool" && ["mcp", "cli"].includes(row.channel) && isId(row.tool)
    && ["started", "completed", "failed"].includes(row.status)
    && (row.channel === "mcp" ? row.server === undefined || isId(row.server) : PACKAGES.includes(row.package) && row.runId === runId);
}

function validPortable(data) {
  return isObject(data) && data.schemaVersion === 1 && VARIANTS.has(data.variant) && isId(data.runId)
    && ["completed", "host-error", "timeout", "invalid-trace"].includes(data.status) && Array.isArray(data.events) && data.events.length <= 1000;
}

function parsePortable(data) {
  if (!validPortable(data)) throw new Error("unsupported portable evidence");
  return { host: hostMetadata(data.host), variant: data.variant, runId: data.runId, status: data.status,
    coverage: { skill: data.status === "completed" && data.coverage?.skill === true, tools: data.status === "completed" && data.coverage?.tools === true },
    evidence: data.events.map(event => portableEvent(event, data.runId)), metrics: usage(data.metrics), source: "portable-operator-export" };
}

function score(status, reason) { return { status, reason }; }

function checkSkill(row, trial, variant) {
  const expected = row.expect.skill;
  if (expected === undefined || variant === "no-skill") return score("skipped", "not required for this variant");
  const observed = trial.evidence.filter(item => item.kind === "skill");
  const unexpectedPackages = [...new Set(observed.filter(item => item.skill !== expected).map(item => item.skill))].sort();
  if (unexpectedPackages.length) return { ...score("failed", "observed unexpected WL skill use"), unexpectedPackages };
  const invocation = row.expect.invocation ?? "implicit";
  const matching = observed.some(item => item.skill === expected && (item.invocation === invocation || (!item.invocation && invocation === "implicit")));
  if (expected && matching) return score("passed", "observed matching skill use");
  if (trial.status !== "completed") return score("unknown", "host run incomplete");
  if (!trial.coverage.skill) return score("unknown", "host does not provide complete skill-selection evidence");
  return expected === null ? score("passed", "complete host trace contained no WL selection") : score("failed", "expected skill not observed");
}

function checkDecision(expect, trial, variant) {
  if (!expect.subskill || variant === "no-skill") return score("skipped", "not required for this variant");
  const decisions = trial.evidence.filter(item => item.kind === "decision" && item.source === "journal"
    && item.runId === trial.runId && item.package === expect.skill);
  if (!decisions.length) return score(trial.status === "completed" && trial.journalComplete ? "failed" : "unknown", "same-run task decision not observed");
  const expected = [expect.subskill].flat().sort();
  if (decisions.every(item => JSON.stringify([...item.selected].sort()) === JSON.stringify(expected))) {
    return score("passed", "same-run task decision selected the expected subskill");
  }
  return score("failed", "same-run task decision selected a different subskill");
}

function toolKey(event) {
  return event.channel === "mcp" ? "mcp:" + event.tool : `cli:${event.package}:${event.tool}`;
}

function checkTool(expected, required, trial, variant, skill) {
  const key = expected.includes(":") ? expected : "mcp:" + expected;
  const seen = trial.evidence.filter(event => event.kind === "tool" && toolKey(event) === key);
  if (required) return checkRequiredTool(key, seen, trial, variant, skill);
  if (seen.length) return score("failed", "observed forbidden tool attempt");
  if (trial.status !== "completed") return score("unknown", "host run incomplete");
  if (variant !== "no-skill" && !catalogObserved(key, trial)) return score("unknown", "MCP availability was not observed");
  return coveredTool(key, trial) ? score("passed", "no forbidden tool attempt observed") : score("unknown", "tool observation incomplete");
}

function coveredTool(key, trial) { return key.startsWith("mcp:") && trial.coverage.tools; }

function catalogObserved(key, trial, serverName) {
  if (!key.startsWith("mcp:") || !trial.discovery?.mcp) return true;
  return trial.discovery.mcp.servers.some(server => (!serverName || server.name === serverName) && server.tools.includes(key.slice(4)));
}

function completedToolEvidence(seen) {
  const terminal = seen.filter(event => event.status !== "started");
  const host = terminal.filter(event => event.source !== "journal");
  return host.length ? host : terminal;
}

function checkRequiredTool(key, seen, trial, variant, skill) {
  if (variant === "no-skill") return score("skipped", "WL requirement removed from no-skill baseline");
  const server = key.startsWith("mcp:") ? MCP_SERVERS[skill] : undefined;
  const scoped = scopeMcpEvidence(seen, server);
  if (scoped.issue) return scoped.issue;
  const terminal = completedToolEvidence(scoped.events);
  if (terminal.some(event => event.status === "completed")) return score("passed", "tool completed");
  if (trial.status !== "completed") return score("unknown", "host run incomplete");
  if (terminal.length) return score("failed", "required tool did not complete");
  if (!catalogObserved(key, trial, server)) return score("unknown", "MCP availability was not observed");
  if (coveredTool(key, trial)) return score("failed", "required tool did not complete");
  return score("unknown", "tool observation incomplete");
}

function checkAssertion(assertion, before, after) {
  if (!after?.observable || (assertion.kind === "unchanged" && !before?.observable)) return score("unknown", "fixture outcome not observed");
  const result = {
    unchanged: () => JSON.stringify(before.value) === JSON.stringify(after.value),
    exists: () => after.value !== null,
    absent: () => after.value === null,
    contains: () => after.value?.type === "file" && after.value.contains === true,
  }[assertion.kind]();
  return score(result ? "passed" : "failed", "deterministic fixture snapshot");
}

function scopeMcpEvidence(events, server) {
  if (!server || !events.length) return { events };
  const host = events.filter(item => item.source !== "journal");
  const matched = host.filter(item => item.server === server);
  if (matched.length) return { events: matched };
  return { events: [], issue: host.some(item => item.server)
    ? score("failed", "tool was observed on a different MCP server") : score("unknown", "expected MCP server identity was not observed") };
}

function checkMcpResult(expected, trial, variant, skill) {
  if (variant === "no-skill") return score("skipped", "WL requirement removed from no-skill baseline");
  const scoped = scopeMcpEvidence(trial.evidence.filter(item => item.kind === "tool" && item.channel === "mcp" && item.tool === expected.tool), MCP_SERVERS[skill]);
  if (scoped.issue) return scoped.issue;
  const toolEvents = scoped.events;
  const observed = toolEvents.filter(item => item.status === "completed" && item.result);
  if (!observed.length) {
    if (trial.status !== "completed") return score("unknown", "host run incomplete");
    const failed = toolEvents.some(item => item.status === "failed") && !toolEvents.some(item => item.status === "completed");
    return failed ? score("failed", "MCP call failed before returning the required result") : score("unknown", "structured MCP result not observed");
  }
  return score(observed.some(item => matchMcpResult(expected, item.result))
    ? "passed" : "failed", "observed structured MCP result");
}

function matchMcpResult(expected, observed) {
  if (!Object.entries(expected.fields).every(([key, value]) => observed[key] === value)) return false;
  if (!expected.menuPlan) return true;
  return observed.hasPlanHash === true && JSON.stringify(observed.actions) === JSON.stringify(menuActions(expected.menuPlan));
}

function checkReceipt(tool, expect, trial, variant) {
  if (variant === "no-skill") return score("skipped", "not required for this variant");
  const key = tool.includes(":") ? tool : "mcp:" + tool;
  const receipts = trial.evidence.filter(item => item.kind === "tool" && item.source === "journal"
    && item.runId === trial.runId && item.package === expect.skill && item.status === "completed" && toolKey(item) === key);
  if (!receipts.length) return score(trial.status === "completed" && trial.journalComplete ? "failed" : "unknown", "same-run completed package receipt not observed");
  const menu = expect.expectedMcpResults?.find(item => `mcp:${item.tool}` === key && item.menuPlan);
  if (!menu) return score("passed", "same-run completed package receipt observed");
  return checkMenuReceipt(menu.tool, receipts, trial.evidence, MCP_SERVERS[expect.skill]);
}

function checkMenuReceipt(tool, receipts, evidence, server) {
  // Compare what the host and the package actually recorded. The expected
  // actions are graded independently in checkMcpResult.
  const scoped = scopeMcpEvidence(evidence.filter(item => item.kind === "tool" && item.channel === "mcp" && item.source !== "journal"
    && item.tool === tool && item.status === "completed"), server);
  if (scoped.issue) return scoped.issue;
  const fingerprints = scoped.events.map(item => item.result?.planFingerprint).filter(Boolean);
  if (!fingerprints.length) return score("unknown", "native menu plan hash not observed for receipt comparison");
  return receipts.some(item => fingerprints.includes(item.planFingerprint))
    ? score("passed", "same-run package receipt matches the native menu plan hash")
    : score("failed", "same-run package receipt does not match the native menu plan hash");
}

function grade(row, trial, variant, snapshots = {}) {
  const checkTools = (items, required) => (items ?? []).map(tool => ({ tool, ...checkTool(tool, required, trial, variant, row.expect.skill) }));
  const assertions = (row.expect.assertions ?? []).map((assertion, index) => ({
    kind: assertion.kind, path: assertion.path, ...checkAssertion(assertion, snapshots.before?.[index], snapshots.after?.[index]),
  }));
  return { selection: checkSkill(row, trial, variant), decision: checkDecision(row.expect, trial, variant),
    receipts: (row.expect.requiredReceipts ?? []).map(tool => ({ tool, ...checkReceipt(tool, row.expect, trial, variant) })),
    requiredTools: checkTools(row.expect.requiredTools, true),
    forbiddenTools: checkTools(row.expect.forbiddenTools, false),
    expectedMcpResults: (row.expect.expectedMcpResults ?? []).map(expected => ({ tool: expected.tool, ...checkMcpResult(expected, trial, variant, row.expect.skill) })),
    assertions };
}

module.exports = { PACKAGES, VARIANTS, IDENTIFIER, catalogCases, grade, hash, hostMetadata, mcpErrorKind, mcpResult, parseCodex, parsePortable, readJSON, readJournal, relativePath, safePath, snapshotAssertions, wantedPackages };

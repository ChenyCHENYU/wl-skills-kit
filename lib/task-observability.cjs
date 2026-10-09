"use strict";

// Identical, dependency-free protocol snapshot shipped by each independent WL package.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const RECORD_VERSION = 1;
const STORAGE = {
  "@agile-team/wl-skills-kit": ".wl-skills/runs",
  "@agile-team/wl-skills-ui": ".wl-skills-ui/runs",
  "@agile-team/wl-skills-bd": ".wl-skills-bd/runs",
  "@agile-team/wl-skills-design": ".wl-skills-design/runs",
  "@agile-team/wl-skills-test": ".wl-skills-test/runs",
};
const VALIDATION_STATES = new Set(["passed", "failed", "partial", "unverified", "not-applicable"]);
const CHECK_STATES = new Set(["passed", "failed", "skipped", "not-applicable", "unverified", "not-executed"]);
const DECISION_STATES = new Set(["matched", "baseline", "ambiguous", "gap", "not-applicable", "needs-context"]);
let previousTimestamp = 0;

function strings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
}

function normalized(value) {
  return String(value || "").normalize("NFKC").toLowerCase().trim();
}

function safeText(value, limit = 1000) {
  return String(value || "").replace(/npm_[A-Za-z0-9]{20,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, limit);
}

function safeMetadata(value, depth = 0) {
  if (depth > 5) return "[bounded]";
  if (typeof value === "string") return safeText(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeMetadata(item, depth + 1));
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key,
    /token|password|secret|authorization|cookie|requestBody|responseBody/i.test(key) ? "[redacted]" : safeMetadata(item, depth + 1),
  ]));
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function phraseMatches(text, phrase) {
  const needle = normalized(phrase);
  if (!needle) return false;
  let index = text.indexOf(needle);
  while (index !== -1) {
    const before = text.slice(Math.max(0, index - 16), index);
    const after = text[index + needle.length] || "";
    const boundary = !/^[a-z0-9_-]+$/i.test(needle) || !/[a-z0-9_-]/i.test((text[index - 1] || "") + after);
    const negated = /(?:不要|不用|无需|禁止|别|不是|不做|不|do not|don't|without)\s*$/i.test(before);
    if (boundary && !negated) return true;
    index = text.indexOf(needle, index + needle.length);
  }
  return false;
}

function matches(text, words) {
  return strings(words).filter((word) => phraseMatches(text, word));
}

function scoreSkill(skill, text, contextText) {
  const hits = matches(text, skill.triggers);
  const negative = matches(text, skill.negative);
  const contextHits = matches(contextText, skill.contexts);
  // 最长命中加权：更长的触发短语代表更具体的意图（如「表单弹窗布局」优先于「表单」「弹窗」），
  // 只在同一命中数级别内打破平局，不改变命中数量的主导地位。
  const longestHit = hits.reduce((max, phrase) => Math.max(max, String(phrase).length), 0);
  const score = negative.length ? -100 : hits.length * 5 + contextHits.length * 2 + longestHit;
  return { id: skill.id, path: skill.path || null, score, hits, contextHits, negative, status: skill.status || "released" };
}

function targetRelevance(targets, policy) {
  const extensions = strings(policy.domainExtensions).map(normalized);
  return strings(targets).some((target) => extensions.some((extension) => normalized(target).endsWith(extension)));
}

function taskSignals(options) {
  const policy = options.policy || {};
  const text = normalized(options.task);
  const context = options.context || {};
  const contextText = `${text} ${strings(options.targets).join(" ")} ${strings(context.signals).join(" ")}`;
  const relevant = matches(text, policy.domainKeywords).length > 0 || targetRelevance(options.targets, policy) || context.domainRelevant === true;
  return { policy, text, contextText, relevant, negative: matches(text, policy.negativeKeywords) };
}

function decision(status, reasons, candidates, selected, options) {
  const catalog = options.catalog || [];
  const policy = options.policy || {};
  const skills = catalog.filter((skill) => selected.includes(skill.id));
  const baselineApplies = !["not-applicable", "needs-context"].includes(status);
  const baselineRules = baselineApplies ? strings(policy.baselineRules) : [];
  const applicable = status === "needs-context" ? null : status !== "not-applicable";
  return {
    recordVersion: RECORD_VERSION, status, applicable, reasons, reason: reasons.join("；"),
    selectedSkills: selected, candidates, baselineRules,
    requiredRules: strings([...baselineRules, ...skills.flatMap((skill) => skill.rules || [])]),
    requiredChecks: strings([...(baselineApplies ? policy.baselineChecks || [] : []), ...skills.flatMap((skill) => skill.checks || [])]),
    requiredFiles: strings(skills.map((skill) => skill.path)), missingInputs: status === "needs-context" ? ["目标文件或任务范围"] : [], gaps: [],
    selectionEvidence: "deterministic-routing", hostDiscovery: "unverified", contentLoaded: "unverified",
  };
}

function gapDecision(reasons, candidates, options) {
  const result = decision("gap", reasons, candidates, [], options);
  result.gaps = [{ reason: reasons.join("；"), suggestion: "补充本包适用规则、技能或执行器，并增加正向、负向和歧义回归；保留人工判断。" }];
  return result;
}

function selectDecision(candidates, signals, options) {
  const { policy } = signals;
  const first = candidates[0];
  const second = candidates[1];
  const minimum = policy.minimumScore ?? 5;
  const margin = policy.minimumMargin ?? 2;
  if (!first || first.score < minimum) return null;
  if (second && first.score - second.score < margin) return decision("ambiguous", ["多个技能候选接近，需明确任务范围"], candidates, [], options);
  if (!["released", "enabled", "active"].includes(first.status)) return gapDecision(["相关技能尚未具备可用执行能力"], candidates, options);
  return decision("matched", [`命中 ${first.id}：${first.hits.join("、") || first.contextHits.join("、")}`], candidates, [first.id], options);
}

function fallbackDecision(candidates, signals, options) {
  if (!signals.relevant && signals.negative.length) return decision("not-applicable", ["任务明确属于本包职责之外", ...signals.negative], candidates, [], options);
  if (!signals.relevant) return decision("needs-context", ["尚无足够证据确认与本包约束有关，请提供目标文件或任务范围"], candidates, [], options);
  if (matches(signals.text, signals.policy.unsupportedIntents).length) return gapDecision(["任务与本包相关，但当前能力尚未覆盖该意图"], candidates, options);
  if (strings(signals.policy.baselineRules).length) return decision("baseline", ["任务涉及本包范围，应用基础约束，未选中专门技能"], candidates, [], options);
  return gapDecision(["任务与本包相关，但没有适用技能或基础约束"], candidates, options);
}

function evaluateTask(options = {}) {
  const signals = taskSignals(options);
  const candidates = (options.catalog || []).map((skill) => scoreSkill(skill, signals.text, signals.contextText))
    .filter((skill) => skill.score > 0).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return selectDecision(candidates, signals, options) || fallbackDecision(candidates, signals, options);
}

function assertRunId(value) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value || "")) throw new Error("Invalid WL runId");
  return value;
}

function storage(options) {
  const expected = STORAGE[options.packageName];
  if (!expected || (options.storageDir && options.storageDir !== expected)) throw new Error("WL package storage must remain in its own namespace");
  const projectRoot = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  return { projectRoot, directory: path.join(projectRoot, expected), relative: expected };
}

function inspectAncestors(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("WL path escapes project root");
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error("WL evidence paths must not traverse symlinks");
  }
  return target;
}

function projectPath(root, relative) {
  if (typeof relative !== "string" || !relative) throw new Error("WL evidence path is required");
  return inspectAncestors(root, path.resolve(root, relative));
}

function readEvidencePath(root, relative) {
  if (typeof relative !== "string" || !relative) throw new Error("WL evidence path is required");
  const requested = path.resolve(root, relative);
  const lexical = path.relative(root, requested);
  if (!path.isAbsolute(relative) && (lexical.startsWith("..") || path.isAbsolute(lexical))) throw new Error("WL path escapes project root");
  let ancestor = requested;
  const suffix = [];
  while (!fs.existsSync(ancestor) && ancestor !== root) {
    suffix.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  const physical = path.resolve(fs.realpathSync(ancestor), ...suffix);
  const resolved = path.relative(root, physical);
  if (resolved.startsWith("..") || path.isAbsolute(resolved)) throw new Error("WL read evidence escapes project root");
  return physical;
}

function captureReadEvidence(options, targets) {
  const root = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  const requested = strings(targets);
  const snapshot = captureSnapshot({ projectRoot: root, targets: requested.map((target) => path.relative(root, readEvidencePath(root, target)) || ".") });
  return { ...snapshot, targets: requested, resolution: "project-internal-realpath" };
}

function snapshotFile(root, target, state) {
  const relative = path.relative(root, target).split(path.sep).join("/");
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) { state.omitted.push({ path: relative, reason: "symlink" }); return; }
  if (stat.isDirectory()) { snapshotDirectory(root, target, state); return; }
  if (!stat.isFile()) { state.omitted.push({ path: relative, reason: "not-file" }); return; }
  if (state.files.length >= 1000 || state.bytes + stat.size > 16 * 1024 * 1024) { state.omitted.push({ path: relative, reason: "snapshot-budget" }); return; }
  state.files.push({ path: relative, sha256: digest(fs.readFileSync(target)), bytes: stat.size });
  state.bytes += stat.size;
}

function snapshotDirectory(root, target, state) {
  const ignored = new Set(["node_modules", ".git", "coverage", "dist", ".env", ".npmrc"]);
  for (const entry of fs.readdirSync(target).sort()) {
    if (ignored.has(entry) || entry.startsWith(".env.") || entry === "env.local.json") continue;
    const relative = path.relative(root, path.join(target, entry)).split(path.sep).join("/");
    if (Object.values(STORAGE).includes(relative)) continue;
    snapshotFile(root, path.join(target, entry), state);
  }
}

function captureSnapshot(options = {}) {
  const root = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  const state = { files: [], omitted: [], bytes: 0 };
  for (const relative of strings(options.targets)) {
    const target = projectPath(root, relative);
    if (!fs.existsSync(target)) { state.omitted.push({ path: relative, reason: "missing" }); continue; }
    snapshotFile(root, target, state);
  }
  state.files = [...new Map(state.files.map((file) => [file.path, file])).values()].sort((left, right) => left.path.localeCompare(right.path));
  const complete = state.omitted.length === 0;
  return { targets: strings(options.targets), files: state.files, omitted: state.omitted, complete, sha256: digest(JSON.stringify({ files: state.files, omitted: state.omitted })) };
}

function runMetadata(options) {
  const location = storage(options);
  const runId = assertRunId(options.runId || process.env.WL_TASK_RUN_ID || crypto.randomUUID());
  return { recordVersion: RECORD_VERSION, packageName: options.packageName, packageVersion: options.packageVersion || "unknown", runId, location };
}

function appendRecord(options, record) {
  if (options.persist === false) return null;
  const location = storage(options);
  const directory = inspectAncestors(location.projectRoot, path.join(location.directory, assertRunId(record.runId)));
  fs.mkdirSync(directory, { recursive: true });
  inspectAncestors(location.projectRoot, directory);
  const name = `${Date.now()}-${crypto.randomUUID()}.json`;
  writeRecordFile(directory, name, record);
  return path.relative(location.projectRoot, path.join(directory, name)).split(path.sep).join("/");
}

function writeRecordFile(directory, name, record) {
  const temporary = path.join(directory, `.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, path.join(directory, name));
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function baseRecord(metadata, kind) {
  previousTimestamp = Math.max(Date.now(), previousTimestamp + 1);
  return { recordVersion: RECORD_VERSION, kind, packageName: metadata.packageName, packageVersion: metadata.packageVersion, runId: metadata.runId, recordedAt: new Date(previousTimestamp).toISOString(), eventId: crypto.randomUUID() };
}

function startTask(options) {
  const metadata = runMetadata(options);
  const selected = options.decision || evaluateTask(options);
  if (!DECISION_STATES.has(selected.status)) throw new Error("Unknown WL task decision status");
  const record = { ...baseRecord(metadata, "task-decision"), task: safeText(options.task), decision: selected, targets: strings(options.targets), inputSnapshot: captureSnapshot(options),
    ruleSnapshot: captureReadEvidence(options, [...strings(options.ruleFiles), ...strings(selected.requiredFiles)]),
    configSnapshot: contextSnapshot(options, "configFiles"), executionStatus: "not-executed", validationStatus: "unverified" };
  attachNotice(record, options);
  record.recordPath = appendRecord(options, record);
  return record;
}

function beginExecution(options) {
  const metadata = runMetadata(options);
  const record = { ...baseRecord(metadata, "tool-started"), tool: safeText(options.tool, 128), targets: strings(options.targets), executionStatus: "started", validationStatus: "unverified", inputSnapshot: captureSnapshot(options), ruleSnapshot: contextSnapshot(options, "ruleFiles"), configSnapshot: contextSnapshot(options, "configFiles") };
  record.recordPath = appendRecord(options, record);
  return { options: { ...options, runId: metadata.runId }, metadata, startedAt: Date.now(), record };
}

function contextSnapshot(options, key) {
  return captureReadEvidence(options, strings(options[key]));
}

function normalizeCheck(check) {
  const status = check.status === "pass" ? "passed" : check.status === "fail" ? "failed" : check.status === "skip" ? "skipped" : check.status;
  if (!CHECK_STATES.has(status)) throw new Error(`Invalid WL check status: ${status}`);
  return { id: safeText(check.id || check.rule || "unknown", 160), status, reason: safeText(check.reason || check.message), evidencePaths: strings(check.evidencePaths) };
}

function validationState(requested, checks, snapshot, changedDuringCheck) {
  if (checks.some((check) => check.status === "failed")) return "failed";
  if (requested === "failed") return "failed";
  if (requested !== "passed") return VALIDATION_STATES.has(requested) ? requested : "unverified";
  if (!checks.length || !snapshot.files.length) return "unverified";
  if (!snapshot.complete || changedDuringCheck || checks.some((check) => !["passed", "not-applicable"].includes(check.status))) return "partial";
  return applicableCheckState(checks);
}

function applicableCheckState(checks) {
  return checks.some((check) => check.status === "passed") ? "passed" : "not-applicable";
}

function checkedFileEvidence(options, files) {
  const root = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  const targets = strings(files);
  for (const target of targets) {
    const physical = readEvidencePath(root, target);
    if (!fs.existsSync(physical) || !fs.statSync(physical).isFile()) throw new Error("WL checkedFiles must name existing files actually checked, not directories");
  }
  return captureReadEvidence(options, targets);
}

function finishExecution(handle, result = {}) {
  const { options, metadata } = handle;
  const checks = (result.checks || []).map(normalizeCheck);
  const after = captureSnapshot(options);
  const ruleSnapshot = contextSnapshot(options, "ruleFiles");
  const configSnapshot = contextSnapshot(options, "configFiles");
  const checkedSnapshot = checkedFileEvidence(options, result.checkedFiles);
  const exitCode = Number.isInteger(result.exitCode) ? result.exitCode : 0;
  const changed = options.readOnlyVerification === true && [
    [after, handle.record.inputSnapshot], [ruleSnapshot, handle.record.ruleSnapshot], [configSnapshot, handle.record.configSnapshot],
  ].some(([current, before]) => current.sha256 !== before.sha256);
  const record = {
    ...baseRecord(metadata, "tool-finished"), executionId: handle.record.eventId, executionStartedAt: handle.record.recordedAt, tool: handle.record.tool, targets: handle.record.targets,
    executionStatus: exitCode === 0 ? "completed" : "failed", exitCode, durationMs: Date.now() - handle.startedAt,
    validationStatus: validationState(result.validationStatus, checks, after, changed), checks,
    checkedFiles: checkedSnapshot.files, checkedSnapshot, checkedScopeSource: Array.isArray(result.checkedFiles) ? "executor" : "unreported",
    summary: safeMetadata(result.summary || {}), inputSnapshot: after, inputBefore: handle.record.inputSnapshot,
    changedDuringCheck: changed, artifacts: captureSnapshot({ projectRoot: options.projectRoot, targets: result.artifacts || [] }).files,
    ruleSnapshot, configSnapshot,
    errorCode: safeText(result.errorCode, 128),
  };
  record.recordPath = appendRecord(options, record);
  return record;
}

async function withExecution(options, fn) {
  const handle = beginExecution(options);
  try {
    const result = await fn();
    const attributes = options.summarize ? options.summarize(result) : {};
    return { result, receipt: finishExecution(handle, attributes), runId: handle.metadata.runId };
  } catch (error) {
    finishExecution(handle, { exitCode: 1, validationStatus: "unverified", errorCode: error.code || error.name });
    throw error;
  }
}

function readRecord(file, expectedPackage) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (data.recordVersion !== RECORD_VERSION || data.packageName !== expectedPackage) throw new Error("Unknown or foreign WL execution record");
  assertRunId(data.runId);
  return data;
}

function allRecords(options) {
  const location = storage(options);
  inspectAncestors(location.projectRoot, location.directory);
  if (!fs.existsSync(location.directory)) return [];
  const runIds = options.runId ? [assertRunId(options.runId)] : fs.readdirSync(location.directory).filter((name) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name));
  const records = runIds.flatMap((runId) => recordsForRun(location, runId, options.packageName));
  return records.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.eventId.localeCompare(right.eventId));
}

function recordsForRun(location, runId, packageName) {
  const directory = inspectAncestors(location.projectRoot, path.join(location.directory, runId));
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith(".json")).map((name) => {
    const file = inspectAncestors(location.projectRoot, path.join(directory, name));
    const record = readRecord(file, packageName);
    if (record.runId !== runId) throw new Error("WL record runId does not match its directory");
    return record;
  });
}

function isFresh(record, options) {
  if (!record.inputSnapshot) return null;
  return snapshotsFresh([record.inputSnapshot, record.ruleSnapshot, record.configSnapshot, record.checkedSnapshot], options);
}

function snapshotsFresh(snapshots, options) {
  return snapshots.filter(Boolean).every((snapshot) => currentSnapshot(snapshot, options).sha256 === snapshot.sha256);
}

function currentSnapshot(snapshot, options) {
  return snapshot.resolution === "project-internal-realpath" ? captureReadEvidence(options, snapshot.targets) : captureSnapshot({ projectRoot: options.projectRoot, targets: snapshot.targets });
}

function pendingChecks(plan, tools) {
  const performed = new Set(tools.flatMap((record) => (record.checks || []).filter((check) => ["passed", "failed", "not-applicable"].includes(check.status)).map((check) => check.id)));
  return strings(plan?.decision?.requiredChecks).filter((id) => !performed.has(id));
}

function summarizeValidation(tools, pending, stale, unresolved) {
  if (stale) return "stale";
  if (tools.some((record) => record.validationStatus === "failed")) return "failed";
  if (!tools.length) return "unverified";
  if (pending.length || unresolved || tools.some((record) => ["partial", "unverified"].includes(record.validationStatus))) return "partial";
  return tools.some((record) => record.validationStatus === "passed") ? "passed" : "not-applicable";
}

function statusForRecords(records, options) {
  const plan = records.filter((record) => record.kind === "task-decision").at(-1);
  const history = records.filter((record) => record.kind === "tool-finished");
  const tools = latestTools(history);
  const started = records.filter((record) => record.kind === "tool-started");
  const current = validationContext(plan, tools, options);
  const failed = tools.some((record) => record.executionStatus === "failed");
  return attachNotice({
    recordVersion: RECORD_VERSION, packageName: options.packageName, ...lastRecordContext(records.at(-1), options),
    ...planContext(plan), records, tools,
    executionStatus: executionState(failed, started, history),
    ...current, stages: { selected: plan ? plan.decision.status : "unverified", hostDiscovered: "unverified", contentLoaded: "unverified", toolsExecuted: history.length },
  }, options);
}

function validationContext(plan, tools, options) {
  const pending = pendingChecks(plan, tools);
  const outdatedChecker = Boolean(options.packageVersion) && [...tools, ...plan ? [plan] : []].some((record) => record.packageVersion !== options.packageVersion);
  const planStale = Boolean(plan) && !snapshotsFresh([plan.ruleSnapshot, plan.configSnapshot], options);
  const stale = outdatedChecker || planStale || tools.some((record) => isFresh(record, options) === false);
  const verifiers = tools.filter((record) => record.checks.length || record.validationStatus !== "unverified");
  const scopeGaps = uncoveredScope(plan, verifiers, options);
  const unresolvedDecision = Boolean(plan) && ["gap", "ambiguous", "needs-context"].includes(plan.decision.status);
  const executionOrderUnverified = ambiguousExecutionOrder(tools);
  return { validationStatus: summarizeValidation(verifiers, pending, stale, unresolvedDecision || scopeGaps.length > 0 || executionOrderUnverified), pendingChecks: pending, stale, outdatedChecker, planStale, scopeGaps, unresolvedDecision, executionOrderUnverified };
}

function uncoveredScope(plan, tools, options) {
  if (!plan) return [];
  const root = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  const rulePaths = new Set([...(plan.ruleSnapshot?.targets || []), ...strings(plan.decision.requiredFiles)].map((target) => readEvidencePath(root, target)));
  const targets = plan.targets.filter((target) => !rulePaths.has(readEvidencePath(root, target)));
  if (!targets.length) return [];
  const current = captureSnapshot({ projectRoot: root, targets });
  const checked = new Set(tools.filter((record) => record.checks.length).flatMap((record) => (record.checkedFiles || []).map((file) => file.path)));
  return [...current.files.filter((file) => !checked.has(file.path)).map((file) => ({ path: file.path, reason: "task-target-not-checked" })), ...current.omitted];
}

function planContext(plan) {
  if (!plan) return { task: null, decision: null, gaps: [] };
  return { task: plan.task, decision: plan.decision, targets: plan.targets, gaps: plan.decision.gaps || [] };
}

function lastRecordContext(latest, options) {
  if (!latest) return { runId: options.runId || null, recordedAt: null };
  return { runId: latest.runId, recordedAt: latest.recordedAt };
}

function executionState(failed, started, history) {
  if (failed) return "failed";
  if (started.some((record) => !history.some((finished) => finished.executionId === record.eventId))) return "running";
  return history.length ? "completed" : "not-executed";
}

function latestTools(history) {
  const result = new Map();
  for (const record of history) {
    const key = `${record.tool}:${JSON.stringify(record.targets)}`;
    const previous = result.get(key);
    if (!previous || executionOrder(record) > executionOrder(previous[0])) result.set(key, [record]);
    else if (executionOrder(record) === executionOrder(previous[0])) previous.push(record);
  }
  return [...result.values()].flat();
}

function ambiguousExecutionOrder(tools) {
  const keys = tools.map((record) => `${record.tool}:${JSON.stringify(record.targets)}`);
  return new Set(keys).size !== keys.length;
}

function executionOrder(record) {
  return record.executionStartedAt || record.recordedAt;
}

function readStatus(options) {
  const records = allRecords(options);
  const runId = options.runId || records.at(-1)?.runId;
  return statusForRecords(records.filter((record) => record.runId === runId), options);
}

function listGaps(options) {
  const grouped = new Map();
  for (const record of allRecords(options).filter((item) => item.kind === "task-decision")) {
    for (const gap of record.decision.gaps || []) {
      const id = digest(JSON.stringify({ packageName: options.packageName, reason: gap.reason, task: normalized(record.task) })).slice(0, 16);
      const previous = grouped.get(id);
      grouped.set(id, { id, packageName: options.packageName, reason: safeText(gap.reason), suggestion: safeText(gap.suggestion), task: record.task, occurrences: (previous?.occurrences || 0) + 1, lastSeen: record.recordedAt, runId: record.runId, status: "proposed" });
    }
  }
  return [...grouped.values()];
}

function inspectHostFile(root, relative, maximum) {
  const file = readEvidencePath(root, relative);
  if (!fs.existsSync(file)) return { path: relative, status: "missing" };
  const stat = fs.statSync(file);
  return { path: relative, status: stat.isFile() ? "present" : "not-file", bytes: stat.size, oversized: stat.size > maximum, sha256: stat.isFile() ? digest(fs.readFileSync(file)) : null };
}

function doctorHost(options) {
  const root = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  const maximum = options.maxInstructionBytes || 32768;
  const entries = strings(options.entryFiles).map((relative) => inspectHostFile(root, relative, maximum));
  const skills = strings(options.skillPaths).map((relative) => inspectHostFile(root, relative, Infinity));
  const gateway = options.gatewayPath ? inspectHostFile(root, options.gatewayPath, Infinity) : null;
  const warnings = entries.filter((entry) => entry.oversized).map((entry) => `${entry.path} 超过 ${maximum} 字节参考预算；请核对宿主实际配置与内容加载范围`);
  const runtime = inspectRuntime(root, options);
  warnings.push(...runtime.warnings);
  const ready = hostReady(gateway, skills, entries, runtime);
  return { recordVersion: RECORD_VERSION, packageName: options.packageName, packageVersion: options.packageVersion, host: options.host || "unspecified", projectRoot: root, entries, skills, gateway, runtime, entryReadiness: ready ? "ready" : "incomplete", hostDiscovery: "unverified", mcpConnection: "unverified", contentLoaded: "unverified", warnings, instructionBudgetSource: "reference-default-not-observed-host-config" };
}

function hostReady(gateway, skills, entries, runtime) {
  return gateway?.status === "present" && skills.length > 0 && skills.every((skill) => skill.status === "present") && entries.every((entry) => entry.status === "present" && !entry.oversized) && ["aligned", "unverified"].includes(runtime.status);
}
function runtimeVersion(root, relative, diagnostics) {
  try { const value = JSON.parse(fs.readFileSync(readEvidencePath(root, relative), "utf8")).version; if (typeof value !== "string" || !value.trim()) throw new Error("version 必须是非空字符串"); return value; }
  catch (error) { if (error.code !== "ENOENT") diagnostics.push(`${relative}: ${error.message}`); return null; }
}
function declaredDependency(root, packageName) {
  try { const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")); return pkg.dependencies?.[packageName] || pkg.devDependencies?.[packageName] || null; }
  catch { return null; }
}
function runtimeMismatch(versions, declared, local) {
  return strings(versions).length > 1 || Boolean(local && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(declared || "") && declared !== local);
}
function inspectRuntime(root, options) {
  root = fs.realpathSync(path.resolve(root));
  const key = (options.packageName || "").replace("@agile-team/wl-skills-", "");
  const manifestPath = { kit: ".wl-skills-manifest.json", design: ".wl-skills-design/state.json", test: ".wl-skills-test/manifest.json" }[key] || `.wl-skills-${key}-manifest.json`;
  const diagnostics = [];
  const distributedVersion = runtimeVersion(root, manifestPath, diagnostics);
  const localVersion = runtimeVersion(root, `node_modules/${options.packageName}/package.json`, diagnostics);
  const declaredVersion = declaredDependency(root, options.packageName);
  const mismatch = runtimeMismatch([distributedVersion, localVersion, options.packageVersion], declaredVersion, localVersion);
  const state = distributedVersion ? "aligned" : "unverified";
  return { status: mismatch ? "mismatch" : diagnostics.length ? "invalid" : state, distributedVersion, localVersion, runningVersion: options.packageVersion || null, declaredVersion, diagnostics,
    warnings: mismatch ? [`${options.packageName} 规范/本地执行器/当前执行器版本不一致：${distributedVersion} / ${localVersion} / ${options.packageVersion}；声明依赖=${declaredVersion}；同步本包依赖、锁文件与受管入口后复验`] : diagnostics, hostInvocation: "unverified" };
}

/** A notice describes the receipt; it does not claim the host displayed it or read rules. */
function noticeProjectRoot(record, options) {
  return options.projectRoot ? fs.realpathSync(path.resolve(options.projectRoot)) : record.notice?.projectRoot || null;
}
function noticeRules(item) {
  const details = new Map((item.ruleDetails || []).map((rule) => [rule.id, rule]));
  const ids = strings([...strings(item.baselineRules), ...strings(item.requiredRules), ...strings(item.constraints)]);
  return ids.map((id) => ({ id, name: details.get(id)?.name || id, source: details.get(id)?.source || null }));
}
function noticeScope(record, options, item) {
  return { targets: strings(options.originalTargets || record.targets || options.targets),
    executionStatus: record.executionStatus || "not-executed", validationStatus: record.validationStatus || "unverified",
    unverified: strings(item.unverified || ["host-discovery", "model-read-canonical-files", "planned-actions-not-executed"]) };
}
function noticeReason(item) { return safeText(item.reason || strings(item.reasons).join("；")); }
function attachNotice(record, options = {}) {
  const item = record.decision || record;
  record.packageName ||= options.packageName;
  record.packageVersion ||= options.packageVersion;
  record.notice = {
    schemaVersion: 1, packageName: record.packageName || null, packageVersion: record.packageVersion || null,
    projectRoot: noticeProjectRoot(record, options), runId: record.runId || null, decision: item.status || "unverified",
    skills: strings(item.selectedSkills), requiredChecks: strings(item.requiredChecks), baselineRules: strings(item.baselineRules), rules: noticeRules(item),
    reason: noticeReason(item), missingInputs: strings(item.missingInputs),
    gaps: (item.gaps || []).map((gap) => ({ reason: safeText(gap.reason), suggestion: safeText(gap.suggestion) })),
    ...noticeScope(record, options, item), displayEvidence: "unverified",
  };
  return record;
}
function noticeRuleText(notice) {
  const rules = notice.rules.slice(0, 8).map((rule) => rule.name === rule.id ? rule.id : `${rule.id}（${rule.name}）`).join("、");
  const remaining = notice.rules.length > 8 ? `等 ${notice.rules.length} 条，完整清单见 JSON 回执` : "";
  return `${rules}${remaining || (rules ? "" : "尚无确认规则")}`;
}
function noticePlanText(notice) {
  return `${notice.requiredChecks.length ? `\n待执行检查：${notice.requiredChecks.join("、")}` : ""}` + `${notice.runId ? `\nrunId=${notice.runId}` : "\n只读判定，尚无任务记录"}；执行=${notice.executionStatus}；验证=${notice.validationStatus}`;
}
function noticeGapText(notice) {
  return `${notice.missingInputs.length ? `\n缺少：${notice.missingInputs.join("、")}` : ""}` + `${notice.gaps.length ? `\n缺口：${notice.gaps.map((gap) => `${gap.reason}；建议：${gap.suggestion}`).join("\n")}` : ""}`;
}
function formatDecision(record) {
  const notice = record.notice || attachNotice({ ...record }).notice;
  const label = { baseline: "基础约束", ambiguous: "候选需确认", gap: "规则缺口", "not-applicable": "不适用", "needs-context": "缺少上下文" }[notice.decision] || "待判定";
  const identity = notice.packageName ? `${notice.packageName.replace("@agile-team/wl-skills-", "")}@${notice.packageVersion || "未知"}；` : "";
  return `[WL ${notice.decision}] ${identity}${notice.skills.join("、") || label}；${notice.reason}` + `\n适用规则：${noticeRuleText(notice)}；范围：${notice.targets.slice(0, 3).join("、") || "未指定目标，检查范围待确认"}` + noticePlanText(notice) + noticeGapText(notice);
}

function formatStatus(status) {
  const identity = `${status.packageName?.replace("@agile-team/wl-skills-", "") || "未知包"}@${status.packageVersion || "未知"}`;
  const checked = [...new Set(status.tools.flatMap((tool) => (tool.checkedFiles || []).map((file) => file.path)))];
  return `[WL 执行=${status.executionStatus} 验证=${status.validationStatus}] ${identity}；runId=${status.runId || "尚无记录"}；工具=${status.tools.length}；实际检查文件=${checked.length}；待验证=${status.pendingChecks.length}；范围缺口=${(status.scopeGaps || []).length}；规则缺口=${(status.gaps || []).length}；证据过期=${Boolean(status.stale)}；宿主发现=${status.stages.hostDiscovered}`;
}

function aggregateStatus(statuses) {
  const valid = statuses.filter((status) => status.recordVersion === RECORD_VERSION);
  const runIds = [...new Set(valid.map((status) => status.runId).filter(Boolean))];
  return { recordVersion: RECORD_VERSION, runId: runIds.length === 1 ? runIds[0] : null, correlated: runIds.length === 1, packages: valid, mixedRuns: runIds.length > 1, hasFailure: valid.some((status) => status.validationStatus === "failed"), gaps: valid.flatMap((status) => status.gaps || []) };
}

module.exports = { RECORD_VERSION, STORAGE, evaluateTask, startTask, beginExecution, finishExecution, withExecution, captureSnapshot, readStatus, listGaps, doctorHost, inspectRuntime, attachNotice, formatDecision, formatStatus, aggregateStatus };

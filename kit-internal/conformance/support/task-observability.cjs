"use strict";

// Identical, self-contained protocol snapshot shipped by each independent WL package.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const projectScope = require("./project-scope.cjs");
const taskIntent = require("./task-intent.cjs");
const { resolveHostProfile } = require("./host-profiles.cjs");
const { readProjectConfig } = require("./project-integration.cjs");

const RECORD_VERSION = 1;
const STORAGE = {
  "@agile-team/wl-skills-kit": ".wl-skills/runs",
  "@agile-team/wl-skills-ui": ".wl-skills-ui/runs",
  "@agile-team/wl-skills-bd": ".wl-skills-bd/runs",
  "@agile-team/wl-skills-design": ".wl-skills-design/runs",
  "@agile-team/wl-skills-test": ".wl-skills-test/runs",
};
const LEGACY_STORAGE = { ...STORAGE };
for (const name of Object.keys(STORAGE)) STORAGE[name] = `.wl-skills/state/${name.replace("@agile-team/wl-skills-", "")}/runs`;
const VALIDATION_STATES = new Set(["passed", "failed", "partial", "unverified", "not-applicable"]);
const CHECK_STATES = new Set(["passed", "failed", "skipped", "not-applicable", "unverified", "not-executed"]);
const DECISION_STATES = new Set(["matched", "baseline", "ambiguous", "gap", "not-applicable", "needs-context"]);
const MCP_RECEIPT_GUIDANCE = "向用户简短转述真实调用回执：匹配技能、实际 MCP 工具名、验证结果或待验证项。只完成路由就说明尚未执行；不要用包版本代替回执，也不要把路由命中说成已加载技能。";
let previousTimestamp = 0;
const mcpInvocation = new AsyncLocalStorage();

// Set by the registered server dispatcher, never by tool input or model text.
function withMcpInvocation(tool, invoke) {
  return mcpInvocation.run({ channel: "mcp", tool: safeText(tool, 128) }, invoke);
}

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
  return taskIntent.phraseMatches(text, phrase);
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
  return { id: skill.id, name: safeText(skill.name || skill.title || skill.id, 120), description: safeText(skill.description || "", 240), path: skill.path || null, score, hits, contextHits, negative, status: skill.status || "released" };
}

function targetRelevance(targets, policy) {
  const extensions = strings(policy.domainExtensions).map(normalized);
  return strings(targets).some((target) => extensions.some((extension) => normalized(target).endsWith(extension)));
}

function taskSignals(options) {
  const policy = options.policy || {};
  const text = normalized(taskIntent.analyzeTask(options.task).activeText);
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
    selectedSkills: selected, skillDetails: skills.map(skill => ({ id: skill.id, name: safeText(skill.name || skill.title || skill.description || skill.id, 120), description: safeText(skill.description || "", 240) })), candidates, baselineRules,
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
  const result = selectDecision(candidates, signals, options) || fallbackDecision(candidates, signals, options);
  return { ...result, taskEvidence: taskIntent.analyzeTask(options.task), action: taskIntent.analyzeTask(options.task).action };
}

function assertRunId(value) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value || "")) throw new Error("Invalid WL runId");
  return value;
}

function storage(options) {
  const expected = STORAGE[options.packageName];
  if (!expected || (options.storageDir && options.storageDir !== expected && options.storageDir !== LEGACY_STORAGE[options.packageName])) throw new Error("WL package storage must remain in its own namespace");
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

function insidePath(root,target) {
  const relative = path.relative(root,target);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

function ownDependencyRoot(root,packageName) {
  if(!Object.hasOwn(STORAGE,packageName || ''))throw new Error('WL read evidence escapes project root');
  const installed = fs.realpathSync(path.join(root,'node_modules',packageName));
  const manifest = fs.realpathSync(path.join(installed,'package.json'));
  if(!insidePath(installed,manifest))throw new Error('WL dependency metadata escapes its own package');
  const metadata = JSON.parse(fs.readFileSync(manifest,'utf8'));
  if(metadata.name !== packageName || typeof metadata.version !== 'string' || !metadata.version.trim())throw new Error('WL dependency identity is invalid');
  return installed;
}

function authorizeRead(root,requested,physical,packageName) {
  if(insidePath(root,physical))return root;
  // The executing package may live in an exact-version npx cache. Only this
  // module's own verified package is authorized, never an arbitrary caller root.
  const runtime = authorizedRuntime(physical, packageName);
  if (runtime) return runtime;
  const logical = path.join(root,'node_modules',packageName || '__unowned__');
  if(!insidePath(logical,requested))throw new Error('WL read evidence escapes project root');
  const dependency = ownDependencyRoot(root,packageName);
  if(!insidePath(dependency,physical))throw new Error('WL read evidence escapes its own dependency');
  return dependency;
}

function authorizedRuntime(physical, packageName) {
  const runtime = path.resolve(__dirname, "..");
  const metadataPath = path.join(runtime, "package.json");
  if (!insidePath(runtime, physical) || !fs.existsSync(metadataPath)) return null;
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  return Object.hasOwn(STORAGE, packageName || "") && metadata.name === packageName && typeof metadata.version === "string" ? runtime : null;
}

function readEvidencePath(root, relative,packageName) {
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
  authorizeRead(root,requested,physical,packageName);
  return physical;
}

function captureReadEvidence(options, targets) {
  const root = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  const requested = strings(targets);
  const batches = [];let fileCount = 0;let bytes = 0;const seen = new Set();
  for(const target of requested){
    const physical = readEvidencePath(root,target,options.packageName);
    if(seen.has(physical))continue;
    seen.add(physical);
    const batch = readSnapshot(root,target,options.packageName,{maxFiles:1000 - fileCount,maxBytes:16 * 1024 * 1024 - bytes});
    batches.push(batch);fileCount += batch.files.length;bytes += batch.files.reduce((sum,file) => sum + file.bytes,0);
  }
  const snapshot = mergeReadSnapshots(batches);
  return { ...snapshot, targets: requested, resolution: "authorized-read-realpath" };
}

function readSnapshot(root,target,packageName,limits) {
  const physical = readEvidencePath(root,target,packageName);
  const base = authorizeRead(root,path.resolve(root,target),physical,packageName);
  const snapshot = captureSnapshot({projectRoot:base,targets:[path.relative(base,physical) || '.'],...limits});
  if(base !== root){
    const prefix = `node_modules/${packageName}/`;
    for(const item of [...snapshot.files,...snapshot.omitted])item.path = prefix + item.path;
  }
  return snapshot;
}

function mergeReadSnapshots(batches) {
  const files = [...new Map(batches.flatMap(batch => batch.files).map(file => [file.path,file])).values()].sort((left,right) => left.path.localeCompare(right.path));
  const omitted = batches.flatMap(batch => batch.omitted); let bytes = 0;
  const bounded = files.filter((file,index) => {
    if(index >= 1000 || bytes + file.bytes > 16 * 1024 * 1024){omitted.push({path:file.path,reason:'snapshot-budget'});return false;}
    bytes += file.bytes;return true;
  });
  return {files:bounded,omitted,complete:omitted.length === 0,sha256:digest(JSON.stringify({files:bounded,omitted}))};
}

function snapshotFile(root, target, state) {
  const relative = path.relative(root, target).split(path.sep).join("/");
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) { state.omitted.push({ path: relative, reason: "symlink" }); return; }
  if (stat.isDirectory()) { snapshotDirectory(root, target, state); return; }
  if (!stat.isFile()) { state.omitted.push({ path: relative, reason: "not-file" }); return; }
  if (state.files.length >= state.maxFiles || state.bytes + stat.size > state.maxBytes) { state.omitted.push({ path: relative, reason: "snapshot-budget" }); return; }
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
  const state = { files: [], omitted: [], bytes: 0, maxFiles: options.maxFiles ?? 1000, maxBytes: options.maxBytes ?? 16 * 1024 * 1024 };
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

function baseRecord(metadata, kind, invocation) {
  previousTimestamp = Math.max(Date.now(), previousTimestamp + 1);
  return { recordVersion: RECORD_VERSION, kind, packageName: metadata.packageName, packageVersion: metadata.packageVersion, runId: metadata.runId, recordedAt: new Date(previousTimestamp).toISOString(), eventId: crypto.randomUUID(), ...(invocation ? { invocation } : {}) };
}

function startTask(options) {
  const metadata = runMetadata(options);
  const selected = options.decision || evaluateTask(options);
  if (!DECISION_STATES.has(selected.status)) throw new Error("Unknown WL task decision status");
  const record = { ...baseRecord(metadata, "task-decision", mcpInvocation.getStore()), task: safeText(options.task), decision: selected, targets: strings(options.targets), inputSnapshot: captureSnapshot(options),
    ruleSnapshot: captureReadEvidence(options, [...strings(options.ruleFiles), ...strings(selected.requiredFiles)]),
    configSnapshot: contextSnapshot(options, "configFiles"), resourceOverrides: resourceOverrides(options, [...strings(options.ruleFiles), ...strings(selected.requiredFiles)]), executionStatus: "not-executed", validationStatus: "unverified" };
  attachNotice(record, options);
  record.recordPath = appendRecord(options, record);
  return record;
}

function beginExecution(options) {
  const metadata = runMetadata(options);
  const record = { ...baseRecord(metadata, "tool-started", mcpInvocation.getStore()), producer: { pid: process.pid }, tool: safeText(options.tool, 128), targets: strings(options.targets), executionStatus: "started", validationStatus: "unverified", inputSnapshot: captureSnapshot(options), ruleSnapshot: contextSnapshot(options, "ruleFiles"), configSnapshot: contextSnapshot(options, "configFiles"), resourceOverrides: resourceOverrides(options, options.ruleFiles) };
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

function verificationCoverage(input, rules, config) {
  return { ...input, complete: [input, rules, config].every(snapshot => snapshot.complete) };
}

function finishExecution(handle, result = {}) {
  const { options, metadata } = handle;
  const checks = (result.checks || []).map(normalizeCheck);
  const after = captureSnapshot(options);
  const ruleSnapshot = contextSnapshot(options, "ruleFiles");
  const configSnapshot = contextSnapshot(options, "configFiles");
  const resourceOverrideSnapshot = resourceOverrides(options, options.ruleFiles);
  const checkedSnapshot = checkedFileEvidence(options, result.checkedFiles);
  const exitCode = Number.isInteger(result.exitCode) ? result.exitCode : 0;
  const changed = options.readOnlyVerification === true && [
    [after, handle.record.inputSnapshot], [ruleSnapshot, handle.record.ruleSnapshot], [configSnapshot, handle.record.configSnapshot],
    [resourceOverrideSnapshot, handle.record.resourceOverrides || resourceOverrideSnapshot],
  ].some(([current, before]) => current.sha256 !== before.sha256);
  const record = {
    ...baseRecord(metadata, "tool-finished", handle.record.invocation), executionId: handle.record.eventId, executionStartedAt: handle.record.recordedAt, tool: handle.record.tool, targets: handle.record.targets,
    executionStatus: exitCode === 0 ? "completed" : "failed", exitCode, durationMs: Date.now() - handle.startedAt,
    validationStatus: validationState(result.validationStatus, checks, verificationCoverage(after, ruleSnapshot, configSnapshot), changed), checks,
    checkedFiles: checkedSnapshot.files, checkedSnapshot, checkedScopeSource: Array.isArray(result.checkedFiles) ? "executor" : "unreported",
    summary: safeMetadata(result.summary || {}), inputSnapshot: after, inputBefore: handle.record.inputSnapshot,
    changedDuringCheck: changed, artifacts: captureSnapshot({ projectRoot: options.projectRoot, targets: result.artifacts || [] }).files,
    ruleSnapshot, configSnapshot, resourceOverrides: resourceOverrideSnapshot,
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

// Record a transport interruption only for starts created by this invocation.
// No rule, file coverage or successful business result is inferred.
function finishInterruptedExecutions(options, previousEventIds, processId, errorCode) {
  if (!Number.isInteger(processId) || processId <= 0) return 0;
  const records = allRecords(options).filter(record => record.runId === options.runId);
  const finished = new Set(records.filter(record => record.kind === "tool-finished").map(record => record.executionId));
  const pending = records.filter(record => record.kind === "tool-started" && record.producer?.pid === processId && !previousEventIds.has(record.eventId) && !finished.has(record.eventId));
  for (const record of pending) {
    const metadata = { packageName: options.packageName, packageVersion: options.packageVersion, runId: options.runId };
    finishExecution({ options: { ...options, targets: record.targets }, metadata, record, startedAt: Date.parse(record.recordedAt) },
      { exitCode: 1, validationStatus: "unverified", checks: [], checkedFiles: [], errorCode, summary: { source: "execution-transport", interrupted: true } });
  }
  return pending.length;
}

function readRecord(file, expectedPackage) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (data.recordVersion !== RECORD_VERSION || data.packageName !== expectedPackage) throw new Error("Unknown or foreign WL execution record");
  assertRunId(data.runId);
  return data;
}

function allRecords(options) {
  const location = storage(options);
  const locations = [{ ...location, directory: path.join(location.projectRoot, LEGACY_STORAGE[options.packageName]) }, location];
  const combined = locations.flatMap(item => {
    inspectAncestors(item.projectRoot, item.directory);
    if (!fs.existsSync(item.directory)) return [];
    const runIds = options.runId ? [assertRunId(options.runId)] : fs.readdirSync(item.directory).filter((name) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name));
    return runIds.flatMap(runId => recordsForRun(item, runId, options.packageName));
  });
  const records = [...new Map(combined.map(record => [record.eventId, record])).values()];
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
  if (!overridesFresh(record.resourceOverrides, options)) return false;
  return snapshotsFresh([record.inputSnapshot, record.ruleSnapshot, record.configSnapshot, record.checkedSnapshot], options);
}

function resourceOverrides(options, targets) {
  const runtime = path.resolve(__dirname, "..");
  const files = path.join(runtime, "files");
  const paths = strings(targets).flatMap(target => {
    if (!path.isAbsolute(target) || !insidePath(runtime, target)) return [];
    const relative = path.relative(insidePath(files, target) ? files : runtime, target).split(path.sep).join("/");
    return relative.startsWith(".") || /^(?:skills|standards)\//.test(relative) ? [relative] : [];
  });
  return overrideState(options, paths);
}

function overrideState(options, targets) {
  const root = fs.realpathSync(path.resolve(options.projectRoot));
  const entries = strings(targets).map(relative => {
    const file = projectPath(root, relative);
    return [relative, fs.existsSync(file) ? fs.statSync(file).isDirectory() ? "directory" : "file" : "missing"];
  });
  return { targets: strings(targets), sha256: digest(JSON.stringify(entries)) };
}

function overridesFresh(snapshot, options) {
  return !snapshot || snapshot.sha256 === overrideState(options, snapshot.targets).sha256;
}

function snapshotsFresh(snapshots, options) {
  return snapshots.filter(Boolean).every((snapshot) => {
    try { return currentSnapshot(snapshot, options).sha256 === snapshot.sha256; }
    catch (error) {
      options.evidenceDiagnostics?.push({ code: "resource-evidence-unavailable", message: safeText(error.message) });
      return false;
    }
  });
}

function currentSnapshot(snapshot, options) {
  return ["project-internal-realpath","authorized-read-realpath"].includes(snapshot.resolution) ? captureReadEvidence(options, snapshot.targets) : captureSnapshot({ projectRoot: options.projectRoot, targets: snapshot.targets });
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
  const evidenceDiagnostics = [];
  options = { ...options, evidenceDiagnostics };
  const pending = pendingChecks(plan, tools);
  const runtime = inspectRuntime(options.projectRoot,options);
  const outdatedChecker = ['mismatch','invalid'].includes(runtime.status) || Boolean(options.packageVersion) && [...tools, ...plan ? [plan] : []].some((record) => record.packageVersion !== options.packageVersion);
  const planStale = Boolean(plan) && !planInputsFresh(plan, options);
  const stale = outdatedChecker || planStale || tools.some((record) => isFresh(record, options) === false);
  const verifiers = tools.filter((record) => record.checks.length || record.validationStatus !== "unverified");
  const scopeGaps = uncoveredScope(plan, verifiers, options);
  const unresolvedDecision = Boolean(plan) && ["gap", "ambiguous", "needs-context"].includes(plan.decision.status);
  const executionOrderUnverified = ambiguousExecutionOrder(tools);
  return { validationStatus: summarizeValidation(verifiers, pending, stale, unresolvedDecision || scopeGaps.length > 0 || executionOrderUnverified), pendingChecks: pending, stale, outdatedChecker, planStale, scopeGaps, unresolvedDecision, executionOrderUnverified,runtime, evidenceDiagnostics };
}

function planRootFresh(plan, options) {
  const recordedRoot = plan.decision.scope?.projectRoot || plan.notice?.projectRoot;
  if (recordedRoot) {
    try { if (fs.realpathSync(recordedRoot) !== fs.realpathSync(options.projectRoot || process.cwd())) return false; }
    catch { return false; }
  }
  return true;
}
function planInputsFresh(plan, options) {
  if (!planRootFresh(plan, options)) return false;
  if (!overridesFresh(plan.resourceOverrides, options)) return false;
  if(plan.decision.action?.mode === 'inspect' && !snapshotsFresh([plan.inputSnapshot],options))return false;
  if (!snapshotsFresh([plan.ruleSnapshot, plan.configSnapshot], options)) return false;
  if (!plan.decision.scope?.fingerprint) return true;
  const current = projectScope.resolveScope({ projectRoot: options.projectRoot, packageName: options.packageName, targets: plan.targets });
  return current.scope.fingerprint === plan.decision.scope.fingerprint;
}

function uncoveredScope(plan, tools, options) {
  if (!plan) return [];
  const root = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  const rulePaths = new Set([...(plan.ruleSnapshot?.targets || []), ...strings(plan.decision.requiredFiles)].map((target) => {
    try { return readEvidencePath(root, target, options.packageName); }
    catch { return null; } // Old executor caches are never authorized by history.
  }).filter(Boolean));
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
  return { ...statusForRecords(records.filter((record) => record.runId === runId), options), currentScope: projectScope.resolveScope({ projectRoot: options.projectRoot, packageName: options.packageName }).scope };
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

function inspectHostFile(root, relative, maximum,packageName) {
  const file = readEvidencePath(root, relative,packageName);
  if (!fs.existsSync(file)) return { path: relative, status: "missing" };
  const stat = fs.statSync(file);
  return { path: relative, status: stat.isFile() ? "present" : "not-file", bytes: stat.size, oversized: stat.size > maximum, sha256: stat.isFile() ? digest(fs.readFileSync(file)) : null };
}

function gatewayBlockScalar(lines) {
  const body = [];
  for (const line of lines) {
    if (line && !/^\s/.test(line)) break;
    body.push(line.trim());
  }
  return body.join(" ").trim();
}

function gatewayQuotedScalar(value) {
  if (value.startsWith("'")) {
    const quoted = value.match(/^'((?:[^']|'')*)'\s*(?:#.*)?$/);
    return quoted ? quoted[1].replace(/''/g, "'") : null;
  }
  const quoted = value.match(/^("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/);
  try { return quoted ? JSON.parse(quoted[1]) : null; } catch { return null; }
}

function gatewayScalar(value, followingLines) {
  if (/^[>|][+-]?(?:\s+#.*)?$/.test(value)) return gatewayBlockScalar(followingLines);
  if (value.startsWith('"') || value.startsWith("'")) return gatewayQuotedScalar(value);
  const parsed = value.replace(/\s+#.*$/, "").trim();
  if (/^(?:null|true|false|~|[-+]?\d+(?:\.\d+)?)$/i.test(parsed) || "[]{}&*!|>@`".includes(parsed.charAt(0)) || /:\s/.test(parsed)) return null;
  return parsed;
}

function gatewayField(lines, field) {
  const matches = lines.map((line, index) => ({ match: line.match(new RegExp(`^${field}:\\s*(.*)$`)), index })).filter(item => item.match);
  if (matches.length !== 1) return { reason: `${field}-missing-or-duplicate` };
  const { match, index } = matches[0];
  const parsed = gatewayScalar(match[1].trim(), lines.slice(index + 1));
  return typeof parsed === "string" && parsed.trim() ? { value: parsed } : { reason: `${field}-must-be-nonempty-string` };
}

function gatewayFrontmatter(text, packageName, limits = {}) {
  const header = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!header) return { valid: false, reason: "missing-frontmatter", validation: "required-string-fields" };
  const lines = header[1].split(/\r?\n/), fields = {};
  for (const field of ["name", "description"]) {
    const result = gatewayField(lines, field);
    if (result.reason) return { valid: false, reason: result.reason, validation: "required-string-fields" };
    fields[field] = result.value;
  }
  const expectedName = packageName.replace(/^@agile-team\//, "");
  if (limits.descriptionMaxChars && fields.description.length > limits.descriptionMaxChars) return { valid: false, name: fields.name, reason: "description-exceeds-host-limit", descriptionChars: fields.description.length, maximum: limits.descriptionMaxChars, validation: "required-string-fields-and-host-limits" };
  return { valid: fields.name === expectedName, name: fields.name, description: fields.description,
    descriptionChars: fields.description.length, metadataPreview: fields.description.slice(0, limits.metadataDescriptionMaxChars || fields.description.length),
    reason: fields.name === expectedName ? null : "skill-name-mismatch", validation: "required-string-fields" };
}

function installedManifestPath(root, packageName) {
  const key = (packageName || "").replace("@agile-team/wl-skills-", "");
  const compact = `.wl-skills/state/${key}/manifest.json`;
  const legacy = { kit: ".wl-skills-manifest.json", design: ".wl-skills-design/state.json", test: ".wl-skills-test/manifest.json" }[key] || `.wl-skills-${key}-manifest.json`;
  return fs.existsSync(path.join(root, compact)) ? compact : legacy;
}

function gatewayRecordIntegrity(record, content, packageName, manifestPath) {
  const expectedHash = typeof record === "string" ? record : record.installedHash || record.hash;
  if (typeof expectedHash !== "string" || !/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/i.test(expectedHash)) return { status: "invalid", manifestPath, reason: "invalid-installed-hash" };
  const algorithm = expectedHash.length === 32 ? "md5" : "sha256";
  // BD owns normalized text hashes; the other packages own exact bytes.
  const input = packageName === "@agile-team/wl-skills-bd" ? content.replace(/\r\n/g, "\n") : content;
  const actualHash = crypto.createHash(algorithm).update(input).digest("hex");
  return { status: actualHash === expectedHash.toLowerCase() ? record.kind === "reference" ? "reference" : "verified" : "modified", manifestPath, algorithm, expectedHash, actualHash };
}

function gatewayOwnership(root, relative, content, packageName) {
  const manifestPath = installedManifestPath(root, packageName);
  const file = readEvidencePath(root, manifestPath, packageName);
  if (!fs.existsSync(file)) return { status: "untracked", manifestPath };
  try {
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    if (state.package && state.package !== packageName) return { status: "invalid", manifestPath, reason: "manifest-package-mismatch" };
    const record = Array.isArray(state.files) ? state.files.find(item => item.path === relative) : state.files?.[relative];
    if (!record) return { status: "untracked", manifestPath };
    return gatewayRecordIntegrity(record, content, packageName, manifestPath);
  } catch (error) { return { status: "invalid", manifestPath, reason: `unreadable-manifest: ${safeText(error.message)}` }; }
}

function inspectHostGateway(root, relative, packageName, limits) {
  const result = inspectHostFile(root, relative, Infinity, packageName);
  if (result.status !== "present") return result;
  const content = fs.readFileSync(readEvidencePath(root, relative, packageName), "utf8");
  const frontmatter = gatewayFrontmatter(content, packageName, limits);
  const ownership = gatewayOwnership(root, relative, content, packageName);
  const status = !frontmatter.valid || ownership.status === "invalid" ? "invalid" : ["modified", "untracked"].includes(ownership.status) ? ownership.status : "present";
  return { ...result, status, frontmatter, ownership };
}

function discoveryCoverage(root, profile) {
  const packages = Object.keys(projectScope.MANIFESTS).map(key => {
    const packageName = `@agile-team/wl-skills-${key}`;
    try {
      const candidate = resolveHostProfile(profile.hostId || profile.requested, packageName);
      const entries = candidate.gatewayPaths.map(relative => inspectHostGateway(root, relative, packageName, candidate.discoveryRules || {}));
      const runtime = inspectRuntime(root, { packageName });
      const {scope} = projectScope.resolveScope({ projectRoot: root, packageName });
      const installed = Boolean(runtime.distributedVersion || runtime.localVersion || runtime.declaredVersion || scope.adopted);
      return { key, packageName, installed, adopted: scope.adopted, scopeStatus: scope.status, scopeReason: scope.reason,
        distributedVersion: runtime.distributedVersion, localVersion: runtime.localVersion, declaredVersion: runtime.declaredVersion,
        discoverableCandidate: entries.some(entry => entry.frontmatter?.valid === true),
        entryStatus: entries.some(entry => ["invalid", "modified", "untracked"].includes(entry.status)) ? "needs-review" : entries.some(entry => entry.status === "present") ? "present" : "missing", entries };
    } catch (error) { return { key, packageName, entryStatus: "unverified", reason: safeText(error.message), entries: [] }; }
  });
  return { evidenceLevel: "current-project-static-files", scope: "current-project-host-roots-only", recursive: false,
    hostDiscovery: "unverified", hostConfigurationObserved: false, packages,
    availableEntries: packages.filter(item => item.discoverableCandidate).map(item => item.key),
    readyEntries: packages.filter(item => item.entryStatus === "present").map(item => item.key),
    needsReview: packages.filter(item => item.entryStatus === "needs-review").map(item => item.key),
    installedWithoutEntry: packages.filter(item => item.installed && item.entryStatus === "missing").map(item => item.key),
    notInstalled: packages.filter(item => item.installed === false && item.entryStatus === "missing").map(item => item.key),
    note: "只列当前项目各包的安装与入口条件；未接入的包不会自动安装。父目录、用户级目录、宿主配置中的附加目录及当前会话实际列表需另行核验。" };
}

function installedMcpRecords(root, packageName) {
  try {
    const file = path.join(root, installedManifestPath(root, packageName));
    if (fs.realpathSync(file) !== file) return {};
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 1024 * 1024) return {};
    const { package: recordedPackage, managedMcp } = JSON.parse(fs.readFileSync(file, "utf8"));
    if ((recordedPackage && recordedPackage !== packageName) || managedMcp?.layoutVersion !== 1) return {};
    return managedMcp.records ?? {};
  } catch { return {}; }
}

function inspectMcpConfiguration(root, files, profile, packageName) {
  try {
    const { value, configPath } = readProjectConfig(root);
    const requested = typeof value.mcp === "boolean" ? value.mcp : null;
    const actual = require("./mcp-config.cjs").inspectMcpConfiguration({ projectRoot: root, packageName, host: profile.hostId || profile.requested,
      previous: installedMcpRecords(root, packageName) });
    const status = profile.status !== "known" ? "needs-host" : actual.status === "not-provided" ? actual.status : requested === false ? "not-requested"
      : requested === null && actual.status === "missing" ? "unspecified" : actual.status;
    return { ...actual, requested, status, configurationStatus: actual.status, configPath, candidateFiles: files.map(file => file.path) };
  } catch (error) { return { requested: null, status: "invalid-project-config", contentsInspected: false, connection: "unverified", reason: safeText(error.message) }; }
}

function inspectInstructionEntry(root, relative, limit, packageName) {
  const entry = inspectHostFile(root, relative, limit, packageName);
  if (entry.status !== "present" || entry.oversized) return { ...entry, packageGuidance: "unverified" };
  const content = fs.readFileSync(readEvidencePath(root, relative, packageName), "utf8");
  const name = packageName.replace(/^@agile-team\//, "");
  const begin = `<!-- ${name}:begin -->`;
  const end = `<!-- ${name}:end -->`;
  const offset = content.indexOf(begin);
  const closing = content.indexOf(end, offset + begin.length);
  if (offset !== -1 && closing !== -1 && content.slice(offset + begin.length, closing).trim()) return { ...entry, packageGuidance: "managed-block" };
  const linked = content.split(/\r?\n/).some(line => line.includes(`/skills/${name}/SKILL.md`) || (line.includes(packageName) && /\btask\b/.test(line)));
  return { ...entry, packageGuidance: linked ? "explicit-reference" : "unverified" };
}

function doctorHost(options) {
  const root = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  const { scope } = projectScope.resolveScope({ projectRoot: root, packageName: options.packageName });
  const profile = resolveHostProfile(options.host, options.packageName);
  const maximum = options.maxInstructionBytes || 32768;
  const inspect = (relative, limit) => inspectHostFile(root, relative, limit, options.packageName);
  const entries = profile.entryFiles.map((relative) => inspectInstructionEntry(root, relative, maximum, options.packageName));
  const gateways = profile.gatewayPaths.map((relative) => inspectHostGateway(root, relative, options.packageName, profile.discoveryRules || {}));
  const mcpConfigs = profile.mcpConfigFiles.map((relative) => inspect(relative, Infinity));
  const mcpConfiguration = inspectMcpConfiguration(root, mcpConfigs, profile, options.packageName);
  const skills = strings(options.skillPaths).map((relative) => inspectHostFile(root, relative, Infinity,options.packageName));
  const gateway = options.gatewayPath ? gateways.find(item => item.path === options.gatewayPath) || inspectHostFile(root, options.gatewayPath, Infinity,options.packageName) : null;
  const warnings = entries.filter((entry) => entry.oversized).map((entry) => `${entry.path} 超过 ${maximum} 字节参考预算；请核对宿主实际配置与内容加载范围`);
  const runtime = inspectRuntime(root, options);
  const coverage = discoveryCoverage(root, profile);
  warnings.push(...runtime.warnings);
  const instructionReadiness = profile.status !== "known" ? "unverified" : entries.some((entry) => entry.packageGuidance !== "unverified") ? "ready" : "incomplete";
  if (scope.status === "applicable" && instructionReadiness === "incomplete") warnings.push("项目规则中未核实本包任务引导；仍可检查原生技能列表并显式选择。");
  const report = { recordVersion: RECORD_VERSION, packageName: options.packageName, packageVersion: options.packageVersion, host: options.host || "unspecified", hostId: profile.hostId, hostProfile: profile, projectRoot: root, scope, entries, skills, gateway, gateways, discoveryCoverage: coverage, mcpConfigs, mcpConfiguration, runtime, entryReadiness: hostEntryReadiness(scope, profile, gateways, skills, runtime), instructionReadiness, hostDiscovery: "unverified", mcpConnection: "unverified", contentLoaded: "unverified", launchCwd: "unverified", warnings, instructionBudgetSource: "reference-default-not-observed-host-config" };
  report.nextActions = hostNextActions(report);
  warnings.push(...report.nextActions.filter((action) => action.code === "duplicate-host-gateway").map((action) => `${action.code}：${action.message}`));
  report.summary = hostSummary(report);
  return report;
}

function hostEntryReadiness(scope, profile, gateways, skills, runtime) {
  if (scope.status !== "applicable") return scope.status;
  if (profile.status !== "known") return profile.status;
  return hostReady(gateways, skills, runtime) ? "ready" : "incomplete";
}

function hostReady(gateways, skills, runtime) {
  return gateways.some((gateway) => gateway.status === "present") && gateways.every((gateway) => !["invalid", "modified", "untracked"].includes(gateway.status)) && skills.length > 0 && skills.every((skill) => skill.status === "present") && ["aligned", "unverified"].includes(runtime.status);
}

function duplicateHostGatewayActions(report) {
  if (report.hostId !== "zcode") return [];
  const files = report.gateways.filter((file) => file.frontmatter?.valid).map((file) => file.path);
  if (files.length < 2) return [];
  return [{ code: "duplicate-host-gateway", message: "ZCode 的多个候选入口声明同名技能；当前会话是否重复加载仍未验证。请核对实际来源并保留一个入口，诊断不会自动删除用户内容。", files }];
}

function mcpConfigurationActions(report) {
  if (report.mcpConfiguration.status === "managed-project-relocated") return [managedMcpRepairAction(report)];
  if (["unspecified", "not-requested"].includes(report.mcpConfiguration.status) && report.hostProfile.mcpLayout && report.mcpConfiguration.configurationStatus !== "not-provided") {
    return [{ code: "optional-mcp", message: "可先通过项目本地 CLI 使用本包。需要在宿主调用 MCP 时，用本包 update 显式启用 --mcp，并保留项目已选择的其他宿主。" }];
  }
  if (["missing", "missing-server"].includes(report.mcpConfiguration.status)) return [{ code: "configure-selected-host-mcp", message: "尚未配置本宿主对应的本包服务；使用本包 update 与所选 hosts 生成项目配置，再在实际宿主验证连接和工具列表。", files: report.mcpConfiguration.files }];
  if (report.mcpConfiguration.status === "unsupported-manual") return [{ code: "configure-host-mcp-manually", message: "该宿主尚无已核实的项目级自动配置协议；请在宿主 MCP 设置中添加本包服务，随后实际验证连接。不会猜测路径或改写全局设置。" }];
  if (report.mcpConfiguration.status === "runtime-missing") return [{ code: "install-local-mcp-runtime", message: "本包 MCP 配置已检查，但本地执行器缺失或身份不符；先在本项目安装对应 npm 包，再验证连接。", files: report.mcpConfiguration.files }];
  if (["invalid", "different-launch", "ambiguous", "disabled"].includes(report.mcpConfiguration.status)) return [{ code: "review-host-mcp-configuration", message: "本包服务配置存在语法、启动目标、启用状态或多配置冲突；请核对诊断并保留需要的自定义设置，再验证连接。", files: report.mcpConfiguration.files }];
  if (report.mcpConfiguration.status === "invalid-project-config") return [{ code: "review-mcp-project-config", message: "项目接入配置不可读，MCP 请求状态未确认；先修复配置再诊断。" }];
  return [];
}

function managedMcpRepairAction(report) {
  const { files, relocation } = report.mcpConfiguration;
  const command = ["mismatch", "invalid"].includes(report.runtime.status)
    ? { commandHint: "先对齐项目的本包版本，再用本地 CLI 预览修复。" }
    : localCommand(report, "update", ["--dry-run"]);
  const approval = report.packageName === "@agile-team/wl-skills-bd"
    ? "审阅后使用同一预览的 planHash，携带 --confirm --plan-hash <planHash> 更新。"
    : "审阅后去掉 --dry-run 更新。";
  return { code: "repair-relocated-project-mcp", files,
    message: `受管 MCP 服务仍指向旧项目位置 ${safeText(relocation.previousProjectRoot)}。请在当前项目预览本包更新。${approval}随后重载宿主，核对连接和工具列表。`,
    ...command };
}

function standaloneRouteActions(report) {
  if (["mismatch", "invalid"].includes(report.runtime.status)) return [];
  const route = localTaskCommand(report, "route", "<任务描述>");
  return [{ code: "try-standalone-route", message: route.argv
    ? "用项目本地执行器试一次只读判定，直接查看匹配技能与下一步。"
    : "项目内未核实同版本 CLI。按本包原生入口核对是否有同版本离线执行器或已连接的同版本 MCP。", ...route }];
}

function hostNextActions(report) {
  if (report.scope.status !== "applicable") return [{ code: "select-applicable-project", message: `${projectScope.excludedDecision(report.scope).reason}；请在实际已接入且适用的项目根重新诊断。` }];
  const profile = report.hostProfile;
  if (profile.status !== "known") return [{ code: "select-host", message: profile.message }];
  const actions = [];
  actions.push(...duplicateHostGatewayActions(report));
  const missing = report.skills.filter((file) => file.status !== "present").map((file) => file.path);
  if (report.gateways.every((file) => file.status === "missing")) missing.push(...profile.gatewayPaths);
  const invalid = report.gateways.filter(file => ["invalid", "modified", "untracked"].includes(file.status));
  if (invalid.length) actions.push({ code: "review-host-gateway", message: "技能入口声明无效、与安装基线不同或尚无受管来源记录；核对 name、description、正文及来源后再同步，保留用户内容，不将同名文件存在视为本包能力就绪。", files: invalid.map(file => file.path) });
  if (missing.length) actions.push({ code: "repair-host-assets", message: "使用本包正常 update 同步目标宿主入口，保留用户自有规则，然后重新诊断。", files: strings(missing) });
  if (report.instructionReadiness !== "ready") actions.push({ code: "sync-instruction-entries", message: "未核实本包规则引导。使用本包 update 补齐目标宿主的入口后，在项目根重新开启会话。", files: report.entries.filter((entry) => entry.packageGuidance === "unverified").map((entry) => entry.path) });
  if (["mismatch", "invalid"].includes(report.runtime.status)) actions.push({ code: "align-runtime", message: "先对齐本包分发规范、本地依赖与当前执行器版本，再刷新宿主。" });
  actions.push(...mcpConfigurationActions(report));
  actions.push({ code: "open-project-session", message: `在实际项目 ${report.projectRoot} 打开或重新加载宿主会话，核对当前工作目录、项目受信任及技能启用状态；本工具没有观察到宿主启动目录。` });
  actions.push(...profile.activation.map((message) => ({ code: "activate-skill", message })));
  actions.push(...profile.help.map((message) => ({ code: "verify-host-session", message })));
  if (report.mcpConfigs.some((file) => file.status === "present")) actions.push({ code: "verify-mcp-connection", message: "发现 MCP 配置文件；请在宿主中单独核对连接和工具列表，配置存在不代表连接成功。" });
  actions.push(...standaloneRouteActions(report));
  return actions;
}

function hostSummary(report) {
  const identity = `${report.packageName.replace("@agile-team/wl-skills-", "")}@${report.packageVersion || "未知"}`;
  const entry = { ready: "静态入口就绪，当前会话是否加载仍待验证", incomplete: "静态入口不完整或版本未对齐", "needs-host": "需要指定实际宿主或 VS Code 插件", unsupported: "宿主未支持或名称无法识别", "not-applicable": "目标项目不适用本包", "needs-context": "目标项目范围需要确认" }[report.entryReadiness];
  return `[WL 宿主诊断] ${identity}；${report.hostProfile.name}；${entry}${report.hostProfile.discoveryMode === "rule-guidance" ? "；仅核实规则引导，原生技能须在宿主中另行导入与验证" : ""}`;
}

function formatHostDiagnostic(report) {
  const paths = (files) => files.map((file) => `${file.path}=${file.status}`).join("、") || "未适用";
  return `${report.summary || hostSummary(report)}\n项目=${report.projectRoot}；host=${report.hostId || report.host}；entryReadiness=${report.entryReadiness}；scope=${report.scope?.status || "unverified"}`
    + `\n宿主入口：${paths(report.gateways || [])}\n规则入口：${formatInstructionEntries(report.entries)}`
    + discoveryCoverageText(report)
    + `\nMCP配置：${report.mcpConfiguration?.status || "unverified"}（服务项与启动目标按格式检查；连接仍需实际握手）`
    + runtimeText(report.runtime)
    + `\n证据边界：宿主发现=${report.hostDiscovery}；模型读取=${report.contentLoaded}；MCP连接=${report.mcpConnection}；宿主启动目录=${report.launchCwd || "unverified"}`
    + nextActionText(report);
}
function formatInstructionEntries(entries = []) {
  return entries.map(file => `${file.path}=${file.status}（本包引导 ${file.packageGuidance && file.packageGuidance !== "unverified" ? "已找到" : "未核实"}）`).join("、") || "未适用";
}
function discoveryCoverageText(report) {
  const coverage = report.discoveryCoverage;
  if (!coverage) return "";
  const readable = values => values.length ? values.join("、") : "无";
  return `\n当前项目五包入口候选：${readable(coverage.availableEntries)}；需复核：${readable(coverage.needsReview)}；已安装但缺入口：${readable(coverage.installedWithoutEntry)}；未接入：${readable(coverage.notInstalled)}`
    + (report.hostId === "zcode" ? "\nZCode发现范围：不会递归扫描所有子项目；请打开实际项目并在 Settings → Skills 刷新、核对启用。描述超1024字符会被丢弃；自动匹配只使用前250字符，预算超限可退化为仅名称。" : "")
    + "\n此清单只核对当前项目文件，父目录/全局/附加目录及宿主实际加载仍待核验。";
}
function runtimeVersion(root, relative, diagnostics,packageName) {
  try { const value = JSON.parse(fs.readFileSync(readEvidencePath(root, relative,packageName), "utf8")).version; if (typeof value !== "string" || !value.trim()) throw new Error("version 必须是非空字符串"); return value; }
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
  const manifestPath = installedManifestPath(root, options.packageName);
  const diagnostics = [];
  const distributedVersion = runtimeVersion(root, manifestPath, diagnostics);
  const localVersion = runtimeVersion(root, `node_modules/${options.packageName}/package.json`, diagnostics,options.packageName);
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
  const unverified = strings(item.unverified || ["host-discovery", "model-read-canonical-files", "planned-actions-not-executed"])
    .filter((stage) => stage !== "planned-actions-not-executed" || !record.executionStatus || record.executionStatus === "not-executed");
  return { targets: strings(options.originalTargets || record.targets || options.targets),
    ...(item.scope ? { scope: item.scope } : {}),
    executionStatus: record.executionStatus || "not-executed", validationStatus: record.validationStatus || "unverified",
    unverified };
}
function noticeReason(item) { return safeText(item.reason || strings(item.reasons).join("；")); }
function prepareNoticeDecision(record,options) {
  const item = record.decision || record;
  record.packageName ||= options.packageName;
  record.packageVersion ||= options.packageVersion;
  prepareRuntimeNotice(record, item, options);
  item.action ||= taskIntent.analyzeTask(record.task || item.task || "").action;
  const details = new Map((item.ruleDetails || []).map((entry) => [entry.id, entry]));
  item.ruleRefs ||= strings([...strings(item.requiredRules), ...details.keys()]).map((id) => {
    const detail = details.get(id) || {};
    return { packageName: record.packageName || null, ruleId: /^[a-zA-Z0-9_.:-]+$/.test(id) ? id : `constraint:${digest(id).slice(0, 16)}`,
      legacyId: id, name: detail.name || id, ruleVersion: record.packageVersion || null,
      source: detail.source || null, kind: detail.kind || "guidance", verification: "unverified" };
  });
  return item;
}

function prepareRuntimeNotice(record, item, options) {
  if (!options.projectRoot || !options.packageName) return;
  record.runtime = inspectRuntime(options.projectRoot, options);
  runtimeReadiness(item, record.runtime);
}
function runtimeReadiness(item,runtime) {
  if(item.scope?.status !== 'applicable' || !['mismatch','invalid'].includes(runtime.status))return;
  const code = `runtime-${runtime.status}`;
  item.routingStatus ||= item.status;
  item.status = 'gap';item.ready = false;
  const reason = '本包安装资产、本地依赖与当前执行器版本未对齐，暂不执行';
  item.reason = reason;item.reasons = strings([...(item.reasons || []),reason]);
  item.missingInputs = strings([...(item.missingInputs || []),'本包一致的安装资产与执行器版本']);
  item.gaps ||= [];
  if(!item.gaps.some(gap => gap.code === code))item.gaps.push({code,reason,suggestion:'在目标项目核对本包依赖和安装清单，正常 update 后重新判定；不需安装兄弟包'});
}
function attachNotice(record, options = {}) {
  const item = prepareNoticeDecision(record,options);
  record.notice = {
    schemaVersion: 1, packageName: record.packageName || null, packageVersion: record.packageVersion || null,
    projectRoot: noticeProjectRoot(record, options), runId: record.runId || null, decision: item.status || "unverified",
    skills: strings(item.selectedSkills), skillDetails: noticeSkillDetails(item), candidates: noticeCandidates(item), requiredChecks: strings(item.requiredChecks), baselineRules: strings(item.baselineRules), rules: noticeRules(item),
    reason: noticeReason(item), missingInputs: strings(item.missingInputs),
    gaps: (item.gaps || []).map((gap) => ({ reason: safeText(gap.reason), suggestion: safeText(gap.suggestion) })),
    ...noticeScope(record, options, item), displayEvidence: "unverified",
    action: item.action, ruleRefs: item.ruleRefs,
    runtime:record.runtime || null,warnings:record.runtime?.warnings || [],
  };
  record.notice.validationIssues = receiptValidationIssues(record, record.notice);
  record.notice.usageChain = usageChain(record, item, record.notice);
  record.notice.nextActions = noticeNextActions(record, item, record.notice);
  record.notice.summary = noticeSummary(record, record.notice);
  return record;
}

function noticeSkillDetails(item) {
  const details = new Map((item.skillDetails || []).filter(detail => detail && typeof detail.id === "string").map(detail => [detail.id, detail]));
  return strings(item.selectedSkills).map(id => ({ id, name: safeText(details.get(id)?.name || id, 120), description: safeText(details.get(id)?.description || "", 240) }));
}

function noticeCandidates(item) {
  return (item.candidates || []).filter(candidate => typeof candidate.id === "string").slice(0, 10)
    .map(candidate => ({ id: candidate.id, name: safeText(candidate.name || candidate.id, 120), description: safeText(candidate.description || "", 240) }));
}

function receiptValidationIssues(record, notice) {
  const tools = finishedReceiptTools(record);
  const issues = tools.flatMap(tool => (tool.checks || []).filter(check => ["failed", "skipped", "unverified", "not-executed"].includes(check.status))
    .map(check => ({ code: check.status, tool: safeText(tool.tool, 128), check: safeText(check.id, 160), message: safeText(check.reason || check.message || "检查尚未完成", 240) })));
  issues.push(...(record.scopeGaps || []).map(gap => ({ code: "scope-gap", message: safeText(`${gap.path || "目标"}：${gap.reason || "检查范围未覆盖"}`, 240) })));
  issues.push(...strings(record.pendingChecks).map(id => ({ code: "pending-check", check: id, message: `尚未执行 ${safeText(id, 160)}` })));
  if (record.stale) issues.push({ code: "stale", message: "输入、规则或执行器已变化，旧检查结果需要复验" });
  if (notice.validationStatus === "partial" && !issues.length) issues.push({ code: "partial-evidence", message: "工具仅完成部分验证，完整覆盖与语义审查仍待确认" });
  return issues.slice(0, 50);
}

// Planning, host discovery and model reading are separate from actual tool receipts.
// A canonical file snapshot is a checker read; it cannot prove that a model read it.
function finishedReceiptTools(record) {
  return Array.isArray(record.tools) ? record.tools : record.kind === "tool-finished" ? [record] : [];
}

function receiptTools(record) { return strings(finishedReceiptTools(record).map(tool => tool.tool)); }

function receiptToolLabels(record) {
  const mcp = [], other = [];
  for (const tool of finishedReceiptTools(record)) {
    const { invocation } = tool;
    if (invocation?.channel === "mcp" && invocation.tool) {
      mcp.push(invocation.tool === tool.tool ? `MCP ${tool.tool}` : `MCP ${invocation.tool} → ${tool.tool}`);
    } else other.push(tool.tool);
  }
  return strings([...mcp, ...other]);
}

function usageChain(record, item, notice) {
  return [
    { stage: "routing", status: notice.decision, evidence: item.selectionEvidence || "unverified", skills: notice.skills, files: strings(item.requiredFiles) },
    { stage: "host-discovery", status: "unverified", evidence: "no-observed-host-event" },
    { stage: "content-loading", status: "unverified", evidence: "no-observed-model-read-event" },
    { stage: "tool-execution", status: notice.executionStatus, evidence: receiptTools(record).length ? "tool-receipts" : "no-finished-tool-receipts", tools: receiptTools(record),
      mcpTools: strings(finishedReceiptTools(record).map(tool => tool.invocation?.channel === "mcp" ? tool.invocation.tool : null)) },
    { stage: "validation", status: notice.validationStatus, pendingChecks: strings(record.pendingChecks || notice.requiredChecks) },
  ];
}

function localCommand(notice, action, args = []) {
  const key = (notice.packageName || "").replace("@agile-team/wl-skills-", "");
  const bin = { kit: "wl-skills.js", ui: "wl-ui.js", bd: "wl-skills-bd.js", design: "wl-skills-design.js", test: "wl-skills-test.js" }[key];
  if (!bin || !notice.projectRoot) return {};
  if (!verifiedLocalBin(notice, bin)) return { commandHint: "本地执行器缺失或身份/版本未验证；请沿用本次实际 CLI 入口执行此操作。" };
  const rootFlag = { kit: "--project", ui: "--project", test: "--root" }[key] || "--target";
  return { cwd: notice.projectRoot, argv: ["node", `./node_modules/${notice.packageName}/bin/${bin}`, action, ...args, rootFlag, notice.projectRoot] };
}

function localTaskCommand(notice, action, task, runId) {
  const named = ["@agile-team/wl-skills-bd", "@agile-team/wl-skills-design"].includes(notice.packageName);
  return localCommand(notice, action, [...(named ? ["--input", task] : [task]), ...(runId ? ["--run-id", runId] : [])]);
}

function verifiedLocalBin(notice, bin) {
  try {
    const relative = `node_modules/${notice.packageName}`;
    const metadata = JSON.parse(fs.readFileSync(readEvidencePath(notice.projectRoot, `${relative}/package.json`, notice.packageName), "utf8"));
    if (metadata.name !== notice.packageName || metadata.version !== notice.packageVersion) return false;
    const file = readEvidencePath(notice.projectRoot, `${relative}/bin/${bin}`, notice.packageName);
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, fs.constants.R_OK);
    return true;
  } catch { return false; }
}

function noticeNextActions(record, item, notice) {
  const actions = [];
  if (["mismatch", "invalid"].includes(notice.runtime?.status)) actions.push({ code: "align-runtime", message: "先在目标项目对齐本包依赖、锁文件和受管入口，再重新判定。" });
  actions.push(...routingNextActions(record, item, notice));
  if (notice.executionStatus === "running") actions.push({ code: "await-execution", message: "已有工具开始记录，尚未收到完成回执；等待执行结束后查询同一 runId。", ...localCommand(notice, "status", notice.runId ? ["--run-id", notice.runId] : []) });
  if (notice.action?.checksAllowed !== false || !record.decision) actions.push(...validationNextActions(record, notice));
  return actions;
}

function routingNextActions(record, item, notice) {
  const actions = [];
  const empty = Array.isArray(record.records) && !record.records.length;
  if (empty) actions.push({ code: "start-task", message: "当前项目没有本次任务的工具记录。需要建立任务时，先运行 task 获取匹配结果和 runId。", ...localTaskCommand(notice, "task", "<任务描述>", notice.runId) });
  else if (["needs-context", "ambiguous", "not-applicable", "gap"].includes(notice.decision)) actions.push({ code: "resolve-routing", message: notice.reason || "先确认本包适用范围、目标文件和能力缺口。" });
  else if (!receiptTools(record).length && notice.executionStatus !== "running") {
    if (strings(item.requiredFiles).length) actions.push({ code: "read-selected-files", message: "按 requiredFiles 读取选中 Skill 和规范；路由命中不表示模型已经读取。", files: strings(item.requiredFiles) });
    actions.push(plannedToolAction(notice));
  }
  return actions;
}
function plannedToolAction(notice) {
  if (!notice.action.checksAllowed) return { code: "stay-in-scope", message: "本次意图不允许自动执行检查，按当前范围继续说明或规划。" };
  if (!notice.runId) return { code: "start-task", message: "需要按授权执行时，先用 task 建立 runId。", ...localTaskCommand(notice, "task", "<任务描述>") };
  const checks = notice.requiredChecks.join("、") || "本包适用的实际工具";
  return { code: "execute-required-checks", message: `使用同一 runId 执行${checks}。task 本身只记录计划。` };
}

function validationNextActions(record, notice) {
  const actions = [];
  if (record.stale) actions.push({ code: "rerun-stale-checks", message: "输入、规则或执行器已变化；重新执行相关检查，旧回执不能证明当前结果。" });
  else if (notice.validationStatus === "failed") actions.push({ code: "resolve-failed-checks", message: "查看 tools 中的失败检查，修复后使用同一 runId 复验。" });
  else if (receiptTools(record).length && strings(record.pendingChecks).length) actions.push({ code: "complete-pending-checks", message: `尚未执行：${record.pendingChecks.join("、")}。` });
  else if (notice.validationStatus === "partial") actions.push({ code: "complete-partial-validation", message: "核对 validationIssues 中未完成或跳过的检查，补齐适用验证后使用同一 runId 复验。" });
  return actions;
}

function noticeSkillNames(notice) {
  return (notice.skillDetails || notice.skills.map(id => ({ id, name: id }))).map(detail => detail.name === detail.id ? detail.id : `${detail.name}（${detail.id}）`);
}

function noticeRouteSummary(notice) {
  if (notice.skills.length) return `匹配技能：${summaryList(noticeSkillNames(notice), 3)}`;
  if (notice.decision === "ambiguous" && notice.candidates?.length) return `候选需确认：${summaryList(notice.candidates.map(candidate => `${candidate.name}（${candidate.id}）`), 3)}`;
  return { baseline: "仅适用基础约束", "not-applicable": "本包不适用", "needs-context": "目标上下文不足", ambiguous: "候选需要确认", gap: "存在能力或安装缺口" }[notice.decision] || "尚无技能路由记录";
}

function noticeSummary(record, notice) {
  const identity = `${notice.packageName?.replace("@agile-team/wl-skills-", "") || "未知包"}@${notice.packageVersion || "未知"}`;
  const route = noticeRouteSummary(notice);
  const decision = { matched: "已匹配", baseline: "基础约束", "not-applicable": "不适用", "needs-context": "缺少上下文", ambiguous: "需确认", gap: "有缺口" }[notice.decision] || "未判定";
  const tools = receiptToolLabels(record);
  const execution = tools.length ? `实际工具：${summaryList(tools, 3)}` : notice.executionStatus === "running" ? "工具执行中，尚无完成回执" : Array.isArray(record.records) && !record.records.length ? "没有任务记录" : "执行工具尚未运行";
  return `[WL ${decision}] ${route}；${execution}；执行=${notice.executionStatus}；验证=${notice.validationStatus}（${validationSummary(notice.validationStatus)}）\n${summaryScope(record, notice)}；包=${identity}`;
}

function summaryValue(value, maximum = 160) {
  const text = safeText(value, maximum + 1).replace(/[\r\n]/g, " ");
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}

function summaryList(values, maximum, empty = "无") {
  const items = strings(values);
  const visible = items.slice(0, maximum).map((item) => summaryValue(item)).join("、");
  return `${visible || empty}${items.length > maximum ? `（另 ${items.length - maximum} 项）` : ""}`;
}

function validationSummary(status) {
  return { unverified: "尚未验证", passed: "检查通过", failed: "检查失败", partial: "部分完成", stale: "证据已过期", "not-applicable": "无需验证" }[status] || "状态待确认";
}

function summaryScope(record, notice) {
  const hasStatusChecks = Array.isArray(record.pendingChecks);
  const pending = hasStatusChecks ? record.pendingChecks : notice.requiredChecks;
  const checkLabel = hasStatusChecks || notice.action.checksAllowed ? "待检查" : "参考检查";
  return `项目=${summaryValue(notice.projectRoot || "未确认", 400)}；目标=${summaryList(notice.targets, 3, "未指定")}；runId=${notice.runId || "未建立"}`
    + routeInvocationText(record)
    + (notice.skills.length ? "；宿主加载技能=未验证" : "")
    + `；规则=${summaryList(notice.rules.map((rule) => rule.id), 6, "未确认")}；${checkLabel}=${summaryList(pending, 3)}`
    + passedChecksText(record)
    + (notice.validationIssues?.length ? `；未完成原因=${summaryList(notice.validationIssues.map(issue => `${issue.check ? `${issue.check}：` : ""}${issue.message}`), 2)}` : "");
}

function routeInvocationText(record) {
  const plan = record.kind === "task-decision" ? record : Array.isArray(record.records) ? record.records.findLast(event => event.kind === "task-decision") : null;
  const invocation = plan?.invocation;
  return invocation?.channel === "mcp" ? `；路由调用=MCP ${summaryValue(invocation.tool, 128)}` : "";
}

function passedChecksText(record) {
  const passed = finishedReceiptTools(record).flatMap(tool => (tool.checks || []).filter(check => check.status === "passed").map(check => check.id));
  return passed.length ? `；已通过的检查${record.stale ? "（历史）" : ""}=${summaryList(passed, 3)}` : "";
}

/** An MCP response can prove a call returned without proving a task or validation ran. */
function formatExecutionReceipt(source, context = {}) {
  const header = mcpReceiptHeader(context);
  if (header && !hasExecutionEvidence(source)) return `${header}；无关联任务或校验证据`;
  const notice = source?.notice || buildReceiptNotice(source, context);
  return header ? `${header}\n${notice.summary}` : notice.summary;
}

function hasExecutionEvidence(record = {}) {
  return record.notice || record.decision || record.kind || Array.isArray(record.records);
}

function mcpReceiptHeader(context) {
  const label = { returned: "已返回", failed: "失败", blocked: "已阻止，工具未执行", continuation: "结果续页：只读取原快照，未重新执行或新增检查", preview: "预览已返回，尚未应用" }[context.mcpOutcome];
  return label ? `[WL MCP] 本次工具=${summaryValue(context.tool || "未知", 128)}；调用=${label}` : "";
}

function buildReceiptNotice(source, context) {
  const record = { ...source, ...(source?.decision ? { decision: { ...source.decision } } : {}) };
  const options = { packageName: context.packageName || record.packageName, packageVersion: context.packageVersion || record.packageVersion };
  return attachNotice(record, options).notice;
}
function noticeRuleText(notice) {
  const rules = notice.rules.slice(0, 8).map((rule) => rule.name === rule.id ? rule.id : `${rule.id}（${rule.name}）`).join("、");
  const remaining = notice.rules.length > 8 ? `等 ${notice.rules.length} 条，完整清单见 JSON 回执` : "";
  return `${rules}${remaining || (rules ? "" : "尚无确认规则")}`;
}
function noticePlanText(notice) {
  return `${notice.requiredChecks.length ? `\n${notice.action.checksAllowed ? "待执行检查" : "参考检查"}：${notice.requiredChecks.join("、")}` : ""}` + `${notice.runId ? `\nrunId=${notice.runId}` : "\n只读判定，尚无任务记录"}；执行=${notice.executionStatus}；验证=${notice.validationStatus}`;
}
function noticeGapText(notice) {
  return `${notice.missingInputs.length ? `\n缺少：${notice.missingInputs.join("、")}` : ""}` + `${notice.gaps.length ? `\n缺口：${notice.gaps.map((gap) => `${gap.reason}；建议：${gap.suggestion}`).join("\n")}` : ""}`;
}
function formatDecision(record) {
  const notice = record.notice || attachNotice({ ...record }).notice;
  const label = { baseline: "基础约束", ambiguous: "候选需确认", gap: "规则缺口", "not-applicable": "不适用", "needs-context": "缺少上下文" }[notice.decision] || "待判定";
  const identity = notice.packageName ? `${notice.packageName.replace("@agile-team/wl-skills-", "")}@${notice.packageVersion || "未知"}；` : "";
  return `${notice.summary || `[WL ${notice.decision}] ${identity}${notice.skills.join("、") || label}`}；${notice.reason}` + `\n动作=${notice.action.mode}；允许自动检查=${notice.action.checksAllowed}；业务写入遵循原授权契约` + `\n适用规则：${noticeRuleText(notice)}；范围：${notice.targets.slice(0, 3).join("、") || "未指定目标，检查范围待确认"}` + noticePlanText(notice) + noticeGapText(notice) + runtimeText(notice.runtime) + `\n使用链：任务路由 → 规则读取（宿主读取未验证）→ 实际工具 → 检查结果` + nextActionText(notice);
}

function nextActionText(notice) {
  return (notice.nextActions || []).map((action) => `\n下一步：${action.message}${action.commandHint ? `\n执行入口：${action.commandHint}` : ""}${action.argv ? `\n  ${action.argv.map((value) => /^[a-zA-Z0-9_./:@=-]+$/.test(value) ? value : `'${String(value).replace(/'/g, "'\\''")}'`).join(" ")}` : ""}`).join("");
}

function runtimeText(runtime) {
  if(!runtime)return '';
  return `\n版本对齐=${runtime.status}；安装资产=${runtime.distributedVersion || '未分发'}；本地依赖=${runtime.localVersion || '未安装'}；当前执行器=${runtime.runningVersion || '未知'}${runtime.warnings.length ? '；' + runtime.warnings.join('；') : ''}`;
}

function formatStatus(status) {
  const identity = `${status.packageName?.replace("@agile-team/wl-skills-", "") || "未知包"}@${status.packageVersion || "未知"}`;
  const checked = [...new Set(status.tools.flatMap((tool) => (tool.checkedFiles || []).map((file) => file.path)))];
  const notice = status.notice || attachNotice({ ...status }).notice;
  return `${notice.summary || noticeSummary(status, notice)}\n[WL 执行=${status.executionStatus} 验证=${status.validationStatus}] ${identity}；runId=${status.runId || "尚无记录"}；工具=${status.tools.length}；实际检查文件=${checked.length}；待验证=${status.pendingChecks.length}；范围缺口=${(status.scopeGaps || []).length}；规则缺口=${(status.gaps || []).length}；证据过期=${Boolean(status.stale)}；宿主发现=${status.stages.hostDiscovered}` + `\n证据边界：路由命中、入口文件存在和工具检查，均不能证明宿主已加载或模型已读取 Skill。` + nextActionText(notice);
}

function aggregateStatus(statuses) {
  const valid = statuses.filter((status) => status.recordVersion === RECORD_VERSION);
  const runIds = [...new Set(valid.map((status) => status.runId).filter(Boolean))];
  return { recordVersion: RECORD_VERSION, runId: runIds.length === 1 ? runIds[0] : null, correlated: runIds.length === 1, packages: valid, mixedRuns: runIds.length > 1, hasFailure: valid.some((status) => status.validationStatus === "failed"), gaps: valid.flatMap((status) => status.gaps || []) };
}

module.exports = { RECORD_VERSION, STORAGE, MCP_RECEIPT_GUIDANCE, evaluateTask, startTask, beginExecution, finishExecution, finishInterruptedExecutions, withExecution, withMcpInvocation, captureSnapshot, captureReadEvidence, readStatus, listGaps, doctorHost, inspectRuntime, attachNotice, formatDecision, formatStatus, formatExecutionReceipt, formatHostDiagnostic, aggregateStatus };

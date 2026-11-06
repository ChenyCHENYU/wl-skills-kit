#!/usr/bin/env node
"use strict";

/** Standalone, opt-in host session evaluation. The default conformance suite never invokes a model. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const readline = require("node:readline");
const { createFixtureGuard } = require("../support/fixture-guard.cjs");
const { parse: parseTOML } = require("../support/vendor/smol-toml/index.cjs");
const { PACKAGES, VARIANTS, catalogCases, grade, hash, mcpErrorKind, mcpResult, parseCodex, parsePortable, readJSON, readJournal, safePath, snapshotAssertions, wantedPackages } = require("../support/host-skill-eval.cjs");

const BIN = { kit: "bin/wl-skills.js", ui: "bin/wl-ui.js", bd: "bin/wl-skills-bd.js", design: "bin/wl-skills-design.js", test: "bin/wl-skills-test.js" };
const MCP_SERVER = { "wl-skills": "kit", "wl-skills-ui": "ui", "wl-skills-bd": "bd", "wl-skills-test": "test" };
const MCP_BIN = { kit: "mcp/server.js", ui: "mcp/server.js", bd: "mcp/server.js", test: "mcp/index.js" };
const MAX_OUTPUT = 8 * 1024 * 1024;
const MAX_ARTIFACT = 20 * 1024 * 1024;
const PKG = key => "@agile-team/wl-skills-" + key;
const optionKeys = {
  run: ["catalog", "case", "variant", "artifacts", "npm-cache", "out", "profile", "model", "effort", "repeat", "timeout-ms", "codex", "strict"],
  probe: ["catalog", "case", "variant", "artifacts", "npm-cache", "out", "codex", "argument-form", "probe-tool"],
  ingest: ["catalog", "case", "evidence", "out", "strict"],
};

class StageError extends Error {
  constructor(stage, details) { super(stage); this.stage = stage; this.details = details; }
}

function options(argv) {
  const [action, ...rest] = argv;
  if (!Object.hasOwn(optionKeys, action)) throw new Error("usage: host-skill-eval.cjs run|probe|ingest --catalog FILE --case ID --out FILE");
  const flags = parseFlags(rest, optionKeys[action]);
  for (const key of ["catalog", "case", "out", ...(action === "ingest" ? ["evidence"] : ["variant"])]) {
    if (!flags[key]) throw new Error("missing --" + key);
  }
  if (action !== "ingest") validateRunOptions(flags);
  if (action === "probe") validateProbeOptions(flags);
  if (flags.strict && !["true", "false"].includes(flags.strict)) throw new Error("--strict expects true or false");
  return { action, ...flags };
}

function validateProbeOptions(flags) {
  flags.argumentForm = flags["argument-form"] ?? "object";
  if (!["object", "null", "omitted"].includes(flags.argumentForm)) throw new Error("invalid probe argument form");
  flags.probeTool = flags["probe-tool"] ?? "query";
  if (!["query", "upsert"].includes(flags.probeTool)) throw new Error("invalid probe tool");
  if (flags.probeTool === "upsert" && flags.argumentForm !== "object") throw new Error("upsert probe needs the fixed synthetic arguments");
}

function parseFlags(rest, allowed) {
  const flags = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index].slice(2), value = rest[index + 1];
    if (!rest[index].startsWith("--") || !allowed.includes(key) || !value || value.startsWith("--") || Object.hasOwn(flags, key)) {
      throw new Error("invalid or duplicate command option");
    }
    flags[key] = value;
  }
  return flags;
}

function boundedInteger(value, min, max) {
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw new Error("invalid run budget");
  }
  return Number(value);
}

function validateRunOptions(flags) {
  if (!VARIANTS.has(flags.variant)) throw new Error("invalid variant");
  if (flags.variant !== "no-skill" && (!flags.artifacts || !flags["npm-cache"])) throw new Error("pinned --artifacts and --npm-cache are required");
  validateHostOptions(flags);
  if (flags.effort && !["low", "medium", "high", "xhigh"].includes(flags.effort)) throw new Error("invalid reasoning effort");
  flags.repeat = boundedInteger(flags.repeat ?? "1", 1, 5);
  flags.timeoutMs = boundedInteger(flags["timeout-ms"] ?? "150000", 1000, 300000);
}

function validateHostOptions(flags) {
  if (flags.profile && (!/^[A-Za-z0-9_-]{1,64}$/u.test(flags.profile) || !flags.profile.trim())) throw new Error("invalid profile");
  if (flags.model && !/^[\w./@+-]{1,120}$/u.test(flags.model)) throw new Error("invalid model identity");
  if (flags.codex && !path.isAbsolute(flags.codex)) throw new Error("--codex must be an absolute binary path");
}

function packagePins(flags, row) {
  const requested = wantedPackages(row, flags.variant);
  if (!requested.length) return {};
  const manifest = readJSON(flags.artifacts);
  if (manifest.schemaVersion !== 1 || !manifest.packages || Object.keys(manifest.packages).some(key => !PACKAGES.includes(key))) {
    throw new Error("invalid pinned artifact manifest");
  }
  return Object.fromEntries(requested.map(key => {
    const pin = manifest.packages[key];
    if (typeof pin?.file !== "string" || !pin.file || !/^[a-f0-9]{64}$/u.test(pin.sha256)
      || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(pin.version)) throw new Error("invalid pin for " + key);
    return [key, { ...pin, file: path.resolve(path.dirname(flags.artifacts), pin.file) }];
  }));
}

function reportPins(pins) {
  return Object.fromEntries(Object.entries(pins).map(([key, { version, sha256 }]) => [key, { version, sha256 }]));
}

function fixtureWrite(root, name, text) {
  const file = safePath(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function fixtureSeeds(project, row) {
  const type = row.fixture.kind;
  fixtureWrite(project, "package.json", JSON.stringify({
    name: "wl-host-eval-fixture", version: "0.0.0", private: true,
    wlSkills: { schemaVersion: 1, integration: "compact", hosts: ["codex"], mcp: true },
  }));
  if (type === "pc") fixtureWrite(project, "src/views/demo/index.vue", "<template><div>Fixture</div></template>\n");
  if (type === "backend") fixtureWrite(project, "pom.xml", "<project><modelVersion>4.0.0</modelVersion><groupId>fixture</groupId><artifactId>fixture</artifactId><version>1.0</version></project>\n");
  if (type === "mobile") {
    fixtureWrite(project, "pages.json", '{"pages":[]}\n');
    fixtureWrite(project, "manifest.json", '{"name":"Synthetic UniApp"}\n');
  }
  for (const [name, text] of Object.entries(row.fixture.files ?? {})) fixtureWrite(project, name, text);
}

function childEnvironment(extra = {}) {
  const keys = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TMPDIR", "TEMP", "TMP", "SystemRoot", "USERPROFILE"];
  return { ...Object.fromEntries(keys.filter(key => process.env[key]).map(key => [key, process.env[key]])), ...extra };
}

function shortRun(guard, command, args, cwd, stage, env = childEnvironment()) {
  const guarded = guard.guardRun(command, args, { cwd, env });
  const child = spawnSync(guarded.command, guarded.args, { ...guarded.options, encoding: "utf8", timeout: 40000, maxBuffer: MAX_OUTPUT });
  if (child.status !== 0 || child.error) throw new StageError(stage, processFailure(child));
  return child.stdout;
}

function processFailure(child) {
  // Preserve recognized machine-readable failure codes without retaining stderr,
  // which may include registry credentials or the user's absolute host paths.
  const code = [child.error?.code, /(?:npm error code|Error:)\s+(E[A-Z0-9]{2,30})\b/u.exec(child.stderr ?? "")?.[1]].find(Boolean);
  return { exitCode: child.status, ...(code ? { code } : {}), ...(child.signal ? { signal: child.signal } : {}) };
}

function pinArtifact(file, sha256, target) {
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > MAX_ARTIFACT) throw new StageError("invalid-artifact");
  const bytes = fs.readFileSync(file);
  if (hash(bytes) !== sha256) throw new StageError("artifact-digest-mismatch");
  fs.writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
}

function installedIdentity(project, key, version) {
  const prefix = safePath(project, "node_modules/" + PKG(key));
  const installed = readJSON(path.join(prefix, "package.json"));
  if (installed.name !== PKG(key) || installed.version !== version) throw new StageError("installed-identity-mismatch");
  return prefix;
}

function kitInstallArgs(help, variant) {
  if (variant === "baseline" && !/^\s*--hosts\b/mu.test(help) && !/^\s*--mcp\b/mu.test(help)) return { args: ["init"], mode: "legacy" };
  return { args: ["init", "--hosts", "codex", "--mcp"], mode: "compact" };
}

function initializePackage(guard, project, key, version, fixture) {
  const bin = path.join(installedIdentity(project, key, version), BIN[key]);
  const { args: initArgs, mode } = initializer(guard, bin, project, key, fixture.variant);
  const args = [bin, ...initArgs];
  if (key === "bd") {
    const preview = JSON.parse(shortRun(guard, process.execPath, [...args, "--json"], project, "init-bd-preview"));
    if (!/^[a-f0-9]{64}$/u.test(preview.planHash)) throw new StageError("init-bd-missing-plan");
    args.push("--confirm", "--plan-hash", preview.planHash);
  }
  shortRun(guard, process.execPath, args, project, "init-" + key,
    childEnvironment({ npm_config_cache: path.join(fixture.root, "cache") }));
  return mode;
}

function initializer(guard, bin, project, key, variant) {
  if (key === "kit" && variant === "baseline") return kitInstallArgs(shortRun(guard, process.execPath, [bin, "--help"], project, "init-kit-help"), variant);
  return { args: ["init", "--hosts", "codex", ...(key === "design" ? [] : ["--mcp"])], mode: "compact" };
}

function installPackages(guard, project, pins, fixture) {
  const { root, cache } = fixture;
  const files = Object.entries(pins).map(([key, pin]) => {
    const target = path.join(root, key + ".tgz");
    pinArtifact(pin.file, pin.sha256, target);
    return target;
  });
  if (!files.length) return {};
  const npmrc = path.join(root, "empty.npmrc");
  fs.writeFileSync(npmrc, "");
  shortRun(guard, "npm", ["install", "--offline", "--legacy-peer-deps", "--ignore-scripts", "--no-audit", "--no-fund", "--userconfig", npmrc,
    "--cache", path.resolve(cache), ...files], project, "offline-install");
  return Object.fromEntries(Object.entries(pins).map(([key, { version }]) => [key, initializePackage(guard, project, key, version, fixture)]));
}

function optionalConfig(file) {
  try {
    if (fs.statSync(file).size > 256 * 1024) throw new StageError("oversized-host-config");
    return parseTOML(fs.readFileSync(file, "utf8"));
  } catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

function tomlValue(value) {
  if (Array.isArray(value)) return "[" + value.map(tomlValue).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).map(([key, item]) => JSON.stringify(key) + "=" + tomlValue(item)).join(",") + "}";
  return JSON.stringify(value);
}

function legacyKitMcp(project) {
  const file = safePath(project, ".mcp.json");
  const entry = readJSON(file).mcpServers?.["wl-skills"];
  if (!entry) throw new StageError("missing-legacy-kit-mcp");
  return entry;
}

function allowedMcp(project, pins, runId, installation, fixture) {
  const config = optionalConfig(path.join(project, ".codex", "config.toml"));
  const entries = { ...config.mcp_servers, ...(installation.kit === "legacy" ? { "wl-skills": legacyKitMcp(project) } : {}) };
  const result = {};
  for (const [name, entry] of Object.entries(entries)) {
    const key = MCP_SERVER[name];
    if (!key || !Object.hasOwn(pins, key)) throw new StageError("unexpected-fixture-mcp");
    const bin = path.join(installedIdentity(project, key, pins[key].version), MCP_BIN[key]);
    if (!boundMcp(entry, project, bin, installation[key] === "legacy")) throw new StageError("unbound-fixture-mcp");
    result[name] = { command: process.execPath, args: [bin], cwd: project, env: { WL_PROJECT_ROOT: project, WL_TASK_RUN_ID: runId }, enabled: true };
  }
  if (expectedMcpNames(pins).some(name => !Object.hasOwn(result, name))) throw new StageError("missing-fixture-mcp");
  configureMenuApproval(result["wl-skills"], project, fixture, pins.kit);
  return result;
}

function configureMenuApproval(server, project, fixture, pin) {
  if (!fixture || !server || !/^[a-f0-9]{64}$/u.test(pin?.sha256 ?? "")) return;
  const { row, service } = fixture;
  const approval = require("./host-skill-eval-menu.cjs").fixtureApproval(project, row, service);
  if (!approval) return;
  server.args.unshift("--require", path.join(__dirname, "../support/host-skill-eval-menu-network.cjs"));
  server.env.WL_EVAL_KIT_MENU_PORT = approval.port;
  server.tools = Object.fromEntries(approval.tools.map(tool => [tool, { approval_mode: "approve" }]));
}

function boundMcp(entry, project, bin, legacy) {
  if (entry.command !== "node" || !Array.isArray(entry.args) || entry.args.length !== 1 || path.resolve(project, entry.args[0]) !== bin) return false;
  if (legacy) return entry.cwd === undefined && entry.env === undefined;
  return entry.cwd === project && entry.env?.WL_PROJECT_ROOT === project;
}

function codexArguments(root, project, runId, pins, flags, installation = {}) {
  const authRoot = path.join(os.homedir(), ".codex");
  const userServers = { ...optionalConfig(path.join(authRoot, "config.toml")).mcp_servers,
    ...(flags.profile ? optionalConfig(path.join(authRoot, flags.profile + ".config.toml")).mcp_servers : {}) };
  const projectServers = allowedMcp(project, pins, runId, installation, flags.menuFixture);
  const values = [
    "analytics.enabled=false", "check_for_update_on_startup=false", "features.hooks=false", "features.apps=false", "features.plugins=false",
    'history.persistence="none"', 'approval_policy="never"', 'web_search="disabled"', "sandbox_workspace_write.network_access=false",
    'shell_environment_policy.inherit="core"', "shell_environment_policy.set.WL_TASK_RUN_ID=" + JSON.stringify(runId),
    "sqlite_home=" + JSON.stringify(path.join(root, "state")), "log_dir=" + JSON.stringify(path.join(root, "log")),
    "projects=" + tomlValue({ [project]: { trust_level: "untrusted" } }),
  ];
  if (flags.effort) values.push("model_reasoning_effort=" + JSON.stringify(flags.effort));
  // Only the fixture's verified stdio commands may be active. Disable every inherited
  // configured server using a complete table so Codex never validates a partial transport.
  const servers = Object.fromEntries(Object.keys(userServers).map(name => [name, { command: process.execPath, args: ["--version"], enabled: false }]));
  // Codex splits CLI keys on dots without unquoting them. Put quoted names in
  // the TOML value so the host registers wl-skills, rather than a quoted name.
  values.push("mcp_servers=" + tomlValue({ ...servers, ...projectServers }));
  return [...(flags.profile ? ["--profile", flags.profile] : []), ...values.flatMap(value => ["-c", value])];
}

function processTree(child) {
  if (!child.pid) return;
  if (process.platform !== "win32") {
    try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") child.kill("SIGKILL"); }
  } else {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { timeout: 3000, stdio: "ignore" });
    child.kill("SIGKILL");
  }
}

function managedChild(guard, command, args, project, env) {
  const guarded = guard.guardRun(command, args, { cwd: project, env });
  const child = spawn(guarded.command, guarded.args, { ...guarded.options, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
  const stop = () => processTree(child);
  child.stdin.on("error", () => {});
  child.once("exit", stop);
  child.once("close", () => {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return child;
}

function capture({ guard, command, args, project, env, timeoutMs, input }) {
  const start = Date.now();
  return new Promise(resolve => {
    const child = managedChild(guard, command, args, project, env);
    const retained = [];
    let bytes = 0, infrastructure;
    const stop = reason => { infrastructure ??= reason; processTree(child); };
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    function collect(chunk, stdout) {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT) stop("output-limit");
      else if (stdout) retained.push(chunk);
    }
    child.stdout.on("data", chunk => collect(chunk, true));
    child.stderr.on("data", chunk => collect(chunk, false));
    child.once("error", () => { infrastructure = "host-start-failed"; });
    child.once("close", exitCode => {
      clearTimeout(timer);
      const stdout = Buffer.concat(retained);
      resolve({ stdout, exitCode, infrastructure, durationMs: Date.now() - start });
    });
    child.stdin.end(input);
  });
}

async function codexDiscovery({ guard, command, args, project, env, pins, argumentForm, probeTool }) {
  const child = managedChild(guard, command, ["--no-daemon", "app-server", "--listen", "stdio://", ...args], project, env);
  const lines = readline.createInterface({ input: child.stdout });
  let pending, seq = 0, stopped = false, bytes = 0;
  const fail = reason => { stopped = true; pending?.reject(new StageError(reason)); processTree(child); };
  child.on("error", () => fail("discovery-start-failed"));
  child.on("close", () => fail("discovery-closed"));
  const budget = chunk => { if ((bytes += chunk.length) > MAX_OUTPUT) fail("discovery-output-limit"); };
  child.stderr.on("data", budget);
  child.stdout.on("data", budget);
  const send = value => child.stdin.write(JSON.stringify(value) + "\n");
  const request = (method, params) => new Promise((resolve, reject) => {
    if (stopped) { reject(new StageError("discovery-closed")); return; }
    pending = { resolve, reject, id: ++seq };
    send({ method, params, id: seq });
  });
  lines.on("line", line => {
    try {
      const reply = JSON.parse(line);
      if (reply.id !== pending?.id || !pending) return;
      if (reply.error) pending.reject(new StageError("discovery-rpc-error", rpcError(reply.error)));
      else pending.resolve(reply.result);
      pending = null;
    } catch { fail("discovery-invalid-output"); }
  });
  const timer = setTimeout(() => fail("discovery-timeout"), argumentForm ? 25000 : 15000);
  try {
    const init = await request("initialize", { clientInfo: { name: "wl-eval", version: "1" }, capabilities: { experimentalApi: true } });
    send({ method: "initialized", params: {} });
    const reply = await request("skills/list", { cwds: [project], forceReload: true });
    const discovery = discoveryResult(init, reply, project, pins);
    if (argumentForm) discovery.nativeProbe = await probeKitQuery(request, project, argumentForm, probeTool);
    else discovery.mcp = await observeMcp(request, expectedMcpNames(pins));
    return discovery;
  } finally {
    clearTimeout(timer);
    lines.close();
    child.stdin.end();
    processTree(child);
  }
}

function rpcError(error) {
  return { ...(Number.isSafeInteger(error?.code) ? { rpcCode: error.code } : {}), failureKind: mcpErrorKind({ error }, {}) };
}

const sortPreviewArgs = { orderOnly: true, items: [{ id: "502", orderNum: 5 }, { id: "501", orderNum: 10 }] };

async function probeKitQuery(request, project, argumentForm, probeTool = "query") {
  const server = "wl-skills";
  const tool = probeTool === "upsert" ? "wls_menu_upsert" : "wls_menu_query";
  const probe = { server, tool, argumentForm };
  let stage = "thread-start";
  let availability;
  try {
    const threadId = await startProbeThread(request, project);
    stage = "tool-list";
    availability = await observeMcp(request, [server], threadId);
    stage = "tool-call";
    const result = await request("mcpServer/tool/call", { threadId, server, tool, ...probeArguments(probeTool, argumentForm) });
    return { ...probe, stage, availability, ...probeToolResult(result, tool, probeTool) };
  } catch (error) {
    return { ...probe, status: "failed", stage, availability, error: error.stage ?? "host-probe-error", ...error.details };
  }
}

function probeArguments(probeTool, argumentForm) {
  if (probeTool === "upsert") return { arguments: sortPreviewArgs };
  if (argumentForm === "omitted") return {};
  return { arguments: argumentForm === "null" ? null : {} };
}

async function startProbeThread(request, project) {
  const reply = await request("thread/start", { cwd: project, ephemeral: true, sandbox: "workspace-write", approvalPolicy: "never" });
  const threadId = reply?.thread?.id;
  if (typeof threadId !== "string" || !/^[\w.-]{1,128}$/u.test(threadId)) throw new StageError("invalid-thread-id");
  return threadId;
}

function probeToolResult(result, tool, probeTool) {
  const fields = mcpResult(result?.structuredContent, tool);
  const expected = probeTool === "upsert" ? correctSortPreview(fields) : fields.state === "completed";
  if (result?.isError !== true && fields.ok === true && expected) return { status: "completed", result: fields };
  return { status: "failed", result: fields, failureKind: mcpErrorKind({}, result ?? {}) };
}

function correctSortPreview(fields) {
  const actions = [{ action: "update", ...sortPreviewArgs.items[0] }];
  return fields.state === "ready" && fields.mode === "preview" && fields.hasPlanHash === true
    && JSON.stringify(fields.actions) === JSON.stringify(actions);
}

function expectedMcpNames(pins) {
  return Object.keys(MCP_SERVER).filter(name => Object.hasOwn(pins, MCP_SERVER[name]));
}

function mcpTools(value) {
  const names = Array.isArray(value) ? value.map(item => item.name) : Object.keys(value ?? {});
  return [...new Set(names.filter(name => typeof name === "string" && /^[\w.-]{1,128}$/u.test(name)))].slice(0, 200);
}

async function observeMcp(request, configured, threadId) {
  if (!configured.length) return { status: "not-configured", servers: [] };
  try {
    const reply = await request("mcpServerStatus/list", { detail: "toolsAndAuthOnly", limit: 50, ...(threadId ? { threadId } : {}) });
    if (!Array.isArray(reply?.data)) return { status: "unverified", servers: configured.map(name => ({ name, tools: [] })) };
    const servers = configured.map(name => {
      const row = reply.data.find(server => server.name === name);
      return { name, tools: mcpTools(row?.tools), reported: Boolean(row) };
    });
    return { status: servers.every(server => server.tools.length > 0) ? "advertised" : "not-observed", servers };
  } catch {
    // A no-thread listing may not be supported or may omit project-scoped MCP.
    // The subsequent exec session remains independent of this observation.
    return { status: "unverified", servers: configured.map(name => ({ name, tools: [] })) };
  }
}

function discoveryResult(init, reply, project, pins) {
  const found = reply?.data?.find(item => item.cwd === project);
  if (!found || !Array.isArray(found.skills) || found.errors?.length) throw new StageError("discovery-unverified");
  const visible = found.skills.filter(skill => /^wl-skills(?:-|$)/u.test(skill.name) && skill.enabled !== false);
  const keys = Object.keys(pins);
  if (visible.length !== keys.length || !keys.every(key => projectGateway(visible, project, key))) throw new StageError("discovery-missing-or-contaminated");
  return { version: discoveryVersion(init),
    installedSkills: visible.map(skill => skill.name), otherEnabledSkills: found.skills.filter(skill => skill.enabled !== false).length - visible.length };
}

function discoveryVersion(init) {
  return typeof init?.userAgent === "string" ? init.userAgent.match(/wl-eval\/([\w.+-]{1,80})/u)?.[1] : undefined;
}

function projectGateway(visible, project, key) {
  const name = "wl-skills-" + key;
  const file = path.join(project, ".agents", "skills", name, "SKILL.md");
  return visible.some(skill => skill.name === name && skill.path === file && skill.enabled === true);
}

function finishedReport(row, variant, trial, snapshots) {
  return { ...trial, grade: grade(row, trial, variant, snapshots) };
}

async function runTrial(row, flags, pins) {
  const guard = createFixtureGuard("wl-native-skill-eval");
  const project = guard.fixture("project");
  const runId = "eval-" + randomUUID();
  const host = { name: "codex", ...(flags.model ? { model: flags.model } : {}), ...(flags.effort ? { effort: flags.effort } : {}),
    ...(flags.profile ? { profile: flags.profile } : {}) };
  let service;
  try {
    fixtureSeeds(project, row);
    const installation = installPackages(guard, project, pins, { root: guard.root, cache: flags["npm-cache"], variant: flags.variant });
    if (row.fixture.service === "kit-menu") service = await require("./host-skill-eval-menu.cjs").startKitMenuFixture(project);
    return await evaluateFixture({ row, flags, pins, guard, project, runId, host, service, installation });
  } catch (error) {
    return finishedReport(row, flags.variant, { host, runId, status: error.stage ?? "setup-error", details: error.details,
      coverage: { skill: false, tools: false }, evidence: [], metrics: {} });
  } finally {
    try { await service?.close?.(); } finally { fs.rmSync(guard.root, { recursive: true, force: true }); }
  }
}

async function evaluateFixture({ row, flags, pins, guard, project, runId, host, service, installation }) {
  const command = flags.codex ?? "codex";
  const env = evaluationEnvironment(runId, flags.action);
  const lock = safePath(project, "package-lock.json");
  const dependencyLockSha256 = fs.existsSync(lock) ? hash(fs.readFileSync(lock)) : null;
  const args = fixtureCodexArguments({ guard, project, runId, pins, flags, installation, row, service });
  if (flags.probeTool === "upsert") prepareMenuTask({ guard, project, runId, row, pins });
  const discovery = await codexDiscovery({ guard, command, args, project, env, pins, argumentForm: flags.argumentForm, probeTool: flags.probeTool });
  if (discovery.version) host.version = discovery.version;
  if (flags.action === "probe") {
    return evaluateProbe({ project, pins, runId, service, discovery, host, installation, dependencyLockSha256 });
  }
  return evaluateModel({ row, flags, pins, guard, project, runId, host, service, installation, command, env, args, discovery, dependencyLockSha256 });
}

function fixtureCodexArguments({ guard, project, runId, pins, flags, installation, row, service }) {
  const menuFixture = flags.action === "run" && service ? { row, service } : undefined;
  return codexArguments(guard.root, project, runId, pins, { ...flags, menuFixture }, installation);
}

async function evaluateProbe({ project, pins, runId, service, discovery, host, installation, dependencyLockSha256 }) {
  const journal = readJournal(project, pins, runId);
  await service.finalize();
  const fixtureObservation = service.observe();
  const { nativeProbe } = discovery;
  const closure = probeClosure(nativeProbe, journal, fixtureObservation);
  const status = nativeProbe.status === "completed" && closure.passed ? "completed" : "failed";
  return { host, runId, status, discovery, installation, evidence: journal.evidence, closure,
    journalComplete: journal.complete, fixtureObservation, dependencyLockSha256 };
}

function probeClosure(probe, journal, fixture) {
  const receipt = journal.evidence.some(item => item.tool === probe.tool && item.status === "completed"
    && item.planFingerprint === probe.result?.planFingerprint);
  const loopback = fixture.successfulReads > 0 && fixture.rejectedReads === 0 && fixture.writeAttempts === 0;
  return { passed: journal.complete && receipt && loopback, receipt, loopback };
}

function prepareMenuTask({ guard, project, runId, row, pins }) {
  const bin = path.join(installedIdentity(project, "kit", pins.kit.version), BIN.kit);
  shortRun(guard, process.execPath, [bin, "task", row.prompt, "--target", "pages/quality/index.vue", "--run-id", runId, "--json"], project, "probe-menu-task");
}

function evaluationEnvironment(runId, action) {
  const modelKey = action === "run" && process.env.OPENAI_API_KEY;
  return childEnvironment({ WL_TASK_RUN_ID: runId, ...(modelKey ? { OPENAI_API_KEY: modelKey } : {}) });
}

async function evaluateModel({ row, flags, pins, guard, project, runId, host, service, installation, command, env, args, discovery, dependencyLockSha256 }) {
  const before = snapshotAssertions(project, row.expect.assertions);
  const exec = ["--no-daemon", ...args, "exec", "--json", "--ephemeral", "--skip-git-repo-check", "--sandbox", "workspace-write",
    ...(flags.profile ? [] : ["--ignore-user-config", "--ignore-rules"]),
    ...(flags.model ? ["--model", flags.model] : []), "-"];
  const result = await capture({ guard, command, args: exec, project, env, timeoutMs: flags.timeoutMs, input: row.prompt });
  const trial = parseCodex(result.stdout.toString("utf8"), { root: project, host, ...result });
  const journal = readJournal(project, pins, runId);
  trial.evidence.push(...journal.evidence);
  await service?.finalize?.();
  return finishedReport(row, flags.variant, { ...trial, runId, discovery, installation, journalComplete: journal.complete,
    ...(service ? { fixtureObservation: service.observe() } : {}),
    dependencyLockSha256, traceSha256: hash(result.stdout), traceRetained: false }, { before, after: snapshotAssertions(project, row.expect.assertions) });
}

async function serialTrials(count, trial) {
  if (!count) return [];
  const head = await trial();
  return [head, ...await serialTrials(count - 1, trial)];
}

function hasNonPassingGrade({ grade: verdict }) {
  return [verdict.selection, verdict.decision, ...verdict.receipts, ...verdict.requiredTools, ...verdict.forbiddenTools, ...verdict.expectedMcpResults, ...verdict.assertions]
    .some(check => check.status !== "passed" && check.status !== "skipped");
}

async function main(argv) {
  const flags = options(argv);
  const row = catalogCases(readJSON(flags.catalog)).find(candidate => candidate.id === flags.case);
  if (!row) throw new Error("case does not exist in catalog");
  if (flags.action === "probe") validateProbeCase(flags, row);
  const out = path.resolve(flags.out);
  if (fs.existsSync(out)) throw new Error("refusing to overwrite evidence output");
  const { variant, packages, trials } = await collectTrials(row, flags);
  const report = { schemaVersion: 1, case: row.id, family: row.family, split: row.split, variant,
    promptSha256: hash(row.prompt), caseSha256: hash(JSON.stringify(row)), ...(packages ? { packages } : {}),
    ...(flags.action === "probe" ? { mode: "native-probe" } : {}), trials };
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({ case: row.id, variant, trials: trials.map(trial => trial.status), evidence: out }) + "\n");
  if (trials.some(trial => trial.status !== "completed")) process.exitCode = 2;
  else if (flags.strict === "true" && trials.some(hasNonPassingGrade)) process.exitCode = 3;
}

function validateProbeCase(flags, row) {
  if (flags.variant === "no-skill" || row.fixture.service !== "kit-menu" || row.expect.skill !== "kit") {
    throw new Error("native probe requires a pinned Kit menu fixture");
  }
  if (flags.probeTool === "upsert" && row.id !== "kit-menu-sort-preview") throw new Error("upsert probe requires the menu sort fixture");
}

async function collectTrials(row, flags) {
  if (flags.action === "ingest") {
    const trial = parsePortable(readJSON(flags.evidence));
    return { variant: trial.variant, trials: [finishedReport(row, trial.variant, trial)] };
  }
  const pins = packagePins(flags, row);
  return { variant: flags.variant, packages: reportPins(pins), trials: await serialTrials(flags.repeat, () => runTrial(row, flags, pins)) };
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main, options, packagePins, codexArguments, kitInstallArgs, allowedMcp, probeKitQuery };

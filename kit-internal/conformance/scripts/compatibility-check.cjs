#!/usr/bin/env node
"use strict";

/** Development fixture runner: ordinary upgrade and candidate/published coexistence. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

// Kept with this standalone script; no workspace or sibling source lookup.
const PACKAGES = {
  kit: { baseline: "2.31.1", bin: "wl-skills.js", state: ".wl-skills-manifest.json", task: "前端代码审查", target: "src/index.vue" },
  ui: { baseline: "1.20.1", bin: "wl-ui.js", state: ".wl-skills-ui-manifest.json", task: "UI扫描", target: "src/index.vue" },
  bd: { baseline: "0.38.0", bin: "wl-skills-bd.js", state: ".wl-skills-bd-manifest.json", task: "检查 Java 后端规范", target: "src/FooService.java" },
  design: { baseline: "0.18.0", bin: "wl-skills-design.js", state: ".wl-skills-design/state.json", task: "检查需求说明书结构", target: "docs/spec/ch1-3.md" },
  test: { baseline: "0.32.0", bin: "wl-skills-test.js", state: ".wl-skills-test/manifest.json", task: "接入测试", target: "src/index.vue" },
};
const KEYS = Object.keys(PACKAGES);
const nameFor = key => `@agile-team/wl-skills-${key}`;
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const inside = (base, target) => target === base || target.startsWith(base + path.sep);

function argumentValue(args, index, flag) {
  const arg = args[index];
  const inline = arg.includes("=");
  const value = inline ? arg.slice(flag.length + 1) : args[index + 1];
  if (typeof value !== "string" || !value.trim() || value.startsWith("--")) throw new Error(`${flag} 缺少非空值`);
  return { value, next: inline ? index : index + 1 };
}

function parseArgs(argv, env = process.env) {
  const options = { node20: env.WL_COMPAT_NODE20 || undefined };
  const flags = { "--package-root": "packageRoot", "--key": "key", "--candidate-lock": "candidateLock", "--output": "output", "--node20": "node20" };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") { options.help = true; continue; }
    const flag = arg.split("=", 1)[0];
    if (!flags[flag]) throw new Error(`未知参数：${flag}`);
    if (seen.has(flag)) throw new Error(`重复参数：${flag}`);
    seen.add(flag);
    const { value, next } = argumentValue(argv, index, flag);
    index = next;
    options[flags[flag]] = value;
  }
  if (options.key && !KEYS.includes(options.key)) throw new Error(`未知包：${options.key}`);
  return options;
}

function findPackageRoot(start = __dirname) {
  let directory = path.resolve(start);
  for (;;) {
    const file = path.join(directory, "package.json");
    if (fs.existsSync(file)) {
      const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
      if (KEYS.some(key => pkg.name === nameFor(key))) return directory;
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error("找不到本包 package.json，请指定 --package-root 或 --candidate-lock --key");
    directory = parent;
  }
}

function stableVersion(value) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error(`候选必须是精确正式版本，禁止桥接/预发布：${value}`);
  return value;
}
function newer(candidate, baseline) {
  const left = stableVersion(candidate).split(".").map(Number), right = baseline.split(".").map(Number);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}
function candidateVersion(key, value) {
  const version = stableVersion(value);
  if (!newer(version, PACKAGES[key].baseline)) throw new Error("候选版本必须高于固定发布基线");
  return version;
}

function candidateLockRow(options, lock) {
  if (!Array.isArray(lock.packages) || !lock.packages.length) throw new Error("候选锁 packages 必须是非空数组");
  const key = options.key || (lock.packages.length === 1 ? lock.packages[0].key : undefined);
  if (!KEYS.includes(key)) throw new Error("多包候选锁必须指定 --key");
  const rows = lock.packages.filter(row => row && (row.key === key || row.name === nameFor(key)));
  if (rows.length !== 1) throw new Error(`候选锁必须唯一包含 ${key}`);
  const row = rows[0];
  if (row.name !== nameFor(key) || row.key && row.key !== key) throw new Error("候选锁包身份不一致");
  return { key, row };
}

function lockedCandidate(options) {
  const lockPath = path.resolve(options.candidateLock);
  const { key, row } = candidateLockRow(options, JSON.parse(fs.readFileSync(lockPath, "utf8")));
  const artifact = row.artifact || row.path;
  if (typeof artifact !== "string" || !artifact.trim() || !artifact.endsWith(".tgz")) throw new Error("候选锁必须指定精确 tgz artifact");
  if (!/^[a-f0-9]{64}$/.test(row.sha256 || "")) throw new Error("候选锁缺少有效 sha256");
  const file = fs.realpathSync(path.resolve(path.dirname(lockPath), artifact));
  assert.equal(sha256(fs.readFileSync(file)), row.sha256, "候选 tgz SHA256 不一致");
  const version = candidateVersion(key, row.newVersion || row.version);
  return { key, name: row.name, version, artifact: file, sha256: row.sha256, origin: "candidate-lock" };
}

function selectCandidate(options) {
  if (options.candidateLock) return lockedCandidate(options);
  const packageRoot = fs.realpathSync(options.packageRoot || findPackageRoot());
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const key = options.key || KEYS.find(item => nameFor(item) === pkg.name);
  if (!KEYS.includes(key) || pkg.name !== nameFor(key)) throw new Error("--key 与候选源码包名不一致");
  const version = candidateVersion(key, pkg.version);
  return { key, name: pkg.name, version, packageRoot, origin: "source-pack" };
}

function createSandbox() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wl-compatibility-")));
  function assertTarget(target, label = "target") {
    const resolved = path.resolve(target);
    if (!inside(root, resolved)) throw new Error(`fixture guard：${label} 越出临时根`);
    let ancestor = resolved;
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    if (!inside(root, fs.realpathSync(ancestor))) throw new Error(`fixture guard：${label} 符号链接逃逸`);
    return resolved;
  }
  function guardRun(args, cwd) {
    assertTarget(cwd, "cwd");
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index], flag = arg.split("=", 1)[0];
      if (!["--target", "--project", "--input-file", "--pack-destination", "--prefix"].includes(flag)) continue;
      const { value, next } = argumentValue(args, index, flag);
      index = next;
      const file = assertTarget(path.resolve(cwd, value), flag);
      if (flag === "--input-file" && fs.existsSync(file)) guardInput(file, cwd);
    }
  }
  function guardInput(file, cwd) {
    const input = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof input.projectRoot !== "string" || !input.projectRoot.trim()) throw new Error("fixture guard：请求 projectRoot 必须非空");
    assertTarget(path.resolve(cwd, input.projectRoot), "projectRoot");
  }
  return { root, assertTarget, guardRun, fixture(label) {
    return fs.mkdtempSync(path.join(root, label + "-"));
  }, cleanup() { fs.rmSync(root, { recursive: true, force: true }); } };
}
function guardedSpawn(sandbox, command, args, options) {
  sandbox.guardRun(args, options.cwd);
  return spawnSync(command, args, options);
}
function npmCli() {
  const nearby = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  if (fs.existsSync(nearby)) return nearby;
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    const candidate = path.join(directory, process.platform === "win32" ? "npm.cmd" : "npm");
    if (!fs.existsSync(candidate)) continue;
    const real = fs.realpathSync(candidate);
    if (real.endsWith("npm-cli.js")) return real;
  }
  throw new Error("找不到 npm-cli.js；需安装可由当前 Node 调用的 npm");
}
function lifecycleArgs(key, action, root) {
  const args = [action];
  if (key === "ui") {
    args.push("--project", root);
    if (action !== "clean") args.push("--editor", "agents-generic", "--profile", "native-element", "--skills-only");
  }
  if (key === "bd" || key === "design") args.push("--target", root);
  if (key === "bd") args.push("--json");
  return args;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log("node compatibility-check.cjs [--package-root <source>] [--key kit|ui|bd|design|test] [--candidate-lock <lock.json>] [--output <evidence-parent>] [--node20 <executable>]\nWL_COMPAT_NPM_CACHE: 显式依赖缓存；WL_COMPAT_NODE20: 真 Node 20（仅 design/test）");
    return 0;
  }
  const candidate = selectCandidate(options);
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("五包混合矩阵需用 Node22+ 运行；Design/Test 的 Node20 通过 --node20 单独实测");
  if (options.node20 && !["design", "test"].includes(candidate.key)) throw new Error("Node20 验证仅适用于声明支持 Node20 的 design/test");
  const sandbox = createSandbox();
  const outputParent = options.output ? path.resolve(options.output) : os.tmpdir();
  fs.mkdirSync(outputParent, { recursive: true });
  const output = fs.mkdtempSync(path.join(outputParent, "wl-compat-evidence-"));
  const summary = { schemaVersion: 1, testedAt: new Date().toISOString(), candidate, baselines: Object.fromEntries(KEYS.map(key => [key, PACKAGES[key].baseline])), evidenceDirectory: output, forceUsed: false, bridgeVersionUsed: false, node: process.version, node20: { status: "not-requested" }, results: [], pass: false };
  const log = path.join(output, "commands.jsonl"), stdoutLog = path.join(output, "cli.log");
  const cache = process.env.WL_COMPAT_NPM_CACHE ? path.resolve(process.env.WL_COMPAT_NPM_CACHE) : path.join(sandbox.root, "npm-cache");
  const npmConfig = path.join(sandbox.root, "empty.npmrc"); fs.writeFileSync(npmConfig, "");
  const npmGlobalConfig = path.join(sandbox.root, "empty-global.npmrc"); fs.writeFileSync(npmGlobalConfig, "");
  const env = { ...process.env, npm_config_cache: cache, NPM_CONFIG_CACHE: cache, npm_config_userconfig: npmConfig, NPM_CONFIG_USERCONFIG: npmConfig, npm_config_globalconfig: npmGlobalConfig, NPM_CONFIG_GLOBALCONFIG: npmGlobalConfig };
  function run(command, args, cwd, allowed = [0]) {
    const result = guardedSpawn(sandbox, command, args, { cwd, env, encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    fs.appendFileSync(log, JSON.stringify({ command, args, cwd, exitCode: result.status, signal: result.signal, error: result.error?.message }) + "\n");
    fs.appendFileSync(stdoutLog, (result.stdout || "") + (result.stderr || "") + "\n");
    assert.ok(!result.error && allowed.includes(result.status), `命令失败：${path.basename(command)} ${args.slice(0, 4).join(" ")} / exit=${result.status} ${result.error?.message || (result.stderr || result.stdout || "").slice(-1800)}`);
    return result.stdout;
  }
  const npm = (args, cwd) => run(process.execPath, [npmCli(), ...args, "--ignore-scripts", "--registry=https://registry.npmjs.org", "--fetch-retries=0", "--fetch-timeout=30000"], cwd);
  const cli = (key, root) => path.join(root, "node_modules/@agile-team/wl-skills-" + key, "bin", PACKAGES[key].bin);
  function install(specs, root) { npm(["install", ...specs, "--save-exact", "--no-audit", "--no-fund"], root); }
  function lifecycle(key, action, root) {
    const args = lifecycleArgs(key, action, root);
    if (key === "bd") {
      const preview = JSON.parse(run(process.execPath, [cli(key, root), ...args], root));
      assert.equal(typeof preview.planHash, "string"); assert.ok(preview.planHash.length);
      args.push("--confirm", "--plan-hash", preview.planHash);
    }
    run(process.execPath, [cli(key, root), ...args], root);
  }
  function fixture(label) {
    const root = sandbox.fixture(label);
    const sentinels = { "AGENTS.md": "# User instructions\r\nPreserve these exact bytes.  \r\n", ".agents/skills/team/SKILL.md": "---\nname: team\ndescription: User-owned skill.\n---\nKeep this content.\n", ".github/standards/team.md": "# User-owned standard\r\nKeep bytes.\r\n" };
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "wl-compat-fixture", private: true }));
    for (const [file, bytes] of Object.entries({ ...sentinels, "src/index.vue": "<template><main>Fixture</main></template>\n", "src/FooService.java": "public class FooService {}\n", "docs/spec/ch1-3.md": "# 1 项目概述\n\n## 1.1 范围\n隔离兼容夹具。\n" })) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), bytes);
    }
    return { root, sentinels };
  }
  function preserve({ root, sentinels }, cleaned = false) {
    for (const [file, bytes] of Object.entries(sentinels)) {
      const actual = fs.readFileSync(path.join(root, file));
      if (file === "AGENTS.md" && !cleaned) assert.ok(actual.includes(Buffer.from(bytes)), "用户 AGENTS 字节丢失");
      else assert.deepEqual(actual, Buffer.from(bytes), `外来文件字节变化：${file}`);
    }
  }
  function manifest(key, root, version) {
    const state = JSON.parse(fs.readFileSync(path.join(root, PACKAGES[key].state), "utf8"));
    assert.equal(state.version || state.packageVersion || state.installedVersion, version);
    const gateway = `.agents/skills/wl-skills-${key}/SKILL.md`;
    const paths = Array.isArray(state.files) ? state.files.map(item => typeof item === "string" ? item : item.path) : Object.keys(state.files || {});
    assert.ok(paths.includes(gateway), `${key} gateway 未登记所有权`);
    assert.ok(fs.readFileSync(path.join(root, gateway), "utf8").trim());
  }
  function request(key, root, input, node = process.execPath) {
    const file = path.join(sandbox.root, `request-${crypto.randomUUID()}.json`);
    fs.writeFileSync(file, JSON.stringify({ projectRoot: root, ...input }));
    const args = [cli(key, root), "protocol", "request", "--input-file", file, "--json"];
    if (node !== process.execPath) args.unshift("--no-experimental-require-module");
    return JSON.parse(run(node, args, root));
  }
  function feedback(key, root, version, runId) {
    const described = JSON.parse(run(process.execPath, [cli(key, root), "protocol", "describe", "--json"], root));
    assert.equal(described.package, nameFor(key)); assert.equal(described.packageVersion, version);
    assert.deepEqual(described.inventory.loadErrors, []);
    if (key === candidate.key) assert.ok(described.features.includes("executor-invoke-v1"));
    const planned = request(key, root, { operation: "task", task: PACKAGES[key].task, targets: [PACKAGES[key].target], runId });
    assert.equal(planned.ok, true);
    const { notice } = planned.result;
    assert.equal(notice.packageVersion, version); assert.equal(notice.runId, runId);
    assert.ok(notice.rules.length && notice.requiredChecks.length, `${key} 缺少真实规则/待检查提醒`);
    assert.equal(notice.displayEvidence, "unverified"); assert.equal(notice.scope.status, "applicable"); assert.equal(notice.scope.inherited, false);
    assert.ok(["matched", "baseline"].includes(planned.result.integration.decisionStatus), `${key} 任务未能真实适用`);
    const status = request(key, root, { operation: "status", runId });
    assert.equal(status.ok, true); assert.equal(status.result.integration.packageName, nameFor(key)); assert.equal(status.result.integration.packageVersion, version);
    assert.equal(status.result.integration.runId, runId); assert.equal(status.result.integration.projectRoot, fs.realpathSync(root));
    assert.equal(status.result.executionStatus, "not-executed"); assert.equal(status.result.validationStatus, "unverified");
    assert.ok(status.result.records.length && status.result.records.every(record => record.packageName === nameFor(key) && record.runId === runId));
    return { key, version, decision: planned.result.integration.decisionStatus, runId, recordCount: status.result.records.length };
  }
  function retainCandidate() {
    if (!candidate.artifact) {
      const packDir = sandbox.fixture("pack");
      const packed = JSON.parse(npm(["pack", candidate.packageRoot, "--json", "--pack-destination", packDir], packDir));
      assert.equal(packed.length, 1); assert.equal(packed[0].name, candidate.name); assert.equal(packed[0].version, candidate.version);
      candidate.artifact = path.join(packDir, packed[0].filename); candidate.sha256 = sha256(fs.readFileSync(candidate.artifact));
    }
    // Preserve the exact validated artifact alongside its hash after temporary fixtures disappear.
    const retainedArtifact = path.join(output, path.basename(candidate.artifact));
    fs.copyFileSync(candidate.artifact, retainedArtifact); assert.equal(sha256(fs.readFileSync(retainedArtifact)), candidate.sha256);
    candidate.sourceArtifact = candidate.artifact; candidate.artifact = retainedArtifact;
  }
  function ordinaryUpgrade() {
    const single = fixture("single"), { key } = candidate;
    install([nameFor(key) + "@" + PACKAGES[key].baseline], single.root);
    const installedBaseline = JSON.parse(fs.readFileSync(path.join(single.root, "node_modules/@agile-team/wl-skills-" + key, "package.json")));
    assert.equal(installedBaseline.name, nameFor(key)); assert.equal(installedBaseline.version, PACKAGES[key].baseline);
    lifecycle(key, "init", single.root); manifest(key, single.root, PACKAGES[key].baseline); preserve(single);
    install([candidate.artifact], single.root);
    assert.equal(JSON.parse(fs.readFileSync(path.join(single.root, "node_modules/@agile-team/wl-skills-" + key, "package.json"))).version, candidate.version);
    lifecycle(key, "update", single.root); manifest(key, single.root, candidate.version); preserve(single);
    assert.deepEqual(KEYS.filter(other => other !== key && fs.existsSync(path.join(single.root, "node_modules/@agile-team/wl-skills-" + other))), []);
    const singleFeedback = feedback(key, single.root, candidate.version, "compat-single-" + key);
    const host = request(key, single.root, { operation: "doctor-host", host: "codex" }); assert.equal(host.result.runtime.status, "aligned");
    const statePath = path.join(single.root, PACKAGES[key].state), original = fs.readFileSync(statePath);
    try {
      const state = JSON.parse(original); state.version = PACKAGES[key].baseline; fs.writeFileSync(statePath, JSON.stringify(state));
      const drift = request(key, single.root, { operation: "task", task: PACKAGES[key].task, targets: [PACKAGES[key].target], runId: "compat-drift-" + key });
      assert.equal(drift.ok, true); assert.equal(drift.result.integration.runtime.status, "mismatch");
      assert.equal(drift.result.integration.decisionStatus, "gap"); assert.equal(drift.result.integration.ready, false); assert.deepEqual(drift.result.integration.allowedExecutors, []);
      assert.equal(drift.result.notice.runtime.status, "mismatch");
    } finally { fs.writeFileSync(statePath, original); }
    if (options.node20) {
      const version = run(options.node20, ["--version"], single.root).trim(); assert.match(version, /^v20\./, "必须提供真实 Node20");
      const result = request(key, single.root, { operation: "route", task: PACKAGES[key].task, targets: [PACKAGES[key].target] }, options.node20);
      assert.equal(result.ok, true); assert.equal(result.packageVersion, candidate.version);
      summary.node20 = { status: "passed", version, requireEsmDisabled: true };
    }
    lifecycle(key, key === "design" ? "uninstall" : "clean", single.root); preserve(single, true);
    summary.results.push({ group: "ordinary-upgrade", ...singleFeedback, pass: true, foreignBytesPreserved: true, driftDenied: true, cleanPreservedUser: true });
  }
  function coexistence() {
    const { key } = candidate;
    const mixed = fixture("mixed"), versions = Object.fromEntries(KEYS.map(other => [other, other === key ? candidate.version : PACKAGES[other].baseline]));
    install(KEYS.map(other => other === key ? candidate.artifact : nameFor(other) + "@" + versions[other]), mixed.root);
    for (const other of KEYS) lifecycle(other, "init", mixed.root);
    const mixedRows = [];
    for (const other of KEYS) { manifest(other, mixed.root, versions[other]); mixedRows.push(feedback(other, mixed.root, versions[other], "compat-shared-run")); }
    preserve(mixed);
    // A nested independent project must not inherit any parent's five-package installation.
    const child = path.join(mixed.root, "unadopted-child"); fs.mkdirSync(child); fs.writeFileSync(path.join(child, "package.json"), JSON.stringify({ name: "unadopted-child", private: true }));
    for (const other of KEYS) {
      const route = request(other, mixed.root, { operation: "route", projectRoot: child, task: PACKAGES[other].task });
      assert.equal(route.ok, true); assert.equal(route.result.integration.scope.status, "not-applicable"); assert.equal(route.result.integration.scope.adopted, false); assert.equal(route.result.integration.scope.inherited, false);
      assert.deepEqual(route.result.integration.allowedExecutors, []);
    }
    summary.results.push({ group: "candidate-plus-four-published", pass: true, packages: mixedRows, sameRunIdIsolated: true, childInheritanceDenied: true, foreignBytesPreserved: true });
  }
  try {
    retainCandidate();
    ordinaryUpgrade();
    coexistence();
    summary.pass = true;
  } catch (error) { summary.error = error.message; }
  finally {
    fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
    sandbox.cleanup();
  }
  console.log(JSON.stringify({ pass: summary.pass, key: candidate.key, version: candidate.version, evidenceDirectory: output, error: summary.error }));
  return summary.pass ? 0 : 1;
}
if (require.main === module) {
  try { process.exitCode = main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { PACKAGES, parseArgs, selectCandidate, createSandbox, guardedSpawn, lifecycleArgs, main };

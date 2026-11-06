#!/usr/bin/env node
"use strict";

/** Offline publication allowlist and optional exact-artifact release workflow. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { createInterface } = require("node:readline");
const { clearTimeout, setTimeout } = require("node:timers");

const REGISTRY = "https://registry.npmjs.org";
const RECEIPT = "candidate.json";
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
const RUN_ID = "npm-release-smoke";
const ACCEPTED_VALIDATION = ["passed", "partial"];
const COMPATIBILITY_GROUPS = ["ordinary-upgrade", "candidate-plus-four-published"];
const SCENARIOS = {
  kit: { bin: "wl-skills.js", task: "校验前端页面规范", target: "src/views/demo", subject: "src/views/demo/index.vue", args: ["validate", "src/views/demo", "--json"], tool: "validate", check: "validate", mcp: "mcp/server.js", route: ["wls_route", { task: "校验前端页面规范" }] },
  ui: { bin: "wl-ui.js", task: "检查表单样式", target: "src/views/demo", subject: "src/views/demo/index.vue", args: ["scan", "--target", "src/views/demo", "--output", "summary"], tool: "scan", check: "scan", mcp: "mcp/server.js", route: ["wl_ui_route", { task: "检查表单样式" }] },
  bd: { bin: "wl-skills-bd.js", task: "审查后端代码规范", target: "src/main/java/a/Example.java", subject: "src/main/java/a/Example.java", args: ["validate", "src", "--quick", "--json"], tool: "backend-rule-validator", check: "B34", mcp: "mcp/server.js", route: ["wls_be_task", { mode: "route", input: "审查后端代码规范" }] },
  design: { bin: "wl-skills-design.js", task: "验证需求设计说明书", target: "docs/design-model.json", subject: "docs/design-model.json", args: ["validate-model", "--model", "docs/design-model.json", "--json"], tool: "design-model-schema-validator", check: "design-model-schema" },
  test: { bin: "wl-skills-test.js", task: "梳理自动化测试规则", target: "tests/example.test.js", subject: "tests/example.test.js", args: ["audit", "tests/example.test.js", "--json"], tool: "audit", check: "test-code-audit", mcp: "mcp/index.js", route: ["wls_test_task", { action: "route", task: "梳理自动化测试规则" }] },
};

function execute(program, args, options) {
  const result = spawnSync(program, args, { encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${program} ${args[0]} 执行失败：${result.error?.message || result.stderr || result.stdout?.slice(-1500)}`);
  return result.stdout;
}

function npm(args, options) {
  const cli = process.env.npm_execpath;
  if (cli && path.basename(cli) === "npm-cli.js") return execute(process.execPath, [cli, ...args], options);
  const windows = process.platform === "win32";
  // Paths passed here are local fixed workflow paths; Windows npm is a cmd shim.
  return execute(windows ? "npm.cmd" : "npm", args, { shell: windows, ...options });
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

function releaseContext(root) {
  const pkg = readJson(path.join(root, "package.json"));
  const key = pkg.name.replace(/^@agile-team\/wl-skills-/, "");
  const scenario = SCENARIOS[key];
  assert.ok(Object.hasOwn(SCENARIOS, key) && pkg.name === `@agile-team/wl-skills-${key}`, "未知发布包");
  const directory = key === "ui" ? "bin" : "lib";
  const support = path.join(root, directory);
  const manifest = readJson(path.join(support, "shared-support-manifest.json"));
  const checked = require(path.join(support, "shared-support-check.cjs")).verifySupport(support);
  return { root, key, pkg, scenario, directory, manifest, checked };
}

function concreteExports(target) {
  if (typeof target === "string") return target.startsWith("./") && !target.includes("*") ? [target] : [];
  return target && typeof target === "object" ? Object.values(target).flatMap(concreteExports) : [];
}

function checkPublicFiles(pkg, scenario, files) {
  const entries = [...Object.values(pkg.bin || {}), scenario.mcp, pkg.main, pkg.types, ...concreteExports(pkg.exports)].filter(Boolean);
  for (const target of new Set(entries)) assert.ok(files.has(target.replace(/^\.\//u, "")), `发布产物缺少公开入口：${target}`);
}

function checkPayload(context, pack, verifyExecutables) {
  const { pkg, directory, manifest } = context;
  assert.equal(pack.name, pkg.name, "打包名称不一致");
  assert.equal(pack.version, pkg.version, "打包版本不一致");
  const required = [...Object.keys(manifest.distributionFiles), `${directory}/shared-support-manifest.json`];
  const files = new Set(pack.files.map(file => file.path));
  for (const name of required) assert.ok(files.has(name), `发布产物缺少共享分发文件：${name}`);
  if (verifyExecutables) checkPublicFiles(pkg, context.scenario, files);
  return required.length;
}

function pack(context, scratch, output) {
  const args = ["pack", "--offline", "--ignore-scripts", "--json", "--cache", scratch];
  args.push(...(output ? ["--pack-destination", output] : ["--dry-run"]));
  const packs = JSON.parse(npm(args, { cwd: context.root }));
  assert.equal(packs.length, 1, "必须是单包发布产物");
  const packResult = packs[0];
  const filesChecked = checkPayload(context, packResult, Boolean(output));
  return { packResult, filesChecked };
}

function assertTag(pkg, tag) {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/u, "稳定发布必须使用 X.Y.Z 版本");
  assert.equal(tag, `v${pkg.version}`, "发布标签必须与 package.json 版本一致");
}

function commitAt(root, tag) {
  const git = args => execute("git", args, { cwd: root }).trim();
  const commit = git(["rev-parse", "HEAD"]);
  assert.match(commit, /^[a-f0-9]{40}$/u);
  assert.equal(git(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]), commit, "当前代码与发布标签不是同一提交");
  assert.equal(git(["status", "--porcelain", "--untracked-files=normal"]), "", "发布必须从无未提交文件的标签工作副本生成");
  return commit;
}

function writeFixture(root, relative, content) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
}

function seedFixture(root, key) {
  const files = {
    "AGENTS.md": "# Standalone release fixture\n",
    "package.json": JSON.stringify({ name: "wl-release-smoke", private: true }),
    "src/views/demo/index.vue": "<template><div /></template>",
    "src/views/demo/data.ts": "export const columns = [];",
    "src/views/demo/index.scss": ".demo { display:flex; }",
    "docs/design-model.json": JSON.stringify({ schemaVersion: 1, projectCode: "SMOKE", fields: [], functions: [], traceLinks: [] }),
    "tests/example.test.js": "import {test,expect} from '@playwright/test';\ntest.beforeEach(()=>{});test.afterEach(()=>{});test('should display',async({page})=>{await expect(page.locator('table')).toBeVisible();});\n",
  };
  if (key === "bd") {
    files["pom.xml"] = "<project><modelVersion>4.0.0</modelVersion><groupId>fixture</groupId><artifactId>demo</artifactId><version>1</version></project>";
    files["src/main/java/a/Example.java"] = "package a;\nimport org.springframework.stereotype.Service;\n@Service\npublic class Example {\n  public Example() {}\n}\n";
  }
  for (const [relative, content] of Object.entries(files)) writeFixture(root, relative, content);
}

function initializeFixture(key, run) {
  if (key === "bd") {
    const plan = JSON.parse(run(["init", "--json"]));
    assert.match(plan.planHash, /^[a-f0-9]{64}$/u);
    return run(["init", "--confirm", "--plan-hash", plan.planHash, "--json"]);
  }
  if (key === "ui") return run(["init", "--profile", "native-element", "--skills-only"]);
  return run(["init"]);
}

function assertMcpRoute(result, route) {
  assert.ok(result && result.isError !== true, `已安装 MCP 路由 ${route} 执行失败`);
  assert.ok(result.content?.some(item => item.type === "text" && item.text.includes(`本次工具=${route}`)), "已安装 MCP 路由没有返回真实工具回执");
}

async function withMcp(entry, root, env, probe) {
  const child = spawn(process.execPath, [entry], { cwd: root, env, stdio: ["pipe", "pipe", "ignore"] });
  const lines = createInterface({ input: child.stdout });
  const closed = new Promise(resolve => child.once("close", resolve));
  const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
  child.on("error", () => lines.close());
  child.stdin.on("error", () => lines.close());
  const replies = lines[Symbol.asyncIterator]();
  const send = message => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  async function request(id, method, params) {
    send({ id, method, params });
    const reply = await replies.next();
    assert.equal(reply.done, false, `已安装 MCP 未响应 ${method}`);
    const message = JSON.parse(reply.value);
    assert.equal(message.id, id, `已安装 MCP 响应与 ${method} 不匹配`);
    assert.ok(!message.error, JSON.stringify(message.error));
    return message.result;
  }
  try { return await probe(request, send); }
  finally {
    lines.close();
    child.stdin.end();
    child.kill("SIGKILL");
    clearTimeout(timer);
    await closed;
  }
}

function uniqueNames(rows, key, label) {
  assert.ok(Array.isArray(rows), `公开目录缺少 ${label}`);
  const names = rows.map(item => typeof item === "string" ? item : item?.[key]);
  assert.ok(names.every(name => typeof name === "string" && name.trim()), `公开目录包含无效 ${label} ID`);
  assert.equal(new Set(names).size, names.length, `公开目录包含重复 ${label} ID`);
  return names.sort();
}

function inventoryEvidence(inventory, root, installed) {
  assert.equal((inventory.loadErrors || []).length, 0, "安装产物无法完整读取能力目录");
  const commands = uniqueNames(inventory.commands, "name", "CLI");
  const skillIds = uniqueNames(inventory.skills, "id", "Skill");
  const mcpTools = uniqueNames(inventory.mcpTools, "name", "MCP");
  assert.ok(commands.length && skillIds.length, "公开 CLI 或 Skill 目录为空");
  const skills = inventory.skills.map(item => {
    assert.ok(typeof item.resourcePath === "string" && path.isAbsolute(item.resourcePath), `Skill ${item.id} 缺少实际资源路径`);
    const file = fs.realpathSync(item.resourcePath);
    assert.ok(file.startsWith(installed + path.sep) || file.startsWith(root + path.sep), `Skill ${item.id} 资源越界`);
    assert.ok(fs.statSync(file).isFile(), `Skill ${item.id} 不是普通文件`);
    const bytes = fs.readFileSync(file);
    assert.ok(bytes.length && !bytes.includes(0), `Skill ${item.id} 正文为空或不是文本`);
    return { id: item.id, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  return { commands, skills, mcpTools };
}

function checkMcpCatalog(advertised, declared) {
  assert.deepEqual(uniqueNames(advertised, "name", "MCP 连接"), uniqueNames(declared, "name", "MCP 声明"), "真实 MCP 工具名与公开目录不同");
  const schemas = new Map(declared.map(item => [item.name, item.inputSchema]));
  for (const item of advertised) {
    assert.ok(item.inputSchema?.type === "object", `MCP 工具 ${item.name} 缺少对象参数 Schema`);
    assert.deepEqual(item.inputSchema, schemas.get(item.name), `MCP 工具 ${item.name} 的 Schema 与公开目录不同`);
  }
}

async function checkMcp(scenario, inventory, installed, root, env) {
  if (!scenario.mcp) {
    assert.equal(inventory.mcpTools.length, 0, "公开目录声明了未验收的 MCP 服务");
    return null;
  }
  const [route, input] = scenario.route;
  return withMcp(path.join(installed, scenario.mcp), root, env, async (request, send) => {
    const { serverInfo: server } = await request(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "wl-release-smoke", version: "1" } });
    send({ method: "notifications/initialized" });
    const { tools } = await request(2, "tools/list");
    assert.ok(server?.name && tools?.some(item => item.name === route), "已安装 MCP 入口没有完成初始化或列举路由工具");
    checkMcpCatalog(tools, inventory.mcpTools);
    assertMcpRoute(await request(3, "tools/call", { name: route, arguments: input }), route);
    return { name: server.name, version: server.version, tools: tools.length, route };
  });
}

function checkProbeStatus(scenario, status) {
  assert.ok(ACCEPTED_VALIDATION.includes(status.validationStatus), `fixture 验证状态异常：${status.validationStatus}`);
  const records = status.tools || status.records || [];
  const tool = records.find(record => record.kind === "tool-finished" && record.tool === scenario.tool);
  assert.ok(tool, `未观察到原检查器 ${scenario.tool} 的执行回执：${records.map(record => record.tool).join(",")}`);
  assert.equal(tool.executionStatus, "completed", "检查器必须完成 fixture 检查");
  assert.ok(ACCEPTED_VALIDATION.includes(tool.validationStatus), `检查器验证状态异常：${tool.validationStatus}`);
  assert.ok(tool.checks?.some(check => check.id === scenario.check && check.status === "passed"), `未实际通过预期检查：${scenario.check}`);
  assert.ok(tool.checkedFiles?.some(file => file.path === scenario.subject), `检查器未覆盖 fixture：${scenario.subject}`);
  return tool;
}

async function runProbe(key, scenario, installed, root, env) {
  const run = args => execute(process.execPath, [path.join(installed, "bin", scenario.bin), ...args], { cwd: root, env });
  initializeFixture(key, run);
  const { inventory } = JSON.parse(run(["protocol", "describe", "--json"]));
  const coverage = inventoryEvidence(inventory, root, installed);
  const request = (operation, data) => {
    writeFixture(root, "release-request.json", JSON.stringify({ operation, projectRoot: root, runId: RUN_ID, ...data }));
    const envelope = JSON.parse(run(["protocol", "request", "--input-file", "release-request.json"]));
    assert.equal(envelope.ok, true, JSON.stringify(envelope.error));
    assert.equal(envelope.result.runId, RUN_ID, `任务计划与回执必须使用同一 runId：${envelope.result.notice?.reason || envelope.result.reason || operation}`);
    return envelope.result;
  };
  const plan = request("task", { task: scenario.task, targets: [scenario.target] });
  assert.equal(plan.executionStatus, "not-executed");
  run([...scenario.args, "--run-id", RUN_ID]);
  const status = request("status");
  const tool = checkProbeStatus(scenario, status);
  const mcp = await checkMcp(scenario, inventory, installed, root, env);
  return { runId: RUN_ID, tool: tool.tool, execution: tool.executionStatus, checkerValidation: tool.validationStatus,
    validation: status.validationStatus, checks: tool.checks.length, requiredCheck: scenario.check, checkedFile: scenario.subject, coverage, mcp };
}

function checkInstalledUiRuntime(root, env) {
  const code = `
    import assert from 'node:assert/strict';
    import { statSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';
    import { installUiRuntimeProfile } from '@agile-team/wl-skills-ui';
    import { installUiRuntimeProfile as runtime } from '@agile-team/wl-skills-ui/runtime';
    assert.equal(typeof installUiRuntimeProfile, 'function');
    assert.equal(runtime, installUiRuntimeProfile);
    for (const suffix of ['/dist', '/dist/tokens.css']) {
      assert.ok(statSync(fileURLToPath(import.meta.resolve('@agile-team/wl-skills-ui' + suffix))).isFile());
    }
  `;
  execute(process.execPath, ["--input-type=module", "--eval", code], { cwd: root, env });
  return "passed";
}

function archiveConsumerLock(root, artifact, output, packageName) {
  const manifest = readJson(path.join(root, "package.json"));
  const lock = readJson(path.join(root, "package-lock.json"));
  const relative = `file:../${path.basename(artifact)}`;
  const locked = lock.packages?.[`node_modules/${packageName}`];
  assert.ok(locked?.resolved?.startsWith("file:") && lock.packages[""]?.dependencies?.[packageName], "消费者锁未使用指定 tarball");
  manifest.dependencies[packageName] = relative;
  lock.packages[""].dependencies[packageName] = relative;
  locked.resolved = relative;
  const files = { "package.json": manifest, "package-lock.json": lock };
  return Object.fromEntries(Object.entries(files).map(([name, value]) => {
    const file = `consumer/${name}`;
    const bytes = JSON.stringify(value, null, 2) + "\n";
    writeFixture(output, file, bytes);
    return [file, createHash("sha256").update(bytes).digest("hex")];
  }));
}

async function smokeInstall(context, artifact, scratch, output) {
  const root = path.join(scratch, "consumer");
  seedFixture(root, context.key);
  const npmrc = path.join(scratch, "empty.npmrc");
  const globalConfig = path.join(scratch, "global.npmrc");
  fs.writeFileSync(npmrc, "");
  fs.writeFileSync(globalConfig, "");
  const env = { ...process.env, WL_PROJECT_ROOT: root, npm_config_userconfig: npmrc, NPM_CONFIG_USERCONFIG: npmrc,
    npm_config_globalconfig: globalConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig };
  delete env.NODE_AUTH_TOKEN;
  delete env.NPM_TOKEN;
  npm(["install", artifact, "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", "--save-exact", "--registry", REGISTRY], { cwd: root, env });
  const installed = path.join(root, "node_modules", context.pkg.name);
  assert.equal(fs.realpathSync(installed), fs.realpathSync(root) + path.sep + path.join("node_modules", context.pkg.name), "必须独立安装 tarball");
  const pkg = readJson(path.join(installed, "package.json"));
  assert.equal(pkg.name, context.pkg.name);
  assert.equal(pkg.version, context.pkg.version);
  const dependencyLock = output ? archiveConsumerLock(root, artifact, output, pkg.name) : undefined;
  const support = path.join(installed, context.directory, "shared-support-check.cjs");
  assert.equal(JSON.parse(execute(process.execPath, [support], { cwd: root, env })).ok, true);
  const runtimeImport = context.key === "ui" ? checkInstalledUiRuntime(root, env) : undefined;
  const result = await runProbe(context.key, context.scenario, installed, fs.realpathSync(root), env);
  if (result.mcp) assert.equal(result.mcp.version, pkg.version);
  return { ...result, runtimeImport, dependencyLock };
}

function artifactDigests(bytes) {
  assert.ok(bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES, "tarball 体积超出验收范围");
  return {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    integrity: "sha512-" + createHash("sha512").update(bytes).digest("base64"),
  };
}

function checkCompatibility(context, artifact, sha256, scratch) {
  const { key, pkg, root } = context;
  const lock = path.join(scratch, "compatibility-lock.json");
  fs.writeFileSync(lock, JSON.stringify({ packages: [{ key, name: pkg.name, version: pkg.version, artifact, sha256 }] }));
  const runner = path.join(root, "scripts", "compatibility-check.cjs");
  const env = { ...process.env, WL_COMPAT_NODE20: "" };
  delete env.NODE_AUTH_TOKEN;
  delete env.NPM_TOKEN;
  const args = [runner, "--candidate-lock", lock, "--key", key, "--output", scratch];
  const result = JSON.parse(execute(process.execPath, args, { cwd: root, env, timeout: 600000 }));
  const summary = readJson(path.join(result.evidenceDirectory, "summary.json"));
  assert.equal(summary.candidate.sha256, sha256, "升级兼容回执未对应发布 tarball");
  assert.equal(summary.pass, true, "发布 tarball 的升级兼容检查未通过");
  const groups = summary.results.filter(group => group.pass).map(group => group.group);
  assert.deepEqual(groups, COMPATIBILITY_GROUPS, "发布 tarball 的升级兼容检查不完整");
  return { sha256, baselines: summary.baselines, groups };
}

async function stage(context, output, tag) {
  assertTag(context.pkg, tag);
  const sourceCommit = commitAt(context.root, tag);
  fs.mkdirSync(output);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "wl-release-stage-"));
  try {
    const { packResult, filesChecked } = pack(context, path.join(scratch, "cache"), output);
    assert.equal(path.basename(packResult.filename), packResult.filename, "非法 npm tarball 路径");
    const artifact = path.join(output, packResult.filename);
    const digests = artifactDigests(fs.readFileSync(artifact));
    assert.equal(digests.integrity, packResult.integrity, "npm pack SRI 与实际 tarball 不一致");
    const smoke = await smokeInstall(context, artifact, scratch, output);
    const compatibility = checkCompatibility(context, artifact, digests.sha256, scratch);
    assert.deepEqual(artifactDigests(fs.readFileSync(artifact)), digests, "验收期间 tarball 已变化");
    const receipt = { package: context.pkg.name, version: context.pkg.version, tag, sourceCommit, artifact: packResult.filename,
      ...digests, filesChecked, smoke, compatibility, toolchain: { node: process.version, npm: npm(["--version"], { cwd: context.root }).trim() } };
    fs.writeFileSync(path.join(output, RECEIPT), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    return receipt;
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}

async function boundedBytes(response, expected) {
  assert.ok(response.body, "registry 响应缺少内容");
  const pieces = [];
  let size = 0;
  for await (const bytes of response.body) {
    size += bytes.byteLength;
    assert.ok(size <= expected, "registry 响应超过验收大小");
    pieces.push(bytes);
  }
  return Buffer.concat(pieces, size);
}

async function verifyRegistry(receipt, { registry = REGISTRY, fetcher = globalThis.fetch } = {}) {
  const options = { redirect: "error", signal: globalThis.AbortSignal.timeout(20000) };
  const url = `${registry}/${encodeURIComponent(receipt.package)}/${encodeURIComponent(receipt.version)}`;
  const metadata = await fetcher(url, options);
  if (metadata.status === 404) return false;
  assert.ok(metadata.ok, `registry 查询失败（HTTP ${metadata.status}），无法判定版本不存在`);
  const value = JSON.parse((await boundedBytes(metadata, 1024 * 1024)).toString());
  assert.equal(value.name, receipt.package, "registry 返回的包名不同");
  assert.equal(value.version, receipt.version, "registry 返回的版本不同");
  assert.equal(value.dist?.integrity, receipt.integrity, "同版本 registry SRI 与验收产物不同");
  const tarball = new URL(value.dist.tarball);
  assert.equal(tarball.origin, new URL(registry).origin, "registry tarball 地址不在预期 registry");
  assert.ok(!tarball.username && !tarball.password, "registry tarball 地址不能含凭据");
  const downloaded = await fetcher(tarball, options);
  assert.ok(downloaded.ok, `registry tarball 下载失败（HTTP ${downloaded.status}）`);
  const result = artifactDigests(await boundedBytes(downloaded, receipt.bytes));
  assert.deepEqual(result, { bytes: receipt.bytes, integrity: receipt.integrity, sha256: receipt.sha256 }, "registry 下载的 tarball 与验收产物不同");
  return true;
}

async function publishVerified(receipt, artifact, { publish, fetcher, registry, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const identity = { bytes: receipt.bytes, integrity: receipt.integrity, sha256: receipt.sha256 };
  assert.deepEqual(artifactDigests(fs.readFileSync(artifact)), identity, "待发布 tarball 与验收回执不同");
  if (await verifyRegistry(receipt, { fetcher, registry })) return "already-published-identical";
  assert.deepEqual(artifactDigests(fs.readFileSync(artifact)), identity, "registry 查询后待发布 tarball 已变化");
  await publish(artifact);
  if (await waitForPublication(receipt, { fetcher, registry }, wait, [0, 1000, 2000, 4000, 8000])) return "published-and-verified";
  throw new Error("未能从 registry 读回该确切版本，请核对后重跑");
}

async function waitForPublication(receipt, registry, wait, [delay, ...remaining]) {
  if (delay === undefined) return false;
  if (delay) await wait(delay);
  if (await verifyRegistry(receipt, registry)) return true;
  return waitForPublication(receipt, registry, wait, remaining);
}

async function publishStage(context, output, tag) {
  assertTag(context.pkg, tag);
  const receipt = readJson(path.join(output, RECEIPT));
  assert.equal(receipt.package, context.pkg.name, "发布回执的包名不符");
  assert.equal(receipt.version, context.pkg.version, "发布回执的版本不符");
  assert.equal(receipt.tag, tag, "发布回执的标签不符");
  assert.equal(receipt.sourceCommit, commitAt(context.root, tag), "发布回执与当前标签提交不符");
  assertReleaseEvidence(context, receipt);
  for (const [file, digest] of Object.entries(receipt.smoke.dependencyLock)) {
    assert.equal(createHash("sha256").update(fs.readFileSync(path.join(output, file))).digest("hex"), digest, "消费者依赖锁与验收回执不一致");
  }
  assert.equal(path.basename(receipt.artifact), receipt.artifact, "发布回执 tarball 路径非法");
  const artifact = path.join(output, receipt.artifact);
  const state = await publishVerified(receipt, artifact, {
    publish(file) {
      const args = ["publish", file, "--access", "public", "--ignore-scripts", "--registry", REGISTRY];
      if (process.env.WL_NPM_PROVENANCE === "true") args.push("--provenance");
      npm(args, { cwd: context.root });
    },
  });
  const published = { ...receipt, state, registry: REGISTRY, registryBytesVerified: true };
  fs.writeFileSync(path.join(output, "publication.json"), JSON.stringify(published, null, 2) + "\n");
  return published;
}

function assertReleaseEvidence(context, receipt) {
  const { scenario, key } = context;
  const smoke = receipt.smoke || {};
  assert.equal(smoke.tool, scenario.tool, "发布回执缺少真实工具执行");
  assert.equal(smoke.execution, "completed", "发布回执检查器未完成");
  assert.ok(ACCEPTED_VALIDATION.includes(smoke.validation) && ACCEPTED_VALIDATION.includes(smoke.checkerValidation), "发布回执包含失败或未验证状态");
  assert.equal(smoke.requiredCheck, scenario.check, "发布回执缺少预期检查");
  assert.equal(smoke.checkedFile, scenario.subject, "发布回执缺少实际检查文件");
  if (scenario.mcp) assert.equal(smoke.mcp?.route, scenario.route[0], "发布回执缺少 MCP 工具调用");
  assertReleaseInventory(smoke);
  if (key === "ui") assert.equal(smoke.runtimeImport, "passed", "发布回执缺少 UI 消费者导入");
  assert.equal(receipt.compatibility?.sha256, receipt.sha256, "发布回执缺少该 tarball 的升级兼容证据");
  assert.deepEqual(receipt.compatibility?.groups, COMPATIBILITY_GROUPS, "发布回执的升级兼容检查不完整");
}

function assertReleaseInventory(smoke) {
  const commands = uniqueNames(smoke.coverage?.commands, "name", "CLI 证据");
  const skills = uniqueNames(smoke.coverage?.skills, "id", "Skill 证据");
  const mcpTools = uniqueNames(smoke.coverage?.mcpTools, "name", "MCP 证据");
  assert.ok(commands.length && skills.length && smoke.coverage.skills.every(item => /^[a-f0-9]{64}$/u.test(item.sha256)), "发布回执缺少完整目录证据");
  assert.equal(mcpTools.length, smoke.mcp?.tools ?? 0, "发布回执的 MCP 目录数量不一致");
  if (smoke.mcp) assert.ok(mcpTools.includes(smoke.mcp.route), "发布回执 MCP 工具不属于验收目录");
  const lockFiles = ["consumer/package-lock.json", "consumer/package.json"];
  assert.deepEqual(Object.keys(smoke.dependencyLock || {}).sort(), lockFiles, "发布回执缺少消费者依赖锁");
  assert.ok(Object.values(smoke.dependencyLock).every(digest => /^[a-f0-9]{64}$/u.test(digest)), "消费者依赖锁摘要无效");
}

async function main(args = process.argv.slice(2)) {
  const context = releaseContext(path.resolve(__dirname, ".."));
  if (args.length === 0) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "wl-pack-integrity-"));
    try {
      const { filesChecked } = pack(context, scratch);
      return { ...context.checked, package: context.pkg.name, version: context.pkg.version, payloadFilesChecked: filesChecked };
    } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  }
  const [action, output, tag] = args;
  if (args.length !== 3 || !["stage", "publish"].includes(action) || !output || !tag) {
    throw new Error("用法：node scripts/pack-integrity-check.cjs [stage|publish <evidence-directory> <tag>]");
  }
  const directory = path.resolve(output);
  return action === "stage" ? stage(context, directory, tag) : publishStage(context, directory, tag);
}

if (require.main === module) {
  main().then(value => console.log(JSON.stringify(value))).catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  });
}
module.exports = { main, smokeInstall, releaseContext, artifactDigests, publishVerified, checkPublicFiles, checkProbeStatus, assertReleaseEvidence, checkMcpCatalog };

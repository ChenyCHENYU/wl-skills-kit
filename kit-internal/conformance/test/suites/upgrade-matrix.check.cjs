"use strict";

/**
 * upgrade-matrix.check.cjs — 第三轮重建：真实旧安装的原地升级与组合矩阵
 *
 * 分组：
 *  A 桥接升级：npm 基线 kit@2.25.0 真实 init（单文件 .clinerules）→ 预发布版本桥接候选
 *    （隔离副本 bump 版本，覆盖正常 update 路径，不靠 --force 短路）→ 目录化迁移 →
 *    test/design 安装成功、外来内容与用户哨兵逐字节保留。
 *  B 外来/未知所有权单文件：候选 kit 不得迁移、不得删除；维持共享合并或明确阻断（零写入）。
 *  C 逐候选独立升级 + 每个基线包分别卸载的隔离性（含 UI 真实 init/update/clean 生命周期）。
 *  D 重复安装幂等与本地修改保护。
 *  E 历史已知冲突组合（npm kit@2.25.0 + npm test@0.27.0）固化为预期拒绝：
 *    非零退出、零写入、提示合并/迁移前置条件。
 * 所有写入类操作经 fixture-guard 校验目标属于本轮登记的临时目录。
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const test = require("node:test");
const root = require("../../support/workspace-root.cjs");
const { createFixtureGuard } = require("../../support/fixture-guard.cjs");

const PACKAGES = [
  { key: "kit", name: "wl-skills-kit", bin: "wl-skills.js", installer: true },
  { key: "ui", name: "wl-skills-ui", bin: "wl-ui.js", installer: false },
  { key: "bd", name: "wl-skills-bd", bin: "wl-skills-bd.js", installer: true },
  { key: "design", name: "wl-skills-design", bin: "wl-skills-design.js", installer: true },
  { key: "test", name: "wl-skills-test", bin: "wl-skills-test.js", installer: true },
];
const FROZEN_BASELINES = { kit: "2.25.0", ui: "1.15.0", bd: "0.32.0", design: "0.13.0", test: "0.27.0" };

const guard = createFixtureGuard("wl-upgrade-r3");

function run(command, args, cwd, timeout = 300000) {
  return spawnSync(command, args, { cwd, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 });
}

function ok(result, label) {
  assert.equal(result.status, 0, `${label} 失败：\n${result.stderr || ""}\n${(result.stdout || "").slice(-2500)}`);
  return result.stdout;
}

function projectBin(project, bin) {
  return path.join(project, "node_modules", ".bin", bin.replace(/\.js$/, ""));
}

function packCandidate(key, destination, versionOverride) {
  fs.mkdirSync(destination, { recursive: true });
  const source = path.join(root, `wl-skills-${key}`);
  if (!versionOverride) {
    return JSON.parse(ok(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", destination], source), `打包候选 ${key}`))[0];
  }
  const staging = guard.fixture(`bridge-${key}`);
  fs.cpSync(source, staging, { recursive: true, filter: (entry) => {
    const segments = entry.split(path.sep);
    return !segments.includes("node_modules") && !segments.includes(".git");
  } });
  const manifestPath = path.join(staging, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = versionOverride;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return JSON.parse(ok(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", destination], staging), `打包桥接候选 ${key}@${versionOverride}`))[0];
}

function newProject(name) {
  const project = guard.fixture(name);
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "upgrade-fixture", private: true }, null, 2));
  fs.writeFileSync(path.join(project, "AGENTS.md"), "# User-owned instructions\nPreserve this exact line.\n");
  return project;
}

function installBaseline(project, key, version) {
  ok(run("npm", ["install", `@agile-team/wl-skills-${key}@${version}`], project, 600000), `安装基线 ${key}@${version}`);
}

function installInto(project, key, extraArgs = [], label) {
  const cli = projectBin(project, PACKAGES.find((item) => item.key === key).bin);
  const taskLabel = label || `${key} init`;
  if (key === "bd") {
    const preview = run(process.execPath, [cli, "init", "--target", project, "--json"], project);
    assert.equal(preview.status, 0, preview.stderr);
    const plan = JSON.parse(preview.stdout);
    return ok(run(process.execPath, [cli, "init", "--target", project, "--json", "--confirm", "--plan-hash", plan.planHash], project), "bd init 确认");
  }
  if (key === "ui") {
    return ok(run(process.execPath, [cli, "init", "--project", project, "--editor", "agents-generic", "--profile", "native-element", "--skills-only", ...extraArgs], project), taskLabel);
  }
  const targetArgs = key === "design" ? ["--target", project] : [];
  return ok(run(process.execPath, [cli, "init", ...targetArgs, ...extraArgs], project), taskLabel);
}

function updateInto(project, key, extraArgs = []) {
  const cli = projectBin(project, PACKAGES.find((item) => item.key === key).bin);
  if (key === "bd") {
    const preview = run(process.execPath, [cli, "update", "--target", project, "--json"], project);
    assert.equal(preview.status, 0, preview.stderr);
    const plan = JSON.parse(preview.stdout);
    return ok(run(process.execPath, [cli, "update", "--target", project, "--json", "--confirm", "--plan-hash", plan.planHash], project), "bd update 确认");
  }
  if (key === "ui") return ok(run(process.execPath, [cli, "update", "--project", project, "--force", ...extraArgs], project), "ui update");
  const targetArgs = key === "design" ? ["--target", project] : [];
  return ok(run(process.execPath, [cli, "update", ...targetArgs, ...extraArgs], project), `${key} update`);
}

function cleanInto(project, key) {
  const cli = projectBin(project, PACKAGES.find((item) => item.key === key).bin);
  if (key === "bd") {
    const preview = run(process.execPath, [cli, "clean", "--target", project, "--json"], project);
    assert.equal(preview.status, 0, preview.stderr);
    const plan = JSON.parse(preview.stdout);
    return ok(run(process.execPath, [cli, "clean", "--target", project, "--json", "--confirm", "--plan-hash", plan.planHash], project), "bd clean 确认");
  }
  if (key === "ui") return ok(run(process.execPath, [cli, "clean", "--project", project], project), "ui clean");
  if (key === "design") return ok(run(process.execPath, [cli, "uninstall", "--target", project], project), "design uninstall");
  return ok(run(process.execPath, [cli, "clean"], project), `${key} clean`);
}

function clinerulesShape(project) {
  const target = path.join(project, ".clinerules");
  if (!fs.existsSync(target)) return "absent";
  return fs.statSync(target).isDirectory() ? "directory" : "regular-file";
}

function snapshotBytes(project, relative) {
  const full = path.join(project, relative);
  if (!fs.existsSync(full)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
}

function verifyAgentsAnchors(project, expectedKeys) {
  const agents = fs.readFileSync(path.join(project, "AGENTS.md"), "utf8");
  assert.ok(agents.includes("# User-owned instructions"), `用户哨兵必须保留；当前头部：${agents.slice(0, 120)}`);
  assert.ok(agents.includes("Preserve this exact line."), `用户哨兵第二行必须逐字节保留；当前头部：${agents.slice(0, 160)}`);
  for (const key of expectedKeys) assert.ok(agents.includes(`<!-- wl-skills-${key}:begin -->`), `缺少 ${key} 区块`);
  return agents;
}

test("A 桥接升级：基线 kit@2.25.0 真实旧安装 → 预发布候选正常 update → 迁移与共存", () => {
  const project = newProject("bridge-kit");
  installBaseline(project, "kit", FROZEN_BASELINES.kit);
  ok(run(process.execPath, [projectBin(project, "wl-skills.js"), "init"], project), "基线 kit init（旧产物）");
  assert.equal(clinerulesShape(project), "regular-file", "基线 2.25.0 应产生单文件 .clinerules");
  fs.appendFileSync(path.join(project, ".clinerules"), "\n# Team extra rule outside managed block\n");

  const tarball = packCandidate("kit", path.join(guard.root, "tarballs"), "2.25.1-bridge.0");
  ok(run("npm", ["install", path.join(guard.root, "tarballs", tarball.filename)], project, 600000), "安装桥接候选");
  verifyAgentsAnchors(project, ["kit"]);
  updateInto(project, "kit");
  verifyAgentsAnchors(project, ["kit"]);

  assert.equal(clinerulesShape(project), "directory", "正常 update（非 --force）应完成目录化迁移");
  assert.ok(fs.existsSync(path.join(project, ".clinerules", "wl-skills-kit.md")), "迁移后应有 kit 子规则");
  const migrated = fs.readFileSync(path.join(project, ".clinerules", "migrated-legacy-content.md"), "utf8");
  assert.ok(migrated.includes("# Team extra rule outside managed block"), "外来内容必须保留");

  ok(run(process.execPath, [path.join(root, "wl-skills-test", "bin", "wl-skills-test.js"), "init"], project), "迁移后 test 安装");
  verifyAgentsAnchors(project, ["kit", "test"]);
  assert.ok(fs.existsSync(path.join(project, ".clinerules", "wl-skills-test.md")));
  ok(run(process.execPath, [path.join(root, "wl-skills-design", "bin", "wl-skills-design.js"), "init", "--target", project], project), "迁移后 design 安装");
  verifyAgentsAnchors(project, ["kit", "design", "test"]);
}, 1200000);

test("B 外来单文件 .clinerules：候选 kit 不得迁移/删除外来文件", () => {
  const project = newProject("foreign-clinerules");
  const original = "# User-owned cline rules\nKeep mine.\n";
  fs.writeFileSync(path.join(project, ".clinerules"), original);
  const tarball = packCandidate("kit", path.join(guard.root, "tarballs"));
  ok(run("npm", ["install", path.join(guard.root, "tarballs", tarball.filename)], project, 600000), "安装候选 kit");
  const cli = projectBin(project, "wl-skills.js");
  const init = run(process.execPath, [cli, "init"], project);
  assert.equal(clinerulesShape(project), "regular-file", "外来单文件不得被目录化");
  const merged = fs.readFileSync(path.join(project, ".clinerules"), "utf8");
  assert.ok(merged.includes("# User-owned cline rules") && merged.includes("Keep mine."), "外来内容逐字节保留");
  if (init.status === 0) assert.ok(merged.includes("wl-skills-kit:begin"), "共享合并应保留外来内容并入 kit 区块");
  run(process.execPath, [cli, "clean"], project);
  const afterClean = fs.readFileSync(path.join(project, ".clinerules"), "utf8");
  assert.equal(afterClean.includes("wl-skills-kit:begin"), false, "clean 应移除本包区块");
  assert.ok(afterClean.includes("# User-owned cline rules") && afterClean.includes("Keep mine."), "clean 后外来内容保留");
}, 900000);

function installGroupWithHistoricalRejections(project, candidate) {
  const installers = PACKAGES.filter((item) => item.installer || item.key === "ui");
  for (const installer of installers) {
    const oldKitSingleFile = installer.key === "test" && candidate.key !== "kit" && clinerulesShape(project) === "regular-file";
    if (oldKitSingleFile) {
      // 历史已知冲突（基线 kit@2.25.0 单文件 .clinerules）：必须预期拒绝且零写入（E 组固化）
      const rejected = run(process.execPath, [projectBin(project, installer.bin), "init"], project);
      assert.notEqual(rejected.status, 0, "历史冲突组合的 test init 必须非零退出");
      assert.ok(/冲突|合并|clinerules/i.test(`${rejected.stdout}${rejected.stderr}`), "拒绝信息必须指明前置条件");
      continue;
    }
    installInto(project, installer.key, [], `候选=${candidate.key} 的 ${installer.key} init（clinerules=${clinerulesShape(project)}）`);
  }
  const candidateBlockedByLegacyKit = candidate.key === "test" && clinerulesShape(project) === "regular-file";
  if (candidateBlockedByLegacyKit) {
    const rejected = run(process.execPath, [projectBin(project, candidate.bin), "init"], project);
    assert.notEqual(rejected.status, 0, "历史冲突下候选 test init 必须预期拒绝");
  } else if (candidate.key !== "kit" || clinerulesShape(project) === "directory") {
    installInto(project, candidate.key);
  }
}

function uninstallEachBaseline(project, candidate, candidateInstalled) {
  const installers = PACKAGES.filter((item) => item.installer || item.key === "ui");
  for (const removable of installers.filter((item) => item !== candidate)) {
    cleanInto(project, removable.key);
    const agents = fs.readFileSync(path.join(project, "AGENTS.md"), "utf8");
    assert.equal(agents.includes(`<!-- wl-skills-${removable.key}:begin -->`), false, `${removable.key} 区块应随卸载移除`);
    assert.ok(agents.includes("Preserve this exact line."), `${removable.key} 卸载不得破坏用户哨兵`);
    if (candidateInstalled && candidate.key !== removable.key && candidate.installer) {
      assert.ok(agents.includes(`<!-- wl-skills-${candidate.key}:begin -->`), `卸载 ${removable.key} 不得波及候选区块`);
    }
  }
}

test("C 逐候选独立升级 + 每个基线包分别卸载的隔离性（含 UI 生命周期）", () => {
  const tarballs = path.join(guard.root, "tarballs");
  for (const candidate of PACKAGES) {
    const project = newProject(`iso-${candidate.key}`);
    for (const other of PACKAGES.filter((item) => item !== candidate)) installBaseline(project, other.key, FROZEN_BASELINES[other.key]);
    const candidateVersion = candidate.key === "kit" ? "2.25.1-bridge.0" : undefined;
    const packed = packCandidate(candidate.key, tarballs, candidateVersion);
    ok(run("npm", ["install", path.join(tarballs, packed.filename)], project, 600000), `安装候选 ${candidate.key}`);

    installGroupWithHistoricalRejections(project, candidate);
    const candidateInstalled = !(candidate.key === "test" && clinerulesShape(project) === "regular-file");
    const anchorKeys = ["kit", "bd", "design", ...(clinerulesShape(project) === "directory" ? ["test"] : [])];
    verifyAgentsAnchors(project, anchorKeys);
    uninstallEachBaseline(project, candidate, candidateInstalled);

    const describe = JSON.parse(ok(run(process.execPath, [projectBin(project, candidate.bin), "protocol", "describe"], project), "卸载后候选协议入口"));
    assert.equal(describe.package, `@agile-team/${candidate.name}`);
  }
}, 1800000);

test("D 重复安装幂等与本地修改保护（真实版本升级路径）", () => {
  const project = newProject("idempotent-kit");
  installBaseline(project, "kit", FROZEN_BASELINES.kit);
  ok(run(process.execPath, [projectBin(project, "wl-skills.js"), "init"], project), "基线 kit init");
  const first = snapshotBytes(project, ".wl-skills-manifest.json");
  ok(run(process.execPath, [projectBin(project, "wl-skills.js"), "init"], project), "重复 init");
  assert.equal(snapshotBytes(project, ".wl-skills-manifest.json"), first, "重复 init 后 manifest 应稳定");

  const managed = path.join(project, ".wl-skills", "standards", "02-code-structure.md");
  if (fs.existsSync(managed)) {
    const original = fs.readFileSync(managed, "utf8");
    fs.writeFileSync(managed, `${original}\n<!-- local edit -->\n`);
    const tarball = packCandidate("kit", path.join(guard.root, "tarballs"), "2.25.1-bridge.0");
    ok(run("npm", ["install", path.join(guard.root, "tarballs", tarball.filename)], project, 600000), "安装桥接候选");
    // kit 语义：正常 update 检测到本地改动 → 停止且零写入，提示显式 --force
    const guarded = run(process.execPath, [projectBin(project, "wl-skills.js"), "update"], project);
    assert.notEqual(guarded.status, 0, "存在本地改动时正常 update 必须停止");
    assert.ok(/本地改动/.test(`${guarded.stdout}${guarded.stderr}`), "必须明确提示本地改动");
    assert.ok(fs.readFileSync(managed, "utf8").includes("<!-- local edit -->"), "零写入：本地修改保持原样");
  }
}, 900000);

test("E 历史已知冲突组合固化为预期拒绝：npm kit@2.25.0 + npm test@0.27.0 先装", () => {
  const project = newProject("historical-conflict");
  installBaseline(project, "kit", FROZEN_BASELINES.kit);
  installBaseline(project, "test", FROZEN_BASELINES.test);
  ok(run(process.execPath, [projectBin(project, "wl-skills.js"), "init"], project), "基线 kit init");
  const kitClinerules = snapshotBytes(project, ".clinerules");
  const agentsBefore = snapshotBytes(project, "AGENTS.md");

  const testInit = run(process.execPath, [projectBin(project, "wl-skills-test.js"), "init"], project);
  assert.notEqual(testInit.status, 0, "历史冲突组合的 test init 必须非零退出");
  const output = `${testInit.stdout}${testInit.stderr}`;
  assert.ok(/冲突|合并|clinerules/i.test(output), "拒绝信息必须指明合并/迁移前置条件");
  assert.equal(snapshotBytes(project, ".clinerules"), kitClinerules, "拒绝时零写入（.clinerules 逐字节不变）");
  assert.equal(snapshotBytes(project, "AGENTS.md"), agentsBefore, "拒绝时零写入（AGENTS.md 逐字节不变）");
}, 900000);

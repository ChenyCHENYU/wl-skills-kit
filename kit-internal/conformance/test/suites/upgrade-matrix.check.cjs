"use strict";

/**
 * upgrade-matrix.check.cjs — 混合版本验证：一个候选新包 + 四个基线旧包
 *
 * 对每个包 P：本地打包候选（HEAD），从 npm 安装其余四包的已发布基线版本，
 * 验证共存安装、P 的公开协议入口、卸载任一基线包后 P 与其余包文件归属不受影响。
 * 基线版本取各仓库 package.json 当前声明版本；若 npm 上不存在该版本则显式跳过并记录。
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const test = require("node:test");
const root = require("../../support/workspace-root.cjs");

const PACKAGES = [
  { key: "kit", name: "wl-skills-kit", bin: "wl-skills.js", installer: true },
  { key: "ui", name: "wl-skills-ui", bin: "wl-ui.js", installer: false },
  { key: "bd", name: "wl-skills-bd", bin: "wl-skills-bd.js", installer: true },
  { key: "design", name: "wl-skills-design", bin: "wl-skills-design.js", installer: true },
  { key: "test", name: "wl-skills-test", bin: "wl-skills-test.js", installer: true },
];
const INSTALLER_ARGS = {
  kit: () => ["init"],
  design: (project) => ["init", "--target", project],
  test: () => ["init"],
};

function run(command, args, cwd, timeout = 180000) {
  return spawnSync(command, args, { cwd, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 });
}

function ok(result, label) {
  assert.equal(result.status, 0, `${label} 失败：\n${result.stderr || ""}\n${(result.stdout || "").slice(-2000)}`);
  return result.stdout;
}

function projectBin(project, bin) {
  return path.join(project, "node_modules", ".bin", bin.replace(/\.js$/, ""));
}

function installInto(key, project) {
  const cli = projectBin(project, PACKAGES.find((item) => item.key === key).bin);
  if (key === "bd") {
    const preview = run(process.execPath, [cli, "init", "--target", project, "--json"], project);
    assert.equal(preview.status, 0, preview.stderr);
    const plan = JSON.parse(preview.stdout);
    return ok(run(process.execPath, [cli, "init", "--target", project, "--json", "--confirm", "--plan-hash", plan.planHash], project), `bd init 确认`);
  }
  return ok(run(process.execPath, [cli, ...INSTALLER_ARGS[key](project)], project), `${key} init`);
}

function publishedKitUsesSingleFileClinerules(project) {
  const clinerules = path.join(project, ".clinerules");
  return fs.existsSync(clinerules) && !fs.statSync(clinerules).isDirectory();
}

function cleanInto(key, project) {
  const cli = projectBin(project, PACKAGES.find((item) => item.key === key).bin);
  if (key === "bd") {
    const preview = run(process.execPath, [cli, "clean", "--target", project, "--json"], project);
    assert.equal(preview.status, 0, preview.stderr);
    const plan = JSON.parse(preview.stdout);
    return ok(run(process.execPath, [cli, "clean", "--target", project, "--json", "--confirm", "--plan-hash", plan.planHash], project), "bd clean 确认");
  }
  const extra = key === "design" ? ["--target", project] : [];
  return ok(run(process.execPath, [cli, ...cleanCommand(key), ...extra], project), `卸载 ${key}`);
}

function cleanCommand(key) {
  if (key === "design") return ["uninstall"];
  return ["clean"];
}

function baselineVersion(name) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, `wl-skills-${name.key}`, "package.json"), "utf8"));
  return manifest.version;
}

function npmHasVersion(packageName, version) {
  const result = run("npm", ["view", `${packageName}@${version}`, "version"], os.tmpdir(), 60000);
  return result.status === 0 && result.stdout.trim() === version;
}

function verifyCandidateProtocol(project, candidate, label) {
  const cli = projectBin(project, candidate.bin);
  const described = JSON.parse(ok(run(process.execPath, [cli, "protocol", "describe"], project), `${label} 候选协议入口`));
  assert.equal(described.package, `@agile-team/${candidate.name}`);
  assert.deepEqual(described.operations.map((operation) => operation.id), ["route", "explain", "task", "status", "doctor-host"]);
  return described;
}

function verifyAgentsBlocks(project, installed, candidateKey) {
  const agents = fs.readFileSync(path.join(project, "AGENTS.md"), "utf8");
  assert.ok(agents.includes("# User-owned instructions"), "用户内容必须保留");
  for (const item of installed.filter((entry) => entry.installer)) {
    assert.ok(agents.includes(`<!-- wl-skills-${item.key}:begin -->`), `缺少 ${item.key} 的贡献区块`);
  }
  void candidateKey;
  return agents;
}

for (const candidate of PACKAGES) {
  test(`混合版本：候选 ${candidate.name}（HEAD 打包）+ 四包基线（npm 已发布版）`, (t) => {
    const baselines = PACKAGES.filter((item) => item !== candidate).map((item) => ({ ...item, version: baselineVersion(item) }));
    const missing = baselines.filter((item) => !npmHasVersion(`@agile-team/${item.name}`, item.version));
    if (missing.length > 0) {
      t.skip(`基线未发布于 npm：${missing.map((item) => `${item.name}@${item.version}`).join(", ")}；显式记录为未验证`);
      return;
    }

    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `wl-upgrade-${candidate.key}-`));
    try {
      const project = path.join(temporary, "project");
      fs.mkdirSync(project);
      fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "mixed-version-fixture", private: true }, null, 2));
      fs.writeFileSync(path.join(project, "AGENTS.md"), "# User-owned instructions\n");

      const packed = JSON.parse(ok(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary], path.join(root, `wl-skills-${candidate.key}`)), `打包候选 ${candidate.key}`))[0];
      const baselineSpecs = baselines.map((item) => `@agile-team/${item.name}@${item.version}`);
      ok(run("npm", ["install", ...baselineSpecs], project, 600000), "安装基线包");
      ok(run("npm", ["install", path.join(temporary, packed.filename)], project, 600000), "安装候选包");

      verifyCandidateProtocol(project, candidate, "安装后");
      const kitBaseline = baselines.find((item) => item.key === "kit");
      if (kitBaseline) installInto("kit", project);
      if (kitBaseline && publishedKitUsesSingleFileClinerules(project)) {
        t.skip(`已发布基线 kit@${kitBaseline.version} 仍以单文件 .clinerules 安装，会与 test 基线冲突（HEAD 已修复为目录形态）；待修复版 kit 发布后本组自动恢复执行。已知问题，不视为通过。`);
        return;
      }
      for (const baseline of baselines.filter((item) => item.installer && item.key !== "kit")) installInto(baseline.key, project);
      if (candidate.installer) installInto(candidate.key, project);
      verifyAgentsBlocks(project, [...baselines, candidate], candidate.key);

      const removable = baselines.find((item) => item.installer && item.key !== candidate.key);
      if (removable) {
        cleanInto(removable.key, project);
        const agents = fs.readFileSync(path.join(project, "AGENTS.md"), "utf8");
        assert.equal(agents.includes(`<!-- wl-skills-${removable.key}:begin -->`), false, "被卸载包的区块应移除");
        if (candidate.installer) assert.ok(agents.includes(`<!-- wl-skills-${candidate.key}:begin -->`), "候选包区块不得被波及");
        assert.ok(agents.includes("# User-owned instructions"), "用户内容不得被卸载破坏");
      }

      verifyCandidateProtocol(project, candidate, "卸载后");
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }, 1200000);
}

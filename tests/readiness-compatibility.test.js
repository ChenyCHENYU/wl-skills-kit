import {test} from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const repo = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
const cli = path.join(repo, "bin", 'wl-skills.js');
const key = 'kit';
const manifestName = key === "kit" ? ".wl-skills-manifest.json" : ".wl-skills-ui-manifest.json";
const selected = "src/views/Example/index.vue";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wl-${key}-ready-`));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({private: true, devDependencies: {[pkg.name]: pkg.version, vue: "^3.4.0"}}));
  fs.mkdirSync(path.join(root, "node_modules/@agile-team"), {recursive: true});
  fs.symlinkSync(repo, path.join(root, "node_modules", pkg.name), "dir");
  fs.mkdirSync(path.dirname(path.join(root, selected)), {recursive: true});
  fs.writeFileSync(path.join(root, selected), "<template><div>example</div></template>\n");
  const initialized = spawnSync(process.execPath, [cli, "init", ...(key === "ui" ? ["--editor", "all", "--profile", "native-element"] : [])], {cwd: root, encoding: "utf8", timeout: 30000});
  assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
  return root;
}

function request(root, transport, operation, input = {}) {
  let args;
  if (transport === "protocol") {
    const file = path.join(root, "request.json");
    fs.writeFileSync(file, JSON.stringify({operation, projectRoot: root, ...input}));
    args = ["protocol", "request", "--input-file", file, "--json"];
  } else {
    args = [operation, ...(input.task ? [input.task] : []), ...(input.targets || []).flatMap(target => ["--target", target]), ...(input.runId ? ["--run-id", input.runId] : []), "--json"];
  }
  const processResult = spawnSync(process.execPath, [cli, ...args], {cwd: root, encoding: "utf8", timeout: 30000});
  assert.equal(processResult.status, 0, processResult.stderr || processResult.stdout);
  const result = JSON.parse(processResult.stdout);
  if (transport === "protocol") {assert.equal(result.ok, true);return result.result;}
  return result;
}

function readiness(result, ready, status, runtime) {
  const decision = result.decision || result;
  assert.equal(result.ready, ready, "legacy ready must express effective admission");
  if (status) assert.equal(decision.status, status);
  if (result.status && result.decision) assert.equal(result.status, decision.status, "flattened task status agrees with its recorded decision");
  if (runtime) assert.equal(result.notice.runtime.status, runtime);
  if (result.integration) {
    assert.equal(result.integration.ready, ready);
    if (!ready) assert.deepEqual(result.integration.allowedExecutors, []);
  }
}

test("legacy 与公开协议：真实版本漂移拒绝且 task/status/route/explain 的 ready 一致", () => {
  const root = fixture();
  try {
    for (const transport of ["legacy", "protocol"]) {
      for (const operation of ["route", "explain", "task"]) {
        const input = {task: "检查当前 Vue 代码", targets: [selected], ...(operation === "task" ? {runId: `aligned-${transport}`} : {})};
        readiness(request(root, transport, operation, input), true, "baseline", "aligned");
      }
      readiness(request(root, transport, "status", {runId: `aligned-${transport}`}), true, "baseline", "aligned");
    }
    const manifest = path.join(root, manifestName);
    const bytes = fs.readFileSync(manifest);
    const old = JSON.parse(bytes);old.version = key === "kit" ? "2.30.0" : "1.19.0";
    fs.writeFileSync(manifest, JSON.stringify(old));
    for (const transport of ["legacy", "protocol"]) {
      for (const operation of ["route", "explain", "task"]) {
        const input = {task: "检查当前 Vue 代码", targets: [selected], ...(operation === "task" ? {runId: `drift-${transport}`} : {})};
        const result = request(root, transport, operation, input);
        readiness(result, false, "gap", "mismatch");
        assert.equal((result.decision || result).scope.status, "applicable");
        assert.ok((result.decision || result).gaps.some(gap => gap.code === "runtime-mismatch"));
      }
      readiness(request(root, transport, "status", {runId: `aligned-${transport}`}), false, "gap", "mismatch");
      readiness(request(root, transport, "status", {runId: `drift-${transport}`}), false, "gap", "mismatch");
    }
    fs.writeFileSync(manifest, bytes);
    readiness(request(root, "protocol", "task", {task: "检查当前 Vue 代码", targets: [selected], runId: "replanned"}), true, "baseline", "aligned");
    readiness(request(root, "protocol", "status", {runId: "replanned"}), true, "baseline", "aligned");
  } finally {fs.rmSync(root, {recursive: true, force: true});}
}, 20000);

test("规则资产存在不能替代适用scope、无歧义与计划新鲜度", () => {
  const root = fixture();
  try {
    for (const transport of ["legacy", "protocol"]) {
      readiness(request(root, transport, "route", {task: "帮我写诗"}), false, "not-applicable");
      readiness(request(root, transport, "route", {task: "闲聊"}), false, "needs-context");
      readiness(request(root, transport, "route", {task: key === "kit" ? "创建页面并自动修复" : "检查表格和表单", targets: [selected]}), false, "ambiguous");
      readiness(request(root, transport, "status", {runId: "absent"}), false);
    }
    const owned = key === "kit" ? path.join(root, ".wl-skills/standards/03-comments.md") : path.join(root, "node_modules", pkg.name);
    const bytes = key === "kit" ? fs.readFileSync(owned) : null;
    fs.unlinkSync(owned);
    for (const transport of ["legacy", "protocol"]) {
      const result = request(root, transport, "route", {task: "检查当前 Vue 代码", targets: [selected]});
      readiness(result, false, "gap");
      assert.ok((result.decision || result).missingInputs.length > 0);
    }
    if (key === "kit") fs.writeFileSync(owned, bytes);
    else fs.symlinkSync(repo, owned, "dir");
    readiness(request(root, "legacy", "task", {task: "检查当前 Vue 代码", targets: [selected], runId: "freshness"}), true, "baseline");
    fs.appendFileSync(path.join(root, selected), "<!-- modified after inspect plan -->\n");
    for (const transport of ["legacy", "protocol"]) {
      const result = request(root, transport, "status", {runId: "freshness"});
      assert.equal(result.planStale, true);readiness(result, false, "baseline");
    }
    fs.writeFileSync(path.join(root, ".wl-skills-scope.json"), JSON.stringify({schemaVersion: 1, projectType: "pc", packages: {[key]: false}}));
    for (const transport of ["legacy", "protocol"]) {
      const result = request(root, transport, "status", {runId: "freshness"});
      assert.equal(result.currentScope.status, "not-applicable");readiness(result, false);
      readiness(request(root, transport, "task", {task: "检查当前 Vue 代码", targets: [selected], runId: "disabled"}), false, "not-applicable");
    }
  } finally {fs.rmSync(root, {recursive: true, force: true});}
}, 20000);

test("未接入和移动项目即使有Vue任务对象也不准入，不新建任务记录", () => {
  for (const mobile of [false, true]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `wl-${key}-excluded-`));
    try {
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({private: true, devDependencies: {vue: "^3.4.0", ...(mobile ? {[pkg.name]: pkg.version, "@dcloudio/uni-app": "*"} : {})}}));
      for (const transport of ["legacy", "protocol"]) {
        const result = request(root, transport, "task", {task: "检查当前 Vue 代码", targets: [selected], runId: "excluded"});
        readiness(result, false, "not-applicable");
        assert.deepEqual(result.requiredRules, []);
      }
      assert.equal(fs.existsSync(path.join(root, key === "kit" ? ".wl-skills/runs" : ".wl-skills-ui/runs")), false);
    } finally {fs.rmSync(root, {recursive: true, force: true});}
  }
}, 20000);

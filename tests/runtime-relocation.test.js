import { afterEach, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repo = path.resolve(import.meta.dirname, "..");
const pkg = require("../package.json");
const runtime = require("../lib/task-integration");
const fixtures = [];
function fixture() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-runtime-relocation-")));
  fixtures.push(base);
  const project = path.join(base, "project");
  fs.mkdirSync(path.join(project, "src/views/Demo"), { recursive: true });
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ private: true, devDependencies: { [pkg.name]: pkg.version, vue: "^3.4.0" } }));
  fs.writeFileSync(path.join(project, "src/views/Demo/index.vue"), "<template><div>Demo</div></template>\n");
  return { base, project };
}
afterEach(() => fixtures.splice(0).forEach((base) => fs.rmSync(base, { recursive: true, force: true })));

test("moving a same-version executor cache makes historical evidence stale without reading its old resources", () => {
  const { base, project } = fixture();
  const runnerA = path.join(base, "runner-a");
  fs.mkdirSync(runnerA);
  for (const item of ["lib", "files", "bin", "package.json"]) fs.cpSync(path.join(repo, item), path.join(runnerA, item), { recursive: true });
  const oldRuntime = require(path.join(runnerA, "lib/task-integration.js"));
  const runId = "cache-relocation";
  const planned = oldRuntime.runTaskAction("task", { projectRoot: project, task: "检查当前 Vue 代码", targets: ["src/views/Demo/index.vue"], runId });
  expect(planned.ready).toBe(true);
  expect(planned.ruleSnapshot.targets.some((target) => target.startsWith(runnerA))).toBe(true);

  const read = fs.readFileSync;
  const oldReads = [];
  fs.readFileSync = function (file, ...args) {
    if (typeof file === "string" && path.resolve(file).startsWith(runnerA + path.sep)) oldReads.push(file);
    return read(file, ...args);
  };
  let status;
  try { status = runtime.runTaskAction("status", { projectRoot: project, runId }); }
  finally { fs.readFileSync = read; }
  expect(oldReads).toEqual([]);
  expect(status.runId).toBe(runId);
  expect(status.stale).toBe(true);
  expect(status.planStale).toBe(true);
  expect(status.validationStatus).toBe("stale");
  expect(status.ready).toBe(false);
  expect(status.evidenceDiagnostics.some((item) => item.code === "resource-evidence-unavailable")).toBe(true);
  expect(Array.isArray(status.scopeGaps)).toBe(true);
  expect(status.scopeGaps.some((gap) => gap.path === "src/views/Demo/index.vue")).toBe(true);
});

test("adding a project override invalidates a plan that previously used package-owned resources", () => {
  const { project } = fixture();
  const runId = "override-added";
  const planned = runtime.runTaskAction("task", { projectRoot: project, task: "检查当前 Vue 代码", targets: ["src/views/Demo/index.vue"], runId });
  expect(planned.ready).toBe(true);
  const original = runtime.runTaskAction("status", { projectRoot: project, runId });
  expect(original.planStale).toBe(false);
  const relative = ".wl-skills/standards/03-comments.md";
  fs.mkdirSync(path.dirname(path.join(project, relative)), { recursive: true });
  fs.copyFileSync(path.join(repo, "files", relative), path.join(project, relative));
  const stale = runtime.runTaskAction("status", { projectRoot: project, runId });
  expect(stale.planStale).toBe(true);
  expect(stale.stale).toBe(true);
  expect(stale.validationStatus).toBe("stale");
  expect(stale.ready).toBe(false);
  const replanned = runtime.runTaskAction("task", { projectRoot: project, task: "检查当前 Vue 代码", targets: ["src/views/Demo/index.vue"], runId: "override-replanned" });
  expect(replanned.ready).toBe(true);
  expect(runtime.runTaskAction("status", { projectRoot: project, runId: "override-replanned" }).planStale).toBe(false);
});

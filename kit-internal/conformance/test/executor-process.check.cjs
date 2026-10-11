const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { invokeCli } = require("../support/executor-process.cjs");

const helper = path.resolve(__dirname, "../support/executor-process.cjs");

function waitFor(predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() >= deadline) return reject(new Error("Timed out waiting for isolated executor evidence"));
      setTimeout(poll, 10);
    };
    poll();
  });
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}

function closeReceipt(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Executor driver failed to close after cancellation")), 3000);
    child.once("error", error => { globalThis.clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => { globalThis.clearTimeout(timer); resolve({ code, signal }); });
  });
}

function cleanupPid(root, name) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return;
  try { process.kill(Number(fs.readFileSync(file, "utf8")), "SIGKILL"); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
}

test("POSIX cancellation kills a TERM-resistant grandchild and closes inherited output pipes", {
  skip: process.platform === "win32" ? "POSIX process groups are verified here; Windows taskkill tree behavior needs a Windows runner" : false,
  timeout: 10000,
}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-executor-tree-"));
  fs.writeFileSync(path.join(root, "grandchild.cjs"), [
    "const fs = require('node:fs');",
    "process.on('SIGTERM', () => {});",
    "fs.writeFileSync('grandchild.pid', String(process.pid));",
    "setTimeout(() => fs.writeFileSync('leak-sentinel', 'orphan still running'), 350);",
    "setInterval(() => {}, 1000);",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "child.cjs"), [
    "const fs = require('node:fs');",
    "const { spawn } = require('node:child_process');",
    "fs.writeFileSync('child.pid', String(process.pid));",
    "spawn(process.execPath, ['grandchild.cjs'], { stdio: 'inherit' });",
    "setInterval(() => {}, 1000);",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "driver.cjs"), [
    `const { invokeCli } = require(${JSON.stringify(helper)});`,
    "const fs = require('node:fs');",
    `invokeCli({cli: ${JSON.stringify(path.join(root, "child.cjs"))}, args: [], projectRoot: ${JSON.stringify(root)}})`,
    "  .then(receipt => fs.writeFileSync('receipt.json', JSON.stringify(receipt)));",
  ].join("\n"));
  const driver = spawn(process.execPath, [path.join(root, "driver.cjs")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => {
    driver.kill("SIGKILL");
    cleanupPid(root, "child.pid");
    cleanupPid(root, "grandchild.pid");
    fs.rmSync(root, { recursive: true, force: true });
  });
  driver.stdout.resume();
  driver.stderr.resume();
  const closed = closeReceipt(driver);
  await waitFor(() => fs.existsSync(path.join(root, "grandchild.pid")));
  const pid = Number(fs.readFileSync(path.join(root, "grandchild.pid"), "utf8"));
  assert.equal(alive(pid), true);
  driver.kill("SIGTERM");
  assert.deepEqual(await closed, { code: 0, signal: null });
  const receipt = JSON.parse(fs.readFileSync(path.join(root, "receipt.json"), "utf8"));
  assert.equal(receipt.cancelled, true);
  assert.equal(receipt.exitCode, null);
  assert.ok(["SIGKILL", "SIGTERM"].includes(receipt.signal));
  assert.equal(receipt.outputTruncated, false);
  await waitFor(() => !alive(pid));
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(fs.existsSync(path.join(root, "leak-sentinel")), false);
});

test("executor output preserves UTF8 and JSON when characters span stream chunks", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-executor-utf8-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const expected = JSON.stringify({ description: "PC菜单页面" });
  const cli = path.join(root, "output.cjs");
  fs.writeFileSync(cli, [
    `const stdout = Buffer.from(${JSON.stringify(expected)});`,
    "const split = stdout.indexOf(Buffer.from('菜')) + 1;",
    "const stderr = Buffer.from('校验结束');",
    "process.stdout.write(stdout.subarray(0, split));",
    "process.stderr.write(stderr.subarray(0, 1));",
    "setTimeout(() => { process.stdout.write(stdout.subarray(split)); process.stderr.write(stderr.subarray(1)); }, 25);",
  ].join("\n"));
  const receipt = await invokeCli({ cli, args: [], projectRoot: root });
  assert.equal(receipt.stdout, expected);
  assert.deepEqual(JSON.parse(receipt.stdout), { description: "PC菜单页面" });
  assert.equal(receipt.stderr, "校验结束");
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.signal, null);
  assert.equal(receipt.cancelled, false);
});

test("stdout and stderr share one bounded byte budget and overflow cannot report success", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-executor-output-budget-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cli = path.join(root, "output.cjs");
  fs.writeFileSync(cli, "process.stdout.write(Buffer.alloc(200, 'a'));process.stderr.write(Buffer.alloc(200, 'b'));setInterval(() => {}, 1000);\n");
  await assert.rejects(invokeCli({ cli, args: [], projectRoot: root, maxOutputBytes: 300 }), { code: "executor-output-limit" });
});

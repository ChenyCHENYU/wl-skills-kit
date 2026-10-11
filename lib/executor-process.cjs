"use strict";

/** Reuse the package's original CLI without shell evaluation or orphaned cancellation. */
const { spawn } = require("node:child_process");
function invokeCli({ cli, args, projectRoot, maxOutputBytes = 4 * 1024 * 1024 }) {
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 64 * 1024 * 1024) throw new Error("执行器输出预算非法");
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(process.execPath, [cli, ...args], { cwd: projectRoot, detached: grouped, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [], stderr = [];
    let bytes = 0, cancelled = false, limited = false;
    const killTree = () => {
      if (!child.pid) return;
      if (grouped) { try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") child.kill("SIGKILL"); } }
      else {
        const { spawnSync } = require("node:child_process");
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { timeout: 5000, stdio: "ignore" });
        child.kill("SIGKILL");
      }
    };
    const stop = () => {
      cancelled = true;
      // Cancellation must clean descendants before an outer host can force-kill this CLI.
      killTree();
    };
    const onTerm = () => stop("SIGTERM");
    const onInt = () => stop("SIGINT");
    process.on("SIGTERM", onTerm); process.on("SIGINT", onInt);
    const cleanup = () => {
      process.removeListener("SIGTERM", onTerm); process.removeListener("SIGINT", onInt);
    };
    const collect = (chunk, channel) => {
      const retained = chunk.subarray(0, Math.max(0, maxOutputBytes - bytes));
      if (channel === "stdout") stdout.push(retained); else stderr.push(retained);
      bytes += chunk.length;
      if (bytes > maxOutputBytes && !limited) { limited = true; stop("SIGTERM"); }
    };
    child.stdout.on("data", chunk => collect(chunk, "stdout"));
    child.stderr.on("data", chunk => collect(chunk, "stderr"));
    child.once("error", error => {
      cleanup(); error.code = "executor-start-failed"; error.processId = child.pid; reject(error);
    });
    child.once("exit", killTree);
    child.once("close", (exitCode, signal) => {
      cleanup();
      if (limited) { const error = new Error("执行器输出超出预算，已终止，不能宣称检查完成"); error.code = "executor-output-limit"; error.processId = child.pid; reject(error); }
      else resolve({ exitCode, signal, processId: child.pid, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), outputTruncated: false, cancelled });
    });
  });
}
module.exports = { invokeCli };

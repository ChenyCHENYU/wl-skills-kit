"use strict";

const { spawn } = require("child_process");
const path = require("path");
const { resolveProjectPath } = require("./project-path");

const CLI = path.resolve(__dirname, "..", "bin", "wl-skills.js");
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 300000;

function runValidationCli(root, scanPath, typecheck = false, runId) {
  const safePath = path.relative(root, resolveProjectPath(root, scanPath, { allowRoot: true })).replace(/\\/g, "/") || ".";
  const pathArg = safePath.startsWith("-") ? `./${safePath}` : safePath;
  return new Promise((resolve, reject) => {
    const args = [CLI, "validate", pathArg, "--json"];
    if (typecheck) args.push("--typecheck");
    if (runId) args.push("--run-id", runId);
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: "0" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let diagnostic = "";
    let failure = null;
    const timeout = setTimeout(() => {
      failure = new Error("页面校验超过 5 分钟，已终止");
      child.kill();
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > MAX_OUTPUT_BYTES) {
        failure = new Error("页面校验结果超过 20 MB，请缩小扫描路径");
        child.kill();
      }
    });
    child.stderr.on("data", (chunk) => {
      diagnostic = (diagnostic + chunk).slice(-4000);
    });
    child.on("error", (error) => { failure = error; });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (failure) {
        reject(failure);
        return;
      }
      try {
        const result = JSON.parse(output);
        if (code !== 0 && code !== 1) throw new Error(`校验进程退出码 ${code}`);
        resolve(result);
      } catch (error) {
        reject(new Error(`页面校验未返回有效 JSON：${error.message}；${diagnostic}`));
      }
    });
  });
}

module.exports = { runValidationCli };

"use strict";

// 包内维护执行器到原 CLI 的映射；共享协议先验证计划与授权边界。
const path = require("node:path");
const { invokeCli } = require("./executor-process.cjs");

function invokeExecutor({ executor, parameters, projectRoot, runId }) {
  if (executor.id !== "validate") throw new Error(`Kit 未实现执行器：${executor.id}`);
  return invokeCli({
    cli: path.join(__dirname, "..", "bin", "wl-skills.js"),
    args: ["validate", "--project", projectRoot, `--target=${parameters.targets[0]}`, "--run-id", runId, "--json"],
    projectRoot,
  });
}

module.exports = { invokeExecutor };

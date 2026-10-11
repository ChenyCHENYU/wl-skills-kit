"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { resolveProjectPath } = require("./project-path");

/** Command-specific options prevent an ignored flag from silently widening a check. */
const VALUE_FLAGS = new Set(["--target", "--project", "--run-id"]);
const BOOLEAN_FLAGS = new Set(["--json", "--strict", "--pre-commit", "--typecheck", "--help", "-h"]);

function readFlag(args, index) {
  const argument = args[index];
  const flag = argument.split("=")[0];
  if (BOOLEAN_FLAGS.has(flag)) {
    if (argument !== flag) throw new Error(`${flag} 使用独立布尔开关；不接受未实现的等号值`);
    return {index, flag};
  }
  if (!VALUE_FLAGS.has(flag)) throw new Error(`validate 不支持参数 ${flag}，请查看该命令帮助`);
  const hasEquals = argument.includes("=");
  const value = hasEquals ? argument.slice(argument.indexOf("=") + 1) : args[index + 1];
  if (!value || !value.trim() || value.startsWith("-")) throw new Error(`${flag} 缺少有效值；未启动校验或写入记录`);
  return {index:hasEquals ? index : index + 1, flag, value};
}

function flagTargets(args) {
  const targets = [];
  for (let index = 0; index < args.length; index++) {
    if (!args[index].startsWith("-")) continue;
    const {index: nextIndex, flag, value} = readFlag(args,index);
    index = nextIndex;
    if (flag === "--target") targets.push(value);
  }
  return targets;
}

function validationScope(args, positionals) {
  if (!["validate", "validate-page"].includes(positionals[0])) return positionals[1] || "src/views";
  const targets = flagTargets(args);
  if (targets.length > 1 || positionals.length > 2) throw new Error("validate 只接受一个文件/目录范围，不静默忽略额外目标");
  if (targets.length && positionals[1] && targets[0] !== positionals[1]) throw new Error("validate 的位置目标与 --target 冲突");
  return targets[0] || positionals[1] || "src/views";
}

/** A page entry has an explicit owning directory; other files do not imply one. */
function validationPageScope(projectRoot, requestedTarget) {
  const target = resolveProjectPath(projectRoot, requestedTarget, { allowRoot: true });
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) return requestedTarget;
  if (!fs.statSync(target).isFile() || path.basename(target) !== "index.vue") {
    throw new Error("validate 文件目标只支持页面 index.vue；其他文件请明确指定所属页面目录，不自动扩大扫描范围");
  }
  return path.relative(projectRoot, path.dirname(target)).split(path.sep).join("/") || ".";
}

module.exports = {validationScope, validationPageScope};

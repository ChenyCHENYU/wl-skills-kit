"use strict";

const path = require("path");
const {
  applyStandardEnv,
  formatStandardEnvResult,
  scanStandardEnv,
  verifyStandardEnv,
} = require("../../lib/standard-env");
const { resolveProfile } = require("../../lib/standard-env/profiles");

function getProjectRoot() {
  return process.env.WL_PROJECT_ROOT
    ? path.resolve(process.env.WL_PROJECT_ROOT)
    : process.cwd();
}

function pickOptions(args = {}) {
  const options = {};
  for (const key of [
    "profile",
    "profileFile",
    "profileData",
    "moduleName",
    "localApi",
    "localPublic",
    "localMode",
    "localRoutes",
  ]) {
    if (args[key] !== undefined) options[key] = args[key];
  }
  return options;
}

async function handleStandardEnvScan() {
  return formatStandardEnvResult(scanStandardEnv(getProjectRoot()));
}

async function handleStandardEnvApply(args = {}) {
  const result = applyStandardEnv(getProjectRoot(), {
    ...pickOptions(args),
    confirmApply: args.confirmApply === true,
  });
  const suffix = args.confirmApply
    ? ""
    : "\n提示：默认只生成迁移计划；确认文件和地址后传 confirmApply: true。";
  return formatStandardEnvResult(result) + suffix;
}

async function handleStandardEnvVerify(args = {}) {
  const root = getProjectRoot();
  const options = pickOptions(args);
  const profile =
    options.profile || options.profileFile || options.profileData
      ? resolveProfile(options, root)
      : undefined;
  const validation = verifyStandardEnv(root, {
    profile,
    runBuild: args.runBuild === true,
  });
  return formatStandardEnvResult({
    action: "verify",
    root,
    status: validation.valid ? "standard" : "invalid",
    inspection: validation.inspection,
    profile,
    moduleName: validation.inspection.module.resolved,
    warnings: validation.warnings.map((item) => item.message),
    errors: validation.errors.map((item) => item.message),
    changes: [],
    validation,
  });
}

module.exports = {
  handleStandardEnvApply,
  handleStandardEnvScan,
  handleStandardEnvVerify,
  _internal: { getProjectRoot, pickOptions },
};

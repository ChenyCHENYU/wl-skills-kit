"use strict";

const path = require("path");
const {
  scanProjectEnv,
  applyEnvConfig,
  formatEnvResult,
} = require("../../lib/env-config");

function getProjectRoot() {
  return process.env.WL_PROJECT_ROOT
    ? path.resolve(process.env.WL_PROJECT_ROOT)
    : process.cwd();
}

function pickOptions(args = {}) {
  const options = {
    profile: args.profile || "walsin",
    projectType: args.projectType || "auto",
  };
  if (args.profileData) options.profileData = args.profileData;
  if (args.profileFile) options.profileFile = args.profileFile;
  if (args.prodPrefix) options.prodPrefix = args.prodPrefix;
  if (args.migrateViteConfig === false) options.migrateViteConfig = false;
  return options;
}

function asDryRunResult(plan) {
  return {
    ...plan,
    dryRun: true,
    applied: [],
    backupDir: "",
    stamp: "scan",
    reportPath: "",
  };
}

async function handleEnvScan(args = {}) {
  const root = getProjectRoot();
  const plan = scanProjectEnv(root, pickOptions(args));
  return formatEnvResult(asDryRunResult(plan));
}

async function handleEnvApply(args = {}) {
  const root = getProjectRoot();
  const confirmApply = args.confirmApply === true;
  const result = applyEnvConfig(root, {
    ...pickOptions(args),
    dryRun: !confirmApply,
  });
  const text = formatEnvResult(result);
  if (confirmApply) return text;
  return (
    text +
    "\n提示：wls_env_apply 默认 dry-run；确认写入前端 env 文件时必须传 confirmApply: true。"
  );
}

module.exports = {
  handleEnvScan,
  handleEnvApply,
  _internal: {
    getProjectRoot,
    pickOptions,
    asDryRunResult,
  },
};

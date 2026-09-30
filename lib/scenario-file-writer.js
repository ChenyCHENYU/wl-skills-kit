"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveProjectPath } = require("./project-path");

function prepareFiles(root, files, force, io) {
  return files.map((file) => {
    const target = resolveProjectPath(root, file.name);
    const original = io.existsSync(target) ? io.readFileSync(target, "utf8") : null;
    if (original !== null && original !== file.content && !force) {
      throw new Error(`输出已存在且内容不同：${file.name}；确认覆盖请加 --force`);
    }
    return { ...file, target, original, changed: original !== file.content };
  });
}

function makeParentDirectories(root, target, created, io) {
  const missing = [];
  let dir = path.dirname(target);
  while (dir !== root && !io.existsSync(dir)) {
    missing.push(dir);
    dir = path.dirname(dir);
  }
  for (const item of missing.reverse()) {
    io.mkdirSync(item);
    created.push(item);
  }
}

function cleanTemporary(files, created, io) {
  for (const file of files) {
    if (file.temp && io.existsSync(file.temp)) io.rmSync(file.temp, { force: true });
  }
  for (const dir of created.reverse()) {
    try { io.rmdirSync(dir); } catch { /* Only remove directories left empty by this run. */ }
  }
}

function restoreFiles(applied, io) {
  const failures = [];
  for (const file of applied.reverse()) {
    try {
      if (io.existsSync(file.target)) io.rmSync(file.target, { force: true });
      if (file.original !== null) io.renameSync(file.backup, file.target);
    } catch (error) {
      failures.push(`${file.name}: ${error.message}`);
    }
  }
  return failures;
}

function stageFiles(root, planned, created, io) {
  for (const file of planned.filter((item) => item.changed)) {
    makeParentDirectories(root, file.target, created, io);
    file.temp = `${file.target}.tmp.${crypto.randomUUID()}`;
    io.writeFileSync(file.temp, file.content, { flag: "wx" });
  }
}

function commitFiles(planned, applied, io) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  for (const file of planned.filter((item) => item.changed)) {
    if (file.original !== null) {
      file.backup = `${file.target}.bak.${stamp}-${crypto.randomUUID()}`;
      io.renameSync(file.target, file.backup);
    }
    applied.push(file);
    io.renameSync(file.temp, file.target);
  }
}

function writeScenarioFiles(rootInput, files, options = {}) {
  const root = path.resolve(rootInput);
  const io = options.fs || fs;
  const planned = prepareFiles(root, files, options.force === true, io);
  const created = [];
  const applied = [];
  try {
    stageFiles(root, planned, created, io);
    commitFiles(planned, applied, io);
  } catch (error) {
    const failures = restoreFiles(applied, io);
    cleanTemporary(planned, created, io);
    if (failures.length) throw new Error(`${error.message}；回滚失败：${failures.join("；")}`);
    throw error;
  }
  return planned.map((file) => path.relative(root, file.target).replace(/\\/g, "/"));
}

module.exports = { writeScenarioFiles };

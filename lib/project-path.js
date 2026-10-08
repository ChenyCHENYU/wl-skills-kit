"use strict";

const fs = require("fs");
const path = require("path");

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function assertLexicalProjectPath(projectRoot, target, allowRoot) {
  if (!isWithin(projectRoot, target) || (!allowRoot && target === projectRoot)) {
    throw new Error("路径越界：目标必须位于项目根目录内");
  }
}

function assertExistingSegmentsWithinRoot(projectRoot, target, allowRoot) {
  const realRoot = fs.realpathSync(projectRoot);
  const relative = path.relative(projectRoot, target);
  let current = projectRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      fs.lstatSync(current);
    } catch (error) {
      // ENOENT：目标尚不存在；ENOTDIR：某父级是普通文件（目标必然不存在）。
      // 两者都不构成路径逃逸，交由调用方的预检逻辑处理。
      if (error.code === "ENOENT" || error.code === "ENOTDIR") break;
      throw error;
    }
    const realCurrent = fs.realpathSync(current);
    if (!isWithin(realRoot, realCurrent) || (current === target && !allowRoot && realCurrent === realRoot)) {
      throw new Error("路径越界：目标通过符号链接指向项目外或项目根目录");
    }
  }
}

/** Resolve a project path without allowing `..` or an existing symlink to leave the project. */
function resolveProjectPath(root, input, options = {}) {
  const projectRoot = path.resolve(root);
  const target = path.resolve(projectRoot, input || ".");
  assertLexicalProjectPath(projectRoot, target, options.allowRoot === true);
  assertExistingSegmentsWithinRoot(projectRoot, target, options.allowRoot === true);
  return target;
}

function isSafeManagedPath(root, input) {
  if (typeof input !== "string" || !input || path.isAbsolute(input) || input.split(/[\\/]/).some((part) => part === ".." || part === "." || !part)) {
    return false;
  }
  try {
    resolveProjectPath(root, input);
    return true;
  } catch {
    return false;
  }
}

module.exports = { isWithin, resolveProjectPath, isSafeManagedPath };

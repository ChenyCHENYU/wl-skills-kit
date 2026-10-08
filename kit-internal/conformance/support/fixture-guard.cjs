"use strict";

/**
 * fixture-guard.cjs — 第三轮测试隔离护栏（单源快照）
 *
 * 所有安装、更新、清理、迁移和 task 写入类测试必须经 createFixtureGuard 创建的
 * fixture 执行；任何子进程写入前校验 cwd / JSON projectRoot / --target 的 realpath
 * 均属于本轮登记的临时目录，防止误写真实工作区。
 * 只约束测试 helper，不限制生产 CLI 在真实项目上的正常操作。
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function createFixtureGuard(prefix) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`)));
  const registered = new Set([root]);

  function register(child) {
    const real = fs.realpathSync(child);
    if (!isInside(real)) throw new Error(`fixture-guard：目录不属于本轮临时根 ${root}：${real}`);
    registered.add(real);
    return real;
  }

  function isInside(target) {
    const real = fs.realpathSync(target);
    if (real === root || registered.has(real)) return true;
    return [...registered].some((base) => real.startsWith(base + path.sep));
  }

  function fixture(name) {
    const child = fs.mkdtempSync(path.join(root, `${name}-`));
    return register(child);
  }

  function assertTarget(target, label) {
    const resolved = path.resolve(String(target));
    if (!fs.existsSync(resolved)) return resolved;
    if (!isInside(resolved)) {
      throw new Error(`fixture-guard 违规：${label} 目标 ${resolved} 不属于登记的临时目录；已阻止。真实工作区禁止任何安装/更新/清理/写入测试。`);
    }
    return resolved;
  }

  function guardRun(command, args, options = {}) {
    const cwd = path.resolve(options.cwd || process.cwd());
    assertTarget(cwd, "cwd");
    for (let index = 0; index < args.length - 1; index += 1) {
      const arg = args[index];
      const value = args[index + 1];
      if (["--target", "--project"].includes(arg)) assertTarget(path.resolve(cwd, value), arg);
    }
    const { input } = options;
    if (input && typeof input === "object" && input.projectRoot !== undefined) assertTarget(path.resolve(cwd, String(input.projectRoot)), "projectRoot");
    return { command, args: [...args], options: { ...options, cwd } };
  }

  return { root, fixture, register, assertTarget, guardRun, isInside };
}

module.exports = { createFixtureGuard };

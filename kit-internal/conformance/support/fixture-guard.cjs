"use strict";

/**
 * fixture-guard.cjs — 测试隔离护栏（单源快照）
 *
 * 所有安装、更新、清理、迁移和 task 写入类测试必须经本护栏执行：
 * 1) cwd / --target / --project / --input-file 内 JSON projectRoot 的目标，
 *    无论存在与否均先做词法校验（必须位于本轮登记的 mkdtemp 目录内）；
 * 2) 存在的目标再做 realpath 校验（拦截符号链接逃逸）；
 * 3) guardRun 在每次子进程执行前完成上述校验，违规即抛错、不执行命令。
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

  function knownBases() {
    return [root, ...registered];
  }

  function isInside(target) {
    const real = fs.realpathSync(target);
    return knownBases().some((base) => real === base || real.startsWith(base + path.sep));
  }

  function isLexicalInside(target) {
    return knownBases().some((base) => target === base || target.startsWith(base + path.sep));
  }

  function fixture(name) {
    const child = fs.mkdtempSync(path.join(root, `${name}-`));
    return register(child);
  }

  function assertTarget(target, label) {
    const resolved = path.resolve(String(target));
    if (!isLexicalInside(resolved)) {
      throw new Error(`fixture-guard 违规：${label} 目标 ${resolved} 不属于登记的临时目录（词法校验，存在与否均拦截）；已阻止。真实工作区禁止任何安装/更新/清理/写入测试。`);
    }
    // 最近存在祖先的真实路径校验：拦截符号链接逃逸及其尚不存在的子路径
    let current = resolved;
    while (!fs.existsSync(current)) current = path.dirname(current);
    const real = fs.realpathSync(current);
    if (!knownBases().some((base) => real === base || real.startsWith(base + path.sep))) {
      throw new Error(`fixture-guard 违规：${label} 目标经符号链接逃逸：${resolved} → ${real}；已阻止。`);
    }
    return resolved;
  }

  function inspectInputFile(cwd, file, label) {
    const full = path.resolve(cwd, file);
    assertTarget(full,'--input-file');
    if (!fs.existsSync(full)) return;
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch {
      return;
    }
    if (payload && typeof payload === "object" && payload.projectRoot !== undefined) {
      if(typeof payload.projectRoot !== 'string' || !payload.projectRoot.trim())throw new Error('fixture-guard：projectRoot 必须是非空字符串');
      assertTarget(path.resolve(cwd, payload.projectRoot), `${label}（--input-file 内 projectRoot）`);
    }
  }

  function inspectFlagTargets(cwd, args) {
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      const flag = arg.split('=',1)[0];
      if(!['--target','--project','--input-file'].includes(flag))continue;
      const equals = arg.includes('='); const value = equals ? arg.slice(flag.length + 1) : args[++index];
      if(typeof value !== 'string' || !value.trim() || value.startsWith('--'))throw new Error(`fixture-guard：${flag} 缺少非空值`);
      if(flag === '--input-file')inspectInputFile(cwd,value,'projectRoot');
      else assertTarget(path.resolve(cwd,value),flag);
    }
  }

  function guardRun(command, args, options = {}) {
    const cwd = path.resolve(options.cwd || process.cwd());
    assertTarget(cwd, "cwd");
    inspectFlagTargets(cwd, args);
    const { input } = options;
    if (input && typeof input === "object" && input.projectRoot !== undefined) {
      if(typeof input.projectRoot !== 'string' || !input.projectRoot.trim())throw new Error('fixture-guard：projectRoot 必须是非空字符串');
      assertTarget(path.resolve(cwd,input.projectRoot),"projectRoot");
    }
    return { command, args: [...args], options: { ...options, cwd } };
  }

  return { root, fixture, register, assertTarget, guardRun, isInside };
}

module.exports = { createFixtureGuard };

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_WAIT_MS = 30000;
const DEFAULT_STALE_MS = 120000;
const DEFAULT_POLL_MS = 100;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function removeStaleLock(lockPath, staleMs) {
  let stat;
  try {
    stat = fs.statSync(lockPath);
  } catch (error) {
    return error && error.code === "ENOENT";
  }
  const metadata = readLock(lockPath);
  const oldEnough = Date.now() - stat.mtimeMs > staleMs;
  if (!oldEnough && metadata && processIsAlive(metadata.pid)) return false;
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch (error) {
    return error && error.code === "ENOENT";
  }
}

function lockPathFor(key, lockRoot) {
  const digest = crypto.createHash("sha256").update(String(key)).digest("hex");
  return path.join(lockRoot, `${digest}.lock`);
}

function createLockFile(lockPath, token) {
  const descriptor = fs.openSync(lockPath, "wx");
  try {
    fs.writeFileSync(descriptor, JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }));
  } finally {
    fs.closeSync(descriptor);
  }
}

async function attemptAcquire(context) {
  if (Date.now() - context.startedAt > context.waitMs) {
    throw new Error(`等待项目写锁超时（${context.waitMs}ms），请确认没有其他写入进程正在执行`);
  }
  try {
    createLockFile(context.lockPath, context.token);
    return { lockPath: context.lockPath, token: context.token };
  } catch (error) {
    if (!error || error.code !== "EEXIST") throw error;
    if (!removeStaleLock(context.lockPath, context.staleMs)) await delay(context.pollMs);
    return attemptAcquire(context);
  }
}

function acquireFileLock(key, options = {}) {
  const lockRoot = options.lockRoot || path.join(os.tmpdir(), "wl-skills-kit-locks");
  fs.mkdirSync(lockRoot, { recursive: true });
  return attemptAcquire({
    lockPath: lockPathFor(key, lockRoot),
    token: crypto.randomUUID(),
    startedAt: Date.now(),
    waitMs: options.waitMs ?? DEFAULT_WAIT_MS,
    staleMs: options.staleMs ?? DEFAULT_STALE_MS,
    pollMs: options.pollMs ?? DEFAULT_POLL_MS,
  });
}

function releaseFileLock(lock) {
  const metadata = readLock(lock.lockPath);
  if (!metadata || metadata.token !== lock.token) return;
  try {
    fs.unlinkSync(lock.lockPath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
}

async function withFileLock(key, action, options) {
  const lock = await acquireFileLock(key, options);
  try {
    return await action();
  } finally {
    releaseFileLock(lock);
  }
}

module.exports = {
  acquireFileLock,
  releaseFileLock,
  withFileLock,
  _internal: { lockPathFor, processIsAlive, removeStaleLock },
};

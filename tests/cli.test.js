import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "bin", "wl-skills.js");

function runCli(args, opts = {}) {
  return spawnSync("node", [CLI, ...args], {
    cwd: opts.cwd || os.tmpdir(),
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 15000,
  });
}

function makeIsolatedDir() {
  // 临时空目录：避免 CLI 实际写入污染仓库
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wl-skills-cli-test-"));
  return tmp;
}

describe("CLI 参数防护（A1）", () => {
  it("--help 应正常退出（exit 0）并打印用法", () => {
    const res = runCli(["--help"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/wl-skills-kit v/);
    expect(res.stdout).toMatch(/用法:/);
  });

  it("-h 等价于 --help", () => {
    const res = runCli(["-h"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/用法:/);
  });

  it("未知 flag --version 应退出非零并提示未知选项（不再误走 init）", () => {
    const dir = makeIsolatedDir();
    const res = runCli(["--version"], { cwd: dir });
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/未知选项/);
    // 防止误装：临时目录内不应被写入任何 .github / src / demo
    const after = fs.readdirSync(dir);
    expect(after.length).toBe(0);
    fs.rmdirSync(dir);
  });

  it("未知命令 foo 应退出非零并提示未知命令", () => {
    const dir = makeIsolatedDir();
    const res = runCli(["foo"], { cwd: dir });
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/未知命令/);
    const after = fs.readdirSync(dir);
    expect(after.length).toBe(0);
    fs.rmdirSync(dir);
  });

  it("check 命令在临时空目录可正常运行（不写文件）", () => {
    const dir = makeIsolatedDir();
    const res = runCli(["check"], { cwd: dir });
    // check 命令是只读的，无论工具链是否齐全都会退出
    expect(typeof res.status).toBe("number");
    expect(res.stdout).toMatch(/wl-skills-kit v/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("--dry-run 单独使用（无命令）默认 init 但不实际写入", () => {
    const dir = makeIsolatedDir();
    const res = runCli(["--dry-run"], { cwd: dir });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/dry-run/);
    // dry-run 模式不应实际写入文件
    const after = fs.readdirSync(dir);
    expect(after.length).toBe(0);
    fs.rmdirSync(dir);
  });
});

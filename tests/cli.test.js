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
    timeout: opts.timeout || 15000,
  });
}

function makeIsolatedDir() {
  // 临时空目录：避免 CLI 实际写入污染仓库
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wl-skills-cli-test-"));
  return tmp;
}

function makeLegacyEnvProject() {
  const dir = makeIsolatedDir();
  fs.mkdirSync(path.join(dir, "public"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "views", "safe"), { recursive: true });
  fs.mkdirSync(path.join(dir, "vite", "plugins"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "legacy-safe",
      scripts: { dev: "vite --mode dev -- --module=safe" },
      devDependencies: { vite: "4.4.9", typescript: "^4.5.4" },
    }),
  );
  fs.writeFileSync(path.join(dir, ".env"), "ENV_MOCK=dev\n");
  fs.writeFileSync(
    path.join(dir, ".env.dev"),
    "ENV=dev\nENV_ANY_REPORT_SECRET_KEY=test\nTOKEN_LOCALSTORAGE=true\n",
  );
  fs.writeFileSync(
    path.join(dir, "public", "env-dev.json"),
    JSON.stringify({ OPTION: { module: "safe" } }),
  );
  fs.writeFileSync(
    path.join(dir, "vite.config.ts"),
    [
      'const webMap = { dev: "http://172.28.99.172:81" };',
      'const webApiMap = { dev: "http://172.28.99.172:81" };',
      'const baseApi = "/dev-api";',
      'const proxy = { [baseApi]: { target: "http://172.28.99.172:9000", rewrite: (p) => p.replace(/^\\/dev-api/, "") } };',
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(dir, "vite", "plugins", "type.ts"),
    'export interface PluginOption { env: "dev" }\n',
  );
  fs.writeFileSync(
    path.join(dir, "vite", "plugins", "index.ts"),
    "export default async function createVitePlugins() { return []; }\n",
  );
  return dir;
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

  it("check 应识别 .wl-skills/skills/sync/env.local.json", () => {
    const dir = makeIsolatedDir();
    const envDir = path.join(dir, ".wl-skills", "skills", "sync");
    fs.mkdirSync(envDir, { recursive: true });
    fs.writeFileSync(
      path.join(envDir, "env.local.json"),
      JSON.stringify({ gatewayPath: "https://example.com/uat-api", token: "abc.def", sysAppNo: "app" }),
      "utf8",
    );

    const res = runCli(["check"], { cwd: dir });
    expect(res.stdout).toMatch(/MCP env\.local\.json/);
    expect(res.stdout).toMatch(/已填写 gatewayPath\/token/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("check 应识别新版 token 占位值", () => {
    const dir = makeIsolatedDir();
    const envDir = path.join(dir, ".wl-skills", "skills", "sync");
    fs.mkdirSync(envDir, { recursive: true });
    fs.writeFileSync(
      path.join(envDir, "env.local.json"),
      JSON.stringify({
        gatewayPath: "https://example.com/uat-api",
        token: "请填入实际登录凭据（纯 JWT，不含 bearer 前缀）",
        sysAppNo: "app",
      }),
      "utf8",
    );

    const res = runCli(["check"], { cwd: dir });
    expect(res.stdout).toMatch(/MCP env\.local\.json/);
    expect(res.stdout).toMatch(/存在但仍含占位值/);
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

  it("export 应从 .wl-skills/reports 导出 xlsx", () => {
    const dir = makeIsolatedDir();
    const reportsDir = path.join(dir, ".wl-skills", "reports");
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportsDir, "SYS_MENU_INFO.md"),
      "| 名称 | 路径 |\n|---|---|\n| 首页 | /home |\n",
      "utf8",
    );

    const res = runCli(["export"], { cwd: dir });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/已导出/);
    expect(
      fs.existsSync(path.join(reportsDir, "exports", "wl-skills-sys-export.xlsx")),
    ).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("CLI standard-env", () => {
  it("update 自动清理退役 env-config 并安装新 Skill", () => {
    const dir = makeIsolatedDir();
    const oldSkillDir = path.join(dir, ".wl-skills", "skills", "ops", "env-config");
    fs.mkdirSync(oldSkillDir, { recursive: true });
    fs.writeFileSync(path.join(oldSkillDir, "SKILL.md"), "# old env skill\n");
    fs.writeFileSync(path.join(oldSkillDir, "USAGE.md"), "# old env usage\n");
    fs.writeFileSync(
      path.join(dir, ".wl-skills-manifest.json"),
      JSON.stringify({ version: "2.12.3", files: {} }),
    );

    const res = runCli(["update"], { cwd: dir, timeout: 60000 });
    expect(res.status).toBe(0);
    expect(fs.existsSync(oldSkillDir)).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          dir,
          ".wl-skills",
          "skills",
          "ops",
          "standard-env-config",
          "SKILL.md",
        ),
      ),
    ).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("旧 env 命令停止写入并提示新入口", () => {
    const dir = makeIsolatedDir();
    const res = runCli(["env", "apply", "--apply"], { cwd: dir });
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/standard-env/);
    expect(fs.readdirSync(dir)).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("standard-env scan 只读识别旧直连项目", () => {
    const dir = makeLegacyEnvProject();
    const res = runCli(["standard-env", "scan"], { cwd: dir });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/legacy-direct/);
    expect(fs.existsSync(path.join(dir, ".env.dev"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("standard-env plan 未选择 Profile 时阻断", () => {
    const dir = makeLegacyEnvProject();
    const res = runCli(["standard-env", "plan"], { cwd: dir });
    expect(res.status).not.toBe(0);
    expect(res.stdout).toMatch(/--profile walsin/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("standard-env apply 显式确认后迁移并验证", () => {
    const dir = makeLegacyEnvProject();
    const res = runCli(
      [
        "standard-env",
        "apply",
        "--profile",
        "walsin",
        "--module-name",
        "safe",
        "--confirm",
      ],
      { cwd: dir },
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/静态验证：通过/);
    expect(fs.existsSync(path.join(dir, ".env.dev"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "vite", "config", "server.ts"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "bin", "wl-skills.js");

// init/update/clean 会启动真实 CLI；Windows 全量并行回归时允许合理的进程启动时间。
vi.setConfig({ testTimeout: 30000 });

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

  it("init 创建本地配置和 gitignore，但 manifest 只管理 example", () => {
    const dir = makeIsolatedDir();
    const res = runCli(["init"], { cwd: dir, timeout: 60000 });
    expect(res.status).toBe(0);
    const localRel = ".wl-skills/skills/sync/env.local.json";
    const exampleRel = ".wl-skills/skills/sync/env.example.json";
    expect(fs.existsSync(path.join(dir, localRel))).toBe(true);
    expect(fs.readFileSync(path.join(dir, ".gitignore"), "utf8")).toContain(localRel);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, ".wl-skills-manifest.json"), "utf8"));
    expect(manifest.files[localRel]).toBeUndefined();
    expect(manifest.files[exampleRel]).toBeTruthy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("update 保留已填写的本地 token", () => {
    const dir = makeIsolatedDir();
    const envDir = path.join(dir, ".wl-skills", "skills", "sync");
    fs.mkdirSync(envDir, { recursive: true });
    const localPath = path.join(envDir, "env.local.json");
    fs.writeFileSync(localPath, JSON.stringify({
      gatewayPath: "https://internal.example/uat-api",
      token: "keep-me",
      sysAppNo: "mdata",
    }));
    fs.writeFileSync(
      path.join(dir, ".wl-skills-manifest.json"),
      JSON.stringify({ version: "2.12.3", files: {} }),
    );
    const res = runCli(["update"], { cwd: dir, timeout: 60000 });
    expect(res.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(localPath, "utf8")).token).toBe("keep-me");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("clean 不删除本地凭据配置", () => {
    const dir = makeIsolatedDir();
    expect(runCli(["init"], { cwd: dir, timeout: 60000 }).status).toBe(0);
    const localPath = path.join(dir, ".wl-skills", "skills", "sync", "env.local.json");
    const config = JSON.parse(fs.readFileSync(localPath, "utf8"));
    config.token = "keep-after-clean";
    fs.writeFileSync(localPath, JSON.stringify(config));
    expect(runCli(["clean"], { cwd: dir, timeout: 60000 }).status).toBe(0);
    expect(JSON.parse(fs.readFileSync(localPath, "utf8")).token).toBe("keep-after-clean");
    fs.rmSync(dir, { recursive: true, force: true });
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

describe("CLI 独立 API 契约", () => {
  it("init 默认预览，confirm 后写入并可严格验证和渲染", () => {
    const dir = makeIsolatedDir();
    const common = [
      "contract", "init",
      "--contract-id", "mdm-task",
      "--service", "mdm",
      "--resource", "mdmTask",
      "--module", "task",
      "--permission-prefix", "mdm_task",
      "--output", "contracts/task.json",
    ];
    const preview = runCli(common, { cwd: dir });
    expect(preview.status).toBe(0);
    expect(fs.existsSync(path.join(dir, "contracts", "task.json"))).toBe(false);
    const apply = runCli([...common, "--confirm"], { cwd: dir });
    expect(apply.status).toBe(0);
    const file = path.join(dir, "contracts", "task.json");
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    value.completion.contractStatus = "confirmed";
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
    const validate = runCli(["contract", "validate", "--input", "contracts/task.json", "--strict", "--json"], { cwd: dir });
    expect(validate.status).toBe(0);
    expect(JSON.parse(validate.stdout).ok).toBe(true);
    const render = runCli(["contract", "render", "--input", "contracts/task.json", "--output", "contracts/api.md", "--strict", "--confirm"], { cwd: dir });
    expect(render.status).toBe(0);
    expect(fs.readFileSync(path.join(dir, "contracts", "api.md"), "utf8")).toMatch(/wl-api-contract/);
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

describe("CLI component", () => {
  function makeComponentProject() {
    const dir = makeIsolatedDir();
    fs.mkdirSync(path.join(dir, "src", "views", "demo"), { recursive: true });
    fs.mkdirSync(path.join(dir, "src", "types"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "types", "page.ts"), "export type Page = unknown\n");
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        dependencies: {
          vue: "3.2.0",
          "vue-router": "4.0.0",
          "element-plus": "2.0.0",
          "@element-plus/icons-vue": "2.0.0",
          "@jhlc/common-core": "3.1.0",
          "@jhlc/types": "3.1.0",
        },
      }),
    );
    return dir;
  }

  it("ensure 必须先预览 planHash，再确认按需落盘", () => {
    const dir = makeComponentProject();
    const target = path.join(dir, "src", "components", "local", "c_formModal");
    const preview = runCli(["component", "ensure", "--components", "c_formModal"], { cwd: dir });
    expect(preview.status).toBe(0);
    expect(fs.existsSync(target)).toBe(false);
    const planHash = preview.stdout.match(/planHash:\s*([a-f0-9]{64})/)?.[1];
    expect(planHash).toBeTruthy();

    const apply = runCli([
      "component",
      "ensure",
      "--components",
      "c_formModal",
      "--confirm",
      "--plan-hash",
      planHash,
    ], { cwd: dir });
    expect(apply.status).toBe(0);
    expect(fs.existsSync(path.join(target, "index.vue"))).toBe(true);
    expect(fs.existsSync(path.join(target, "README.md"))).toBe(false);

    const check = runCli(["component", "check", "--components", "c_formModal"], { cwd: dir });
    expect(check.status).toBe(0);
    expect(check.stdout).toMatch(/可复用/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("--all 一次落盘全部 7 个组件且不包含已退役组件", () => {
    const dir = makeComponentProject();
    const preview = runCli(["component", "ensure", "--all"], { cwd: dir });
    expect(preview.status).toBe(0);
    const planHash = preview.stdout.match(/planHash:\s*([a-f0-9]{64})/)?.[1];
    expect(planHash).toBeTruthy();

    const apply = runCli([
      "component", "ensure", "--all", "--confirm", "--plan-hash", planHash,
    ], { cwd: dir });
    expect(apply.status).toBe(0);
    expect(fs.existsSync(path.join(dir, "src/components/local/c_formModal/index.vue"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/components/global/C_TagStatus/index.vue"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/components/global/C_RightToolbar"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "src/components/global/C_SvgIcon"))).toBe(false);

    const check = runCli(["component", "check", "--all"], { cwd: dir });
    expect(check.status).toBe(0);
    expect((check.stdout.match(/: 可复用 →/g) || [])).toHaveLength(7);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("已有同名项目组件时直接复用且不覆盖", () => {
    const dir = makeComponentProject();
    const target = path.join(dir, "src", "components", "local", "c_formModal", "index.vue");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "custom", "utf8");
    const result = runCli(["component", "ensure", "--components", "c_formModal"], { cwd: dir });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/项目实现（保留）/);
    expect(fs.readFileSync(target, "utf8")).toBe("custom");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

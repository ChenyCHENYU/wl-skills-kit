import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, "..");
const standardEnv = require(path.join(ROOT, "lib", "standard-env"));
const standardEnvTemplates = require(path.join(
  ROOT,
  "lib",
  "standard-env",
  "templates.js",
));
const { resolveProfile, validateProfile } = require(path.join(
  ROOT,
  "lib",
  "standard-env",
  "profiles.js",
));

function makeLegacyProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-standard-env-test-"));
  fs.mkdirSync(path.join(root, "public"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "views", "safe"), { recursive: true });
  fs.mkdirSync(path.join(root, "vite", "plugins"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "legacy-app",
        scripts: {
          dev: "vite --mode dev -- --module=ehs --isLocal",
          build: "vite build --mode dev -- --module=ehs --isUnionSub=true",
        },
        devDependencies: { typescript: "^4.5.4", vite: "4.4.9" },
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(path.join(root, ".env"), "ENV_MOCK=dev\n");
  fs.writeFileSync(
    path.join(root, ".env.dev"),
    [
      "ENV=dev",
      "ENV_ANY_REPORT_SERVER=http://172.18.247.123:8096",
      "ENV_ANY_REPORT_SECRET_KEY=keep-secret",
      "TOKEN_LOCALSTORAGE=true",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(root, ".env.uat"), "ENV=uat\n");
  fs.writeFileSync(path.join(root, ".env.sit"), "");
  fs.writeFileSync(path.join(root, ".env.prod"), "ENV=prod\n");
  fs.writeFileSync(
    path.join(root, "src", "main.ts"),
    [
      '// Mock 数据',
      'if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKJS === "true") {',
      '  import("@/mock");',
      "}",
      'import MainCore from "./main-core";',
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "public", "env-dev.json"),
    JSON.stringify({ OPTION: { module: "safe", webUrl: "http://172.18.248.205" } }),
  );
  fs.writeFileSync(
    path.join(root, "vite.config.ts"),
    [
      'const webApiMap = { dev: "http://172.28.99.172:81", uat: "http://172.28.99.172:81", prod: "https://172.18.248.205/prod-api" };',
      'const webMap = { dev: "http://172.28.99.172:81", uat: "http://172.28.99.172:81", prod: "https://172.18.248.205" };',
      'const baseApi = "/dev-api";',
      "const proxy = {",
      "  [baseApi]: {",
      '    target: "http://172.28.99.172:9000",',
      '    rewrite: (p) => p.replace(/^\\/dev-api/, "")',
      "  },",
      '  ["/devHost"]: {',
      '    target: "http://172.28.99.172",',
      '    rewrite: (p) => p.replace(/^\\/devHost/, "")',
      "  }",
      "};",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "vite", "plugins", "type.ts"),
    'export interface PluginOption { env: "dev" | "uat" | "prod" }\n',
  );
  fs.writeFileSync(
    path.join(root, "vite", "plugins", "index.ts"),
    "export default async function createVitePlugins() { return []; }\n",
  );
  return root;
}

describe("standard-env profiles", () => {
  it("完整支持域名、IP 和端口", () => {
    const profile = validateProfile({
      name: "customer",
      environments: Object.fromEntries(
        ["dev", "sit", "uat", "pre", "prd"].map((key, index) => [
          key,
          {
            webUrl: index % 2 ? `http://10.0.0.${index}:8080` : `https://${key}.example.com`,
            apiPrefix: key === "prd" ? "prod-api" : `${key}-api`,
          },
        ]),
      ),
    });
    expect(profile.environments.sit.webUrl).toBe("http://10.0.0.1:8080");
    expect(profile.environments.prd.apiPrefix).toBe("prod-api");
  });

  it("缺少任一环境时拒绝，避免静默混入华新地址", () => {
    expect(() =>
      validateProfile({
        name: "broken",
        environments: { dev: { webUrl: "http://127.0.0.1", apiPrefix: "dev-api" } },
      }),
    ).toThrow(/缺少 sit/);
  });

  it("自定义 Profile 不会继承华新 AnyReport 地址", () => {
    const profile = validateProfile({
      name: "walsin",
      environments: Object.fromEntries(
        ["dev", "sit", "uat", "pre", "prd"].map((key) => [
          key,
          { webUrl: `https://${key}.example.com`, apiPrefix: `${key}-api` },
        ]),
      ),
    });
    const env = standardEnvTemplates._internal.renderEnv({}, profile);
    expect(env).toContain("ENV_ANY_REPORT_SERVER=\n");
    expect(env).not.toContain("172.18.247.123");
  });
});

describe("standard-env migration", () => {
  it("拒绝非法模块名和含凭据的本地 URL", () => {
    const root = makeLegacyProject();
    try {
      const invalidModule = standardEnv.planStandardEnv(root, {
        profile: "walsin",
        moduleName: "../safe",
      });
      expect(invalidModule.blocked).toBe(true);
      expect(invalidModule.errors.join(" ")).toMatch(/module-name/);
      expect(() =>
        standardEnv.planStandardEnv(root, {
          profile: "walsin",
          moduleName: "safe",
          localApi: "http://user:secret@localhost:9000",
        }),
      ).toThrow(/不允许包含账号/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("支持 Git worktree 的 .git 文件并把备份留在真实 gitDir", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-standard-env-worktree-"));
    const gitDir = fs.mkdtempSync(path.join(os.tmpdir(), "wl-standard-env-gitdir-"));
    try {
      fs.writeFileSync(path.join(root, ".git"), `gitdir: ${gitDir}\n`);
      const backupRoot = standardEnv._internal.backupRootFor(root);
      expect(backupRoot.startsWith(path.join(gitDir, "wl-skills", "standard-env"))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(gitDir, { recursive: true, force: true });
    }
  });

  it("Profile 校验能识别 uat/pre 地址互换", () => {
    const root = makeLegacyProject();
    try {
      standardEnv.applyStandardEnv(root, {
        profile: "walsin",
        moduleName: "safe",
        confirmApply: true,
      });
      const envFile = path.join(root, "vite", "config", "environments.ts");
      const content = fs.readFileSync(envFile, "utf8");
      fs.writeFileSync(
        envFile,
        content
          .replace("ytiop-uat.walsin.com.cn", "__UAT_HOST__")
          .replace("ytiop-pre.walsin.com.cn", "ytiop-uat.walsin.com.cn")
          .replace("__UAT_HOST__", "ytiop-pre.walsin.com.cn"),
      );

      const profile = resolveProfile({ profile: "walsin" }, root);
      const validation = standardEnv.verifyStandardEnv(root, { profile });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((item) => item.code === "PROFILE_DRIFT")).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("拒绝 .env.local 覆盖标准远程端点", () => {
    const root = makeLegacyProject();
    try {
      standardEnv.applyStandardEnv(root, {
        profile: "walsin",
        moduleName: "safe",
        confirmApply: true,
      });
      fs.writeFileSync(path.join(root, ".env.local"), "ENV_WEB_URL=http://127.0.0.1:9000\n");
      const validation = standardEnv.verifyStandardEnv(root);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({ code: "ENV_LEGACY_KEY", rel: ".env.local" }),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("迁移 Federation 配置时保留业务插件并统一 build/dev remotes", () => {
    const source = [
      "async function createVitePlugins(option) {",
      "  const filename = `remoteEntry.js`;",
      "  const t = Date.now();",
      '  const webUrl = option.isBuild ? "" : option.webUrl;',
      "  const plugins = [customPlugin()];",
      "  if (option.isBuild) {",
      "    plugins.push(federation({ remotes: {} }));",
      "  } else {",
      "    const localOrRemote = option.isLocal ? 'local' : 'remote';",
      "    const remotes = { main: `${localOrRemote}/remoteEntry.js` };",
      "    plugins.push(federation({ remotes: {} }));",
      "  }",
      "  return plugins;",
      "}",
    ].join("\n");

    const result = standardEnvTemplates._internal.patchLegacyPluginIndex(source);
    expect(result).toContain("customPlugin()");
    expect(result).toContain("const mainRemoteEntry =");
    expect(result.match(/const remotes\s*=/g)).toHaveLength(1);
    expect(result).not.toMatch(/remotes\s*:\s*\{\s*\}/);
    expect(result).not.toContain("localOrRemote");
  });

  it("模块身份冲突时阻断 apply 计划", () => {
    const root = makeLegacyProject();
    try {
      const plan = standardEnv.planStandardEnv(root, { profile: "walsin" });
      expect(plan.blocked).toBe(true);
      expect(plan.errors.join(" ")).toMatch(/模块标识冲突/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("迁移旧直连项目并完成静态验证和二次 no-op", () => {
    const root = makeLegacyProject();
    try {
      const result = standardEnv.applyStandardEnv(root, {
        profile: "walsin",
        moduleName: "safe",
        confirmApply: true,
      });

      expect(result.status).toBe("applied");
      expect(result.validation.valid).toBe(true);
      expect(fs.existsSync(path.join(root, ".env.dev"))).toBe(false);
      expect(fs.existsSync(path.join(root, ".env.sit"))).toBe(false);
      expect(fs.existsSync(path.join(root, "public", "env-dev.json"))).toBe(false);
      expect(fs.existsSync(path.join(root, "vite", "config", "context.ts"))).toBe(true);
      expect(fs.readFileSync(path.join(root, ".env"), "utf8")).toContain(
        "ENV_ANY_REPORT_SECRET_KEY=keep-secret",
      );
      expect(fs.readFileSync(path.join(root, "vite", "config", "app.ts"), "utf8")).toContain(
        'moduleName: "safe"',
      );
      expect(fs.readFileSync(path.join(root, "vite", "config", "app.ts"), "utf8")).toContain(
        'prefix": "/devHost"',
      );
      expect(fs.readFileSync(path.join(root, "src", "main.ts"), "utf8")).not.toContain(
        "VITE_USE_MOCKJS",
      );
      expect(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")))
        .toMatchObject({ devDependencies: { typescript: "^4.5.4" } });
      expect(
        fs.readFileSync(path.join(root, "vite", "config", "environments.ts"), "utf8"),
      ).not.toContain("satisfies");

      const second = standardEnv.planStandardEnv(root, { profile: "walsin" });
      expect(second.status).toBe("standard");
      expect(second.changes).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("dry-run 不写文件且格式化结果不泄露 secret", () => {
    const root = makeLegacyProject();
    try {
      const result = standardEnv.applyStandardEnv(root, {
        profile: "walsin",
        moduleName: "safe",
      });
      expect(result.dryRun).toBe(true);
      expect(fs.existsSync(path.join(root, ".env.dev"))).toBe(true);
      expect(standardEnv.formatStandardEnvResult(result)).not.toContain("keep-secret");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

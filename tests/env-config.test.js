import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, "..");
const envConfig = require(path.join(ROOT, "lib", "env-config.js"));

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wl-skills-env-test-"));
}

describe("lib/env-config", () => {
  it("patchEnvContent 更新标准字段并保留业务自定义变量", () => {
    const before = [
      "VITE_ENV=sit",
      "CUSTOM_FLAG=keep-me",
      "VITE_API_BASE_URL=https://old.example.com/sit-api",
      "",
    ].join("\n");
    const after = envConfig.patchEnvContent(before, {
      VITE_ENV: "uat",
      VITE_API_BASE_URL: "https://ytiop-uat.walsin.com.cn:8443/uat-api",
      VITE_DEBUG: "false",
    });

    expect(after).toContain("CUSTOM_FLAG=keep-me");
    expect(after).toContain("VITE_ENV=uat");
    expect(after).toContain("VITE_DEBUG=false");
    expect(after).not.toContain("old.example.com");
  });

  it("scanProjectEnv 识别 env-dir 项目且不写文件", () => {
    const root = makeTempRoot();
    try {
      fs.mkdirSync(path.join(root, "env"), { recursive: true });
      fs.writeFileSync(path.join(root, "env", ".env.sit"), "VITE_ENV=sit\n", "utf8");

      const plan = envConfig.scanProjectEnv(root);
      expect(plan.detection.type).toBe("env-dir");
      expect(plan.changes.some((item) => item.rel === "env/.env.production")).toBe(true);
      expect(fs.existsSync(path.join(root, ".wl-skills"))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("硬编码扫描跳过 .wl-skills 生成物，避免 kit 文档污染结果", () => {
    const root = makeTempRoot();
    try {
      fs.mkdirSync(path.join(root, ".wl-skills", "reports"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".wl-skills", "reports", "OLD.md"),
        "https://old.example.com/uat-api\n",
        "utf8",
      );
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "src", "api.ts"),
        "export const url = 'https://real.example.com/sit-api'\n",
        "utf8",
      );

      const plan = envConfig.scanProjectEnv(root);
      expect(plan.hardcoded.map((item) => item.value)).toEqual([
        "https://real.example.com/sit-api",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("profileData 支持 baseUrls/proxyPrefixes 客户环境描述", () => {
    const profile = envConfig._internal.resolveProfile({
      profileData: {
        appName: "customer-a",
        baseUrls: {
          sit: "https://sit.customer.example.com",
          uat: "https://uat.customer.example.com",
          prd: "https://prd.customer.example.com",
        },
        proxyPrefixes: {
          sit: "sit-api",
          uat: "uat-api",
          prd: "prd-api",
        },
      },
    });

    const targets = envConfig._internal.rootTargets(profile);
    const sit = targets.find((item) => item.rel === ".env.sit");
    const prd = targets.find((item) => item.rel === ".env.prd");

    expect(profile.name).toBe("customer-a");
    expect(sit.updates.ENV_WEB_URL).toBe("https://sit.customer.example.com");
    expect(sit.updates.ENV_API_PREFIX).toBe("sit-api");
    expect(prd.updates.ENV_WEB_URL).toBe("https://prd.customer.example.com");
    expect(prd.updates.ENV_API_PREFIX).toBe("prd-api");
  });

  it("scanProjectEnv 识别并规划 Vite 硬编码环境映射迁移", () => {
    const root = makeTempRoot();
    try {
      fs.writeFileSync(path.join(root, ".env.dev"), "ENV=dev\n", "utf8");
      fs.mkdirSync(path.join(root, "public"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "public", "env-dev.json"),
        JSON.stringify({
          VUE_APP_BASE_API: "/dev-api",
          OPTION: {
            baseApi: "/dev-api",
            env: "dev",
            webUrl: "http://172.18.248.205",
          },
        }),
        "utf8",
      );
      fs.writeFileSync(
        path.join(root, "vite.config.ts"),
        [
          "const config = loadEnv(mode, process.cwd(), \"ENV\");",
          "const webApiMap = {",
          "  dev: \"http://172.28.99.172:81\",",
          "  uat: \"http://172.28.99.172:81\",",
          "  prod: \"https://172.18.248.205/prod-api\"",
          "};",
          "const webMap = {",
          "  dev: \"http://172.28.99.172:81\",",
          "  uat: \"http://172.28.99.172:81\",",
          "  prod: \"https://172.18.248.205\"",
          "};",
          "const baseApi: string = \"/\" + config[\"ENV\"] + \"-api\";",
          "const env = config[\"ENV\"] as \"dev\" | \"uat\" | \"prod\";",
          "const pluginOption = { webUrl: webMap[env], webApi: webApiMap[env], baseApi };",
          "const proxy = {",
          "  [baseApi]: {",
          "    target: \"http://172.28.99.172:9000\", // 测试",
          "    rewrite: (p) => p.replace(/^\\/dev-api/, \"\")",
          "  },",
          "  [\"/sub/systemApp\"]: { target: webMap[env] }",
          "};",
        ].join("\n"),
        "utf8",
      );

      const plan = envConfig.scanProjectEnv(root);
      const vite = plan.configChanges.find((item) => item.rel === "vite.config.ts");
      const runtime = plan.configChanges.find((item) => item.rel === "public/env-dev.json");

      expect(vite.after).not.toContain("webApiMap");
      expect(vite.after).not.toContain("webMap[env]");
      expect(vite.after).toContain("ENV_WEB_URL");
      expect(vite.after).toContain("target: webUrl");
      expect(vite.after).toContain("rewrite: (p) => p.replace(baseApiPattern, baseApi)");
      expect(runtime.after).toContain("\"VUE_APP_BASE_API\": \"/sit-api\"");
      expect(runtime.after).toContain("\"webUrl\": \"https://ytiop-sit.walsin.com.cn:8443\"");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("applyEnvConfig 默认 dry-run，不写入文件", () => {
    const root = makeTempRoot();
    try {
      fs.writeFileSync(path.join(root, ".env.sit"), "ENV=sit\n", "utf8");
      const result = envConfig.applyEnvConfig(root);

      expect(result.dryRun).toBe(true);
      expect(result.applied).toEqual([]);
      expect(fs.existsSync(path.join(root, ".env.uat"))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("applyEnvConfig dryRun=false 写入文件、备份旧文件并生成报告", () => {
    const root = makeTempRoot();
    try {
      fs.writeFileSync(path.join(root, ".env.sit"), "ENV=sit\nOLD_VALUE=1\n", "utf8");
      const result = envConfig.applyEnvConfig(root, { dryRun: false });

      expect(result.dryRun).toBe(false);
      expect(result.applied).toContain(".env.sit");
      expect(result.backupDir).toMatch(/env-backups/);
      expect(result.reportPath).toMatch(/ENV_CONFIG_.*\.md$/);
      expect(fs.readFileSync(path.join(root, ".env.sit"), "utf8")).toContain("OLD_VALUE=1");
      expect(fs.existsSync(path.join(root, ".env.uat"))).toBe(true);
      expect(fs.existsSync(path.join(root, result.reportPath))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

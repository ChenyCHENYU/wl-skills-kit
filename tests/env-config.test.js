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

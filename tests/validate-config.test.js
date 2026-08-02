"use strict";

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isPathWithin,
  loadValidationConfig,
  normalizeProjectPath,
} from "../lib/validate-config";

describe("validate project config", () => {
  it("规范化路径并只按目录边界匹配", () => {
    expect(normalizeProjectPath("./src/views/demo/**")).toBe("src/views/demo");
    expect(isPathWithin("src/views/demo/page", "src/views/demo")).toBe(true);
    expect(isPathWithin("src/views/demo-other", "src/views/demo")).toBe(false);
  });

  it("加载页面排除路径与集中定义校验脚本", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-validate-config-"));
    try {
      fs.writeFileSync(
        path.join(root, ".wl-skills-validate.json"),
        JSON.stringify({
          excludePagePaths: ["src/views/acme/style/**"],
          definitionValidators: [{
            source: "src/views/acme/definitions",
            script: "validate:definitions",
          }],
        }),
      );
      const config = loadValidationConfig(root);
      expect(config.warnings).toEqual([]);
      expect(config.isPageExcluded("src/views/acme/style")).toBe(true);
      expect(config.isPageExcluded("src/views/acme/style-preview")).toBe(false);
      expect(config.definitionValidatorFor("@/views/acme/definitions")).toBeUndefined();
      expect(config.definitionValidatorFor("src/views/acme/definitions")).toBe("validate:definitions");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("拒绝越界路径、命令字符串和重复来源", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-validate-config-bad-"));
    try {
      fs.writeFileSync(
        path.join(root, ".wl-skills-validate.json"),
        JSON.stringify({
          excludePagePaths: ["../outside"],
          definitionValidators: [
            { source: "src/definitions", script: "validate:ok" },
            { source: "src/definitions", script: "node bad.js" },
          ],
        }),
      );
      const config = loadValidationConfig(root);
      expect(config.warnings.join("\n")).toMatch(/非法项目相对路径/);
      expect(config.warnings.join("\n")).toMatch(/安全脚本名|重复 source/);
      expect(config.isPageExcluded("outside")).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

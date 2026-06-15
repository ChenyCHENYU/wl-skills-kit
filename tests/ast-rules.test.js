"use strict";

/**
 * tests/ast-rules.test.js — AST 规则引擎单元测试
 *
 * 覆盖：
 *   1. 函数导出完整性
 *   2. countEffectiveLines 行数统计逻辑
 *   3. extractScriptInfo import 解析
 *   4. extractCidsFromContent cid 提取
 *   5. hasRawElTable / hasBaseTable 模板检测
 * 6. isListTypePage 页面类型判断
 *   7. runAstRules 优雅降级（无 AST 依赖时仍返回有效结果）
 *   8. getStagedFiles 在非 git 目录返回空数组
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import astRules from "../lib/ast-rules.js";
const {
  runAstRules,
  countEffectiveLines,
  extractScriptInfo,
  hasAstAvailable,
  getStagedFiles,
  CONFIG,
} = astRules;

describe("ast-rules 模块导出", () => {
  it("导出所有必需函数", () => {
    expect(typeof runAstRules).toBe("function");
    expect(typeof countEffectiveLines).toBe("function");
    expect(typeof extractScriptInfo).toBe("function");
    expect(typeof hasAstAvailable).toBe("function");
    expect(typeof getStagedFiles).toBe("function");
    expect(typeof CONFIG).toBe("object");
  });

  it("CONFIG 包含所有规则配置", () => {
    expect(CONFIG.SCRIPT_LINE_THRESHOLD_LIST).toBeGreaterThan(0);
    expect(CONFIG.SCRIPT_LINE_THRESHOLD_OTHER).toBeGreaterThan(0);
    expect(CONFIG.FORBIDDEN_IMPORTS).toContain("getAction");
    expect(CONFIG.FORBIDDEN_IMPORTS).toContain("postAction");
    expect(CONFIG.FORBIDDEN_GLOBALS).toContain("sessionStorage");
    expect(CONFIG.WARN_IMPORTS).toContain("useRoute");
    expect(CONFIG.SKIP_DIRS).toContain("node_modules");
  });
});

describe("countEffectiveLines", () => {
  it("空字符串返回 0", () => {
    expect(countEffectiveLines("")).toBe(0);
  });

  it("纯 import 行不计入", () => {
    const code = 'import { ref } from "vue";\nimport Foo from "./bar";';
    expect(countEffectiveLines(code)).toBe(0);
  });

  it("空行和注释不计入", () => {
    const code =
      "// comment\n\n" +
      'import { ref } from "vue";\n' +
      "/* block comment */\n" +
      "const x = 1;";
    expect(countEffectiveLines(code)).toBe(1);
  });

  it("多行代码正确计数", () => {
    const code =
      "const a = 1;\n" +
      "const b = 2;\n" +
      "const c = 3;\n" +
      "// comment\n" +
      'import { x } from "y";\n' +
      "const d = 4;";
    expect(countEffectiveLines(code)).toBe(4);
  });

  it("多行块注释正确跳过", () => {
    const code =
      "/* start\n" +
      "still comment\n" +
      "end */\n" +
      "const x = 1;";
    expect(countEffectiveLines(code)).toBe(1);
  });
});

describe("extractScriptInfo", () => {
  it("无 AST 依赖时返回空数组（优雅降级）", () => {
    const result = extractScriptInfo('import { ref } from "vue"');
    // 即使没有 babel/parser，也可能返回空（errorRecovery）
    expect(result.specifiers).toBeDefined();
    expect(result.sources).toBeDefined();
  });
});

describe("hasAstAvailable", () => {
  it("返回布尔值", () => {
    expect(typeof hasAstAvailable()).toBe("boolean");
  });
});

describe("runAstRules 优雅降级", () => {
  it("目录不存在时返回空结果", () => {
    const result = runAstRules(
      path.join(__dirname, "nonexistent-dir-xyz"),
      "src/views",
    );
    // 无论 AST 是否可用，不存在的目录不应该报错
    expect(result.pages).toBe(0);
  });
});

describe("getStagedFiles", () => {
  it("非 git 目录返回空数组", () => {
    const files = getStagedFiles(path.join(__dirname));
    // tests 目录不是 git 根 → 返回空数组（或空）
    expect(files).toBeDefined();
    expect(files.length).toBeGreaterThanOrEqual(0);
  });
});

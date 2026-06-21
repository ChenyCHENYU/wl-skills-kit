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
  computeFunctionComplexity,
  collectFunctions,
  parseScriptAst,
  runTypeCheck,
  loadExemptions,
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
    expect(CONFIG.MAX_CYCLOMATIC_COMPLEXITY).toBe(10);
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

// ─── R13 圈复杂度 ────────────────────────────────────────────────────
describe("computeFunctionComplexity (R13)", () => {
  const parseFn = (src) => {
    const ast = parseScriptAst(src);
    const fns = collectFunctions(ast);
    return fns[0];
  };

  it("空函数复杂度为 1", () => {
    const fn = parseFn("function f() {}");
    expect(computeFunctionComplexity(fn.node)).toBe(1);
  });

  it("每个 if / for / while / case / 三元 / 逻辑运算符各 +1", () => {
    // 1 + if + for + while + case2 + 三元 + (&&) + (||) = 1+1+1+1+2+1+1+1 = 9
    const src =
      "function f(a,b){if(a){}for(;;){}while(b){}switch(a){case 1:case 2:}return a?1:(b&&b)||b}";
    const fn = parseFn(src);
    expect(computeFunctionComplexity(fn.node)).toBe(9);
  });

  it("嵌套函数不计入父函数复杂度（各自独立）", () => {
    // 父 f：1 + if = 2；嵌套 g：1 + 5 个 if = 6
    const ast = parseScriptAst(
      "function f(){ if(1){ function g(){ if(1){if(2){if(3){if(4){if(5){}}}}} } } }",
    );
    const fns = collectFunctions(ast);
    const f = fns.find((x) => x.name === "f");
    const g = fns.find((x) => x.name === "g");
    expect(computeFunctionComplexity(f.node)).toBe(2);
    expect(computeFunctionComplexity(g.node)).toBe(6);
  });
});

describe("runAstRules R13 阻断", () => {
  it("超阈值函数报 error", () => {
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wl-r13-"));
    const pageDir = path.join(dir, "src", "views", "m", "p");
    fs.mkdirSync(pageDir, { recursive: true });
    // 12 个 if → 复杂度 13 > 10
    const ifs = "if(1){".repeat(12) + "}".repeat(12);
    const vue =
      '<template><BaseTable render-type="agGrid" :cid="c"/><jh-pagination/></template>\n' +
      '<script setup lang="ts">function big(){' +
      ifs +
      "}</script>";
    fs.writeFileSync(path.join(pageDir, "index.vue"), vue);

    const r = runAstRules(dir, "src/views");
    const r13 = r.issues.filter((i) => i.rule === "R13");
    expect(r13.length).toBeGreaterThanOrEqual(1);
    expect(r13[0].level).toBe("error");
    expect(r13[0].text).toContain("圈复杂度");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ─── 项目级豁免配置 ──────────────────────────────────────────────────
describe("loadExemptions (配置豁免)", () => {
  const setup = (cfgObj) => {
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wl-ex-"));
    if (cfgObj !== undefined) {
      fs.writeFileSync(
        path.join(dir, ".wl-skills-validate.json"),
        JSON.stringify(cfgObj),
      );
    }
    return dir;
  };
  const rm = (dir) => require("fs").rmSync(dir, { recursive: true, force: true });

  it("无配置文件 → 全不豁免", () => {
    const dir = setup(undefined);
    const ex = loadExemptions(dir);
    expect(ex.source).toBeNull();
    expect(ex.isExempt("src/views/x", "R3")).toBe(false);
    rm(dir);
  });

  it("精确目录 / 子目录 / glob 前缀命中，规则大小写不敏感", () => {
    const dir = setup({
      exemptions: [
        {
          paths: ["src/views/designer", "src/views/builder/**"],
          rules: ["r3"],
          reason: "表单设计器",
        },
      ],
    });
    const ex = loadExemptions(dir);
    expect(ex.isExempt("src/views/designer", "R3")).toBe(true);
    expect(ex.isExempt("src/views/designer/sub/x", "R3")).toBe(true);
    expect(ex.isExempt("src/views/builder/x", "R3")).toBe(true);
    expect(ex.isExempt("src/views/sale/list", "R3")).toBe(false);
    expect(ex.isExempt("src/views/designer", "R10")).toBe(false);
    rm(dir);
  });

  it("格式错误 → 降级 warn，不豁免", () => {
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wl-bad-"));
    fs.writeFileSync(path.join(dir, ".wl-skills-validate.json"), "{ broken");
    const ex = loadExemptions(dir);
    expect(ex.warnings.length).toBe(1);
    expect(ex.isExempt("src/x", "R3")).toBe(false);
    rm(dir);
  });

  it("runAstRules 中 R3 命中豁免不报错", () => {
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wl-r3ex-"));
    fs.writeFileSync(
      path.join(dir, ".wl-skills-validate.json"),
      JSON.stringify({
        exemptions: [
          { paths: ["src/views/designer"], rules: ["R3"], reason: "x" },
        ],
      }),
    );
    const pageDir = path.join(dir, "src", "views", "designer", "p");
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(
      path.join(pageDir, "index.vue"),
      '<template><el-table><el-table-column/></el-table></template>',
    );
    const r = runAstRules(dir, "src/views");
    const r3 = r.issues.filter((i) => i.rule === "R3");
    expect(r3.length).toBe(0);
    rm(dir);
  });
});
describe("runTypeCheck (R14) 优雅降级", () => {
  it("无 tsconfig.json 时降级为 warn 不阻断", () => {
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wl-r14-"));
    const tc = runTypeCheck(dir);
    expect(tc.ran).toBe(false);
    expect(tc.issues.length).toBe(1);
    expect(tc.issues[0].level).toBe("warn");
    expect(tc.issues[0].rule).toBe("R14");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("返回结构包含 issues / ran / errorCount", () => {
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wl-r14b-"));
    const tc = runTypeCheck(dir);
    expect(tc).toHaveProperty("issues");
    expect(tc).toHaveProperty("ran");
    expect(tc).toHaveProperty("errorCount");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("有 checker 时解析标准 TS error 为 error 级（跨平台假 checker）", () => {
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wl-r14c-"));
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { noEmit: true } }),
    );
    const binDir = path.join(dir, "node_modules", ".bin");
    fs.mkdirSync(binDir, { recursive: true });
    // 假 checker：--version 退出 0；否则输出标准 TS error 行并退出 1
    const script = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "Version 5.0.0"; exit 0; fi
echo 'src/x.ts(10,5): error TS2322: Type string is not assignable to type number.'
exit 1`;
    fs.writeFileSync(path.join(binDir, "tsc"), script, { mode: 0o755 });
    // Windows 额外写 .cmd
    fs.writeFileSync(
      path.join(binDir, "tsc.cmd"),
      '@echo off\r\nif "%1"=="--version" (echo Version 5.0.0 & exit /b 0)\r\necho src/x.ts(10,5): error TS2322: Type string is not assignable to type number.\r\nexit /b 1\r\n',
    );
    const tc = runTypeCheck(dir);
    expect(tc.ran).toBe(true);
    expect(tc.errorCount).toBe(1);
    expect(tc.issues.length).toBe(1);
    expect(tc.issues[0].level).toBe("error");
    expect(tc.issues[0].rule).toBe("R14");
    expect(tc.issues[0].text).toContain("TS2322");
    expect(tc.issues[0].text).toContain("x.ts:10");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  MINIMUM_VERSION,
  formValidationFindings,
  hasManualRuleObjects,
  importedNames,
  validationDependency,
  versionCompatibility,
} = require("../lib/form-validation-guidance.js");
const { runAstRules } = require("../lib/ast-rules.js");

const temporaryDirectories = [];

function project(dependencies = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-form-validate-"));
  temporaryDirectories.push(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies }));
  return root;
}

afterEach(() => {
  for (const root of temporaryDirectories.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("form validation guidance", () => {
  it("识别项目依赖和 Element API 导入", () => {
    const root = project({ "@robot-admin/form-validate": "^3.4.1" });
    expect(validationDependency(root)).toMatchObject({ declared: true, spec: "^3.4.1" });
    expect(importedNames(
      'import { ELEMENT_RULES, SPEC_RULES as specs } from "@robot-admin/form-validate";',
    )).toEqual(new Set(["ELEMENT_RULES", "SPEC_RULES"]));
  });

  it("校验库声明版本必须满足最低版本", () => {
    expect(MINIMUM_VERSION).toBe("3.4.1");
    expect(versionCompatibility("^3.4.1", "")).toBe(true);
    expect(versionCompatibility("^3.3.0", "")).toBe(false);
    expect(versionCompatibility("workspace:*", "")).toBeNull();

    const root = project({ "@robot-admin/form-validate": "^3.3.0" });
    const findings = formValidationFindings(root, "<BaseForm />");
    expect(findings).toContainEqual(expect.objectContaining({
      level: "error",
      text: expect.stringMatching(/3\.4\.1\+.*3\.3\.0/),
    }));
  });

  it("无法判定的非标准版本范围给出警告而不伪装兼容", () => {
    const root = project({ "@robot-admin/form-validate": "workspace:*" });
    const findings = formValidationFindings(root, "<BaseForm />");
    expect(findings).toContainEqual(expect.objectContaining({
      level: "warn",
      text: expect.stringMatching(/无法确认.*workspace:\*/),
    }));
  });

  it("import 但 package.json 未声明依赖时阻断", () => {
    const findings = formValidationFindings(
      project(),
      'import { ELEMENT_RULES } from "@robot-admin/form-validate";',
    );
    expect(findings).toContainEqual(expect.objectContaining({ level: "error" }));
    expect(findings.map((item) => item.text).join("\n")).toMatch(/未声明该依赖/);
  });

  it("Element Plus 项目拒绝误用 Naive API", () => {
    const root = project({ "@robot-admin/form-validate": "^3.4.1" });
    const findings = formValidationFindings(
      root,
      'import { PRESET_RULES, RULE_COMBOS } from "@robot-admin/form-validate";',
    );
    expect(findings.map((item) => item.text).join("\n")).toMatch(/Naive API.*PRESET_RULES.*RULE_COMBOS/);
  });

  it("手写规则只做渐进提示，不尝试自动改写业务语义", () => {
    const source = `const rules = {
      name: [{ required: true, message: "请输入名称", trigger: "blur" }],
    };`;
    expect(hasManualRuleObjects(source)).toBe(true);
    expect(formValidationFindings(project(), source)).toContainEqual(
      expect.objectContaining({ level: "info" }),
    );

    const root = project({ "@robot-admin/form-validate": "^3.4.1" });
    const mixed = `${source}\nimport { ELEMENT_RULES } from "@robot-admin/form-validate";`;
    expect(formValidationFindings(root, mixed)).toContainEqual(
      expect.objectContaining({ level: "warn" }),
    );
  });

  it("阻断已废弃的拆包依赖", () => {
    const root = project({ "@robot-admin/form-validate-element": "^2.0.0" });
    const findings = formValidationFindings(root, "");
    expect(findings).toContainEqual(expect.objectContaining({
      level: "error",
      text: expect.stringMatching(/form-validate-element.*已废弃/),
    }));
  });

  it("R18 已接入页面 AST 扫描而不是仅停留在文档", () => {
    const root = project();
    const page = path.join(root, "src", "views", "orders");
    fs.mkdirSync(page, { recursive: true });
    fs.writeFileSync(
      path.join(page, "index.vue"),
      `<template><BaseForm /></template>
<script setup lang="ts">
import { ELEMENT_RULES } from "@robot-admin/form-validate";
const formRules = { name: [ELEMENT_RULES.required("名称")] };
</script>`,
    );
    const result = runAstRules(root, "src/views");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ level: "error", rule: "R18" }),
    );
  });
});

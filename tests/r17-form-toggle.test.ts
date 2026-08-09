import { describe, it, expect } from "vitest";
import { fixContent } from "../lib/safe-fix.js";
import { analyzeFormRequiredOnly } from "../lib/form-field-analysis.js";
import { runAstRules } from "../lib/ast-rules.js";
import fs from "fs";
import path from "path";
import os from "os";

function modalData(total: number, required: number, extra = "") {
  const fields = Array.from({ length: total }, (_, index) =>
    `{ name: "f${index}", required: ${index < required} },`).join("\n");
  return `export const modalConfig = { formItems: [\n${fields}\n] };\n${extra}`;
}

function writeFormPage(root: string, data: string, template =
  `<template><c_formModal ref="m" v-bind="modalConfig" /></template>`) {
  const viewsDir = path.join(root, "src/views/test");
  fs.mkdirSync(viewsDir, { recursive: true });
  fs.writeFileSync(path.join(viewsDir, "data.ts"), data);
  fs.writeFileSync(path.join(viewsDir, "index.vue"), template);
}

function formItems(total: number, required: number, field = "name") {
  return Array.from({ length: total }, (_, index) =>
    `{ ${field}: "f${index}", required: ${index < required} },`).join("\n");
}

describe("R17 + F6: 表单仅必填切换闭环", () => {
  it("R17 同时识别弹窗、BaseForm 页面和分区表单页面", () => {
    const template = `<template>
      <c_formModal v-bind="modalConfig" />
      <BaseForm :items="pageItems" />
      <c_formSections :sections="sections" />
    </template>`;
    const source = `
      const modalConfig = { formItems: [${formItems(10, 4)}] };
      const pageItems = [${formItems(11, 5)}];
      const sections = [
        { name: "base", fieldsConfig: [${formItems(6, 3, "prop")}] },
        { name: "extra", fieldsConfig: [${formItems(5, 2, "prop")}] }
      ];`;

    const forms = analyzeFormRequiredOnly(template, source);
    expect(forms.map((form) => [form.kind, form.total, form.eligible])).toEqual([
      ["modal", 10, true],
      ["base-form", 11, true],
      ["form-sections", 11, true],
    ]);
  });

  it("R17 逐个判断能力，不被页面中另一个已开启弹窗误抑制", () => {
    const template = `<template>
      <c_formModal v-bind="firstConfig" show-required-toggle />
      <c_formModal v-bind="secondConfig" />
    </template>`;
    const source = `
      const firstConfig = { formItems: [${formItems(10, 4)}] };
      const secondConfig = { formItems: [${formItems(12, 6)}] };`;
    const forms = analyzeFormRequiredOnly(template, source);

    expect(forms.map((form) => form.enabled)).toEqual([true, false]);
  });

  it("BaseForm 页面接入 composable 后 R17 完整通过", () => {
    const template = `<template>
      <el-switch v-model="showRequiredOnly" />
      <BaseForm :items="visibleItems" />
    </template>`;
    const source = `
      const pageItems = [${formItems(12, 6)}];
      const { showRequiredOnly, visibleItems } = useFormRequiredOnly(pageItems, formRef);`;
    const [form] = analyzeFormRequiredOnly(template, source);

    expect(form).toMatchObject({
      kind: "base-form",
      binding: "pageItems",
      total: 12,
      enabled: true,
      eligible: true,
    });
  });

  it("c_formSections 页面开启 show-required-filter 后 R17 完整通过", () => {
    const template = `<template><c-form-sections :sections="sections" show-required-filter /></template>`;
    const source = `const sections = [
      { name: "base", fieldsConfig: [${formItems(10, 4, "prop")}] }
    ];`;
    const [form] = analyzeFormRequiredOnly(template, source);

    expect(form).toMatchObject({ kind: "form-sections", enabled: true, eligible: true });
  });

  it("动态开关条件不伪装成静态已开启", () => {
    const template = `<template><c-form-sections :sections="sections" :show-required-filter="enabled" /></template>`;
    const source = `const sections = [
      { name: "base", fieldsConfig: [${formItems(10, 4, "prop")}] }
    ];`;
    const [form] = analyzeFormRequiredOnly(template, source);

    expect(form).toMatchObject({ kind: "form-sections", enabled: false, eligible: true });
  });

  it("R17 已接入页面 AST 扫描并提示 BaseForm composable", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-r17-page-"));
    writeFormPage(
      root,
      `export const pageItems = [${formItems(12, 5)}];`,
      `<template><BaseForm :items="pageItems" :form="form" /></template>
       <script setup lang="ts">import { pageItems } from "./data"; const form = {};</script>`,
    );

    const result = runAstRules(root, "src/views");
    expect(result.issues).toContainEqual(expect.objectContaining({
      rule: "R17",
      level: "warn",
      text: expect.stringMatching(/useFormRequiredOnly \+ visibleItems/),
    }));
    fs.rmSync(root, { recursive: true, force: true });
  });

  // ─── F6 修复：给 c_formModal 补 show-required-toggle ───
  it("F6: c_formModal 无 show-required-toggle 时补上", () => {
    const vue = `<template><c_formModal ref="m" v-bind="cfg" @ok="fn" /></template>`;
    const { content, changes } = fixContent(vue, ".vue", { enableFormToggle: true });
    expect(content).toMatch(/show-required-toggle/);
    expect(changes.some((c) => c.includes("F6"))).toBe(true);
  });

  it("F6: 已有 show-required-toggle 时不重复添加", () => {
    const vue = `<template><c_formModal show-required-toggle ref="m" /></template>`;
    const { content, changes } = fixContent(vue, ".vue", { enableFormToggle: true });
    expect((content.match(/show-required-toggle/g) || []).length).toBe(1);
    expect(changes.some((c) => c.includes("F6"))).toBe(false);
  });

  it("F6: enableFormToggle=false 时不加", () => {
    const vue = `<template><c_formModal ref="m" /></template>`;
    const { content, changes } = fixContent(vue, ".vue", { enableFormToggle: false });
    expect(content).not.toMatch(/show-required-toggle/);
    expect(changes.some((c) => c.includes("F6"))).toBe(false);
  });

  it("F6: 非 c_formModal 标签不受影响", () => {
    const vue = `<template><BaseTable ref="t" /></template>`;
    const { changes } = fixContent(vue, ".vue", { enableFormToggle: true });
    expect(changes.some((c) => c.includes("F6"))).toBe(false);
  });

  // ─── F6 幂等：重复修复不叠加 ───
  it("F6 幂等：第二次修复无变化", () => {
    const vue = `<template><c_formModal ref="m" v-bind="cfg" /></template>`;
    const first = fixContent(vue, ".vue", { enableFormToggle: true });
    const second = fixContent(first.content, ".vue", { enableFormToggle: true });
    expect(second.changes.some((c) => c.includes("F6"))).toBe(false);
  });

  // ─── runSafeFix 字段数判断 ───
  it("runSafeFix: 字段<10 时不触发 F6", () => {
    const { runSafeFix } = require("../lib/safe-fix.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-fix-"));
    writeFormPage(root, modalData(5, 3));

    const result = runSafeFix(root, "src/views", { dryRun: true });
    const f6Files = result.files.filter((f) => f.changes.some((c) => c.includes("F6")));
    expect(f6Files.length).toBe(0);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("runSafeFix: 字段≥10 + 混合必填时触发 F6", () => {
    const { runSafeFix } = require("../lib/safe-fix.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-fix-"));
    writeFormPage(root, modalData(12, 7));

    const result = runSafeFix(root, "src/views", { dryRun: true });
    const f6Files = result.files.filter((f) => f.changes.some((c) => c.includes("F6")));
    expect(f6Files.length).toBe(1);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("runSafeFix: 全必填时不触发 F6", () => {
    const { runSafeFix } = require("../lib/safe-fix.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-fix-"));
    writeFormPage(root, modalData(12, 12));

    const result = runSafeFix(root, "src/views", { dryRun: true });
    const f6Files = result.files.filter((f) => f.changes.some((c) => c.includes("F6")));
    expect(f6Files.length).toBe(0);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("runSafeFix: queryDef 的 name 不得计入 modalConfig.formItems", () => {
    const { runSafeFix } = require("../lib/safe-fix.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-fix-"));
    const queryNoise = `export const queryItems = [${Array.from(
      { length: 15 },
      (_, index) => `{ name: "q${index}" }`,
    ).join(",")}];`;
    writeFormPage(root, modalData(8, 3, queryNoise));

    const result = runSafeFix(root, "src/views", { dryRun: true });
    const f6Files = result.files.filter((file) =>
      file.changes.some((change) => change.includes("F6")));
    expect(f6Files).toHaveLength(0);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("runSafeFix: 多弹窗只修复达到阈值的实际绑定配置", () => {
    const { runSafeFix } = require("../lib/safe-fix.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-fix-"));
    const data = modalData(12, 5).replaceAll("modalConfig", "largeConfig") +
      modalData(4, 2).replaceAll("modalConfig", "smallConfig");
    const template = `<template><c_formModal v-bind="largeConfig" /><c_formModal v-bind="smallConfig" /></template>`;
    writeFormPage(root, data, template);

    runSafeFix(root, "src/views", { dryRun: false });
    const fixed = fs.readFileSync(path.join(root, "src/views/test/index.vue"), "utf8");
    expect(fixed).toMatch(/<c_formModal show-required-toggle v-bind="largeConfig"/);
    expect(fixed).toMatch(/<c_formModal v-bind="smallConfig"/);

    fs.rmSync(root, { recursive: true, force: true });
  });
});

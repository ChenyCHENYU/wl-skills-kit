import { describe, it, expect } from "vitest";
import { fixContent } from "../lib/safe-fix.js";
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

describe("R17 + F6: 表单仅必填切换闭环", () => {
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

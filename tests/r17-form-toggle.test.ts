import { describe, it, expect } from "vitest";
import { fixContent } from "../lib/safe-fix.js";
import fs from "fs";
import path from "path";
import os from "os";

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
    const viewsDir = path.join(root, "src/views/test");
    fs.mkdirSync(viewsDir, { recursive: true });
    // 只有 5 个字段，不触发
    fs.writeFileSync(path.join(viewsDir, "data.ts"), Array.from({ length: 5 }, (_, i) =>
      `{ name: "f${i}", required: ${i < 3} },`).join("\n"));
    fs.writeFileSync(path.join(viewsDir, "index.vue"),
      `<template><c_formModal ref="m" v-bind="cfg" /></template>`);

    const result = runSafeFix(root, "src/views", { dryRun: true });
    const f6Files = result.files.filter((f) => f.changes.some((c) => c.includes("F6")));
    expect(f6Files.length).toBe(0);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("runSafeFix: 字段≥10 + 混合必填时触发 F6", () => {
    const { runSafeFix } = require("../lib/safe-fix.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-fix-"));
    const viewsDir = path.join(root, "src/views/test");
    fs.mkdirSync(viewsDir, { recursive: true });
    // 12 个字段，7 必填 5 非必填
    fs.writeFileSync(path.join(viewsDir, "data.ts"), Array.from({ length: 12 }, (_, i) =>
      `{ name: "f${i}", required: ${i < 7} },`).join("\n"));
    fs.writeFileSync(path.join(viewsDir, "index.vue"),
      `<template><c_formModal ref="m" v-bind="cfg" /></template>`);

    const result = runSafeFix(root, "src/views", { dryRun: true });
    const f6Files = result.files.filter((f) => f.changes.some((c) => c.includes("F6")));
    expect(f6Files.length).toBe(1);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("runSafeFix: 全必填时不触发 F6", () => {
    const { runSafeFix } = require("../lib/safe-fix.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-fix-"));
    const viewsDir = path.join(root, "src/views/test");
    fs.mkdirSync(viewsDir, { recursive: true });
    // 12 个字段全必填
    fs.writeFileSync(path.join(viewsDir, "data.ts"), Array.from({ length: 12 }, (_, i) =>
      `{ name: "f${i}", required: true },`).join("\n"));
    fs.writeFileSync(path.join(viewsDir, "index.vue"),
      `<template><c_formModal ref="m" v-bind="cfg" /></template>`);

    const result = runSafeFix(root, "src/views", { dryRun: true });
    const f6Files = result.files.filter((f) => f.changes.some((c) => c.includes("F6")));
    expect(f6Files.length).toBe(0);

    fs.rmSync(root, { recursive: true, force: true });
  });
});

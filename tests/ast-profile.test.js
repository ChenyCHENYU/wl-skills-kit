"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import apiContract from "../lib/api-contract.js";
import astRules from "../lib/ast-rules.js";

const { DEFAULT_PROFILE } = apiContract;
const { runAstRules } = astRules;

function project(size) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-ast-profile-"));
  const profile = structuredClone(DEFAULT_PROFILE);
  profile.profileId = "custom-page20";
  profile.transport.pagination.defaultSize = 20;
  profile.transport.pagination.maxSize = 1000;
  const files = {
    ".wl-skills/contracts/wl-delivery-profile.v1.json": JSON.stringify(profile),
    "src/views/profile-case/index.vue": `<template><div /></template><script setup lang="ts">const ready = true;</script>`,
    "src/views/profile-case/data.ts": `export const page = { current: 1, size: ${size} };`,
  };
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, "utf8");
  }
  return root;
}

describe("K15 使用项目 Profile", () => {
  it("项目默认 20 通过，硬编码回基线 10 反而报告漂移", () => {
    const validRoot = project(20);
    const driftRoot = project(10);
    try {
      expect(runAstRules(validRoot, "src/views").issues.filter((item) => item.rule === "K15")).toEqual([]);
      expect(runAstRules(driftRoot, "src/views").issues.some((item) => item.rule === "K15")).toBe(true);
    } finally {
      fs.rmSync(validRoot, { recursive: true, force: true });
      fs.rmSync(driftRoot, { recursive: true, force: true });
    }
  });
});

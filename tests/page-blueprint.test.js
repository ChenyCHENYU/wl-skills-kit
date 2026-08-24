"use strict";

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildPageBlueprint,
  readPageBlueprint,
  validatePageBlueprint,
  writePageBlueprint,
} = require("../lib/page-blueprint");
const { buildProjectSnapshot } = require("../lib/project-snapshot");
const { searchBlueprints, compareBlueprints } = require("../lib/blueprint-registry");
const { auditPageBlueprint } = require("../lib/blueprint-audit");

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-blueprint-test-"));
  const page = path.join(root, "src/views/produce/order");
  fs.mkdirSync(page, { recursive: true });
  fs.writeFileSync(path.join(page, "index.vue"), [
    "<template>",
    "  <BaseTable render-type=\"agGrid\" cid=\"order-list\" />",
    "  <jh-pagination />",
    "</template>",
    "<script setup lang=\"ts\"></script>",
  ].join("\n"));
  fs.writeFileSync(path.join(page, "data.ts"), [
    "function columnsDef() { return defineColumns([{ name: \"code\", label: \"编码\" }]); }",
    "const API_CONFIG = { list: \"/order/list\" };",
  ].join("\n"));
  fs.writeFileSync(path.join(page, "api.md"), "POST /produce/order/list\nGET /produce/order/getById?id={id}\n");
  return root;
}

describe("page blueprint", () => {
  it("提取不含业务代码的领域/场景和槽位事实", () => {
    const root = makeProject();
    const blueprint = buildPageBlueprint(root, "src/views/produce/order");
    expect(blueprint.blueprintId).toBe("produce.list");
    expect(blueprint.shape.slots.columns).toHaveLength(1);
    expect(blueprint.shape.apiOperations).toHaveLength(3);
    expect(blueprint.shape.apiOperations.find((item) => item.method === "POST")).toMatchObject({ request: "body" });
    expect(JSON.stringify(blueprint)).not.toContain("order-list");
    expect(validatePageBlueprint(blueprint)).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("Blueprint 可检索、可比较并通过脱敏门禁", () => {
    const root = makeProject();
    const first = buildPageBlueprint(root, "src/views/produce/order");
    const second = JSON.parse(JSON.stringify(first));
    second.shape.mode = "DETAIL";
    second.fingerprint = crypto.createHash("sha256").update(JSON.stringify({ ...second, source: undefined, fingerprint: undefined })).digest("hex");
    const firstPath = path.join(root, "one.json");
    const secondPath = path.join(root, "two.json");
    fs.writeFileSync(firstPath, JSON.stringify(first));
    fs.writeFileSync(secondPath, JSON.stringify(second));
    // search 使用已写入的结构化模板目录；显式 scanPath 可定位任意项目内索引目录。
    const result = searchBlueprints(root, { scanPath: ".", domain: "produce", limit: 10 });
    expect(result.total).toBe(2);
    expect(result.items[0].summary).toBeTruthy();
    expect(result.items[0].blueprint).toBeUndefined();
    expect(compareBlueprints(first, second).changedCount).toBeGreaterThan(0);
    expect(auditPageBlueprint(first).ok).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("写入后可通过 fingerprint 校验", () => {
    const root = makeProject();
    const blueprint = buildPageBlueprint(root, "src/views/produce/order");
    const output = writePageBlueprint(root, blueprint);
    const stored = readPageBlueprint(root, output);
    expect(validatePageBlueprint(stored)).toEqual([]);
    stored.scene = "changed";
    expect(validatePageBlueprint(stored)).toContain("fingerprint 与蓝图内容不一致，请重新提取");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("校验会拒绝缺失 source/quality 的不完整蓝图", () => {
    const root = makeProject();
    const blueprint = buildPageBlueprint(root, "src/views/produce/order");
    delete blueprint.source;
    delete blueprint.quality;
    const errors = validatePageBlueprint(blueprint);
    expect(errors).toContain("缺少 source 对象");
    expect(errors).toContain("缺少 quality 对象");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("项目快照只返回摘要，不读取业务代码内容", () => {
    const root = makeProject();
    const snapshot = buildProjectSnapshot(root);
    expect(snapshot.pageCount).toBe(1);
    expect(snapshot.pages[0].summary.columnSlots).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain("defineColumns");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("项目快照隔离损坏页面并继续返回可用页面", () => {
    const root = makeProject();
    const broken = path.join(root, "src/views/quality/broken");
    fs.mkdirSync(broken, { recursive: true });
    fs.writeFileSync(path.join(broken, "index.vue"), "<template></template>");
    // 让损坏页在 blueprint 提取阶段失败，同时不影响 produce/order。
    fs.writeFileSync(path.join(broken, "page-spec.json"), "{bad json");
    const snapshot = buildProjectSnapshot(root);
    expect(snapshot.pageCount).toBe(2);
    expect(snapshot.failedCount).toBe(1);
    expect(snapshot.pages.find((page) => page.path.endsWith("order"))?.ok).toBe(true);
    expect(snapshot.pages.find((page) => page.path.endsWith("broken"))).toMatchObject({
      ok: false,
      path: "src/views/quality/broken",
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("项目快照拒绝扫描项目根目录之外的路径", () => {
    const root = makeProject();
    expect(() => buildProjectSnapshot(root, { scanPath: "../../etc" })).toThrow(/路径越界/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

"use strict";

/**
 * tests/scenario-cli.test.js — wl-skills scenario CLI 黑盒冒烟
 *
 * 覆盖：validate（合法/非法）、render 预览不写盘（安全默认）、
 * render --confirm 真实落盘、extract 从 canonical 页面提取并落盘 JSON。
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileScenario } from "../lib/scenario-compiler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, "..", "bin", "wl-skills.js");

function fixtureDoc() {
  return {
    kind: "wl-scenario",
    schemaVersion: 1,
    templateId: "universal.list",
    domain: "sale",
    pattern: "list",
    renderTrack: "codegen",
    page: "客户档案",
    pageId: "CUST_CLI_001",
    dir: "src/views/sale/customer-cli",
    serviceShort: "sale",
    resourceName: "customer",
    tableCid: "cust-cli01",
    query: [{ name: "companyName", label: "公司名称", type: "input" }],
    columns: [{ name: "companyName", label: "公司名称", minWidth: 150 }],
    toolbar: [{ label: "新增", color: "primary" }],
    operations: [
      { label: "编辑", action: "edit" },
      { label: "删除", action: "del" },
    ],
    formSections: [
      {
        name: "base",
        label: "基本信息",
        fields: [{ name: "companyName", label: "公司名称", required: true }],
      },
    ],
    features: {},
  };
}

function runCli(cwd, cliArgs) {
  return execFileSync(process.execPath, [BIN, ...cliArgs], {
    cwd,
    encoding: "utf8",
    stderr: "pipe",
  });
}

function runCliFail(cwd, cliArgs) {
  try {
    runCli(cwd, cliArgs);
    return null;
  } catch (error) {
    return { stdout: error.stdout || "", status: error.status };
  }
}

describe("wl-skills scenario CLI", () => {
  let tmpRoot;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wl-scenario-cli-"));
    const scenarioPath = path.join(tmpRoot, "customer.scenario.json");
    fs.writeFileSync(scenarioPath, JSON.stringify(fixtureDoc(), null, 2));
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("validate 合法 scenario 通过", () => {
    const out = runCli(tmpRoot, ["scenario", "validate", "--input", "customer.scenario.json"]);
    expect(out).toContain("✔ scenario 结构合法");
  });

  it("validate 非法 scenario 退出非零并给出错误", () => {
    const bad = { ...fixtureDoc(), pageId: "" };
    const badPath = path.join(tmpRoot, "bad.scenario.json");
    fs.writeFileSync(badPath, JSON.stringify(bad));
    const result = runCliFail(tmpRoot, ["scenario", "validate", "--input", "bad.scenario.json"]);
    expect(result).not.toBeNull();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("缺少 pageId");
  });

  it("render 默认预览不写盘，--confirm 才落盘四件套", () => {
    const preview = runCli(tmpRoot, [
      "scenario", "render", "--input", "customer.scenario.json",
    ]);
    expect(preview).toContain("预览（track=codegen）");
    expect(preview).toContain("默认不写入");
    const outDir = path.join(tmpRoot, "src", "views", "sale", "customer-cli");
    expect(fs.existsSync(path.join(outDir, "data.ts"))).toBe(false);

    const applied = runCli(tmpRoot, [
      "scenario", "render", "--input", "customer.scenario.json", "--confirm",
    ]);
    expect(applied).toContain("已生成");
    for (const name of ["data.ts", "index.vue", "index.scss", "page-spec.json"]) {
      expect(fs.existsSync(path.join(outDir, name))).toBe(true);
    }
    const spec = JSON.parse(fs.readFileSync(path.join(outDir, "page-spec.json"), "utf8"));
    expect(spec.pageId).toBe("CUST_CLI_001");
  });

  it("render 产物与编译器输出一致（CLI 只做 IO 不改内容）", () => {
    const outDir = path.join(tmpRoot, "src", "views", "sale", "customer-cli");
    const compiled = compileScenario(fixtureDoc());
    const written = fs.readFileSync(path.join(outDir, "data.ts"), "utf8");
    expect(written).toBe(compiled.files["data.ts"]);
  });

  it("extract 从 canonical 页面提取并落盘 JSON", () => {
    const out = runCli(tmpRoot, [
      "scenario", "extract", "--page", "src/views/sale/customer-cli",
      "--output", "extracted.scenario.json", "--confirm",
    ]);
    expect(out).toContain("已提取");
    const extracted = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, "extracted.scenario.json"), "utf8"),
    );
    // 语义投影一致（placeholder 属编译默认值，提取时会显式捕获，属预期增益）
    expect(extracted.query.map((q) => [q.name, q.label, q.type])).toEqual([["companyName", "公司名称", "input"]]);
    expect(extracted.operations.map((op) => op.action)).toEqual(["edit", "del"]);
  });

  it("未知子命令退出非零", () => {
    const result = runCliFail(tmpRoot, ["scenario", "unknown"]);
    expect(result).not.toBeNull();
    expect(result.status).toBe(1);
  });

  it("verify：产物未被手改时零漂移通过", () => {
    const out = runCli(tmpRoot, [
      "scenario", "verify", "--input", "customer.scenario.json",
      "--page", "src/views/sale/customer-cli",
    ]);
    expect(out).toContain("字节级一致（零漂移）");
  });

  it("verify：产物被手改后报告漂移并退出非零", () => {
    const dataTs = path.join(tmpRoot, "src", "views", "sale", "customer-cli", "data.ts");
    const original = fs.readFileSync(dataTs, "utf8");
    fs.writeFileSync(dataTs, original.replace("minWidth: 150", "minWidth: 180"));
    const result = runCliFail(tmpRoot, [
      "scenario", "verify", "--input", "customer.scenario.json",
      "--page", "src/views/sale/customer-cli",
    ]);
    expect(result).not.toBeNull();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("data.ts");
    expect(result.stdout).toContain("漂移");
    fs.writeFileSync(dataTs, original);
  });

  it("verify：产物缺失时报告 missing 并退出非零", () => {
    const result = runCliFail(tmpRoot, [
      "scenario", "verify", "--input", "customer.scenario.json",
      "--page", "src/views/sale/not-exists",
    ]);
    expect(result).not.toBeNull();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("产物缺失");
  });

  it("render 落盘的 page-spec 携带 scenarioRef（相对页面目录）", () => {
    const spec = JSON.parse(
      fs.readFileSync(
        path.join(tmpRoot, "src", "views", "sale", "customer-cli", "page-spec.json"),
        "utf8",
      ),
    );
    expect(spec.scenarioRef).toBe("../../../../customer.scenario.json");
    expect(
      fs.existsSync(path.resolve(tmpRoot, "src/views/sale/customer-cli", spec.scenarioRef)),
    ).toBe(true);
  });

  it("validate 自动核对 scenarioRef：无漂移时零 W1，手改产物后报 W1 漂移", () => {
    const pageDir = path.join(tmpRoot, "src", "views", "sale", "customer-cli");
    // 裸临时项目可能有其他 warn/error（与 W1 无关），只断言 W1 出现/消失
    const tolerant = (cliArgs) => runCliFail(tmpRoot, cliArgs)?.stdout ?? "";
    expect(tolerant(["validate", "--json"])).not.toContain("W1");

    const dataTs = path.join(pageDir, "data.ts");
    const original = fs.readFileSync(dataTs, "utf8");
    fs.writeFileSync(dataTs, original.replace("minWidth: 150", "minWidth: 999"));
    const drifted = tolerant(["validate", "--json"]);
    expect(drifted).toContain("W1");
    expect(drifted).toContain("漂移");
    fs.writeFileSync(dataTs, original);
    expect(tolerant(["validate", "--json"])).not.toContain("W1");
  });

  it("from-spec：page-spec 引导为 scenario JSON 并可渲染", () => {
    const specPath = path.join(tmpRoot, "page-spec.input.json");
    fs.writeFileSync(specPath, JSON.stringify({
      schemaVersion: 1,
      pageId: "FS_CLI_001",
      page: "引导测试页",
      dir: "src/views/bench/fromspec",
      mode: "LIST",
      query: [{ name: "code", label: "编码" }],
      columns: [{ name: "code", label: "编码" }],
      toolbar: [{ label: "新增", color: "primary" }],
      operations: [{ label: "编辑" }, { label: "删除" }],
      formSections: [],
      features: {},
    }));
    const out = runCli(tmpRoot, [
      "scenario", "from-spec", "--input", "page-spec.input.json",
      "--service", "bench", "--resource", "record", "--table-cid", "fs-cli001",
      "--output", "fromspec.scenario.json", "--confirm",
    ]);
    expect(out).toContain("已生成");
    const doc = JSON.parse(fs.readFileSync(path.join(tmpRoot, "fromspec.scenario.json"), "utf8"));
    expect(doc.pattern).toBe("list");
    expect(doc.renderTrack).toBe("codegen");
    const rendered = runCli(tmpRoot, [
      "scenario", "render", "--input", "fromspec.scenario.json",
      "--output", "src/views/bench/fromspec", "--confirm",
    ]);
    expect(rendered).toContain("已生成");
    const dataTs = fs.readFileSync(
      path.join(tmpRoot, "src", "views", "bench", "fromspec", "data.ts"), "utf8",
    );
    expect(dataTs).toContain('list: "/bench/record/queryPage"');
    expect(dataTs).toContain('export const TABLE_CID = "fs-cli001"');
  });

  it("from-spec 缺编译参数时报错退出", () => {
    const result = runCliFail(tmpRoot, [
      "scenario", "from-spec", "--input", "page-spec.input.json",
    ]);
    expect(result).not.toBeNull();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("serviceShort");
  });
});

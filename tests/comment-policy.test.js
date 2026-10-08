import { describe, expect, it } from "vitest";
import { headerCommentIssue, inspectFileHeader } from "../lib/file-comments.js";
import { extractScenario } from "../lib/scenario-extract.js";
import { compileScenario } from "../lib/scenario-compiler.js";
import { buildListScenario, buildMasterDetailScenario } from "../scripts/benchmark-scenario.js";

// 结构检查必须只认注释节点，并兼容不用文件头插件的项目。
describe("职责说明结构边界", () => {
  it.each([
    ["<!-- @Description: -->\n<template />", "vue", "warn"],
    ["<!--\n * @Description:   \n * @Author: CHENY\n-->", "vue", "warn"],
    ["/* @Description: 这是默认设置,请设置customMade */", "ts", "warn"],
    ["<!-- @Author: CHENY -->", "vue", "info"],
    ["<!-- 停机记录：列表视图与编辑交互。 -->", "vue", null],
    ["// 停机记录：字段、状态与提交逻辑。\nexport const value = 1;", "ts", null],
    ["<!-- @Description: 提醒用户请设置筛选条件。 -->", "vue", null],
    ['const value = "这是默认设置 @Description:";', "ts", null],
    ["\uFEFF<!-- @Description: 生产 > 炼钢 > 停机记录；页面视图。 -->", "vue", null],
  ])("检查 %s", (source, kind, expected) => {
    expect(headerCommentIssue(source, kind)?.level ?? null).toBe(expected);
  });
  it("空 Description 不吞下一行作者信息", () => {
    expect(inspectFileHeader("<!--\n * @Description: \n * @Author: CHENY\n-->", "vue").description).toBe("");
  });
});

describe("真实 scenario 产物职责头", () => {
  it.each(["list", "master-detail", "runtime"])("%s 轨所有前端产物有职责且不推断停机业务", (track) => {
    const doc = track === "master-detail" ? buildMasterDetailScenario() : buildListScenario({});
    if (track === "runtime") {
      doc.renderTrack = "runtime"; doc.pattern = "workstation";
      doc.requires = { renderer: "@/components/pattern/PatternPageRenderer.vue" };
      doc.toolbar = []; doc.operations = [];
    }
    doc.menuPath = "生产 > 炼钢 > 客户档案";
    const result = compileScenario(doc);
    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    const extracted = extractScenario({ dataContent: result.files["data.ts"], vueContent: result.files["index.vue"], definitionContent: result.files["definition.ts"], pageSpec: JSON.parse(result.files["page-spec.json"]) });
    expect(extracted.doc.menuPath).toBe(doc.menuPath);
    const rebuilt = compileScenario(extracted.doc);
    expect(rebuilt.ok, JSON.stringify(rebuilt.errors)).toBe(true);
    expect(rebuilt.files["index.vue"]).toBe(result.files["index.vue"]);
    for (const [file, content] of Object.entries(result.files)) {
      if (!/\.(vue|ts|scss)$/.test(file)) continue;
      const header = inspectFileHeader(content, file.endsWith("vue") ? "vue" : "ts");
      expect(header.hasHeader, file).toBe(true);
      expect(header.description, file).toContain(doc.menuPath);
      expect(header.description).not.toContain("原因联动");
      expect(header.description).not.toContain("api.md");
    }
  });
  it("菜单事实不足时明确未确认，不伪造作者与时间", () => {
    const result = compileScenario(buildListScenario({}));
    expect(result.ok).toBe(true);
    expect(result.files["index.vue"]).toContain("菜单路径未确认");
    expect(result.files["data.ts"]).toContain("菜单路径未确认");
    expect(result.files["index.vue"]).not.toMatch(/@Author|@Date/);
  });
  it("菜单名称不能注入注释结束符或换行", () => {
    const doc = buildListScenario({}); doc.menuPath = "生产 -->\n<script> */";
    const result = compileScenario(doc);
    expect(result.ok).toBe(true);
    expect(result.files["index.vue"].split("-->")[0]).not.toContain("\n<script>");
    expect(result.files["data.ts"].split("\n")[0]).not.toContain("*/");
  });
});

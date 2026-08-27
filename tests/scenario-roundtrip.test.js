"use strict";

/**
 * tests/scenario-roundtrip.test.js — wl-scenario 双轨编译器往返与门禁验证
 *
 * 本文件是"JSON 提取能否百分百还原"的机器证明：
 *   1. canonical fixture：compile → S1~S5 门禁零偏差；extract(compile(doc)) 定点
 *      （data.ts / index.vue / page-spec.json 字节级一致）
 *   2. 真实存量样例（templates/sale/demo/domestic-trade-order，旧形态）：
 *      提取 spec 对原代码零偏差（提取保真）；编译产物对同一 spec 零偏差；
 *      查询/列/按钮/操作/API 语义与原页面一致，且升级到 canonical（cid/agGrid/renderOps）
 *   3. extensions 逐字往返（字节级）
 *   4. runtime 轨：definition 委托链被既有 validateDefinitionDelegation 识别且零偏差
 *   5. 非法输入（缺 handler / planned 模式 / 轨道不一致 / runtime 自定义动作）全部阻断
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateScenario, scenarioToPageSpec } from "../lib/scenario-template.js";
import { compileScenario } from "../lib/scenario-compiler.js";
import { extractScenario } from "../lib/scenario-extract.js";
import { compareSpecToCode, validateSpecShape, validateDefinitionDelegation } from "../lib/page-spec.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = path.resolve(
  __dirname,
  "..",
  "files",
  ".wl-skills",
  "templates",
  "sale",
  "demo",
  "domestic-trade-order",
);

function canonicalFixture() {
  return {
    kind: "wl-scenario",
    schemaVersion: 1,
    templateId: "universal.list",
    domain: "sale",
    pattern: "list",
    renderTrack: "codegen",
    page: "客户档案",
    pageId: "CUST001",
    dir: "src/views/sale/customer",
    serviceShort: "sale",
    resourceName: "customer",
    tableCid: "cust-lx2k1",
    query: [
      { name: "companyName", label: "公司名称", type: "input" },
      { name: "groupOrderNo", label: "集团订单号", type: "input" },
      { name: "orderStatus", label: "订单状态", type: "dict", dictCode: "ORDER_STATUS" },
      {
        name: "productSegment",
        label: "产品板块",
        type: "select",
        options: [
          { label: "板块一", value: "P1" },
          { label: "板块二", value: "P2" },
        ],
      },
      {
        name: "billDate",
        label: "单据日期",
        type: "dateRange",
        startName: "startDate",
        endName: "endDate",
      },
      { name: "salesOrg", label: "销售机构", type: "dict", dictCode: "SALES_ORG" },
    ],
    columns: [
      { name: "companyName", label: "公司名称", minWidth: 150 },
      { name: "groupOrderNo", label: "集团订单号", minWidth: 150 },
      { name: "orderStatus", label: "订单状态", type: "dict", dictCode: "ORDER_STATUS" },
      { name: "orderWeight", label: "订单重量", minWidth: 100, align: "right" },
      { name: "salesOrg", label: "销售机构", minWidth: 120 },
      { name: "settlementUser", label: "结算用户", minWidth: 200 },
    ],
    toolbar: [
      { label: "新增", color: "primary" },
      {
        label: "整单复制",
        color: "default",
        plain: true,
        action: "custom",
        handler: "() => {}",
      },
      { label: "审核", color: "success", action: "custom", handler: "() => {}" },
      { label: "退回", color: "danger", action: "custom", handler: "() => {}" },
    ],
    operations: [
      { label: "编辑", action: "edit" },
      { label: "删除", action: "del" },
      { label: "查看", action: "view" },
    ],
    formSections: [
      {
        name: "base",
        label: "基本信息",
        fields: [
          { name: "companyName", label: "公司名称", required: true },
          { name: "groupOrderNo", label: "集团订单号", required: true },
          { name: "orderStatus", label: "订单状态" },
          { name: "orderWeight", label: "订单重量", placeholder: "请输入订单重量" },
          { name: "settlementUser", label: "结算用户" },
          { name: "salesOrg", label: "销售机构" },
        ],
      },
    ],
    features: {},
    extensions: [
      {
        slot: "customMethods",
        code: "    async refreshStats() {\n      await Promise.resolve();\n    }",
      },
    ],
  };
}

describe("scenario 契约校验", () => {
  it("canonical fixture 通过校验", () => {
    expect(validateScenario(canonicalFixture())).toEqual([]);
  });

  it("custom 动作缺 handler 被阻断", () => {
    const doc = canonicalFixture();
    doc.toolbar.push({ label: "同步", color: "default", action: "custom" });
    const errs = validateScenario(doc);
    expect(errs.some((e) => e.includes("同步") && e.includes("handler"))).toBe(true);
  });

  it("handler 内联 import 被阻断", () => {
    const doc = canonicalFixture();
    doc.toolbar[1].handler = '() => { import("x") }';
    expect(validateScenario(doc).some((e) => e.includes("禁止 import/export"))).toBe(true);
  });

  it("planned 模式 render 被阻断、validate 仅提示", () => {
    const doc = canonicalFixture();
    doc.pattern = "detail-tabs";
    doc.renderTrack = "runtime";
    doc.requires = { renderer: "@/components/pattern/PatternPageRenderer.vue" };
    expect(validateScenario(doc, { requireImplemented: true }).some((e) => e.includes("planned"))).toBe(true);
    expect(compileScenario(doc).ok).toBe(false);
  });

  it("轨道不一致被阻断", () => {
    const doc = canonicalFixture();
    expect(compileScenario(doc, { track: "runtime" }).ok).toBe(false);
  });

  it("runtime 轨禁止 custom handler 动作", () => {
    const doc = runtimeFixture();
    doc.toolbar.push({ label: "同步", color: "default", action: "custom", handler: "() => {}" });
    expect(validateScenario(doc).some((e) => e.includes("runtime 轨 v1"))).toBe(true);
  });
});

function runtimeFixture() {
  return {
    kind: "wl-scenario",
    schemaVersion: 1,
    templateId: "produce.workstation-record",
    domain: "produce",
    pattern: "workstation",
    renderTrack: "runtime",
    page: "电炉实绩管理",
    pageId: "PLPM002",
    dir: "src/views/produce/steelmaking/performance/eaf",
    requires: { renderer: "@/components/pattern/PatternPageRenderer.vue" },
    query: [
      { name: "heat_no", label: "炉号", type: "input" },
      { name: "plan_status", label: "计划状态", type: "dict", dictCode: "pl_plan_status" },
    ],
    columns: [
      { name: "heat_no", label: "炉号", minWidth: 120 },
      { name: "steel_code", label: "钢种", minWidth: 120 },
    ],
    toolbar: [{ label: "新增", color: "primary" }],
    operations: [
      { label: "编辑", action: "edit" },
      { label: "删除", action: "del" },
    ],
    formSections: [
      {
        name: "identity",
        label: "身份信息",
        fields: [{ name: "heat_no", label: "炉号", required: true }],
      },
    ],
    features: {},
  };
}

describe("codegen 轨：canonical 编译与门禁", () => {
  const doc = canonicalFixture();
  const compiled = compileScenario(doc);

  it("编译成功并产出四件套", () => {
    expect(compiled.ok).toBe(true);
    expect(Object.keys(compiled.files).sort()).toEqual(
      ["data.ts", "index.scss", "index.vue", "page-spec.json"].sort(),
    );
  });

  it("输出符合 canonical 最佳实践形态", () => {
    const dataTs = compiled.files["data.ts"];
    const vue = compiled.files["index.vue"];
    expect(vue).toContain('render-type="agGrid"');
    expect(dataTs).toContain("defineColumns([");
    expect(dataTs).toContain("renderOps([");
    expect(dataTs).toContain("TABLE_CID");
    expect(vue).toContain('size="small"');
    expect(dataTs).toContain("RequestMethod.post");
    expect(dataTs).toContain("this.page.value.current -= 1");
    expect(vue).toContain('ref="editModalRef" v-bind="modalConfig" @ok="search"');
  });

  it("生成 page-spec 通过 strict 结构校验", () => {
    const spec = JSON.parse(compiled.files["page-spec.json"]);
    expect(validateSpecShape(spec, { strict: true })).toEqual([]);
    expect(spec.features.definitionSource).toBeUndefined();
  });

  it("S1~S5+D3 门禁对编译产物零偏差", () => {
    const spec = scenarioToPageSpec(doc, { quiet: true });
    expect(compareSpecToCode(spec, compiled.files["data.ts"], "src/views/sale/customer")).toEqual([]);
  });

  it("extract(compile(doc)) 定点：三产物字节级一致", () => {
    const spec = scenarioToPageSpec(doc, { quiet: true });
    const { doc: doc2, warnings } = extractScenario({
      dataContent: compiled.files["data.ts"],
      vueContent: compiled.files["index.vue"],
      pageSpec: spec,
    });
    expect(warnings).toEqual([]);
    const compiled2 = compileScenario(doc2);
    expect(compiled2.ok).toBe(true);
    expect(compiled2.files["data.ts"]).toBe(compiled.files["data.ts"]);
    expect(compiled2.files["index.vue"]).toBe(compiled.files["index.vue"]);
    expect(compiled2.files["page-spec.json"]).toBe(compiled.files["page-spec.json"]);
  });

  it("extensions 逐字往返（字节级）", () => {
    const spec = scenarioToPageSpec(doc, { quiet: true });
    const { doc: doc2 } = extractScenario({
      dataContent: compiled.files["data.ts"],
      vueContent: compiled.files["index.vue"],
      pageSpec: spec,
    });
    const ext = doc2.extensions.find((e) => e.slot === "customMethods");
    expect(ext.code).toBe(doc.extensions[0].code);
  });
});

describe("codegen 轨：真实存量样例（旧形态）提取保真与升级", () => {
  const originalData = fs.readFileSync(path.join(SAMPLE_DIR, "data.ts"), "utf8");
  const originalVue = fs.readFileSync(path.join(SAMPLE_DIR, "index.vue"), "utf8");

  function extractOriginal() {
    return extractScenario({
      dataContent: originalData,
      vueContent: originalVue,
      options: { pageId: "SALE_DEMO_001", tableCid: "dto-1a2b3c" },
    });
  }

  it("提取成功且捕获全部声明式核心", () => {
    const { doc, warnings } = extractOriginal();
    expect(doc.query.map((q) => q.name)).toEqual([
      "companyName",
      "groupOrderNo",
      "productionOrderNo",
      "orderStatus",
      "dateRange",
      "salesCompany",
      "salesOrg",
      "salesEmployeeId",
      "productSegment",
    ]);
    expect(doc.query.find((q) => q.name === "orderStatus")).toMatchObject({
      type: "dict",
      dictCode: "ORDER_STATUS",
    });
    expect(doc.query.find((q) => q.name === "dateRange")).toMatchObject({
      type: "dateRange",
      startName: "startDate",
      endName: "endDate",
    });
    expect(doc.columns.map((c) => c.name)).toHaveLength(12);
    expect(doc.toolbar.map((b) => b.label)).toHaveLength(16);
    expect(doc.toolbar[0]).toMatchObject({ label: "新增", color: "primary", action: "openModal" });
    expect(doc.operations.map((o) => `${o.label}:${o.action}`)).toEqual(["编辑:edit", "删除:del"]);
    expect(doc.formSections[0].fields).toHaveLength(12);
    expect(doc.apiConfig).toMatchObject({
      list: "/api/domestic-trade-order/list",
      remove: "/api/domestic-trade-order/remove",
      getById: "/api/domestic-trade-order/getOneById",
      save: "/api/domestic-trade-order/save",
      update: "/api/domestic-trade-order/update",
    });
    // 旧形态的非 canonical 能力被显式报告，不静默丢弃
    expect(warnings.some((w) => w.includes("useTableDelete"))).toBe(true);
  });

  it("提取 spec 对原代码除旧形态已知缺陷外零偏差（提取保真）", () => {
    const { doc } = extractOriginal();
    const spec = scenarioToPageSpec(doc, { quiet: true });
    // 旧形态两类已知缺陷（canonical 编译均消除）：
    //   1. 查询项提升为模块级 queryItemsConfig，queryDef 只返回引用 → S1 读不到内联数组
    //   2. 操作列无 name: "_action"，既有解析器把嵌套 operations 项的 name 误读为列（如 多：edit）
    const knownOldFormDefect = (issue) =>
      (issue.rule === "S1" && issue.text.includes("未解析到对应实现")) ||
      (issue.rule === "S2" && /（多：(edit|del|view|remove|danger)）/.test(issue.text));
    const issues = compareSpecToCode(spec, originalData, "sale/demo").filter(
      (issue) => !knownOldFormDefect(issue),
    );
    expect(issues).toEqual([]);
  });

  it("编译产物对同一 spec 零偏差，且语义与原页面一致", () => {
    const { doc } = extractOriginal();
    const spec = scenarioToPageSpec(doc, { quiet: true });
    const compiled = compileScenario(doc);
    expect(compiled.ok, JSON.stringify(compiled.errors)).toBe(true);
    expect(compareSpecToCode(spec, compiled.files["data.ts"], "sale/demo")).toEqual([]);

    const dataTs = compiled.files["data.ts"];
    for (const [key, url] of Object.entries(doc.apiConfig)) {
      expect(dataTs).toContain(`${key}: "${url}"`);
    }
    // 原页面缺失的 canonical 能力被补齐（升级而非降级）
    expect(dataTs).toContain("defineColumns([");
    expect(dataTs).toContain("renderOps([");
    expect(compiled.files["index.vue"]).toContain('render-type="agGrid"');
    expect(dataTs).toContain('export const TABLE_CID = "dto-1a2b3c"');
    expect(compiled.files["index.vue"]).toContain('ref="editModalRef" v-bind="modalConfig" @ok="search"');
  });

  it("旧样例同样满足定点往返", () => {
    const { doc } = extractOriginal();
    const spec = scenarioToPageSpec(doc, { quiet: true });
    const compiled = compileScenario(doc);
    const { doc: doc2 } = extractScenario({
      dataContent: compiled.files["data.ts"],
      vueContent: compiled.files["index.vue"],
      pageSpec: spec,
    });
    const compiled2 = compileScenario(doc2);
    expect(compiled2.ok).toBe(true);
    expect(compiled2.files["data.ts"]).toBe(compiled.files["data.ts"]);
    expect(compiled2.files["index.vue"]).toBe(compiled.files["index.vue"]);
    expect(compiled2.files["page-spec.json"]).toBe(compiled.files["page-spec.json"]);
  });
});

describe("codegen 轨：master-detail（新增 pattern）", () => {
  const doc = {
    kind: "wl-scenario",
    schemaVersion: 1,
    templateId: "universal.master-detail",
    domain: "produce",
    pattern: "master-detail",
    renderTrack: "codegen",
    page: "计划调度",
    pageId: "PLPS001",
    dir: "src/views/produce/planning/dispatch",
    serviceShort: "pl",
    resourceName: "schedule",
    tableCid: "plps-dis01",
    query: [
      { name: "plan_no", label: "计划炉号", type: "input" },
      { name: "plan_status", label: "计划状态", type: "dict", dictCode: "pl_plan_status" },
    ],
    columns: [
      { name: "plan_no", label: "计划炉号", minWidth: 140 },
      { name: "steel_code", label: "钢种", type: "dict", dictCode: "pl_steel_code" },
      { name: "plan_status", label: "计划状态", type: "dict", dictCode: "pl_plan_status" },
    ],
    toolbar: [
      { label: "指示下达", color: "primary", action: "custom", handler: "() => {}" },
      { label: "指示取消", color: "default", action: "custom", handler: "() => {}" },
    ],
    operations: [],
    subTables: [
      {
        name: "detail",
        label: "计划钢坯明细",
        resource: "schedule/plan-billet",
        query: [],
        columns: [
          { name: "billet_no", label: "钢坯号", minWidth: 140 },
          { name: "billet_status", label: "坯状态", minWidth: 120, type: "dict", dictCode: "pl_billet_status" },
        ],
        toolbar: [],
        operations: [],
      },
    ],
    features: {},
  };
  const compiled = compileScenario(doc);

  it("编译成功，产物含 jh-drag-row + 双表 + createBottomPage", () => {
    expect(compiled.ok, JSON.stringify(compiled.errors)).toBe(true);
    const vue = compiled.files["index.vue"];
    const dataTs = compiled.files["data.ts"];
    expect(vue).toContain("<jh-drag-row :top-height=\"350\">");
    expect(vue).toContain("<template #top>");
    expect(vue).toContain("<template #bottom>");
    expect(vue).toContain("@row-dblclick");
    expect(dataTs).toContain("export function createBottomPage()");
    expect(dataTs).toContain('bottomList: "/pl/schedule/plan-billet/queryPage"');
    expect(dataTs).toContain("getAction(API_CONFIG.bottomList");
    expect(dataTs).toContain("BOTTOM_TABLE_CID = `${TABLE_CID}-sub1`");
    expect(compiled.files["index.scss"]).toContain(".drager_row");
  });

  it("生成 page-spec mode=MASTER_DETAIL 且 strict 通过", () => {
    const spec = JSON.parse(compiled.files["page-spec.json"]);
    expect(spec.mode).toBe("MASTER_DETAIL");
    expect(validateSpecShape(spec, { strict: true })).toEqual([]);
  });

  it("主表 S1~S5 门禁零偏差（首个 queryDef/columnsDef/toolbarDef 属主表）", () => {
    const spec = scenarioToPageSpec(doc, { quiet: true });
    expect(compareSpecToCode(spec, compiled.files["data.ts"], "produce/planning")).toEqual([]);
  });

  it("extract(compile(doc)) 定点：三产物字节级一致（含从表）", () => {
    const spec = scenarioToPageSpec(doc, { quiet: true });
    const { doc: doc2 } = extractScenario({
      dataContent: compiled.files["data.ts"],
      vueContent: compiled.files["index.vue"],
      pageSpec: spec,
    });
    expect(doc2.pattern).toBe("master-detail");
    expect(doc2.subTables).toHaveLength(1);
    expect(doc2.subTables[0].columns.map((c) => c.name)).toEqual(["billet_no", "billet_status"]);
    expect(doc2.subTables[0].columns[1]).toMatchObject({ type: "dict", dictCode: "pl_billet_status" });
    const compiled2 = compileScenario(doc2);
    expect(compiled2.ok, JSON.stringify(compiled2.errors)).toBe(true);
    expect(compiled2.files["data.ts"]).toBe(compiled.files["data.ts"]);
    expect(compiled2.files["index.vue"]).toBe(compiled.files["index.vue"]);
    expect(compiled2.files["page-spec.json"]).toBe(compiled.files["page-spec.json"]);
  });

  it("多从表被校验阻断", () => {
    const bad = JSON.parse(JSON.stringify(doc));
    bad.subTables.push(JSON.parse(JSON.stringify(bad.subTables[0])));
    expect(validateScenario(bad).some((e) => e.includes("仅支持单从表"))).toBe(true);
  });
});

describe("codegen 轨：tree-list / record-form / form-route / change-history（第二批 pattern）", () => {
  function treeListDoc() {
    return {
      kind: "wl-scenario",
      schemaVersion: 1,
      templateId: "universal.tree-list",
      domain: "mdata",
      pattern: "tree-list",
      renderTrack: "codegen",
      page: "物料分类管理",
      pageId: "MD00CL01",
      dir: "src/views/mdata/material/classify",
      serviceShort: "md",
      resourceName: "material",
      treeResource: "material-class",
      tableCid: "mdmc-tl001",
      query: [{ name: "materialName", label: "物料名称", type: "input" }],
      columns: [
        { name: "materialCode", label: "物料编码", minWidth: 140 },
        { name: "materialName", label: "物料名称", minWidth: 160 },
      ],
      toolbar: [{ label: "新增", color: "primary" }],
      operations: [
        { label: "编辑", action: "edit" },
        { label: "删除", action: "del" },
      ],
      formSections: [
        {
          name: "base",
          label: "基本信息",
          fields: [{ name: "materialName", label: "物料名称", required: true }],
        },
      ],
      features: {},
    };
  }

  function recordFormDoc() {
    return {
      kind: "wl-scenario",
      schemaVersion: 1,
      templateId: "produce.record-form",
      domain: "produce",
      pattern: "record-form",
      renderTrack: "codegen",
      page: "电炉实绩录入",
      pageId: "PLRF0001",
      dir: "src/views/produce/steelmaking/record/eaf",
      tableCid: "plrf-eaf01",
      apiConfig: {
        getByKey: "/pl/eaf-actual/getByHeatNo",
        saveOrUpdate: "/pl/eaf-actual/saveOrUpdate",
      },
      query: [{ name: "heat_no", label: "炉号", type: "input" }],
      columns: [],
      toolbar: [],
      operations: [],
      formSections: [
        {
          name: "identity",
          label: "身份信息",
          fields: [
            { name: "heat_no", label: "炉号", required: true },
            { name: "steel_code", label: "钢种", type: "dict", dictCode: "pl_steel_code" },
          ],
        },
        {
          name: "actual",
          label: "实绩信息",
          fields: [{ name: "tap_temp", label: "出钢温度" }],
        },
      ],
      subTables: [
        {
          name: "detail",
          label: "物料明细",
          query: [],
          columns: [
            { name: "material_name", label: "物料名称", minWidth: 140 },
            { name: "weight", label: "重量", minWidth: 100 },
          ],
          toolbar: [],
          operations: [],
        },
      ],
      features: { responseMapping: { main: "eafActual", details: "materials" } },
    };
  }

  function formRouteDoc() {
    return {
      kind: "wl-scenario",
      schemaVersion: 1,
      templateId: "sale.form-route",
      domain: "sale",
      pattern: "form-route",
      renderTrack: "codegen",
      page: "客户档案详情",
      pageId: "SAFR0001",
      dir: "src/views/sale/customer/detail",
      serviceShort: "sale",
      resourceName: "customer",
      tableCid: "safd-fr001",
      query: [],
      columns: [],
      toolbar: [],
      operations: [],
      formSections: [
        {
          name: "basic",
          label: "基本信息",
          fields: [
            { name: "companyName", label: "公司名称", required: true },
            { name: "taxNo", label: "纳税号" },
          ],
        },
      ],
      features: {},
    };
  }

  function changeHistoryDoc() {
    return {
      kind: "wl-scenario",
      schemaVersion: 1,
      templateId: "sale.change-history",
      domain: "sale",
      pattern: "change-history",
      renderTrack: "codegen",
      page: "客户档案",
      pageId: "SACH0001",
      dir: "src/views/sale/customer/change-history",
      serviceShort: "sale",
      resourceName: "customer",
      tableCid: "sach-ch01",
      query: [],
      columns: [],
      toolbar: [],
      operations: [],
      requires: { components: ["c_customerTabs"] },
      features: {},
    };
  }

  function expectRoundtripFixedPoint(doc, expectedPattern) {
    const compiled = compileScenario(doc);
    expect(compiled.ok, JSON.stringify(compiled.errors)).toBe(true);
    expect(compiled.tableCid).toBe(doc.tableCid);
    const spec = scenarioToPageSpec(doc, { quiet: true });
    const { doc: doc2 } = extractScenario({
      dataContent: compiled.files["data.ts"],
      vueContent: compiled.files["index.vue"],
      pageSpec: spec,
    });
    expect(doc2.pattern).toBe(expectedPattern);
    const compiled2 = compileScenario(doc2);
    expect(compiled2.ok, JSON.stringify(compiled2.errors)).toBe(true);
    expect(compiled2.files["data.ts"]).toBe(compiled.files["data.ts"]);
    expect(compiled2.files["index.vue"]).toBe(compiled.files["index.vue"]);
    expect(compiled2.files["index.scss"]).toBe(compiled.files["index.scss"]);
    expect(compiled2.files["page-spec.json"]).toBe(compiled.files["page-spec.json"]);
    return compiled;
  }

  it("tree-list：jh-drag-col + C_Tree + loadTree + 定点往返", () => {
    const compiled = expectRoundtripFixedPoint(treeListDoc(), "tree-list");
    expect(compiled.files["index.vue"]).toContain("<jh-drag-col");
    expect(compiled.files["index.vue"]).toContain("<C_Tree");
    expect(compiled.files["data.ts"]).toContain('tree: "/md/material-class/tree"');
    expect(compiled.files["data.ts"]).toContain("export async function loadTree()");
    expect(compiled.files["data.ts"]).toContain("created.queryParam.value.treeId = data.id");
  });

  it("tree-list 缺 treeResource 被阻断", () => {
    const bad = treeListDoc();
    delete bad.treeResource;
    expect(validateScenario(bad).some((e) => e.includes("treeResource"))).toBe(true);
  });

  it("record-form：composable 无分页 + 分区表单 + 明细表 + 定点往返", () => {
    const compiled = expectRoundtripFixedPoint(recordFormDoc(), "record-form");
    const dataTs = compiled.files["data.ts"];
    expect(dataTs).toContain('getByKey: "/pl/eaf-actual/getByHeatNo"');
    expect(dataTs).toContain("res.data?.eafActual || {}");
    expect(dataTs).toContain("bottomTableData.value = res.data?.materials || []");
    expect(dataTs).toContain('title: "身份信息"');
    expect(dataTs).toContain('logicValue: "pl_steel_code"');
    expect(dataTs).toContain("debounce");
    expect(dataTs).not.toContain("AbstractPageQueryHook");
    expect(compiled.files["index.vue"]).not.toContain("jh-pagination");
    expect(compiled.files["index.vue"]).toContain('ref="formRef"');
  });

  it("record-form 缺 responseMapping / getByKey 被阻断", () => {
    const bad = recordFormDoc();
    delete bad.features.responseMapping;
    expect(validateScenario(bad).some((e) => e.includes("responseMapping"))).toBe(true);
    const bad2 = recordFormDoc();
    delete bad2.apiConfig.getByKey;
    expect(validateScenario(bad2).some((e) => e.includes("getByKey"))).toBe(true);
  });

  it("form-route：路由编辑模式 + 保存/取消 + 定点往返", () => {
    const compiled = expectRoundtripFixedPoint(formRouteDoc(), "form-route");
    const vue = compiled.files["index.vue"];
    expect(vue).toContain("route.query.id");
    expect(vue).toContain("@click=\"handleSave\"");
    expect(compiled.files["data.ts"]).toContain("export function useCustomerForm(formRef: any)");
    expect(compiled.files["data.ts"]).toContain("router.back()");
    expect(compiled.files["data.ts"]).toContain('getById: "/sale/customer/getById/{id}"');
  });

  it("form-route：字段 ≥10 混合必填时发射只看必填切换", () => {
    const doc = formRouteDoc();
    const fields = Array.from({ length: 10 }, (_, i) => ({
      name: `f${i}`,
      label: `字段${i}`,
      required: i % 2 === 0,
    }));
    doc.formSections[0].fields = fields;
    const compiled = compileScenario(doc);
    expect(compiled.ok, JSON.stringify(compiled.errors)).toBe(true);
    expect(compiled.files["index.vue"]).toContain("useFormRequiredOnly");
    expect(compiled.files["index.vue"]).toContain("只看必填项");
    expect(compiled.files["index.vue"]).toContain(":items=\"visibleItems\"");
  });

  it("form-route 空分区被阻断", () => {
    const bad = formRouteDoc();
    bad.formSections = [];
    expect(validateScenario(bad).some((e) => e.includes("formSections"))).toBe(true);
  });

  it("change-history：双栏时间线 + composable + 定点往返", () => {
    const compiled = expectRoundtripFixedPoint(changeHistoryDoc(), "change-history");
    expect(compiled.files["index.vue"]).toContain("history-panel");
    expect(compiled.files["index.vue"]).toContain('<c_customerTabs ref="tabsRef" mode="view" />');
    expect(compiled.files["data.ts"]).toContain('changeHistoryList: "/sale/customer/changeHistory/queryPage"');
    expect(compiled.files["data.ts"]).toContain("tabsRef.value?.loadDiffData(");
  });

  it("change-history 缺业务 Tabs 组件被阻断", () => {
    const bad = changeHistoryDoc();
    bad.requires = {};
    expect(validateScenario(bad).some((e) => e.includes("requires.components[0]"))).toBe(true);
  });

  it("四个新 pattern 的 page-spec 均通过 strict 校验且无列表误报", () => {
    for (const doc of [treeListDoc(), recordFormDoc(), formRouteDoc(), changeHistoryDoc()]) {
      const spec = JSON.parse(compileScenario(doc).files["page-spec.json"]);
      expect(validateSpecShape(spec, { strict: true }), doc.pattern).toEqual([]);
    }
    const nonListSpec = JSON.parse(compileScenario(recordFormDoc()).files["page-spec.json"]);
    expect(nonListSpec.query).toEqual([]);
    expect(nonListSpec.columns).toEqual([]);
  });
});

describe("runtime 轨：definition + 薄壳 + 委托链", () => {
  const doc = runtimeFixture();
  const compiled = compileScenario(doc);

  it("编译成功并产出五件套", () => {
    expect(compiled.ok).toBe(true);
    expect(Object.keys(compiled.files).sort()).toEqual(
      ["data.ts", "definition.ts", "index.scss", "index.vue", "page-spec.json"].sort(),
    );
  });

  it("index.vue 是 10 行薄壳、data.ts 是 2 行转发（薄于手写 12/3）", () => {
    expect(compiled.files["index.vue"].split("\n").filter(Boolean)).toHaveLength(10);
    expect(compiled.files["data.ts"].split("\n").filter(Boolean)).toHaveLength(2);
    expect(compiled.files["index.vue"]).toContain('import PatternPageRenderer from "@/components/pattern/PatternPageRenderer.vue"');
  });

  it("page-spec 声明 definitionSource 且委托链被既有校验识别", () => {
    const spec = JSON.parse(compiled.files["page-spec.json"]);
    expect(spec.features.definitionSource).toBe("./definition");
    expect(validateSpecShape(spec, { strict: true })).toEqual([]);
    const delegation = validateDefinitionDelegation(spec, compiled.files["data.ts"], "produce/eaf");
    expect(delegation.delegated).toBe(true);
    expect(delegation.issues).toEqual([]);
  });

  it("definition 可被提取器反解析并定点往返", () => {
    const spec = JSON.parse(compiled.files["page-spec.json"]);
    const { doc: doc2 } = extractScenario({
      dataContent: compiled.files["data.ts"],
      definitionContent: compiled.files["definition.ts"],
      vueContent: compiled.files["index.vue"],
      pageSpec: spec,
    });
    const compiled2 = compileScenario(doc2);
    expect(compiled2.ok).toBe(true);
    expect(compiled2.files["definition.ts"]).toBe(compiled.files["definition.ts"]);
    expect(compiled2.files["index.vue"]).toBe(compiled.files["index.vue"]);
    expect(compiled2.files["data.ts"]).toBe(compiled.files["data.ts"]);
    expect(compiled2.files["page-spec.json"]).toBe(compiled.files["page-spec.json"]);
  });

  it("缺 requires.renderer 时校验阻断", () => {
    const bad = { ...runtimeFixture(), requires: {} };
    expect(validateScenario(bad).some((e) => e.includes("requires.renderer"))).toBe(true);
  });
});

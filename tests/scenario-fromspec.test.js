"use strict";

/**
 * tests/scenario-fromspec.test.js — page-spec → scenario JSON 引导转换器
 *
 * 1. LIST spec → scenario：映射保真（查询类型推断/按钮动作分类/表单分区）
 * 2. MASTER_DETAIL spec → master-detail pattern（编译器已实现，端到端可渲染）
 * 3. 未登记 mode 阻断；planned 模式转换成功但 render 阻断（提示而非静默）
 * 4. 业务按钮 TODO stub 不猜测语义（notes 提示人工实现）
 */

import { describe, it, expect } from "vitest";
import { scenarioFromPageSpec } from "../lib/scenario-fromspec.js";
import { compileScenario } from "../lib/scenario-compiler.js";
import { validateScenario } from "../lib/scenario-template.js";

function listSpec() {
  return {
    schemaVersion: 1,
    pageId: "FS001",
    page: "客户档案",
    dir: "src/views/sale/customer",
    mode: "LIST",
    query: [
      { name: "companyName", label: "公司名称" },
      { name: "status", label: "状态", type: "dict", dictCode: "CUST_STATUS" },
      { name: "billDate", label: "单据日期", startName: "startDate", endName: "endDate" },
    ],
    columns: [
      { name: "companyName", label: "公司名称" },
      { name: "status", label: "状态", type: "dict", dictCode: "CUST_STATUS" },
    ],
    toolbar: [
      { label: "新增", color: "primary" },
      { label: "锁定", color: "warning" },
    ],
    operations: [
      { label: "编辑" },
      { label: "删除" },
      { label: "冲销" },
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

describe("scenario from-spec 转换器", () => {
  it("LIST spec → 合法 scenario，类型推断与动作分类正确", () => {
    const { doc, errors, warnings } = scenarioFromPageSpec(listSpec(), {
      serviceShort: "sale",
      resourceName: "customer",
      tableCid: "fs-cust01",
    });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(doc.pattern).toBe("list");
    expect(doc.renderTrack).toBe("codegen");
    expect(doc.query.map((q) => q.type)).toEqual(["input", "dict", "dateRange"]);
    expect(doc.query[1]).toMatchObject({ dictCode: "CUST_STATUS" });
    expect(doc.toolbar[0]).toMatchObject({ label: "新增", color: "primary", action: "openModal" });
    expect(doc.toolbar[1].action).toBe("custom");
    expect(doc.toolbar[1].handler).toContain("TODO");
    expect(doc.operations.map((o) => o.action)).toEqual(["edit", "del", "custom"]);
    expect(doc.notes.some((n) => n.includes("锁定"))).toBe(true);
    expect(validateScenario(doc)).toEqual([]);
  });

  it("from-spec 产物可直接确定性渲染，且与手写 scenario 同形态", () => {
    const { doc } = scenarioFromPageSpec(listSpec(), {
      serviceShort: "sale",
      resourceName: "customer",
      tableCid: "fs-cust01",
    });
    const compiled = compileScenario(doc);
    expect(compiled.ok, JSON.stringify(compiled.errors)).toBe(true);
    const dataTs = compiled.files["data.ts"];
    expect(dataTs).toContain('list: "/sale/customer/queryPage"');
    expect(dataTs).toContain('export const TABLE_CID = "fs-cust01"');
    const spec = JSON.parse(compiled.files["page-spec.json"]);
    expect(spec.pageId).toBe("FS001");
  });

  it("MASTER_DETAIL spec → master-detail pattern 端到端渲染", () => {
    const spec = {
      ...listSpec(),
      mode: "MASTER_DETAIL",
      pageId: "FS002",
      subTables: [
        {
          name: "detail",
          label: "明细",
          resource: "customer-contact",
          query: [],
          columns: [{ name: "contactName", label: "联系人" }],
          toolbar: [],
          operations: [],
        },
      ],
    };
    const { doc, errors } = scenarioFromPageSpec(spec, {
      serviceShort: "sale",
      resourceName: "customer",
      tableCid: "fs-md001",
    });
    expect(errors).toEqual([]);
    expect(doc.pattern).toBe("master-detail");
    const compiled = compileScenario(doc);
    expect(compiled.ok, JSON.stringify(compiled.errors)).toBe(true);
    expect(compiled.files["index.vue"]).toContain("<jh-drag-row");
    expect(compiled.files["data.ts"]).toContain('bottomList: "/sale/customer-contact/queryPage"');
  });

  it("未登记 mode 阻断", () => {
    const { errors } = scenarioFromPageSpec({ ...listSpec(), mode: "UNKNOWN_MODE" }, {});
    expect(errors.some((e) => e.includes("未登记"))).toBe(true);
  });

  it("planned 模式转换成功但 render 阻断（提示而非静默）", () => {
    const { doc, warnings } = scenarioFromPageSpec(
      { ...listSpec(), mode: "DETAIL_TABS" },
      { serviceShort: "sale", resourceName: "customer", tableCid: "fs-tabs1" },
    );
    expect(doc.pattern).toBe("detail-tabs");
    expect(warnings.some((w) => w.includes("planned"))).toBe(true);
    expect(compileScenario(doc).ok).toBe(false);
  });

  it("缺失 serviceShort 等编译参数时给出明确错误", () => {
    const { errors } = scenarioFromPageSpec(listSpec(), {});
    expect(errors.some((e) => e.includes("serviceShort"))).toBe(true);
  });
});

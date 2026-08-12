"use strict";

import { describe, expect, it } from "vitest";
import pageSpec from "../lib/page-spec.js";

const { validateSpecContractAlignment, validateSpecShape } = pageSpec;

function contract() {
  return {
    kind: "wl-api-contract",
    transport: { externalBasePath: "/demo/resource" },
    models: {
      pageRequest: [{ name: "factory", required: true, type: "string", constraints: { maxLength: 10 } }],
      pageResponse: [{ name: "factory", required: true, type: "string" }],
      detailResponse: [{ name: "factory", required: true, type: "string" }],
      createRequest: [
        { name: "startTime", required: true, type: "string", format: "date-time" },
        { name: "endTime", required: true, type: "string", format: "date-time" },
      ],
      updateRequest: [
        { name: "startTime", required: false, type: "string", format: "date-time" },
        { name: "endTime", required: false, type: "string", format: "date-time" },
      ],
      releasedPlanResponse: [{ name: "planNo", required: true, type: "string" }],
    },
    extensionOperations: [{
      name: "releasedPlanPage", method: "POST", externalPath: "/demo/resource/released-plan",
      requestModel: "pageRequest", responseModel: "releasedPlanResponse",
    }],
    validationRules: [{
      kind: "chronology", startField: "startTime", endField: "endTime", allowEqual: true,
      operations: ["create", "update"], message: "结束时间不能早于开始时间", source: "requirement:time-range",
    }],
  };
}

function spec() {
  return {
    page: "通用资源",
    query: [{ name: "factory", label: "工厂", required: true, type: "input", constraints: { maxLength: 10 } }],
    columns: [{ name: "factory", label: "工厂" }],
    operations: [],
    formSections: [{
      name: "base", label: "基础", fields: [
        { name: "startTime", label: "开始时间", required: true },
        { name: "endTime", label: "结束时间", required: true },
      ],
    }],
    features: {
      contextFields: [{ name: "companyId", source: "server", operations: ["page", "create", "update"] }],
      listLifecycle: {
        initialLoad: true,
        queryTrigger: "manual",
        queryResetPage: true,
        saveRefresh: "first",
        deleteEmptyPageFallback: true,
      },
      lookupFlows: [{
        name: "releasedPlan",
        triggerAction: "advanced-query",
        queryOperation: "releasedPlanPage",
        refreshOnOpen: true,
        cancelIsolation: true,
        selectionMode: "single",
        bindings: [{ source: "planNo", target: "startTime", lockAfterSelect: true }],
      }],
    },
    toolbar: [{ label: "进阶查询", action: "advanced-query" }],
    validationRules: contract().validationRules,
  };
}

describe("page-spec 边界与上下文闭环", () => {
  it("显式字段边界、时间顺序和服务端上下文一致时通过", () => {
    expect(validateSpecShape(spec(), { strict: false })).toEqual([]);
    const issues = validateSpecContractAlignment(spec(), JSON.stringify(contract()), "demo");
    expect(issues).toEqual([]);
  });

  it("进阶查询必须显式闭合操作、响应字段、回填目标和交互生命周期", () => {
    const value = contract();
    expect(validateSpecContractAlignment(spec(), JSON.stringify(value), "demo")).toEqual([]);

    const invalid = spec();
    invalid.features.lookupFlows[0].bindings[0].source = "missingPlanNo";
    const issues = validateSpecContractAlignment(invalid, JSON.stringify(value), "demo");
    expect(issues.some((item) => item.rule === "S7" && /missingPlanNo/.test(item.text))).toBe(true);
  });

  it("进阶查询结构必须声明刷新、取消隔离、选择模式和工具栏动作", () => {
    const invalid = spec();
    delete invalid.features.lookupFlows[0].cancelIsolation;
    invalid.features.lookupFlows[0].triggerAction = "missing-action";
    const errors = validateSpecShape(invalid);
    expect(errors.some((item) => /cancelIsolation/.test(item))).toBe(true);
    expect(errors.some((item) => /未匹配 toolbar/.test(item))).toBe(true);
  });

  it("只阻断有证据的约束漂移和服务端上下文泄漏", () => {
    const boundaryDrift = spec();
    boundaryDrift.query[0].constraints.maxLength = 20;
    expect(validateSpecContractAlignment(boundaryDrift, JSON.stringify(contract()), "demo")
      .some((item) => /constraints/.test(item.text))).toBe(true);

    const contextLeak = contract();
    contextLeak.models.pageRequest.push({ name: "companyId", required: false, type: "string" });
    expect(validateSpecContractAlignment(spec(), JSON.stringify(contextLeak), "demo")
      .some((item) => /服务端上下文字段/.test(item.text))).toBe(true);
  });

  it("列表生命周期仅接受明确、可维护的枚举值", () => {
    const invalid = spec();
    invalid.features.listLifecycle.queryTrigger = "blur";
    expect(validateSpecShape(invalid).some((item) => /queryTrigger/.test(item))).toBe(true);
  });
});

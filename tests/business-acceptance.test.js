"use strict";

import { describe, expect, it } from "vitest";
import pageSpec from "../lib/page-spec.js";

const { validateSpecShape } = pageSpec;

function acceptedSpec() {
  return {
    page: "炼钢作业实绩",
    query: [
      { name: "heatNo", label: "炉号" },
      { name: "startDate", label: "开始日期" },
      { name: "endDate", label: "结束日期" },
    ],
    columns: [
      { name: "castNo", label: "浇次号" },
      { name: "steelGrade", label: "钢种" },
      { name: "productType", label: "产品类型" },
    ],
    formSections: [{
      name: "base",
      label: "基础信息",
      fields: [{ name: "prepItem", label: "整备项目" }],
    }],
    features: {
      acceptance: {
        queryControls: [
          {
            kind: "step-navigation",
            field: "heatNo",
            requireValue: true,
            source: "requirement:炉号上下键",
          },
          {
            kind: "default-date-range",
            startField: "startDate",
            endField: "endDate",
            startOffsetDays: -1,
            endOffsetDays: 0,
            source: "requirement:生产异常默认日期",
          },
        ],
        uniqueness: [{
          fields: ["prepItem"],
          operations: ["create", "update"],
          activeOnly: true,
          normalization: ["trim"],
          message: "整备项目已存在，请勿重复添加",
          source: "requirement:整备项目去重",
        }],
        batchOperations: [{
          operation: "mergeCast",
          selectionScope: "selected-only",
          minItems: 2,
          sameFields: ["steelGrade", "productType"],
          distinct: [{ field: "castNo", count: 2 }],
          source: "requirement:浇次统合",
        }],
        verification: {
          authContext: ["companyId"],
          queryCases: ["positive", "negative", "reset"],
          readAfterWrite: "same-tenant",
        },
      },
    },
  };
}

describe("业务闭环 acceptance 契约", () => {
  it("结构化声明查询行为、去重、批量选择范围和验收矩阵时通过", () => {
    expect(validateSpecShape(acceptedSpec())).toEqual([]);
  });

  it("阻断未声明字段、全浇次误校验和技术化重复提示", () => {
    const value = acceptedSpec();
    value.features.acceptance.queryControls[0].field = "missingHeatNo";
    value.features.acceptance.uniqueness[0].message = "业务唯一键已存在";
    value.features.acceptance.batchOperations[0].selectionScope = "whole-group";
    const errors = validateSpecShape(value);
    expect(errors.some((item) => /missingHeatNo.*未在 page-spec/.test(item))).toBe(true);
    expect(errors.some((item) => /业务唯一键/.test(item))).toBe(true);
    expect(errors.some((item) => /selected-only/.test(item))).toBe(true);
  });

  it("近义词归一必须绑定来源，检索验收必须覆盖正向、无命中和重置", () => {
    const value = acceptedSpec();
    value.features.acceptance.uniqueness[0].normalization.push("business-alias");
    value.features.acceptance.verification.queryCases = ["positive"];
    const errors = validateSpecShape(value);
    expect(errors.some((item) => /aliasSource/.test(item))).toBe(true);
    expect(errors.some((item) => /positive\/negative\/reset/.test(item))).toBe(true);
  });
});

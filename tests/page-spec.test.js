"use strict";

/**
 * tests/page-spec.test.js — page-spec 落盘 + spec-align 比对引擎单测
 *
 * 覆盖：
 *   1. 函数导出完整性
 *   2. validateSpecShape 结构校验
 *   3. extractMethodBody 括号配平提取方法体
 *   4. extractFieldSequence / extractToolbarSequence / extractOperationSequence
 *   5. compareSpecToCode 五类偏差（S1~S4）
 *   6. 一致时零偏差
 */

import { describe, it, expect } from "vitest";
import {
  validateSpecShape,
  normalizePageSpec,
  extractMethodBody,
  extractFieldSequence,
  extractToolbarSequence,
  extractOperationSequence,
  compareSpecToCode,
  arrayEq,
  setEq,
  VALID_COLORS,
} from "../lib/page-spec.js";

describe("page-spec 模块导出", () => {
  it("导出所有必需函数", () => {
    expect(typeof validateSpecShape).toBe("function");
    expect(typeof extractMethodBody).toBe("function");
    expect(typeof extractFieldSequence).toBe("function");
    expect(typeof extractToolbarSequence).toBe("function");
    expect(typeof extractOperationSequence).toBe("function");
    expect(typeof compareSpecToCode).toBe("function");
    expect(VALID_COLORS.has("primary")).toBe(true);
  });
});

describe("validateSpecShape", () => {
  it("缺 page 报错", () => {
    expect(validateSpecShape({}).length).toBeGreaterThan(0);
  });
  it("合法 spec 无错", () => {
    const spec = { page: "客户档案", query: [], columns: [], toolbar: [] };
    expect(validateSpecShape(spec)).toEqual([]);
  });
  it("非数组 columns 报错", () => {
    const spec = { page: "x", columns: {} };
    expect(validateSpecShape(spec).some((e) => /columns/.test(e))).toBe(true);
  });
  it("非法 color 报错", () => {
    const spec = { page: "x", toolbar: [{ label: "新增", color: "pink" }] };
    expect(validateSpecShape(spec).some((e) => /color/.test(e))).toBe(true);
  });
  it("兼容旧 pageName/pattern/field 并归一化", () => {
    const spec = normalizePageSpec({
      pageName: "客户档案",
      pattern: "LIST",
      query: [{ field: "customerCode", label: "客户编码" }],
    });
    expect(spec.page).toBe("客户档案");
    expect(spec.mode).toBe("LIST");
    expect(spec.query[0].name).toBe("customerCode");
    expect(validateSpecShape(spec)).toEqual([]);
  });
  it("完整区块、子表和 features 得到结构校验", () => {
    const spec = {
      page: "订单",
      formSections: [{ name: "basic", label: "基本信息", fields: [{ field: "code", label: "编码" }] }],
      subTables: [{ name: "items", label: "明细", columns: [{ field: "qty", label: "数量" }], operations: [] }],
      features: { tabSwitch: false },
    };
    expect(validateSpecShape(spec)).toEqual([]);
    expect(validateSpecShape({ ...spec, subTables: [{ name: "items" }] }).some((item) => /subTables/.test(item))).toBe(true);
  });
  it("严格模式要求稳定 pageId、profile、协议和 API 契约", () => {
    const base = { page: "订单", query: [], columns: [], toolbar: [], operations: [] };
    expect(validateSpecShape(base, { strict: true }).length).toBeGreaterThan(0);
    expect(validateSpecShape({
      ...base,
      schemaVersion: 1,
      pageId: "PAGE_ORDER",
      mode: "LIST",
      profileId: "jh4j3-openapi3",
      protocolVersion: "1.0",
      apiContract: "contracts/order.json",
      openQuestions: [],
    }, { strict: true })).toEqual([]);
  });
});

describe("extractMethodBody", () => {
  it("提取 queryDef 方法体（含嵌套括号）", () => {
    const src = `
      class Foo {
        queryDef(): QueryItem[] {
          return [{ name: "code", label: "编码", fn: () => { return 1; } }];
        }
        columnsDef() { return []; }
      }
    `;
    const body = extractMethodBody(src, "queryDef");
    expect(body).toContain('name: "code"');
    expect(body).not.toContain("columnsDef");
  });

  it("方法不存在返回 null", () => {
    expect(extractMethodBody("const x = 1;", "queryDef")).toBeNull();
  });
});

describe("extractFieldSequence", () => {
  it("按顺序提取 name/label", () => {
    const body = `return [
      { name: "code", label: "编码" },
      { name: "name", label: "名称" }
    ];`;
    const seq = extractFieldSequence(body);
    expect(seq.map((s) => s.name)).toEqual(["code", "name"]);
  });
});

describe("extractToolbarSequence", () => {
  it("提取按钮 label + 颜色（type 优先 name）", () => {
    const body = `return [
      { name: "primary", label: "新增" },
      { name: "default", type: "danger", label: "删除", plain: true }
    ];`;
    const seq = extractToolbarSequence(body);
    expect(seq[0]).toEqual({ label: "新增", color: "primary", plain: false });
    expect(seq[1]).toEqual({ label: "删除", color: "danger", plain: true });
  });
});

describe("extractOperationSequence", () => {
  it("从 renderOps 提取按钮（label 缺省按 type 推断）", () => {
    const data = `
      defaultSlot: ({ row }) => renderOps([
        { type: "edit", onClick: () => {} },
        { type: "del", label: "作废", onClick: () => {} }
      ])
    `;
    const seq = extractOperationSequence(data);
    expect(seq.map((o) => o.label)).toEqual(["编辑", "作废"]);
  });

  it("兼容旧 operations 数组写法", () => {
    const data = `
      columnsDef() {
        return [
          { name: "_action", operations: [
            { type: "view" },
            { label: "审核" }
          ] }
        ];
      }
    `;
    const seq = extractOperationSequence(data);
    expect(seq.map((o) => o.label)).toEqual(["查看", "审核"]);
  });
});

describe("compareSpecToCode", () => {
  const dataConsistent = `
    class P extends AbstractPageQueryHook {
      queryDef() { return [{ name: "code", label: "编码" }, { name: "name", label: "名称" }]; }
      columnsDef() { return defineColumns([
        { name: "selection" },
        { name: "code", label: "编码" },
        { name: "name", label: "名称" },
        { name: "_action", label: "操作", defaultSlot: () => renderOps([
          { type: "edit" }, { type: "del" }
        ]) }
      ]); }
      toolbarDef() { return [{ name: "primary", label: "新增" }, { name: "danger", label: "删除" }]; }
    }
  `;
  const spec = {
    page: "测试页",
    query: [{ name: "code" }, { name: "name" }],
    columns: [{ name: "code" }, { name: "name" }],
    toolbar: [
      { label: "新增", color: "primary" },
      { label: "删除", color: "danger" },
    ],
    operations: [{ label: "编辑" }, { label: "删除" }],
  };

  it("完全一致时零偏差", () => {
    const issues = compareSpecToCode(spec, dataConsistent, "src/views/x");
    expect(issues).toEqual([]);
  });

  it("S2 表格列顺序不一致 → error", () => {
    const reordered = {
      ...spec,
      columns: [{ name: "name" }, { name: "code" }],
    };
    const issues = compareSpecToCode(reordered, dataConsistent, "src/views/x");
    expect(issues.some((i) => i.rule === "S2" && i.level === "error")).toBe(true);
  });

  it("S3 工具栏缺按钮 → error", () => {
    const more = {
      ...spec,
      toolbar: [
        { label: "新增", color: "primary" },
        { label: "删除", color: "danger" },
        { label: "导出", color: "default" },
      ],
    };
    const issues = compareSpecToCode(more, dataConsistent, "src/views/x");
    expect(issues.some((i) => i.rule === "S3" && /导出/.test(i.text))).toBe(true);
  });

  it("S4 操作列多出原型外按钮 → error", () => {
    const fewer = { ...spec, operations: [{ label: "编辑" }] };
    const issues = compareSpecToCode(fewer, dataConsistent, "src/views/x");
    expect(issues.some((i) => i.rule === "S4")).toBe(true);
  });

  it("spec 声明实现但 data.ts 缺实现时不静默跳过", () => {
    const issues = compareSpecToCode(spec, "class P {}", "src/views/x");
    expect(issues.some((i) => i.rule === "S1" && i.level === "warn")).toBe(true);
    expect(issues.some((i) => i.rule === "S2" && i.level === "error")).toBe(true);
    expect(issues.some((i) => i.rule === "S3" && i.level === "error")).toBe(true);
    expect(issues.some((i) => i.rule === "S4" && i.level === "error")).toBe(true);
  });
});

describe("arrayEq / setEq", () => {
  it("arrayEq 顺序敏感", () => {
    expect(arrayEq(["a", "b"], ["a", "b"])).toBe(true);
    expect(arrayEq(["a", "b"], ["b", "a"])).toBe(false);
  });
  it("setEq 顺序无关", () => {
    expect(setEq(["a", "b"], ["b", "a"])).toBe(true);
    expect(setEq(["a"], ["a", "b"])).toBe(false);
  });
});

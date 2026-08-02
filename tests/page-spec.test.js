"use strict";

/**
 * tests/page-spec.test.js — page-spec 落盘 + spec-align 比对引擎单测
 *
 * 覆盖：
 *   1. 函数导出完整性
 *   2. validateSpecShape 结构校验
 *   3. extractMethodBody 括号配平提取方法体
 *   4. extractFieldSequence / extractToolbarSequence / extractOperationSequence
 *   5. compareSpecToCode 五类偏差（S1~S5）与机器契约字段闭环（S6）
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
  validateDefinitionDelegation,
  validateSpecContractAlignment,
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
    expect(typeof validateDefinitionDelegation).toBe("function");
    expect(typeof validateSpecContractAlignment).toBe("function");
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

  it("创建类主按钮禁止 plain 或非 primary", () => {
    const errors = validateSpecShape({
      page: "客户列表",
      toolbar: [{ label: "新增", color: "primary", plain: true }],
    });
    expect(errors.some((item) => /primary.*plain=false/.test(item))).toBe(true);
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
  it("拒绝未解决占位符并校验固定查询字段声明", () => {
    const errors = validateSpecShape({
      page: "基础资料",
      toolbar: [{ label: "??", color: "primary" }],
      features: { fixedQueryFields: ["factory", "factory"] },
    });
    expect(errors.some((item) => /未解决占位符/.test(item))).toBe(true);
    expect(errors.some((item) => /fixedQueryFields 不能重复/.test(item))).toBe(true);
    expect(validateSpecShape({
      page: "基础资料",
      features: { fixedQueryFields: ["factory"] },
    })).toEqual([]);
    expect(validateSpecShape({
      page: "基础资料",
      features: { definitionSource: "../outside" },
    }).some((item) => /安全的项目相对路径/.test(item))).toBe(true);
  });
  it("多资源页的子表查询、工具栏和操作同样拒绝占位符", () => {
    const errors = validateSpecShape({
      page: "基础资料",
      subTables: [{
        name: "material",
        label: "原料",
        query: [{ name: "factory", label: "工厂" }],
        columns: [{ name: "code", label: "编码" }],
        toolbar: [{ label: "??", color: "primary" }],
        operations: [{ label: "TBD" }],
      }],
    });
    expect(errors.filter((item) => /未解决占位符/.test(item))).toHaveLength(2);
    expect(errors.some((item) => /subTables\[0\]\.toolbar/.test(item))).toBe(true);
    expect(errors.some((item) => /subTables\[0\]\.operations/.test(item))).toBe(true);
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
  it("显式字段边界合法且严格模式要求来源", () => {
    const spec = {
      page: "订单",
      formSections: [{
        name: "basic",
        label: "基本信息",
        fields: [{
          name: "code",
          label: "编码",
          type: "text",
          constraints: { minLength: 1, maxLength: 64, pattern: "^[A-Z0-9-]+$" },
          constraintSource: "api-contract:models.createRequest.code",
        }],
      }],
    };
    expect(validateSpecShape(spec, { strict: false })).toEqual([]);
    expect(validateSpecShape(spec, { strict: true }).some((item) => /schemaVersion/.test(item))).toBe(true);
    const noSource = JSON.parse(JSON.stringify(spec));
    delete noSource.formSections[0].fields[0].constraintSource;
    expect(
      validateSpecShape(noSource, { strict: true }).some((item) =>
        /constraintSource/.test(item)),
    ).toBe(true);
  });
  it("拒绝矛盾长度、非法正则和错误字典字段", () => {
    const errors = validateSpecShape({
      page: "订单",
      query: [
        {
          name: "code",
          label: "编码",
          type: "text",
          constraints: { minLength: 10, maxLength: 2, pattern: "[" },
        },
        { name: "status", label: "状态", type: "dict" },
      ],
    });
    expect(errors.some((item) => /minLength 不能大于 maxLength/.test(item))).toBe(true);
    expect(errors.some((item) => /合法正则/.test(item))).toBe(true);
    expect(errors.some((item) => /dictCode 必填/.test(item))).toBe(true);
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

  it("S3 创建类主按钮误用 plain → error", () => {
    const code = dataConsistent.replace(
      '{ name: "primary", label: "新增" }',
      '{ name: "primary", label: "新增", plain: true }',
    );
    const issues = compareSpecToCode(spec, code, "src/views/x");
    expect(
      issues.some(
        (item) =>
          item.rule === "S3" &&
          item.level === "error" &&
          /禁止 plain/.test(item.text),
      ),
    ).toBe(true);
  });

  it("S3 普通按钮 plain 形态不一致 → warn", () => {
    const expected = {
      ...spec,
      toolbar: [
        { label: "新增", color: "primary", plain: false },
        { label: "删除", color: "danger", plain: true },
      ],
    };
    const issues = compareSpecToCode(expected, dataConsistent, "src/views/x");
    expect(
      issues.some(
        (item) =>
          item.rule === "S3" &&
          item.level === "warn" &&
          /填充形态/.test(item.text),
      ),
    ).toBe(true);
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

describe("definition-driven page delegation", () => {
  it("显式 definitionSource 与 data.ts 委托链一致时不套用旧方法解析器", () => {
    const spec = {
      page: "任务实绩",
      features: {
        definitionSource: "src/views/operations/definitions",
      },
    };
    const data = [
      'import { taskDefinition as pageDefinition } from "@/views/operations/definitions";',
      "export { pageDefinition };",
    ].join("\n");
    expect(validateDefinitionDelegation(spec, data, "src/views/eaf")).toEqual({
      delegated: true,
      source: "src/views/operations/definitions",
      issues: [],
    });
  });

  it("definitionSource 与真实 import 漂移时只报一个确定性 S0", () => {
    const spec = {
      page: "任务实绩",
      features: { definitionSource: "src/views/operations/definitions" },
    };
    const data = [
      'import { taskDefinition as pageDefinition } from "@/views/other/definitions";',
      "export { pageDefinition };",
    ].join("\n");
    const result = validateDefinitionDelegation(spec, data, "src/views/eaf");
    expect(result.delegated).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ rule: "S0", level: "error" });
  });
});

describe("S6 page-spec 与机器 API 契约字段闭环", () => {
  const contract = {
    transport: { externalBasePath: "/pl/base-data/material" },
    models: {
      pageRequest: [{ name: "current" }, { name: "size" }, { name: "factory" }],
      createRequest: [{ name: "materialCode", required: true }, { name: "remark", required: false }],
      updateRequest: [{ name: "id" }, { name: "revision" }, { name: "materialCode" }, { name: "remark" }],
      pageResponse: [{ name: "materialCode" }, { name: "remark" }],
      detailResponse: [{ name: "materialCode" }, { name: "remark" }],
    },
  };
  const api = `\`\`\`wl-api-contract\n${JSON.stringify(contract)}\n\`\`\``;

  it("兼容 snake_case/camelCase，并阻断多传字段和漏掉必填字段", () => {
    const spec = {
      query: [{ name: "factory" }, { name: "ui_hint", contractField: false }],
      columns: [{ name: "material_code" }, { name: "ghost_field" }],
      formSections: [{ fields: [{ name: "remark" }] }],
    };
    const issues = validateSpecContractAlignment(spec, api, "src/views/material");
    expect(issues.filter((item) => item.rule === "S6")).toHaveLength(2);
    expect(issues.some((item) => /ghost_field/.test(item.text))).toBe(true);
    expect(issues.some((item) => /materialCode/.test(item.text))).toBe(true);
    expect(issues.some((item) => /ui_hint/.test(item.text))).toBe(false);
  });

  it("多资源页按 subTables.resource 精确绑定，无法唯一匹配时阻断", () => {
    const spec = {
      subTables: [
        { resource: "base-data/material", query: [{ name: "factory" }], columns: [{ name: "material_code" }] },
        { resource: "base-data/missing", query: [], columns: [] },
      ],
    };
    const issues = validateSpecContractAlignment(spec, api, "src/views/master");
    expect(issues).toHaveLength(1);
    expect(issues[0].text).toMatch(/base-data\/missing/);
  });

  it("fixedQueryFields 必须同时进入查询、新增和更新模型", () => {
    const spec = {
      query: [{ name: "factory" }],
      columns: [{ name: "material_code" }],
      features: { fixedQueryFields: ["factory"] },
    };
    const issues = validateSpecContractAlignment(spec, api, "src/views/material");
    expect(issues).toHaveLength(2);
    expect(issues.map((item) => item.text).join("\n")).toMatch(/createRequest/);
    expect(issues.map((item) => item.text).join("\n")).toMatch(/updateRequest/);
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

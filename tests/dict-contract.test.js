import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  extractApiContracts,
  formatModuleContract,
  mergeContracts,
  parseModuleContractSource,
  toBackendPayloads,
  validateContractAlignment,
  validateModuleContract,
} = require("../lib/dict-contract");

function contract(dictionaries) {
  return {
    schemaVersion: 1,
    module: { code: "mdmAuth", name: "主数据系统授权" },
    dictionaries,
  };
}

function modelType(items = [
  { value: "0", label: "主数据模型" },
  { value: "1", label: "参照数据模型" },
  { value: "2", label: "基础数据模型" },
]) {
  return {
    code: "mdmModelType",
    name: "模型类型",
    order: { field: "STR_KEY", direction: "asc" },
    items,
    sources: [],
  };
}

describe("dict contract schema", () => {
  it("接受显式排序且 items 已按契约排列的模块字典", () => {
    const result = validateModuleContract(contract([modelType()]));
    expect(result).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("拒绝依赖创建先后的乱序 items", () => {
    const result = validateModuleContract(contract([
      modelType([
        { value: "1", label: "参照数据模型" },
        { value: "0", label: "主数据模型" },
      ]),
    ]));
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/顺序与 STR_KEY asc 不一致/);
  });

  it("拒绝重复 value 和一对多 label", () => {
    const result = validateModuleContract(contract([
      modelType([
        { value: "0", label: "主数据模型" },
        { value: "0", label: "重复" },
        { value: "1", label: "主数据模型" },
      ]),
    ]));
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/重复 value=0/);
    expect(result.errors.join("\n")).toMatch(/对应多个 value/);
  });
});

describe("api.md -> dicts.ts -> backend", () => {
  it("从 api.md 的 dict-contract 块提取来源", () => {
    const markdown = [
      "# 接口约定",
      "```dict-contract",
      JSON.stringify(contract([modelType()])),
      "```",
    ].join("\n");
    const [result] = extractApiContracts(markdown, "customer/api.md");
    expect(result.dictionaries[0].sources).toEqual(["customer/api.md"]);
  });

  it("合并同模块多个页面使用的字典项并保持契约顺序", () => {
    const first = contract([
      modelType([
        { value: "0", label: "主数据模型" },
        { value: "1", label: "参照数据模型" },
      ]),
    ]);
    first.dictionaries[0].sources = ["list/api.md"];
    const second = contract([
      modelType([
        { value: "1", label: "参照数据模型" },
        { value: "2", label: "基础数据模型" },
      ]),
    ]);
    second.dictionaries[0].sources = ["form/api.md"];

    const result = mergeContracts([first, second]);
    expect(result.dictionaries[0].items.map((item) => item.value)).toEqual(["0", "1", "2"]);
    expect(result.dictionaries[0].sources).toEqual(["form/api.md", "list/api.md"]);
  });

  it("同一 value 定义冲突时阻断汇总", () => {
    const first = contract([modelType([{ value: "0", label: "主数据模型" }])]);
    const second = contract([modelType([{ value: "0", label: "错误名称" }])]);
    expect(() => mergeContracts([first, second])).toThrow(/定义冲突/);
  });

  it("生成的 dicts.ts 可静态回读，不执行动态代码", () => {
    const dictionary = modelType();
    dictionary.sources = ["model-list/api.md"];
    const source = formatModuleContract(contract([dictionary]));
    const parsed = parseModuleContractSource(source, "dicts.ts");
    expect(parsed.module.code).toBe("mdmAuth");
    expect(parsed.dictionaries[0].items).toHaveLength(3);
  });

  it("拒绝 dicts.ts 中的函数调用", () => {
    const source = "export const MODULE_DICTIONARIES = makeContract()";
    expect(() => parseModuleContractSource(source, "dicts.ts")).toThrow(/静态字面量/);
  });

  it("统一映射为 MCP 后端 payload", () => {
    const [payload] = toBackendPayloads(contract([modelType()]));
    expect(payload).toMatchObject({
      module: { strSn: "mdmAuth", strName: "主数据系统授权" },
      dict: {
        strSn: "mdmModelType",
        strName: "模型类型",
        orderField: "STR_KEY",
        orderRule: "asc",
      },
    });
    expect(payload.items.map((item) => item.value)).toEqual(["0", "1", "2"]);
  });

  it("校验模块 dicts.ts 已完整汇总页面 api.md", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-dict-contract-"));
    try {
      fs.mkdirSync(path.join(root, "list"));
      const value = contract([modelType()]);
      value.dictionaries[0].sources = ["list/api.md"];
      fs.writeFileSync(path.join(root, "dicts.ts"), formatModuleContract(value));
      fs.writeFileSync(
        path.join(root, "list", "api.md"),
        ["```dict-contract", JSON.stringify(value), "```"].join("\n"),
      );
      expect(validateContractAlignment(root)).toEqual({
        ok: true,
        errors: [],
        warnings: [],
        rule: "D1",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

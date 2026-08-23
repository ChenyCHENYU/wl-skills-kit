import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { AST_RULE_IDS, AST_RULE_RANGE, isAstRule } = require("../lib/rule-registry");

describe("AST 规则注册表", () => {
  it("以连续的 K1~K19 作为对外规则范围", () => {
    expect(AST_RULE_IDS).toEqual(Array.from({ length: 19 }, (_value, index) => `K${index + 1}`));
    expect(AST_RULE_RANGE).toBe("K1~K19");
  });

  it("只接受已注册的规则编号", () => {
    expect(isAstRule("k19")).toBe(true);
    expect(isAstRule("K20")).toBe(false);
  });
});

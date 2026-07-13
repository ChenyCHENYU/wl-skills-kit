import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createPlanHash, stableStringify } = require("../lib/plan-hash");

describe("plan hash canonicalization", () => {
  it("对象键顺序不影响哈希", () => {
    const first = { nested: { b: 2, a: 1 }, items: [{ y: 2, x: 1 }] };
    const second = { items: [{ x: 1, y: 2 }], nested: { a: 1, b: 2 } };
    expect(stableStringify(first)).toBe(stableStringify(second));
    expect(createPlanHash("test", first)).toBe(createPlanHash("test", second));
  });

  it("数组顺序和计划类型参与哈希", () => {
    expect(createPlanHash("menu", ["a", "b"]))
      .not.toBe(createPlanHash("menu", ["b", "a"]));
    expect(createPlanHash("menu", ["a"]))
      .not.toBe(createPlanHash("role", ["a"]));
  });
});

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateSchema } = require("../mcp/schema-validator");

describe("MCP JSON Schema runtime validator", () => {
  it("校验 required、类型、枚举、数组子项和闭合对象", () => {
    const schema = {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["module", "project"] },
        codes: { type: "array", items: { type: "string" } },
      },
      required: ["scope"],
      additionalProperties: false,
    };
    expect(validateSchema(schema, { scope: "project", codes: ["a"] })).toEqual({
      valid: true,
      errors: [],
    });
    const invalid = validateSchema(schema, { scope: "all", codes: [1], extra: true });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join("\n")).toMatch(/scope.*project/);
    expect(invalid.errors.join("\n")).toMatch(/codes\[0\].*string/);
    expect(invalid.errors.join("\n")).toMatch(/extra.*未声明/);
  });

  it("支持 anyOf 和 const", () => {
    const result = validateSchema(
      { anyOf: [{ const: "preview" }, { const: "apply" }] },
      "invalid",
    );
    expect(result).toMatchObject({ valid: false });
  });
});

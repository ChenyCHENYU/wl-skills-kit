import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { productionHint, writeBlockReason } = require("../mcp/write-guard");

describe("MCP backend write guard", () => {
  it("显式 production 或明确 prod 网关默认阻断", () => {
    expect(productionHint({ environment: "production", gatewayPath: "https://gateway.internal" })).toBe(true);
    expect(productionHint({ gatewayPath: "https://api-prod.internal/uac" })).toBe(true);
    expect(writeBlockReason({ environment: "production", gatewayPath: "https://gateway.internal" })).toMatch(/默认禁止/);
  });

  it("普通 .com 域名不误判为生产，显式审批开关可放行", () => {
    expect(productionHint({ environment: "uat", gatewayPath: "https://uat.example.com" })).toBe(false);
    expect(writeBlockReason({
      environment: "production",
      gatewayPath: "https://gateway.internal",
      allowProductionWrites: true,
    })).toBe("");
  });
});

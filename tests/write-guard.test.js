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

  it("prd 缩写环境与网关同样命中生产阻断（v2.21.0 收紧）", () => {
    expect(productionHint({ environment: "prd", gatewayPath: "https://gateway.internal" })).toBe(true);
    expect(productionHint({ environment: "PRD", gatewayPath: "https://gateway.internal" })).toBe(true);
    expect(productionHint({ environment: "uat", gatewayPath: "https://api-prd.internal/uac" })).toBe(true);
    expect(writeBlockReason({ environment: "uat", gatewayPath: "https://api-prd.internal/uac" })).toMatch(/默认禁止/);
    // 缩写不误伤：thunderbird-style 域名片段不得命中
    expect(productionHint({ environment: "sit", gatewayPath: "https://replica-hyprd.example.com" })).toBe(false);
  });
});

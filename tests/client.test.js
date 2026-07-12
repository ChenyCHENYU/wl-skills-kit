import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildRequest, parseResponse } = require("../mcp/api/client")._internal;

describe("MCP backend client", () => {
  it("构造带应用、当前应用和 requestId 的请求", () => {
    const result = buildRequest(
      "https://gateway.example/uat-api/system/test",
      { method: "POST", body: { id: "1" } },
      { token: "secret", sysAppNo: "mdata", dict: { sysOnlyCurrentApp: true } },
      "request-1",
    );
    expect(result.requestOptions).toMatchObject({
      method: "POST",
      path: "/uat-api/system/test",
      headers: {
        Authorization: "Bearer secret",
        sysAppNo: "mdata",
        sysOnlyCurrentApp: "true",
        "X-WL-Skills-Request-Id": "request-1",
      },
    });
  });

  it("HTTP 非 2xx 即使业务 code=2000 也不判成功", () => {
    const result = parseResponse('{"code":2000,"data":null}', 500, "request-2");
    expect(result).toMatchObject({ ok: false, statusCode: 500, requestId: "request-2" });
  });

  it("响应解析错误只返回状态和 requestId，不回显原始响应", () => {
    expect(() => parseResponse("token=secret", 502, "request-3")).toThrow(
      /HTTP 502，requestId=request-3/,
    );
  });
});

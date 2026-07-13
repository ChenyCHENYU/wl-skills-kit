import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const client = require("../mcp/api/client");
const { wlsFetch } = client;
const { buildRequest, parseResponse } = client._internal;
const servers = [];

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise((resolve) => server.close(resolve))));
});

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

  it("GET 对临时 503 做有界退避重试", async () => {
    let requests = 0;
    const gatewayPath = await listen((_request, response) => {
      requests += 1;
      response.statusCode = requests < 3 ? 503 : 200;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ code: requests < 3 ? 5000 : 2000, data: { ok: true } }));
    });
    const result = await wlsFetch("/retry", {}, {
      gatewayPath,
      token: "token",
      network: { getRetries: 2, retryDelayMs: 10, timeoutMs: 1000 },
    });
    expect(result).toMatchObject({ ok: true, data: { ok: true } });
    expect(requests).toBe(3);
  });

  it("POST 即使遇到 503 也绝不自动重试", async () => {
    let requests = 0;
    const gatewayPath = await listen((_request, response) => {
      requests += 1;
      response.statusCode = 503;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ code: 5000, message: "temporary" }));
    });
    const result = await wlsFetch("/write", { method: "POST", body: { id: 1 } }, {
      gatewayPath,
      token: "token",
      network: { getRetries: 3, retryDelayMs: 10, timeoutMs: 1000 },
    });
    expect(result.ok).toBe(false);
    expect(requests).toBe(1);
  });
});

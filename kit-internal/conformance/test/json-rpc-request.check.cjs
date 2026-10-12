"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateRequest } = require("../support/json-rpc-request.cjs");
test("MCP shared boundary rejects malformed requests and preserves notification/id/params semantics", () => {
  for (const request of [null, false, 1, "x", [], {}, { jsonrpc: "1.0", method: "ping", id: 1 }, { jsonrpc: "2.0", method: 1, id: 1 }, { jsonrpc: "2.0", method: "ping", id: {} }]) {
    assert.deepEqual(validateRequest(request).error, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
  }
  assert.deepEqual(validateRequest({ jsonrpc: "2.0", id: null, method: "ping" }), { request: { jsonrpc: "2.0", id: null, method: "ping", params: {} }, notification: false });
  assert.equal(validateRequest({ jsonrpc: "2.0", method: "tools/call", params: null }).notification, true);
  assert.equal(validateRequest({ jsonrpc: "2.0", id: 2, method: "tools/call", params: null }).error.error.code, -32602);
});

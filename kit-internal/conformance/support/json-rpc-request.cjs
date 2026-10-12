"use strict";

/** Shared MCP request boundary; packages retain their own tools and dispatch. */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(id) {
  return id === undefined || id === null || typeof id === "string"
    || (typeof id === "number" && Number.isFinite(id));
}

function failure(id, code, message) {
  return { error: { jsonrpc: "2.0", id, error: { code, message } } };
}

function validateRequest(request) {
  if (!isRecord(request) || request.jsonrpc !== "2.0"
    || typeof request.method !== "string" || !validId(request.id)) {
    return failure(null, -32600, "Invalid Request");
  }
  const notification = request.id === undefined;
  // Valid notifications receive no response, including errors in their params.
  if (notification) return { request, notification };
  const params = request.params === undefined ? {} : request.params;
  if (!isRecord(params)) return failure(request.id, -32602, "params 必须是对象");
  return { request: { ...request, params }, notification };
}

module.exports = { validateRequest };

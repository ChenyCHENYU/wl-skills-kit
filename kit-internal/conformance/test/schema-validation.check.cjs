"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateSchema, projectMcpToolSchema } = require("../support/schema-validation.cjs");
const { analyzeTask } = require("../support/task-intent.cjs");

test("tool contracts enforce bounds, patterns and full conditional structure without rewriting data", () => {
  const schema = { type: "object", required: ["mode", "items"], properties: {
    mode: { enum: ["preview", "apply"] }, items: { type: "array", minItems: 1, maxItems: 2, uniqueItems: true, items: { type: "string", minLength: 1, pattern: "^[a-z]+$" } },
    planHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
  }, if: { properties: { mode: { const: "apply" } } }, then: { required: ["planHash"] }, additionalProperties: false };
  assert.equal(validateSchema(schema, { mode: "preview", items: ["menu"] }).valid, true);
  for (const value of [{ mode: "preview", items: [] }, { mode: "preview", items: [""] }, { mode: "apply", items: ["menu"] }, { mode: "preview", items: ["x", "x"] }, { mode: "preview", items: ["a", "b", "c"] }, { mode: "preview", items: ["menu"], hiddenOutput: "file" }]) assert.equal(validateSchema(schema, value).valid, false);
  const data = { count: "3" };
  assert.equal(validateSchema({ type: "object", properties: { count: { type: "integer" }, other: { default: true } } }, data).valid, false);
  assert.deepEqual(data, { count: "3" });
});

test("schema dialect selection and definition errors are explicit, never an implicit allow", () => {
  for (const $schema of ["http://json-schema.org/draft-07/schema#", "https://json-schema.org/draft/2019-09/schema", "https://json-schema.org/draft/2020-12/schema"]) {
    assert.equal(validateSchema({ $schema, type: "string", minLength: 2 }, "x").valid, false);
    assert.equal(validateSchema({ $schema, type: "string", minLength: 2 }, "ok").valid, true);
  }
  assert.equal(validateSchema({ $schema: "https://invalid.example/schema", type: "object" }, {}).schemaError, true);
  assert.equal(validateSchema(false, {}).valid, false);
  assert.equal(validateSchema(null, {}).schemaError, true);
  assert.equal(validateSchema({ $async: true, type: "object" }, {}).schemaError, true);
});

test("explicit read and permission operations have action evidence without granting business writes", () => {
  for (const text of ["查询 5 个菜单", "预览菜单变更", "list available menus"]) {
    assert.equal(analyzeTask(text).action.mode, "inspect");
    assert.equal(analyzeTask(text).action.businessWritesAuthorized, false);
  }
  for (const text of ["删除菜单", "给角色分配菜单", "update menu"]) {
    assert.equal(analyzeTask(text).action.mode, "apply");
    assert.equal(analyzeTask(text).action.businessWritesAuthorized, false);
  }
  assert.equal(analyzeTask("不要删除菜单，只解释权限规则").action.checksAllowed, false);
});

test("MCP host projection preserves the canonical contract and all non-root descriptor constraints", () => {
  const plain = { name: "plain", inputSchema: { type: "object", properties: {} } };
  assert.equal(projectMcpToolSchema(plain), plain, "unchanged tools preserve identity");
  const tool = { name: "fix", description: "修复预览", annotations: { destructiveHint: true }, _meta: { existing: true }, outputSchema: { type: "object" },
    inputSchema: { type: "object", required: ["target"], properties: {
      target: { type: "string", minLength: 1 }, confirm: { type: "boolean" }, planHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      nested: { oneOf: [{ type: "string" }, { type: "null" }] },
    }, additionalProperties: false, allOf: [{ if: { required: ["confirm"], properties: { confirm: { const: true } } }, then: { required: ["planHash"] } }] } };
  const before = structuredClone(tool);
  const projected = projectMcpToolSchema(tool);
  assert.deepEqual(tool, before);
  assert.notEqual(projected, tool);
  assert.deepEqual(projected.inputSchema.required, ["target"]);
  assert.deepEqual(projected.inputSchema.properties, tool.inputSchema.properties);
  assert.equal(projected.inputSchema.additionalProperties, false);
  assert.equal(projected.inputSchema.allOf, undefined);
  assert.deepEqual(projected.annotations, tool.annotations); assert.deepEqual(projected.outputSchema, tool.outputSchema);
  assert.equal(projected._meta.existing, true);
  assert.deepEqual(projected._meta["wl/schemaProjection"], { serverEnforced: true, equivalent: false, omittedRootKeywords: ["allOf"] });
  assert.match(projected.description, /confirm=true 时还需 planHash/);
  const invalid = { target: "test.js", confirm: true };
  assert.equal(validateSchema(tool.inputSchema, invalid).valid, false, "canonical condition remains strict");
  assert.equal(validateSchema(projected.inputSchema, invalid).valid, true, "projection explicitly is not an equivalent schema");
});

test("MCP cursor projection never promotes first-call fields into unconditional required", () => {
  const schema = { type: "object", properties: { mode: { type: "string" }, contract: { type: "string" }, response: { type: "object", properties: { cursor: { type: "string" } }, additionalProperties: false } },
    anyOf: [{ type: "object", required: ["mode", "contract"] }, { type: "object", required: ["response"], properties: { response: { type: "object", required: ["cursor"] } } }], additionalProperties: false };
  const projected = projectMcpToolSchema({ name: "codegen", inputSchema: schema });
  assert.equal(projected.inputSchema.required, undefined);
  assert.equal(validateSchema(schema, { response: { cursor: "result:0" } }).valid, true);
  assert.equal(validateSchema(projected.inputSchema, { response: { cursor: "result:0" } }).valid, true);
  assert.equal(validateSchema(schema, {}).valid, false);
  assert.match(projected.description, /首次调用需 mode、contract/);
});

test("MCP projection fails closed for unowned root combinations", () => {
  const base = { type: "object", properties: { mode: { type: "string" } } };
  for (const extra of [
    { oneOf: false }, { anyOf: [{ required: ["mode"] }] },
    { allOf: [{ required: ["mode"] }] },
    { allOf: [{ if: { properties: { mode: { pattern: "apply" } } }, then: { required: ["mode"] } }] },
    { allOf: [{ if: { properties: { mode: { const: "apply" } } }, then: { properties: { mode: { const: "apply" } } } }] },
  ]) assert.throws(() => projectMcpToolSchema({ name: "unowned", inputSchema: { ...base, ...extra } }), /不支持/);
});

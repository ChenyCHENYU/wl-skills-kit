"use strict";

/**
 * integration-protocol.cjs — 五包统一公开集成协议 v1（单源快照）
 *
 * 由 kit-internal/conformance/scripts/sync-support.cjs 分发到各包，各包不得修改本文件；
 * 包特定能力目录、操作映射与执行器在各包的 protocol 接线文件中提供。
 *
 * 协议约定：
 * - describe：返回能力目录、协议版本、操作清单、输入输出约束与错误码；
 *   request/envelope Schema 按各包操作定义动态生成，与运行时校验一致。
 * - request：所有字段在执行前完成类型校验；非法输入返回 invalid-input，不触发执行器、
 *   不写入任何记录。非法的 operation/requestId 不回显到信封（保持 string|null）。
 * - 信封结构互斥：ok=true 必有 result 且无 error；ok=false 必有 error 且无 result。
 * - 本协议只统一判定、解释、任务记录、状态查询与宿主诊断；业务执行仍走各包原有 CLI/MCP。
 */

const PROTOCOL_VERSION = 1;
const SUPPORTED_VERSIONS = [1];
const ERROR_CODES = ["unsupported-protocol", "unknown-operation", "missing-input", "invalid-input", "internal-error"];
const OPTIONAL_STRING_FIELDS = ["requestId", "runId", "projectRoot", "skill", "host", "type", "domain", "profile"];

const STRING_FIELD_SCHEMA = { type: "string", minLength: 1, pattern: "\\S" };
const ERROR_SCHEMA = {
  type: "object",
  required: ["code", "message"],
  properties: {
    code: { type: "string", enum: ERROR_CODES },
    message: { type: "string", minLength: 1 },
    field: { oneOf: [STRING_FIELD_SCHEMA, { type: "array", items: STRING_FIELD_SCHEMA, minItems: 1 }] },
    supportedProtocolVersions: { type: "array", items: { type: "integer" }, minItems: 1 },
    availableOperations: { type: "array", items: STRING_FIELD_SCHEMA, minItems: 1 },
  },
  additionalProperties: true,
};
const CONTEXT_FIELD_SCHEMA = {
  type: "object",
  properties: {
    signals: { type: "array", items: STRING_FIELD_SCHEMA },
    domainRelevant: { type: "boolean" },
  },
  additionalProperties: true,
};

function envelopeSchema(packageName) {
  const stringOrNull = { type: ["string", "null"] };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `wl-skills protocol envelope v1 (${packageName})`,
    type: "object",
    required: ["protocolVersion", "package", "packageVersion", "operation", "requestId", "ok", "diagnostics"],
    properties: {
      protocolVersion: { type: "integer", const: 1 },
      package: { type: "string" },
      packageVersion: stringOrNull,
      operation: stringOrNull,
      requestId: stringOrNull,
      ok: { type: "boolean" },
      result: { type: "object", description: "各包原执行器结果；业务状态以其中 executionStatus/validationStatus 等字段为准" },
      error: ERROR_SCHEMA,
      diagnostics: { type: "array", items: { type: "string" } },
    },
    oneOf: [
      { properties: { ok: { const: true }, result: { type: "object" } }, required: ["result"], not: { required: ["error"] } },
      { properties: { ok: { const: false }, error: ERROR_SCHEMA }, required: ["error"], not: { required: ["result"] } },
    ],
  };
}

function operationCondition(operation) {
  const clauses = [];
  if (operation.required.length > 0) clauses.push({ required: [...operation.required] });
  if (operation.requireAny) clauses.push(...operation.requireAny.map((field) => ({ required: [field] })));
  if (clauses.length === 0) return null;
  return {
    if: { properties: { operation: { const: operation.id } }, required: ["operation"] },
    then: clauses.length === 1 ? clauses[0] : { anyOf: clauses },
  };
}

function requestSchema(config) {
  const {operations} = config;
  const conditional = operations.map(operationCondition).filter(Boolean);
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `wl-skills protocol request v1 (${config.packageName})`,
    type: "object",
    required: ["operation"],
    properties: {
      protocolVersion: { type: "integer", const: 1 },
      operation: { type: "string", enum: operations.map((operation) => operation.id) },
      requestId: STRING_FIELD_SCHEMA,
      runId: STRING_FIELD_SCHEMA,
      projectRoot: STRING_FIELD_SCHEMA,
      task: STRING_FIELD_SCHEMA,
      targets: { type: "array", items: STRING_FIELD_SCHEMA, description: "空数组表示空范围（与运行时既有语义一致）" },
      skill: STRING_FIELD_SCHEMA,
      host: STRING_FIELD_SCHEMA,
      type: STRING_FIELD_SCHEMA,
      domain: STRING_FIELD_SCHEMA,
      profile: STRING_FIELD_SCHEMA,
      context: CONTEXT_FIELD_SCHEMA,
    },
    ...(conditional.length > 0 ? { allOf: conditional } : {}),
  };
}

function isEmptyValue(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function assertValidOperation(operation) {
  if (!operation.id || typeof operation.summary !== "string") throw new Error(`操作定义不完整：${JSON.stringify(operation)}`);
  if (typeof operation.readOnly !== "boolean") throw new Error(`操作 ${operation.id} 缺少 readOnly 声明`);
  if (!Array.isArray(operation.required) || !Array.isArray(operation.optional)) throw new Error(`操作 ${operation.id} 缺少 required/optional 输入声明`);
  if (operation.requireAny !== undefined && !Array.isArray(operation.requireAny)) throw new Error(`操作 ${operation.id} 的 requireAny 必须是字符串数组`);
  if (typeof operation.mapping !== "string") throw new Error(`操作 ${operation.id} 缺少原 CLI 映射说明`);
}

function assertValidConfig(config) {
  if (!config || typeof config !== "object") throw new Error("integration protocol 需要配置对象");
  if (!config.packageName) throw new Error("integration protocol 配置缺少 packageName");
  if (!Array.isArray(config.operations) || config.operations.length === 0) throw new Error("integration protocol 配置缺少 operations");
  config.operations.forEach(assertValidOperation);
}

function createProtocol(config) {
  assertValidConfig(config);

  function base(operation, requestId) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      package: config.packageName,
      packageVersion: config.packageVersion || null,
      operation: isNonEmptyString(operation) ? operation : null,
      requestId: isNonEmptyString(requestId) ? requestId : null,
    };
  }

  function fail(operation, requestId, code, message, extra) {
    return { ...base(operation, requestId), ok: false, error: { code, message, ...(extra || {}) }, diagnostics: [] };
  }

  function invalidField(input, field, expected) {
    return fail(input.operation, input.requestId, "invalid-input", `字段 ${field} 非法：应为${expected}`, { field });
  }

  function validateContextField(input) {
    const {context} = input;
    if (context === null || typeof context !== "object" || Array.isArray(context)) return invalidField(input, "context", "非 null 对象（signals: string[] / domainRelevant: boolean）");
    if (context.signals !== undefined && (!Array.isArray(context.signals) || context.signals.some((item) => !isNonEmptyString(item)))) {
      return invalidField(input, "context.signals", "非空字符串数组");
    }
    if (context.domainRelevant !== undefined && typeof context.domainRelevant !== "boolean") return invalidField(input, "context.domainRelevant", "布尔值");
    return null;
  }

function validateStringFields(input) {
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (input[field] !== undefined && !isNonEmptyString(input[field])) return invalidField(input, field, "非空字符串");
  }
  if (input.task !== undefined && !isNonEmptyString(input.task)) return invalidField(input, "task", "非空字符串");
  return null;
}

function validateTargetsField(input) {
  if (input.targets === undefined) return null;
  if (!Array.isArray(input.targets)) return invalidField(input, "targets", "字符串数组");
  if (input.targets.some((item) => !isNonEmptyString(item))) return invalidField(input, "targets", "非空字符串元素数组");
  return null;
}

function validateFieldTypes(input) {
  if (!isNonEmptyString(input.operation)) return invalidField(input, "operation", "非空字符串");
  const stringError = validateStringFields(input);
  if (stringError) return stringError;
  const targetsError = validateTargetsField(input);
  if (targetsError) return targetsError;
  if (input.context !== undefined) {
    const contextError = validateContextField(input);
    if (contextError) return contextError;
  }
  return null;
}

  function unsupportedVersionError(input) {
    if (input.protocolVersion === undefined || SUPPORTED_VERSIONS.includes(input.protocolVersion)) return null;
    return fail(input.operation, input.requestId, "unsupported-protocol", `不支持的协议版本：${input.protocolVersion}`, { supportedProtocolVersions: [...SUPPORTED_VERSIONS] });
  }

  function findOperation(input) {
    const operation = config.operations.find((item) => item.id === input.operation);
    if (operation) return { operation };
    return { error: fail(input.operation, input.requestId, "unknown-operation", `未知操作：${isNonEmptyString(input.operation) ? input.operation : "(缺失或非法)"}`, { availableOperations: config.operations.map((item) => item.id) }) };
  }

  function missingInputError(input, operation) {
    const missingField = operation.required.find((field) => isEmptyValue(input[field]));
    if (missingField !== undefined) {
      return fail(operation.id, input.requestId, "missing-input", `操作 ${operation.id} 缺少必要输入：${missingField}`, { field: missingField });
    }
    if (operation.requireAny && !operation.requireAny.some((field) => !isEmptyValue(input[field]))) {
      return fail(operation.id, input.requestId, "missing-input", `操作 ${operation.id} 需要以下输入至少之一：${operation.requireAny.join(" / ")}`, { field: [...operation.requireAny] });
    }
    return null;
  }

  function validateRequest(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { error: fail(null, null, "invalid-input", "request 必须是 JSON 对象") };
    }
    const versionError = unsupportedVersionError(input);
    if (versionError) return { error: versionError };
    const typeError = validateFieldTypes(input);
    if (typeError) return { error: typeError };
    const found = findOperation(input);
    if (found.error) return found;
    const { operation } = found;
    const inputError = missingInputError(input, operation);
    if (inputError) return { error: inputError };
    return { operation };
  }

  function buildInventory(config) {
    const inventory = config.inventory || {};
    return {
      skills: inventory.skills || [],
      taskTypes: inventory.taskTypes || [],
      commands: inventory.commands || [],
      mcpTools: inventory.mcpTools || [],
      loadErrors: inventory.loadErrors || [],
      note: "业务执行仍走各包原 CLI/MCP；inventory 只声明公开调用映射与入口，不改变执行归属；loadErrors 非空表示目录派生存在异常，不得忽略",
    };
  }

  function buildConstraints(config) {
    return {
      ...(config.constraints || {}),
      instructionOnly: "未提供 programmatic 执行入口的能力均为指令指导型，由宿主/AI 按各包技能流程执行并提供证据",
      evidence: "request 返回的判定与状态来自各包自身记录；宿主是否加载、读取、调用以宿主证据为准，本协议不代为宣称",
      okSemantics: "ok=true 仅表示协议调用成功（判定/记录/查询完成）；业务验证状态以 result 内的 validationStatus/executionStatus 等字段为准",
    };
  }

  return {
    PROTOCOL_VERSION,
    SUPPORTED_VERSIONS,
    ERROR_CODES,

    describe() {
      return {
        ...base(null, null),
        capabilities: config.capabilities || [],
        operations: config.operations.map((operation) => ({ ...operation })),
        inventory: buildInventory(config),
        schemas: { request: requestSchema(config), envelope: envelopeSchema(config.packageName) },
        constraints: buildConstraints(config),
        errorCodes: [...ERROR_CODES],
      };
    },

    request(input, runOperation) {
      const { operation, error } = validateRequest(input);
      if (error) return error;
      const diagnostics = [];
      try {
        const result = runOperation(operation.id, input, diagnostics) ?? {};
        return { ...base(operation.id, input.requestId), ok: true, result, diagnostics };
      } catch (thrown) {
        diagnostics.push(String((thrown && thrown.message) || thrown));
        const envelope = fail(operation.id, input.requestId, "internal-error", "操作执行异常，详见 diagnostics");
        envelope.diagnostics = diagnostics;
        return envelope;
      }
    },
  };
}

module.exports = { createProtocol, PROTOCOL_VERSION, SUPPORTED_VERSIONS, ERROR_CODES };

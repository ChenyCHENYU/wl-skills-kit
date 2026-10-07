"use strict";

/**
 * integration-protocol.cjs — 五包统一公开集成协议 v1（单源快照）
 *
 * 由 kit-internal/conformance/scripts/sync-support.cjs 分发到各包，各包不得修改本文件；
 * 包特定能力目录、操作映射与执行器在各包的 protocol 接线文件中提供。
 *
 * 协议约定：
 * - describe：返回能力目录、协议版本、操作清单、输入输出约束与错误码。
 * - request：输入 JSON 对象（protocolVersion/operation/requestId + 操作字段），
 *   输出统一信封 { ok, result | error, diagnostics }；机器结果与诊断日志分离。
 * - 本协议只统一判定、解释、任务记录、状态查询与宿主诊断；业务执行仍走各包原有 CLI/MCP。
 * - 指令型技能不在本协议中伪装为自动执行；未声明 programmatic 执行的操作保持指令指导语义。
 */

const PROTOCOL_VERSION = 1;
const SUPPORTED_VERSIONS = [1];
const ERROR_CODES = ["unsupported-protocol", "unknown-operation", "missing-input", "invalid-input", "internal-error"];

function isEmptyValue(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function assertValidOperation(operation) {
  if (!operation.id || typeof operation.summary !== "string") throw new Error(`操作定义不完整：${JSON.stringify(operation)}`);
  if (typeof operation.readOnly !== "boolean") throw new Error(`操作 ${operation.id} 缺少 readOnly 声明`);
  if (!Array.isArray(operation.required) || !Array.isArray(operation.optional)) throw new Error(`操作 ${operation.id} 缺少 required/optional 输入声明`);
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
      operation: operation || null,
      requestId: requestId === undefined ? null : requestId,
    };
  }

  function fail(operation, requestId, code, message, extra) {
    return { ...base(operation, requestId), ok: false, error: { code, message, ...(extra || {}) }, diagnostics: [] };
  }

  function unsupportedVersionError(input) {
    if (input.protocolVersion === undefined || SUPPORTED_VERSIONS.includes(input.protocolVersion)) return null;
    return fail(input.operation || null, input.requestId, "unsupported-protocol", `不支持的协议版本：${input.protocolVersion}`, { supportedProtocolVersions: [...SUPPORTED_VERSIONS] });
  }

  function findOperation(input) {
    const operation = config.operations.find((item) => item.id === input.operation);
    if (operation) return { operation };
    return { error: fail(input.operation || null, input.requestId, "unknown-operation", `未知操作：${input.operation ?? "(缺失)"}`, { availableOperations: config.operations.map((item) => item.id) }) };
  }

  function validateRequest(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { error: fail(null, null, "invalid-input", "request 必须是 JSON 对象") };
    }
    const versionError = unsupportedVersionError(input);
    if (versionError) return { error: versionError };
    const found = findOperation(input);
    if (found.error) return found;
    const { operation } = found;
    const missingField = operation.required.find((field) => isEmptyValue(input[field]));
    if (missingField !== undefined) {
      return { error: fail(operation.id, input.requestId, "missing-input", `操作 ${operation.id} 缺少必要输入：${missingField}`, { field: missingField }) };
    }
    if (input.targets !== undefined && !Array.isArray(input.targets)) {
      return { error: fail(operation.id, input.requestId, "invalid-input", "targets 必须是字符串数组", { field: "targets" }) };
    }
    return { operation };
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
        constraints: {
          ...(config.constraints || {}),
          instructionOnly: "未提供 programmatic 执行入口的能力均为指令指导型，由宿主/AI 按各包技能流程执行并提供证据",
          evidence: "request 返回的判定与状态来自各包自身记录；宿主是否加载、读取、调用以宿主证据为准，本协议不代为宣称",
        },
        errorCodes: [...ERROR_CODES],
      };
    },

    request(input, runOperation) {
      const { operation, error } = validateRequest(input);
      if (error) return error;
      const diagnostics = [];
      try {
        const result = runOperation(operation.id, input, diagnostics);
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

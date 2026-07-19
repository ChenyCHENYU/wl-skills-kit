"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROFILE_FILE = path.resolve(__dirname, "..", "files", ".wl-skills", "contracts", "wl-delivery-profile.v1.json");
const DEFAULT_PROFILE = Object.freeze(JSON.parse(fs.readFileSync(PROFILE_FILE, "utf8")));
const STANDARD_OPERATIONS = ["page", "detail", "create", "update", "remove"];
const MODEL_NAMES = ["pageRequest", "createRequest", "updateRequest", "detailResponse", "pageResponse"];
const PERMISSION_SUFFIX = {
  page: "query_page",
  detail: "get_by_id",
  create: "save",
  update: "update_by_id",
  remove: "delete_by_id",
};

function joinUrl(base, suffix) {
  return `${base.replace(/\/$/, "")}/${suffix.replace(/^\//, "")}`;
}

function issue(target, code, location, message, expected, actual) {
  target.push({ code, location, message, ...(expected !== undefined ? { expected } : {}), ...(actual !== undefined ? { actual } : {}) });
}

function field(name, description, required, type, format) {
  return { name, description, required, type, ...(format ? { format } : {}) };
}

function buildStandaloneContract(options) {
  const required = ["contractId", "service", "resource", "module", "permissionPrefix"];
  const missing = required.filter((name) => !options?.[name]);
  if (missing.length) throw new Error(`缺少独立契约参数：${missing.join(", ")}`);
  const profile = options.profile || DEFAULT_PROFILE;
  const controllerBasePath = `/${options.resource}`;
  const externalBasePath = `/${options.service}/${options.resource}`;
  const operations = {};
  for (const name of STANDARD_OPERATIONS) {
    const definition = profile.transport.operations[name];
    operations[name] = {
      method: definition.method,
      controllerPath: joinUrl(controllerBasePath, definition.path),
      externalPath: joinUrl(externalBasePath, definition.path),
      permission: `${options.permissionPrefix}_${PERMISSION_SUFFIX[name]}`,
      requestModel: { page: "pageRequest", detail: "idPath", create: "createRequest", update: "updateRequest", remove: "idPath" }[name],
      responseModel: { page: "pageResponse", detail: "detailResponse", create: "idResponse", update: "emptyResponse", remove: "emptyResponse" }[name],
    };
  }
  const apiConfig = {
    list: operations.page.externalPath,
    getById: operations.detail.externalPath,
    save: operations.create.externalPath,
    update: operations.update.externalPath,
    remove: operations.remove.externalPath,
  };
  return {
    schemaVersion: 1,
    kind: "wl-api-contract",
    protocolVersion: profile.protocolVersion,
    source: { profile: profile.profileId, mode: options.sourceMode || "requirements" },
    resource: {
      contractId: options.contractId,
      module: options.module,
      entity: options.entity || options.resource,
      description: options.description || options.resource,
      permissionPrefix: options.permissionPrefix,
      ...(options.externalId ? { externalId: options.externalId } : {}),
    },
    transport: {
      successCode: profile.transport.responseEnvelope.successCode,
      envelope: [profile.transport.responseEnvelope.codeField, profile.transport.responseEnvelope.messageField, profile.transport.responseEnvelope.dataField],
      pagination: {
        recordsPath: profile.transport.pagination.responseRecords,
        totalPath: profile.transport.pagination.responseTotal,
      },
      controllerBasePath,
      externalBasePath,
    },
    operations,
    models: {
      pageRequest: [
        field(profile.transport.pagination.requestCurrent, "当前页码", true, "integer", "int64"),
        field(profile.transport.pagination.requestSize, "每页记录数", true, "integer", "int64"),
      ],
      createRequest: [],
      updateRequest: [field("id", "主键ID", true, "string"), field(profile.transport.concurrency.field, "乐观锁版本号", true, "integer", "int32")],
      detailResponse: [field("id", "主键ID", true, "string"), field(profile.transport.concurrency.field, "乐观锁版本号", true, "integer", "int32")],
      pageResponse: [field("id", "主键ID", true, "string")],
    },
    frontend: {
      apiConfig,
      pathParameterSyntax: "RFC6570-simple",
      notes: [
        "{id} 必须使用 encodeURIComponent 后替换；不得作为 query 参数调用 path-style 接口。",
        "update 使用 putAction，remove 使用 deleteAction；请求方法以 operations 为准。",
      ],
    },
    completion: { contractStatus: "draft", openQuestions: [], deviations: [], skeletonOperations: [] },
  };
}

function validateOperation(contract, name, profile, errors) {
  const operation = contract.operations?.[name];
  if (!operation || typeof operation !== "object") {
    issue(errors, "AC010", `operations.${name}`, "缺少标准操作");
    return;
  }
  const expected = profile.transport.operations[name];
  if (operation.method !== expected.method) issue(errors, "AC011", `operations.${name}.method`, "HTTP 方法与 profile 不一致", expected.method, operation.method);
  if (!String(operation.externalPath || "").endsWith(`/${expected.path}`)) issue(errors, "AC012", `operations.${name}.externalPath`, "外部路径与 profile 不一致", expected.path, operation.externalPath);
  for (const key of ["controllerPath", "externalPath", "permission", "requestModel", "responseModel"]) {
    if (!operation[key] || typeof operation[key] !== "string") issue(errors, "AC013", `operations.${name}.${key}`, "必须是非空字符串");
  }
}

function validateRequiredModels(contract, errors) {
  for (const name of MODEL_NAMES) {
    if (!Array.isArray(contract.models?.[name])) issue(errors, "AC020", `models.${name}`, "必须是字段数组");
  }
}

function validateModelField(item, location, names, errors) {
  if (!item?.name || !item?.type || typeof item.required !== "boolean") {
    issue(errors, "AC021", location, "字段必须声明 name/type/required");
  }
  if (names.has(item?.name)) issue(errors, "AC022", `${location}.name`, `字段重复：${item?.name}`);
  names.add(item?.name);
}

function validateModelFields(contract, errors) {
  for (const [name, fields] of Object.entries(contract.models || {})) {
    if (!Array.isArray(fields)) continue;
    const names = new Set();
    fields.forEach((item, index) => validateModelField(item, `models.${name}[${index}]`, names, errors));
  }
}

function validateConcurrencyModels(contract, errors) {
  const updateNames = new Set((contract.models?.updateRequest || []).map((item) => item.name));
  const detailNames = new Set((contract.models?.detailResponse || []).map((item) => item.name));
  if (!updateNames.has("revision")) issue(errors, "AC023", "models.updateRequest", "更新请求必须携带 revision");
  if (!detailNames.has("revision")) issue(errors, "AC024", "models.detailResponse", "详情响应必须返回 revision");
}

function validateModels(contract, errors) {
  validateRequiredModels(contract, errors);
  validateModelFields(contract, errors);
  validateConcurrencyModels(contract, errors);
}

function validateContractHeader(contract, profile, options, errors, warnings) {
  if (contract.schemaVersion !== 1) issue(errors, "AC001", "schemaVersion", "必须为 1");
  if (contract.kind === "wl-backend-collaboration-contract") {
    issue(warnings, "AC103", "kind", "旧契约类型仅用于迁移；发布前必须升级为 wl-api-contract");
  } else if (contract.kind !== "wl-api-contract") issue(errors, "AC002", "kind", "不支持的契约类型");
  const protocolVersion = contract.protocolVersion || "1.0";
  if (protocolVersion !== profile.protocolVersion) issue(errors, "AC003", "protocolVersion", "协议版本不兼容", profile.protocolVersion, protocolVersion);
  if (contract.source?.profile !== profile.profileId) issue(errors, "AC004", "source.profile", "profile 不兼容", profile.profileId, contract.source?.profile);
}

function validateResource(contract, errors) {
  for (const name of ["contractId", "module", "entity", "description", "permissionPrefix"]) {
    if (!contract.resource?.[name]) issue(errors, "AC005", `resource.${name}`, "不能为空");
  }
}

function validateTransport(contract, profile, errors) {
  if (contract.transport?.successCode !== profile.transport.responseEnvelope.successCode) issue(errors, "AC006", "transport.successCode", "成功码不一致", profile.transport.responseEnvelope.successCode, contract.transport?.successCode);
  if (JSON.stringify(contract.transport?.envelope) !== JSON.stringify(["code", "message", "data"])) issue(errors, "AC007", "transport.envelope", "响应外壳必须为 code/message/data");
  validatePagination(contract.transport?.pagination, errors);
}

function validatePagination(pagination, errors) {
  if (pagination?.recordsPath !== "data.records" || pagination?.totalPath !== "data.total") issue(errors, "AC008", "transport.pagination", "分页响应必须使用 data.records/data.total");
}

function validateOperations(contract, profile, errors) {
  for (const name of STANDARD_OPERATIONS) validateOperation(contract, name, profile, errors);
}

function validateFrontendConfig(contract, errors) {
  const configMap = { page: "list", detail: "getById", create: "save", update: "update", remove: "remove" };
  for (const [operationName, configName] of Object.entries(configMap)) {
    const expected = contract.operations?.[operationName]?.externalPath;
    const actual = contract.frontend?.apiConfig?.[configName];
    if (expected && actual !== expected) issue(errors, "AC030", `frontend.apiConfig.${configName}`, "API_CONFIG 与 operation 路径不一致", expected, actual);
  }
}

function validateCompletion(contract, options, errors, warnings) {
  const { completion } = contract;
  if (!completion) {
    issue(warnings, "AC101", "completion", "旧契约未声明确认状态；联调前应升级为 WL API Contract v1");
    return;
  }
  if (!Array.isArray(completion.openQuestions) || !Array.isArray(completion.deviations)
    || !Array.isArray(completion.skeletonOperations)) {
    issue(errors, "AC031", "completion", "openQuestions/deviations/skeletonOperations 必须是数组");
  }
  validateStrictCompletion(completion, options, errors);
  validateCompletionDeviations(completion, warnings);
}

function validateStrictCompletion(completion, options, errors) {
  if (options.strict && completion.contractStatus !== "confirmed") issue(errors, "AC032", "completion.contractStatus", "严格模式要求 contractStatus=confirmed");
  if (options.strict && completion.openQuestions?.length) issue(errors, "AC033", "completion.openQuestions", "严格模式不允许未决问题");
}

function validateCompletionDeviations(completion, warnings) {
  if (completion.deviations?.length) issue(warnings, "AC102", "completion.deviations", `存在 ${completion.deviations.length} 项显式偏差，需双方确认`);
}

function validateApiContract(contract, options = {}) {
  const errors = [];
  const warnings = [];
  const profile = options.profile || DEFAULT_PROFILE;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    issue(errors, "AC000", "$", "API contract 必须是 JSON 对象");
    return { ok: false, errors, warnings, summary: { errors: 1, warnings: 0 } };
  }
  validateContractHeader(contract, profile, options, errors, warnings);
  validateResource(contract, errors);
  validateTransport(contract, profile, errors);
  validateOperations(contract, profile, errors);
  validateModels(contract, errors);
  validateFrontendConfig(contract, errors);
  validateCompletion(contract, options, errors, warnings);
  return {
    ok: errors.length === 0 && !(options.strict && warnings.length > 0),
    errors,
    warnings,
    summary: { errors: errors.length, warnings: warnings.length },
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function at(value, dotted) {
  return dotted.split(".").reduce((current, key) => current?.[key], value);
}

function collectValidation(result, side, errors, warnings) {
  for (const item of result.errors) issue(errors, `${side}_${item.code}`, item.location, `${side === "ACL" ? "左" : "右"}侧契约：${item.message}`);
  for (const item of result.warnings) issue(warnings, `${side}_${item.code}`, item.location, `${side === "ACL" ? "左" : "右"}侧契约：${item.message}`);
}

function compareLocations(left, right, locations, errors) {
  for (const location of locations) {
    const a = stable(at(left, location));
    const b = stable(at(right, location));
    if (JSON.stringify(a) !== JSON.stringify(b)) issue(errors, "AC200", location, "前后端契约不一致", a, b);
  }
}

function compareOptionalCollections(left, right, errors) {
  for (const location of ["extensionOperations", "relations"]) {
    if (at(left, location) === undefined && at(right, location) === undefined) continue;
    const a = stable(at(left, location) || []);
    const b = stable(at(right, location) || []);
    if (JSON.stringify(a) !== JSON.stringify(b)) issue(errors, "AC200", location, "前后端扩展契约不一致", a, b);
  }
}

function compareExternalId(left, right, errors, warnings) {
  const leftExternalId = left.resource?.externalId;
  const rightExternalId = right.resource?.externalId;
  if (leftExternalId && rightExternalId && leftExternalId !== rightExternalId) {
    issue(errors, "AC201", "resource.externalId", "前后端稳定 ID 不一致", leftExternalId, rightExternalId);
  } else if (Boolean(leftExternalId) !== Boolean(rightExternalId)) {
    issue(warnings, "AC104", "resource.externalId", "仅一侧提供可选 design 稳定 ID；不影响独立闭环");
  }
}

function hasBlockingStrictWarning(warnings) {
  return warnings.some((item) => !item.code.endsWith("AC104"));
}

function compareApiContracts(left, right, options = {}) {
  const errors = [];
  const warnings = [];
  const leftValidation = validateApiContract(left, options);
  const rightValidation = validateApiContract(right, options);
  collectValidation(leftValidation, "ACL", errors, warnings);
  collectValidation(rightValidation, "ACR", errors, warnings);
  const comparePaths = [
    "protocolVersion",
    "source.profile",
    "resource.contractId",
    "resource.module",
    "resource.entity",
    "resource.description",
    "resource.permissionPrefix",
    "transport",
    "operations",
    "models",
    "frontend.apiConfig",
    "frontend.pathParameterSyntax",
  ];
  compareLocations(left, right, comparePaths, errors);
  compareOptionalCollections(left, right, errors);
  compareExternalId(left, right, errors, warnings);
  return {
    ok: errors.length === 0 && !(options.strict && hasBlockingStrictWarning(warnings)),
    errors,
    warnings,
    summary: { errors: errors.length, warnings: warnings.length },
  };
}

function readApiContract(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

function renderApiMarkdown(contract) {
  const operationRows = Object.entries(contract.operations).map(([name, item]) => `| ${name} | ${item.method} | ${item.externalPath} | ${item.permission} |`);
  const configRows = Object.entries(contract.frontend.apiConfig).map(([name, value]) => `  ${name}: ${JSON.stringify(value)},`);
  return [
    `# 接口约定 - ${contract.resource.description}`,
    "",
    `> 契约：${contract.resource.contractId} | Profile：${contract.source.profile}@${contract.protocolVersion || "1.0"} | 状态：${contract.completion?.contractStatus || "draft"}`,
    "",
    "## API_CONFIG",
    "",
    "```typescript",
    "export const API_CONFIG = {",
    ...configRows,
    "} as const;",
    "export const resolveApiPath = (template: string, id: string) => template.replace(\"{id}\", encodeURIComponent(id));",
    "```",
    "",
    "> 含 `{id}` 的地址必须调用 resolveApiPath；update 使用 putAction，remove 使用 deleteAction。",
    "",
    "## 接口清单",
    "",
    "| operation | method | URL | permission |",
    "|---|---|---|---|",
    ...operationRows,
    "",
    "## 机器可读契约",
    "",
    "```wl-api-contract",
    JSON.stringify(contract, null, 2),
    "```",
    "",
  ].join("\n");
}

module.exports = {
  DEFAULT_PROFILE,
  STANDARD_OPERATIONS,
  buildStandaloneContract,
  compareApiContracts,
  readApiContract,
  renderApiMarkdown,
  validateApiContract,
};

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { validateFieldConstraints } = require("./field-constraints");

const PROFILE_FILE = path.resolve(__dirname, "..", "files", ".wl-skills", "contracts", "wl-delivery-profile.v1.json");
const DEFAULT_PROFILE = Object.freeze(JSON.parse(fs.readFileSync(PROFILE_FILE, "utf8")));
const PROJECT_PROFILE_RELATIVE = path.join(".wl-skills", "contracts", "wl-delivery-profile.v1.json");
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

function nonEmptyString(value) {
  return typeof value === "string" && Boolean(value);
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validDefaultPageSize(pagination) {
  if (!positiveInteger(pagination?.defaultSize)) return true;
  if (!positiveInteger(pagination?.maxSize)) return true;
  return pagination.defaultSize <= pagination.maxSize;
}

function appendPaginationShapeErrors(pagination, errors) {
  for (const key of ["requestCurrent", "requestSize", "responseRecords", "responseTotal"]) {
    if (!nonEmptyString(pagination?.[key])) errors.push(`transport.pagination.${key} 必须是非空字符串`);
  }
  for (const key of ["defaultCurrent", "defaultSize", "maxSize"]) {
    if (!positiveInteger(pagination?.[key])) errors.push(`transport.pagination.${key} 必须是正整数`);
  }
  if (!validDefaultPageSize(pagination)) errors.push("transport.pagination.defaultSize 不能大于 maxSize");
}

function appendOperationShapeErrors(profile, errors) {
  for (const name of STANDARD_OPERATIONS) {
    const operation = profile.transport?.operations?.[name];
    if (!operation || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(operation.method)) {
      errors.push(`transport.operations.${name}.method 非法`);
    }
    if (typeof operation?.path !== "string" || !operation.path) errors.push(`transport.operations.${name}.path 不能为空`);
  }
}

function profileShapeErrors(profile) {
  const errors = [];
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return ["profile 必须是 JSON 对象"];
  if (!profile.profileId || !profile.protocolVersion) errors.push("profileId/protocolVersion 不能为空");
  appendPaginationShapeErrors(profile.transport?.pagination, errors);
  appendOperationShapeErrors(profile, errors);
  return errors;
}

function profileDeviationWarnings(profile) {
  const warnings = [];
  for (const name of STANDARD_OPERATIONS) {
    const actual = profile.transport?.operations?.[name];
    const expected = DEFAULT_PROFILE.transport.operations[name];
    if (actual && JSON.stringify(actual) !== JSON.stringify(expected)) {
      issue(warnings, "AC105", `profile.transport.operations.${name}`, "项目 Profile 覆盖通用基线；以项目显式口径为准", expected, actual);
    }
  }
  const actualPagination = profile.transport?.pagination;
  const expectedPagination = DEFAULT_PROFILE.transport.pagination;
  if (actualPagination && JSON.stringify(actualPagination) !== JSON.stringify(expectedPagination)) {
    issue(warnings, "AC105", "profile.transport.pagination", "项目 Profile 覆盖通用分页基线；以项目显式口径为准", expectedPagination, actualPagination);
  }
  return warnings;
}

function loadDeliveryProfile(projectRoot, explicitFile) {
  const projectFile = explicitFile || (projectRoot ? path.join(path.resolve(projectRoot), PROJECT_PROFILE_RELATIVE) : null);
  const file = projectFile && fs.existsSync(projectFile) ? projectFile : PROFILE_FILE;
  try {
    const profile = file === PROFILE_FILE ? DEFAULT_PROFILE : JSON.parse(fs.readFileSync(file, "utf8"));
    return { profile, file, errors: profileShapeErrors(profile), warnings: profileDeviationWarnings(profile) };
  } catch (error) {
    return { profile: DEFAULT_PROFILE, file, errors: [`Profile 读取失败：${error.message}`], warnings: [] };
  }
}

function field(name, description, required, type, format, extras = {}) {
  return { name, description, required, type, ...(format ? { format } : {}), ...extras };
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
        requestCurrent: profile.transport.pagination.requestCurrent,
        requestSize: profile.transport.pagination.requestSize,
        defaultCurrent: profile.transport.pagination.defaultCurrent,
        defaultSize: profile.transport.pagination.defaultSize,
        maxSize: profile.transport.pagination.maxSize,
        recordsPath: profile.transport.pagination.responseRecords,
        totalPath: profile.transport.pagination.responseTotal,
      },
      controllerBasePath,
      externalBasePath,
    },
    operations,
    models: {
      pageRequest: [
        field(profile.transport.pagination.requestCurrent, "当前页码", true, "integer", "int64", {
          default: profile.transport.pagination.defaultCurrent,
          constraints: { minimum: 1, totalDigits: 10, fractionDigits: 0 },
          constraintSource: "delivery-profile:transport.pagination",
        }),
        field(profile.transport.pagination.requestSize, "每页记录数", true, "integer", "int64", {
          default: profile.transport.pagination.defaultSize,
          constraints: {
            minimum: 1,
            maximum: profile.transport.pagination.maxSize,
            totalDigits: 10,
            fractionDigits: 0,
          },
          constraintSource: "delivery-profile:transport.pagination",
        }),
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

function validateModelField(item, location, names, errors, options) {
  if (!item?.name || !item?.type || typeof item.required !== "boolean") {
    issue(errors, "AC021", location, "字段必须声明 name/type/required");
  }
  if (names.has(item?.name)) issue(errors, "AC022", `${location}.name`, `字段重复：${item?.name}`);
  names.add(item?.name);
  appendModelConstraintErrors(item, location, errors, options);
}

function appendModelConstraintErrors(item, location, errors, options) {
  for (const message of validateFieldConstraints(item, {
    location,
    strict: options.strict === true,
  })) {
    issue(errors, "AC025", location, message);
  }
}

function validateModelFields(contract, errors, options) {
  for (const [name, fields] of Object.entries(contract.models || {})) {
    if (!Array.isArray(fields)) continue;
    const names = new Set();
    fields.forEach((item, index) =>
      validateModelField(
        item,
        `models.${name}[${index}]`,
        names,
        errors,
        options,
      ));
  }
}

function validateConcurrencyModels(contract, errors) {
  const updateNames = new Set((contract.models?.updateRequest || []).map((item) => item.name));
  const detailNames = new Set((contract.models?.detailResponse || []).map((item) => item.name));
  if (!updateNames.has("revision")) issue(errors, "AC023", "models.updateRequest", "更新请求必须携带 revision");
  if (!detailNames.has("revision")) issue(errors, "AC024", "models.detailResponse", "详情响应必须返回 revision");
}

function validateModels(contract, errors, options) {
  validateRequiredModels(contract, errors);
  validateModelFields(contract, errors, options);
  validateConcurrencyModels(contract, errors);
}

const CROSS_FIELD_OPERATION_MODELS = Object.freeze({ page: "pageRequest", create: "createRequest", update: "updateRequest" });

function validChronologyShape(rule) {
  return [rule?.kind === "chronology", rule?.startField, rule?.endField, rule?.message, rule?.source].every(Boolean);
}

function validChronologyOperations(operations) {
  return Array.isArray(operations)
    && operations.length > 0
    && operations.every((operation) => Boolean(CROSS_FIELD_OPERATION_MODELS[operation]));
}

function validChronologyFields(start, end) {
  return [start?.type === "string", end?.type === "string", start?.format === end?.format,
    ["date", "date-time"].includes(start?.format)].every(Boolean);
}

function validateChronologyOperation(contract, rule, operation, location, errors) {
  const modelName = CROSS_FIELD_OPERATION_MODELS[operation];
  const fields = new Map((contract.models?.[modelName] || []).map((field) => [field.name, field]));
  const start = fields.get(rule.startField);
  const end = fields.get(rule.endField);
  if (!start || !end) issue(errors, "AC026", location, `${operation} 模型缺少时间范围字段`);
  else if (!validChronologyFields(start, end)) issue(errors, "AC026", location, "chronology 两端必须是相同 date/date-time 类型");
}

function validateChronologyRule(contract, rule, index, errors) {
  const location = `validationRules[${index}]`;
  if (!validChronologyShape(rule)) {
    issue(errors, "AC026", location, "chronology 必须声明 startField/endField/message/source");
    return;
  }
  if (!validChronologyOperations(rule.operations)) {
    issue(errors, "AC026", `${location}.operations`, "只允许 page/create/update 的非空数组");
    return;
  }
  for (const operation of rule.operations) validateChronologyOperation(contract, rule, operation, location, errors);
}

function validateCrossFieldRules(contract, errors) {
  if (contract.validationRules === undefined) return;
  if (!Array.isArray(contract.validationRules)) {
    issue(errors, "AC026", "validationRules", "必须是数组");
    return;
  }
  contract.validationRules.forEach((rule, index) => validateChronologyRule(contract, rule, index, errors));
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
  validatePagination(contract.transport?.pagination, profile, errors);
}

function validatePagination(pagination, profile, errors) {
  const expected = profile.transport.pagination;
  const checks = [
    [pagination?.requestCurrent, expected.requestCurrent],
    [pagination?.requestSize, expected.requestSize],
    [pagination?.defaultCurrent, expected.defaultCurrent],
    [pagination?.defaultSize, expected.defaultSize],
    [pagination?.maxSize, expected.maxSize],
    [pagination?.recordsPath, expected.responseRecords],
    [pagination?.totalPath, expected.responseTotal],
  ];
  const valid = checks.every(([actual, expectedValue]) => Object.is(actual, expectedValue));
  if (!valid) {
    issue(
      errors,
      "AC008",
      "transport.pagination",
      `分页契约必须与生效 Profile 一致：${expected.requestCurrent}/${expected.requestSize}，默认 ${expected.defaultCurrent}/${expected.defaultSize}，最大 ${expected.maxSize}，响应 ${expected.responseRecords}/${expected.responseTotal}`,
    );
  }
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
  for (const message of profileShapeErrors(profile)) issue(errors, "AC009", "profile", message);
  warnings.push(...profileDeviationWarnings(profile));
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    issue(errors, "AC000", "$", "API contract 必须是 JSON 对象");
    return { ok: false, errors, warnings, summary: { errors: 1, warnings: 0 } };
  }
  validateContractHeader(contract, profile, options, errors, warnings);
  validateResource(contract, errors);
  validateTransport(contract, profile, errors);
  validateOperations(contract, profile, errors);
  validateModels(contract, errors, options);
  validateCrossFieldRules(contract, errors);
  validateFrontendConfig(contract, errors);
  validateCompletion(contract, options, errors, warnings);
  return {
    ok: errors.length === 0 && !(options.strict && hasBlockingStrictWarning(warnings)),
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
  for (const location of ["extensionOperations", "relations", "validationRules"]) {
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
  return warnings.some((item) => !["AC104", "AC105"].some((code) => item.code.endsWith(code)));
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
  loadDeliveryProfile,
  readApiContract,
  renderApiMarkdown,
  validateApiContract,
};

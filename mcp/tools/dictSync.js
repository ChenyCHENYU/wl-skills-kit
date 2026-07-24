'use strict'

const path = require('path')
const { withFileLock } = require('../../lib/process-lock')
const { writeBlockReason } = require('../write-guard')
const {
  applyBootstrap,
  buildLocalRegistry,
  hashValue,
  planBootstrap,
} = require('../../lib/dict-project')
const {
  queryBusinessDictModules,
  querySystemDictModules,
  queryDictModules,
  saveDictModule,
  saveDictItem,
  getDictItem,
  queryDictDetails,
  saveDictDetail,
} = require('../api/dictApi')

const projectLocks = new Map()

class DictSyncFailure extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'DictSyncFailure'
    this.code = code
    this.details = details
  }
}

function identityKey(value) {
  return String(value || '').toLocaleLowerCase('en-US')
}

function getNodeName(node) {
  return (node && (node.strName || node.name)) || ''
}

function hasEntityId(node) {
  return node && node.id != null && String(node.id).trim() !== ''
}

function requireEntityId(node, label) {
  if (!hasEntityId(node)) throw new Error(`${label} 缺少 id，已阻断后续写入`)
  return node
}

function extractModules(data) {
  if (!data) return []
  if (data.dictionary && Array.isArray(data.dictionary.children)) return data.dictionary.children
  return Array.isArray(data) ? data : []
}

function extractBusinessModules(data) {
  if (!data) return []
  if (data.page && Array.isArray(data.page.records)) return data.page.records
  if (Array.isArray(data.records)) return data.records
  if (Array.isArray(data.list)) return data.list
  for (const value of Object.values(data)) {
    if (!value || typeof value !== 'object') continue
    const nested = extractBusinessModules(value)
    if (nested.length > 0) return nested
  }
  return extractModules(data)
}

function extractModulePage(data) {
  if (!data || typeof data !== 'object') return null
  if (data.page && typeof data.page === 'object') return data.page
  for (const value of Object.values(data)) {
    if (!value || typeof value !== 'object') continue
    const nested = extractModulePage(value)
    if (nested) return nested
  }
  return null
}

function globalDictionaryConfig(config) {
  return {
    ...config,
    sysAppNo: '',
    sysOnlyCurrentApp: false,
    dict: { ...(config.dict || {}), sysOnlyCurrentApp: false },
  }
}

async function queryAllModulePages(queryFn, query, config, label) {
  const records = []
  const size = 200
  let current = 1
  let pages = 1
  do {
    const result = await queryFn({ ...(query || {}), current, size }, config)
    if (!result.ok) return result
    records.push(...extractBusinessModules(result.data))
    const page = extractModulePage(result.data)
    pages = page && Number(page.pages) > 0 ? Number(page.pages) : 1
    current += 1
  } while (current <= pages && current <= 100)
  if (current <= pages) {
    return { ok: false, error: `${label}超过安全分页上限 20000 条` }
  }
  return { ok: true, data: records }
}

function queryAllBusinessModules(config, query = {}) {
  return queryAllModulePages(
    queryBusinessDictModules,
    { moduleId: -1, ...query },
    config,
    '业务字典模块',
  )
}

function queryAllSystemModules(config, query = {}) {
  return queryAllModulePages(querySystemDictModules, query, config, '系统字典模块')
}

function moduleIndexKey(module) {
  if (hasEntityId(module)) return `id:${module.id}`
  return `code:${identityKey(module.strSn)}`
}

function moduleChildren(module, fallback = []) {
  return Array.isArray(module.children) ? module.children : fallback
}

function findMergedModuleKey(merged, module) {
  const idKey = hasEntityId(module) ? `id:${module.id}` : ''
  const codeKey = `code:${identityKey(module.strSn)}`
  if (idKey && merged.has(idKey)) return idKey
  if (merged.has(codeKey)) return codeKey
  return idKey || codeKey
}

function mergeOnlineModules(treeModules, businessModules) {
  const merged = new Map()
  for (const module of businessModules) {
    merged.set(moduleIndexKey(module), { ...module, children: moduleChildren(module) })
  }
  for (const module of treeModules) {
    const key = findMergedModuleKey(merged, module)
    const previous = merged.get(key) || {}
    merged.set(key, {
      ...previous,
      ...module,
      children: moduleChildren(module, previous.children || []),
    })
  }
  return [...merged.values()]
}

async function queryOnlineModules(config) {
  const treeResult = await queryDictModules(config)
  if (!treeResult.ok) throw new Error(`查询线上字典树失败: ${treeResult.error}`)
  const businessResult = await queryAllBusinessModules(config)
  if (!businessResult.ok) throw new Error(`查询线上业务字典模块失败: ${businessResult.error}`)
  const globalBusinessResult = await queryAllBusinessModules(globalDictionaryConfig(config))
  if (!globalBusinessResult.ok) {
    throw new Error(`查询全局业务字典模块失败: ${globalBusinessResult.error}`)
  }
  return mergeOnlineModules(
    extractModules(treeResult.data),
    [
      ...extractBusinessModules(globalBusinessResult.data),
      ...extractBusinessModules(businessResult.data),
    ],
  )
}

function extractDetailRecords(data) {
  if (!data) return []
  if (data.page && Array.isArray(data.page.records)) return data.page.records
  if (Array.isArray(data.records)) return data.records
  return Array.isArray(data) ? data : []
}

function extractDetailPage(data) {
  return data && typeof data === 'object' && data.page ? data.page : null
}

async function queryAllDictDetails(dictId, config) {
  const records = []
  const size = 200
  let current = 1
  let pages = 1
  do {
    const result = await queryDictDetails(dictId, config, { current, size })
    if (!result.ok) return result
    records.push(...extractDetailRecords(result.data))
    const page = extractDetailPage(result.data)
    pages = page && Number(page.pages) > 0 ? Number(page.pages) : 1
    current += 1
  } while (current <= pages && current <= 100)
  if (current <= pages) return { ok: false, error: '字典明细超过安全分页上限 20000 条' }
  return { ok: true, data: records }
}

function findModule(modules, moduleBody) {
  if (!moduleBody) return null
  if (moduleBody.id) {
    return modules.find((module) => String(module.id) === String(moduleBody.id)) || null
  }
  if (moduleBody.strSn) {
    return modules.find((module) => String(module.strSn) === String(moduleBody.strSn)) || null
  }
  const name = moduleBody.strName || moduleBody.name
  return name ? modules.find((module) => String(getNodeName(module)) === String(name)) || null : null
}

function findDictInModule(moduleNode, dictBody) {
  const dictionaries = moduleNode && Array.isArray(moduleNode.children) ? moduleNode.children : []
  if (dictBody && dictBody.id) {
    return dictionaries.find((dictionary) => String(dictionary.id) === String(dictBody.id)) || null
  }
  return dictionaries.find((dictionary) => String(dictionary.strSn) === String(dictBody.strSn)) || null
}

function toSafeCodeSuffix(...values) {
  for (const value of values) {
    if (value == null) continue
    const cleaned = String(value).trim()
      .replace(/[\u4e00-\u9fa5]/g, '')
      .replace(/[^A-Za-z0-9_.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
    if (cleaned) return cleaned.toLowerCase()
  }
  const raw = values.find((value) => value != null && String(value).trim())
  return raw ? `u${Buffer.from(String(raw)).toString('hex').slice(0, 24)}` : 'item'
}

function readDetailValues(item) {
  const raw = Object.prototype.hasOwnProperty.call(item, 'strKey') ||
    Object.prototype.hasOwnProperty.call(item, 'strValue')
  return {
    strKey: raw ? item.strKey : item.value,
    strValue: raw ? item.strValue : item.label,
  }
}

function validateDetailValues(item, values) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '明细项必须是对象'
  if (values.strKey == null || String(values.strKey) === '') return '明细项缺少 value 或 strKey'
  if (values.strValue == null || String(values.strValue) === '') return '明细项缺少 label 或 strValue'
  return ''
}

function copyOptionalDetailValues(source, target) {
  for (const field of ['strValue2', 'strValue3', 'strValue4']) {
    if (source[field] != null) target[field] = String(source[field])
  }
}

function normalizeDetailItem(item, dictCode) {
  const values = item && typeof item === 'object' ? readDetailValues(item) : {}
  const error = validateDetailValues(item, values)
  if (error) return { ok: false, error }
  const normalized = {
    strKey: String(values.strKey),
    strValue: String(values.strValue),
  }
  copyOptionalDetailValues(item, normalized)
  const prefix = dictCode ? `${dictCode}_` : ''
  normalized.strValueCode = item.strValueCode ||
    `sysDict.dtl.strValue.${prefix}${toSafeCodeSuffix(normalized.strValue, normalized.strKey)}`
  return { ok: true, item: normalized }
}

function buildDetailBody(detail, dictBody, dictId) {
  if (dictId == null || String(dictId).trim() === '') {
    throw new Error(`字典 ${dictBody.strSn} 缺少 dictId，禁止创建明细`)
  }
  return {
    dictId,
    strSn: dictBody.strSn,
    ...detail,
  }
}

function normalizeComparableDetail(item) {
  const result = {}
  for (const field of ['strKey', 'strValue', 'strValue2', 'strValue3', 'strValue4', 'strValueCode']) {
    result[field] = item && item[field] != null ? String(item[field]) : ''
  }
  return result
}

function detailDifference(expected, actual) {
  const left = normalizeComparableDetail(expected)
  const right = normalizeComparableDetail(actual)
  return Object.keys(left).filter((field) => left[field] !== right[field])
}

function buildModuleBody(moduleBody) {
  return {
    strSn: moduleBody.strSn,
    strName: moduleBody.strName,
    sortPriority: moduleBody.sortPriority != null ? String(moduleBody.sortPriority) : '1',
    strLevel: 2,
  }
}

function buildDictBody(dictBody, moduleId) {
  if (moduleId == null || String(moduleId).trim() === '') {
    throw new Error(`字典 ${dictBody.strSn} 缺少 moduleId，禁止创建字典`)
  }
  return {
    moduleId,
    strSn: dictBody.strSn,
    strName: dictBody.strName,
    strLevel: 2,
    dtlValueRequired: false,
    dtlValue2Required: false,
    dtlValue3Required: false,
    dtlValue4Required: false,
    orderField: dictBody.orderField,
    orderRule: String(dictBody.orderRule).toLowerCase(),
  }
}

function filterRegistry(registry, dictCodes) {
  if (dictCodes == null) return registry
  if (!Array.isArray(dictCodes) || dictCodes.length === 0) throw new Error('dictCodes 必须是非空数组')
  const selected = new Set(dictCodes.map(String))
  const modules = registry.modules.map((module) => ({
    ...module,
    payloads: module.payloads.filter((payload) => selected.has(payload.dict.strSn)),
  })).filter((module) => module.payloads.length > 0)
  const found = new Set(modules.flatMap((module) => module.payloads.map((payload) => payload.dict.strSn)))
  const missing = [...selected].filter((code) => !found.has(code))
  if (missing.length > 0) throw new Error(`dicts.ts 中不存在字典: ${missing.join(', ')}`)
  return { ...registry, modules }
}

function localOptions(args) {
  const projectRoot = process.env.WL_PROJECT_ROOT || process.cwd()
  return args.scope === 'project'
    ? { projectRoot, searchRoot: args.searchRoot }
    : { projectRoot, sourcePath: args.sourcePath }
}

function buildRemoteIndexes(modules) {
  const moduleByCode = new Map()
  const dictOwners = new Map()
  const issues = []
  for (const module of modules) {
    const code = String(module.strSn || '')
    if (!code) continue
    if (!hasEntityId(module)) issues.push(`线上模块 ${code} 缺少 id`)
    const key = identityKey(code)
    if (moduleByCode.has(key)) issues.push(`线上模块编码重复（忽略大小写）: ${code}`)
    else moduleByCode.set(key, module)
    indexRemoteDictionaries(module, code, dictOwners, issues)
  }
  return { moduleByCode, dictOwners, issues }
}

function indexRemoteDictionaries(module, moduleCode, owners, issues) {
  for (const dictionary of Array.isArray(module.children) ? module.children : []) {
    const dictCode = String(dictionary.strSn || '')
    if (!dictCode) continue
    if (!hasEntityId(dictionary)) issues.push(`线上字典 ${dictCode} 缺少 id`)
    const key = identityKey(dictCode)
    const owner = owners.get(key)
    if (owner && owner.moduleCode !== moduleCode) {
      issues.push(`线上字典 ${dictCode} 同时属于模块 ${owner.moduleCode} 和 ${moduleCode}`)
    } else {
      owners.set(key, { moduleCode, dictionary })
    }
  }
}

function addIssue(plan, type, payload, message) {
  plan.issues.push({ type, ...payload, message })
}

function addAction(plan, type, payload) {
  const identity = `${type}:${payload.moduleCode || ''}:${payload.dictCode || ''}:${payload.detail && payload.detail.strKey || ''}`
  const exists = plan.actions.some((action) =>
    `${action.type}:${action.moduleCode || ''}:${action.dictCode || ''}:${action.detail && action.detail.strKey || ''}` === identity)
  if (!exists) plan.actions.push({ type, ...payload })
}

function compareModuleIdentity(plan, payload, onlineModule) {
  if (String(onlineModule.strSn) !== String(payload.module.strSn)) {
    addIssue(plan, 'module-code-case-conflict', { moduleCode: payload.module.strSn },
      `线上模块编码“${onlineModule.strSn}”与本地“${payload.module.strSn}”仅大小写不同`)
  }
  const onlineName = getNodeName(onlineModule)
  if (onlineName && onlineName !== payload.module.strName) {
    addIssue(plan, 'module-name-conflict', { moduleCode: payload.module.strSn },
      `线上模块名称“${onlineName}”与本地“${payload.module.strName}”不一致`)
  }
}

function inspectDictionaryName(plan, payload, onlineDict, identity) {
  const onlineName = getNodeName(onlineDict)
  if (onlineName && onlineName !== payload.dict.strName) {
    addIssue(plan, 'dictionary-name-conflict', identity,
      `线上字典名称“${onlineName}”与本地“${payload.dict.strName}”不一致`)
    return false
  }
  return true
}

async function readDictionaryDefinition(payload, onlineDict, config) {
  const definitionResult = await getDictItem(onlineDict.id, config)
  if (!definitionResult.ok) throw new Error(`读取字典 ${payload.dict.strSn} 定义失败: ${definitionResult.error}`)
  const definition = definitionResult.data &&
    (definitionResult.data.dict || definitionResult.data.dictionary || definitionResult.data)
  if (!definition || !definition.id) throw new Error(`字典 ${payload.dict.strSn} 未返回完整定义`)
  return definition
}

function inspectDictionaryOrder(plan, payload, definition, identity) {
  const expectedRule = String(payload.dict.orderRule).toLowerCase()
  const actualRule = String(definition.orderRule || '').toLowerCase()
  if (definition.orderField !== payload.dict.orderField || actualRule !== expectedRule) {
    addIssue(plan, 'order-drift', identity,
      `线上排序 ${definition.orderField || '-'} ${actualRule || '-'} 与本地 ${payload.dict.orderField} ${expectedRule} 不一致`)
  }
}

function inspectExpectedDetail(plan, context, rawItem) {
  const { payload, onlineDict, indexes, localKeys, identity } = context
  const normalized = normalizeDetailItem(rawItem, payload.dict.strSn)
  if (!normalized.ok) throw new Error(`${payload.dict.strSn}: ${normalized.error}`)
  const expected = normalized.item
  localKeys.add(expected.strKey)
  const existing = indexes.byKey.get(expected.strKey)
  if (existing) {
    const fields = detailDifference(expected, existing)
    if (fields.length === 0) plan.summary.skippedDetails += 1
    else addIssue(plan, 'detail-conflict', { ...identity, value: expected.strKey },
      `线上明细与本地不一致，字段: ${fields.join(', ')}`)
    return
  }
  const sameLabel = indexes.byValue.get(expected.strValue)
  if (sameLabel) {
    addIssue(plan, 'detail-label-conflict', { ...identity, value: expected.strKey },
      `线上 label“${expected.strValue}”已对应 value=${sameLabel.strKey}`)
    return
  }
  addAction(plan, 'add-detail', { ...identity, dictId: onlineDict.id, detail: expected })
}

function inspectOnlineDetails(plan, payload, onlineDict, onlineDetails, identity) {
  const indexes = {
    byKey: new Map(onlineDetails.map((item) => [String(item.strKey), item])),
    byValue: new Map(onlineDetails.map((item) => [String(item.strValue), item])),
  }
  const localKeys = new Set()
  const context = { payload, onlineDict, indexes, localKeys, identity }
  for (const item of payload.items) {
    inspectExpectedDetail(plan, context, item)
  }
  const extras = onlineDetails.filter((item) => !localKeys.has(String(item.strKey)))
  if (extras.length > 0) {
    plan.warnings.push({ type: 'online-extra-details', ...identity, values: extras.map((item) => String(item.strKey)).sort() })
  }
}

async function inspectExistingDictionary(plan, payload, onlineModule, onlineDict, config) {
  const identity = { moduleCode: payload.module.strSn, dictCode: payload.dict.strSn }
  if (!inspectDictionaryName(plan, payload, onlineDict, identity)) return
  const definition = await readDictionaryDefinition(payload, onlineDict, config)
  inspectDictionaryOrder(plan, payload, definition, identity)
  const detailsResult = await queryAllDictDetails(onlineDict.id, config)
  if (!detailsResult.ok) throw new Error(`读取字典 ${payload.dict.strSn} 明细失败: ${detailsResult.error}`)
  const onlineDetails = extractDetailRecords(detailsResult.data)
  inspectOnlineDetails(plan, payload, onlineDict, onlineDetails, identity)
  plan.remote.push({ ...identity, moduleId: onlineModule.id, dictId: onlineDict.id, definition, details: onlineDetails })
}

function inspectRemoteOwner(plan, remoteOwner, moduleCode, dictCode) {
  if (!remoteOwner) return true
  if (!hasEntityId(remoteOwner.dictionary)) return false
  if (identityKey(remoteOwner.moduleCode) !== identityKey(moduleCode)) {
    addIssue(plan, 'dictionary-owner-conflict', { moduleCode, dictCode },
      `线上字典已属于模块 ${remoteOwner.moduleCode}`)
    return false
  }
  if (String(remoteOwner.dictionary.strSn) !== String(dictCode)) {
    addIssue(plan, 'dictionary-code-case-conflict', { moduleCode, dictCode },
      `线上字典编码“${remoteOwner.dictionary.strSn}”与本地“${dictCode}”仅大小写不同`)
    return false
  }
  return true
}

function addMissingDictionaryActions(plan, payload, moduleId, createModule) {
  const moduleCode = payload.module.strSn
  const dictCode = payload.dict.strSn
  if (createModule) addAction(plan, 'create-module', { moduleCode, module: payload.module })
  addAction(plan, 'create-dictionary', { moduleCode, moduleId, dictCode, dict: payload.dict })
  for (const rawItem of payload.items) {
    const normalized = normalizeDetailItem(rawItem, dictCode)
    if (!normalized.ok) throw new Error(`${dictCode}: ${normalized.error}`)
    addAction(plan, 'add-detail', { moduleCode, dictCode, detail: normalized.item })
  }
}

async function inspectPayload(plan, payload, indexes, config) {
  const moduleCode = payload.module.strSn
  const dictCode = payload.dict.strSn
  const onlineModule = indexes.moduleByCode.get(identityKey(moduleCode))
  const remoteOwner = indexes.dictOwners.get(identityKey(dictCode))
  if (onlineModule && !hasEntityId(onlineModule)) return
  if (!inspectRemoteOwner(plan, remoteOwner, moduleCode, dictCode)) return
  if (!onlineModule) {
    addMissingDictionaryActions(plan, payload, undefined, true)
    return
  }
  compareModuleIdentity(plan, payload, onlineModule)
  const onlineDict = findDictInModule(onlineModule, payload.dict)
  if (!onlineDict) {
    addMissingDictionaryActions(plan, payload, onlineModule.id, false)
    return
  }
  await inspectExistingDictionary(plan, payload, onlineModule, onlineDict, config)
}

function emptyPlan(registry, config, args) {
  return {
    schemaVersion: 1,
    scope: args.scope === 'project' ? 'project' : 'module',
    policy: 'safe-additive',
    sysAppNo: config.sysAppNo,
    searchRoot: args.searchRoot || 'src/views',
    sourcePaths: registry.modules.map((module) => module.sourcePath),
    local: registry.modules.map((module) => ({ sourcePath: module.sourcePath, contract: module.contract })),
    remote: [],
    actions: [],
    issues: [],
    warnings: [],
    summary: { modules: registry.modules.length, dictionaries: 0, skippedDetails: 0 },
  }
}

async function buildReconcilePlan(args, config) {
  if (!config || !config.sysAppNo) throw new Error('env.local.json 必须填写 sysAppNo')
  let registry = buildLocalRegistry(localOptions(args))
  registry = filterRegistry(registry, args.dictCodes)
  if (registry.modules.length === 0) {
    return { state: 'bootstrap-required', registry, bootstrap: planBootstrap(localOptions(args)) }
  }
  const onlineModules = await queryOnlineModules(config)
  const indexes = buildRemoteIndexes(onlineModules)
  const plan = emptyPlan(registry, config, args)
  plan.issues.push(...indexes.issues.map((message) => ({ type: 'remote-duplicate', message })))
  for (const module of registry.modules) {
    plan.summary.dictionaries += module.payloads.length
    for (const payload of module.payloads) await inspectPayload(plan, payload, indexes, config)
  }
  plan.actions.sort((a, b) => `${a.moduleCode}:${a.dictCode || ''}:${a.type}:${a.detail && a.detail.strKey || ''}`
    .localeCompare(`${b.moduleCode}:${b.dictCode || ''}:${b.type}:${b.detail && b.detail.strKey || ''}`))
  plan.issues.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  plan.warnings.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return { state: 'ready', registry, plan: { ...plan, planHash: hashValue(plan) } }
}

async function queryTreeOrThrow(config) {
  return queryOnlineModules(config)
}

function moduleMatches(node, moduleBody) {
  return identityKey(node && node.strSn) === identityKey(moduleBody.strSn) ||
    String(getNodeName(node)) === String(moduleBody.strName)
}

function isAlreadyExistsError(message) {
  return /已存在|already\s+exists|duplicate/i.test(String(message || ''))
}

function moduleFailureDetails(payload, config, backendError) {
  return {
    moduleCode: payload.module.strSn,
    moduleName: payload.module.strName,
    gatewayPath: config.gatewayPath,
    sysAppNo: config.sysAppNo,
    backendError,
  }
}

function moduleFailure(code, message, details) {
  return { error: new DictSyncFailure(code, message, details) }
}

async function findBusinessModuleAfterConflict(payload, config) {
  try {
    const modules = await queryOnlineModules(config)
    return modules.find((item) => moduleMatches(item, payload.module))
  } catch {
    // 诊断是 best-effort，查询失败不能掩盖真正的写入失败。
    return undefined
  }
}

function isReusableBusinessModule(match, payload) {
  return Boolean(
    match &&
    hasEntityId(match) &&
    String(getNodeName(match)) === String(payload.module.strName),
  )
}

async function findSystemModuleConflict(payload, config) {
  try {
    const result = await queryAllSystemModules(globalDictionaryConfig(config), {
      strSn: payload.module.strSn,
    })
    if (!result.ok) return undefined
    return result.data.find((item) => moduleMatches(item, payload.module))
  } catch {
    // 同上：诊断查询失败时保留原始写入结果。
    return undefined
  }
}

function systemModuleConflict(systemMatch, details) {
  return moduleFailure(
    'DICT_MODULE_SYSTEM_CONFLICT',
    `模块编码或名称已被系统字典模块占用：${systemMatch.strSn || '-'} / ${getNodeName(systemMatch) || '-'}`,
    {
      ...details,
      conflict: {
        id: systemMatch.id,
        code: systemMatch.strSn,
        name: getNodeName(systemMatch),
      },
      suggestedActions: ['修改本地 module.code/name', '由管理员确认并处理系统字典模块冲突'],
    },
  )
}

function hiddenModuleConflict(payload, details) {
  return moduleFailure(
    'DICT_MODULE_HIDDEN_CONFLICT',
    `后端判定模块 ${payload.module.strSn} 已存在，但业务字典树、业务模块列表和系统模块列表均不可见；通常是软删除、跨租户或历史残留占用。禁止盲目重试或自动复用空 ID`,
    {
      ...details,
      suggestedActions: [
        '使用明确且唯一的新 module.code，并同步 dicts.ts 与 api.md',
        '或由管理员清理不可见的历史/软删除记录后重新预览',
      ],
    },
  )
}

async function diagnoseModuleCreateFailure(payload, config, backendError) {
  const details = moduleFailureDetails(payload, config, backendError)
  if (!isAlreadyExistsError(backendError)) {
    return moduleFailure(
      'DICT_MODULE_CREATE_FAILED',
      `创建模块 ${payload.module.strSn} 失败: ${backendError}`,
      details,
    )
  }

  const businessMatch = await findBusinessModuleAfterConflict(payload, config)
  if (isReusableBusinessModule(businessMatch, payload)) return { target: businessMatch }

  const systemMatch = await findSystemModuleConflict(payload, config)
  return systemMatch
    ? systemModuleConflict(systemMatch, details)
    : hiddenModuleConflict(payload, details)
}

async function ensureModuleSafe(payload, config) {
  let modules = await queryTreeOrThrow(config)
  let target = findModule(modules, payload.module)
  if (target) {
    if (getNodeName(target) !== payload.module.strName) throw new Error(`${payload.module.strSn}: 模块名称发生冲突`)
    return requireEntityId(target, `模块 ${payload.module.strSn}`)
  }
  const result = await saveDictModule(buildModuleBody(payload.module), config)
  if (!result.ok) {
    const diagnosis = await diagnoseModuleCreateFailure(payload, config, result.error)
    if (diagnosis.target) return requireEntityId(diagnosis.target, `模块 ${payload.module.strSn}`)
    throw diagnosis.error
  }
  modules = await queryTreeOrThrow(config)
  target = findModule(modules, payload.module)
  if (!target) throw new Error(`创建模块 ${payload.module.strSn} 后未能回查`)
  return requireEntityId(target, `创建后的模块 ${payload.module.strSn}`)
}

async function ensureDictionarySafe(moduleNode, payload, config) {
  requireEntityId(moduleNode, `模块 ${payload.module.strSn}`)
  let target = findDictInModule(moduleNode, payload.dict)
  if (target) {
    if (getNodeName(target) !== payload.dict.strName) throw new Error(`${payload.dict.strSn}: 字典名称发生冲突`)
    return requireEntityId(target, `字典 ${payload.dict.strSn}`)
  }
  const result = await saveDictItem(buildDictBody(payload.dict, moduleNode.id), config)
  if (!result.ok) throw new Error(`创建字典 ${payload.dict.strSn} 失败: ${result.error}`)
  const modules = await queryTreeOrThrow(config)
  const refreshedModule = findModule(modules, payload.module)
  requireEntityId(refreshedModule, `模块 ${payload.module.strSn}`)
  target = findDictInModule(refreshedModule, payload.dict)
  if (!target) throw new Error(`创建字典 ${payload.dict.strSn} 后未能回查`)
  return requireEntityId(target, `创建后的字典 ${payload.dict.strSn}`)
}

function planMissingDetails(payload, details) {
  const byKey = new Map(details.map((item) => [String(item.strKey), item]))
  const byValue = new Map(details.map((item) => [String(item.strValue), item]))
  const missing = []
  for (const rawItem of payload.items) {
    const expected = normalizeDetailItem(rawItem, payload.dict.strSn).item
    const existing = byKey.get(expected.strKey)
    if (existing) {
      if (detailDifference(expected, existing).length > 0) throw new Error(`${payload.dict.strSn}.${expected.strKey}: 明细发生冲突`)
      continue
    }
    if (byValue.has(expected.strValue)) throw new Error(`${payload.dict.strSn}.${expected.strKey}: label 已被其他 value 使用`)
    missing.push(expected)
  }
  return missing
}

async function addMissingDetailsSafe(targetDict, payload, config, completed) {
  requireEntityId(targetDict, `字典 ${payload.dict.strSn}`)
  const result = await queryAllDictDetails(targetDict.id, config)
  if (!result.ok) throw new Error(`查询字典 ${payload.dict.strSn} 明细失败: ${result.error}`)
  const missing = planMissingDetails(payload, extractDetailRecords(result.data))
  for (const expected of missing) {
    const saveResult = await saveDictDetail(buildDetailBody(expected, payload.dict, targetDict.id), config)
    if (!saveResult.ok) throw new Error(`创建 ${payload.dict.strSn}.${expected.strKey} 失败: ${saveResult.error}`)
    completed.push({ type: 'add-detail', dictCode: payload.dict.strSn, value: expected.strKey })
  }
}

async function verifyDictionaryDefinition(targetDict, payload, config) {
  const definitionResult = await getDictItem(targetDict.id, config)
  if (!definitionResult.ok) throw new Error(`回查 ${payload.dict.strSn} 定义失败: ${definitionResult.error}`)
  const definition = definitionResult.data &&
    (definitionResult.data.dict || definitionResult.data.dictionary || definitionResult.data)
  const actualRule = String(definition && definition.orderRule || '').toLowerCase()
  if (!definition || definition.orderField !== payload.dict.orderField || actualRule !== payload.dict.orderRule) {
    throw new Error(`${payload.dict.strSn}: 回查排序契约不一致`)
  }
}

function assertExpectedDetails(payload, records) {
  const byKey = new Map(records.map((item) => [String(item.strKey), item]))
  for (const rawItem of payload.items) {
    const expected = normalizeDetailItem(rawItem, payload.dict.strSn).item
    const actual = byKey.get(expected.strKey)
    if (!actual || detailDifference(expected, actual).length > 0) {
      throw new Error(`${payload.dict.strSn}.${expected.strKey}: 回查不一致`)
    }
  }
}

async function verifyDictionary(targetDict, payload, config) {
  await verifyDictionaryDefinition(targetDict, payload, config)
  const detailResult = await queryAllDictDetails(targetDict.id, config)
  if (!detailResult.ok) throw new Error(`回查 ${payload.dict.strSn} 明细失败: ${detailResult.error}`)
  assertExpectedDetails(payload, extractDetailRecords(detailResult.data))
}

async function executeRegistry(registry, config) {
  const completed = []
  for (const module of registry.modules) {
    for (const payload of module.payloads) {
      const moduleNode = await ensureModuleSafe(payload, config)
      const targetDict = await ensureDictionarySafe(moduleNode, payload, config)
      await verifyDictionaryDefinition(targetDict, payload, config)
      await addMissingDetailsSafe(targetDict, payload, config, completed)
      await verifyDictionary(targetDict, payload, config)
      completed.push({ type: 'verified', dictCode: payload.dict.strSn })
    }
  }
  return completed
}

function summaryCounts(plan) {
  const count = (type) => plan.actions.filter((action) => action.type === type).length
  return {
    ...plan.summary,
    createModules: count('create-module'),
    createDictionaries: count('create-dictionary'),
    addDetails: count('add-detail'),
    issues: plan.issues.length,
    warnings: plan.warnings.length,
  }
}

function formatPlan(plan, mode) {
  const counts = summaryCounts(plan)
  return [
    `字典项目协调：${mode === 'apply' ? '正式执行' : '只读预览'}`,
    `范围：${plan.scope}；策略：${plan.policy}；应用：${plan.sysAppNo}`,
    `模块 ${counts.modules}，字典 ${counts.dictionaries}，创建模块 ${counts.createModules}，创建字典 ${counts.createDictionaries}，补充明细 ${counts.addDetails}`,
    `冲突/漂移 ${counts.issues}，线上额外项 ${counts.warnings}`,
    `planHash: ${plan.planHash}`,
    ...(plan.issues.length > 0 ? ['', '阻断项：', ...plan.issues.map((issue) => `- ${issue.message}`)] : []),
    ...(mode === 'preview' && plan.issues.length === 0 ? ['', '确认后携带相同 planHash 并传 confirmApply: true。'] : []),
  ].join('\n')
}

function errorResult(message, details = {}) {
  return {
    text: `❌ ${message}`,
    structuredContent: { ok: false, state: 'blocked', ...details },
    isError: true,
  }
}

function bootstrapRequiredResult(bootstrap) {
  return errorResult('未发现标准 dicts.ts；请先预览并生成本地字典契约', {
    state: 'bootstrap-required',
    bootstrapCandidates: bootstrap.entries.map((entry) => entry.targetPath),
    unresolvedReferences: bootstrap.references,
    issues: bootstrap.issues,
  })
}

async function withProjectLock(key, action) {
  const previous = projectLocks.get(key) || Promise.resolve()
  const current = previous.catch(() => {}).then(() => withFileLock(key, action))
  projectLocks.set(key, current)
  try {
    return await current
  } finally {
    if (projectLocks.get(key) === current) projectLocks.delete(key)
  }
}

function validateUpsertRequest(args, scope) {
  if (!args.sourcePath && !args.scope && (args.module || args.dict || args.items)) {
    return '禁止 module/dict/items 旁路；请提供 sourcePath 或 scope=project'
  }
  if (!['module', 'project'].includes(scope)) return 'scope 必须是 module/project'
  if (scope === 'module' && !args.sourcePath) return 'module 范围必须提供 sourcePath'
  return ''
}

function previewResult(plan) {
  const blocked = plan.issues.length > 0
  return {
    text: formatPlan(plan, 'preview'),
    structuredContent: {
      ok: !blocked,
      state: blocked ? 'blocked' : 'ready',
      mode: 'preview',
      planHash: plan.planHash,
      summary: summaryCounts(plan),
      actions: plan.actions,
      issues: plan.issues,
      warnings: plan.warnings,
    },
    ...(blocked ? { isError: true } : {}),
  }
}

async function previewReconcile(args, config) {
  try {
    const current = await buildReconcilePlan(args, config)
    return current.state === 'bootstrap-required'
      ? bootstrapRequiredResult(current.bootstrap)
      : previewResult(current.plan)
  } catch (error) {
    return errorResult(`字典协调预检失败：${error.message}`, { state: 'blocked', mode: 'preview' })
  }
}

function validateConfirmedPlan(args, plan) {
  if (!args.planHash || args.planHash !== plan.planHash) {
    return errorResult('planHash 缺失或已失效，本次零写入；请重新预览', {
      state: 'stale-plan', mode: 'apply', currentPlanHash: plan.planHash,
    })
  }
  return plan.issues.length > 0
    ? errorResult('存在冲突或漂移，本次零写入', { state: 'blocked', mode: 'apply', issues: plan.issues })
    : null
}

async function verifyProjectAfterApply(args, config) {
  const verification = await buildReconcilePlan(args, config)
  if (verification.state !== 'ready' || verification.plan.issues.length > 0 || verification.plan.actions.length > 0) {
    throw new Error('执行后项目级回查仍存在待处理动作或冲突')
  }
  return verification.plan
}

function failurePayload(error) {
  return {
    code: error && error.code ? error.code : 'DICT_SYNC_FAILED',
    message: error && error.message ? error.message : String(error),
    details: error && error.details ? error.details : {},
  }
}

async function executeConfirmedPlan(current, args, config) {
  const { plan, registry } = current
  const invalid = validateConfirmedPlan(args, plan)
  if (invalid) return invalid
  const completed = []
  try {
    completed.push(...await executeRegistry(registry, config))
    const verifiedPlan = await verifyProjectAfterApply(args, config)
    return {
      text: `${formatPlan(plan, 'apply')}\n\n✅ 项目级回查通过；新增已完成，已有数据未覆盖、未删除。`,
      structuredContent: {
        ok: true,
        state: 'verified',
        mode: 'apply',
        planHash: plan.planHash,
        summary: summaryCounts(plan),
        completed,
        warnings: verifiedPlan.warnings,
      },
    }
  } catch (error) {
    return errorResult(`执行中止：${error.message}；已完成项可安全重跑，不执行回滚删除`, {
      state: 'partial',
      mode: 'apply',
      planHash: plan.planHash,
      completed,
      failure: failurePayload(error),
    })
  }
}

async function applyReconcile(args, config) {
  let current
  try {
    current = await buildReconcilePlan(args, config)
  } catch (error) {
    return errorResult(`字典协调预检失败：${error.message}`, { state: 'blocked', mode: 'apply' })
  }
  if (current.state === 'bootstrap-required') return bootstrapRequiredResult(current.bootstrap)
  return executeConfirmedPlan(current, args, config)
}

async function handleDictUpsert(args = {}, config) {
  const scope = args.scope || (args.sourcePath ? 'module' : 'project')
  const validationError = validateUpsertRequest(args, scope)
  if (validationError) return errorResult(validationError)
  const normalizedArgs = { ...args, scope }
  if (args.confirmApply !== true) return previewReconcile(normalizedArgs, config)
  const blocked = writeBlockReason(config)
  if (blocked) return errorResult(blocked, { state: 'blocked', mode: 'apply' })
  const projectRoot = path.resolve(process.env.WL_PROJECT_ROOT || process.cwd())
  const lockKey = `${config && config.sysAppNo || '-'}:${projectRoot}`
  return withProjectLock(lockKey, () => applyReconcile(normalizedArgs, config))
}

function filterModulesByCode(modules, moduleCode) {
  if (!moduleCode) return modules
  return modules.filter((item) => identityKey(item.strSn) === identityKey(moduleCode))
}

function queryTarget(config) {
  return {
    gatewayPath: config.gatewayPath,
    sysAppNo: config.sysAppNo,
  }
}

function successfulDictQuery(businessModules, systemModules, config, text) {
  return {
    text,
    structuredContent: {
      ok: true,
      state: 'success',
      count: businessModules.length,
      items: businessModules,
      systemModules,
      target: queryTarget(config),
    },
  }
}

async function querySystemModulesForView(config, moduleCode) {
  const result = await queryAllSystemModules(
    globalDictionaryConfig(config),
    { strSn: moduleCode || undefined },
  )
  if (!result.ok) throw new Error(result.error)
  return filterModulesByCode(extractBusinessModules(result.data), moduleCode)
}

async function handleDictQuery(args = {}, config) {
  if (!config || !config.sysAppNo) {
    return errorResult('env.local.json 必须填写 sysAppNo', { state: 'blocked', mode: 'query' })
  }
  let modules
  try {
    modules = await queryOnlineModules(config)
  } catch (error) {
    return errorResult(`查询字典失败: ${error.message}`, { state: 'blocked', mode: 'query' })
  }
  const moduleCode = args.moduleCode ? String(args.moduleCode) : ''
  const businessModules = filterModulesByCode(modules, moduleCode)
  if (args.includeSystemModules === true) {
    try {
      const systemModules = await querySystemModulesForView(config, moduleCode)
      const data = { businessModules, systemModules }
      return successfulDictQuery(
        businessModules,
        systemModules,
        config,
        `字典模块查询成功\n\n${JSON.stringify(data, null, 2)}`,
      )
    } catch (error) {
      return errorResult(`查询系统字典模块失败: ${error.message}`, { state: 'blocked', mode: 'query' })
    }
  }
  const text = businessModules.length === 0
    ? '✅ 字典查询成功，目标范围暂无业务字典模块'
    : `✅ 字典查询成功，共 ${businessModules.length} 个业务模块\n\n${JSON.stringify(businessModules, null, 2)}`
  return successfulDictQuery(businessModules, [], config, text)
}

function formatBootstrap(plan, mode) {
  return [
    `本地字典契约引导：${mode === 'apply' ? '已创建' : '只读预览'}`,
    `可确定性生成 ${plan.entries.length} 个 dicts.ts；问题 ${plan.issues.length}；代码引用 ${plan.references.length}`,
    `planHash: ${plan.planHash}`,
    ...plan.entries.map((entry) => `- ${entry.targetPath}（${entry.contract.dictionaries.length} 个字典）`),
    ...(plan.issues.length > 0 ? ['问题：', ...plan.issues.map((issue) => `- ${issue.moduleRoot}: ${issue.message}`)] : []),
    ...(plan.entries.length === 0 && plan.references.length > 0
      ? ['未找到可聚合的 api.md dict-contract；请先根据需求补齐契约，以下代码引用仅用于盘点，不会猜值上传。']
      : []),
  ].join('\n')
}

function handleDictBootstrap(args = {}) {
  try {
    const options = {
      projectRoot: process.env.WL_PROJECT_ROOT || process.cwd(),
      searchRoot: args.searchRoot,
    }
    const plan = planBootstrap(options)
    if (args.confirmWrite !== true) {
      return {
        text: formatBootstrap(plan, 'preview'),
        structuredContent: {
          ok: plan.issues.length === 0 && plan.entries.length > 0,
          state: plan.entries.length > 0 ? 'ready' : 'needs-contracts',
          mode: 'preview',
          planHash: plan.planHash,
          targets: plan.entries.map((entry) => entry.targetPath),
          issues: plan.issues,
          references: plan.references,
        },
        ...(plan.issues.length === 0 && plan.entries.length > 0 ? {} : { isError: true }),
      }
    }
    const created = applyBootstrap(plan, args.planHash)
    return {
      text: `${formatBootstrap(plan, 'apply')}\n\n✅ 仅创建本地标准契约，尚未调用线上写接口。`,
      structuredContent: { ok: true, state: 'created', mode: 'apply', planHash: plan.planHash, created },
    }
  } catch (error) {
    return errorResult(`本地字典契约引导失败：${error.message}`, { state: 'blocked' })
  }
}

module.exports = {
  handleDictBootstrap,
  handleDictQuery,
  handleDictUpsert,
  _internal: {
    buildReconcilePlan,
    detailDifference,
    extractDetailRecords,
    extractBusinessModules,
    extractModules,
    findDictInModule,
    findModule,
    normalizeDetailItem,
    queryAllDictDetails,
    toSafeCodeSuffix,
  },
}

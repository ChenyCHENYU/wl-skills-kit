'use strict'

const {
  queryDictModules,
  saveDictModule,
  saveDictItem,
  queryDictDetails,
  saveDictDetail,
} = require('../api/dictApi')

function getNodeName(node) {
  return (node && (node.strName || node.name)) || ''
}

/**
 * 从字典树查询响应中提取业务模块列表
 * 响应结构: { dictionary: { children: DictModuleNode[] } }
 *
 * @param {any} data - queryDictModules 返回的 result.data
 * @returns {object[]}
 */
function extractModules(data) {
  if (!data) return []
  if (data.dictionary && Array.isArray(data.dictionary.children)) {
    return data.dictionary.children
  }
  if (Array.isArray(data)) return data
  return []
}

function extractDetailRecords(data) {
  if (!data) return []
  if (data.page && Array.isArray(data.page.records)) return data.page.records
  if (Array.isArray(data.records)) return data.records
  if (Array.isArray(data)) return data
  return []
}

function findModule(modules, moduleBody) {
  if (!moduleBody) return null
  if (moduleBody.id) {
    return modules.find((m) => String(m.id) === String(moduleBody.id)) || null
  }
  if (moduleBody.strSn) {
    return modules.find((m) => String(m.strSn) === String(moduleBody.strSn)) || null
  }
  const moduleName = moduleBody.strName || moduleBody.name
  if (moduleName) {
    return modules.find((m) => String(getNodeName(m)) === String(moduleName)) || null
  }
  return null
}

function findDictInModule(moduleNode, dictBody) {
  if (!moduleNode || !dictBody) return null
  const children = Array.isArray(moduleNode.children) ? moduleNode.children : []
  if (dictBody.id) {
    return children.find((d) => String(d.id) === String(dictBody.id)) || null
  }
  if (dictBody.strSn) {
    return children.find((d) => String(d.strSn) === String(dictBody.strSn)) || null
  }
  return null
}

function toSafeCodeSuffix(...values) {
  for (const value of values) {
    if (value == null) continue
    const cleaned = String(value)
      .trim()
      .replace(/[\u4e00-\u9fa5]/g, '')
      .replace(/[^A-Za-z0-9_.-]+/g, '_')
      .replace(/^_+|_+$/g, '')

    if (cleaned) return cleaned.toLowerCase()
  }

  const raw = values.find((value) => value != null && String(value).trim())
  if (!raw) return 'item'
  return `u${Buffer.from(String(raw)).toString('hex').slice(0, 24)}`
}

function normalizeDetailItem(item) {
  const hasRawFields = Object.prototype.hasOwnProperty.call(item, 'strKey') ||
    Object.prototype.hasOwnProperty.call(item, 'strValue')
  const strKey = hasRawFields ? item.strKey : item.value
  const strValue = hasRawFields ? item.strValue : item.label

  if (strKey == null || String(strKey) === '') {
    return { ok: false, error: '明细项缺少 value 或 strKey' }
  }
  if (strValue == null || String(strValue) === '') {
    return { ok: false, error: '明细项缺少 label 或 strValue' }
  }

  const normalized = {
    strKey: String(strKey),
    strValue: String(strValue),
  }

  for (const field of ['strValue2', 'strValue3', 'strValue4']) {
    if (item[field] != null) normalized[field] = String(item[field])
  }

  if (item.strValueCode) {
    normalized.strValueCode = item.strValueCode
  } else {
    normalized.strValueCode = `sysDict.dtl.strValue.${toSafeCodeSuffix(normalized.strValue, normalized.strKey)}`
  }

  return { ok: true, item: normalized }
}

function buildDictBody(dictBody, moduleId) {
  return {
    moduleId,
    strSn: dictBody.strSn,
    strName: dictBody.strName || dictBody.name,
    strLevel: 2,
    dtlValueRequired: dictBody.dtlValueRequired || false,
    dtlValue2Required: dictBody.dtlValue2Required || false,
    dtlValue3Required: dictBody.dtlValue3Required || false,
    dtlValue4Required: dictBody.dtlValue4Required || false,
  }
}

function buildDetailBody(detail, dictBody, dictId) {
  const body = {
    dictId,
    strSn: dictBody.strSn,
    strKey: detail.strKey,
    strValue: detail.strValue,
    strValueCode: detail.strValueCode,
  }

  for (const field of ['strValue2', 'strValue3', 'strValue4']) {
    if (detail[field] != null) body[field] = detail[field]
  }

  return body
}

async function queryModulesOrError(config) {
  const result = await queryDictModules(config)
  if (!result.ok) {
    return { ok: false, error: `查询字典失败: ${result.error}` }
  }
  return { ok: true, modules: extractModules(result.data) }
}

/**
 * wls_dict_query 工具处理器
 * 查询当前应用的所有业务字典模块及字典树。
 *
 * @param {object} config
 * @returns {Promise<string>}
 */
async function handleDictQuery(config) {
  if (!config || !config.sysAppNo) {
    return '❌ 配置错误：env.local.json 必须填写 sysAppNo，字典接口依赖 sysAppNo 请求头定位当前应用'
  }

  const result = await queryDictModules(config)

  if (!result.ok) {
    return `❌ 查询字典失败: ${result.error} (code: ${result.code})`
  }

  const modules = extractModules(result.data)

  if (modules.length === 0) {
    return '✅ 字典查询成功，当前应用暂无字典数据'
  }

  return `✅ 字典查询成功，当前应用共 ${modules.length} 个业务模块\n\n${JSON.stringify(modules, null, 2)}`
}

/**
 * wls_dict_upsert 工具处理器
 * 新增或补齐三层业务字典：业务模块 -> 字典 -> 字典明细。
 *
 * @param {{ module: object, dict: object, items?: object[] }} args
 * @param {object} config
 * @returns {Promise<string>}
 */
async function handleDictUpsert(args, config) {
  const { module: moduleBody, dict: dictBody, items = [] } = args || {}

  if (!config || !config.sysAppNo) {
    return '❌ 配置错误：env.local.json 必须填写 sysAppNo，字典接口依赖 sysAppNo 请求头定位当前应用'
  }
  if (!moduleBody || (!moduleBody.id && !moduleBody.strSn && !moduleBody.strName && !moduleBody.name)) {
    return '❌ 参数错误：module 必须包含 id、strSn 或 strName/name，用于定位业务字典模块'
  }
  if (!dictBody || !dictBody.strSn) {
    return '❌ 参数错误：dict.strSn 必填（字典编码，如 mdmModelType）'
  }
  if (!dictBody.strName && !dictBody.name) {
    return '❌ 参数错误：dict.strName 必填（字典名称，如 模型类型）'
  }
  if (!Array.isArray(items)) {
    return '❌ 参数错误：items 必须是数组'
  }

  const queryResult = await queryModulesOrError(config)
  if (!queryResult.ok) return `❌ ${queryResult.error}`

  let modules = queryResult.modules
  let targetModule = findModule(modules, moduleBody)
  let moduleAction = '⏭ 已存在'

  if (!targetModule) {
    if (moduleBody.id) {
      return `❌ 未找到业务字典模块 id="${moduleBody.id}"，为避免污染不会自动创建新模块`
    }
    if (!moduleBody.strSn || !(moduleBody.strName || moduleBody.name)) {
      return '❌ 未找到业务字典模块；若需要自动创建模块，请同时提供 module.strSn 和 module.strName'
    }

    const saveBody = {
      strSn: moduleBody.strSn,
      strName: moduleBody.strName || moduleBody.name,
      sortPriority: moduleBody.sortPriority != null ? String(moduleBody.sortPriority) : '1',
      strLevel: 2,
    }

    const createResult = await saveDictModule(saveBody, config)
    if (!createResult.ok) {
      return `❌ 创建业务字典模块失败: ${createResult.error}`
    }

    const reQueryResult = await queryModulesOrError(config)
    if (!reQueryResult.ok) return `❌ ${reQueryResult.error}`

    modules = reQueryResult.modules
    targetModule = findModule(modules, moduleBody)

    if (!targetModule) {
      return `❌ 业务字典模块创建后未能找到（strSn="${moduleBody.strSn}"），请在后台确认`
    }
    moduleAction = '✅ 已创建'
  }

  const moduleId = targetModule.id
  let targetDict = findDictInModule(targetModule, dictBody)
  let dictAction = '⏭ 已存在'

  if (targetDict) {
    const existingName = getNodeName(targetDict)
    const expectedName = dictBody.strName || dictBody.name
    if (existingName && expectedName && String(existingName) !== String(expectedName)) {
      return [
        `❌ 字典编码冲突：${dictBody.strSn}`,
        `- 线上名称：${existingName}`,
        `- 待写入名称：${expectedName}`,
        '为避免污染，已停止写入；请确认是否复用该字典编码。',
      ].join('\n')
    }
  } else {
    const createDictResult = await saveDictItem(buildDictBody(dictBody, moduleId), config)
    if (!createDictResult.ok) {
      return `❌ 创建字典失败: ${createDictResult.error}`
    }

    const reQueryResult = await queryModulesOrError(config)
    if (!reQueryResult.ok) return `❌ ${reQueryResult.error}`

    modules = reQueryResult.modules
    targetModule = findModule(modules, { id: moduleId }) || findModule(modules, moduleBody)
    targetDict = findDictInModule(targetModule, dictBody)

    if (!targetDict) {
      return `❌ 字典创建后未能找到（strSn="${dictBody.strSn}"），请在后台确认`
    }
    dictAction = '✅ 已创建'
  }

  const dictId = targetDict.id
  const detailQuery = await queryDictDetails(dictId, config)
  if (!detailQuery.ok) {
    return `❌ 查询字典明细失败: ${detailQuery.error}`
  }

  const existingDetails = extractDetailRecords(detailQuery.data)
  const existingByKey = new Map(existingDetails.map((d) => [String(d.strKey), d]))
  const existingByValue = new Map(existingDetails.map((d) => [String(d.strValue), d]))
  const detailResults = []

  for (const rawItem of items) {
    const normalized = normalizeDetailItem(rawItem)
    if (!normalized.ok) {
      detailResults.push({
        strKey: rawItem && (rawItem.strKey || rawItem.value || ''),
        strValue: rawItem && (rawItem.strValue || rawItem.label || ''),
        status: `❌ ${normalized.error}`,
      })
      continue
    }

    const detail = normalized.item
    const existingKey = existingByKey.get(detail.strKey)
    if (existingKey) {
      if (String(existingKey.strValue) === detail.strValue) {
        detailResults.push({ ...detail, status: '⏭ 已存在（跳过）' })
      } else {
        detailResults.push({
          ...detail,
          status: `⚠️ 冲突：strKey 已存在但 strValue 为 "${existingKey.strValue}"`,
        })
      }
      continue
    }

    const existingValue = existingByValue.get(detail.strValue)
    if (existingValue) {
      detailResults.push({
        ...detail,
        status: `⚠️ 冲突：strValue 已存在但 strKey 为 "${existingValue.strKey}"`,
      })
      continue
    }

    const createResult = await saveDictDetail(buildDetailBody(detail, dictBody, dictId), config)
    if (createResult.ok) {
      existingByKey.set(detail.strKey, detail)
      existingByValue.set(detail.strValue, detail)
      detailResults.push({ ...detail, status: '✅ 已创建' })
    } else {
      detailResults.push({ ...detail, status: `❌ 失败: ${createResult.error}` })
    }
  }

  const createdCount = detailResults.filter((r) => r.status.startsWith('✅')).length
  const skippedCount = detailResults.filter((r) => r.status.startsWith('⏭')).length
  const conflictCount = detailResults.filter((r) => r.status.startsWith('⚠️')).length
  const failedCount = detailResults.filter((r) => r.status.startsWith('❌')).length

  const output = [
    `业务模块 "${targetModule.strSn || moduleBody.strSn}" (${getNodeName(targetModule)})：${moduleAction}`,
    `模块 ID：${moduleId}`,
    `字典 "${dictBody.strSn}" (${dictBody.strName || dictBody.name})：${dictAction}`,
    `字典 ID：${dictId}`,
  ]

  if (items.length > 0) {
    output.push(
      `字典明细：创建 ${createdCount}，跳过 ${skippedCount}，冲突 ${conflictCount}，失败 ${failedCount}`,
      '',
      '| strKey | strValue | 状态 |',
      '|---|---|---|',
    )
    for (const r of detailResults) {
      output.push(`| ${r.strKey} | ${r.strValue} | ${r.status} |`)
    }
  }

  return output.join('\n')
}

module.exports = {
  handleDictQuery,
  handleDictUpsert,
  _internal: {
    extractModules,
    extractDetailRecords,
    findModule,
    findDictInModule,
    toSafeCodeSuffix,
    normalizeDetailItem,
  },
}

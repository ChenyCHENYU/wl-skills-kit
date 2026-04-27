'use strict'

const { queryDictModules, saveDictModule, saveDictItem } = require('../api/dictApi')

/**
 * 从字典树查询响应中提取模块列表
 * 响应结构: { dictionary: { children: DictModule[] } }
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

/**
 * wls_dict_query 工具处理器
 * 查询当前应用的所有字典模块及字典项
 *
 * @param {object} config
 * @returns {Promise<string>}
 */
async function handleDictQuery(config) {
  const result = await queryDictModules(config)

  if (!result.ok) {
    return `❌ 查询字典失败: ${result.error} (code: ${result.code})`
  }

  const modules = extractModules(result.data)

  if (modules.length === 0) {
    return '✅ 字典查询成功，当前应用暂无字典数据'
  }

  return `✅ 字典查询成功，共 ${modules.length} 个模块\n\n${JSON.stringify(modules, null, 2)}`
}

/**
 * wls_dict_upsert 工具处理器
 * 新增或更新字典模块及字典项（完整幂等流程）
 *
 * 流程：
 * ① 查询现有模块，检查 strSn 是否已存在
 * ② 若不存在：创建模块（data=null）→ 重新查询 → 用 strSn 定位拿 id
 * ③ 若已存在：跳过模块创建，直接取已有 id
 * ④ 遍历 items，跳过 strSn 已存在的，其余逐条创建
 *
 * @param {{ module: object, items?: object[] }} args
 * @param {object} config
 * @returns {Promise<string>}
 */
async function handleDictUpsert(args, config) {
  const { module: moduleBody, items = [] } = args

  if (!moduleBody || !moduleBody.strSn) {
    return '❌ 参数错误：module.strSn 必填'
  }
  if (!moduleBody.strName) {
    return '❌ 参数错误：module.strName 必填'
  }

  // ① 查询现有模块
  const queryResult = await queryDictModules(config)
  if (!queryResult.ok) {
    return `❌ 查询字典失败: ${queryResult.error}`
  }

  const existingModules = extractModules(queryResult.data)
  let targetModule = existingModules.find((m) => m.strSn === moduleBody.strSn)
  let moduleAction

  // ② 模块不存在时创建
  if (!targetModule) {
    const saveBody = {
      strSn: moduleBody.strSn,
      strName: moduleBody.strName,
      sortPriority: moduleBody.sortPriority != null ? String(moduleBody.sortPriority) : '1',
      strLevel: 2,
    }

    const createResult = await saveDictModule(saveBody, config)
    if (!createResult.ok) {
      return `❌ 创建字典模块失败: ${createResult.error}`
    }

    // ③ 重新查询（data=null，只能靠 re-query 拿 id）
    const reQueryResult = await queryDictModules(config)
    if (!reQueryResult.ok) {
      return `❌ 重新查询字典失败: ${reQueryResult.error}`
    }

    const freshModules = extractModules(reQueryResult.data)
    targetModule = freshModules.find((m) => m.strSn === moduleBody.strSn)

    if (!targetModule) {
      return `❌ 字典模块创建后未能找到（strSn="${moduleBody.strSn}"），请在字典管理后台确认`
    }

    moduleAction = '✅ 已创建'
  } else {
    moduleAction = '⏭ 已存在（跳过创建）'
  }

  const moduleId = targetModule.id

  // ④ 处理字典项
  const existingItems = Array.isArray(targetModule.dictionaries)
    ? targetModule.dictionaries
    : []
  const existingSns = new Set(existingItems.map((i) => i.strSn))

  const itemResults = []

  for (const item of items) {
    if (existingSns.has(item.strSn)) {
      itemResults.push({
        strSn: item.strSn,
        strName: item.strName || '',
        status: '⏭ 已存在（跳过）',
      })
      continue
    }

    const itemBody = {
      moduleId,
      strSn: item.strSn,
      strName: item.strName,
      strLevel: 2,
      dtlValue: item.dtlValue != null ? item.dtlValue : '',
      dtlValueRequired: item.dtlValueRequired || false,
      dtlValue2Required: item.dtlValue2Required || false,
      dtlValue3Required: item.dtlValue3Required || false,
      dtlValue4Required: item.dtlValue4Required || false,
    }

    const createResult = await saveDictItem(itemBody, config)
    if (createResult.ok) {
      itemResults.push({ strSn: item.strSn, strName: item.strName || '', status: '✅ 已创建' })
    } else {
      itemResults.push({
        strSn: item.strSn,
        strName: item.strName || '',
        status: `❌ 失败: ${createResult.error}`,
      })
    }
  }

  const createdCount = itemResults.filter((r) => r.status.startsWith('✅')).length
  const skippedCount = itemResults.filter((r) => r.status.startsWith('⏭')).length
  const failedCount = itemResults.filter((r) => r.status.startsWith('❌')).length

  let output = `字典模块 "${moduleBody.strSn}" (${moduleBody.strName})：${moduleAction}\n`
  output += `模块 ID：${moduleId}\n`

  if (items.length > 0) {
    output += `字典项：创建 ${createdCount}，跳过 ${skippedCount}，失败 ${failedCount}\n\n`
    output += '| strSn | strName | 状态 |\n'
    output += '|---|---|---|\n'
    for (const r of itemResults) {
      output += `| ${r.strSn} | ${r.strName} | ${r.status} |\n`
    }
  }

  return output
}

module.exports = { handleDictQuery, handleDictUpsert }

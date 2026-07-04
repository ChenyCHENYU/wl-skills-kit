'use strict'

const { wlsFetch } = require('./client')

/**
 * 查询当前应用业务字典模块列表
 * GET /system/dictModule/business/list?size=20&moduleId=-1
 *
 * @param {{ size?: number, moduleId?: string | number }} query
 * @param {{ gatewayPath: string, token: string, sysAppNo?: string }} config
 */
function queryBusinessDictModules(query, config) {
  const size = query && query.size ? query.size : 200
  const moduleId = query && query.moduleId != null ? query.moduleId : -1
  return wlsFetch(`/system/dictModule/business/list?size=${encodeURIComponent(size)}&moduleId=${encodeURIComponent(moduleId)}`, {}, config)
}

/**
 * 查询字典树（全量，含所有模块和字典项）
 * GET /system/business/dict/getDictionaryTreeData
 * 响应结构: { data: { dictionary: { children: DictModule[] } } }
 *
 * @param {{ gatewayPath: string, token: string }} config
 */
function queryDictModules(config) {
  return wlsFetch('/system/business/dict/getDictionaryTreeData', {}, config)
}

/**
 * 新增或更新字典模块
 * POST /system/dictModule/save
 * ⚠️ 响应 data 为 null，创建后必须通过 queryDictModules + strSn 匹配才能拿到 id
 *
 * @param {object} body - DictModuleSaveBody
 * @param {{ gatewayPath: string, token: string }} config
 */
function saveDictModule(body, config) {
  return wlsFetch('/system/dictModule/save', { method: 'POST', body }, config)
}

/**
 * 新增字典值（词典项）
 * POST /system/business/dict/save
 * 响应 data 为 null（只需确认 code=2000 成功即可）
 *
 * @param {object} body - DictItemSaveBody
 * @param {{ gatewayPath: string, token: string }} config
 */
function saveDictItem(body, config) {
  return wlsFetch('/system/business/dict/save', { method: 'POST', body }, config)
}

/**
 * 查询字典明细
 * GET /system/dictDtl/list?size=20&dictId=xxx
 *
 * @param {string} dictId
 * @param {{ gatewayPath: string, token: string, sysAppNo?: string }} config
 * @param {number} [size]
 */
function queryDictDetails(dictId, config, size = 500) {
  return wlsFetch(`/system/dictDtl/list?size=${encodeURIComponent(size)}&dictId=${encodeURIComponent(dictId)}`, {}, config)
}

/**
 * 新增字典明细
 * POST /system/dictDtl/save
 *
 * @param {object} body - DictDtlSaveBody
 * @param {{ gatewayPath: string, token: string, sysAppNo?: string }} config
 */
function saveDictDetail(body, config) {
  return wlsFetch('/system/dictDtl/save', { method: 'POST', body }, config)
}

module.exports = {
  queryBusinessDictModules,
  queryDictModules,
  saveDictModule,
  saveDictItem,
  queryDictDetails,
  saveDictDetail,
}

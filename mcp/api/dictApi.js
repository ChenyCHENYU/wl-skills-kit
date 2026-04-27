'use strict'

const { wlsFetch } = require('./client')

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

module.exports = { queryDictModules, saveDictModule, saveDictItem }

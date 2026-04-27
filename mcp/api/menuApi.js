'use strict'

const { wlsFetch } = require('./client')

/**
 * 查询指定应用域的菜单树
 * GET /system/menu/getMenuTreeByDomainId?domainId={domainId}
 *
 * @param {string} domainId
 * @param {{ gatewayPath: string, token: string }} config
 */
function queryMenuTree(domainId, config) {
  return wlsFetch(
    `/system/menu/getMenuTreeByDomainId?domainId=${encodeURIComponent(domainId)}`,
    {},
    config
  )
}

/**
 * 新增或更新菜单
 * POST /system/menu/save
 * 有 id → 更新；无 id → 新增（响应 data 含服务端生成的完整对象包括 id）
 *
 * @param {object} body - MenuSaveBody
 * @param {{ gatewayPath: string, token: string }} config
 */
function saveMenu(body, config) {
  return wlsFetch('/system/menu/save', { method: 'POST', body }, config)
}

module.exports = { queryMenuTree, saveMenu }

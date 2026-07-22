'use strict'

const { wlsFetch } = require('./client')

/**
 * 查询当前用户可见的全部权限菜单树（不依赖 domainId）。
 * GET /system/menu/getPermissionMenuTree
 *
 * 返回的顶层节点是各"应用域"，其结构：
 *   { id, menuName, parentId, sysAppNo, type, children, ... }
 * 其中：
 *   - id        = 该应用域的菜单根 ID（即 parentMenuId）
 *   - parentId  = domainId（应用域归属 ID，用于 getMenuTreeByDomainId）
 *   - sysAppNo  = 应用编码
 *   - menuName  = 应用域名称（如"主数据管理"）
 *
 * 这是倒推 domainId 的唯一可靠入口：
 *   ① 用 getPermissionMenuTree 拿到全部应用域
 *   ② 按 menuName/sysAppNo/path 定位目标应用域
 *   ③ 取该节点的 parentId 作为 domainId
 *
 * @param {{ gatewayPath: string, token: string }} config
 */
function queryPermissionMenuTree(config) {
  return wlsFetch('/system/menu/getPermissionMenuTree', {}, config)
}

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

/**
 * 查询全部应用域（不依赖菜单权限）。
 * GET /system/sysDomain/list?current=1&size=99
 *
 * 返回所有系统内置域（生产/质量/销售/...），含 id/code/name。
 * 用途：getPermissionMenuTree 只返回有菜单权限的域；
 *       当目标域存在但当前账号无权限时，改用此接口获取 domainId。
 *
 * @param {{ gatewayPath: string, token: string }} config
 */
function querySysDomainList(config) {
  return wlsFetch('/system/sysDomain/list?current=1&size=99', {}, config)
}

module.exports = { queryPermissionMenuTree, queryMenuTree, saveMenu, querySysDomainList }

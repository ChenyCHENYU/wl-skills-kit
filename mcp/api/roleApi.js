'use strict'

const { wlsFetch } = require('./client')

/**
 * 查询角色列表（分页）
 * GET /system/role/list?current=1&size=10
 */
function queryRoleList(params, config) {
  const current = (params && params.current) || 1
  const size = (params && params.size) || 100
  return wlsFetch(
    `/system/role/list?current=${current}&size=${size}`,
    {},
    config
  )
}

/**
 * 新增角色
 * POST /system/role/save
 * body: { roleName, code, configDesc }
 */
function saveRole(body, config) {
  return wlsFetch('/system/role/save', { method: 'POST', body }, config)
}

/**
 * 查询全量可授权菜单（用于角色分配菜单）
 * GET /system/menu/get/subMenu?size=999
 */
function queryAssignableMenus(config) {
  return wlsFetch('/system/menu/get/subMenu?size=999', {}, config)
}

/**
 * 给角色批量分配菜单权限
 * POST /system/role/saveRoleMenus
 * body: { roleId, menuIds: "id1,id2,id3" }  // 注意 menuIds 是逗号分隔字符串
 */
function saveRoleMenus(body, config) {
  return wlsFetch('/system/role/saveRoleMenus', { method: 'POST', body }, config)
}

/**
 * 查询父菜单下的子菜单/动作列表
 * GET /system/menu/children?current=1&size=10&menuId=xxx
 */
function queryMenuChildren(menuId, config) {
  const params = `current=1&size=999&menuId=${encodeURIComponent(menuId)}`
  return wlsFetch(`/system/menu/children?${params}`, {}, config)
}

module.exports = {
  queryRoleList,
  saveRole,
  queryAssignableMenus,
  saveRoleMenus,
  queryMenuChildren,
}

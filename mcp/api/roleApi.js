'use strict'

const { wlsFetch } = require('./client')
const { queryMenuTree } = require('./menuApi')

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
function menuNodes(tree) {
  if (Array.isArray(tree)) return tree
  const value = Object(tree)
  return value.records || value.list || value.children || []
}

function childMenus(node) {
  const value = Object(node)
  return value.children || value.childList || value.childrenList || []
}

function flattenMenuTree(tree, result = []) {
  const nodes = menuNodes(tree)
  for (const node of nodes) {
    const record = { ...node }
    delete record.children
    delete record.childList
    delete record.childrenList
    result.push(record)
    flattenMenuTree(childMenus(node), result)
  }
  return result
}

async function queryAssignableMenus(config, domainId) {
  const primary = await wlsFetch('/system/menu/get/subMenu?size=999', {}, config)
  if (primary.ok || !domainId) return { ...primary, source: 'assignable-menu-api', fallbackUsed: false }

  const fallback = await queryMenuTree(domainId, config)
  if (!fallback.ok) {
    return {
      ...fallback,
      error: `主接口失败: ${primary.error} (code: ${primary.code}); 域菜单树回退也失败: ${fallback.error} (code: ${fallback.code})`,
      source: 'domain-menu-tree',
      fallbackUsed: true,
      primaryFailure: { code: primary.code, error: primary.error },
    }
  }
  const records = flattenMenuTree(fallback.data)
  return {
    ...fallback,
    data: { page: { records, total: records.length, current: 1, pages: 1 } },
    source: 'domain-menu-tree',
    fallbackUsed: true,
    primaryFailure: { code: primary.code, error: primary.error },
  }
}

/**
 * 给角色批量分配菜单权限
 * POST /system/role/saveRoleMenus
 * body: { domainId, roleId, menuIds: "id1,id2,id3" }
 * 注意：menuIds 是逗号分隔字符串，domainId 为后端必填字段。
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

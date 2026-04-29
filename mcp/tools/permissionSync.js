'use strict'

const {
  queryRoleList,
  saveRole,
  queryAssignableMenus,
  saveRoleMenus,
  queryMenuChildren,
} = require('../api/roleApi')
const { saveMenu } = require('../api/menuApi')

/* ──────────────────────────────────────────────────────────────────────
 * 角色管理
 * ──────────────────────────────────────────────────────────────────── */

/**
 * wls_role_query 工具处理器
 * 查询角色列表（仅返回字段精简后的角色摘要）
 */
async function handleRoleQuery(args, config) {
  const result = await queryRoleList(args || {}, config)

  if (!result.ok) {
    return `❌ 查询角色失败: ${result.error} (code: ${result.code})`
  }

  const page = result.data && result.data.page
  const records = (page && page.records) || []

  if (records.length === 0) {
    return '✅ 角色查询成功，当前应用暂无角色数据'
  }

  // 仅保留关键字段，减少 token 浪费
  const slim = records.map((r) => ({
    id: r.id,
    roleName: r.roleName,
    code: r.code,
    sysAppNo: r.sysAppNo,
    roleDesc: r.roleDesc,
  }))

  return [
    `✅ 角色查询成功，当前页 ${records.length} 条 / 共 ${page.total} 条（current=${page.current}, pages=${page.pages}）`,
    '',
    JSON.stringify(slim, null, 2),
  ].join('\n')
}

/**
 * wls_role_upsert 工具处理器
 * 批量新增角色（仅新增，不更新；以 code 字段去重）
 *
 * @param {{ items: Array<{ roleName: string, code: string, configDesc?: string }> }} args
 */
async function handleRoleUpsert(args, config) {
  const { items } = args || {}

  if (!Array.isArray(items) || items.length === 0) {
    return '❌ 参数错误：items 必须是非空数组'
  }

  // 先查全量角色，按 code 去重
  const queryResult = await queryRoleList({ size: 999 }, config)
  if (!queryResult.ok) {
    return `❌ 查询现有角色失败: ${queryResult.error}`
  }
  const existingCodes = new Set(
    ((queryResult.data && queryResult.data.page && queryResult.data.page.records) || [])
      .map((r) => r.code)
  )

  const results = []

  for (const item of items) {
    if (!item.roleName || !item.code) {
      results.push({
        roleName: item.roleName || '(未命名)',
        code: item.code || '(无)',
        status: '❌ roleName 与 code 必填',
      })
      continue
    }

    if (existingCodes.has(item.code)) {
      results.push({
        roleName: item.roleName,
        code: item.code,
        status: '⏭ 已存在（跳过）',
      })
      continue
    }

    const body = {
      roleName: item.roleName,
      code: item.code,
      configDesc: item.configDesc || '',
    }

    const r = await saveRole(body, config)
    results.push({
      roleName: item.roleName,
      code: item.code,
      status: r.ok ? '✅ 创建成功' : `❌ 失败: ${r.error}`,
    })
  }

  return formatTable(
    results,
    ['roleName', 'code', 'status'],
    ['角色名', 'code', '状态']
  )
}

/* ──────────────────────────────────────────────────────────────────────
 * 角色授权（给角色挂菜单）
 * ──────────────────────────────────────────────────────────────────── */

/**
 * wls_role_assign_menus 工具处理器
 * 给指定角色批量分配菜单权限
 *
 * @param {{ roleId: string, menuIds: string[] }} args - menuIds 用数组传入，内部拼成逗号字符串
 */
async function handleRoleAssignMenus(args, config) {
  const { roleId, menuIds } = args || {}

  if (!roleId) {
    return '❌ 参数错误：roleId 必填'
  }
  if (!Array.isArray(menuIds) || menuIds.length === 0) {
    return '❌ 参数错误：menuIds 必须是非空字符串数组'
  }

  const body = {
    roleId,
    menuIds: menuIds.join(','),
  }

  const r = await saveRoleMenus(body, config)
  if (!r.ok) {
    return `❌ 角色授权失败: ${r.error} (code: ${r.code})`
  }

  return `✅ 角色授权成功（roleId=${roleId}，已分配 ${menuIds.length} 个菜单/动作）`
}

/**
 * wls_assignable_menus_query 工具处理器
 * 查询全量可授权菜单（扁平/树形由后端决定）
 */
async function handleAssignableMenusQuery(_args, config) {
  const r = await queryAssignableMenus(config)
  if (!r.ok) {
    return `❌ 查询可授权菜单失败: ${r.error} (code: ${r.code})`
  }
  // data 可能是 { records: [...] } 或数组
  const records = (r.data && r.data.records) || (Array.isArray(r.data) ? r.data : [])
  if (records.length === 0) {
    return '✅ 查询成功，当前无可授权菜单'
  }
  return [
    `✅ 可授权菜单查询成功，共 ${records.length} 条`,
    '',
    JSON.stringify(records, null, 2),
  ].join('\n')
}

/* ──────────────────────────────────────────────────────────────────────
 * 挂动作（给页面菜单加 type=A 的动作按钮）
 * ──────────────────────────────────────────────────────────────────── */

/**
 * wls_action_query 工具处理器
 * 查询指定页面菜单下的动作子项（type=A）
 *
 * @param {{ menuId: string }} args
 */
async function handleActionQuery(args, config) {
  const { menuId } = args || {}
  if (!menuId) {
    return '❌ 参数错误：menuId 必填（页面菜单 id）'
  }

  const r = await queryMenuChildren(menuId, config)
  if (!r.ok) {
    return `❌ 查询子菜单失败: ${r.error} (code: ${r.code})`
  }

  const records = (r.data && r.data.records) || []
  // 仅保留 type=A（动作）
  const actions = records.filter((m) => m.type === 'A')

  if (actions.length === 0) {
    return `✅ 查询成功，菜单 ${menuId} 下暂无动作（type=A）`
  }

  const slim = actions.map((a) => ({
    id: a.id,
    menuName: a.menuName,
    permission: a.permission,
    orderNum: a.orderNum,
    icon: a.icon,
  }))

  return [
    `✅ 动作查询成功，共 ${actions.length} 条`,
    '',
    JSON.stringify(slim, null, 2),
  ].join('\n')
}

/**
 * wls_action_upsert 工具处理器
 * 在指定页面菜单下批量新增动作（type=A），按 permission 去重
 *
 * @param {{ parentId: string, items: Array<object> }} args
 *   items 元素：{ menuName, permission, icon?, orderNum?, useCache? }
 */
async function handleActionUpsert(args, config) {
  const { parentId, items } = args || {}

  if (!parentId) {
    return '❌ 参数错误：parentId 必填（页面菜单 id）'
  }
  if (!Array.isArray(items) || items.length === 0) {
    return '❌ 参数错误：items 必须是非空数组'
  }

  // 先查父菜单下已有动作，按 permission 去重
  const queryResult = await queryMenuChildren(parentId, config)
  if (!queryResult.ok) {
    return `❌ 查询现有动作失败: ${queryResult.error}`
  }
  const existing = ((queryResult.data && queryResult.data.records) || [])
    .filter((m) => m.type === 'A')
  const existingPerms = new Set(existing.map((m) => m.permission))

  const results = []

  for (const item of items) {
    if (!item.menuName || !item.permission) {
      results.push({
        menuName: item.menuName || '(未命名)',
        permission: item.permission || '(无)',
        status: '❌ menuName 与 permission 必填',
      })
      continue
    }

    if (existingPerms.has(item.permission)) {
      results.push({
        menuName: item.menuName,
        permission: item.permission,
        status: '⏭ 已存在（跳过）',
      })
      continue
    }

    const body = {
      parentId,
      type: 'A',
      menuName: item.menuName,
      permission: item.permission,
      icon: item.icon || 'list',
      orderNum: item.orderNum != null ? item.orderNum : 1,
      useCache: item.useCache != null ? item.useCache : 1,
      sysAppNo: config.sysAppNo,
      intIsActive: 1,
    }

    const r = await saveMenu(body, config)
    if (r.ok) {
      const saved = r.data
      results.push({
        menuName: item.menuName,
        permission: item.permission,
        status: `✅ 创建成功 (id=${saved ? saved.id : '?'})`,
      })
    } else {
      results.push({
        menuName: item.menuName,
        permission: item.permission,
        status: `❌ 失败: ${r.error}`,
      })
    }
  }

  return formatTable(
    results,
    ['menuName', 'permission', 'status'],
    ['动作名', '权限码', '状态']
  )
}

/* ──────────────────────────────────────────────────────────────────────
 * 工具函数
 * ──────────────────────────────────────────────────────────────────── */

function formatTable(rows, keys, headers) {
  const successCount = rows.filter((r) => r.status.startsWith('✅')).length
  const skipCount = rows.filter((r) => r.status.startsWith('⏭')).length
  const failCount = rows.length - successCount - skipCount

  let out = `操作完成：成功 ${successCount} 条，跳过 ${skipCount} 条，失败 ${failCount} 条\n\n`
  out += '| ' + headers.join(' | ') + ' |\n'
  out += '|' + headers.map(() => '---').join('|') + '|\n'
  for (const r of rows) {
    out += '| ' + keys.map((k) => r[k]).join(' | ') + ' |\n'
  }
  return out
}

module.exports = {
  handleRoleQuery,
  handleRoleUpsert,
  handleRoleAssignMenus,
  handleAssignableMenusQuery,
  handleActionQuery,
  handleActionUpsert,
}

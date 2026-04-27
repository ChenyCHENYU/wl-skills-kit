'use strict'

const { queryMenuTree, saveMenu } = require('../api/menuApi')

/**
 * wls_menu_query 工具处理器
 * 自动从 config.menu.domainId 读取应用域 ID，查询完整菜单树
 *
 * @param {{ menu: { domainId?: string } }} config
 * @returns {Promise<string>} 返回给 AI 的文本内容
 */
async function handleMenuQuery(config) {
  const domainId = config.menu && config.menu.domainId

  if (!domainId || domainId.toString().includes('domainId')) {
    return [
      '❌ 请在 env.local.json 的 menu.domainId 字段填写真实的应用域 ID',
      '',
      '获取方式：打开菜单管理后台，在 Network 面板找到类似',
      '  getMenuTreeByDomainId?domainId=1777597797627056130',
      '中的数字即为 domainId，填入 env.local.json：',
      '  "menu": { "domainId": "1777597797627056130", ... }',
    ].join('\n')
  }

  const result = await queryMenuTree(domainId, config)

  if (!result.ok) {
    return `❌ 查询菜单树失败: ${result.error} (code: ${result.code})`
  }

  const tree = result.data
  const isEmpty = !tree || (Array.isArray(tree) && tree.length === 0)
  if (isEmpty) {
    return `✅ 菜单树查询成功，当前应用域（domainId=${domainId}）暂无菜单数据`
  }

  return `✅ 菜单树查询成功（domainId=${domainId}）\n\n${JSON.stringify(tree, null, 2)}`
}

/**
 * wls_menu_upsert 工具处理器
 * 批量新增（无 id）或更新（有 id）菜单项
 * 新增时从响应 data 取服务端生成的 id，可用于链式创建子菜单
 *
 * @param {{ items: object[] }} args
 * @param {object} config
 * @returns {Promise<string>}
 */
async function handleMenuUpsert(args, config) {
  const { items } = args

  if (!Array.isArray(items) || items.length === 0) {
    return '❌ 参数错误：items 必须是非空数组'
  }

  const results = []

  for (const item of items) {
    const isUpdate = Boolean(item.id)
    const action = isUpdate ? '更新' : '新增'

    const result = await saveMenu(item, config)

    if (result.ok) {
      const saved = result.data
      results.push({
        action,
        menuName: item.menuName || '(未命名)',
        id: saved ? saved.id : item.id,
        status: '✅ 成功',
      })
    } else {
      results.push({
        action,
        menuName: item.menuName || '(未命名)',
        id: item.id || '(新增)',
        status: `❌ 失败: ${result.error}`,
      })
    }
  }

  const successCount = results.filter((r) => r.status.startsWith('✅')).length
  const failCount = results.length - successCount

  let output = `菜单操作完成：成功 ${successCount} 条，失败 ${failCount} 条\n\n`
  output += '| 操作 | 菜单名 | ID | 状态 |\n'
  output += '|---|---|---|---|\n'
  for (const r of results) {
    output += `| ${r.action} | ${r.menuName} | ${r.id} | ${r.status} |\n`
  }

  return output
}

module.exports = { handleMenuQuery, handleMenuUpsert }

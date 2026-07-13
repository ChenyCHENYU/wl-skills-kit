"use strict";

const {
  queryRoleList,
  saveRole,
  queryAssignableMenus,
  saveRoleMenus,
  queryMenuChildren,
} = require("../api/roleApi");
const { saveMenu } = require("../api/menuApi");
const { writeBlockReason } = require("../write-guard");
const { createPlanHash } = require("../../lib/plan-hash");
const {
  blockedResult,
  completedResult,
  previewResult,
  toolResult,
  validatePlanHash,
} = require("../tool-result");

function pageRecords(result) {
  return result.data?.page?.records || result.data?.records || (Array.isArray(result.data) ? result.data : []);
}

function formatTable(rows, keys, headers) {
  const successCount = rows.filter((row) => row.status.startsWith("✅")).length;
  const skipCount = rows.filter((row) => row.status.startsWith("⏭")).length;
  const lines = [
    `操作完成：成功 ${successCount} 条，跳过 ${skipCount} 条，失败 ${rows.length - successCount - skipCount} 条`, "",
    `| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`,
  ];
  for (const row of rows) lines.push(`| ${keys.map((key) => row[key]).join(" | ")} |`);
  return lines.join("\n");
}

function slimRole(role) {
  return { id: role.id, roleName: role.roleName, code: role.code, sysAppNo: role.sysAppNo, roleDesc: role.roleDesc };
}

async function handleRoleQuery(args = {}, config) {
  const result = await queryRoleList(args, config);
  if (!result.ok) return blockedResult(`查询角色失败: ${result.error} (code: ${result.code})`, "query-failed", { mode: "query" });
  const page = result.data?.page || {};
  const roles = pageRecords(result).map(slimRole);
  const text = roles.length === 0
    ? "✅ 角色查询成功，当前应用暂无角色数据"
    : `✅ 角色查询成功，当前页 ${roles.length} 条 / 共 ${page.total} 条（current=${page.current}, pages=${page.pages}）\n\n${JSON.stringify(roles, null, 2)}`;
  return toolResult(text, { ok: true, state: "completed", mode: "query", count: roles.length, items: roles });
}

function validateRoleItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("参数错误：items 必须是非空数组");
  const invalid = items.find((item) => !item.roleName || !item.code);
  if (invalid) throw new Error("roleName 与 code 必填");
}

function roleActions(items, existingCodes) {
  return items.map((item) => ({
    action: existingCodes.has(item.code) ? "skip" : "create",
    roleName: item.roleName,
    code: item.code,
    body: { roleName: item.roleName, code: item.code, configDesc: item.configDesc || "" },
  }));
}

async function buildRolePlan(args, config) {
  validateRoleItems(args.items);
  const query = await queryRoleList({ size: 999 }, config);
  if (!query.ok) throw new Error(`查询现有角色失败: ${query.error}`);
  const remoteRoles = pageRecords(query);
  const actions = roleActions(args.items, new Set(remoteRoles.map((role) => role.code)));
  const value = { schemaVersion: 1, sysAppNo: config.sysAppNo || "", items: args.items, remoteRoles };
  return { ...value, actions, planHash: createPlanHash("role-upsert", value) };
}

function formatRolePreview(plan) {
  const rows = plan.actions.map((action) => ({
    roleName: action.roleName, code: action.code,
    status: action.action === "skip" ? "⏭ 已存在（跳过）" : "待创建",
  }));
  return `${formatTable(rows, ["roleName", "code", "status"], ["角色名", "code", "状态"])}\n\nplanHash: ${plan.planHash}\n确认后携带相同 planHash 并传 confirmApply: true。`;
}

async function executeRolePlan(plan, config) {
  const results = [];
  for (const action of plan.actions) {
    if (action.action === "skip") {
      results.push({ roleName: action.roleName, code: action.code, status: "⏭ 已存在（跳过）", ok: true });
      continue;
    }
    const saved = await saveRole(action.body, config);
    results.push({ roleName: action.roleName, code: action.code,
      status: saved.ok ? "✅ 创建成功" : `❌ 失败: ${saved.error}`, ok: saved.ok });
  }
  return results;
}

async function handleRoleUpsert(args = {}, config) {
  try {
    validateRoleItems(args.items);
  } catch (error) {
    return blockedResult(error.message, "blocked", { mode: "preview" });
  }
  const earlyBlock = args.confirmApply === true ? writeBlockReason(config) : "";
  if (earlyBlock) return blockedResult(earlyBlock, "blocked", { mode: "apply" });
  let plan;
  try {
    plan = await buildRolePlan(args, config);
  } catch (error) {
    return blockedResult(error.message, "blocked", { mode: args.confirmApply === true ? "apply" : "preview" });
  }
  if (args.confirmApply !== true) return previewResult(formatRolePreview(plan), plan, { actions: plan.actions });
  const stale = validatePlanHash(args, plan);
  if (stale) return stale;
  const results = await executeRolePlan(plan, config);
  const text = formatTable(results, ["roleName", "code", "status"], ["角色名", "code", "状态"]);
  const response = completedResult(text, { planHash: plan.planHash, results });
  return results.every((item) => item.ok) ? response : partialResult(response);
}

function partialResult(result) {
  return { ...result, isError: true, structuredContent: { ...result.structuredContent, ok: false, state: "partial" } };
}

function validateRoleAssignment(args) {
  if (!args.roleId) throw new Error("参数错误：roleId 必填");
  if (!Array.isArray(args.menuIds) || args.menuIds.length === 0) {
    throw new Error("参数错误：menuIds 必须是非空字符串数组");
  }
}

async function buildRoleAssignmentPlan(args, config) {
  validateRoleAssignment(args);
  const query = await queryAssignableMenus(config);
  if (!query.ok) throw new Error(`查询可授权菜单失败: ${query.error}`);
  const value = { schemaVersion: 1, sysAppNo: config.sysAppNo || "", roleId: args.roleId,
    menuIds: [...args.menuIds].sort(), assignableMenus: query.data };
  return { ...value, planHash: createPlanHash("role-menu-assignment", value) };
}

async function handleRoleAssignMenus(args = {}, config) {
  try {
    validateRoleAssignment(args);
  } catch (error) {
    return blockedResult(error.message, "blocked", { mode: "preview" });
  }
  const earlyBlock = args.confirmFullReplace === true ? writeBlockReason(config) : "";
  if (earlyBlock) return blockedResult(earlyBlock, "blocked", { mode: "apply" });
  let plan;
  try {
    plan = await buildRoleAssignmentPlan(args, config);
  } catch (error) {
    return blockedResult(error.message, "blocked", { mode: args.confirmFullReplace === true ? "apply" : "preview" });
  }
  const preview = `角色授权全量覆盖预览：roleId=${args.roleId}，菜单/动作 ${args.menuIds.length} 个\nplanHash: ${plan.planHash}\n确认 menuIds 为完整保留集合后，携带 planHash 并传 confirmFullReplace: true。`;
  if (args.confirmFullReplace !== true) return previewResult(preview, plan, { menuIds: args.menuIds });
  const stale = validatePlanHash(args, plan);
  if (stale) return stale;
  const saved = await saveRoleMenus({ roleId: args.roleId, menuIds: args.menuIds.join(",") }, config);
  if (!saved.ok) return blockedResult(`角色授权失败: ${saved.error} (code: ${saved.code})`, "apply-failed", { mode: "apply" });
  return completedResult(`✅ 角色授权成功（roleId=${args.roleId}，已分配 ${args.menuIds.length} 个菜单/动作）`, { planHash: plan.planHash });
}

async function handleAssignableMenusQuery(_args, config) {
  const result = await queryAssignableMenus(config);
  if (!result.ok) return blockedResult(`查询可授权菜单失败: ${result.error} (code: ${result.code})`, "query-failed", { mode: "query" });
  const records = pageRecords(result);
  const text = records.length === 0
    ? "✅ 查询成功，当前无可授权菜单"
    : `✅ 可授权菜单查询成功，共 ${records.length} 条\n\n${JSON.stringify(records, null, 2)}`;
  return toolResult(text, { ok: true, state: "completed", mode: "query", count: records.length, items: records });
}

function slimAction(action) {
  return { id: action.id, menuName: action.menuName, permission: action.permission, orderNum: action.orderNum, icon: action.icon };
}

async function queryActions(menuId, config) {
  const result = await queryMenuChildren(menuId, config);
  if (!result.ok) throw new Error(`查询子菜单失败: ${result.error} (code: ${result.code})`);
  return pageRecords(result).filter((item) => item.type === "A");
}

async function handleActionQuery(args = {}, config) {
  if (!args.menuId) return blockedResult("参数错误：menuId 必填（页面菜单 id）", "blocked", { mode: "query" });
  try {
    const actions = (await queryActions(args.menuId, config)).map(slimAction);
    const text = actions.length === 0
      ? `✅ 查询成功，菜单 ${args.menuId} 下暂无动作（type=A）`
      : `✅ 动作查询成功，共 ${actions.length} 条\n\n${JSON.stringify(actions, null, 2)}`;
    return toolResult(text, { ok: true, state: "completed", mode: "query", count: actions.length, items: actions });
  } catch (error) {
    return blockedResult(error.message, "query-failed", { mode: "query" });
  }
}

function validateActionItems(args) {
  if (!args.parentId) throw new Error("参数错误：parentId 必填（页面菜单 id）");
  if (!Array.isArray(args.items) || args.items.length === 0) throw new Error("参数错误：items 必须是非空数组");
  if (args.items.some((item) => !item.menuName || !item.permission)) throw new Error("menuName 与 permission 必填");
}

function actionBody(item, parentId, config) {
  return { parentId, type: "A", menuName: item.menuName, permission: item.permission,
    icon: item.icon || "list", orderNum: item.orderNum == null ? 1 : item.orderNum,
    useCache: item.useCache == null ? 1 : item.useCache, sysAppNo: config.sysAppNo, intIsActive: 1 };
}

async function buildActionPlan(args, config) {
  validateActionItems(args);
  const remoteActions = await queryActions(args.parentId, config);
  const existing = new Set(remoteActions.map((item) => item.permission));
  const actions = args.items.map((item) => ({ action: existing.has(item.permission) ? "skip" : "create",
    menuName: item.menuName, permission: item.permission, body: actionBody(item, args.parentId, config) }));
  const value = { schemaVersion: 1, sysAppNo: config.sysAppNo || "", parentId: args.parentId, items: args.items, remoteActions };
  return { ...value, actions, planHash: createPlanHash("action-upsert", value) };
}

function actionRows(actions, preview) {
  return actions.map((action) => ({ menuName: action.menuName, permission: action.permission,
    status: action.action === "skip" ? "⏭ 已存在（跳过）" : preview ? "待创建" : "" }));
}

async function executeActionPlan(plan, config) {
  const results = [];
  for (const action of plan.actions) {
    if (action.action === "skip") {
      results.push({ menuName: action.menuName, permission: action.permission, status: "⏭ 已存在（跳过）", ok: true });
      continue;
    }
    const saved = await saveMenu(action.body, config);
    const id = saved.data?.id || "?";
    results.push({ menuName: action.menuName, permission: action.permission,
      status: saved.ok ? `✅ 创建成功 (id=${id})` : `❌ 失败: ${saved.error}`, ok: saved.ok });
  }
  return results;
}

async function handleActionUpsert(args = {}, config) {
  try {
    validateActionItems(args);
  } catch (error) {
    return blockedResult(error.message, "blocked", { mode: "preview" });
  }
  const earlyBlock = args.confirmApply === true ? writeBlockReason(config) : "";
  if (earlyBlock) return blockedResult(earlyBlock, "blocked", { mode: "apply" });
  let plan;
  try {
    plan = await buildActionPlan(args, config);
  } catch (error) {
    return blockedResult(error.message, "blocked", { mode: args.confirmApply === true ? "apply" : "preview" });
  }
  if (args.confirmApply !== true) {
    const rows = actionRows(plan.actions, true);
    const text = `${formatTable(rows, ["menuName", "permission", "status"], ["动作名", "权限码", "状态"])}\n\nplanHash: ${plan.planHash}\n确认后携带相同 planHash 并传 confirmApply: true。`;
    return previewResult(text, plan, { actions: plan.actions });
  }
  const stale = validatePlanHash(args, plan);
  if (stale) return stale;
  const results = await executeActionPlan(plan, config);
  const text = formatTable(results, ["menuName", "permission", "status"], ["动作名", "权限码", "状态"]);
  const response = completedResult(text, { planHash: plan.planHash, results });
  return results.every((item) => item.ok) ? response : partialResult(response);
}

module.exports = {
  handleRoleQuery,
  handleRoleUpsert,
  handleRoleAssignMenus,
  handleAssignableMenusQuery,
  handleActionQuery,
  handleActionUpsert,
  _internal: { buildActionPlan, buildRoleAssignmentPlan, buildRolePlan },
};

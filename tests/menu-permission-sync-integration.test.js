import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const menuSync = require("../mcp/tools/menuSync");
const permissionSync = require("../mcp/tools/permissionSync");
const servers = [];

async function startBackend() {
  const state = {
    menus: [],
    roles: [],
    assignable: [{ id: "menu-1", menuName: "客户管理" }],
    actions: [],
    writes: [],
    assignableFails: false,
    permissionTree: null,
  };
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const url = new URL(request.url, "http://localhost");
      const body = raw ? JSON.parse(raw) : null;
      const key = `${request.method} ${url.pathname}`;
      if (request.method !== "GET") state.writes.push({ key, body });
      const routed = routeRequest(state, key, body);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(routed?.__envelope || { code: 2000, data: routed }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return {
    state,
    config: {
      gatewayPath: `http://127.0.0.1:${server.address().port}`,
      token: "test-token",
      sysAppNo: "test-app",
      menu: { domainId: "domain-1", parentMenuId: "root-1" },
    },
  };
}

function routeRequest(state, key, body) {
  return key.startsWith("GET ")
    ? routeReadRequest(state, key)
    : routeWriteRequest(state, key, body);
}

function routeReadRequest(state, key) {
  if (key === "GET /system/menu/getMenuTreeByDomainId") return state.menus;
  if (key === "GET /system/menu/getPermissionMenuTree") return state.permissionTree || state.menus;
  if (key === "GET /system/role/list") {
    return { page: { records: state.roles, total: state.roles.length, current: 1, pages: 1 } };
  }
  if (key === "GET /system/menu/get/subMenu") {
    if (state.assignableFails) return { __envelope: { code: 5000, message: "接口异常", data: null } };
    return { page: { records: state.assignable } };
  }
  if (key === "GET /system/menu/children") return { page: { records: state.actions } };
  return null;
}

function routeWriteRequest(state, key, body) {
  if (key === "POST /system/role/save") {
    state.roles.push({ id: `role-${state.roles.length + 1}`, ...body });
    return null;
  }
  if (key === "POST /system/role/saveRoleMenus") return null;
  if (key === "POST /system/menu/save") {
    const saved = { id: `menu-${state.menus.length + state.actions.length + 1}`, ...body };
    if (body.type === "A") state.actions.push(saved);
    else state.menus.push(saved);
    return saved;
  }
  if (key === "PUT /system/menu/update") {
    const target = state.menus.find((menu) => menu.id === body.id);
    if (target) Object.assign(target, body);
    return target || null;
  }
  return null;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise((resolve) => server.close(resolve)),
  ));
});

describe("menu planHash workflow", () => {
  it("预览零写入，线上漂移使旧 planHash 失效，重新预览后可写入", async () => {
    const backend = await startBackend();
    const args = { items: [{ menuName: "模型管理", path: "/model", type: "C" }] };
    const preview = await menuSync.handleMenuUpsert(args, backend.config);
    expect(preview.structuredContent).toMatchObject({ ok: true, mode: "preview" });
    expect(backend.state.writes).toHaveLength(0);

    backend.state.menus.push({ id: "external-1", menuName: "线上新增" });
    const stale = await menuSync.handleMenuUpsert({
      ...args,
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, backend.config);
    expect(stale.structuredContent.state).toBe("stale-plan");
    expect(backend.state.writes).toHaveLength(0);

    const refreshed = await menuSync.handleMenuUpsert(args, backend.config);
    const applied = await menuSync.handleMenuUpsert({
      ...args,
      confirmApply: true,
      planHash: refreshed.structuredContent.planHash,
    }, backend.config);
    expect(applied.structuredContent).toMatchObject({ ok: true, state: "completed" });
    expect(backend.state.writes).toHaveLength(1);
  });

  it("有 id 的菜单使用更新接口而不是重复调用新增接口", async () => {
    const backend = await startBackend();
    backend.state.menus.push({
      id: "menu-1",
      menuName: "乱码菜单",
      menuNameCode: "menu:test",
      permission: "new-permission",
    });
    const args = {
      items: [{
        id: "menu-1",
        menuName: "坯料外委管理",
        menuNameCode: "menu:test",
        permission: "",
      }],
    };

    const preview = await menuSync.handleMenuUpsert(args, backend.config);
    const applied = await menuSync.handleMenuUpsert({
      ...args,
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, backend.config);

    expect(applied.structuredContent).toMatchObject({ ok: true, state: "completed" });
    expect(backend.state.writes).toEqual([{ key: "PUT /system/menu/update", body: args.items[0] }]);
    expect(backend.state.menus[0]).toMatchObject({
      menuName: "坯料外委管理",
      permission: "",
    });
  });

  it("菜单顺序和用户态字段变化不应造成结构计划哈希漂移", async () => {
    const backend = await startBackend();
    backend.state.menus.push(
      { id: "menu-2", menuName: "页面二", path: "pageTwo", collect: false },
      { id: "menu-1", menuName: "页面一", path: "pageOne", collect: false },
    );
    const args = { items: [{ menuName: "页面三", path: "pageThree", type: "C" }] };
    const preview = await menuSync.handleMenuUpsert(args, backend.config);

    backend.state.menus.reverse();
    backend.state.menus.forEach((menu) => { menu.collect = true; });
    const applied = await menuSync.handleMenuUpsert({
      ...args,
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, backend.config);

    expect(applied.structuredContent).toMatchObject({ ok: true, state: "completed" });
    expect(backend.state.writes).toHaveLength(1);
  });

  it("菜单写入成功但不在当前用户权限树时返回可见性警告", async () => {
    const backend = await startBackend();
    backend.state.permissionTree = [];
    const args = {
      items: [{
        menuName: "受限页面",
        path: "restrictedPage",
        type: "C",
        permission: "restricted_page",
      }],
    };

    const preview = await menuSync.handleMenuUpsert(args, backend.config);
    const applied = await menuSync.handleMenuUpsert({
      ...args,
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, backend.config);

    expect(applied.structuredContent).toMatchObject({
      ok: true,
      state: "completed",
      visibility: { checked: true, visibleCount: 0, missingCount: 1 },
      warnings: [{ code: "MENU_NOT_VISIBLE" }],
    });
    expect(applied.text).toContain("permission 是可见性过滤条件");
  });
});

describe("permission planHash workflows", () => {
  it("角色新增必须使用未漂移的预览哈希", async () => {
    const backend = await startBackend();
    const args = { items: [{ roleName: "审计员", code: "auditor" }] };
    const preview = await permissionSync.handleRoleUpsert(args, backend.config);
    expect(backend.state.writes).toHaveLength(0);
    const applied = await permissionSync.handleRoleUpsert({
      ...args,
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, backend.config);
    expect(applied.structuredContent.state).toBe("completed");
    expect(backend.state.roles.map((role) => role.code)).toEqual(["auditor"]);
  });

  it("角色菜单全量覆盖必须使用预览哈希", async () => {
    const backend = await startBackend();
    const args = { roleId: "role-1", menuIds: ["menu-1"] };
    const preview = await permissionSync.handleRoleAssignMenus(args, backend.config);
    expect(backend.state.writes).toHaveLength(0);
    const applied = await permissionSync.handleRoleAssignMenus({
      ...args,
      confirmFullReplace: true,
      planHash: preview.structuredContent.planHash,
    }, backend.config);
    expect(applied.structuredContent.state).toBe("completed");
    expect(backend.state.writes[0].body).toEqual({
      domainId: "domain-1",
      roleId: "role-1",
      menuIds: "menu-1",
    });
  });

  it("可授权菜单主接口失败时回退到完整域菜单树", async () => {
    const backend = await startBackend();
    backend.state.assignableFails = true;
    backend.state.menus.push({
      id: "menu-domain-1",
      parentId: "root-1",
      menuName: "域树页面",
      path: "domainPage",
      type: "C",
      children: [{ id: "action-1", parentId: "menu-domain-1", menuName: "新增", type: "A" }],
    });

    const queried = await permissionSync.handleAssignableMenusQuery({}, backend.config);

    expect(queried.structuredContent).toMatchObject({
      ok: true,
      source: "domain-menu-tree",
      fallbackUsed: true,
      count: 2,
    });
    expect(queried.structuredContent.items.map((item) => item.id)).toEqual(["menu-domain-1", "action-1"]);

    const args = { roleId: "role-1", menuIds: ["menu-domain-1"] };
    const preview = await permissionSync.handleRoleAssignMenus(args, backend.config);
    expect(preview.structuredContent).toMatchObject({
      domainId: "domain-1",
      source: "domain-menu-tree",
      fallbackUsed: true,
    });
    const applied = await permissionSync.handleRoleAssignMenus({
      ...args,
      confirmFullReplace: true,
      planHash: preview.structuredContent.planHash,
    }, backend.config);
    expect(applied.structuredContent).toMatchObject({
      ok: true,
      domainId: "domain-1",
      source: "domain-menu-tree",
      fallbackUsed: true,
    });
    expect(backend.state.writes[0].body).toEqual({
      domainId: "domain-1",
      roleId: "role-1",
      menuIds: "menu-domain-1",
    });
  });

  it("页面动作新增必须使用预览哈希且重跑保持幂等", async () => {
    const backend = await startBackend();
    const args = {
      parentId: "menu-1",
      items: [{ menuName: "新增", permission: "customer_add", orderNum: 1 }],
    };
    const preview = await permissionSync.handleActionUpsert(args, backend.config);
    const applied = await permissionSync.handleActionUpsert({
      ...args,
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, backend.config);
    expect(applied.structuredContent.state).toBe("completed");
    expect(backend.state.actions).toHaveLength(1);

    const repeated = await permissionSync.handleActionUpsert(args, backend.config);
    expect(repeated.structuredContent.actions[0].action).toBe("skip");
  });
});

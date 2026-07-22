"use strict";

const assert = require("assert");
const { buildMenuBody, toCamelCase } = require("../mcp/menu/menu-support");

let pass = 0;
function ok(label) { pass++; console.log("  ✅ " + label); }

const config = { sysAppNo: "TEST_APP" };

console.log("=== toCamelCase 转换 ===");
assert.strictEqual(toCamelCase("mmwr-customer-archive"), "mmwrCustomerArchive");
ok("kebab → camelCase");
assert.strictEqual(toCamelCase("mmwrCustomerArchive"), "mmwrCustomerArchive");
ok("已是 camelCase 原样返回");
assert.strictEqual(toCamelCase("base_data"), "baseData");
ok("下划线 → camelCase");

console.log("\n=== buildMenuBody path 校验（闭环核心）===");

// 1. 正确：camelCase path
const ok1 = buildMenuBody({ type: "M", menuName: "目录", path: "lgPlanning" }, config, "P1", "parent");
assert.strictEqual(ok1.path, "lgPlanning");
ok("camelCase path 透传");

// 2. 正确：kebab 自动转 camelCase
const ok2 = buildMenuBody({ type: "C", menuName: "页面", path: "mmwr-customer-archive", component: "x.vue" }, config, "P2", "parent");
assert.strictEqual(ok2.path, "mmwrCustomerArchive");
ok("kebab-case 自动转 camelCase");

// 3. ❌ 斜杠 path 必须报错
let threw = false;
try {
  buildMenuBody({ type: "M", menuName: "目录", path: "/steelmaking/planning" }, config, "P1", "parent");
} catch (e) {
  threw = true;
  assert.ok(/不能含斜杠/.test(e.message), "错误消息应说明原因");
}
assert.ok(threw, "斜杠 path 必须抛错");
ok("斜杠路径被拦截（不再传到后端导致'该权限标识已存在'）");

console.log("\n=== permission 默认值（闭环）===");

// 4. permission 未传时默认 = path
const ok3 = buildMenuBody({ type: "C", menuName: "页面", path: "lgPlanningDispatch", component: "x.vue" }, config, "P3", "parent");
assert.strictEqual(ok3.permission, "lgPlanningDispatch");
ok("permission 未传时默认 = path（不遗漏）");

// 5. permission 显式传则用传入值
const ok4 = buildMenuBody({ type: "C", menuName: "页面", path: "lgPlanning", permission: "produce:lgPlanning:list", component: "x.vue" }, config, "P4", "parent");
assert.strictEqual(ok4.permission, "produce:lgPlanning:list");
ok("permission 显式传则保留");

console.log("\n=== menuNameCode 生成（闭环）===");

// 6. menuNameCode 基于 camelPath 而非原始 path
const ok5 = buildMenuBody({ type: "M", menuName: "目录", path: "mmwr-base-data" }, config, "P5", "parent");
assert.ok(!ok5.menuNameCode.includes("-"), "menuNameCode 不应含连字符");
assert.ok(ok5.menuNameCode.includes("mmwrBaseData"));
ok("menuNameCode 基于 camelCase path（不含连字符）");

console.log("\n✅ buildMenuBody 闭环校验全部通过（path 格式拦截 + camelCase 转换 + permission 默认 + menuNameCode 正确生成）");

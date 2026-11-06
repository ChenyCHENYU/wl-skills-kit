"use strict";
/** Repository variable is an explicit, pinned checkout plan, not guessed access. */
const assert = require("node:assert/strict");
function validateCheckouts(value) {
  const plan = typeof value === "string" ? JSON.parse(value) : value;
  assert.ok(plan && typeof plan === "object" && !Array.isArray(plan), "组合检出清单必须是对象");
  assert.deepEqual(Object.keys(plan).sort(), ["bd", "design", "test", "ui"], "必须显式配置四个兄弟包");
  for (const [key, row] of Object.entries(plan)) {
    assert.ok(row && typeof row === "object" && !Array.isArray(row), `${key} 缺少仓库配置`);
    assert.deepEqual(Object.keys(row).sort(), ["ref", "repository"]);
    assert.match(row.repository, /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/, `${key} 必须指定 owner/repository`);
    assert.match(row.ref, /^[a-f0-9]{40}$/, `${key} 必须指定完整40位提交SHA`);
  }
  return plan;
}
if (require.main === module) {
  try {
    const plan = validateCheckouts(process.env.WL_COMPOSITION_CHECKOUTS);
    console.log(JSON.stringify({ ok: true, checkouts: plan }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validateCheckouts };

import { describe, it, expect } from "vitest";
const { decideTask, taskCatalog } = require("../lib/task-integration.js");
const mapping = require("../files/.wl-skills/standards/task-map.json");
describe("canonical task standard mapping", () => {
  it("covers every skill with specialized rules", () => {
    const catalog = taskCatalog();
    expect(Object.keys(mapping.skills).sort()).toEqual(catalog.map((item) => item.id).sort());
    expect(catalog.find((item) => item.id === "page-codegen").rules).toContain("01-toolchain");
    expect(catalog.find((item) => item.id === "menu-sync").rules.every((id) => id.startsWith("07-"))).toBe(true);
    expect(Object.keys(mapping.skillPolicies).sort()).toEqual(catalog.map((item) => item.id).sort());
    expect(catalog.every((item) => item.domain && item.baselinePolicy && item.checks.length)).toBe(true);
  });
  it("adds form/state constraints and isolates Git-only operations", () => {
    const form = decideTask({ task: "创建页面包含表单和 Pinia 状态管理", targets: ["src/Foo.vue"], skill: "page-codegen" });
    expect(form.requiredRules.some((id) => id.startsWith("11-"))).toBe(true);
    expect(form.requiredRules.some((id) => id.startsWith("10-"))).toBe(true);
    expect(form.ruleDetails.every((rule) => rule.source.endsWith(".md"))).toBe(true);
    const git = decideTask({ task: "git push 当前分支", targets: ["src/Foo.vue"] });
    expect(git.requiredRules.every((id) => id.startsWith("08-"))).toBe(true);
    expect(git.requiredChecks).toEqual([]);
  });
  it.each([
    ["创建菜单", "menu-sync"], ["批量创建 10 个菜单，先预览", "menu-sync"], ["批量新增三个字典", "dict-sync"],
    ["批量创建2个角色", "permission-sync"], ["创建五个权限码", "permission-sync"], ["给 3 个角色分配菜单", "permission-sync"],
    ["不要创建页面，只创建菜单", "menu-sync"], ["创建菜单后提交", "menu-sync"], ["创建菜单并校验 planHash", "menu-sync"],
    ["为 Vue 项目创建 10 个菜单", "menu-sync"], ["为生产台账创建菜单", "menu-sync"],
    ["导航里的质检放到库存前面。菜单 502 顺序改成 5，菜单 501 保持 10。只看排序预览，页面、路由、权限和后端数据都先别动。", "menu-sync"],
    ["查一下当前菜单，再把菜单 502 顺序改成 5", "menu-sync"],
    ["把质检菜单置顶，先做实际预览", "menu-sync"],
  ])("routes %s by its capability domain without page checks", (task, expected) => {
    const decision = decideTask({ task, targets: [] });
    expect(decision.status).toBe("matched");
    expect(decision.selectedSkills).toEqual([expected]);
    expect(decision.baselineRules).toEqual([]);
    expect(decision.requiredChecks).toEqual(["backend-preview"]);
    expect(decision.requiredRules.every((id) => /^(06|07)-/.test(id))).toBe(true);
    expect(decision.backendWorkflow.applyRequires).toBe("explicit-confirmation-and-matching-planHash");
  });
  it("keeps query, negation and mixed page work separate", () => {
    const query = decideTask({ task: "只查询 5 个菜单，不要创建菜单", targets: [] });
    expect(query.selectedSkills).toEqual(["menu-sync"]);
    expect(query.requiredChecks).toEqual(["backend-query"]);
    const negated = decideTask({ task: "不要创建菜单，只创建页面", targets: [] });
    expect(negated.selectedSkills).toEqual(["page-codegen"]);
    expect(negated.requiredChecks).toEqual(["validate"]);
    const pageSorting = decideTask({ task: "调整菜单页面里的按钮显示顺序，只改组件", targets: ["src/views/demo/index.vue"] });
    expect(pageSorting.selectedSkills).not.toContain("menu-sync");
    expect(pageSorting.requiredChecks).not.toContain("backend-preview");
    for (const task of ["调整菜单页的按钮显示顺序，只改 Vue 组件", "调整侧边导航栏图标的显示顺序，只改 CSS"]) {
      const frontend = decideTask({ task, targets: ["src/views/demo/index.vue"] });
      expect(frontend.selectedSkills).not.toContain("menu-sync");
      expect(frontend.requiredChecks).not.toContain("backend-preview");
    }
    const explain = decideTask({ task: "我只想了解如何调整菜单顺序，请不要调用工具", targets: [] });
    expect(explain.action).toMatchObject({ mode: "explain", checksAllowed: false, businessWritesAuthorized: false });
    const mixed = decideTask({ task: "创建菜单，并修改页面文字", targets: [] });
    expect(mixed.selectedSkills).toEqual(["menu-sync"]);
    expect(mixed.baselineRules.length).toBeGreaterThan(0);
    expect(mixed.requiredChecks).toEqual(["validate", "backend-preview"]);
    const ambiguous = decideTask({ task: "创建页面并创建菜单", targets: [] });
    expect(ambiguous.status).toBe("ambiguous");
    expect(ambiguous.selectedSkills).toEqual([]);
  });
});

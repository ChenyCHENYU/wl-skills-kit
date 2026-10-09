import { describe, it, expect } from "vitest";
const { decideTask, taskCatalog } = require("../lib/task-integration.js");
const mapping = require("../files/.wl-skills/standards/task-map.json");
describe("canonical task standard mapping", () => {
  it("covers every skill with specialized rules", () => {
    const catalog = taskCatalog();
    expect(Object.keys(mapping.skills).sort()).toEqual(catalog.map((item) => item.id).sort());
    expect(catalog.find((item) => item.id === "page-codegen").rules).toContain("01-toolchain");
    expect(catalog.find((item) => item.id === "menu-sync").rules.every((id) => id.startsWith("07-"))).toBe(true);
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
});

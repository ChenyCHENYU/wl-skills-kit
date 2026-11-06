import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const { decideTask, taskCatalog } = require("../lib/task-integration.js");
const { protocol } = require("../lib/protocol-cli.js");
const packageRoot = path.resolve(import.meta.dirname, "..");
const roots = [];
function project(adopted = true, platform = "pc") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-explicit-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ private: true, dependencies: adopted ? { "@agile-team/wl-skills-kit": "*", vue: "^3.4.0" } : {} }));
  fs.writeFileSync(path.join(root, ".wl-skills-scope.json"), JSON.stringify({ schemaVersion: 1, projectType: platform }));
  fs.mkdirSync(path.join(root, "node_modules/@agile-team"), { recursive: true });
  fs.symlinkSync(packageRoot, path.join(root, "node_modules/@agile-team/wl-skills-kit"), "dir");
  return root;
}
function cli(root, args) {
  const result = spawnSync(process.execPath, [path.join(packageRoot, "bin/wl-skills.js"), ...args, "--json"], { cwd: root, encoding: "utf8", timeout: 30000 });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout);
}
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe("bounded capability routing", () => {
  it.each([
    ["把库存接口的响应结构和错误码定义好", "api-contract"],
    ["将全部详设整理为模块文档并列出业务规则", "business-doc-extract"],
    ["修复已确认的规范偏差", "code-fix"],
    ["核对现有页面代码与团队规则是否一致", "convention-audit"],
    ["新建一个仓库出入库菜单", "menu-sync"],
    ["登记设备页面到系统导航", "menu-sync"],
    ["将采购页面登记进导航", "menu-sync"],
    ["创建一个权限管理菜单", "menu-sync"],
    ["创建一个字典管理菜单", "menu-sync"],
    ["新增采购付款状态字典", "dict-sync"],
    ["给采购员角色授权", "permission-sync"],
    ["给采购员授予访问权限", "permission-sync"],
    ["同步权限给角色分配菜单", "permission-sync"],
    ["解析 Axure 的原型目录", "prototype-scan"],
    ["阅读标准详设并提取字段和交互", "spec-doc-parse"],
    ["统一 Vite 子应用的环境配置", "standard-env-config"],
    ["审计状态列和类型列的字典标签", "status-column-audit"],
    ["抽取可复用的审批页面模板", "template-extract"],
    ["新建一个设备管理页面", "page-codegen"],
    ["创建角色管理页面", "page-codegen"],
  ])("%s selects its capability rather than an object-name substring", (task, id) => {
    const result = decideTask({ task, targets: ["src/views/index.vue"] });
    expect(result.status).toBe("matched");
    expect(result.selectedSkills).toEqual([id]);
    expect(result.skillDetails[0].name).toMatch(/[\u4e00-\u9fff]/);
  });
  it.each(["创建菜单和字典", "创建角色和菜单", "新增一个设备菜单，并新增采购状态字典", "给仓管角色授权，同时新增一个首页菜单", "新建一个设备页面，并创建一个设备菜单", "把当前采购页登记进导航，并给采购员授予访问权限", "同步菜单并解析说明书"]) ("%s retains independent stages", (task) => {
    const result = decideTask({ task, targets: ["src/views/index.vue"] });
    expect(result.status).toBe("ambiguous");
    expect(result.selectedSkills).toEqual([]);
  });
  it.each(["修改按钮文案", "创建字典列组件", "不要登记系统导航，只修改按钮文案"]) ("%s does not enter backend write workflows", (task) => {
    const result = decideTask({ task, targets: ["src/views/index.vue"] });
    expect(result.selectedSkills).toEqual([]);
    expect(result.backendWorkflow).toBeUndefined();
  });
  it("publishes canonical Chinese names and descriptions consistently", () => {
    const inventory = protocol.describe().inventory.skills;
    for (const skill of taskCatalog()) {
      expect(skill.name).toMatch(/[\u4e00-\u9fff]/);
      expect(skill.description).toMatch(/^[\u4e00-\u9fff]/);
      expect(inventory.find((item) => item.id === skill.id)).toMatchObject({ name: skill.name, description: skill.description });
    }
  });
  it("public CLI and protocol honor explicit skill IDs without adding action permission", () => {
    const root = project();
    const task = "只解释能力用途，不要扫描";
    const direct = cli(root, ["route", task, "--project", root, "--skill", "menu-sync"]);
    const request = path.join(root, "request.json");
    fs.writeFileSync(request, JSON.stringify({ protocolVersion: 1, operation: "route", projectRoot: root, task, skill: "menu-sync" }));
    const envelope = cli(root, ["protocol", "request", "--input-file", request]);
    for (const result of [direct, envelope.result]) {
      expect(result.selectedSkills).toEqual(["menu-sync"]);
      expect(result.selectionEvidence).toBe("explicit-skill-id");
      expect(result.action.checksAllowed).toBe(false);
      expect(result.action.businessWritesAuthorized).toBe(false);
    }
    expect(cli(root, ["route", task, "--project", root, "--skill", "unpublished"]).status).toBe("gap");
  });
  it.each([[false, "pc"], [true, "mobile"]])("explicit IDs cannot cross adoption or platform boundaries", (adopted, platform) => {
    const root = project(adopted, platform);
    const result = cli(root, ["route", "创建一个库存菜单", "--project", root, "--skill", "menu-sync"]);
    expect(result.status).toBe("not-applicable");
    expect(result.selectedSkills).toEqual([]);
  });
});

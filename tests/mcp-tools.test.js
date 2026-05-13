/**
 * tests/mcp-tools.test.js
 * MCP 工具核心逻辑单测
 *
 * 策略：
 * - 纯函数（parseReport / normalizeTree / extractModules 等）直接调用
 * - 网络依赖的 handler 仅测参数校验路径（校验在网络调用前，不需要 mock）
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, "..");

const menuSync = require(path.join(ROOT, "mcp/tools/menuSync.js"));
const dictSync = require(path.join(ROOT, "mcp/tools/dictSync.js"));
const permSync = require(path.join(ROOT, "mcp/tools/permissionSync.js"));

const {
  cleanCell,
  splitMarkdownRow,
  isDividerRow,
  parseBoolean,
  normalizeTree,
  flattenMenus,
  findExisting,
  parseReport,
} = menuSync._internal;

const { extractModules } = dictSync._internal;

// ─────────────────────────────────────────────
// menuSync 纯函数
// ─────────────────────────────────────────────

describe("menuSync.cleanCell", () => {
  it("去掉前后反引号和星号", () => {
    expect(cleanCell("`hello`")).toBe("hello");
    expect(cleanCell("**world**")).toBe("world");
    expect(cleanCell("  trim me  ")).toBe("trim me");
  });
  it("空值返回空字符串", () => {
    expect(cleanCell(undefined)).toBe("");
    expect(cleanCell(null)).toBe("");
    expect(cleanCell("")).toBe("");
  });
});

describe("menuSync.splitMarkdownRow", () => {
  it("正确拆分三列行", () => {
    const cells = splitMarkdownRow("| 菜单名 | 路径 | 组件 |");
    expect(cells).toHaveLength(3);
    expect(cells[0]).toBe("菜单名");
    expect(cells[1]).toBe("路径");
    expect(cells[2]).toBe("组件");
  });
  it("去掉首尾 | 后仍能正常拆分", () => {
    const cells = splitMarkdownRow("A | B | C");
    expect(cells).toHaveLength(3);
  });
});

describe("menuSync.isDividerRow", () => {
  it("识别分隔行", () => {
    expect(isDividerRow("|---|---|---|")).toBe(true);
    expect(isDividerRow("| :--- | ---: | :---: |")).toBe(true);
  });
  it("不把普通行当分隔行", () => {
    expect(isDividerRow("| 菜单名 | 路径 |")).toBe(false);
    expect(isDividerRow("")).toBe(false);
  });
});

describe("menuSync.parseBoolean", () => {
  it("真值字符串", () => {
    for (const v of ["true", "yes", "y", "1", "是", "隐藏", "hidden"]) {
      expect(parseBoolean(v)).toBe(true);
    }
  });
  it("假值字符串", () => {
    for (const v of ["false", "no", "0", ""]) {
      expect(parseBoolean(v)).toBe(false);
    }
  });
});

describe("menuSync.normalizeTree", () => {
  it("数组直接返回", () => {
    const arr = [{ id: 1 }];
    expect(normalizeTree(arr)).toBe(arr);
  });
  it("records 结构", () => {
    const data = { records: [{ id: 1 }] };
    expect(normalizeTree(data)).toEqual([{ id: 1 }]);
  });
  it("list 结构", () => {
    expect(normalizeTree({ list: [1, 2] })).toEqual([1, 2]);
  });
  it("children 结构", () => {
    expect(normalizeTree({ children: ["a"] })).toEqual(["a"]);
  });
  it("未知结构返回空数组", () => {
    expect(normalizeTree(null)).toEqual([]);
    expect(normalizeTree({})).toEqual([]);
    expect(normalizeTree("string")).toEqual([]);
  });
});

describe("menuSync.flattenMenus", () => {
  it("扁平化单层树", () => {
    const tree = [{ id: "1", menuName: "A", children: [] }];
    const result = flattenMenus(tree, "root", []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });
  it("递归扁平化两层树", () => {
    const tree = [
      {
        id: "1",
        menuName: "目录",
        children: [
          { id: "2", menuName: "页面", children: [] },
        ],
      },
    ];
    const result = flattenMenus(tree, "root", []);
    expect(result).toHaveLength(2);
    expect(result[1].parentId).toBe("1");
  });
  it("childList 和 childrenList 字段也能识别", () => {
    const tree = [
      { id: "1", childList: [{ id: "2" }] },
    ];
    const result = flattenMenus(tree, "root", []);
    expect(result).toHaveLength(2);
  });
});

describe("menuSync.findExisting", () => {
  const flatMenus = [
    { id: "1", parentId: "root", path: "/customer", menuName: "客户管理" },
    { id: "2", parentId: "1", path: "/customer/list", menuName: "客户列表" },
  ];

  it("按 path 匹配", () => {
    const found = findExisting(flatMenus, {
      parentId: "1",
      path: "/customer/list",
      menuName: "客户列表",
    });
    expect(found).toBeTruthy();
    expect(found.id).toBe("2");
  });
  it("path 和名字都不同则返回 undefined", () => {
    const found = findExisting(flatMenus, {
      parentId: "1",
      path: "/no-such",
      menuName: "不存在",
    });
    expect(found).toBeUndefined();
  });
});

describe("menuSync.parseReport", () => {
  const REPORT = `
## 一级目录

| 菜单名 | path |
|---|---|
| 生产管理 | /produce |

### 1. 生产管理 子菜单

## 二级菜单

| 菜单名 | path | component | permission |
|---|---|---|---|
| 客户档案 | /produce/customer | produce/customer/index | customer:list |
`;

  it("解析出目录与页面", () => {
    const result = parseReport(REPORT);
    expect(result.dirs).toHaveLength(1);
    expect(result.dirs[0].menuName).toBe("生产管理");
    expect(result.dirs[0].type).toBe("M");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].menuName).toBe("客户档案");
    expect(result.pages[0].type).toBe("C");
    expect(result.pages[0].parentMenuName).toBe("生产管理");
  });

  it("空报告返回空数组", () => {
    const result = parseReport("# 无内容");
    expect(result.dirs).toHaveLength(0);
    expect(result.pages).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// dictSync 纯函数
// ─────────────────────────────────────────────

describe("dictSync.extractModules", () => {
  it("dictionary.children 结构", () => {
    const data = { dictionary: { children: [{ id: 1 }] } };
    expect(extractModules(data)).toEqual([{ id: 1 }]);
  });
  it("直接数组", () => {
    expect(extractModules([1, 2])).toEqual([1, 2]);
  });
  it("null 返回空数组", () => {
    expect(extractModules(null)).toEqual([]);
    expect(extractModules(undefined)).toEqual([]);
  });
  it("未知结构返回空数组", () => {
    expect(extractModules({ other: "field" })).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// Handler 参数校验路径（无网络调用）
// ─────────────────────────────────────────────

describe("dictSync.handleDictUpsert — 参数校验", () => {
  const cfg = { gatewayPath: "http://x", token: "tok", sysAppNo: "app" };

  it("缺 module.strSn 返回错误", async () => {
    const r = await dictSync.handleDictUpsert(
      { module: { strName: "测试" }, items: [] },
      cfg,
    );
    expect(r).toMatch(/strSn 必填/);
  });

  it("缺 module.strName 返回错误", async () => {
    const r = await dictSync.handleDictUpsert(
      { module: { strSn: "CODE" }, items: [] },
      cfg,
    );
    expect(r).toMatch(/strName 必填/);
  });
});

describe("permissionSync.handleRoleUpsert — 参数校验", () => {
  const cfg = { gatewayPath: "http://x", token: "tok", sysAppNo: "app" };

  it("items 为 null 返回错误", async () => {
    const r = await permSync.handleRoleUpsert({ items: null }, cfg);
    expect(r).toMatch(/items 必须是非空数组/);
  });
  it("items 为空数组返回错误", async () => {
    const r = await permSync.handleRoleUpsert({ items: [] }, cfg);
    expect(r).toMatch(/items 必须是非空数组/);
  });
});

describe("permissionSync.handleRoleAssignMenus — 参数校验", () => {
  const cfg = { gatewayPath: "http://x", token: "tok", sysAppNo: "app" };

  it("缺 roleId 返回错误", async () => {
    const r = await permSync.handleRoleAssignMenus({}, cfg);
    expect(r).toMatch(/roleId 必填/);
  });
  it("menuIds 为空数组返回错误", async () => {
    const r = await permSync.handleRoleAssignMenus(
      { roleId: "abc", menuIds: [] },
      cfg,
    );
    expect(r).toMatch(/menuIds 必须是非空/);
  });
});

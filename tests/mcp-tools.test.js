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
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, "..");

const menuSync = require(path.join(ROOT, "mcp/tools/menuSync.js"));
const dictSync = require(path.join(ROOT, "mcp/tools/dictSync.js"));
const permSync = require(path.join(ROOT, "mcp/tools/permissionSync.js"));
const projectTools = require(path.join(ROOT, "mcp/tools/projectTools.js"));
const standardEnvTools = require(path.join(ROOT, "mcp/tools/standardEnvTools.js"));

const {
  cleanCell,
  splitMarkdownRow,
  isDividerRow,
  parseBoolean,
  normalizeTree,
  flattenMenus,
  findExisting,
  findLatestReport,
  resolveReportPath,
  parseReport,
} = menuSync._internal;

const {
  extractModules,
  extractDetailRecords,
  findModule,
  findDictInModule,
  toSafeCodeSuffix,
  normalizeDetailItem,
} = dictSync._internal;

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wl-skills-mcp-test-"));
}

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

describe("menuSync report discovery", () => {
  it("默认优先使用 .wl-skills/reports，旧 .github/reports 只做兜底", () => {
    const root = makeTempRoot();
    try {
      const newDir = path.join(root, ".wl-skills", "reports");
      const oldDir = path.join(root, ".github", "reports");
      fs.mkdirSync(newDir, { recursive: true });
      fs.mkdirSync(oldDir, { recursive: true });
      const newReport = path.join(newDir, "SYS_MENU_INFO.md");
      const oldReport = path.join(oldDir, "SYS_MENU_INFO_newer.md");
      fs.writeFileSync(newReport, "# new", "utf8");
      fs.writeFileSync(oldReport, "# old", "utf8");
      const now = Date.now() / 1000;
      fs.utimesSync(newReport, now - 100, now - 100);
      fs.utimesSync(oldReport, now, now);

      expect(findLatestReport(root)).toBe(newReport);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolveReportPath 不传路径时使用 WL_PROJECT_ROOT 下的新 reports", () => {
    const root = makeTempRoot();
    const previous = process.env.WL_PROJECT_ROOT;
    try {
      const reportsDir = path.join(root, ".wl-skills", "reports");
      fs.mkdirSync(reportsDir, { recursive: true });
      const report = path.join(reportsDir, "SYS_MENU_INFO.md");
      fs.writeFileSync(report, "# menu", "utf8");
      process.env.WL_PROJECT_ROOT = root;

      expect(resolveReportPath()).toBe(report);
    } finally {
      if (previous == null) delete process.env.WL_PROJECT_ROOT;
      else process.env.WL_PROJECT_ROOT = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolveReportPath 拒绝读取项目目录外的报告", () => {
    const root = makeTempRoot();
    const outside = path.join(os.tmpdir(), `SYS_MENU_INFO_OUTSIDE_${Date.now()}.md`);
    const previous = process.env.WL_PROJECT_ROOT;
    try {
      fs.writeFileSync(outside, "# outside", "utf8");
      process.env.WL_PROJECT_ROOT = root;
      expect(resolveReportPath(outside)).toBeNull();
    } finally {
      if (previous == null) delete process.env.WL_PROJECT_ROOT;
      else process.env.WL_PROJECT_ROOT = previous;
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { force: true });
    }
  });
});

describe("projectTools path discovery", () => {
  it("审计推送配置优先读取 .wl-skills/skills/sync/env.local.json", () => {
    const root = makeTempRoot();
    try {
      const envDir = path.join(root, ".wl-skills", "skills", "sync");
      fs.mkdirSync(envDir, { recursive: true });
      const envPath = path.join(envDir, "env.local.json");
      fs.writeFileSync(envPath, JSON.stringify({ feishu_webhook: "https://example.com/hook" }), "utf8");

      expect(projectTools._internal.findEnvLocal(root)).toBe(envPath);
      expect(projectTools._internal.readEnvLocal(root)).toMatchObject({
        feishu_webhook: "https://example.com/hook",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("审计报告默认优先使用 .wl-skills/reports", () => {
    const root = makeTempRoot();
    try {
      const newDir = path.join(root, ".wl-skills", "reports");
      const oldDir = path.join(root, ".github", "reports");
      fs.mkdirSync(newDir, { recursive: true });
      fs.mkdirSync(oldDir, { recursive: true });
      const newReport = path.join(newDir, "AUDIT_new.md");
      const oldReport = path.join(oldDir, "AUDIT_old_newer.md");
      fs.writeFileSync(newReport, "# new", "utf8");
      fs.writeFileSync(oldReport, "# old", "utf8");
      const now = Date.now() / 1000;
      fs.utimesSync(newReport, now - 100, now - 100);
      fs.utimesSync(oldReport, now, now);

      expect(projectTools._internal.findLatestAuditReport(root)).toBe(newReport);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("standardEnvTools", () => {
  it("scan 对当前项目保持只读", async () => {
    const root = makeTempRoot();
    const previous = process.env.WL_PROJECT_ROOT;
    try {
      process.env.WL_PROJECT_ROOT = root;
      const text = await standardEnvTools.handleStandardEnvScan();
      expect(text).toMatch(/unsupported/);
      expect(fs.readdirSync(root)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.WL_PROJECT_ROOT;
      else process.env.WL_PROJECT_ROOT = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("apply 未确认时只输出计划", async () => {
    const root = makeTempRoot();
    const previous = process.env.WL_PROJECT_ROOT;
    try {
      process.env.WL_PROJECT_ROOT = root;
      const text = await standardEnvTools.handleStandardEnvApply({ profile: "walsin" });
      expect(text).toMatch(/confirmApply/);
      expect(fs.readdirSync(root)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.WL_PROJECT_ROOT;
      else process.env.WL_PROJECT_ROOT = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
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

describe("dictSync.extractDetailRecords", () => {
  it("page.records 结构", () => {
    const data = { page: { records: [{ id: 1 }] } };
    expect(extractDetailRecords(data)).toEqual([{ id: 1 }]);
  });
  it("数组直接返回", () => {
    expect(extractDetailRecords([{ id: 1 }])).toEqual([{ id: 1 }]);
  });
  it("未知结构返回空数组", () => {
    expect(extractDetailRecords({ other: "field" })).toEqual([]);
  });
});

describe("dictSync.findModule / findDictInModule", () => {
  const modules = [
    {
      id: "m1",
      strSn: "mdmAuth",
      name: "主数据系统授权",
      children: [
        { id: "d1", strSn: "mdmModelType", name: "模型类型" },
      ],
    },
  ];

  it("按模块 id / strSn / name 定位业务模块", () => {
    expect(findModule(modules, { id: "m1" })?.id).toBe("m1");
    expect(findModule(modules, { strSn: "mdmAuth" })?.id).toBe("m1");
    expect(findModule(modules, { strName: "主数据系统授权" })?.id).toBe("m1");
  });

  it("在模块下按字典 id / strSn 定位字典", () => {
    const moduleNode = modules[0];
    expect(findDictInModule(moduleNode, { id: "d1" })?.id).toBe("d1");
    expect(findDictInModule(moduleNode, { strSn: "mdmModelType" })?.id).toBe("d1");
  });
});

describe("dictSync.normalizeDetailItem", () => {
  it("推荐语义入参 value/label 映射为 strKey/strValue", () => {
    const result = normalizeDetailItem({ value: "2", label: "基础数据模型" });
    expect(result.ok).toBe(true);
    expect(result.item).toMatchObject({
      strKey: "2",
      strValue: "基础数据模型",
      strValueCode: "sysDict.dtl.strValue.2",
    });
  });

  it("原始后端入参 strKey/strValue 保持原样", () => {
    const result = normalizeDetailItem({ strKey: "男", strValue: "0" });
    expect(result.ok).toBe(true);
    expect(result.item).toMatchObject({
      strKey: "男",
      strValue: "0",
      strValueCode: "sysDict.dtl.strValue.0",
    });
  });

  it("缺少 value/label 返回错误", () => {
    expect(normalizeDetailItem({ value: "1" }).ok).toBe(false);
    expect(normalizeDetailItem({ label: "启用" }).ok).toBe(false);
  });
});

describe("dictSync.toSafeCodeSuffix", () => {
  it("优先使用不含中文的 strValue", () => {
    expect(toSafeCodeSuffix("ABC 001", "fallback")).toBe("abc_001");
  });

  it("strValue 是中文时回退到 strKey", () => {
    expect(toSafeCodeSuffix("基础数据模型", "2")).toBe("2");
  });
});

// ─────────────────────────────────────────────
// Handler 参数校验路径（无网络调用）
// ─────────────────────────────────────────────

describe("dictSync.handleDictUpsert — 参数校验", () => {
  const cfg = { gatewayPath: "http://x", token: "tok", sysAppNo: "app" };

  it("拒绝 module/dict/items 旁路，必须从 dicts.ts 发布", async () => {
    const r = await dictSync.handleDictUpsert(
      {
        module: { strSn: "mdmAuth", strName: "主数据系统授权" },
        dict: { strSn: "mdmModelType", strName: "模型类型" },
        items: [],
      },
      cfg,
    );
    expect(r).toMatchObject({ isError: true, structuredContent: { ok: false } });
    expect(r.text).toMatch(/sourcePath/);
  });
});

describe("permissionSync.handleRoleUpsert — 参数校验", () => {
  const cfg = { gatewayPath: "http://x", token: "tok", sysAppNo: "app" };

  it("items 为 null 返回错误", async () => {
    const r = await permSync.handleRoleUpsert({ items: null }, cfg);
    expect(r.text).toMatch(/items 必须是非空数组/);
  });
  it("items 为空数组返回错误", async () => {
    const r = await permSync.handleRoleUpsert({ items: [] }, cfg);
    expect(r.text).toMatch(/items 必须是非空数组/);
  });
  it("生产环境确认写入时在网络调用前阻断", async () => {
    const r = await permSync.handleRoleUpsert({
      items: [{ roleName: "测试", code: "test" }],
      confirmApply: true,
    }, { ...cfg, environment: "production" });
    expect(r.text).toMatch(/默认禁止/);
  });
});

describe("menuSync.handleMenuUpsert — 写入确认", () => {
  const cfg = { gatewayPath: "http://x", token: "tok", sysAppNo: "app" };

  it("空 items 在网络调用前阻断", async () => {
    const r = await menuSync.handleMenuUpsert({
      items: [],
    }, cfg);
    expect(r.text).toMatch(/items 必须是非空数组/);
  });

  it("生产环境即使确认也在网络调用前阻断", async () => {
    const r = await menuSync.handleMenuUpsert({
      items: [{ menuName: "测试菜单", path: "/test" }],
      confirmApply: true,
    }, { ...cfg, environment: "production" });
    expect(r.text).toMatch(/默认禁止/);
  });
});

describe("permissionSync.handleRoleAssignMenus — 参数校验", () => {
  const cfg = { gatewayPath: "http://x", token: "tok", sysAppNo: "app" };

  it("缺 roleId 返回错误", async () => {
    const r = await permSync.handleRoleAssignMenus({}, cfg);
    expect(r.text).toMatch(/roleId 必填/);
  });
  it("menuIds 为空数组返回错误", async () => {
    const r = await permSync.handleRoleAssignMenus(
      { roleId: "abc", menuIds: [] },
      cfg,
    );
    expect(r.text).toMatch(/menuIds 必须是非空/);
  });
  it("生产环境确认全量覆盖时在网络调用前阻断", async () => {
    const r = await permSync.handleRoleAssignMenus(
      { roleId: "abc", menuIds: ["m1"], confirmFullReplace: true },
      { ...cfg, environment: "production" },
    );
    expect(r.text).toMatch(/默认禁止/);
  });
});

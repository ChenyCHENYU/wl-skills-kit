import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  applyBootstrap,
  buildLocalRegistry,
  discoverDictFiles,
  planBootstrap,
  hashValue,
  scanDictionaryReferences,
  stableStringify,
  validateDictionaryReferences,
} = require("../lib/dict-project");
const { formatModuleContract } = require("../lib/dict-contract");
const dictSync = require("../mcp/tools/dictSync");

const roots = [];

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-dict-project-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "src", "views", "mdata"), { recursive: true });
  return root;
}

function contract(moduleCode, dictCode, sources = ["page/api.md"]) {
  return {
    schemaVersion: 1,
    module: { code: moduleCode, name: `${moduleCode}模块` },
    dictionaries: [
      {
        code: dictCode,
        name: `${dictCode}字典`,
        order: { field: "STR_KEY", direction: "asc" },
        items: [{ value: "0", label: "零" }],
        sources,
      },
    ],
  };
}

function writeContract(root, moduleName, value) {
  const directory = path.join(root, "src", "views", "mdata", moduleName);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "dicts.ts"), formatModuleContract(value), "utf8");
}

afterEach(() => {
  delete process.env.WL_PROJECT_ROOT;
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("project dictionary discovery", () => {
  it("planHash 对对象键顺序不敏感并对数组顺序敏感", () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(hashValue({ b: 2, a: 1 })).toBe(hashValue({ a: 1, b: 2 }));
    expect(hashValue(["0", "1", "2"])).not.toBe(hashValue(["1", "0", "2"]));
  });

  it("确定性发现多个模块并建立唯一所有权索引", () => {
    const root = createRoot();
    writeContract(root, "model", contract("model", "modelType"));
    writeContract(root, "quality", contract("quality", "qualityLevel"));
    const registry = buildLocalRegistry({ projectRoot: root });
    expect(registry.modules.map((item) => item.contract.module.code)).toEqual(["model", "quality"]);
    expect(registry.modules.map((item) => item.sourcePath)).toEqual([
      "src/views/mdata/model/dicts.ts",
      "src/views/mdata/quality/dicts.ts",
    ]);
  });

  it("同一字典编码被多个模块定义时阻断", () => {
    const root = createRoot();
    writeContract(root, "model", contract("model", "sharedStatus"));
    writeContract(root, "quality", contract("quality", "sharedStatus"));
    expect(() => buildLocalRegistry({ projectRoot: root })).toThrow(/被多个模块定义/);
  });

  it("仅大小写不同的模块或字典编码也按冲突处理", () => {
    const root = createRoot();
    writeContract(root, "model", contract("MODEL", "SharedStatus"));
    writeContract(root, "quality", contract("model", "sharedstatus"));
    expect(() => buildLocalRegistry({ projectRoot: root })).toThrow(/模块编码重复/);
  });

  it("忽略目录链接，不把项目外 dicts.ts 纳入全量发布", () => {
    const root = createRoot();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "wl-dict-outside-"));
    roots.push(outside);
    fs.writeFileSync(path.join(outside, "dicts.ts"), formatModuleContract(contract("outside", "outsideDict")));
    fs.symlinkSync(outside, path.join(root, "src", "views", "mdata", "linked"),
      process.platform === "win32" ? "junction" : "dir");
    expect(discoverDictFiles({ projectRoot: root }).files).toEqual([]);
  });
});

describe("legacy project bootstrap", () => {
  it("从 api.md 契约预览并只创建缺失的模块 dicts.ts", () => {
    const root = createRoot();
    const page = path.join(root, "src", "views", "mdata", "model", "model-list");
    fs.mkdirSync(page, { recursive: true });
    const value = contract("model", "modelType", []);
    fs.writeFileSync(
      path.join(page, "api.md"),
      ["```dict-contract", JSON.stringify(value), "```"].join("\n"),
      "utf8",
    );
    const preview = planBootstrap({ projectRoot: root });
    expect(preview.entries.map((entry) => entry.targetPath)).toEqual([
      "src/views/mdata/model/dicts.ts",
    ]);
    expect(fs.existsSync(path.join(root, preview.entries[0].targetPath))).toBe(false);
    expect(applyBootstrap(preview, preview.planHash)).toEqual(["src/views/mdata/model/dicts.ts"]);
    expect(buildLocalRegistry({ projectRoot: root }).modules).toHaveLength(1);
    expect(() => applyBootstrap(preview, preview.planHash)).toThrow(/禁止覆盖/);
  });

  it("只有代码字典引用时只生成候选清单，不猜值创建契约", () => {
    const root = createRoot();
    const page = path.join(root, "src", "views", "mdata", "model", "model-list");
    fs.mkdirSync(page, { recursive: true });
    fs.writeFileSync(
      path.join(page, "data.ts"),
      'const field = { logicValue: "mdmModelType" }; useDictOpts("mdmStatus");',
      "utf8",
    );
    const preview = planBootstrap({ projectRoot: root });
    expect(preview.entries).toEqual([]);
    expect(preview.references.map((item) => item.code)).toEqual(["mdmModelType", "mdmStatus"]);
  });

  it("MCP bootstrap 必须先预览并携带 planHash，且不需要后端配置", () => {
    const root = createRoot();
    const page = path.join(root, "src", "views", "mdata", "model", "model-list");
    fs.mkdirSync(page, { recursive: true });
    fs.writeFileSync(
      path.join(page, "api.md"),
      ["```dict-contract", JSON.stringify(contract("model", "modelType", [])), "```"].join("\n"),
      "utf8",
    );
    process.env.WL_PROJECT_ROOT = root;
    const preview = dictSync.handleDictBootstrap({});
    expect(preview.structuredContent).toMatchObject({ ok: true, state: "ready", mode: "preview" });
    const stale = dictSync.handleDictBootstrap({ confirmWrite: true, planHash: "stale" });
    expect(stale.structuredContent.state).toBe("blocked");
    expect(fs.existsSync(path.join(root, "src", "views", "mdata", "model", "dicts.ts"))).toBe(false);
    const applied = dictSync.handleDictBootstrap({
      confirmWrite: true,
      planHash: preview.structuredContent.planHash,
    });
    expect(applied.structuredContent).toMatchObject({ ok: true, state: "created" });
  });
});

describe("dictionary runtime references", () => {
  it("识别 logicValue/useDictOpts/dictCode/jh-select dict 的字面量引用", () => {
    const root = createRoot();
    const moduleRoot = path.join(root, "src", "views", "mdata", "model");
    fs.mkdirSync(moduleRoot, { recursive: true });
    fs.writeFileSync(
      path.join(moduleRoot, "fields.vue"),
      [
        '<template><jh-select dict="selectStatus" /></template>',
        '<script setup lang="ts">',
        'const a = { logicValue: "logicStatus" };',
        'const b = { dictCode: "fieldStatus" };',
        'useDictOpts("optionStatus");',
        "</script>",
      ].join("\n"),
    );
    expect(
      scanDictionaryReferences(root, moduleRoot).map((item) => item.code),
    ).toEqual(["fieldStatus", "logicStatus", "optionStatus", "selectStatus"]);
  });

  it("D2 只阻断代码真实引用但模块契约未登记的编码", () => {
    const root = createRoot();
    const moduleRoot = path.join(root, "src", "views", "mdata", "model");
    fs.mkdirSync(moduleRoot, { recursive: true });
    fs.writeFileSync(
      path.join(moduleRoot, "dicts.ts"),
      formatModuleContract(contract("model", "knownStatus")),
    );
    fs.writeFileSync(
      path.join(moduleRoot, "data.ts"),
      [
        'const ok = { dictCode: "knownStatus" };',
        'const bad = { logicValue: "unknownStatus" };',
      ].join("\n"),
    );
    const result = validateDictionaryReferences(moduleRoot, {
      projectRoot: root,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/unknownStatus/);
    expect(result.errors.join("\n")).not.toMatch(/未登记字典 knownStatus/);
  });
});

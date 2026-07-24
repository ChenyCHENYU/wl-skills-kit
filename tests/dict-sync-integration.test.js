import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const dictSync = require("../mcp/tools/dictSync");
const { formatModuleContract } = require("../lib/dict-contract");

const tempRoots = [];
const servers = [];

function moduleContract() {
  return {
    schemaVersion: 1,
    module: { code: "mdmAuth", name: "主数据系统授权" },
    dictionaries: [
      {
        code: "mdmModelType",
        name: "模型类型",
        order: { field: "STR_KEY", direction: "asc" },
        items: [
          { value: "0", label: "主数据模型" },
          { value: "1", label: "参照数据模型" },
          { value: "2", label: "基础数据模型" },
        ],
        sources: ["model-list/api.md"],
      },
    ],
  };
}

function createProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-dict-sync-"));
  tempRoots.push(root);
  const moduleDir = path.join(root, "src", "views", "mdata", "model");
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, "dicts.ts"), formatModuleContract(moduleContract()), "utf8");
  return root;
}

function addModuleContract(root, folder, moduleCode, dictCode) {
  const moduleDir = path.join(root, "src", "views", "mdata", folder);
  fs.mkdirSync(moduleDir, { recursive: true });
  const value = moduleContract();
  value.module = { code: moduleCode, name: `${moduleCode}模块` };
  value.dictionaries[0].code = dictCode;
  value.dictionaries[0].name = `${dictCode}字典`;
  fs.writeFileSync(path.join(moduleDir, "dicts.ts"), formatModuleContract(value), "utf8");
}

async function startBackend() {
  const state = {
    definition: {
      id: "dict-1",
      moduleId: "module-1",
      strSn: "mdmModelType",
      strName: "模型类型",
      orderField: "STR_KEY",
      orderRule: "desc",
      dtlValueRequired: false,
    },
    details: [],
    writes: [],
  };
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const url = new URL(request.url, "http://localhost");
      const body = raw ? JSON.parse(raw) : null;
      const key = `${request.method} ${url.pathname}`;
      if (request.method !== "GET") state.writes.push({ key, body });

      let data;
      if (key === "GET /system/business/dict/getDictionaryTreeData") {
        data = {
          dictionary: {
            children: [
              {
                id: "module-1",
                strSn: "mdmAuth",
                name: "主数据系统授权",
                children: [{ id: "dict-1", strSn: "mdmModelType", name: "模型类型" }],
              },
            ],
          },
        };
      } else if (key === "GET /system/dictModule/business/list") {
        data = {
          page: {
            records: [
              {
                id: "module-1",
                strSn: "mdmAuth",
                name: "主数据系统授权",
              },
            ],
          },
        };
      } else if (key === "GET /system/business/dict/getById") {
        data = { dict: state.definition };
      } else if (key === "PUT /system/business/dict/update") {
        state.definition = { ...state.definition, ...body };
        data = null;
      } else if (key === "GET /system/dictDtl/list") {
        data = { page: { records: state.details, pages: 1, total: state.details.length } };
      } else if (key === "POST /system/dictDtl/save") {
        state.details.push({ id: `detail-${state.details.length + 1}`, ...body });
        data = null;
      } else {
        response.statusCode = 404;
        data = null;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ code: response.statusCode === 404 ? 4004 : 2000, data }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return {
    state,
    gatewayPath: `http://127.0.0.1:${server.address().port}`,
  };
}

function moduleRecord(module) {
  const record = { ...module };
  delete record.children;
  return record;
}

function routeModuleBackend(state, options, key, body) {
  if (key === "GET /system/business/dict/getDictionaryTreeData") {
    return { data: { dictionary: { children: state.modules } }, businessCode: 2000 };
  }
  if (key === "GET /system/dictModule/business/list") {
    return {
      data: {
        page: {
          records: state.modules.map(moduleRecord),
          pages: 1,
          total: state.modules.length,
        },
      },
      businessCode: 2000,
    };
  }
  if (key === "GET /system/dictModule/list") {
    const records = options.systemModules || [];
    return {
      data: { page: { records, pages: 1, total: records.length } },
      businessCode: 2000,
    };
  }
  if (key === "POST /system/dictModule/save") {
    if (options.moduleAlreadyExists) {
      return {
        data: null,
        businessCode: 5000,
        message: "系统字典模块已存在，创建失败!",
      };
    }
    state.modules.push({
      ...(options.moduleWithoutId ? {} : { id: `module-${state.modules.length + 1}` }),
      ...body,
      children: [],
    });
    return { data: null, businessCode: 2000 };
  }
  return null;
}

function routeDictionaryBackend(state, options, key, url, body) {
  if (key === "POST /system/business/dict/save") {
    const module = state.modules.find((item) => item.id === body.moduleId);
    const id = `dict-${state.definitions.size + 1}`;
    state.definitions.set(id, { id, ...body });
    state.details.set(id, []);
    module.children.push({ id, strSn: body.strSn, strName: body.strName });
    return { data: null, businessCode: 2000 };
  }
  if (key === "GET /system/business/dict/getById") {
    return { data: { dict: state.definitions.get(url.searchParams.get("id")) }, businessCode: 2000 };
  }
  if (key === "GET /system/dictDtl/list") {
    const records = state.details.get(url.searchParams.get("dictId")) || [];
    return { data: { page: { records, pages: 1, total: records.length } }, businessCode: 2000 };
  }
  if (key === "POST /system/dictDtl/save") {
    state.detailSaveAttempts += 1;
    if (options.failDetailAt === state.detailSaveAttempts) {
      return { data: { message: "simulated detail failure" }, businessCode: 5000 };
    }
    const records = state.details.get(body.dictId);
    records.push({ id: `detail-${records.length + 1}`, ...body });
    return { data: null, businessCode: 2000 };
  }
  return null;
}

function routeEmptyBackend(state, options, key, url, body) {
  const moduleRoute = routeModuleBackend(state, options, key, body);
  if (moduleRoute) return moduleRoute;
  const dictionaryRoute = routeDictionaryBackend(state, options, key, url, body);
  if (dictionaryRoute) return dictionaryRoute;
  return { data: null, businessCode: 4004, statusCode: 404 };
}

async function startEmptyBackend(options = {}) {
  const state = {
    modules: [],
    definitions: new Map(),
    details: new Map(),
    writes: [],
    detailSaveAttempts: 0,
  };
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const url = new URL(request.url, "http://localhost");
      const body = raw ? JSON.parse(raw) : null;
      const key = `${request.method} ${url.pathname}`;
      if (request.method !== "GET") state.writes.push({ key, body });
      const routed = routeEmptyBackend(state, options, key, url, body);
      response.statusCode = routed.statusCode || 200;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        code: routed.businessCode,
        data: routed.data,
        ...(routed.message ? { message: routed.message } : {}),
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { state, gatewayPath: `http://127.0.0.1:${server.address().port}` };
}

afterEach(async () => {
  delete process.env.WL_PROJECT_ROOT;
  await Promise.all(servers.splice(0).map((server) =>
    new Promise((resolve) => server.close(resolve))));
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("dicts.ts MCP sync", () => {
  it("拒绝通过目录链接读取项目根目录外的 dicts.ts", async () => {
    const root = createProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "wl-dict-outside-"));
    tempRoots.push(outside);
    fs.writeFileSync(path.join(outside, "dicts.ts"), formatModuleContract(moduleContract()), "utf8");
    const link = path.join(root, "linked-module");
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    process.env.WL_PROJECT_ROOT = root;

    const result = await dictSync.handleDictUpsert(
      { sourcePath: "linked-module/dicts.ts" },
      { gatewayPath: "http://127.0.0.1", token: "token", sysAppNo: "mdata" },
    );
    expect(result).toMatchObject({ isError: true, structuredContent: { ok: false } });
    expect(result.text).toMatch(/当前项目目录内/);
  });

  it("默认只预览；线上排序漂移时全局阻断且零写入", async () => {
    const root = createProject();
    const backend = await startBackend();
    process.env.WL_PROJECT_ROOT = root;
    const result = await dictSync.handleDictUpsert(
      { sourcePath: "src/views/mdata/model/dicts.ts" },
      { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" },
    );
    expect(result.text).toMatch(/只读预览/);
    expect(result.text).toMatch(/线上排序.*与本地.*不一致/);
    expect(result.structuredContent).toMatchObject({ ok: false, state: "blocked", mode: "preview" });
    expect(backend.state.writes).toEqual([]);
  });

  it("线上同 value 不同 label 时阻断整个计划且零写入", async () => {
    const root = createProject();
    const backend = await startBackend();
    process.env.WL_PROJECT_ROOT = root;
    backend.state.definition.orderRule = "asc";
    backend.state.details.push({
      id: "detail-conflict",
      dictId: "dict-1",
      strSn: "mdmModelType",
      strKey: "0",
      strValue: "错误名称",
      strValueCode: "sysDict.dtl.strValue.mdmModelType_0",
    });
    const config = { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" };
    const preview = await dictSync.handleDictUpsert({ scope: "project" }, config);
    expect(preview.structuredContent).toMatchObject({ ok: false, state: "blocked" });
    expect(preview.structuredContent.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "detail-conflict", dictCode: "mdmModelType", value: "0" }),
    ]));
    const applied = await dictSync.handleDictUpsert({
      scope: "project",
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, config);
    expect(applied.structuredContent.state).toBe("blocked");
    expect(backend.state.writes).toEqual([]);
  });

  it("携带预览 planHash 后只补缺失明细并完成项目级回查", async () => {
    const root = createProject();
    const backend = await startBackend();
    process.env.WL_PROJECT_ROOT = root;
    backend.state.definition.orderRule = "asc";
    const preview = await dictSync.handleDictUpsert(
      { sourcePath: "src/views/mdata/model/dicts.ts" },
      { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" },
    );
    const result = await dictSync.handleDictUpsert(
      {
        sourcePath: "src/views/mdata/model/dicts.ts",
        confirmApply: true,
        planHash: preview.structuredContent.planHash,
      },
      { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" },
    );
    expect(result.text).toMatch(/项目级回查通过/);
    expect(result.structuredContent).toMatchObject({ ok: true, state: "verified", mode: "apply" });
    expect(backend.state.definition).toMatchObject({ orderField: "STR_KEY", orderRule: "asc" });
    expect(backend.state.details.map((item) => item.strKey)).toEqual(["0", "1", "2"]);
    expect(backend.state.details[0].strValueCode).toBe("sysDict.dtl.strValue.mdmModelType_0");
    expect(backend.state.writes.map((item) => item.key)).toEqual([
      "POST /system/dictDtl/save",
      "POST /system/dictDtl/save",
      "POST /system/dictDtl/save",
    ]);
  });

  it("同一应用同一字典的并发调用被串行化，重跑保持幂等", async () => {
    const root = createProject();
    const backend = await startBackend();
    process.env.WL_PROJECT_ROOT = root;
    const config = { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" };
    backend.state.definition.orderRule = "asc";
    const preview = await dictSync.handleDictUpsert(
      { sourcePath: "src/views/mdata/model/dicts.ts" },
      config,
    );
    const args = {
      sourcePath: "src/views/mdata/model/dicts.ts",
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    };
    const results = await Promise.all([
      dictSync.handleDictUpsert(args, config),
      dictSync.handleDictUpsert(args, config),
    ]);
    expect(results.filter((result) => result.structuredContent.state === "verified")).toHaveLength(1);
    expect(results.filter((result) => result.structuredContent.state === "stale-plan")).toHaveLength(1);
    expect(backend.state.details).toHaveLength(3);
    expect(backend.state.writes.filter((item) => item.key === "POST /system/dictDtl/save")).toHaveLength(3);
  });
});

describe("project-wide dictionary reconcile", () => {
  it("后端报告已存在但三类查询不可见时返回机器可识别的隐藏冲突", async () => {
    const root = createProject();
    const backend = await startEmptyBackend({ moduleAlreadyExists: true });
    process.env.WL_PROJECT_ROOT = root;
    const config = { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" };
    const preview = await dictSync.handleDictUpsert({ scope: "project" }, config);
    const applied = await dictSync.handleDictUpsert({
      scope: "project",
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, config);
    expect(applied.structuredContent).toMatchObject({
      ok: false,
      state: "partial",
      completed: [],
      failure: {
        code: "DICT_MODULE_HIDDEN_CONFLICT",
        details: {
          moduleCode: "mdmAuth",
          suggestedActions: expect.any(Array),
        },
      },
    });
    expect(applied.text).toMatch(/软删除、跨租户或历史残留/);
    expect(backend.state.writes.map((item) => item.key)).toEqual([
      "POST /system/dictModule/save",
    ]);
  });

  it("系统字典模块占用编码时返回明确冲突对象", async () => {
    const root = createProject();
    const backend = await startEmptyBackend({
      moduleAlreadyExists: true,
      systemModules: [{
        id: "system-module-1",
        strSn: "mdmAuth",
        strName: "系统授权模块",
      }],
    });
    process.env.WL_PROJECT_ROOT = root;
    const config = { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" };
    const preview = await dictSync.handleDictUpsert({ scope: "project" }, config);
    const applied = await dictSync.handleDictUpsert({
      scope: "project",
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, config);
    expect(applied.structuredContent.failure).toMatchObject({
      code: "DICT_MODULE_SYSTEM_CONFLICT",
      details: {
        conflict: {
          id: "system-module-1",
          code: "mdmAuth",
        },
      },
    });
  });

  it("字典树隐藏空模块时从业务模块列表识别并复用真实 moduleId", async () => {
    const root = createProject();
    const backend = await startEmptyBackend();
    process.env.WL_PROJECT_ROOT = root;
    backend.state.modules.push({
      id: "module-existing",
      strSn: "mdmAuth",
      strName: "主数据系统授权",
      children: [],
    });
    const config = { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" };
    const preview = await dictSync.handleDictUpsert({ scope: "project" }, config);
    expect(preview.structuredContent).toMatchObject({
      ok: true,
      state: "ready",
      summary: { createModules: 0, createDictionaries: 1, addDetails: 3 },
    });
    const applied = await dictSync.handleDictUpsert({
      scope: "project",
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, config);
    expect(applied.structuredContent).toMatchObject({ ok: true, state: "verified" });
    expect(backend.state.writes.some((item) => item.key === "POST /system/dictModule/save")).toBe(false);
    expect(backend.state.writes.find((item) => item.key === "POST /system/business/dict/save")?.body.moduleId)
      .toBe("module-existing");
  });

  it("线上模块缺少 id 时预览阻断且零写入", async () => {
    const root = createProject();
    const backend = await startEmptyBackend();
    process.env.WL_PROJECT_ROOT = root;
    backend.state.modules.push({
      strSn: "mdmAuth",
      strName: "主数据系统授权",
      children: [],
    });
    const config = { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" };
    const preview = await dictSync.handleDictUpsert({ scope: "project" }, config);
    expect(preview.structuredContent).toMatchObject({ ok: false, state: "blocked" });
    expect(preview.structuredContent.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "remote-duplicate", message: "线上模块 mdmAuth 缺少 id" }),
    ]));
    expect(backend.state.writes).toEqual([]);
  });

  it("模块创建后回查 id 为空时禁止创建字典", async () => {
    const root = createProject();
    const backend = await startEmptyBackend({ moduleWithoutId: true });
    process.env.WL_PROJECT_ROOT = root;
    const config = { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" };
    const preview = await dictSync.handleDictUpsert({ scope: "project" }, config);
    const applied = await dictSync.handleDictUpsert({
      scope: "project",
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, config);
    expect(applied.structuredContent).toMatchObject({ ok: false, state: "partial" });
    expect(applied.text).toMatch(/模块 mdmAuth 缺少 id/);
    expect(backend.state.writes.map((item) => item.key)).toEqual([
      "POST /system/dictModule/save",
    ]);
  });

  it("自动发现多个模块，预览零写入，确认后只新增并在重跑时全部跳过", async () => {
    const root = createProject();
    addModuleContract(root, "quality", "quality", "mdmQualityLevel");
    const backend = await startEmptyBackend();
    process.env.WL_PROJECT_ROOT = root;
    const config = { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" };
    const preview = await dictSync.handleDictUpsert({ scope: "project" }, config);
    expect(preview.structuredContent).toMatchObject({ ok: true, state: "ready", mode: "preview" });
    expect(preview.structuredContent.summary).toMatchObject({ modules: 2, dictionaries: 2 });
    expect(backend.state.writes).toEqual([]);

    const applied = await dictSync.handleDictUpsert({
      scope: "project",
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, config);
    expect(applied.structuredContent).toMatchObject({ ok: true, state: "verified" });
    expect(backend.state.modules).toHaveLength(2);
    expect([...backend.state.details.values()].flat()).toHaveLength(6);
    expect(backend.state.writes
      .filter((item) => item.key === "POST /system/dictModule/save")
      .every((item) => !Object.prototype.hasOwnProperty.call(item.body, "sysAppNo"))).toBe(true);

    const rerun = await dictSync.handleDictUpsert({ scope: "project" }, config);
    expect(rerun.structuredContent.summary).toMatchObject({
      createModules: 0,
      createDictionaries: 0,
      addDetails: 0,
    });
    expect(rerun.structuredContent.actions).toEqual([]);
  });

  it("预览后本地契约变化会使 planHash 失效且零写入", async () => {
    const root = createProject();
    const backend = await startEmptyBackend();
    process.env.WL_PROJECT_ROOT = root;
    const config = { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" };
    const preview = await dictSync.handleDictUpsert({ scope: "project" }, config);
    const dictPath = path.join(root, "src", "views", "mdata", "model", "dicts.ts");
    const changed = moduleContract();
    changed.dictionaries[0].items.push({ value: "3", label: "其他模型" });
    fs.writeFileSync(dictPath, formatModuleContract(changed), "utf8");
    const applied = await dictSync.handleDictUpsert({
      scope: "project",
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, config);
    expect(applied.structuredContent.state).toBe("stale-plan");
    expect(backend.state.writes).toEqual([]);
  });

  it("多请求中断后报告 partial，重新预览可幂等补齐", async () => {
    const root = createProject();
    const backend = await startEmptyBackend({ failDetailAt: 2 });
    process.env.WL_PROJECT_ROOT = root;
    const config = { gatewayPath: backend.gatewayPath, token: "token", sysAppNo: "mdata" };
    const preview = await dictSync.handleDictUpsert({ scope: "project" }, config);
    const partial = await dictSync.handleDictUpsert({
      scope: "project",
      confirmApply: true,
      planHash: preview.structuredContent.planHash,
    }, config);
    expect(partial.structuredContent.state).toBe("partial");
    expect([...backend.state.details.values()].flat()).toHaveLength(1);

    backend.state.detailSaveAttempts = 100;
    const retryPreview = await dictSync.handleDictUpsert({ scope: "project" }, config);
    const retried = await dictSync.handleDictUpsert({
      scope: "project",
      confirmApply: true,
      planHash: retryPreview.structuredContent.planHash,
    }, config);
    expect(retried.structuredContent.state).toBe("verified");
    expect([...backend.state.details.values()].flat()).toHaveLength(3);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildPageMirror, inspectPageMirror, writePageMirror } from "../lib/page-mirror.js";
import { alignPage } from "../lib/page-spec.js";
import { scenarioFromPageSpec } from "../lib/scenario-fromspec.js";
import { handleTemplateExtract, handleTemplateValidate } from "../mcp/tools/templateTools.js";

const cli = fileURLToPath(new URL("../bin/wl-skills.js", import.meta.url));
describe("实现驱动的领域镜像", () => {
  let root;
  let page;
  const pageDir = "src/views/demo/order";
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-page-mirror-"));
    page = path.join(root, pageDir);
    fs.mkdirSync(page, { recursive: true });
    fs.mkdirSync(path.join(root, "src/composables"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { vue: "3.5.40" } }));
    fs.writeFileSync(path.join(root, "src/composables/logic.ts"), 'export const calculate = (value: number) => value * 2;');
    fs.writeFileSync(path.join(page, "data.ts"), `import { ref } from "vue";
import { calculate } from "@/composables/logic";
export const pageDefinition = { code: "DEMO001", name: "真实页面", dataset: { fields: [{ name: "amount", label: "真实金额" }] } };
export const usePage = () => ({ amount: ref(2), calculate });`);
    fs.writeFileSync(path.join(page, "index.vue"), '<template><button v-if="vm.amount" @click="vm.calculate(vm.amount)">{{ vm.amount }}</button></template><script setup lang="ts">import { usePage } from "./data"; const vm = usePage();</script><style scoped lang="scss">@import "./index.scss";</style>');
    fs.writeFileSync(path.join(page, "index.scss"), 'button { color: red; }');
    fs.writeFileSync(path.join(page, "api.md"), '# DEMO001 真实页面\n已确认接口说明。\n');
    fs.writeFileSync(path.join(page, "page-spec.json"), JSON.stringify({ page: "过期页面", columns: [{ name: "wrong", label: "错误字段" }] }));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("只提取实现，保留交互和业务源码，不把旧 JSON 混入镜像", () => {
    fs.writeFileSync(path.join(page, "api.md"), '# OLD001 过期接口页面名\n');
    const file = path.join(page, "data.ts");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('code: "DEMO001"', '"code": "DEMO001"').replace('name: "真实页面"', '"name": "真实页面"'));
    const spec = buildPageMirror(root, pageDir);
    expect(spec.page).toBe("真实页面");
    expect(spec.pageId).toBe("DEMO001");
    expect(spec.mirror.definition.$source).toContain('label: "真实金额"');
    expect(JSON.stringify(spec)).not.toContain("错误字段");
    expect(spec.mirror.bindings).toContainEqual({ binding: "@click", expression: "vm.calculate(vm.amount)" });
    expect(spec.mirror.packages).toEqual([{ name: "vue", version: "3.5.40" }]);
    expect(inspectPageMirror(root, spec)).toEqual([]);
  });

  it("镜像过期只建议重新提取，不按 JSON 要求改页面", () => {
    writePageMirror(root, buildPageMirror(root, pageDir));
    fs.appendFileSync(path.join(root, "src/composables/logic.ts"), '\nexport const upgraded = true;');
    const result = alignPage(page, pageDir, { strict: true });
    expect(result.issues.some((item) => item.rule === "M1")).toBe(true);
    expect(result.issues.every((item) => item.level === "info")).toBe(true);
    expect(result.definitionSource).toBeUndefined();
    const source = fs.readFileSync(path.join(page, "data.ts"), "utf8");
    expect(source).toContain("真实金额");
  });

  it("没有页面定义时，接口标题补充标识但不把文档后缀当页面名", () => {
    fs.writeFileSync(path.join(page, "data.ts"), 'export const usePage = () => ({ amount: 2 });');
    fs.writeFileSync(path.join(page, "api.md"), '# DEMO001 真实页面 API 契约\n');
    const spec = buildPageMirror(root, pageDir);
    expect(spec.pageId).toBe("DEMO001");
    expect(spec.page).toBe("真实页面");
    expect(spec.mirror.definition).toBeNull();
    expect(spec.mirror.sources.find((file) => file.path.endsWith("data.ts")).content).toContain("usePage");
  });

  it("镜像自身的字段或交互被手改时能发现，不改变实现", () => {
    const spec = buildPageMirror(root, pageDir);
    spec.mirror.bindings[0].expression = "错误表达式";
    expect(inspectPageMirror(root, spec)).toContain("镜像结构被手改，请从真实实现重新提取");
  });

  it("结构化定义不会静默丢弃函数和显式 undefined", () => {
    const definition = { code: "DEMO001", name: "真实页面", optional: undefined, map: (row) => row.amount * 2 };
    const spec = buildPageMirror(root, pageDir, { definition });
    expect(spec.mirror.definition.optional).toEqual({ $undefined: true });
    expect(spec.mirror.definition.map.$function).toContain("row.amount * 2");
  });

  it("明确标识的镜像 JSON 损坏也只提示，不阻断业务代码", () => {
    fs.writeFileSync(path.join(page, "page-spec.json"), '{"role":"mirror", invalid');
    const result = alignPage(page, pageDir, { strict: true });
    expect(result.issues.every((item) => item.level === "info" && item.rule === "M1")).toBe(true);
  });

  it("不允许旧生成器把镜像降格成缺少交互的字段模板", () => {
    const result = scenarioFromPageSpec(buildPageMirror(root, pageDir));
    expect(result.doc).toBeNull();
    expect(result.errors.join("；")).toContain("避免丢失交互");
  });

  it("带源码导出可还原所有本地文件，且镜像本身不进入依赖闭包", () => {
    const spec = buildPageMirror(root, pageDir, { bundle: true });
    expect(spec.mirror.restoration.localSources).toBe("embedded");
    expect(spec.mirror.sources.every((file) => typeof file.content === "string")).toBe(true);
    const restored = fs.mkdtempSync(path.join(os.tmpdir(), "wl-restored-"));
    try {
      for (const file of spec.mirror.sources) {
        const target = path.join(restored, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content);
        expect(file.content).toBe(fs.readFileSync(path.join(root, file.path), "utf8"));
      }
      expect(inspectPageMirror(restored, spec)).toEqual([]);
      expect(spec.mirror.sources.some((file) => file.path.endsWith("page-spec.json"))).toBe(false);
    } finally { fs.rmSync(restored, { recursive: true, force: true }); }
  });

  it("不执行业务代码；未知依赖明确留存，不能伪称可独立运行", () => {
    fs.appendFileSync(path.join(page, "data.ts"), '\nthrow new Error("不能执行页面模块");\nimport { missing } from "./missing";');
    const spec = buildPageMirror(root, pageDir);
    expect(spec.mirror.unresolved).toContainEqual({ file: `${pageDir}/data.ts`, reference: "./missing" });
    expect(spec.mirror.restoration.unresolvedReferences).toBe(1);
  });

  const declareComponents = (entries, declaration = "src/components.d.ts") => {
    const properties = Object.entries(entries).map(([name, source]) =>
      `${name}: typeof import('${source}')['default']`).join("\n");
    fs.writeFileSync(path.join(root, declaration), `export {}; declare module 'vue' { export interface GlobalComponents { ${properties} } }`);
  };
  const writeComponent = (name, template) => {
    const directory = path.join(root, "src/components", name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "index.vue"), `<template>${template}</template><script setup lang="ts">import { title } from './data';</script><style scoped>@import './index.scss';</style>`);
    fs.writeFileSync(path.join(directory, "data.ts"), 'export const title = "组件";');
    fs.writeFileSync(path.join(directory, "index.scss"), 'section { color: blue; }');
  };

  it("自动导入的全局、本地及嵌套组件可独立还原，不展开无关组件的声明", () => {
    writeComponent("local/c_panel", '<C_Child>{{ title }}</C_Child>');
    writeComponent("global/C_Child", '<section>{{ title }}</section>');
    writeComponent("local/c_unused", '<section>{{ title }}</section>');
    declareComponents({ C_panel: "./components/local/c_panel/index.vue", C_Child: "./components/global/C_Child/index.vue", C_unused: "./components/local/c_unused/index.vue" });
    fs.writeFileSync(path.join(page, "index.vue"), '<template><c_panel /></template>');
    const spec = buildPageMirror(root, pageDir, { bundle: true });
    const paths = spec.mirror.sources.map((file) => file.path);
    for (const name of ["local/c_panel", "global/C_Child"])
      for (const file of ["index.vue", "data.ts", "index.scss"]) expect(paths).toContain(`src/components/${name}/${file}`);
    expect(paths).toContain("src/components.d.ts");
    expect(paths.some((file) => file.includes("c_unused"))).toBe(false);
    expect(spec.mirror.autoImportedComponents).toContainEqual({ file: `${pageDir}/index.vue`, name: "c_panel", source: "src/components/local/c_panel/index.vue", declaration: "src/components.d.ts" });
    expect(spec.mirror.restoration.dependencyResolution).toBe("static-imports-and-component-declarations");
    expect(spec).toEqual(buildPageMirror(root, pageDir, { bundle: true }));
    const restored = fs.mkdtempSync(path.join(os.tmpdir(), "wl-restored-components-"));
    try {
      fs.copyFileSync(path.join(root, "package.json"), path.join(restored, "package.json"));
      for (const file of spec.mirror.sources) {
        const target = path.join(restored, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content);
      }
      expect(inspectPageMirror(restored, spec)).toEqual([]);
      expect(buildPageMirror(restored, pageDir, { bundle: true })).toEqual(spec);
    } finally { fs.rmSync(restored, { recursive: true, force: true }); }
  });

  it("按插件规则转换连字符；忽略注释、动态组件和未使用的组件声明", () => {
    writeComponent("local/c_panel", '<section>{{ title }}</section>');
    declareComponents({ C_panel: "./components/local/c_panel/index.vue", MyPanel: "./components/local/c_panel/index.vue" }, "components.d.ts");
    // 根目录声明的相对路径不同于 src 下生成的声明。
    fs.writeFileSync(path.join(root, "components.d.ts"), fs.readFileSync(path.join(root, "components.d.ts"), "utf8").replaceAll("./components/", "./src/components/"));
    fs.writeFileSync(path.join(page, "index.vue"), '<template><!-- <c_panel/> --><component :is="selected" /><my-panel /></template>');
    const spec = buildPageMirror(root, pageDir);
    expect(spec.mirror.autoImportedComponents.map((item) => item.name)).toEqual(["my-panel"]);
    expect(spec.mirror.unresolved).toEqual([]);
  });

  it("显式导入优先于同名全局声明，类型导入仍允许模板自动解析", () => {
    writeComponent("local/c_panel", '<section>{{ title }}</section>');
    declareComponents({ C_panel: "./components/local/missing/index.vue" });
    fs.writeFileSync(path.join(page, "index.vue"), '<template><c_panel /></template><script setup>import c_panel from "@/components/local/c_panel/index.vue";</script>');
    expect(buildPageMirror(root, pageDir).mirror.unresolved).toEqual([]);
    declareComponents({ C_panel: "./components/local/c_panel/index.vue" });
    fs.writeFileSync(path.join(page, "index.vue"), '<template><c_panel /></template><script setup lang="ts">import type c_panel from "@/components/local/c_panel/index.vue";</script>');
    expect(buildPageMirror(root, pageDir).mirror.autoImportedComponents[0].name).toBe("c_panel");
  });

  it("自动导入的缺失或冲突源码明确标记，旧项目不强制配置自动导入", () => {
    expect(buildPageMirror(root, pageDir).mirror.restoration.dependencyResolution).toBe("static-imports-only");
    declareComponents({ C_panel: "./components/local/missing/index.vue" });
    fs.writeFileSync(path.join(page, "index.vue"), '<template><c_panel /></template>');
    expect(buildPageMirror(root, pageDir).mirror.unresolved).toContainEqual({ file: "src/components.d.ts", reference: "./components/local/missing/index.vue" });
    declareComponents({ C_panel: "./src/components/another/index.vue" }, "components.d.ts");
    expect(buildPageMirror(root, pageDir).mirror.unresolved).toContainEqual({ file: `${pageDir}/index.vue`, reference: "[component] c_panel: 声明冲突" });
  });

  it("动态加载保留实际表达式，不能把未解析依赖宣称为完整闭包", () => {
    fs.appendFileSync(path.join(page, "data.ts"), '\nconst target = "./runtime"; import(target);');
    const spec = buildPageMirror(root, pageDir, { bundle: true });
    expect(spec.mirror.unresolved).toContainEqual({ file: `${pageDir}/data.ts`, reference: "[dynamic] import(target)" });
    expect(spec.mirror.restoration.dependencyResolution).toBe("static-imports-only");
  });

  it("拒绝通过本地依赖读出项目外文件", () => {
    fs.appendFileSync(path.join(page, "data.ts"), '\nimport bad from "../../../../../outside";');
    expect(() => buildPageMirror(root, pageDir)).toThrow(/路径越界/);
  });

  it("CLI 默认预览，确认写入只修改镜像，dry-run 继续只读", () => {
    const initial = fs.readFileSync(path.join(page, "page-spec.json"), "utf8");
    const source = fs.readFileSync(path.join(page, "data.ts"), "utf8");
    const run = (...args) => JSON.parse(execFileSync(process.execPath, [cli, "template", "mirror", "--path", pageDir, "--json", ...args], { cwd: root, encoding: "utf8" }));
    expect(run().state).toBe("preview");
    expect(run("--confirm", "--dry-run").state).toBe("preview");
    expect(fs.readFileSync(path.join(page, "page-spec.json"), "utf8")).toBe(initial);
    expect(() => writePageMirror(root, buildPageMirror(root, pageDir), `${pageDir}/data.ts`)).toThrow("不能覆盖页面源码");
    expect(run("--confirm").state).toBe("written");
    expect(fs.readFileSync(path.join(page, "data.ts"), "utf8")).toBe(source);
  });

  it("MCP 与 CLI 使用同一提取器，并保持默认只读", () => {
    const previous = process.env.WL_PROJECT_ROOT;
    process.env.WL_PROJECT_ROOT = root;
    try {
      const actual = handleTemplateExtract({ path: pageDir, artifact: "mirror" });
      expect(actual.structuredContent.mirror).toEqual(buildPageMirror(root, pageDir));
      expect(actual.structuredContent.state).toBe("preview");
      handleTemplateExtract({ path: pageDir, artifact: "mirror", confirmWrite: true });
      expect(handleTemplateValidate({ inputPath: `${pageDir}/page-spec.json` }).structuredContent.state).toBe("valid");
    } finally {
      if (previous === undefined) delete process.env.WL_PROJECT_ROOT;
      else process.env.WL_PROJECT_ROOT = previous;
    }
  });
});

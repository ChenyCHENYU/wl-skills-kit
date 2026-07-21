import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  LOCK_RELATIVE_PATH,
  applyComponentPlan,
  componentIssues,
  discoverUsage,
  loadCatalog,
  planComponents,
} = require("../lib/component-catalog");
const { compileScript, compileTemplate, parse } = require("@vue/compiler-sfc");

const tempRoots = [];

function makeProject(dependencies = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-component-catalog-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, "src", "views", "demo"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "types"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "types", "page.ts"), "export type Page = unknown\n");
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      dependencies: {
        vue: "3.2.0",
        "vue-router": "4.0.0",
        "element-plus": "2.0.0",
        "@element-plus/icons-vue": "2.0.0",
        "@jhlc/common-core": "3.1.0",
        "@jhlc/types": "3.1.0",
        ...dependencies,
      },
    }),
  );
  return root;
}

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  return target;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("component catalog", () => {
  it("目录完整并只声明运行时文件", () => {
    const catalog = loadCatalog();
    expect(catalog.components.map((item) => item.name)).toEqual([
      "c_formModal",
      "c_formSections",
      "c_listModal",
      "c_spliterTitle",
      "C_ParentView",
      "C_TagStatus",
      "C_Tree",
    ]);
    expect(catalog.components.every((item) => !item.files.includes("README.md"))).toBe(true);
    expect(catalog.components.some((item) => item.name === "C_RightToolbar")).toBe(false);
    expect(catalog.components.some((item) => item.name === "C_SvgIcon")).toBe(false);
    expect(fs.existsSync(path.join(catalog.sourceRoot, "src/components/global/C_RightToolbar"))).toBe(false);
    expect(fs.existsSync(path.join(catalog.sourceRoot, "src/components/global/C_SvgIcon"))).toBe(false);
  });

  it("目录内 Vue 模板和 script setup 均可编译且无调试日志", () => {
    const catalog = loadCatalog();
    for (const component of catalog.components) {
      for (const file of component.files) {
        const sourcePath = path.join(catalog.sourceRoot, component.sourceDir, file);
        const source = fs.readFileSync(sourcePath, "utf8");
        expect(source).not.toMatch(/console\.log\s*\(/);
        if (!file.endsWith(".vue")) continue;
        const filename = sourcePath;
        const parsed = parse(source, { filename });
        expect(parsed.errors).toEqual([]);
        if (parsed.descriptor.scriptSetup) {
          compileScript(parsed.descriptor, {
            id: component.name,
            fs: {
              fileExists: fs.existsSync,
              readFile: (target) => fs.readFileSync(target, "utf8"),
            },
          });
        }
        if (parsed.descriptor.template) {
          const compiled = compileTemplate({
            id: component.name,
            filename,
            source: parsed.descriptor.template.content,
          });
          expect(compiled.errors).toEqual([]);
        }
      }
    }
  });

  it("同时识别显式 import、辅助文件 import 和模板标签", () => {
    const root = makeProject();
    write(
      root,
      "src/views/demo/index.vue",
      '<template><c_formModal /><!-- <c_listModal /> --></template>\n<script setup>import "@/components/local/c_formSections/data"</script>',
    );
    const usage = discoverUsage(root, loadCatalog());
    expect(usage.map((item) => item.name)).toEqual(["c_formModal", "c_formSections"]);
  });

  it("预览零写入，携带 planHash 后按需落盘且不复制 README", async () => {
    const root = makeProject();
    const preview = planComponents({ projectRoot: root, names: ["c_formModal"] });
    expect(preview.actions).toHaveLength(1);
    expect(fs.existsSync(path.join(root, "src/components/local/c_formModal"))).toBe(false);

    const created = await applyComponentPlan(preview, preview.planHash);
    expect(created).toEqual(["src/components/local/c_formModal"]);
    expect(fs.existsSync(path.join(root, "src/components/local/c_formModal/index.vue"))).toBe(true);
    expect(fs.existsSync(path.join(root, "src/components/local/c_formModal/README.md"))).toBe(false);
    expect(fs.existsSync(path.join(root, LOCK_RELATIVE_PATH))).toBe(true);

    const second = planComponents({ projectRoot: root, names: ["c_formModal"] });
    expect(second.actions).toHaveLength(0);
    expect(second.reusable[0].status).toBe("ready");
  });

  it("--all 计划可一次落盘全部 7 个组件且二次执行幂等", async () => {
    const root = makeProject();
    const preview = planComponents({ projectRoot: root, all: true });
    expect(preview.actions).toHaveLength(7);
    await applyComponentPlan(preview, preview.planHash);

    for (const component of loadCatalog().components) {
      expect(fs.existsSync(path.join(root, component.targetDir, component.entry))).toBe(true);
      expect(fs.existsSync(path.join(root, component.targetDir, "README.md"))).toBe(false);
    }
    expect(fs.existsSync(path.join(root, "src/components/global/C_RightToolbar"))).toBe(false);
    expect(fs.existsSync(path.join(root, "src/components/global/C_SvgIcon"))).toBe(false);

    const second = planComponents({ projectRoot: root, all: true });
    expect(second.actions).toHaveLength(0);
    expect(second.conflicts).toHaveLength(0);
    expect(second.reusable).toHaveLength(7);
  });

  it("目标在预览后出现会使旧 planHash 失效且绝不覆盖", async () => {
    const root = makeProject();
    const preview = planComponents({ projectRoot: root, names: ["c_formModal"] });
    const sentinel = write(root, "src/components/local/c_formModal/index.vue", "custom");
    await expect(applyComponentPlan(preview, preview.planHash)).rejects.toThrow(/planHash 已失效/);
    expect(fs.readFileSync(sentinel, "utf8")).toBe("custom");
  });

  it("目录已有项目文件时只补齐缺失运行文件并保留项目实现", async () => {
    const root = makeProject();
    const existing = write(root, "src/components/global/C_TagStatus/config.ts", "export const project = true\n");
    const preview = planComponents({ projectRoot: root, names: ["C_TagStatus"] });
    expect(preview.conflicts).toHaveLength(0);
    expect(preview.actions[0].status).toBe("partial");
    expect(preview.actions[0].missingFiles).toEqual(["index.scss", "index.vue", "types.ts"]);

    await applyComponentPlan(preview, preview.planHash);
    expect(fs.readFileSync(existing, "utf8")).toBe("export const project = true\n");
    expect(fs.existsSync(path.join(root, "src/components/global/C_TagStatus/index.vue"))).toBe(true);

    const second = planComponents({ projectRoot: root, names: ["C_TagStatus"] });
    expect(second.reusable[0].status).toBe("customized");
    expect(componentIssues({ projectRoot: root, names: ["C_TagStatus"] }).issues[0].rule).toBe("C4");
  });

  it("项目已有或后续打磨的组件均优先复用且绝不覆盖", async () => {
    const projectOwnedRoot = makeProject();
    const projectOwnedFile = write(projectOwnedRoot, "src/components/local/c_formModal/index.vue", "custom");
    const projectOwned = planComponents({ projectRoot: projectOwnedRoot, names: ["c_formModal"] });
    expect(projectOwned.conflicts).toHaveLength(0);
    expect(projectOwned.reusable[0].status).toBe("project-owned");
    expect(componentIssues({ projectRoot: projectOwnedRoot, names: ["c_formModal"] }).issues[0].rule).toBe("C4");
    await applyComponentPlan(projectOwned, projectOwned.planHash);
    expect(fs.readFileSync(projectOwnedFile, "utf8")).toBe("custom");

    const customizedRoot = makeProject();
    const preview = planComponents({ projectRoot: customizedRoot, names: ["c_formModal"] });
    await applyComponentPlan(preview, preview.planHash);
    const customizedFile = path.join(customizedRoot, "src/components/local/c_formModal/index.vue");
    fs.appendFileSync(customizedFile, "\n<!-- custom -->\n");
    const customized = planComponents({ projectRoot: customizedRoot, names: ["c_formModal"] });
    expect(customized.conflicts).toHaveLength(0);
    expect(customized.reusable[0].status).toBe("customized");
    expect(componentIssues({ projectRoot: customizedRoot, names: ["c_formModal"] }).issues[0].rule).toBe("C4");
    await applyComponentPlan(customized, customized.planHash);
    expect(fs.readFileSync(customizedFile, "utf8")).toMatch(/custom/);
  });

  it("页面引用缺失组件时生成 C1，依赖缺失时生成 C2", () => {
    const missingRoot = makeProject();
    write(missingRoot, "src/views/demo/index.vue", '<script setup>import c from "@/components/local/c_formModal/index.vue"</script>');
    expect(componentIssues({ projectRoot: missingRoot }).issues[0].rule).toBe("C1");

    const dependencyRoot = makeProject();
    const pkgPath = path.join(dependencyRoot, "package.json");
    fs.writeFileSync(pkgPath, JSON.stringify({ dependencies: { vue: "3.2.0" } }));
    write(dependencyRoot, "src/views/demo/index.vue", '<template><c_formModal /></template>');
    const issue = componentIssues({ projectRoot: dependencyRoot }).issues[0];
    expect(issue.rule).toBe("C2");
    expect(issue.text).toMatch(/缺少依赖包/);
  });
});

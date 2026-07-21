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
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ dependencies: { vue: "3.2.0", "@jhlc/common-core": "3.1.0", ...dependencies } }),
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
      "C_Tree",
    ]);
    expect(catalog.components.every((item) => !item.files.includes("README.md"))).toBe(true);
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

  it("目标在预览后出现会使旧 planHash 失效且绝不覆盖", async () => {
    const root = makeProject();
    const preview = planComponents({ projectRoot: root, names: ["c_formModal"] });
    const sentinel = write(root, "src/components/local/c_formModal/index.vue", "custom");
    await expect(applyComponentPlan(preview, preview.planHash)).rejects.toThrow(/planHash 已失效/);
    expect(fs.readFileSync(sentinel, "utf8")).toBe("custom");
  });

  it("无锁组件和已修改组件均作为契约冲突阻断", async () => {
    const unmanagedRoot = makeProject();
    write(unmanagedRoot, "src/components/local/c_formModal/index.vue", "custom");
    const unmanaged = planComponents({ projectRoot: unmanagedRoot, names: ["c_formModal"] });
    expect(unmanaged.conflicts[0].status).toBe("unmanaged");
    await expect(applyComponentPlan(unmanaged, unmanaged.planHash)).rejects.toThrow(/组件冲突/);

    const modifiedRoot = makeProject();
    const preview = planComponents({ projectRoot: modifiedRoot, names: ["c_formModal"] });
    await applyComponentPlan(preview, preview.planHash);
    fs.appendFileSync(path.join(modifiedRoot, "src/components/local/c_formModal/index.vue"), "\n<!-- custom -->\n");
    const modified = planComponents({ projectRoot: modifiedRoot, names: ["c_formModal"] });
    expect(modified.conflicts[0].status).toBe("modified");
  });

  it("页面引用缺失组件时生成 C1，依赖缺失时生成 C2", () => {
    const missingRoot = makeProject();
    write(missingRoot, "src/views/demo/index.vue", '<script setup>import c from "@/components/local/c_formModal/index.vue"</script>');
    expect(componentIssues({ projectRoot: missingRoot }).issues[0].rule).toBe("C1");

    const dependencyRoot = makeProject({ "@jhlc/common-core": undefined });
    const pkgPath = path.join(dependencyRoot, "package.json");
    fs.writeFileSync(pkgPath, JSON.stringify({ dependencies: { vue: "3.2.0" } }));
    write(dependencyRoot, "src/views/demo/index.vue", '<template><c_formModal /></template>');
    const issue = componentIssues({ projectRoot: dependencyRoot }).issues[0];
    expect(issue.rule).toBe("C2");
    expect(issue.text).toMatch(/缺少依赖包/);
  });
});

"use strict";

/**
 * tests/validate.test.js - validate command end-to-end integration tests
 *
 * Closes the "dog food" gap: the AST/regex engines scan src/views, but the kit
 * repo has no src/views. These tests build a temp project and run the real CLI
 * binary end-to-end, covering regex checks (agGrid/cid/defineColumns/renderOps)
 * and AST checks (R3 el-table / R13 cyclomatic complexity), plus the compliant
 * path and the project-level exemption config.
 *
 * NOTE: assertions use ASCII-only patterns. The validate CLI prints Chinese
 * messages; we match on ASCII substrings guaranteed to appear alongside.
 */

import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "bin", "wl-skills.js");

// 全量并行回归时 Windows 进程启动会明显变慢，避免 5s 默认值造成假失败。
vi.setConfig({ testTimeout: 30000 });

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wl-validate-e2e-"));
}

function runValidate(cwd, extraArgs = []) {
  return spawnSync("node", [CLI, "validate", "src/views", ...extraArgs], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 30000,
  });
}

// A compliant list page: BaseTable + agGrid + cid + defineColumns + AbstractPageQueryHook
const COMPLIANT_INDEX =
  '<template>\n' +
  '  <BaseTable ref="tableRef" render-type="agGrid" cid="acme-ok" :data="list" :columns="columns" />\n' +
  '  <jh-pagination />\n' +
  '</template>\n' +
  '<script setup lang="ts">\n' +
  'import { tableRef, list, columns } from "./data";\n' +
  '</script>\n';
const COMPLIANT_DATA =
  'import { AbstractPageQueryHook } from "@jhlc/common-core";\n' +
  'import { defineColumns } from "@agile-team/wl-skills-ui/runtime";\n' +
  'const API_CONFIG = { list: "/acme/list" } as const;\n' +
  'export function createPage() {\n' +
  '  const Page = new (class extends AbstractPageQueryHook {\n' +
  '    constructor() { super({ url: { list: API_CONFIG.list } }) }\n' +
  '    columnsDef() { return defineColumns([{ label: "name", name: "name" }]) }\n' +
  '  })()\n' +
  '  return Page.create() as any\n' +
  '}\n' +
  'export const { tableRef, list, columns } = createPage()\n';

function writePage(root, relDir, indexVue, dataTs) {
  const dir = path.join(root, relDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.vue"), indexVue);
  if (dataTs !== undefined) fs.writeFileSync(path.join(dir, "data.ts"), dataTs);
  return dir;
}

describe("validate end-to-end integration", () => {
  it("普通模式 warn 不阻断，strict 模式仍阻断", () => {
    const root = makeProject();
    writePage(
      root,
      "src/views/acme/warn-only",
      "<template><div/></template><script setup lang=\"ts\"></script>",
      "export const value = 1;",
    );
    const normal = runValidate(root);
    expect(normal.status).toBe(0);
    expect(normal.stdout + normal.stderr).toMatch(/warn 不阻断/);
    const strict = runValidate(root, ["--strict"]);
    expect(strict.status).not.toBe(0);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("显式排除非页面入口，并运行集中定义语义校验脚本", () => {
    const root = makeProject();
    const pageDir = writePage(
      root,
      "src/views/acme/page",
      "<template><div/></template><script setup lang=\"ts\"></script>",
      [
        'import { taskDefinition as pageDefinition } from "@/views/acme/definitions";',
        "export { pageDefinition };",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(pageDir, "index.scss"), "");
    fs.writeFileSync(path.join(pageDir, "api.md"), "# API\n");
    fs.writeFileSync(path.join(pageDir, "page-spec.json"), JSON.stringify({
      page: "任务",
      features: { definitionSource: "src/views/acme/definitions" },
    }));
    writePage(
      root,
      "src/views/acme/style",
      "<template><span/></template><script setup lang=\"ts\"></script>",
    );
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(root, "scripts", "validate-definitions.js"), "process.exit(0);\n");
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
      scripts: { "validate:definitions": "node scripts/validate-definitions.js" },
    }));
    fs.writeFileSync(path.join(root, ".wl-skills-validate.json"), JSON.stringify({
      excludePagePaths: ["src/views/acme/style"],
      definitionValidators: [{
        source: "src/views/acme/definitions",
        script: "validate:definitions",
      }],
    }));

    const result = runValidate(root);
    const output = result.stdout + result.stderr;
    expect(result.status, output).toBe(0);
    expect(output).toMatch(/定义语义校验已通过/);
    expect(output).not.toMatch(/src\/views\/acme\/style/);
    expect(output).not.toMatch(/未解析到对应实现/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("compliant list page: no R3/R13 errors in output", () => {
    const root = makeProject();
    writePage(root, "src/views/acme/ok", COMPLIANT_INDEX, COMPLIANT_DATA);
    fs.mkdirSync(path.join(root, "mock"), { recursive: true });
    fs.writeFileSync(path.join(root, "mock", "_utils.ts"), "export const ok = () => 1\n");
    fs.writeFileSync(path.join(root, "mock", "acme.ts"), 'export default { "/dev-api/acme/list": {} }\n');

    const res = runValidate(root);
    const out = res.stdout + res.stderr;
    // Page was detected
    expect(out).toMatch(/src\/views\/acme\/ok/);
    // No R3 error (el-table replacement) and no R13 error (complexity)
    expect(out).not.toMatch(/el-table/);
    expect(out).not.toMatch(/big\(\)/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("R3: list page uses el-table without BaseTable -> reports error", () => {
    const root = makeProject();
    writePage(
      root,
      "src/views/acme/bad",
      '<template><el-table><el-table-column label="x" prop="x"/></el-table><jh-pagination/></template>\n' +
        '<script setup lang="ts">const list: any[] = []</script>\n',
    );
    const res = runValidate(root);
    const out = res.stdout + res.stderr;
    // R3 issue text mentions el-table and BaseTable
    expect(out).toMatch(/el-table/);
    expect(out).toMatch(/BaseTable/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("R13: high cyclomatic complexity function -> reports error", () => {
    const root = makeProject();
    // 12 nested ifs -> complexity 13 > 10
    const ifs = "if(1){".repeat(12) + "}".repeat(12);
    writePage(
      root,
      "src/views/acme/cmplx",
      '<template><BaseTable render-type="agGrid" cid="c" :data="[]" :columns="[]"/><jh-pagination/></template>\n' +
        '<script setup lang="ts">function big(){' + ifs + '}</script>\n',
    );
    const res = runValidate(root);
    const out = res.stdout + res.stderr;
    // R13 issue text includes the function name; fix box includes "R13"
    expect(out).toMatch(/big\(\)/);
    expect(out).toMatch(/R13/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("regex: BaseTable missing render-type + cid + defineColumns -> reports error", () => {
    const root = makeProject();
    writePage(
      root,
      "src/views/acme/regex",
      '<template><BaseTable :data="list" :columns="columns"/></template>\n' +
        '<script setup lang="ts">import { list, columns } from "./data"</script>\n',
      'const API_CONFIG = { list: "/acme/list" } as const;\n' +
        'export const list: any[] = [];\nexport const columns: any[] = [];\n',
    );
    const res = runValidate(root);
    const out = res.stdout + res.stderr;
    expect(out).toMatch(/render-type/);
    expect(out).toMatch(/cid/);
    expect(out).toMatch(/defineColumns/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("project-level exemption: R3 exempted for designer dir -> no el-table error", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, ".wl-skills-validate.json"),
      JSON.stringify({
        exemptions: [
          { paths: ["src/views/designer"], rules: ["R3"], reason: "form designer" },
        ],
      }),
    );
    writePage(
      root,
      "src/views/designer/p",
      '<template><el-table><el-table-column label="x" prop="x"/></el-table></template>\n' +
        '<script setup lang="ts"></script>\n',
    );
    const res = runValidate(root);
    const out = res.stdout + res.stderr;
    // R3 exempted: el-table should NOT appear in issue output (only in R3 message)
    expect(out).not.toMatch(/el-table/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("D1: api.md dictionary contract must be aggregated into module dicts.ts", () => {
    const root = makeProject();
    const moduleDir = path.join(root, "src", "views", "acme", "module");
    writePage(root, "src/views/acme/module/page", COMPLIANT_INDEX, COMPLIANT_DATA);
    const pageContract = {
      schemaVersion: 1,
      module: { code: "acme", name: "示例模块" },
      dictionaries: [{
        code: "status",
        name: "状态",
        order: { field: "STR_KEY", direction: "asc" },
        items: [{ value: "0", label: "停用" }],
        sources: [],
      }],
    };
    fs.writeFileSync(
      path.join(moduleDir, "dicts.ts"),
      `export const MODULE_DICTIONARIES = ${JSON.stringify({
        ...pageContract,
        dictionaries: [{
          ...pageContract.dictionaries[0],
          items: [{ value: "0", label: "错误名称" }],
          sources: ["page/api.md"],
        }],
      })} as const\n`,
    );
    fs.writeFileSync(
      path.join(moduleDir, "page", "api.md"),
      ["```dict-contract", JSON.stringify(pageContract), "```"].join("\n"),
    );
    const res = runValidate(root);
    const out = res.stdout + res.stderr;
    expect(out).toMatch(/dicts\.ts/);
    expect(out).toMatch(/value=0/);
    expect(res.status).not.toBe(0);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("D2: runtime dictionary reference must be registered in module contract", () => {
    const root = makeProject();
    const moduleDir = path.join(root, "src", "views", "acme", "module");
    writePage(
      root,
      "src/views/acme/module/page",
      COMPLIANT_INDEX,
      `${COMPLIANT_DATA}\nexport const status = { dictCode: "unknownStatus" };\n`,
    );
    const pageContract = {
      schemaVersion: 1,
      module: { code: "acme", name: "示例模块" },
      dictionaries: [{
        code: "knownStatus",
        name: "已知状态",
        order: { field: "STR_KEY", direction: "asc" },
        items: [{ value: "0", label: "停用" }],
        sources: [],
      }],
    };
    fs.writeFileSync(
      path.join(moduleDir, "dicts.ts"),
      `export const MODULE_DICTIONARIES = ${JSON.stringify({
        ...pageContract,
        dictionaries: [{
          ...pageContract.dictionaries[0],
          sources: ["page/api.md"],
        }],
      })} as const\n`,
    );
    fs.writeFileSync(
      path.join(moduleDir, "page", "api.md"),
      ["```dict-contract", JSON.stringify(pageContract), "```"].join("\n"),
    );
    const res = runValidate(root);
    const out = res.stdout + res.stderr;
    expect(res.status).not.toBe(0);
    expect(out).toMatch(/unknownStatus/);
    expect(out).toMatch(/D2/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("C1: page import of a catalog component must be materialized", () => {
    const root = makeProject();
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ dependencies: { vue: "3.2.0", "@jhlc/common-core": "3.1.0" } }),
    );
    const index = COMPLIANT_INDEX.replace(
      'import { tableRef, list, columns } from "./data";',
      'import { tableRef, list, columns } from "./data";\n' +
        'import c_formModal from "@/components/local/c_formModal/index.vue";',
    );
    writePage(root, "src/views/acme/component", index, COMPLIANT_DATA);
    const result = runValidate(root);
    const output = result.stdout + result.stderr;
    expect(result.status).not.toBe(0);
    expect(output).toMatch(/C1/);
    expect(output).toMatch(/component ensure/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

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

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "bin", "wl-skills.js");

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wl-validate-e2e-"));
}

function runValidate(cwd) {
  return spawnSync("node", [CLI, "validate", "src/views"], {
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
  'import { defineColumns } from "@agile-team/wk-skills-ui/runtime";\n' +
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
});

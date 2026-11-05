import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { resolveDictionaryValidationScope } = require("../lib/dictionary-validation-scope");
const roots = [];

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-dictionary-scope-"));
  roots.push(root);
  return root;
}

function source(root, file, content = "export const value = 1;\n") {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
  return absolute;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("dictionary validation scope", () => {
  it("normalizes Windows staged paths before finding the owning contract", () => {
    const root = project();
    const dictionary = source(root, "src/views/pm/dicts.ts");
    const page = source(root, "src/views/pm/page/data.ts");
    const result = resolveDictionaryValidationScope(root, "src/views", [dictionary],
      new Set(["src\\views\\pm\\page\\data.ts"]));
    expect(result.files).toEqual([dictionary]);
    expect(result.inputs).toContain(page);
  });

  it("keeps similarly prefixed sibling modules outside the staged scope", () => {
    const root = project();
    const dictionary = source(root, "src/views/pm/dicts.ts");
    const sibling = source(root, "src/views/pm-other/dicts.ts");
    source(root, "src/views/pm/page/data.ts");
    const result = resolveDictionaryValidationScope(root, "src/views", [dictionary, sibling],
      new Set(["src/views/pm/page/data.ts"]));
    expect(result.files).toEqual([dictionary]);
    expect(result.inputs).not.toContain(sibling);
  });

  it("keeps an empty staged set empty while an omitted set retains full validation", () => {
    const root = project();
    const dictionary = source(root, "src/views/pm/dicts.ts");
    const candidates = [dictionary];
    const staged = resolveDictionaryValidationScope(root, "src/views", candidates, new Set());
    expect(staged).toEqual({ files: [], explicit: false, changedApis: [], inputs: [] });
    expect(resolveDictionaryValidationScope(root, "src/views", candidates).files).toEqual(candidates);
  });

  it("ignores import syntax inside comments and string literals", () => {
    const root = project();
    const dictionary = source(root, "src/views/steelmaking/dicts.ts");
    const unrelated = source(root, "src/views/pm/dicts.ts");
    source(root, "src/views/steelmaking/page/data.ts", [
      '// import { MODULE_DICTIONARIES } from "@/views/pm/dicts";',
      '/* export * from "../../pm/dicts"; */',
      'export const example = \'import("@/views/pm/dicts")\';',
    ].join("\n"));
    const result = resolveDictionaryValidationScope(root, "src/views", [dictionary, unrelated],
      new Set(["src/views/steelmaking/page/data.ts"]));
    expect(result.files).toEqual([dictionary]);
    expect(result.inputs).not.toContain(unrelated);
  });

  it.each(["./dicts", "./dicts.ts"])("rejects %s resolving to an external file symlink before reading it", (specifier) => {
    const root = project();
    const outside = project();
    const external = source(outside, "dicts.ts", "export const MODULE_DICTIONARIES = {};\n");
    const page = source(root, "src/views/pm/page/data.ts",
      `import { MODULE_DICTIONARIES } from "${specifier}";\nexport const module = MODULE_DICTIONARIES;\n`);
    const link = path.join(path.dirname(page), "dicts.ts");
    fs.symlinkSync(external, link, "file");
    const read = vi.spyOn(fs, "readFileSync");
    expect(() => resolveDictionaryValidationScope(root, "src/views", [],
      new Set(["src/views/pm/page/data.ts"]))).toThrow(/路径越界/);
    const reads = read.mock.calls.map(([file]) => String(file));
    expect(reads).not.toContain(link);
    expect(reads).not.toContain(external);
  });

  it("includes ordinary-script imports when a Vue component also has script setup", () => {
    const root = project();
    const dictionary = source(root, "src/views/steelmaking/dicts.ts");
    const imported = source(root, "src/views/pm/dicts.ts");
    source(root, "src/views/steelmaking/page/index.vue", [
      '<script lang="ts">',
      'import { MODULE_DICTIONARIES } from "@/views/pm/dicts";',
      'export default { name: MODULE_DICTIONARIES.module.code };',
      '</script>',
      '<script setup lang="ts">',
      'import { ref } from "vue";',
      'const value = ref(1);',
      '</script>',
      '<template><span>{{ value }}</span></template>',
    ].join("\n"));
    const result = resolveDictionaryValidationScope(root, "src/views/steelmaking", [dictionary],
      new Set(["src/views/steelmaking/page/index.vue"]));
    expect(result.files).toEqual([imported, dictionary].sort());
    expect(result.explicit).toBe(true);
    expect(result.inputs).toContain(imported);
  });

  it.each([
    'export { MODULE_DICTIONARIES } from "@/views/pm/dicts";',
    'export * from "@/views/pm/dicts";',
  ])("follows an import and static re-export chain via %s", (reexport) => {
    const root = project();
    const dictionary = source(root, "src/views/steelmaking/dicts.ts");
    const imported = source(root, "src/views/pm/dicts.ts");
    const bridge = source(root, "src/views/steelmaking/bridge.ts", reexport);
    source(root, "src/views/steelmaking/page/data.ts",
      'import { MODULE_DICTIONARIES } from "../bridge";\nexport const module = MODULE_DICTIONARIES;\n');
    const result = resolveDictionaryValidationScope(root, "src/views/steelmaking", [dictionary],
      new Set(["src/views/steelmaking/page/data.ts"]));
    expect(result.files).toEqual([imported, dictionary].sort());
    expect(result.explicit).toBe(true);
    expect(result.inputs).toContain(bridge);
    expect(result.inputs).toContain(imported);
  });
});

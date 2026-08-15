import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const codegenRoot = path.resolve(
  __dirname,
  "../files/.wl-skills/skills/core/page-codegen",
);

function markdownFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) return markdownFiles(file);
    return entry.name.endsWith(".md") ? [file] : [];
  });
}

describe("page-codegen 按钮尺寸契约", () => {
  it("所有直接按钮和 BaseToolbar 示例都显式声明 size", () => {
    const missing = [];
    for (const file of markdownFiles(codegenRoot)) {
      const source = fs.readFileSync(file, "utf8");
      for (const tagName of ["el-button", "ElButton", "BaseToolbar"]) {
        const pattern = new RegExp(`<${tagName}\\b[\\s\\S]*?>`, "g");
        for (const match of source.matchAll(pattern)) {
          if (/(?:^|\s)(?:size|:size|v-bind:size)\s*=/.test(match[0])) continue;
          const line = source.slice(0, match.index).split("\n").length;
          missing.push(`${path.relative(codegenRoot, file)}:${line} ${match[0]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

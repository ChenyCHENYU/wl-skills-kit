import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendStrings, removeStrings } = require("../lib/shared-jsonc-array.cjs");
const jsonc = require("../lib/shared-jsonc.cjs");

describe("JSONC string-array contributions", () => {
  it("restores exact bytes in nested arrays containing escaped delimiters, duplicate strings and comments", () => {
    const path = ["nested", "deep", "instructions"];
    const original = '{\r\n "nested": {"deep": {"instructions": ["strange ] \\\" /* string */", "duplicate", "duplicate", // keep\r\n]}},\r\n}\r\n';
    const owned = 'new path ] " // string';
    const added = appendStrings(original, path, [owned]);
    expect(jsonc.getJsoncValue(added, path)).toEqual(['strange ] " /* string */', "duplicate", "duplicate", owned]);
    expect(removeStrings(added, path, [owned])).toEqual({ content: original, retained: [] });
  });

  it("preserves ambiguous duplicate contributions and restores comment-only empty arrays", () => {
    const original = '{"instructions":[/* project note */]}';
    const added = appendStrings(original, ["instructions"], ["owned"]);
    expect(removeStrings(added, ["instructions"], ["owned"]).content).toBe(original);
    const duplicated = '{"instructions":["owned", /* user duplicate */ "owned"]}';
    expect(removeStrings(duplicated, ["instructions"], ["owned"])).toEqual({ content: duplicated, retained: ["owned"] });
  });
});

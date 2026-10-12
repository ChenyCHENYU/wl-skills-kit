import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
const { COMMAND_CATALOG } = require("../lib/command-catalog");
const { TOOLS } = require("../mcp/registry");
const { protocol } = require("../lib/protocol-cli");

describe("public command inventory", () => {
  it("has precisely the original dispatcher's commands, including compatibility aliases", () => {
    const source = fs.readFileSync(path.join(import.meta.dirname, "../bin/wl-skills.js"), "utf8");
    const dispatch = source.slice(source.lastIndexOf("switch (command)"));
    const names = [...dispatch.matchAll(/case "([\w-]+)":/g)].map((m) => m[1]);
    expect(COMMAND_CATALOG.map((c) => c.name).sort()).toEqual(names.sort());
    expect(new Set(names).size).toBe(COMMAND_CATALOG.length);
    expect(source).toContain("new Set(COMMAND_CATALOG.map");
  });
  it("describe preserves the complete metadata and true snapshot side effect", () => {
    expect(protocol.describe().inventory.commands).toEqual(COMMAND_CATALOG);
    expect(COMMAND_CATALOG.find((c) => c.name === "snapshot").sideEffects).toBe("无写入，结果输出到 stdout");
    expect(COMMAND_CATALOG.find((c) => c.name === "mock-clean").sideEffects).toContain("删除");
    expect(COMMAND_CATALOG.find((c) => c.name === "contract").args).toContain("compare");
  });
  it("MCP metadata derives actual parameter schemas and annotations without a second list", () => {
    const advertised = protocol.describe().inventory.mcpTools;
    expect(advertised.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
    TOOLS.forEach((tool, i) => {
      expect(advertised[i].inputSchema).toEqual(tool.inputSchema);
      expect(advertised[i].annotations).toEqual(tool.annotations || {});
      expect(advertised[i].sideEffects).toBe(tool._meta.wl.sideEffects);
      expect(advertised[i].recordsOwnReceipt).toBe(tool._meta.wl.recordsOwnReceipt);
    });
    expect(TOOLS.find((t) => t.name === "wls_validate_page").annotations.readOnlyHint).toBe(false);
    expect(TOOLS.find((t) => t.name === "wls_validate_page")._meta.wl.businessReadOnly).toBe(true);
    expect(TOOLS.find((t) => t.name === "wls_route").annotations.readOnlyHint).toBe(true);
  });
});

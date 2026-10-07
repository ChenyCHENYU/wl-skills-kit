import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);
// Resolve through our own Vitest dependency; no sibling repository or production Vite dependency.
const vitestRequire = createRequire(require.resolve("vitest/package.json"));
const { resolveConfig } = await import(pathToFileURL(vitestRequire.resolve("vite")).href);
const wlSkillsPlugin = require("../lib/vite-plugin-wl-skills.js");
const astRules = require("../lib/ast-rules.js");

const fixtures = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  fixtures.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function logger() {
  return { info: vi.fn(), warn: vi.fn(), warnOnce: vi.fn(), error: vi.fn(), clearScreen: vi.fn(), hasErrorLogged: () => false, hasWarned: false };
}

describe("Vite actually invokes the kit guard", () => {
  it("records the actual AST executor's Vue/data/style scope through a real Vite configuration", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-vite-ast-"));
    fixtures.push(root);
    const page = path.join(root, "src/views/Demo");
    fs.mkdirSync(page, { recursive: true });
    fs.writeFileSync(path.join(page, "index.vue"), "<template><div/></template>");
    fs.writeFileSync(path.join(page, "data.ts"), "export const title = 'Demo';");
    fs.writeFileSync(path.join(page, "index.scss"), ".demo { display: block; }");
    await resolveConfig({ root, configFile: false, customLogger: logger(), plugins: [wlSkillsPlugin({ runId: "real-vite-ast" })] }, "serve");
    const { core, taskOptions } = require("../lib/task-integration");
    const status = core.readStatus(taskOptions(root, { runId: "real-vite-ast" }));
    expect(status.tools[0].summary.pages).toBe(1);
    expect(status.tools[0].executionStatus).toBe("completed");
    expect(status.tools[0].checks.find((check) => check.id === "ast").status).toMatch(/^(passed|failed)$/);
    expect(status.tools[0].checkedFiles.map((file) => file.path).sort()).toEqual(["src/views/Demo/data.ts", "src/views/Demo/index.scss", "src/views/Demo/index.vue"]);
  });
  it("debounces actual hot-update callbacks to the owning page scope", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kit-vite-watch-"));
    fixtures.push(root);
    const page = path.join(root, "src/views/Demo");
    fs.mkdirSync(page, { recursive: true });
    fs.writeFileSync(path.join(page, "index.vue"), "<template><div/></template>");
    fs.writeFileSync(path.join(page, "data.ts"), "export const title = 'Demo';");
    vi.spyOn(astRules, "hasAstAvailable").mockReturnValue(true);
    const scan = vi.spyOn(astRules, "runAstRules").mockReturnValue({ astAvailable: true, pages: 1, issues: [] });
    const plugin = wlSkillsPlugin({ persist: false });
    await resolveConfig({ root, configFile: false, customLogger: logger(), plugins: [plugin] }, "serve");
    vi.useFakeTimers();
    plugin.handleHotUpdate({ file: path.join(page, "index.vue") });
    plugin.handleHotUpdate({ file: path.join(page, "data.ts") });
    await vi.runAllTimersAsync();
    expect(scan).toHaveBeenCalledTimes(2);
    expect(scan.mock.calls[1][1]).toBe("src/views/Demo");
    plugin.closeBundle();
  });
  it.each(["serve", "build"])("executes and reports a successful AST check in %s", async (command) => {
    vi.spyOn(astRules, "hasAstAvailable").mockReturnValue(true);
    const scan = vi.spyOn(astRules, "runAstRules").mockReturnValue({ astAvailable: true, pages: 1, cacheHits: 0, cacheMisses: 1, issues: [] });
    const log = logger();
    const config = await resolveConfig({ configFile: false, root: process.cwd(), customLogger: log, plugins: [wlSkillsPlugin({ persist: false })] }, command);
    expect(config.plugins.some((plugin) => plugin.name === "wl-skills-guard")).toBe(true);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining("AST 检查通过"));
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining("完整规范与类型检查尚未验证"));
  });

  it("explicitly reports unavailable parsing instead of claiming success", async () => {
    vi.spyOn(astRules, "hasAstAvailable").mockReturnValue(false);
    const scan = vi.spyOn(astRules, "runAstRules");
    const log = logger();
    await resolveConfig({ configFile: false, customLogger: log, plugins: [wlSkillsPlugin({ persist: false })] }, "serve");
    expect(scan).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("检查未执行"));
    expect(log.info).not.toHaveBeenCalled();
  });

  it("does not report zero applicable pages as passing", async () => {
    vi.spyOn(astRules, "hasAstAvailable").mockReturnValue(true);
    vi.spyOn(astRules, "runAstRules").mockReturnValue({ astAvailable: true, pages: 0, issues: [] });
    const log = logger();
    await resolveConfig({ configFile: false, customLogger: log, plugins: [wlSkillsPlugin({ persist: false })] }, "build");
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("未发现适用页面"));
    expect(log.info).not.toHaveBeenCalled();
  });

  it("blocks an actual Vite build configuration with AST errors", async () => {
    vi.spyOn(astRules, "hasAstAvailable").mockReturnValue(true);
    vi.spyOn(astRules, "runAstRules").mockReturnValue({ astAvailable: true, pages: 1, issues: [{ level: "error", rule: "K1", dir: "src/views/Test", text: "fixture violation" }] });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(resolveConfig({ configFile: false, customLogger: logger(), plugins: [wlSkillsPlugin({ persist: false })] }, "build")).rejects.toThrow("构建已中断");
  });
});

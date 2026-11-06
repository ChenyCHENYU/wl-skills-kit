import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveHostProfile, gatewayInstallPaths } = require("../kit-internal/conformance/support/host-profiles.cjs");
const packageName = "@agile-team/wl-skills-kit";

describe("explicit host discovery conventions", () => {
  it.each(["glm", "GLM-4.7", "gpt", "GPT-6", "chatgpt", "vscode", "VS Code", "unknown", ""])("never assumes AGENTS.md support for %s", (host) => {
    const profile = resolveHostProfile(host, packageName);
    expect(profile.status).toBe("needs-host");
    expect(profile.gatewayPaths).toEqual([]);
    expect(profile.entryFiles).toEqual([]);
    expect(profile.message).toMatch(/宿主|插件/);
  });

  it.each([
    ["codex-vscode", "codex", ".agents"],
    ["openai.chatgpt", "codex", ".agents"],
    ["ZCode", "zcode", ".zcode"],
    ["saoudrizwan.claude-dev", "cline", ".cline"],
    ["rooveterinaryinc.roo-cline", "roo", ".roo"],
    ["kilocode.kilo-code", "kilo", ".kilo"],
    ["claude-code", "claude", ".claude"],
  ])("maps the actual plugin %s without changing its discovery directory", (host, hostId, root) => {
    const profile = resolveHostProfile(host, packageName);
    expect(profile).toMatchObject({ hostId, status: "known", evidenceLevel: "static-host-conventions" });
    expect(profile.gatewayPaths[0]).toBe(`${root}/skills/wl-skills-kit/SKILL.md`);
    expect(profile.activation.join(" ")).toContain("wl-skills-kit");
    expect(profile.docs.length).toBeGreaterThan(0);
  });

  it("treats a typo as unsupported and requires a safe WL package identity", () => {
    expect(resolveHostProfile("cluade", packageName).status).toBe("unsupported");
    expect(() => resolveHostProfile("codex", "../../outside")).toThrow(/package name/);
    expect(() => gatewayInstallPaths("@other/wl-skills-kit")).toThrow(/package name/);
  });

  it("keeps package paths isolated and diagnostics independent of caller mutations", () => {
    const first = resolveHostProfile("zcode", packageName);
    first.gatewayPaths.push("wrong");
    expect(resolveHostProfile("zcode", "@agile-team/wl-skills-bd").gatewayPaths).toEqual([
      ".zcode/skills/wl-skills-bd/SKILL.md", ".agents/skills/wl-skills-bd/SKILL.md",
    ]);
    expect(resolveHostProfile("zcode", packageName).gatewayPaths).not.toContain("wrong");
    expect(gatewayInstallPaths(packageName)).not.toContain(".zcode/skills/wl-skills-kit/SKILL.md");
    expect(gatewayInstallPaths(packageName)).toContain(".agents/skills/wl-skills-kit/SKILL.md");
  });

  it("uses current Kilo primary paths without inventing unverified legacy skill directories", () => {
    const kilo = resolveHostProfile("kilocode.kilo-code", packageName);
    expect(kilo.gatewayPaths[0]).toBe(".kilo/skills/wl-skills-kit/SKILL.md");
    expect(kilo.gatewayPaths).not.toContain(".kilocode/skills/wl-skills-kit/SKILL.md");
    expect(gatewayInstallPaths(packageName)).not.toContain(".kilocode/skills/wl-skills-kit/SKILL.md");
  });
});

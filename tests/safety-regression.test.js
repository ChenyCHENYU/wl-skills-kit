import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "wl-skills.js");
const roots = [];

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-safety-"));
  roots.push(root);
  return root;
}

function run(root, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", timeout: 30000 });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    expect(root.startsWith(path.join(os.tmpdir(), "wl-kit-safety-"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("CLI 写删路径边界", () => {
  it("mock-clean 拒绝上级目录，正常域仅删除域内文件", () => {
    const root = project();
    fs.mkdirSync(path.join(root, "mock", "sale"), { recursive: true });
    fs.writeFileSync(path.join(root, "sentinel.txt"), "keep");
    fs.writeFileSync(path.join(root, "mock", "sale", "item.ts"), "mock");
    const escaped = run(root, "mock-clean", "--domain", "..");
    expect(escaped.status).not.toBe(0);
    expect(fs.readFileSync(path.join(root, "sentinel.txt"), "utf8")).toBe("keep");
    expect(run(root, "mock-clean", "--domain", "--all").status).not.toBe(0);
    const valid = run(root, "--domain", "sale", "mock-clean");
    expect(valid.status).toBe(0);
    expect(fs.existsSync(path.join(root, "mock", "sale"))).toBe(false);
    expect(fs.existsSync(path.join(root, "sentinel.txt"))).toBe(true);
  });

  it("mock-clean 拒绝指向项目外的 mock 链接", () => {
    const root = project();
    const outside = project();
    const link = path.join(root, "mock");
    fs.writeFileSync(path.join(outside, "sentinel.txt"), "keep");
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    try {
      expect(run(root, "mock-clean", "--all").status).not.toBe(0);
      expect(fs.readFileSync(path.join(outside, "sentinel.txt"), "utf8")).toBe("keep");
    } finally {
      fs.unlinkSync(link);
    }
  });

  it("clean 拒绝越界 manifest，并保留本地改过的受管文件", () => {
    const root = project();
    const manifestPath = path.join(root, ".wl-skills-manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({ version: "2.22.0", files: { "../outside.txt": "x" } }));
    expect(run(root, "clean").status).not.toBe(0);
    fs.writeFileSync(path.join(root, "managed.txt"), "customized");
    const originalHash = crypto.createHash("md5").update("original").digest("hex");
    fs.writeFileSync(manifestPath, JSON.stringify({ version: "2.22.0", files: { "managed.txt": originalHash } }));
    const cleaned = run(root, "clean");
    expect(cleaned.status).toBe(0);
    expect(fs.readFileSync(path.join(root, "managed.txt"), "utf8")).toBe("customized");
    expect(cleaned.stdout).toMatch(/保留本地修改/);
    expect(JSON.parse(fs.readFileSync(manifestPath, "utf8")).files).toHaveProperty("managed.txt");
    expect(run(root, "clean", "--force").status).toBe(0);
    expect(fs.existsSync(path.join(root, "managed.txt"))).toBe(false);
  });

  it("scenario render 拒绝项目外输出且覆盖已有产物需显式 force", () => {
    const root = project();
    const scenario = {
      kind: "wl-scenario", schemaVersion: 1, templateId: "universal.list",
      domain: "sale", pattern: "list", renderTrack: "codegen",
      page: "客户档案", pageId: "CUST_SAFE_001", dir: "src/views/sale/customer",
      serviceShort: "sale", resourceName: "customer", tableCid: "cust-safe01",
      query: [{ name: "companyName", label: "公司名称", type: "input" }],
      columns: [{ name: "companyName", label: "公司名称", minWidth: 150 }],
      toolbar: [{ label: "新增", color: "primary" }],
      operations: [{ label: "编辑", action: "edit" }, { label: "删除", action: "del" }],
      formSections: [{ name: "base", label: "基本信息", fields: [{ name: "companyName", label: "公司名称", required: true }] }],
      features: {},
    };
    fs.writeFileSync(path.join(root, "scenario.json"), JSON.stringify(scenario));
    const escaped = run(root, "scenario", "render", "--input", "scenario.json", "--output", "..", "--confirm");
    expect(escaped.status).not.toBe(0);
    expect(escaped.stderr).toMatch(/路径越界/);

    const args = ["scenario", "render", "--input", "scenario.json", "--confirm"];
    expect(run(root, ...args).status).toBe(0);
    const dataPath = path.join(root, "src", "views", "sale", "customer", "data.ts");
    fs.writeFileSync(dataPath, "local change");
    expect(run(root, ...args).status).not.toBe(0);
    expect(fs.readFileSync(dataPath, "utf8")).toBe("local change");
    expect(run(root, ...args, "--force").status).toBe(0);
    expect(fs.readdirSync(path.dirname(dataPath)).some((name) => name.startsWith("data.ts.bak."))).toBe(true);
  });
});

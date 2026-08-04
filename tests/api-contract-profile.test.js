"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import apiContract from "../lib/api-contract.js";

const { DEFAULT_PROFILE, buildStandaloneContract, loadDeliveryProfile, validateApiContract } = apiContract;

function customProfile() {
  const profile = structuredClone(DEFAULT_PROFILE);
  profile.profileId = "project-post20";
  profile.transport.operations.page.method = "GET";
  profile.transport.pagination.defaultSize = 20;
  profile.transport.pagination.maxSize = 1000;
  return profile;
}

describe("项目级 Delivery Profile", () => {
  it("显式 GET/20/1000 作为项目事实源，不因偏离 POST/10/200 基线而阻断", () => {
    const profile = customProfile();
    const value = buildStandaloneContract({
      contractId: "demo-resource",
      service: "demo",
      resource: "demoResource",
      module: "demo",
      permissionPrefix: "demo_resource",
      profile,
    });
    value.completion.contractStatus = "confirmed";
    const result = validateApiContract(value, { profile, strict: true });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((item) => item.code === "AC105")).toBe(true);
    expect(value.operations.page.method).toBe("GET");
    expect(value.transport.pagination.defaultSize).toBe(20);
    expect(value.transport.pagination.maxSize).toBe(1000);

    value.transport.pagination.defaultSize = 10;
    expect(validateApiContract(value, { profile }).errors.some((item) => item.code === "AC008")).toBe(true);
  });

  it("优先读取项目 Profile，无项目配置时回退包基线", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wl-kit-profile-"));
    try {
      const profile = customProfile();
      const dir = path.join(root, ".wl-skills", "contracts");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "wl-delivery-profile.v1.json"), JSON.stringify(profile), "utf8");
      const loaded = loadDeliveryProfile(root);
      expect(loaded.errors).toEqual([]);
      expect(loaded.profile.profileId).toBe(profile.profileId);
      expect(loaded.warnings.some((item) => item.code === "AC105")).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

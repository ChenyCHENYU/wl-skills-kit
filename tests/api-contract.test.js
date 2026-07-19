"use strict";

import { describe, it, expect } from "vitest";
import apiContract from "../lib/api-contract.js";

const {
  DEFAULT_PROFILE,
  buildStandaloneContract,
  compareApiContracts,
  renderApiMarkdown,
  validateApiContract,
} = apiContract;

function contract() {
  return buildStandaloneContract({
    contractId: "mdm-task",
    service: "mdm",
    resource: "mdmTask",
    module: "task",
    permissionPrefix: "mdm_task",
    entity: "MdmTask",
    description: "任务",
  });
}

describe("独立 WL API contract", () => {
  it("无需 design/bd 即可建立符合默认 profile 的契约", () => {
    const value = contract();
    expect(value.source.mode).toBe("requirements");
    expect(value.source.profile).toBe(DEFAULT_PROFILE.profileId);
    expect(value.operations.page.externalPath).toBe("/mdm/mdmTask/queryPage");
    expect(value.operations.detail.externalPath).toBe("/mdm/mdmTask/getById/{id}");
    expect(value.operations.update.method).toBe("PUT");
    expect(value.operations.remove.method).toBe("DELETE");
    expect(value.completion.skeletonOperations).toEqual([]);
    expect(validateApiContract(value).ok).toBe(true);
  });

  it("严格模式要求契约确认且无未决问题", () => {
    const value = contract();
    expect(validateApiContract(value, { strict: true }).errors.some((item) => item.code === "AC032")).toBe(true);
    value.completion.contractStatus = "confirmed";
    expect(validateApiContract(value, { strict: true }).ok).toBe(true);
    value.completion.openQuestions.push("删除是否允许批量");
    expect(validateApiContract(value, { strict: true }).errors.some((item) => item.code === "AC033")).toBe(true);
  });

  it("严格比较 method/path/model 等完整契约面", () => {
    const left = contract();
    const right = JSON.parse(JSON.stringify(left));
    expect(compareApiContracts(left, right).ok).toBe(true);
    right.operations.update.method = "POST";
    const result = compareApiContracts(left, right);
    expect(result.ok).toBe(false);
    expect(result.errors.some((item) => item.location === "operations")).toBe(true);
    const resourceDrift = contract();
    resourceDrift.resource.module = "other";
    expect(compareApiContracts(left, resourceDrift).errors.some((item) => item.location === "resource.module")).toBe(true);
    const configDrift = contract();
    configDrift.frontend.apiConfig.update = "/wrong/update";
    expect(compareApiContracts(left, configDrift).errors.some((item) => item.location === "frontend.apiConfig")).toBe(true);
  });

  it("稳定 ID 缺失不阻断独立严格闭环，但双方值冲突时阻断", () => {
    const left = contract();
    const right = contract();
    left.resource.externalId = "ENTITY_TASK";
    const optional = compareApiContracts(left, right);
    expect(optional.ok).toBe(true);
    expect(optional.warnings.some((item) => item.code === "AC104")).toBe(true);
    left.completion.contractStatus = "confirmed";
    right.completion.contractStatus = "confirmed";
    expect(compareApiContracts(left, right, { strict: true }).ok).toBe(true);
    right.resource.externalId = "ENTITY_OTHER";
    expect(compareApiContracts(left, right).errors.some((item) => item.code === "AC201")).toBe(true);
  });

  it("旧 kind 仅非严格兼容，缺 skeletonOperations 直接判为不完整契约", () => {
    const legacy = contract();
    legacy.kind = "wl-backend-collaboration-contract";
    expect(validateApiContract(legacy).warnings.some((item) => item.code === "AC103")).toBe(true);
    expect(validateApiContract(legacy, { strict: true }).ok).toBe(false);
    delete legacy.completion.skeletonOperations;
    expect(validateApiContract(legacy).errors.some((item) => item.code === "AC031")).toBe(true);
  });

  it("Markdown 保留完整机器契约和 path 参数规则", () => {
    const output = renderApiMarkdown(contract());
    expect(output).toMatch(/```wl-api-contract/);
    expect(output).toMatch(/resolveApiPath/);
    expect(output).toMatch(/putAction/);
  });
});

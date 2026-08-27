"use strict";

/**
 * tests/scenario-benchmark.test.js — 性能/算力量化的机器锁定
 *
 * 阈值原则：宽松到 CI 波动不误报，紧到量级承诺可守：
 *   - render 单页 avg < 50ms（实测 0.4~0.6ms，两个数量级余量）
 *   - 批量 20 页 < 2s（实测 8ms）
 *   - 确定性必须字节级一致（硬承诺，无余量）
 *   - AI 路径每页 token（输入上下文+输出）> 10k，scenario render 恒为 0
 */

import { describe, it, expect } from "vitest";
import {
  buildListScenario,
  buildMasterDetailScenario,
  estimateTokens,
  runBenchmark,
} from "../scripts/benchmark-scenario.js";

describe("确定性渲染基准", () => {
  const report = runBenchmark();

  it("render 单页 avg < 50ms（实测亚毫秒，承诺两个数量级余量）", () => {
    expect(report.listSmall.render.avg).toBeLessThan(50);
    expect(report.listLarge.render.avg).toBeLessThan(50);
    expect(report.masterDetail.render.avg).toBeLessThan(50);
  });

  it("extract / verify 同样保持毫秒级", () => {
    expect(report.listLarge.extract.avg).toBeLessThan(100);
    expect(report.listLarge.verify.avg).toBeLessThan(100);
  });

  it("同一 JSON 两次编译字节级一致（零漂移硬承诺）", () => {
    expect(report.listSmall.deterministic).toBe(true);
    expect(report.listLarge.deterministic).toBe(true);
    expect(report.masterDetail.deterministic).toBe(true);
  });

  it("批量 20 页 < 2s", () => {
    expect(report.batch.avg).toBeLessThan(2000);
    expect(report.batch.pages).toBe(20);
  });

  it("AI 路径每页 token 量级（输入+输出 > 10k）而 scenario render 恒为 0", () => {
    expect(report.aiContextList).toBeGreaterThan(10000);
    expect(report.aiContextMd).toBeGreaterThan(10000);
    expect(report.listLarge.output.tokens).toBeGreaterThan(1500);
    expect(report.listLarge.renderTokens).toBe(0);
    expect(report.masterDetail.renderTokens).toBe(0);
  });

  it("token 估算方法自检：ASCII/4 + CJK×1.2", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("中文字")).toBe(Math.ceil(3 * 1.2));
  });

  it("基准场景贴近真实页面规模", () => {
    const doc = buildListScenario({});
    expect(doc.columns).toHaveLength(20);
    expect(doc.query).toHaveLength(9);
    expect(doc.toolbar).toHaveLength(16);
    expect(buildMasterDetailScenario().subTables[0].columns).toHaveLength(16);
  });
});

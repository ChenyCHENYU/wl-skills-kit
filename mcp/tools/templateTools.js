"use strict";

const path = require("path");
const {
  buildPageBlueprint,
  readPageBlueprint,
  summarizeBlueprint,
  validatePageBlueprint,
  writePageBlueprint,
} = require("../../lib/page-blueprint");
const { buildProjectSnapshot } = require("../../lib/project-snapshot");
const {
  searchBlueprints,
  diffBlueprintFiles,
} = require("../../lib/blueprint-registry");
const { auditPageBlueprint } = require("../../lib/blueprint-audit");
const { buildPageMirror, inspectPageMirror, writePageMirror } = require("../../lib/page-mirror");

function projectRoot() {
  return process.env.WL_PROJECT_ROOT
    ? path.resolve(process.env.WL_PROJECT_ROOT)
    : process.cwd();
}

function toText(summary, extra = "") {
  const lines = [
    "✅ 页面蓝图提取完成（仅结构化 JSON，无业务代码）",
    "",
    `- blueprintId：${summary.blueprintId}`,
    `- domain/scene：${summary.domain}/${summary.scene}`,
    `- mode：${summary.mode}`,
    `- 槽位：query=${summary.querySlots} / columns=${summary.columnSlots} / toolbar=${summary.toolbarSlots} / operations=${summary.operationSlots}`,
    `- 依赖：API=${summary.apiOperations} / dict=${summary.dictionarySlots}`,
    `- 质量分：${summary.qualityScore}`,
  ];
  if (extra) lines.push(`- ${extra}`);
  return lines.join("\n");
}

function handleTemplateExtract(args = {}) {
  const root = projectRoot();
  if (args.artifact === "mirror") return handleMirrorExtract(root, args);
  const blueprint = buildPageBlueprint(root, args.path || "src/views", {
    domain: args.domain,
    scene: args.scene,
  });
  const summary = summarizeBlueprint(blueprint);
  const outputPath = args.outputPath || "";
  if (args.confirmWrite === true) {
    const written = writePageBlueprint(root, blueprint, outputPath);
    return {
      text: toText(summary, `已写入：${written}`),
      structuredContent: { ok: true, state: "written", summary, blueprint, outputPath: written },
    };
  }
  return {
    text: toText(summary, "预览模式：传 confirmWrite=true 才写入蓝图"),
    structuredContent: { ok: true, state: "preview", summary, blueprint },
  };
}

function handleMirrorExtract(root, args) {
  const mirror = buildPageMirror(root, args.path, { bundle: args.bundle === true, domain: args.domain });
  const outputPath = args.confirmWrite === true ? writePageMirror(root, mirror, args.outputPath) : null;
  return {
    text: `✅ 从真实实现提取领域镜像：${mirror.page}${outputPath ? `，已写入 ${outputPath}` : "，预览不写入"}`,
    structuredContent: { ok: true, state: outputPath ? "written" : "preview", mirror, ...(outputPath ? { outputPath } : {}) },
  };
}

function handleTemplateValidate(args = {}) {
  const root = projectRoot();
  const blueprint = readPageBlueprint(root, args.inputPath || "");
  if (blueprint.role === "mirror") {
    const errors = inspectPageMirror(root, blueprint);
    return {
      text: errors.length ? `镜像需要重新提取：${errors.join("；")}` : "✅ 镜像源码证据与实际实现一致",
      structuredContent: { ok: !errors.length, state: errors.length ? "stale" : "valid", errors },
    };
  }
  const errors = validatePageBlueprint(blueprint);
  const summary = summarizeBlueprint(blueprint);
  return {
    text: errors.length
      ? `❌ 页面蓝图校验失败：\n${errors.map((error) => `- ${error}`).join("\n")}`
      : toText(summary, "蓝图结构校验通过"),
    structuredContent: { ok: errors.length === 0, state: errors.length ? "invalid" : "valid", summary, errors },
    isError: errors.length > 0,
  };
}

function handleProjectSnapshot(args = {}) {
  const snapshot = buildProjectSnapshot(projectRoot(), {
    scanPath: args.scanPath,
    limit: args.limit,
  });
  return {
    text: `✅ 项目结构快照完成：${snapshot.pageCount} 个页面，成功 ${snapshot.returnedCount - snapshot.failedCount}，失败 ${snapshot.failedCount}${snapshot.truncated ? "（结果已截断）" : ""}；AI 可直接消费 structuredContent，无需逐页读取源码。`,
    structuredContent: {
      ok: true,
      state: "snapshot",
      count: snapshot.pageCount,
      failedCount: snapshot.failedCount,
      snapshot,
    },
  };
}

function handleTemplateSearch(args = {}) {
  const result = searchBlueprints(projectRoot(), args);
  return {
    text: `✅ Blueprint 检索完成：命中 ${result.total} 个，返回 ${result.returned} 个${result.truncated ? "（结果已截断）" : ""}；默认仅返回摘要。`,
    structuredContent: { ok: true, state: "search", ...result },
  };
}

function handleTemplateDiff(args = {}) {
  const result = diffBlueprintFiles(projectRoot(), args.leftPath || "", args.rightPath || "");
  return {
    text: result.equal
      ? "✅ 两份 Blueprint 结构一致（已忽略来源 hash、fingerprint 和质量元数据）"
      : `⚠️ Blueprint 差异比较完成：${result.changedCount} 处结构变化`,
    structuredContent: { ok: true, state: "diff", ...result },
  };
}

function handleTemplateAudit(args = {}) {
  const root = projectRoot();
  const blueprint = args.blueprint
    || readPageBlueprint(root, args.inputPath || "");
  const result = auditPageBlueprint(blueprint);
  return {
    text: result.ok
      ? `✅ Blueprint 脱敏与质量门禁通过：${result.score} 分`
      : `❌ Blueprint 脱敏与质量门禁失败：${result.errors.join("；")}`,
    structuredContent: { ok: result.ok, state: result.ok ? "audited" : "invalid", audit: result },
    isError: !result.ok,
  };
}

module.exports = {
  handleTemplateExtract,
  handleTemplateValidate,
  handleProjectSnapshot,
  handleTemplateSearch,
  handleTemplateDiff,
  handleTemplateAudit,
};

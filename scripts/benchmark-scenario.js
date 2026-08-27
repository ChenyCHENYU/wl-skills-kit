#!/usr/bin/env node
"use strict";

/**
 * scripts/benchmark-scenario.js — 确定性渲染 vs AI 代码生成 的性能/算力量化基准
 *
 * 测量原则（全部可复现、零外部依赖）：
 *   1. 编译耗时：compileScenario / extractScenario / verifyScenarioRender 本机毫秒级计时
 *      （warmup 后多轮取样，报告 min/avg/p95）
 *   2. 确定性：同一 JSON 两次编译逐字节比对（这是"零漂移"承诺的机器证据）
 *   3. Token 估算方法（ disclosed，非黑盒）：
 *      tokens ≈ ceil(ASCII非空白字符/4 + CJK字符×1.2)
 *      —— 英文代码 ~4 字符/token（OpenAI/Claude 公开经验值），中文 ~1.2 字符/token
 *   4. AI 路径基线 = 真实仓库文件测量（page-codegen 主流程按 SKILL.md 必读集）：
 *      输入上下文 = SKILL.md + 匹配 TPL + standards/02+12+13 + 2 个典型 references
 *      输出 = 生成的页面文件（与 scenario render 同规格产物按字节折算）
 *   5. scenario render 的 token 消耗恒为 0（本地字符串拼装，无模型调用）
 *
 * 用法：
 *   node scripts/benchmark-scenario.js            # 人读表格
 *   node scripts/benchmark-scenario.js --json     # 机器可读
 */

const path = require("path");
const fs = require("fs");
const { compileScenario, verifyScenarioRender } = require("../lib/scenario-compiler");
const { extractScenario } = require("../lib/scenario-extract");
const { scenarioToPageSpec } = require("../lib/scenario-template");

const ROOT = path.resolve(__dirname, "..");

// ─── 场景构造器（贴近真实页面规模） ───────────────────────────────────────

function benchQueryItem(i) {
  const kind = i % 3;
  if (kind === 0) return { name: `status${i}`, label: `状态${i}`, type: "dict", dictCode: `DICT_${i}` };
  if (kind === 1) return { name: `field${i}`, label: `字段${i}`, type: "input" };
  return { name: `date${i}`, label: `日期${i}`, type: "dateRange", startName: `s${i}`, endName: `e${i}` };
}

function benchColumnItem(i) {
  if (i % 5 === 0) {
    return { name: `col${i}`, label: `列${i}`, type: "dict", dictCode: `DICT_C${i}`, minWidth: 120 };
  }
  return { name: `col${i}`, label: `列${i}`, minWidth: i % 3 === 0 ? 150 : 120 };
}

function buildListScenario({ cols = 20, queries = 9, toolbarButtons = 16, formFields = 12 }) {
  const query = Array.from({ length: queries }, (_, i) => benchQueryItem(i));
  const columns = Array.from({ length: cols }, (_, i) => benchColumnItem(i));
  const toolbar = [{ label: "新增", color: "primary" }];
  for (let i = 1; i < toolbarButtons; i += 1) {
    toolbar.push({ label: `业务动作${i}`, color: "default", plain: true, action: "custom", handler: "() => {}" });
  }
  const fields = Array.from({ length: formFields }, (_, i) => ({
    name: `form${i}`,
    label: `表单字段${i}`,
    required: i % 2 === 0,
  }));
  return {
    kind: "wl-scenario",
    schemaVersion: 1,
    templateId: "bench.list",
    domain: "bench",
    pattern: "list",
    renderTrack: "codegen",
    page: "基准列表页",
    pageId: "BENCH_LIST",
    dir: "src/views/bench/list",
    serviceShort: "bench",
    resourceName: "record",
    tableCid: "bench-list1",
    query,
    columns,
    toolbar,
    operations: [
      { label: "编辑", action: "edit" },
      { label: "删除", action: "del" },
    ],
    formSections: [{ name: "base", label: "基本信息", fields }],
    features: {},
  };
}

function buildMasterDetailScenario() {
  const list = buildListScenario({ cols: 24, queries: 10, toolbarButtons: 7, formFields: 0 });
  list.pattern = "master-detail";
  list.pageId = "BENCH_MD";
  list.page = "基准主从页";
  list.formSections = [];
  list.subTables = [
    {
      name: "detail",
      label: "明细",
      resource: "record-detail",
      query: [],
      columns: Array.from({ length: 16 }, (_, i) => ({ name: `dcol${i}`, label: `明细列${i}`, minWidth: 120 })),
      toolbar: [],
      operations: [],
    },
  ];
  return list;
}

// ─── 计时与 token 估算 ────────────────────────────────────────────────────

function timeMs(fn, iterations) {
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = process.hrtime.bigint();
    fn();
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  samples.sort((a, b) => a - b);
  return {
    min: samples[0],
    avg: samples.reduce((a, b) => a + b, 0) / samples.length,
    p95: samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))],
  };
}

function estimateTokens(text) {
  const str = String(text);
  const cjk = (str.match(/[\u4e00-\u9fff]/g) || []).length;
  const ascii = (str.replace(/[\u4e00-\u9fff]/g, "").match(/\S/g) || []).length;
  return Math.ceil(ascii / 4 + cjk * 1.2);
}

function fileTokens(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? estimateTokens(fs.readFileSync(abs, "utf8")) : 0;
}

/** AI 主流程的典型必读上下文集（page-codegen SKILL.md 声明的映射，可审计） */
function aiContextTokens(tplRel) {
  const contextFiles = [
    "files/.wl-skills/skills/core/page-codegen/SKILL.md",
    `files/.wl-skills/skills/core/page-codegen/templates/universal/${tplRel}`,
    "files/.wl-skills/standards/02-code-structure.md",
    "files/.wl-skills/standards/12-base-table.md",
    "files/.wl-skills/standards/13-platform-components.md",
    "files/.wl-skills/skills/core/page-codegen/references/modal-and-navigation.md",
    "files/.wl-skills/skills/core/page-codegen/references/form-ui.md",
  ];
  return contextFiles.reduce((sum, rel) => sum + fileTokens(rel), 0);
}

function filesBytes(files) {
  let bytes = 0;
  let lines = 0;
  let tokens = 0;
  for (const content of Object.values(files)) {
    bytes += Buffer.byteLength(content, "utf8");
    lines += content.split("\n").length;
    tokens += estimateTokens(content);
  }
  return { bytes, lines, tokens };
}

function measureScenario(name, doc, iterations = 30) {
  const render = timeMs(() => compileScenario(doc), iterations);
  const first = compileScenario(doc);
  const second = compileScenario(doc);
  let deterministic = true;
  for (const key of Object.keys(first.files)) {
    if (first.files[key] !== second.files[key]) deterministic = false;
  }
  const spec = scenarioToPageSpec(doc, { quiet: true });
  const extract = timeMs(
    () => extractScenario({ dataContent: first.files["data.ts"], vueContent: first.files["index.vue"], pageSpec: spec }),
    iterations,
  );
  const verify = timeMs(
    () => verifyScenarioRender(doc, {
      readFile: (n) => (n === "definition.ts" ? null : first.files[n]),
    }),
    iterations,
  );
  const out = filesBytes(first.files);
  return {
    name,
    pattern: doc.pattern,
    render,
    extract,
    verify,
    deterministic,
    output: out,
    renderTokens: 0,
  };
}

function runBenchmark() {
  const listSmall = measureScenario("list-small(5列/3查询)", buildListScenario({ cols: 5, queries: 3, toolbarButtons: 3, formFields: 4 }));
  const listLarge = measureScenario("list-large(20列/9查询/16按钮/12表单)", buildListScenario({}));
  const masterDetail = measureScenario("master-detail(24+16列)", buildMasterDetailScenario());

  const aiContextList = aiContextTokens("TPL-LIST.md");
  const aiContextMd = aiContextTokens("TPL-MASTER-DETAIL.md");

  // 批量吞吐：20 个不同页面连续 render（不同 tableCid 模拟并行需求）
  const batch = (() => {
    const docs = Array.from({ length: 20 }, (_, i) => {
      const doc = buildListScenario({});
      doc.tableCid = `bench-batch-${i}`;
      return doc;
    });
    const t = timeMs(() => {
      for (const doc of docs) compileScenario(doc);
    }, 5);
    return { pages: 20, ...t, perPageMs: t.avg / 20 };
  })();

  return { listSmall, listLarge, masterDetail, aiContextList, aiContextMd, batch, tokenMethod: "ceil(ascii/4 + cjk*1.2)" };
}

function printHuman(report) {
  console.log("\nwl-skills scenario 确定性渲染基准（本机测量，可重复执行）");
  console.log("=".repeat(76));
  console.log(`Token 估算方法：${report.tokenMethod}\n`);
  for (const r of [report.listSmall, report.listLarge, report.masterDetail]) {
    console.log(`[${r.name}]  pattern=${r.pattern}  确定性=${r.deterministic ? "字节级一致 ✔" : "✘"}`);
    console.log(
      `  render: min=${r.render.min.toFixed(1)}ms avg=${r.render.avg.toFixed(1)}ms p95=${r.render.p95.toFixed(1)}ms   模型 token: 0`,
    );
    console.log(
      `  extract: avg=${r.extract.avg.toFixed(1)}ms   verify: avg=${r.verify.avg.toFixed(1)}ms`,
    );
    console.log(
      `  产物: ${r.output.lines} 行 / ${(r.output.bytes / 1024).toFixed(1)}KB ≈ ${r.output.tokens} tokens（AI 路径需逐字生成的输出量）`,
    );
  }
  console.log(`\nAI 主流程典型上下文（输入，仓库实测）：`);
  console.log(`  LIST 页：≈ ${report.aiContextList} tokens`);
  console.log(`  MASTER_DETAIL 页：≈ ${report.aiContextMd} tokens`);
  console.log(`  （未计入：api.md 生成、多轮自检修复、会话系统提示——实际只会更高）`);
  console.log(`\n批量吞吐：${report.batch.pages} 页连续 render avg=${report.batch.avg.toFixed(0)}ms（每页 ${report.batch.perPageMs.toFixed(1)}ms）`);
  console.log(`\n结论：scenario render 每页模型 token 消耗 0（vs AI 路径输入 ${report.aiContextList}+ 输出 ${report.listLarge.output.tokens}+）；`);
  console.log(`耗时从"模型生成数十秒~分钟级 + 校验复扫"降至本地 ${report.listLarge.render.avg.toFixed(0)}ms 量级。`);
  console.log("=".repeat(76) + "\n");
}

function main() {
  const report = runBenchmark();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printHuman(report);
}

module.exports = {
  buildListScenario,
  buildMasterDetailScenario,
  estimateTokens,
  aiContextTokens,
  filesBytes,
  measureScenario,
  runBenchmark,
};

if (require.main === module) main();

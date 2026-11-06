#!/usr/bin/env node
"use strict";

const { catalogCases, hash, readJSON, VARIANTS } = require("../support/host-skill-eval.cjs");

function verdict(checks) {
  const observed = checks.filter(check => check?.status !== "skipped");
  if (observed.some(check => check?.status === "failed")) return "failed";
  if (!observed.length) return "skipped";
  return observed.every(check => check?.status === "passed") ? "passed" : "unknown";
}

function count(values) {
  return Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(item => item === value).length]));
}

function percentile(values, fraction) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function metrics(rows) {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row.trial.metrics || {})))].sort();
  return Object.fromEntries(keys.flatMap(key => {
    const values = rows.map(row => row.trial.metrics?.[key]).filter(value => Number.isFinite(value) && value >= 0);
    return values.length ? [[key, { samples: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95) }]] : [];
  }));
}

function groupRows(rows, getKey) {
  const groups = new Map();
  for (const row of rows) {
    const key = getKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}

function selectionLabel(row, grade, variant) {
  if (variant === "no-skill" || row.expect.skill === undefined) return "skipped";
  if (grade?.status === "passed") return row.expect.skill === null ? "trueNegative" : "truePositive";
  if (grade?.status === "failed") return row.expect.skill === null ? "falsePositive" : "falseNegative";
  return "unknown";
}

function ratio(numerator, denominator) { return denominator ? numerator / denominator : null; }

function validateReport(row, report) {
  if (report.mode === "native-probe") throw new Error("native probes are not model evaluation reports");
  if (!matchesCase(row, report) || report.schemaVersion !== 1 || !VARIANTS.has(report.variant)
    || !Array.isArray(report.trials) || !report.trials.length) throw new Error("report does not match this evaluation catalog");
}

function matchesCase(row, report) {
  return row && report.family === row.family && report.split === row.split
    && report.promptSha256 === hash(row.prompt) && report.caseSha256 === hash(JSON.stringify(row));
}

function collectRows(cases, reports) {
  const runIds = new Set();
  const rows = [];
  for (const report of reports) {
    const row = cases.get(report.case);
    validateReport(row, report);
    for (const trial of report.trials) {
      if (!trial.runId || runIds.has(trial.runId) || !trial.host?.name || !trial.grade) throw new Error("duplicate or invalid evaluation trial");
      runIds.add(trial.runId);
      rows.push({ row, report, trial });
    }
  }
  return rows;
}

function summarize(catalog, reports) {
  const cases = new Map(catalogCases(catalog).map(row => [row.id, row]));
  const rows = collectRows(cases, reports);
  const hostKey = ({ trial }) => JSON.stringify([
    trial.host.name, trial.host.version ?? null, trial.host.model ?? null, trial.host.effort ?? null, trial.host.profile ?? null,
    trial.source ?? "codex-jsonl",
  ]);
  const packageKey = ({ report }) => JSON.stringify(Object.entries(report.packages ?? {}).sort(([left], [right]) => left.localeCompare(right)));
  const groups = groupRows(rows, entry => JSON.stringify([hostKey(entry), entry.row.split, entry.report.variant, packageKey(entry)]));
  return {
    schemaVersion: 1,
    trials: rows.length,
    groups: groups.map(entries => {
      const [{ row, report, trial }] = entries;
      const selection = count(entries.map(entry => selectionLabel(entry.row, entry.trial.grade.selection, entry.report.variant)));
      const tp = selection.truePositive ?? 0;
      const fn = selection.falseNegative ?? 0;
      const unexpectedSelections = entries.filter(entry => entry.row.expect.skill && entry.trial.grade.selection?.unexpectedPackages?.length).length;
      const fp = (selection.falsePositive ?? 0) + unexpectedSelections;
      const completed = entries.filter(entry => entry.trial.status === "completed");
      return {
        host: trial.host, source: trial.source ?? "codex-jsonl", split: row.split, variant: report.variant,
        packages: report.packages ?? {}, cases: count(entries.map(entry => entry.row.id)),
        hostStatus: count(entries.map(entry => entry.trial.status)),
        selection, unexpectedSelections, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn),
        taskOutcomes: count(entries.map(entry => verdict([
          ...entry.trial.grade.expectedMcpResults, ...(entry.trial.grade.assertions ?? []).filter(isOutcome),
        ]))),
        sideEffects: count(entries.map(entry => verdict((entry.trial.grade.assertions ?? []).filter(check => !isOutcome(check))))),
        receiptClosure: count(entries.map(entry => verdict([entry.trial.grade.decision, ...(entry.trial.grade.receipts ?? [])].filter(Boolean)))),
        toolContracts: count(entries.map(entry => verdict([
          ...entry.trial.grade.requiredTools, ...entry.trial.grade.forbiddenTools, ...entry.trial.grade.expectedMcpResults,
        ]))),
        metrics: metrics(completed),
      };
    }),
  };
}

function isOutcome(assertion) { return assertion.kind === "exists" || assertion.kind === "contains"; }

if (require.main === module) {
  try {
    const [catalog, ...reports] = process.argv.slice(2);
    if (!catalog || !reports.length) throw new Error("usage: host-skill-eval-summary.cjs CATALOG REPORT [REPORT...]");
    console.log(JSON.stringify(summarize(readJSON(catalog), reports.map(readJSON)), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { summarize };

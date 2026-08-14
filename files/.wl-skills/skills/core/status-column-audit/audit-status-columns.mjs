#!/usr/bin/env node
/**
 * 状态列审计 / 自动转换（wl-skills-kit · status-column-audit）
 *
 * 来源：wl-ui-ep 存量改造实战验证（2026-08），泛化为任意 Vue + Element 项目可用。
 * 依赖：@agile-team/wl-skills-ui >= 1.10.0（renderAutoTagByLabel 文案语义判色）。
 *
 * 用法（项目根目录）：
 *   node audit-status-columns.mjs --init-bridge   # 一次性生成本地桥接 src/utils/dict-auto-tag.ts
 *   node audit-status-columns.mjs                 # 审计：分级报告
 *   node audit-status-columns.mjs --fix           # 自动转换 P1（状态/类型类标签）
 *   node audit-status-columns.mjs --fix --all     # 连中性列也转（兜底纯文本）
 *
 * 可选参数：
 *   --dir <path>     扫描目录（默认 src/views）
 *   --call <name>    转换目标调用名（默认 dictAutoTag）
 *   --import <path>  桥接 import 说明符（默认 @/utils/dict-auto-tag）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SCAN_DIR = join(ROOT, argOf("--dir", "src/views"));
const CALL = argOf("--call", "dictAutoTag");
const IMPORT_SPEC = argOf("--import", "@/utils/dict-auto-tag");
const FIX = process.argv.includes("--fix");
const ALL = process.argv.includes("--all");
const INIT_BRIDGE = process.argv.includes("--init-bridge");

const BRIDGE_PATH = join(ROOT, "src", "utils", "dict-auto-tag.ts");
const BRIDGE_CODE = `/**
 * 字典列文案语义 Tag 桥接（由 wl-skills-kit status-column-audit --init-bridge 生成）
 *
 * 依赖 @agile-team/wl-skills-ui >= 1.10.0 的 renderAutoTagByLabel：
 * 状态词（待/已完成/驳回…）→ 实心语义 Tag；分类/形态词（类型/气态/液态…）→ 镂空 Tag；
 * 中性文案（单位/职务/周期…）→ 原样纯文本（零视觉变化兜底）。
 *
 * 列定义用法：
 *   // 旧：formatter: (row) => statusDict.fmt(row.status)
 *   // 新：defaultSlot: ({ row }) => dictAutoTag(statusDict, row.status, "status")
 */
import type { VNode } from "vue";
import { renderAutoTagByLabel } from "@agile-team/wl-skills-ui/runtime";

/** 项目侧 dictRef 约定：fmt(value) 返回展示文案 */
interface DictRefLike {
  fmt(value: unknown): string;
}

export function dictAutoTag(
  dictRef: DictRefLike,
  value: unknown,
  fieldName?: string,
): VNode | string {
  const label = dictRef.fmt(value);
  if (label === "" || label == null) return "";
  return renderAutoTagByLabel(label, fieldName);
}
`;

if (INIT_BRIDGE) {
  if (existsSync(BRIDGE_PATH)) {
    console.log(`⏭ 桥接文件已存在：${relative(ROOT, BRIDGE_PATH)}`);
  } else {
    mkdirSync(dirname(BRIDGE_PATH), { recursive: true });
    writeFileSync(BRIDGE_PATH, BRIDGE_CODE, "utf8");
    console.log(`✅ 已生成桥接文件：${relative(ROOT, BRIDGE_PATH)}`);
    console.log("   下一步：node audit-status-columns.mjs 审计，--fix 自动转换。");
  }
  process.exit(0);
}

/** P1 判定：label 含状态/类型类语义词（与 wl-ui-ep 实战一致的词表） */
const STATUS_WORDS =
  /状态|标志|是否|结果|结论|审批|类型|级别|等级|形态|相态|维度|分类|来源|周期|方式|性质/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(vue|ts)$/.test(name)) out.push(p);
  }
  return out;
}

const RE_ARROW_DICT =
  /formatter:\s*\((\w+)(?:\s*:\s*[^)]*)?\)\s*=>\s*((?:dicts\.)?[A-Za-z_$][\w$]*Dict)\.fmt\(\1\.([A-Za-z_$][\w$]*)\)/g;
const RE_ALIAS = /formatter:\s*([A-Za-z_$][\w$]*)\b/;
const RE_ALIAS_DEF =
  (alias) =>
  new RegExp(
    `const ${alias} = \\((\\w+)(?:\\s*:\\s*[^)]*)?\\)\\s*=>\\s*((?:dicts\\.)?[\\w$]*Dict)\\.fmt\\(\\1\\.([\\w$]+)\\)`
  );
const RE_DONE = new RegExp(`defaultSlot:[^\\n]*${CALL}\\(|defaultSlot:[^\\n]*renderEp?AutoTag`);
const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");

function labelOf(lines, idx) {
  for (let i = idx; i >= Math.max(0, idx - 8); i--) {
    const m = lines[i] && lines[i].match(/label:\s*"([^"]+)"/);
    if (m) return m[1];
  }
  for (let i = idx; i >= Math.max(0, idx - 8); i--) {
    const m = lines[i] && lines[i].match(/name:\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return "?";
}

/** 字段名反查列 name 所在行，取 label（分组/换行定义下比邻近行猜测可靠） */
function labelFromField(content, field) {
  const lines = content.split(/\r?\n/);
  const nameRe = new RegExp(`name:\\s*["']${field}["']`);
  for (let i = 0; i < lines.length; i++) {
    if (nameRe.test(lines[i])) {
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
        const m = lines[j].match(/label:\s*"([^"]+)"/);
        if (m) return m[1];
      }
      return labelOf(lines, i);
    }
  }
  return "?";
}

const files = walk(SCAN_DIR);
const buckets = { P1: [], P2: [], P3: [], P4: [], P5: [] };
let doneCount = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  if (/logicType:\s*['"]dict['"]/.test(raw)) {
    const n = (raw.match(/logicType:\s*['"]dict['"]/g) || []).length;
    buckets.P5.push({ file: rel(file), label: `${n} 处 logicType:"dict" 配置列` });
  }
  doneCount += (raw.match(new RegExp(RE_DONE.source, "g")) || []).length;
  RE_ARROW_DICT.lastIndex = 0;

  let content = raw;
  let changed = false;
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const convertedAliases = [];

  // 1) 直接字典箭头 formatter
  content = content.replace(RE_ARROW_DICT, (m0, _rowVar, dictExpr, field) => {
    const lineNo = raw.slice(0, raw.indexOf(m0)).split(/\r?\n/).length - 1;
    const label = labelOf(raw.split(/\r?\n/), lineNo);
    const bucket = STATUS_WORDS.test(label) ? "P1" : "P2";
    buckets[bucket].push({ file: rel(file), label, dict: dictExpr, field, fixed: FIX && (bucket === "P1" || ALL) });
    if (!FIX || (bucket === "P2" && !ALL)) return m0;
    changed = true;
    return `defaultSlot: ({ row }) => ${CALL}(${dictExpr}, row.${field}, "${field}")`;
  });

  // 2) 别名 formatter（const fmtX = (row) => xDict.fmt(row.f)）
  const aliasMatches = [...content.matchAll(new RegExp(RE_ALIAS.source, "g"))];
  const seen = new Set();
  for (const am of aliasMatches) {
    const alias = am[1];
    if (seen.has(alias)) continue;
    seen.add(alias);
    const def = content.match(RE_ALIAS_DEF(alias));
    if (!def) continue; // 非字典别名，保留
    const field = def[3];
    const label = labelFromField(content, field);
    const isP1 = STATUS_WORDS.test(label);
    if (FIX && (isP1 || ALL)) {
      content = content.split(`formatter: ${alias}`).join(
        `defaultSlot: ({ row }) => ${CALL}(${def[2]}, row.${field}, "${field}")`
      );
      convertedAliases.push(alias);
      changed = true;
      buckets[isP1 ? "P1" : "P2"].push({ file: rel(file), label, dict: def[2], field, alias, fixed: true });
    } else {
      buckets[isP1 ? "P1" : "P2"].push({ file: rel(file), label, dict: def[2], field, alias });
    }
  }

  if (changed) {
    // 补 import（去重 / 多锚点插入）
    const imp = `import { ${CALL} } from "${IMPORT_SPEC}";`;
    const importRe = new RegExp(`import\\s*\\{[^}]*${CALL}[^}]*\\}\\s*from\\s*"${IMPORT_SPEC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
    if (!importRe.test(content)) {
      if (/from\s*"@(\/[\w/-]+)?\/utils\/dict-auto-tag";/.test(content)) {
        content = content.replace(
          /(import\s*\{)([^}]*)(\}\s*from\s*"[^"]*dict-auto-tag";)/,
          `$1 ${CALL},$2$3`
        );
      } else if (/from\s*"[^"]*(epDict|epDictSn|dict)";/.test(content)) {
        content = content.replace(/(import[^\n]*from\s*"[^"]*(epDict|epDictSn|dict)";)/, `$1${eol}${imp}`);
      } else if (/import[^\n]*from\s*"vue";/.test(content)) {
        content = content.replace(/(import[^\n]*from\s*"vue";)/, `$1${eol}${imp}`);
      } else {
        content = content.replace(/(import[^\n]*;)/, `$1${eol}${imp}`);
      }
    }
    // 转换后别名无引用则删定义
    for (const alias of convertedAliases) {
      const rest = (content.match(new RegExp(`\\b${alias}\\b`, "g")) || []).length;
      if (rest === 1) {
        content = content.replace(new RegExp(`const ${alias} = [^;]+;\\r?\\n?`), "");
      }
    }
    // 括号 sanity（转换模板不含花括号，前后差值不变即安全）
    const before = (raw.match(/\{/g) || []).length - (raw.match(/\}/g) || []).length;
    const after = (content.match(/\{/g) || []).length - (content.match(/\}/g) || []).length;
    if (before !== after) {
      console.error(`[跳过-括号不平衡] ${rel(file)}`);
      continue;
    }
    writeFileSync(file, content, "utf8");
  }
}

const print = (title, arr) => {
  console.log(`\n== ${title} (${arr.length}) ==`);
  const byFile = {};
  for (const it of arr) (byFile[it.file] ||= []).push(it);
  for (const [f, items] of Object.entries(byFile)) {
    console.log(`  ${f}`);
    for (const it of items) {
      console.log(`    - ${it.label} <- ${it.dict ?? it.sn ?? ""}${it.fixed ? " [已转]" : ""}`);
    }
  }
};
print("P1 状态/类型类标签（--fix 默认转换）", buckets.P1);
print("P2 字典列-中性标签（--all 才转）", buckets.P2);
print("P3 fmtDict 助手写法（需手工配 dict ref）", buckets.P3);
print("P4 其他自定义 formatter（人工甄别）", buckets.P4);
print("P5 logicType:dict 配置列（中央挂钩候选）", buckets.P5);
console.log(`\n已接入 ${CALL}/renderAutoTag 的列：${doneCount} 处`);
console.log(FIX ? `\n模式：--fix${ALL ? " --all" : ""}` : `\n模式：仅审计（--fix 转换 P1，--fix --all 全转）`);
if (!existsSync(BRIDGE_PATH)) {
  console.log(`\n⚠ 尚未生成桥接文件：node ${relative(ROOT, __dirname).replace(/\\/g, "/")}/audit-status-columns.mjs --init-bridge`);
}

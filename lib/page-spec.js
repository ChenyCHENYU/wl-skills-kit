"use strict";

/**
 * lib/page-spec.js — page-spec 落盘 + spec-align 确定性比对引擎
 *
 * 解决的核心问题：
 *   page-codegen / spec-doc-parse / prototype-scan 的"精准实现"约定
 *   （查询字段顺序、表格列顺序、按钮顺序与颜色、操作列严格对应、按钮文字保真）
 *   过去只活在对话上下文里，没有机器可比对的真值，validate 无法验证"是否按约定实现"。
 *
 * 本模块把 page-spec 固化为页面目录下的 `page-spec.json`（单一真值），
 * 再用 AST/括号匹配解析 data.ts 的 queryDef/columnsDef/toolbarDef，
 * 与 page-spec 做确定性比对，输出 S1~S5 偏差：
 *   S1: 查询字段顺序不一致（query）           → warn
 *   S2: 表格列顺序/集合不一致（columns）       → error
 *   S3: 工具栏按钮顺序/集合/颜色不一致（toolbar）→ error
 *   S4: 操作列按钮集合不一致（operations）      → error
 *   S5: 按钮/列 label 文字与原型不保真          → warn
 *
 * 设计原则：
 *   - 找不到 page-spec.json 时静默跳过（不是所有页面都有 spec）
 *   - 解析失败降级为 info 提示，不误报阻断
 *   - 仅做"约定 vs 代码"的确定性核对，不做语义推断
 */

const fs = require("fs");
const path = require("path");

// ─── page-spec JSON Schema（文档 + 运行时校验依据）────────────────────────
//
// {
//   "page": "客户档案",                 // 页面中文名
//   "dir": "src/views/mdata/customer", // 页面目录（相对项目根）
//   "mode": "LIST",                     // 交互模式
//   "query":   [{ "name": "code", "label": "客户编码" }, ...],   // 查询字段（左→右、上→下）
//   "columns": [{ "name": "code", "label": "客户编码" }, ...],   // 表格列（左→右，selection/index 在前可省略）
//   "toolbar": [{ "label": "新增", "color": "primary", "plain": false }, ...], // 工具栏按钮（左→右）
//   "operations": [{ "label": "编辑" }, { "label": "删除" }]     // 操作列按钮
// }
//
// color 取值：primary / danger / warning / success / default

const SPEC_FILENAME = "page-spec.json";

const VALID_COLORS = new Set([
  "primary",
  "danger",
  "warning",
  "success",
  "default",
]);

/**
 * 在页面目录中查找 page-spec.json
 * @returns {string|null} 绝对路径
 */
function findPageSpecPath(absDir) {
  const p = path.join(absDir, SPEC_FILENAME);
  return fs.existsSync(p) ? p : null;
}

/**
 * 读取并解析 page-spec.json
 * @returns {{ spec: object|null, error: string|null }}
 */
function readPageSpec(absDir) {
  const p = findPageSpecPath(absDir);
  if (!p) return { spec: null, error: null };
  try {
    const spec = JSON.parse(fs.readFileSync(p, "utf8"));
    return { spec, error: null };
  } catch (e) {
    return { spec: null, error: "page-spec.json 解析失败：" + e.message };
  }
}

/**
 * 校验 page-spec 结构合法性（写入前/读取后均可调用）
 * @returns {string[]} 错误列表（空数组 = 合法）
 */
function validateSpecShape(spec) {
  const errs = [];
  if (!spec || typeof spec !== "object") {
    return ["page-spec 不是合法对象"];
  }
  if (!spec.page || typeof spec.page !== "string") {
    errs.push("缺少 page（页面中文名）");
  }
  for (const key of ["query", "columns", "toolbar", "operations"]) {
    if (spec[key] !== undefined && !Array.isArray(spec[key])) {
      errs.push(key + " 必须是数组");
    }
  }
  for (const btn of spec.toolbar || []) {
    if (btn && btn.color && !VALID_COLORS.has(btn.color)) {
      errs.push(
        '工具栏按钮 "' +
          (btn.label || "?") +
          '" 的 color 非法：' +
          btn.color +
          "（合法值：primary/danger/warning/success/default）",
      );
    }
  }
  return errs;
}

// ─── data.ts 解析：括号匹配提取方法体 ────────────────────────────────────

/**
 * 提取形如 `methodName() { ... }` 或 `methodName(): Type { ... }` 的方法体内容
 * 用括号配平精确截取，避免正则误吞。
 * @returns {string|null}
 */
function extractMethodBody(source, methodName) {
  if (!source) return null;
  // 匹配方法签名起点：methodName ( ... ) ... {
  const sigRe = new RegExp(methodName + "\\s*\\([^)]*\\)[^{]*\\{");
  const m = sigRe.exec(source);
  if (!m) return null;
  const start = m.index + m[0].length; // { 之后
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;
  return source.slice(start, i - 1);
}

/**
 * 去注释/字符串（保留引号结构），用于结构匹配前清洗
 */
function stripNoise(code) {
  if (!code) return "";
  let r = code.replace(/\/\*[\s\S]*?\*\//g, "");
  r = r.replace(/\/\/[^\n]*/g, "");
  return r;
}

/**
 * 从方法体中按出现顺序提取顶层对象的 name 与 label。
 * 仅提取数组元素级别的 name/label（不深入嵌套对象），用顺序保真比对。
 *
 * 返回 [{ name, label }]，顺序即代码顺序。
 */
function extractFieldSequence(methodBody) {
  if (!methodBody) return [];
  const result = [];
  // 以对象起始 `{` 为切分点，逐个对象提取首个 name/label
  // 通过括号配平拆分数组中的顶层对象
  const items = splitTopLevelObjects(methodBody);
  for (const item of items) {
    const nameM = item.match(/(?:^|[\s,{])name\s*:\s*["'`]([^"'`]+)["'`]/);
    const labelM = item.match(/(?:^|[\s,{])label\s*:\s*["'`]([^"'`]+)["'`]/);
    if (nameM || labelM) {
      result.push({
        name: nameM ? nameM[1] : null,
        label: labelM ? labelM[1] : null,
      });
    }
  }
  return result;
}

/**
 * 把方法体内最外层数组中的顶层对象切分出来。
 * 找到第一个 `[`，在其内做括号配平，按逗号在 depth=1 处分割对象。
 */
function splitTopLevelObjects(body) {
  const clean = stripNoise(body);
  const lb = clean.indexOf("[");
  if (lb < 0) return [];
  let depth = 0;
  let i = lb;
  let arrEnd = -1;
  for (; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        arrEnd = i;
        break;
      }
    }
  }
  if (arrEnd < 0) return [];
  const arrBody = clean.slice(lb + 1, arrEnd);
  // 在 arrBody 中按顶层 `{...}` 提取对象
  const objects = [];
  let objDepth = 0;
  let objStart = -1;
  for (let j = 0; j < arrBody.length; j++) {
    const ch = arrBody[j];
    if (ch === "{") {
      if (objDepth === 0) objStart = j;
      objDepth++;
    } else if (ch === "}") {
      objDepth--;
      if (objDepth === 0 && objStart >= 0) {
        objects.push(arrBody.slice(objStart, j + 1));
        objStart = -1;
      }
    }
  }
  return objects;
}

/**
 * 提取工具栏按钮序列（含颜色推断）。
 * 工具栏对象常见结构：{ name: "primary", label: "新增", plain: true, type: "danger" }
 * 颜色来源优先级：type > name（name 既是语义也是颜色）
 */
function extractToolbarSequence(methodBody) {
  if (!methodBody) return [];
  const items = splitTopLevelObjects(methodBody);
  const result = [];
  for (const item of items) {
    const labelM = item.match(/(?:^|[\s,{])label\s*:\s*["'`]([^"'`]+)["'`]/);
    if (!labelM) continue;
    const nameM = item.match(/(?:^|[\s,{])name\s*:\s*["'`]([^"'`]+)["'`]/);
    const typeM = item.match(/(?:^|[\s,{])type\s*:\s*["'`]([^"'`]+)["'`]/);
    const plainM = /(?:^|[\s,{])plain\s*:\s*true/.test(item);
    let color = typeM ? typeM[1] : nameM ? nameM[1] : "default";
    if (!VALID_COLORS.has(color)) color = "default";
    result.push({ label: labelM[1], color, plain: plainM });
  }
  return result;
}

/**
 * 提取操作列按钮序列。
 * 操作列由 renderOps([{ type, label, onClick }]) 渲染，或 operations: [...]
 * label 缺省时按 type 推断中文（edit→编辑 / del|danger→删除 / view→查看）
 */
function extractOperationSequence(dataContent) {
  if (!dataContent) return [];
  const clean = stripNoise(dataContent);
  // 优先匹配 renderOps([...])
  const renderM = /renderOps\s*\(\s*\[/.exec(clean);
  let body = null;
  if (renderM) {
    const start = renderM.index + renderM[0].length - 1; // 指向 [
    body = extractBracketBody(clean, start);
  }
  // 兼容旧写法 operations: [...]，validate 其他规则仍会提示改用 renderOps()
  if (!body) {
    const operationsM = /\boperations\s*:\s*\[/.exec(clean);
    if (operationsM) {
      const start = operationsM.index + operationsM[0].length - 1; // 指向 [
      body = extractBracketBody(clean, start);
    }
  }
  if (!body) return [];
  const items = splitTopLevelObjects("[" + body + "]");
  const TYPE_LABEL = { edit: "编辑", del: "删除", danger: "删除", view: "查看" };
  const result = [];
  for (const item of items) {
    const labelM = item.match(/(?:^|[\s,{])label\s*:\s*["'`]([^"'`]+)["'`]/);
    const typeM = item.match(/(?:^|[\s,{])type\s*:\s*["'`]([^"'`]+)["'`]/);
    const label = labelM ? labelM[1] : typeM ? TYPE_LABEL[typeM[1]] : null;
    if (label) result.push({ label });
  }
  return result;
}

/** 从 `[` 位置做括号配平，返回内部内容（不含外层括号） */
function extractBracketBody(source, openIdx) {
  if (source[openIdx] !== "[") return null;
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return source.slice(openIdx + 1, i);
    }
  }
  return null;
}

// ─── 比对 ────────────────────────────────────────────────────────────────

function seqNames(seq) {
  return seq.map((x) => x.name).filter(Boolean);
}

/** 数组顺序是否严格相等 */
function arrayEq(a, b) {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

/** 集合是否相等（忽略顺序） */
function setEq(a, b) {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x)) && a.every((x) => new Set(b).has(x));
}

function pushMissingImplementationIssue(issues, level, dir, rule, target) {
  issues.push({
    level,
    dir,
    rule,
    text: "page-spec 声明了 " + target + "，但 data.ts 中未解析到对应实现",
  });
}

/**
 * S3 颜色比对：集合一致时逐个核对 toolbar 按钮颜色（抽出降低 compareSpecToCode 复杂度）
 */
function pushToolbarColorIssues(specToolbar, actualToolbar, dir, issues) {
  const actualByLabel = new Map(actualToolbar.map((b) => [b.label, b]));
  for (const sb of specToolbar) {
    if (!sb.label || !sb.color) continue;
    const ab = actualByLabel.get(sb.label);
    if (ab && ab.color !== sb.color) {
      issues.push({
        level: "warn",
        dir,
        rule: "S3",
        text:
          '按钮"' +
          sb.label +
          '"颜色与原型不一致：spec=' +
          sb.color +
          " vs code=" +
          ab.color,
      });
    }
  }
}

/**
 * 比对 page-spec 与 data.ts 实际实现
 * @param {object} spec     page-spec.json 对象
 * @param {string} dataContent  data.ts 源码
 * @param {string} dir      页面相对目录（用于 issue.dir）
 * @returns {Array<{level,dir,text,rule}>}
 */
function compareSpecToCode(spec, dataContent, dir) {
  const issues = [];
  if (!spec) return issues;

  // S1: 查询字段顺序（query）
  if (Array.isArray(spec.query) && spec.query.length > 0) {
    const body = extractMethodBody(dataContent, "queryDef");
    const specNames = spec.query.map((q) => q.name).filter(Boolean);
    if (!body) {
      pushMissingImplementationIssue(issues, "warn", dir, "S1", "queryDef()");
    } else {
      const actual = extractFieldSequence(body);
      const actualNames = seqNames(actual);
      if (specNames.length && actualNames.length === 0) {
        pushMissingImplementationIssue(issues, "warn", dir, "S1", "queryDef() 查询字段");
      } else if (specNames.length && !setEq(specNames, actualNames)) {
        const missing = specNames.filter((n) => !actualNames.includes(n));
        const extra = actualNames.filter((n) => !specNames.includes(n));
        issues.push({
          level: "warn",
          dir,
          rule: "S1",
          text:
            "查询字段与 page-spec 不一致" +
            (missing.length ? "（缺：" + missing.join(",") + "）" : "") +
            (extra.length ? "（多：" + extra.join(",") + "）" : ""),
        });
      } else if (specNames.length && !arrayEq(specNames, actualNames)) {
        issues.push({
          level: "warn",
          dir,
          rule: "S1",
          text:
            "查询字段顺序与原型不一致：spec[" +
            specNames.join(",") +
            "] vs code[" +
            actualNames.join(",") +
            "]",
        });
      }
    }
  }

  // S2: 表格列顺序/集合（columns）
  if (Array.isArray(spec.columns) && spec.columns.length > 0) {
    const body = extractMethodBody(dataContent, "columnsDef");
    const specNames = spec.columns.map((c) => c.name).filter(Boolean);
    if (!body) {
      pushMissingImplementationIssue(issues, "error", dir, "S2", "columnsDef()");
    } else {
      const actual = extractFieldSequence(body);
      // 过滤掉框架内置列（selection/index/_action）
      const actualNames = seqNames(actual).filter(
        (n) => !["selection", "index", "_action"].includes(n),
      );
      if (specNames.length && actualNames.length === 0) {
        pushMissingImplementationIssue(issues, "error", dir, "S2", "columnsDef() 表格列");
      } else if (specNames.length && !setEq(specNames, actualNames)) {
        const missing = specNames.filter((n) => !actualNames.includes(n));
        const extra = actualNames.filter((n) => !specNames.includes(n));
        issues.push({
          level: "error",
          dir,
          rule: "S2",
          text:
            "表格列与 page-spec 不一致" +
            (missing.length ? "（缺：" + missing.join(",") + "）" : "") +
            (extra.length ? "（多：" + extra.join(",") + "）" : ""),
        });
      } else if (specNames.length && !arrayEq(specNames, actualNames)) {
        issues.push({
          level: "error",
          dir,
          rule: "S2",
          text:
            "表格列顺序与原型不一致：spec[" +
            specNames.join(",") +
            "] vs code[" +
            actualNames.join(",") +
            "]",
        });
      }
    }
  }

  // S3: 工具栏按钮顺序/集合/颜色（toolbar）
  if (Array.isArray(spec.toolbar) && spec.toolbar.length > 0) {
    const body = extractMethodBody(dataContent, "toolbarDef");
    const specLabels = spec.toolbar.map((b) => b.label).filter(Boolean);
    if (!body) {
      pushMissingImplementationIssue(issues, "error", dir, "S3", "toolbarDef()");
    } else {
      const actual = extractToolbarSequence(body);
      const actualLabels = actual.map((b) => b.label);
      if (specLabels.length && actualLabels.length === 0) {
        pushMissingImplementationIssue(issues, "error", dir, "S3", "toolbarDef() 工具栏按钮");
      } else if (specLabels.length && !setEq(specLabels, actualLabels)) {
        const missing = specLabels.filter((l) => !actualLabels.includes(l));
        const extra = actualLabels.filter((l) => !specLabels.includes(l));
        issues.push({
          level: "error",
          dir,
          rule: "S3",
          text:
            "工具栏按钮与 page-spec 不一致" +
            (missing.length ? "（缺：" + missing.join(",") + "）" : "") +
            (extra.length ? "（多：" + extra.join(",") + "）" : ""),
        });
      } else if (specLabels.length && !arrayEq(specLabels, actualLabels)) {
        issues.push({
          level: "error",
          dir,
          rule: "S3",
          text:
            "工具栏按钮顺序与原型不一致：spec[" +
            specLabels.join(",") +
            "] vs code[" +
            actualLabels.join(",") +
            "]",
        });
      }
      // 颜色比对（仅在集合一致时逐个核对）
      if (specLabels.length && actualLabels.length && setEq(specLabels, actualLabels)) {
        pushToolbarColorIssues(spec.toolbar, actual, dir, issues);
      }
    }
  }

  // S4: 操作列按钮集合（operations）
  if (Array.isArray(spec.operations) && spec.operations.length > 0) {
    const actual = extractOperationSequence(dataContent);
    const specLabels = spec.operations.map((o) => o.label).filter(Boolean);
    const actualLabels = actual.map((o) => o.label);
    if (specLabels.length && actualLabels.length === 0) {
      pushMissingImplementationIssue(issues, "error", dir, "S4", "renderOps()/operations 操作列按钮");
    } else if (specLabels.length && !setEq(specLabels, actualLabels)) {
      const missing = specLabels.filter((l) => !actualLabels.includes(l));
      const extra = actualLabels.filter((l) => !specLabels.includes(l));
      issues.push({
        level: "error",
        dir,
        rule: "S4",
        text:
          "操作列按钮与 page-spec 不一致" +
          (missing.length ? "（缺：" + missing.join(",") + "）" : "") +
          (extra.length ? "（多：" + extra.join(",") + "，禁止自行添加原型外按钮）" : ""),
      });
    }
  }

  // S5: label 文字保真（query + columns 中 name 相同但 label 被简化/篡改）
  // 例：原型"新增申请"被简化为"新增"、"客户编码"被改为"编码"
  {
    const checkLabelFidelity = (specArr, methodName) => {
      if (!Array.isArray(specArr) || specArr.length === 0) return;
      const body = extractMethodBody(dataContent, methodName);
      if (!body) return;
      const actual = extractFieldSequence(body);
      const actualByName = new Map(
        actual.filter((a) => a.name).map((a) => [a.name, a.label]),
      );
      for (const sf of specArr) {
        if (!sf.name || !sf.label) continue;
        if (!actualByName.has(sf.name)) continue;
        const codeLabel = actualByName.get(sf.name);
        if (codeLabel && codeLabel !== sf.label) {
          issues.push({
            level: "warn",
            dir,
            rule: "S5",
            text:
              '字段"' +
              sf.name +
              '"label 与原型不保真：spec="' +
              sf.label +
              '" vs code="' +
              codeLabel +
              '"',
          });
        }
      }
    };
    checkLabelFidelity(spec.query, "queryDef");
    checkLabelFidelity(spec.columns, "columnsDef");
  }

  return issues;
}

/**
 * 对单个页面目录执行 spec-align 比对
 * @returns {{ issues: Array, hasSpec: boolean }}
 */
function alignPage(absDir, relDir) {
  const { spec, error } = readPageSpec(absDir);
  if (error) {
    return { issues: [{ level: "info", dir: relDir, text: error, rule: "S0" }], hasSpec: false };
  }
  if (!spec) return { issues: [], hasSpec: false };

  const shapeErrs = validateSpecShape(spec);
  if (shapeErrs.length) {
    return {
      issues: shapeErrs.map((e) => ({
        level: "warn",
        dir: relDir,
        rule: "S0",
        text: "page-spec.json 结构问题：" + e,
      })),
      hasSpec: true,
    };
  }

  const dataPath = path.join(absDir, "data.ts");
  if (!fs.existsSync(dataPath)) {
    return {
      issues: [
        {
          level: "warn",
          dir: relDir,
          rule: "S0",
          text: "存在 page-spec.json 但缺 data.ts，无法做 spec-align 比对",
        },
      ],
      hasSpec: true,
    };
  }
  const dataContent = fs.readFileSync(dataPath, "utf8");
  return { issues: compareSpecToCode(spec, dataContent, relDir), hasSpec: true };
}

module.exports = {
  SPEC_FILENAME,
  VALID_COLORS,
  findPageSpecPath,
  readPageSpec,
  validateSpecShape,
  extractMethodBody,
  extractFieldSequence,
  extractToolbarSequence,
  extractOperationSequence,
  splitTopLevelObjects,
  compareSpecToCode,
  alignPage,
  arrayEq,
  setEq,
};

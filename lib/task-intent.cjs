"use strict";

/**
 * Dependency-free task evidence snapshot. Domain routing remains in each package.
 * Preserve the prompt; exclude explicit prohibitions and historical clauses from
 * capability scoring. Intent never substitutes for business write authorization.
 */
const HISTORY = /(?:旧(?:需求|文档|任务|方案)|历史(?:需求|任务|记录)|上(?:次|一轮|轮)(?:需求|任务|要求|说)|(?:用户|客户|之前|以前).{0,8}(?:曾|原先)(?:说|要求|提)|曾(?:说|要求|提到)|previous(?:\s+(?:request|task))?|previously|used to|historical)/iu;
const CURRENT = /(?:本次|这次|此次|现在|当前任务|实际要求|改为|而是|this time|now|instead)/iu;
const NEGATIVE = /^(?:(?:请|本次|这次|此次|暂时|暂|先|也|并且|且|同时|还)\s*)*(?:不要|不用|无需|禁止|别|不再|不需要|不必|不(?:做|用|画|生成|执行|运行|新增|实现|修改|改写|迁移|创建|编写|修复|自动)|do not\b|don't\b|without\b|skip\b)/iu;
const APPLY = /生成|绘制|新增|增加|实现|修改|改写|编写|修复|整改|创建|迁移|重构|同步|统一|调整|优化|完善|补充|补[^，。;\n]{0,12}注释|\b(?:generate|draw|create|implement|modify|write|fix|repair|migrate|refactor|adjust|optimize|improve)\b/iu;
const INSPECT = /检查|校验|验证|审查|审计|扫描|评审|核对|走查|梳理|\b(?:check|validate|verify|inspect|review|audit|scan)\b/iu;
const DISCUSSION = /(?:(?:只|仅)(?:需要)?(?:分析|讨论|解释|说明|了解|咨询)|(?:先|暂时)(?:分析|讨论|解释|说明)|\b(?:only|just)\s+(?:explain|discuss|describe|analy[sz]e)\b)/iu;

function normalized(text) { return String(text || "").normalize("NFKC").toLowerCase().trim(); }

function analyzeTask(task) {
  const original = String(task || "").normalize("NFKC");
  // Current-request markers and contrast conjunctions start a new evidence clause.
  const clauses = original.replace(/(但(?:是)?|而是|改为|(?:本次|这次|此次|现在)(?=\s*(?:只|仅|请|要|需要|检查|审查|生成|修改|补充)))/gu, "\n$1")
    .split(/[，,。；;!?！？\n]+/u).map((part) => part.trim()).filter(Boolean);
  const excluded = [];
  const active = [];
  for (const raw of clauses) {
    const clause = raw.replace(/^(?:但是|但|而是|改为)\s*/u, "").trim();
    if (HISTORY.test(clause) && !CURRENT.test(clause)) {
      excluded.push({ kind: "historical", text: clause });
    } else if (NEGATIVE.test(clause)) {
      excluded.push({ kind: "prohibited", text: clause });
    } else active.push(clause);
  }
  const activeText = active.join("，");
  return {schemaVersion:1,activeText,excluded,action:actionEvidence(activeText,excluded)};
}

function actionEvidence(activeText, excluded) {
  const discussion = DISCUSSION.test(activeText);
  const mode = discussion ? "explain" : /(?:只|仅|先)?(?:列|制定|提供|给出|做)(?:一个|一份)?[^，。;\n]{0,40}计划|\bplan\b/iu.test(activeText) ? "plan"
    : APPLY.test(activeText) ? "apply" : INSPECT.test(activeText) ? "inspect"
      : /解释|说明|讨论|咨询|\b(?:explain|discuss|describe)\b/iu.test(activeText) ? "explain" : "unspecified";
  const genericStop = excluded.some((item) => item.kind === "prohibited" && /(?:暂|先|不要|不)(?:自动)?(?:执行|运行)(?:任何|所有)?(?:工具|命令|检查|校验)?\s*$|\b(?:do not|don't|skip)\s+(?:execute|run)\s+(?:(?:any|all)\s+)?(?:tools?|commands?|checks?)\s*$/iu.test(item.text));
  return {
    mode, checksAllowed: !genericStop && ["inspect", "apply"].includes(mode), businessWritesAuthorized: false,
      authorization: "intent-is-not-business-write-authorization",
  };
}

function phraseMatches(text, phrase) {
  const haystack = normalized(analyzeTask(text).activeText);
  const needle = normalized(phrase);
  if (!needle) return false;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    const before = haystack.slice(Math.max(0, at - 32), at);
    const boundary = !/^[a-z0-9_.+-]+$/iu.test(needle)
      || !/[a-z0-9_-]/iu.test((haystack[at - 1] || "") + (haystack[at + needle.length] || ""));
    const negated = /(?:不要|不用|无需|禁止|别|不做|不|do not|don't|without)\s*(?:生成|创建|做|画|绘制|进行|设计|用|使用|执行|运行)?\s*$/iu.test(before);
    if (boundary && !negated) return true;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return false;
}

module.exports = { analyzeTask, phraseMatches };

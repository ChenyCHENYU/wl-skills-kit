"use strict";

/**
 * Dependency-free task evidence snapshot. Domain routing remains in each package.
 * Preserve the prompt; exclude explicit prohibitions and historical clauses from
 * capability scoring. Intent never substitutes for business write authorization.
 */
const HISTORY = /^(?:旧(?:需求|文档|任务|方案)|历史(?:需求|任务|记录)|上(?:次|一轮|轮)|之前|以前|(?:用户|客户).{0,8}(?:曾|原先)(?:说|要求|提)|曾(?:说|要求|提到)|previous(?:\s+(?:request|task))?|previously|used to|historical)/iu;
const CURRENT = /(?:本次|这次|此次|现在|当前任务|实际要求|改为|而是|this time|now|instead)/iu;
const NEGATIVE = /^(?:(?:请|本次|这次|此次|本轮|现在|这里|暂时|暂|先|也|并且|且|同时|还)\s*)*(?:不要|不用|无需|禁止|不得|不可|不能|切勿|别|不再|不需要|不必|不(?:做|用|画|生成|执行|运行|跑|检查|校验|扫描|测试|新增|实现|修改|改写|迁移|创建|编写|修复|自动)|跳过|do not\b|don't\b|don’t\b|without\b|skip\b)/iu;
const APPLY = /生成|绘制|新增|增加|实现|修改|改写|编写|修复|整改|创建|迁移|重构|同步|统一|调整|优化|完善|补充|补[^，。;\n]{0,12}注释|\b(?:generate|draw|create|implement|modify|write|fix|repair|migrate|refactor|adjust|optimize|improve)\b/iu;
const INSPECT = /检查|校验|验证|审查|审计|扫描|评审|核对|走查|梳理|(?:运行|执行|跑)(?:自动)?(?:测试|质量门)|\b(?:check|validate|verify|inspect|review|audit|scan|run\s+(?:tests?|checks?|quality\s+gates?))\b/iu;
const PREFIX = /^(?:(?:本次|这次|此次|现在|先|暂时|请问|请|麻烦你?|帮我|给我|我(?:希望|想要|想)|你(?:能否|可以|能不能)?|能否|可以|能不能|只|仅|需要)|(?:please|can you|could you|would you|only|just|first|this time|now|instead)\b)\s*/iu;
const EXPLAIN = /^(?:解释|说明|介绍|讨论|分析|了解|咨询|如何|怎么|为什么|explain\b|describe\b|discuss\b|analy[sz]e\b|how\b|why\b)/iu;
const BACKGROUND = /^(?:为了|为(?:了)?(?=修复|生成|实现|修改)|目的是|背景是|in order to\b|for the purpose of\b)/iu;
const PLAN = /^(?:(?:列|制定|提供|给出|做)(?:一个|一份|个)?[^，。;\n]{0,40}(?:计划|步骤|方案)|(?:一个|一份)?[^，。;\n]{0,40}(?:计划|步骤)\s*$|[^，。;\n]{1,40}(?:做|拟定|制定)(?:一个|一份|个)?方案\s*$|plan\b)/iu;
const QUOTES = new Map([['"','"'],["'","'"],["“","”"],["‘","’"],["「","」"],["『","』"]]);
const CONTRAST = /^(?:但是|但|而是|改为|(?:本次|这次|此次|现在)(?=\s*(?:只|仅|请|要|需要|检查|审查|生成|修改|补充))|(?:but|instead|this time|now)\b)/iu;

function normalized(text) { return String(text || "").normalize("NFKC").toLowerCase().trim(); }

function quoteEnd(text,index,stack) {
  const character = text[index];
  if (stack.at(-1) === character) { stack.pop(); return true; }
  if (!QUOTES.has(character) || character === "'" && /[a-z]/iu.test(text[index - 1] || '') && /[a-z]/iu.test(text[index + 1] || '')) return false;
  stack.push(QUOTES.get(character)); return true;
}

function clausesFor(text) {
  const parts = []; const stack = []; let raw = ''; let visible = '';
  const finish = () => {if(raw.trim())parts.push({raw:raw.trim(),visible:visible.trim()});raw = '';visible = '';};
  for(let index = 0;index < text.length;index += 1){
    const character = text[index]; const outside = stack.length === 0;
    if(outside && /[，,。；;!?！？\n]/u.test(character)){finish();continue;}
    if(outside && raw.trim() && CONTRAST.test(text.slice(index)))finish();
    const delimiter = quoteEnd(text,index,stack);
    raw += character; visible += outside && !delimiter ? character : ' ';
  }
  finish();return parts;
}

function analyzeTask(task) {
  const original = String(task || "").normalize("NFKC");
  const clauses = clausesFor(original);
  const excluded = [];
  const active = [];
  for (const {raw,visible} of clauses) {
    const clause = raw.replace(/^(?:但是|不过|但|而是|改为)\s*/u, "").trim();
    if (BACKGROUND.test(visible)) {
      excluded.push({ kind: "background", text: clause });
    } else if (HISTORY.test(visible) && !CURRENT.test(visible)) {
      excluded.push({ kind: "historical", text: clause });
    } else if (NEGATIVE.test(clause)) {
      excluded.push({ kind: "prohibited", text: clause });
    } else active.push(clause);
  }
  const activeText = active.join("，");
  return {schemaVersion:1,activeText,excluded,action:actionEvidence(activeText,excluded)};
}

function requestText(text) {
  let value = text.trim(); let next = value.replace(PREFIX,'');
  while(next !== value){value = next;next = value.replace(PREFIX,'');}
  return value;
}

function clauseMode(text) {
  const request = requestText(text);
  if(EXPLAIN.test(request))return 'explain';
  if(PLAN.test(request))return 'plan';
  if(APPLY.test(text))return 'apply';
  if(INSPECT.test(text))return 'inspect';
  return 'unspecified';
}

function stopsChecks(text) {
  const chinese = /^(?:(?:请|本次|这次|此次|本轮|现在|这里|暂时|暂|先|也|并且|且|同时|还)\s*)*(?:不要|不用|无需|禁止|不得|不可|不能|切勿|别|不再|不需要|不必|跳过|不)(?:再|自动|进行|做)?(?:执行|运行|跑)?(?:任何|所有|自动)?(?:工具|命令|检查|校验|测试|扫描|审查)?(?:代码|规范|质量门|任何检查|自动检查)?\s*$/u;
  const english = /^(?:please\s+)?(?:do not|don't|don’t|skip|without)\s+(?:execute|run|check|validate|verify|inspect|review|audit|scan)(?:\s+(?:any|all|automatic|the))*(?:\s+(?:tools?|commands?|checks?|tests?|code))?\s*$/iu;
  return chinese.test(text) || english.test(text);
}

function actionEvidence(activeText, excluded) {
  const modes = clausesFor(activeText).map(({raw}) => clauseMode(raw));
  const mode = ['apply','inspect','plan','explain'].find(value => modes.includes(value)) || 'unspecified';
  const genericStop = excluded.some((item) => item.kind === "prohibited" && stopsChecks(item.text));
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

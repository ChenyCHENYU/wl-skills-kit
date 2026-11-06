"use strict";

/**
 * Dependency-free task evidence snapshot. Domain routing remains in each package.
 * Preserve the prompt; exclude explicit prohibitions and historical clauses from
 * capability scoring. Intent never substitutes for business write authorization.
 */
const HISTORY = /^(?:旧(?:需求|文档|任务|方案)|历史(?:需求|任务|记录)|上(?:次|一轮|轮)|之前|以前|(?:用户|客户).{0,8}(?:曾|原先)(?:说|要求|提)|曾(?:说|要求|提到)|previous(?:\s+(?:request|task))?|previously|used to|historical)/iu;
const CURRENT = /(?:本次|这次|此次|现在|当前任务|实际要求|改为|而是|this time|now|instead)/iu;
const NEGATIVE = /^(?:(?:请|本次|这次|此次|本轮|现在|这里|暂时|暂|先|也|并且|且|同时|还)\s*)*(?:不要|不用|无需|禁止|不得|不可|不能|切勿|别|不再|不需要|不必|不(?:做|用|画|生成|执行|运行|跑|调用|使用|检查|校验|扫描|测试|新增|实现|修改|改写|改|修|补|删|迁移|创建|编写|写|修复|修正|美化|切换|适配|设计|自动)|跳过|do not\b|don't\b|don’t\b|without\b|skip\b)/iu;
const INDIRECT_NEGATIVE = /^(?:(?:请你?|本次|这次|此次|本轮|现在|这里|暂时|暂|先|也|并且|且|同时|还)\s*)*(?:(?:我|我们)(?:暂时|暂|先|现在)?不(?:想|打算|希望|需要)(?:你们?|帮我)?|(?:我|我们)?(?:并)?不是(?:让你|要你|要|想让你)|你(?:暂时|先)?不要|不要)/u;
const APPLY = /生成|绘制|画出|新增|增加|实现|修改|改写|改成|改为|编写|写清楚|修复|修正|修一下|修好|美化|切换|适配|整改|创建|删除|移除|更新|分配|授权|授予|登记|迁移|重构|同步|统一|调整|收紧|优化|完善|补充|补齐|补上|补[^，。;\n]{0,12}(?:注释|单元测试|单测|测试用例|正反例)|\b(?:generate|draw|create|delete|remove|update|assign|grant|implement|modify|write|fix|repair|migrate|refactor|adjust|optimize|improve|beautify)\b/iu;
const INSPECT = /检查|校验|验证|审查|审计|扫描|评审|核对|走查|梳理|查询|查找|列出|读取|预览|评估(?:版本|发布|测试|放行)|(?:运行|执行|跑)(?:自动)?(?:测试|质量门)|(?:运行|执行|跑)[^，。;\n]{0,16}冒烟|(?:挑选|选取|选出)[^，。;\n]{0,16}冒烟|\b(?:check|validate|verify|inspect|review|audit|scan|query|lookup|list|read|preview|run\s+(?:tests?|checks?|quality\s+gates?))\b/iu;
// Keep short prohibitions aligned with action vocabulary as that vocabulary grows.
const SHORT_NEGATIVE = new RegExp(`^不(?:${APPLY.source}|${INSPECT.source})`, "iu");
const PREFIX = /^(?:(?:本次|这次|此次|现在|先|暂时|请问|请|麻烦你?|帮我|给我|我(?:只|仅)?(?:希望|想要|想)|你(?:能否|可以|能不能)?|能否|可以|能不能|只是|仅是|只|仅|需要)|(?:please|can you|could you|would you|only|just|first|this time|now|instead)\b)\s*/iu;
const EXPLAIN = /^(?:解释|说明|介绍|讨论|分析|了解|咨询|说说|讲讲|如何|怎么|为什么|explain\b|describe\b|discuss\b|analy[sz]e\b|how\b|why\b)/iu;
const BACKGROUND = /^(?:为了|为(?:了)?(?=修复|生成|实现|修改)|目的是|背景是|in order to\b|for the purpose of\b)/iu;
const PLAN = /^(?:(?:列|制定|提供|给出|做)(?:一个|一份|个)?[^，。;\n]{0,40}(?:计划|步骤|方案)|(?:一个|一份)?[^，。;\n]{0,40}(?:计划|步骤)\s*$|[^，。;\n]{1,40}(?:做|拟定|制定)(?:一个|一份|个)?方案\s*$|plan\b)/iu;
const QUOTES = new Map([['"','"'],["'","'"],["“","”"],["‘","’"],["「","」"],["『","』"]]);
const CONTRAST = /^(?:(?:但是|但|而是|改为)(?=\s*(?:本次|这次|现在|实际|当前|我|你|我们|请|只|仅|先|要|需要|不|别|检查|审查|生成|修改|修复|修正|创建|实现|补充|优化|美化|扫描|评审|解释|说明|设计|执行))|(?:本次|这次|此次|现在)(?=\s*(?:只|仅|请|要|需要|检查|审查|生成|修改|补充))|(?:but|instead|this time|now)\b)/iu;

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
    const clause = raw.replace(/^(?:(?:但是|不过|但|而是)\s*|改为(?=\s*(?:只|仅|检查|审查|扫描|解释|说明|生成|修改|修复|创建|执行))\s*)/u, "").trim();
    if (BACKGROUND.test(visible)) {
      excluded.push({ kind: "background", text: clause });
    } else if (HISTORY.test(visible) && !CURRENT.test(visible)) {
      excluded.push({ kind: "historical", text: clause });
    } else if (NEGATIVE.test(clause) || INDIRECT_NEGATIVE.test(clause) || SHORT_NEGATIVE.test(requestText(clause).replace(/^(?:我|我们|你|你们)(?=不)/u, ""))) {
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
  if(APPLY.test(text) || requestedArtifact(request))return 'apply';
  if(INSPECT.test(text))return 'inspect';
  return 'unspecified';
}

function requestedArtifact(request) {
  if (/(?:不要|不必|别|无需|禁止|不设计|不做|不画)/u.test(request)) return false;
  return /^(?:(?:给|为)[^，。;\n]{1,32})?(?:设计|写)|^design\b|^(?:按|根据|依据|参考)[^，。;\n]{1,40}设计[^，。;\n]{0,24}(?:接口|数据库|架构)|^(?:给|为|按|根据|依据|参考)[^，。;\n]{1,32}(?:做|画)[^，。;\n]{0,16}(?:低保真草图|原型)/iu.test(request);
}

function stopsChecks(text) {
  text = text.replace(INDIRECT_NEGATIVE, "不要");
  const parts = text.split(/(?:也|并且|且|同时|以及)\s*(?=(?:先|暂时)?(?:不|别|禁止|无需))/u);
  if (parts.length > 1) return parts.some(stopsChecks);
  const chinese = /^(?:(?:请你?|本次|这次|此次|本轮|现在|这里|暂时|暂|先|也|并且|且|同时|还)\s*)*(?:不要|不用|无需|禁止|不得|不可|不能|切勿|别|不再|不需要|不必|跳过|不)(?:再|自动|进行|做)?(?:(?:调用|使用)(?:任何|所有)?(?:工具|命令)|(?:执行|运行|跑)?(?:任何|所有|自动)?(?:工具|命令|检查|校验|测试|扫描|审查)?(?:代码|规范|质量门|任何检查|自动检查)?)\s*$/u;
  const english = /^(?:please\s+)?(?:do not|don't|don’t|skip|without)\s+(?:(?:call|invoke|use)(?:\s+(?:any|all|the))*\s+(?:tools?|commands?)|(?:execute|run|check|validate|verify|inspect|review|audit|scan)(?:\s+(?:any|all|automatic|the))*(?:\s+(?:tools?|commands?|checks?|tests?|code))?)\s*$/iu;
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
    const negated = /(?:不要|不用|无需|禁止|别|不做|不|do not|don't|without)\s*(?:生成|创建|做|画|绘制|进行|设计|美化|修正|切换|适配|编写|写|用|使用|执行|运行)?\s*$/iu.test(before);
    if (boundary && !negated) return true;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return false;
}

module.exports = { analyzeTask, phraseMatches };

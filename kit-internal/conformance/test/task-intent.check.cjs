const test = require('node:test');const assert = require('node:assert/strict');
const {analyzeTask,phraseMatches} = require('../support/task-intent.cjs');
const cases = [
 ['不要使用 React，给 Vue 页面补充注释','React',false,'apply',true],
 ['旧需求要求生成页面，本次只审查注释','生成页面',false,'inspect',true],
 ['只分析生成页面方案，暂不生成代码','生成页面',true,'explain',false],
 ['检查页面，不执行任何工具','页面',true,'inspect',false],
 ["review the page, don't run any tools",'page',true,'inspect',false],
 ['previous request: generate page; now review comments','generate page',false,'inspect',true],
 ['不画流程图，只评审数据库设计','流程图',false,'inspect',true],
 ['draw a flowchart','flowchart',true,'apply',true],
 ['列一个执行计划，暂不执行','执行计划',true,'plan',false],
 ['只说明 UI修复 的影响，不执行修改','UI修复',true,'explain',false],
];
for(const [task,phrase,matched,mode,checks] of cases)test(task,() => {
 const evidence = analyzeTask(task);assert.equal(phraseMatches(task,phrase),matched);assert.equal(evidence.action.mode,mode);assert.equal(evidence.action.checksAllowed,checks);assert.equal(evidence.action.businessWritesAuthorized,false);
});
test('英文短语边界不被相似词误触发',() => {assert.equal(phraseMatches('serviceability','service'),false);assert.equal(phraseMatches('review Service comments','service'),true);});

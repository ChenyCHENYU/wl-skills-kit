import {test} from 'vitest';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
const cli = path.resolve(import.meta.dirname,'../bin/wl-skills.js');
test('validate --target/等号/位置参数只扫描指定目录；冲突与未知参数拒绝且零记录',() => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(),'wl-validate-scope-'));const run = args => spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:30000});
 try{
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({devDependencies:{'@agile-team/wl-skills-kit':'*'}}));assert.equal(run(['init']).status,0);
  fs.mkdirSync(path.join(root,'selected'),{recursive:true});fs.writeFileSync(path.join(root,'selected/index.vue'),'<template><div/></template>');
  fs.mkdirSync(path.join(root,'src/views/other'),{recursive:true});fs.writeFileSync(path.join(root,'src/views/other/index.vue'),'<template><div/></template>');
  for(const args of [['--target','selected'],['--target=selected'],['selected']]){
   const result = run(['validate',...args,'--json','--run-id','scope-positive']);assert.equal(result.status,0,result.stderr);
   const report = JSON.parse(result.stdout.trim().split('\n').find(line => line.startsWith('{')));assert.equal(report.summary.pages,1);
  }
  for(const args of [['--target'],['--target='],['--target','selected','src/views'],['selected','src/views'],['--domain','frontend'],['--strict=true'],['--target','selected','--target','src/views']]){
   const result = run(['validate',...args,'--run-id','scope-rejected']);assert.notEqual(result.status,0,JSON.stringify(args));assert.equal(fs.existsSync(path.join(root,'.wl-skills/runs/scope-rejected')),false);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('validate 页面文件目标只检查归属页面；错误文件目标返回 JSON 与真实失败回执', () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(),'wl-validate-file-'));
 const run = args => spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:30000});
 try {
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({devDependencies:{'@agile-team/wl-skills-kit':'*'}}));
  assert.equal(run(['init']).status,0);
  for(const name of ['selected','sibling']) {
   fs.mkdirSync(path.join(root,name));
   fs.writeFileSync(path.join(root,name,'index.vue'),'<template><div>page</div></template>');
   fs.writeFileSync(path.join(root,name,'data.ts'),'export const title = "page";');
  }
  const entry = 'selected/index.vue';
  const planned = run(['task','检查现有页面','--target',entry,'--run-id','entry-validation','--json']);
  assert.equal(planned.status,0,planned.stderr);
  const decision = JSON.parse(planned.stdout);assert.equal(decision.ready,true);
  for(const targetArgs of [[entry],['--target',entry],['--target=' + entry]]) {
   const checked = run(['validate',...targetArgs,'--run-id','entry-validation','--json']);
   assert.equal(checked.status,0,checked.stderr);
   const report = JSON.parse(checked.stdout);assert.equal(report.summary.pages,1);
   assert.equal(report.scanPath,'selected');assert.equal(report.requestedTarget,entry);
   assert.ok(report.summary.checkedFiles.includes(entry));
   assert.ok(report.summary.checkedFiles.every(file => file.startsWith('selected/')));
  }
  const status = JSON.parse(run(['status','--run-id','entry-validation','--json']).stdout);
  assert.equal(status.executionStatus,'completed');assert.equal(status.stale,false);
  assert.deepEqual(status.scopeGaps,[]);
  fs.writeFileSync(path.join(root,'selected','Child.vue'),'<template><div>component</div></template>');
  for(const file of ['selected/Child.vue','selected/data.ts']) {
   const rejected = run(['validate',file,'--run-id','rejected-' + path.basename(file),'--json']);
   assert.equal(rejected.status,1,rejected.stderr);
   const report = JSON.parse(rejected.stdout);assert.equal(report.ok,false);
   assert.equal(report.executionStatus,'failed');assert.equal(report.validationStatus,'unverified');
   assert.equal(report.summary.pages,0);assert.equal(report.issues[0].rule,'VALIDATION');
   assert.match(report.issues[0].text,/页面 index.vue/);
   const recorded = JSON.parse(run(['status','--run-id',report.runId,'--json']).stdout);
   assert.equal(recorded.executionStatus,'failed');
   assert.deepEqual(recorded.tools[0].checkedFiles,[]);
   assert.ok(recorded.tools[0].checks.every(check => check.status === 'skipped'));
  }
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

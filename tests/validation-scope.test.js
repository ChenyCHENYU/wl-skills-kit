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

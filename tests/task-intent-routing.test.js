import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const {dirname} = import.meta;
const repo = path.resolve(dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const cli = path.join(repo, 'bin/wl-skills.js');
const cases = JSON.parse(fs.readFileSync(path.join(dirname, 'task-intent-cases.json'), 'utf8'));
const key = "kit";
test('当前请求、否定、历史引用与只讨论：公开协议精确回归', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-intent-kit-'));
  const project = path.join(temporary, 'project');fs.mkdirSync(project);
  const run = args => {
    const result = spawnSync(process.execPath,[cli,...args],{cwd:project,encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stderr || result.stdout);return result.stdout;
  };
  try {
    fs.writeFileSync(path.join(project,'package.json'),JSON.stringify({private:true,devDependencies:{[pkg.name]:'*'}}));
    run(['init']);
    for(const row of cases){
      if(row.javaProject)fs.writeFileSync(path.join(project,'pom.xml'),'<project><modelVersion>4.0.0</modelVersion><groupId>audit</groupId><artifactId>fixture</artifactId><version>1</version></project>');
      const file = path.join(temporary,'request.json');
      fs.writeFileSync(file,JSON.stringify({operation:'route',projectRoot:project,task:row.task,...(row.domain ? {domain:row.domain} : {})}));
      const envelope = JSON.parse(run(['protocol','request','--input-file',file,'--json']));
      assert.equal(envelope.ok,true,row.task);const d = envelope.result.decision || envelope.result;
      assert.equal(d.status,row.status,row.task);assert.deepEqual(d.selectedSkills,row.skills,row.task);
      if(row.rules)assert.deepEqual(d.requiredRules,row.rules,row.task);
      assert.equal(d.action.mode,row.mode,row.task);assert.equal(d.action.businessWritesAuthorized,false);
      if(row.mode === 'explain')assert.equal(d.action.checksAllowed,false);
      const core = envelope.result.integration;assert.equal(core.packageName,pkg.name);assert.equal(core.packageVersion,pkg.version);
      assert.equal(core.contractVersion,1);assert.equal(core.runId,null);
      assert.ok(core.ruleRefs.every(rule => rule.packageName === pkg.name && rule.ruleVersion === pkg.version));
    }
    const storage = {kit:'.wl-skills',ui:'.wl-skills-ui',bd:'.wl-skills-bd',design:'.wl-skills-design',test:'.wl-skills-test'}[key];
    assert.equal(fs.existsSync(path.join(project,storage,'runs')),false,'route 不写任务记录');
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
});

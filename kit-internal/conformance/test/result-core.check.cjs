const test = require('node:test');const assert = require('node:assert/strict');const fs = require('node:fs');const path = require('node:path');const os = require('node:os');const {spawnSync} = require('node:child_process');const Ajv = require('ajv/dist/2020').default;const workspace = require('../support/workspace-root.cjs');
for(const [key,bin,helper] of [['kit','wl-skills','lib'],['ui','wl-ui','bin'],['bd','wl-skills-bd','lib'],['design','wl-skills-design','lib'],['test','wl-skills-test','lib']])test(`${key}：五操作结果核心、执行器声明与快照一致`,t => {
 const repo = path.join(workspace,`wl-skills-${key}`);const root = fs.mkdtempSync(path.join(os.tmpdir(),`wl-core-${key}-`));t.after(() => fs.rmSync(root,{recursive:true,force:true}));
 const run = args => {const r = spawnSync(process.execPath,[path.join(repo,'bin',bin + '.js'),...args],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr || r.stdout);return JSON.parse(r.stdout);};
 const described = run(['protocol','describe']);const ajv = new Ajv({strict:false,allErrors:true});const validate = ajv.compile(described.schemas.resultCore);
 assert.deepEqual(described.features,['task-intent-v1','result-core-v1','executor-catalog-v1']);assert.ok(described.inventory.executors.length);
 for(const file of ['task-intent.cjs','integration-result.cjs','integration-protocol.cjs','task-observability.cjs'])assert.equal(fs.readFileSync(path.join(repo,helper,file),'utf8'),fs.readFileSync(path.join(__dirname,'../support',file),'utf8'),file);
 for(const operation of ['route','explain','task','status','doctor-host']){
  const request = path.join(root,'input.json');fs.writeFileSync(request,JSON.stringify({operation,projectRoot:root,task:'只解释本包接入方式',...(operation === 'status' ? {runId:'not-created'} : {}),extraHint:'not-authorization'}));
  const envelope = run(['protocol','request','--input-file',request]);assert.equal(envelope.ok,true);assert.ok(validate(envelope.result.integration),JSON.stringify(validate.errors));assert.ok(envelope.diagnostics.some(d => d.includes('extraHint')));assert.deepEqual(envelope.result.integration.allowedExecutors,[]);
 }
 for(const entry of described.inventory.executors){assert.equal(entry.sideEffects.business,'none');assert.equal(entry.parameters.additionalProperties,false);assert.deepEqual(entry.parameters.required,['targets']);assert.ok(entry.command.every(v => typeof v === 'string'));}
});

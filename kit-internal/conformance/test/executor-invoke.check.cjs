const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createProtocol} = require('../support/integration-protocol.cjs');
const {validateSchema, realTarget} = require('../support/executor-invoke.cjs');
const {verifySupport} = require('../support/shared-support-check.cjs');

test('complete parameter Schema enforces future constraints and refuses unknown keywords', () => {
  const schema = {type:'object', required:['mode'], properties:{mode:{enum:['strict']}, targets:{type:'array',items:{const:'allowed'}}}, additionalProperties:false};
  for (const value of [{}, {mode:'loose'}, {mode:'strict',targets:['other']}, {mode:'strict',unexpected:true}]) assert.throws(() => validateSchema(schema,value), {code:'invalid-executor-input'});
  assert.doesNotThrow(() => validateSchema(schema,{mode:'strict',targets:['allowed']}));
  assert.throws(() => validateSchema({type:'object',inventedFutureKeyword:true},{}), {code:'unsupported-contract'});
  assert.doesNotThrow(() => validateSchema({$id:'urn:wl:future',type:'string',const:'old'},'old'));
  assert.doesNotThrow(() => validateSchema({$id:'urn:wl:future',type:'string',const:'new'},'new'));
});
test('snapshot checks are standalone and catch changed files without canonical or siblings', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'wl-snapshot-check-'));t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const source = path.join(__dirname,'../support');const manifest = JSON.parse(fs.readFileSync(path.join(source,'shared-support-manifest.json')));
  for(const file of [...Object.keys(manifest.files),'shared-support-manifest.json'])fs.copyFileSync(path.join(source,file),path.join(root,file));
  assert.equal(verifySupport(root).ok,true);
  fs.appendFileSync(path.join(root,'task-intent.cjs'),'\n// drift');
  assert.throws(() => verifySupport(root),/漂移/);
});
test('execute refuses missing input before status or invocation; catalog errors block invocation', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'wl-admission-core-'));t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const executor = {id:'new-check',sideEffects:{business:'none'},authorization:'read-only-business-check',when:{checks:['check']},parameters:{type:'object',required:['targets'],properties:{targets:{type:'array',items:{type:'string'},minItems:1}},additionalProperties:false}};
  const config = {packageName:'synthetic',packageVersion:'1',operations:[{id:'status',summary:'status',required:[],optional:[],readOnly:true,mapping:'status'}],executors:[executor],inventory:{loadErrors:['synthetic catalog failure']}};
  const protocol = createProtocol(config);let reads = 0,invocations = 0;
  const readStatus = () => {reads++;return {runId:'test',projectRoot:root,targets:['file'],stale:false,planStale:false,decision:{status:'baseline',ready:true,requiredChecks:['check'],scope:{status:'applicable',adopted:true,projectRoot:root},action:{mode:'inspect',checksAllowed:true}},records:[{kind:'task-decision',runId:'test',packageName:'synthetic',packageVersion:'1',notice:{projectRoot:root}}]};};
  const invoke = () => {invocations++;throw new Error('must not invoke');};
  const missing = await protocol.requestExecute({operation:'execute',runId:'test',executorId:'new-check',parameters:{targets:['file']}},{readStatus,invoke});
  assert.equal(missing.ok,false);assert.equal(missing.error.code,'missing-input');assert.equal(reads,0);
  const blocked = await protocol.requestExecute({operation:'execute',projectRoot:root,runId:'test',executorId:'new-check',parameters:{targets:['file']}},{readStatus,invoke});
  assert.equal(blocked.error.code,'catalog-load-error');assert.equal(invocations,0);
});

test('target admission rejects internal external links and preserves internal links and cycles', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'wl-target-preflight-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const project = path.join(root,'project'), outside = path.join(root,'outside');
  fs.mkdirSync(project);fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'secret.vue'),'secret');
  fs.symlinkSync(path.join(outside,'secret.vue'),path.join(project,'Escape.vue'));
  assert.throws(() => realTarget(fs.realpathSync(project),'.'),{code:'invalid-executor-input'});
  fs.unlinkSync(path.join(project,'Escape.vue'));
  fs.mkdirSync(path.join(project,'inner'));fs.writeFileSync(path.join(project,'inner','Valid.vue'),'valid');
  fs.symlinkSync(path.join(project,'inner'),path.join(project,'alias'));
  fs.symlinkSync(project,path.join(project,'inner','cycle'));
  assert.doesNotThrow(() => realTarget(fs.realpathSync(project),'.'));
  fs.symlinkSync(outside,path.join(project,'escape'));
  assert.throws(() => realTarget(fs.realpathSync(project),'escape/not-created'),{code:'invalid-executor-input'});
});
test('CLI execution captures real nonzero status and enforces output budget', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'wl-native-executor-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const cli = path.join(root,'cli.cjs');const {invokeCli} = require('../support/executor-process.cjs');
  fs.writeFileSync(cli,"process.stdout.write('receipt');process.stderr.write('issue');process.exitCode=3;");
  const result = await invokeCli({cli,args:[],projectRoot:root});
  assert.equal(result.exitCode,3);assert.equal(result.stdout,'receipt');assert.equal(result.stderr,'issue');assert.equal(result.cancelled,false);
  fs.writeFileSync(cli,"setInterval(()=>process.stdout.write('x'.repeat(10000)),1);");
  await assert.rejects(invokeCli({cli,args:[],projectRoot:root,maxOutputBytes:1024}),{code:'executor-output-limit'});
});

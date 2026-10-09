"use strict";
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const test = require('node:test');
const workspace = require('../support/workspace-root.cjs');
const core = require('../support/task-observability.cjs');
const names = ['design', 'kit', 'ui', 'bd', 'test'];
const bins = { design: 'wl-skills-design.js', kit: 'wl-skills.js', ui: 'wl-ui.js', bd: 'wl-skills-bd.js', test: 'wl-skills-test.js' };
const tasks = { design: '编写需求说明书', kit: '前端代码审查', ui: 'UI扫描', bd: '模块上下文', test: '接入测试' };
const states = new Set(['matched', 'baseline', 'ambiguous', 'gap', 'not-applicable', 'needs-context']);
function execute(command, args, cwd, allowed = [0]) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert.ok(allowed.includes(result.status), `${command} ${args.join(' ')}\n${result.error || ''}\n${result.stderr}\n${result.stdout.slice(-4000)}`);
  return result.stdout;
}
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-observation-adapter-')));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"observation-fixture","private":true}');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# User-owned task instructions\n');
  const foreign = '.agents/skills/company/SKILL.md';
  fs.mkdirSync(path.dirname(path.join(root, foreign)), { recursive: true });
  fs.writeFileSync(path.join(root, foreign), 'Company workflow survives.\n');
  return root;
}
function call(name, source, command, project, extra = [], allowed = [0]) {
  const args = [path.join(source, 'bin', bins[name]), command];
  if (name === 'design') args.push('--target', project);
  if (name === 'bd') args.push('--target', project);
  if (name === 'ui' || name === 'kit') args.push('--project', project);
  return execute(process.execPath, [...args, ...extra], project, allowed);
}
function install(name, source, project) {
  let extra = [];
  if (name === 'design') extra = ['--editor', 'all'];
  if (name === 'ui') extra = ['--editor', 'all', '--profile', 'native-element', '--skills-only'];
  if (name === 'bd') {
    const preview = JSON.parse(call(name, source, 'init', project, ['--json']));
    extra = ['--json', '--confirm', '--plan-hash', preview.planHash];
  }
  call(name, source, 'init', project, extra);
}
function events(project, name) {
  const dir = path.join(project, core.STORAGE[`@agile-team/wl-skills-${name}`]);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(run => fs.readdirSync(path.join(dir, run)).filter(file => file.endsWith('.json')).map(file => JSON.parse(fs.readFileSync(path.join(dir, run, file), 'utf8'))));
}
function taskProtocol(name, source, project, runId) {
  const before = events(project, name).length;
  const routed = JSON.parse(call(name, source, 'route', project, [tasks[name], '--json'], [0, 1, 2]));
  const routeDecision = routed.decision || routed;
  assert.ok(states.has(routeDecision.status), JSON.stringify(routed));
  assert.equal(events(project, name).length, before, `${name} route must remain read-only`);
  const planned = JSON.parse(call(name, source, 'task', project, [tasks[name], '--run-id', runId, '--json'], [0, 1, 2]));
  assert.equal(planned.runId, runId, JSON.stringify(planned));
  assert.equal(planned.executionStatus, 'not-executed');
  assert.equal(planned.validationStatus, 'unverified');
  assert.equal(planned.notice.packageName, `@agile-team/wl-skills-${name}`);
  assert.equal(planned.notice.packageVersion, JSON.parse(fs.readFileSync(path.join(source, 'package.json'))).version);
  assert.equal(planned.notice.runId, runId);
  assert.equal(planned.notice.decision, (planned.decision || planned).status);
  assert.equal(planned.notice.displayEvidence, 'unverified');
  assert.ok(planned.notice.rules.length, `${name} must explain its actual applicable rules`);
  assert.ok(planned.notice.requiredChecks.length, `${name} must list pending checks`);
  const visible = call(name, source, 'task', project, [tasks[name], '--run-id', runId], [0, 1, 2]);
  assert.match(visible, new RegExp(`${name}@`));
  assert.match(visible, /适用规则：/);
  assert.match(visible, /验证=unverified/);
  assert.ok(visible.includes(runId));
  const status = JSON.parse(call(name, source, 'status', project, ['--run-id', runId, '--json'], [0, 1]));
  assert.equal(status.runId, runId);
  assert.equal(status.packageName, `@agile-team/wl-skills-${name}`);
  assert.equal(status.executionStatus, 'not-executed');
  assert.equal(status.validationStatus, 'unverified');
  assert.equal(status.stages.contentLoaded, 'unverified');
  assert.equal(status.stages.hostDiscovered, 'unverified');
  return status;
}
for (const name of names) test(`published ${name}: task protocol and native gateway work independently without sibling packages`, () => {
  const project = fixture();
  try {
    const source = path.join(workspace, `wl-skills-${name}`);
    const packed = JSON.parse(execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', project, '--cache', path.join(project, 'npm-cache')], source))[0];
    const payloadNames = new Set(packed.files.map(file => file.path));
    const support = name === 'ui' ? 'bin' : 'lib';
    assert.ok(payloadNames.has(`${support}/task-observability.cjs`));
    assert.ok(payloadNames.has(`${support}/task-observability.schema.json`));
    assert.equal([...payloadNames].some(file => /(?:conformance|kit-internal)/.test(file)), false);
    const isolated = path.join(project, 'isolated'); fs.mkdirSync(isolated);
    execute('tar', ['-xzf', path.join(project, packed.filename), '-C', isolated], project);
    const extracted = path.join(project, 'node_modules', '@agile-team', `wl-skills-${name}`);
    fs.mkdirSync(path.dirname(extracted), { recursive: true });
    fs.renameSync(path.join(isolated, 'package'), extracted);
    const pkg = JSON.parse(fs.readFileSync(path.join(extracted, 'package.json'), 'utf8'));
    assert.equal(Object.keys(pkg.dependencies || {}).some(dep => /^@agile-team\/wl-skills-/.test(dep)), false);
    if (name === 'kit') fs.symlinkSync(path.join(source, 'node_modules'), path.join(extracted, 'node_modules'), 'dir');
    install(name, extracted, project);
    const gateway = path.join(project, '.agents/skills', `wl-skills-${name}`, 'SKILL.md');
    assert.ok(fs.existsSync(gateway));
    assert.match(fs.readFileSync(gateway, 'utf8'), new RegExp(`name: wl-skills-${name}`));
    assert.equal(fs.readFileSync(path.join(project, '.agents/skills/company/SKILL.md'), 'utf8'), 'Company workflow survives.\n');
    assert.ok(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8').includes('# User-owned task instructions\n'));
    taskProtocol(name, extracted, project, `independent-${name}`);
    for (const other of names.filter(other => other !== name)) assert.equal(events(project, other).length, 0);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});
test('five-package composition: distinct native gateways and own receipts correlate one user task', () => {
  const project = fixture();
  try {
    const sources = {};
    for (const name of names) {
      const source = path.join(workspace, `wl-skills-${name}`);
      const packed = JSON.parse(execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', project, '--cache', path.join(project, 'npm-cache')], source))[0];
      const staging = path.join(project, `unpack-${name}`); fs.mkdirSync(staging);
      execute('tar', ['-xzf', path.join(project, packed.filename), '-C', staging], project);
      const extracted = path.join(project, 'node_modules', '@agile-team', `wl-skills-${name}`);
      fs.mkdirSync(path.dirname(extracted), { recursive: true }); fs.renameSync(path.join(staging, 'package'), extracted);
      if (name === 'kit') fs.symlinkSync(path.join(source, 'node_modules'), path.join(extracted, 'node_modules'), 'dir');
      sources[name] = extracted;
      install(name, extracted, project);
    }
    const gateways = fs.readdirSync(path.join(project, '.agents/skills'));
    for (const name of names) assert.ok(gateways.includes(`wl-skills-${name}`));
    assert.ok(gateways.includes('company'));
    const statuses = names.map(name => taskProtocol(name, sources[name], project, 'one-user-task'));
    const combined = core.aggregateStatus(statuses);
    assert.equal(combined.correlated, true); assert.equal(combined.runId, 'one-user-task');
    assert.equal(combined.packages.length, 5); assert.equal(combined.mixedRuns, false);
    for (const name of names) for (const event of events(project, name)) {
      assert.equal(event.packageName, `@agile-team/wl-skills-${name}`); assert.equal(event.runId, 'one-user-task');
    }
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

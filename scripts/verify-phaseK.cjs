const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const requiredScripts = ['build', 'lint', 'test'];
const report = [];

function commandExists(file) {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [file], { stdio: 'ignore' });
  return result.status === 0;
}

function run(name, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  });
  const status = result.status ?? 1;
  report.push({ name, status });
  return status === 0;
}

for (const script of requiredScripts) {
  if (!(script in (pkg.scripts || {}))) {
    report.push({ name: `script:${script}`, status: 'MISSING' });
  }
}

const depsReady = fs.existsSync(path.join(root, 'node_modules', '.bin', 'vite'))
  && fs.existsSync(path.join(root, 'node_modules', '.bin', 'tsc'));

console.log('PHASE_K_TOOLCHAIN_VERIFICATION');
console.log(`NODE=${process.version}`);
console.log(`VITE_AVAILABLE=${commandExists('vite') || depsReady}`);
console.log(`LOCAL_NODE_MODULES=${depsReady}`);

const regressionOk = run('regression', 'node', ['tests/phase9/test-runner.cjs']);

if (!depsReady) {
  console.log('FULL_BUILD=BLOCKED: node_modules/.bin/vite and/or tsc are unavailable.');
  console.log('ACTION: run npm ci in a network-enabled/CI environment before build/typecheck.');
  report.push({ name: 'build', status: 'BLOCKED' });
  report.push({ name: 'lint', status: 'BLOCKED' });
} else {
  run('lint', 'npm', ['run', 'lint']);
  run('build', 'npm', ['run', 'build']);
}

console.log('---');
for (const item of report) console.log(`${item.name}=${item.status}`);
process.exit(regressionOk ? 0 : 1);

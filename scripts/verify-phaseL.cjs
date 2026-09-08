const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const report = [];

function run(name, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  });
  const status = result.status ?? 1;
  report.push({name, status});
  return status === 0;
}

const npmCli = process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)
  ? process.env.npm_execpath
  : null;

function runNpm(name, args) {
  if (npmCli) return run(name, process.execPath, [npmCli, ...args]);
  if (process.platform === 'win32') return run(name, process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ['npm.cmd', ...args].map((v) => String(v)).join(' ')]);
  return run(name, 'npm', args);
}

function localBinary(name) {
  const file = path.join(root, 'node_modules', '.bin', name);
  return fs.existsSync(process.platform === 'win32' ? `${file}.cmd` : file);
}

console.log('PHASE_L_RUNTIME_VERIFICATION');
console.log(`NODE=${process.version}`);
const npmVersion = npmCli
  ? spawnSync(process.execPath, [npmCli, '--version'], { encoding: 'utf8' })
  : spawnSync(process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd --version'] : ['--version'], { encoding: 'utf8' });
const npmVersionText = typeof npmVersion.stdout === 'string' ? npmVersion.stdout.trim() : '';
console.log(`NPM=${npmVersionText || 'UNKNOWN'}`);
console.log(`PACKAGE_LOCK=${fs.existsSync(path.join(root, 'package-lock.json'))}`);
console.log(`VITE_LOCAL=${localBinary('vite')}`);
console.log(`TSC_LOCAL=${localBinary('tsc')}`);

const regressionOk = runNpm('regression', ['test']);
const browserOk = run('browser-smoke', 'node', ['tests/browser/runtime-smoke.cjs']);

if (!fs.existsSync(path.join(root, 'package-lock.json'))) {
  console.log('REPRODUCIBLE_INSTALL=BLOCKED: package-lock.json is missing.');
  report.push({name: 'reproducible-install', status: 'BLOCKED'});
}

if (!localBinary('vite') || !localBinary('tsc')) {
  console.log('BUILD_TYPECHECK=BLOCKED: local dependencies are not installed.');
  report.push({name: 'typecheck', status: 'BLOCKED'});
  report.push({name: 'build', status: 'BLOCKED'});
} else {
  runNpm('typecheck', ['run', 'typecheck']);
  runNpm('build', ['run', 'build']);
}

console.log('---');
for (const item of report) console.log(`${item.name}=${item.status}`);

// Browser smoke may return 2 when Chromium is unavailable; that is an environment block, not a source regression.
const hardFailure = report.some((item) => item.status !== 0 && item.status !== 'BLOCKED' && item.status !== 2);
process.exit(hardFailure || !regressionOk ? 1 : 0);

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const checks = [];
const add = (name, ok, detail = '') => checks.push([name, Boolean(ok), detail]);

add('packageManager pinned', typeof pkg.packageManager === 'string' && pkg.packageManager.includes('@'));
add('node engine declared', typeof pkg.engines?.node === 'string' && pkg.engines.node.length > 0);
add('npm scripts typecheck/build declared', pkg.scripts?.typecheck === 'tsc --noEmit' && typeof pkg.scripts?.build === 'string');
add('lockfile present', fs.existsSync(path.join(root, 'package-lock.json')));
add('node_modules present', fs.existsSync(path.join(root, 'node_modules')));
add('@types/react declared', typeof pkg.devDependencies?.['@types/react'] === 'string');
add('@types/react-dom declared', typeof pkg.devDependencies?.['@types/react-dom'] === 'string');

const requireFromRoot = createRequire(path.join(root, 'package.json'));
const canResolve = (id) => {
  try { requireFromRoot.resolve(id); return true; } catch { return false; }
};

add('@types/react installed', canResolve('@types/react/package.json'));
add('@types/react-dom installed', canResolve('@types/react-dom/package.json'));
add('vite installed', canResolve('vite/package.json'));
add('typescript installed', canResolve('typescript/package.json'));

const platform = process.platform;
const arch = process.arch;
const rollupPlatform = platform === 'win32' ? `win32-${arch}` : platform === 'darwin' ? `darwin-${arch}` : platform === 'linux' ? `linux-${arch}` : null;
if (rollupPlatform) {
  add(`Rollup native optional dependency for ${platform}/${arch}`, canResolve(`@rollup/rollup-${rollupPlatform}/package.json`));
}
const esbuildPlatform = platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : null;
if (esbuildPlatform) {
  add(`esbuild native optional dependency for ${platform}/${arch}`, canResolve(`@esbuild/${esbuildPlatform}-${arch}/package.json`));
}

for (const [name, ok, detail] of checks) {
  console.log(`[${ok ? 'PASS' : 'BLOCKED'}] ${name}${detail ? ` — ${detail}` : ''}`);
}
const reproducible = checks.every(([, ok]) => ok);
console.log(`BUILD_ENVIRONMENT_REPRODUCIBLE=${reproducible ? 'PASS' : 'BLOCKED'}`);
process.exit(reproducible ? 0 : 2);

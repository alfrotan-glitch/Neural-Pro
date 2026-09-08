const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const fixture = path.join(ROOT, 'tests/visual/fixtures/caption-theme-fixture.html');
const actual = path.join(ROOT, 'tests/visual/actual/caption-themes.png');
const baseline = path.join(ROOT, 'tests/visual/baseline/caption-themes.png');
const themesSrc = fs.readFileSync(path.join(ROOT, 'src/features/video-studio/captions/services/captionThemeDefinitions.ts'), 'utf8');
const themes = [...themesSrc.matchAll(/^\s*(['\"]?)([a-z0-9-]+)\1:\s*\{\s*id:/gm)].map(m => m[2]);

function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
if (!fs.existsSync(fixture)) throw new Error('Caption visual fixture is missing');
if (themes.length !== 24) throw new Error(`Expected 24 themes, found ${themes.length}`);

if (!process.argv.includes('--browser')) {
  console.log('CAPTION_VISUAL_BROWSER_REGRESSION=READY');
  console.log('BROWSER_VISUAL_CAPTURE=NOT_RUN');
  console.log('Use: node tests/visual/captionThemeVisualRegression.cjs --browser');
  process.exit(0);
}

if (!fs.existsSync(baseline)) throw new Error('Visual baseline missing; create it explicitly in a browser-capable environment');
execFileSync('/usr/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--hide-scrollbars', '--run-all-compositor-stages-before-draw',
  '--virtual-time-budget=1000', '--window-size=1600,1900',
  `--screenshot=${actual}`, `file://${fixture}`,
], {stdio:'inherit', timeout: 30000});
if (!fs.existsSync(actual)) throw new Error('Chromium did not produce screenshot');
const actualHash = hash(actual);
const baselineHash = hash(baseline);
if (actualHash !== baselineHash) {
  throw new Error(`Caption visual regression detected. baseline=${baselineHash} actual=${actualHash}`);
}
console.log('CAPTION_VISUAL_BROWSER_REGRESSION=PASS');
console.log(`THEMES=${themes.length}`);
console.log(`SCREENSHOT_SHA256=${actualHash}`);

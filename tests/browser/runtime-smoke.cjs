const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'tests', 'browser', '.runtime-smoke-output.txt');
const appUrl = process.env.VSP_E2E_URL || 'http://127.0.0.1:3000/?e2e=1';
const browserTimeoutMs = Number(process.env.VSP_BROWSER_TIMEOUT_MS || 30000);
const serverTimeoutMs = Number(process.env.VSP_SERVER_TIMEOUT_MS || 20000);

function findExecutable(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [candidate], { encoding: 'utf8' });
    if (result.status === 0 && typeof result.stdout === 'string' && result.stdout.trim()) {
      return result.stdout.trim().split(/\r?\n/)[0];
    }
  }
  return null;
}

function findBrowser() {
  const envCandidates = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    process.env.CHROMIUM_PATH,
    process.env.EDGE_PATH,
  ];

  const pathCandidates = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe', 'chromium.exe']
    : ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable'];

  const envBrowser = envCandidates.find((value) => value && fs.existsSync(value));
  return envBrowser || findExecutable(pathCandidates);
}

function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const request = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(res.statusCode);
          return;
        }
        retry();
      });
      request.on('error', retry);
      request.setTimeout(1500, () => request.destroy());
    };
    const retry = () => {
      if (Date.now() - started >= timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(poll, 250);
    };
    poll();
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: response.status, ok: response.ok, body, text };
}

async function cdpConnect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;
  let closed = false;

  socket.onclose = () => {
    closed = true;
    for (const { reject } of pending.values()) reject(new Error('CDP socket closed.'));
    pending.clear();
  };

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out opening CDP socket.')), 5000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('Unable to open CDP socket.')); };
  });

  socket.onmessage = (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || 'CDP command failed.'));
      else resolve(message.result);
    }
  };

  const send = (method, params = {}) => {
    if (closed) return Promise.reject(new Error('CDP socket is closed.'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };

  const close = () => socket.close();
  return { send, close };
}

async function launchBrowser(browser) {
  const userDataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vsp-e2e-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];
  const child = spawn(browser, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  const started = Date.now();
  while (Date.now() - started < browserTimeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const version = await response.json();
        return { child, port, userDataDir, version, logs: () => logs };
      }
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  child.kill('SIGTERM');
  fs.rmSync(userDataDir, { recursive: true, force: true });
  throw new Error('Browser remote debugging endpoint did not start.');
}

async function createPage(port, url) {
  const newPageUrl = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(newPageUrl, { method: 'PUT' });
  if (!response.ok) {
    response = await fetch(newPageUrl);
  }
  if (!response.ok) throw new Error(`Unable to create browser page (HTTP ${response.status}).`);
  const page = await response.json();
  return cdpConnect(page.webSocketDebuggerUrl);
}

async function evaluate(page, expression, awaitPromise = true) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime exception.';
    throw new Error(description);
  }
  return result.result?.value;
}

async function waitForApp(page, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const state = await evaluate(page, `({
        ready: document.readyState,
        root: !!document.getElementById('root'),
        rootChildren: document.getElementById('root')?.children.length || 0,
        title: document.title,
        bodyText: document.body?.innerText || ''
      })`, false);
      if (state.root && state.rootChildren > 0 && state.ready !== 'loading') return state;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the React application to boot.');
}

async function run() {
  const browser = findBrowser();
  if (!browser) {
    console.error('BROWSER_E2E=BLOCKED: Chromium/Chrome/Edge not available.');
    process.exit(2);
  }

  const serverHealth = await fetchJson('http://127.0.0.1:3000/api/health').catch(() => null);
  let serverProcess = null;
  if (!serverHealth?.ok || serverHealth.body?.status !== 'ok') {
    if (!fs.existsSync(path.join(root, 'server.ts'))) throw new Error('server.ts is missing.');
    const tsx = process.platform === 'win32'
      ? path.join(root, 'node_modules', '.bin', 'tsx.cmd')
      : path.join(root, 'node_modules', '.bin', 'tsx');
    if (!fs.existsSync(tsx)) {
      console.error('BROWSER_E2E=BLOCKED: local tsx runtime is not installed.');
      process.exit(2);
    }
    serverProcess = spawn(tsx, ['server.ts'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, NODE_ENV: 'development' },
    });
    let serverLogs = '';
    serverProcess.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
    serverProcess.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });
    try {
      await waitForHttp('http://127.0.0.1:3000/api/health', serverTimeoutMs);
    } catch (error) {
      serverProcess.kill('SIGTERM');
      console.error(`BROWSER_E2E=FAIL: application server did not boot. ${error.message}`);
      if (serverLogs) console.error(serverLogs);
      process.exit(1);
    }
  }

  let launched = null;
  let page = null;
  try {
    launched = await launchBrowser(browser);
    page = await createPage(launched.port, appUrl);
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    await page.send('Page.navigate', { url: appUrl });
    const appState = await waitForApp(page, browserTimeoutMs);
    const health = await evaluate(page, `fetch('/api/health').then(async r => ({status:r.status, ok:r.ok, body: await r.json()}))`);
    const capabilities = await evaluate(page, `({
      canvas2d: !!document.createElement('canvas').getContext('2d'),
      pointerEvents: 'PointerEvent' in window,
      requestAnimationFrame: 'requestAnimationFrame' in window,
      requestVideoFrameCallback: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
      audioContext: 'AudioContext' in window || 'webkitAudioContext' in window,
      webCodecsDecoder: 'VideoDecoder' in window,
      webCodecsEncoder: 'VideoEncoder' in window
    })`);

    const checks = [
      ['DOM boots', appState.root && appState.rootChildren > 0],
      ['Application title', typeof appState.title === 'string' && appState.title.length > 0],
      ['Application content mounts', /Video Studio|VideoStudio|Podcast|Studio/i.test(appState.bodyText)],
      ['Frontend reaches /api/health', health.ok && health.status === 200 && health.body?.status === 'ok'],
      ['Canvas 2D', capabilities.canvas2d],
      ['PointerEvent', capabilities.pointerEvents],
      ['requestAnimationFrame', capabilities.requestAnimationFrame],
    ];

    const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
    const payload = {
      url: appUrl,
      browser,
      userAgent: await evaluate(page, 'navigator.userAgent'),
      appState,
      health,
      capabilities,
      checks: Object.fromEntries(checks),
      failed,
    };
    fs.writeFileSync(output, JSON.stringify(payload, null, 2), 'utf8');

    if (failed.length) {
      console.error(JSON.stringify({ failed, payload }, null, 2));
      console.error('BROWSER_E2E=FAIL');
      process.exitCode = 1;
      return;
    }

    console.log('BROWSER_E2E=PASS');
    console.log(`BROWSER=${browser}`);
    for (const [name, ok] of checks) console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
    console.log(`WebCodecs.VideoDecoder=${capabilities.webCodecsDecoder ? 'PASS' : 'UNAVAILABLE'}`);
    console.log(`WebCodecs.VideoEncoder=${capabilities.webCodecsEncoder ? 'PASS' : 'UNAVAILABLE'}`);
    console.log(`AudioContext=${capabilities.audioContext ? 'PASS' : 'UNAVAILABLE'}`);
  } finally {
    if (page) page.close();
    if (launched?.child && launched.child.exitCode === null) launched.child.kill('SIGTERM');
    if (launched?.userDataDir) fs.rmSync(launched.userDataDir, { recursive: true, force: true });
    if (serverProcess && serverProcess.exitCode === null) serverProcess.kill('SIGTERM');
  }
}

run().catch((error) => {
  console.error(`BROWSER_E2E=FAIL: ${error.message}`);
  process.exit(1);
});

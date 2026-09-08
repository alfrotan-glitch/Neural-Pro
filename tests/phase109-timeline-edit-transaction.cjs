const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');

const { createRequire } = require('node:module');

require.extensions['.ts'] = function(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const root = path.resolve(__dirname, '..');
function loadTs(relative) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  }).outputText;
  const wrapped = `(function(require,module,exports,__filename,__dirname){${transpiled}\n})`;
  const moduleObj = { exports: {} };
  const req = createRequire(filename);
  const localRequire = (request) => {
    if (request.endsWith('../../../../lib/uuid')) {
      return { generateUUID: () => `test-${Math.random().toString(36).slice(2)}` };
    }
    return req(request);
  };
  // Only the service is exercised here. Project type imports are erased by transpilation.
  new Function('require','module','exports','__filename','__dirname', wrapped.slice(wrapped.indexOf('{') + 1, -2))(localRequire, moduleObj, moduleObj.exports, filename, path.dirname(filename));
  return moduleObj.exports;
}

const service = loadTs('src/features/video-studio/timeline/services/timelineEditTransaction.ts');

function clip(id, startAt, duration, speed = 1) {
  return {
    id,
    sourceId: `source-${id}`,
    startAt,
    duration,
    trim: { in: 10, out: 10 + duration * speed },
    transform: { x: 0, y: 0, scale: 100, rotation: 0 },
    properties: { speed },
  };
}
function track(id, clips, locked = false) {
  return { id, type: 'video', laneRole: 'video', name: id, isLocked: locked, isMuted: false, isVisible: true, clips };
}

// Split must preserve the represented source range and never mutate an unrelated clip.
{
  const a = clip('a', 0, 10, 2);
  const other = clip('other', 20, 5, 1);
  const tracks = [track('video-1', [a, other])];
  const result = service.splitTimelineClips(tracks, ['a'], 4);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(result.affectedClipIds.length, 2);
  const next = result.tracks[0].clips;
  assert.strictEqual(next.length, 3);
  const left = next.find((c) => c.properties.splitPart === 1);
  const right = next.find((c) => c.properties.splitPart === 2);
  assert(left && right);
  assert.strictEqual(left.startAt, 0);
  assert.strictEqual(left.duration, 4);
  assert.strictEqual(left.trim.in, 10);
  assert.strictEqual(left.trim.out, 18);
  assert.strictEqual(right.startAt, 4);
  assert.strictEqual(right.duration, 6);
  assert.strictEqual(right.trim.in, 18);
  assert.strictEqual(right.trim.out, 30);
  assert.strictEqual(next.find((c) => c.id === 'other').startAt, 20);
}

// Locked lanes are an immutable boundary.
{
  const locked = track('locked', [clip('a', 0, 10)], true);
  const result = service.splitTimelineClips([locked], ['a'], 5);
  assert.strictEqual(result.changed, false);
  assert.strictEqual(result.tracks[0].clips.length, 1);
  assert.strictEqual(result.tracks[0].clips[0].id, 'a');
}

// Normal delete removes only selected clips.
{
  const tracks = [track('v1', [clip('a', 0, 10), clip('b', 10, 5)]), track('v2', [clip('c', 0, 7)])];
  const result = service.deleteSelectedTimelineClips(tracks, ['a']);
  assert.strictEqual(result.changed, true);
  assert.deepStrictEqual(result.tracks[0].clips.map((c) => c.id), ['b']);
  assert.strictEqual(result.tracks[0].clips[0].startAt, 10);
  assert.strictEqual(result.tracks[1].clips[0].startAt, 0);
}

// Ripple-delete closes only the time occupied by selected intervals on the same lane.
{
  const tracks = [track('v1', [clip('a', 0, 10), clip('b', 10, 5), clip('c', 20, 4)])];
  const result = service.rippleDeleteTimelineClips(tracks, ['b']);
  assert.strictEqual(result.changed, true);
  const next = result.tracks[0].clips;
  assert.strictEqual(next.find((c) => c.id === 'c').startAt, 15);
  assert.strictEqual(next.find((c) => c.id === 'a').startAt, 0);
}

console.log('PHASE109_TIMELINE_EDIT_TRANSACTION = PASS');

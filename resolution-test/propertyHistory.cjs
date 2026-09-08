const assert = require('node:assert/strict');

function clone(value) {
  return structuredClone(value);
}

function pathSegments(path) {
  return path.split('.').map(s => s.trim()).filter(Boolean);
}

function readPath(clip, path) {
  let cursor = clip;
  for (const segment of pathSegments(path)) {
    if (cursor == null || typeof cursor !== 'object' || !(segment in cursor)) {
      return { present: false };
    }
    cursor = cursor[segment];
  }
  return { present: true, value: clone(cursor) };
}

function writePath(clip, path, snapshot) {
  const next = clone(clip);
  const parts = pathSegments(path);
  let cursor = next;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor[parts[i]] = cursor[parts[i]] && typeof cursor[parts[i]] === 'object'
      ? clone(cursor[parts[i]])
      : {};
    cursor = cursor[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  if (snapshot.present) cursor[leaf] = clone(snapshot.value);
  else delete cursor[leaf];
  return next;
}

const clip = {
  id: 'clip-1',
  transform: { x: 10, y: 20, scale: 100 },
  properties: { textColor: '#fff' },
};

const oldColor = readPath(clip, 'properties.textColor');
const newClip = writePath(clip, 'properties.textColor', {
  present: true,
  value: '#00ff00',
});
const restored = writePath(newClip, 'properties.textColor', oldColor);

assert.equal(newClip.properties.textColor, '#00ff00');
assert.equal(restored.properties.textColor, '#fff');

const absent = readPath(clip, 'properties.missing');
const added = writePath(clip, 'properties.missing', {
  present: true,
  value: true,
});
const removed = writePath(added, 'properties.missing', absent);

assert.equal(added.properties.missing, true);
assert.equal('missing' in removed.properties, false);

const nested = writePath(clip, 'properties.caption.theme.name', {
  present: true,
  value: 'gradient-flow',
});
assert.equal(nested.properties.caption.theme.name, 'gradient-flow');

console.log('Stage 8 property history tests: PASS');

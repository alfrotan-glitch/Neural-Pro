import assert from 'node:assert/strict';
import { createPersistedProjectDocument, deserializeProject, getProjectStorageKey, saveProjectToStorage, loadProjectFromStorage } from '../src/features/video-studio/project/services/projectPersistenceService.ts';

const clip = { id: 'clip-1', sourceId: 'source-1', startAt: 2, duration: 3, trim: { in: 0, out: 3 }, transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100 }, properties: { textContent: 'hello' } };
const base = {
  projectId: 'project-1',
  metadata: { title: 'Integration', resolution: { width: 1920, height: 1080 }, fps: 30 },
  currentTime: 4,
  totalDuration: 999,
  tracks: [{ id: 'track-1', type: 'text', isLocked: false, isMuted: false, isVisible: true, clips: [clip] }],
  selectedNodeIds: ['clip-1'],
  isPlaying: true,
};

const doc = createPersistedProjectDocument(base);
assert.equal(doc.schemaVersion, 1);
assert.equal(doc.project.totalDuration, 5);
assert.equal(doc.project.currentTime, 4);
assert.equal(doc.project.isPlaying, false);

class MemoryStorage {
  constructor(){ this.map = new Map(); }
  getItem(k){ return this.map.get(k) ?? null; }
  setItem(k,v){ this.map.set(k,String(v)); }
}
const storage = new MemoryStorage();
saveProjectToStorage(storage, 'Integration / Demo', base);
const loaded = loadProjectFromStorage(storage, 'Integration / Demo', base);
assert.ok(loaded);
assert.equal(loaded.metadata.resolution.width, 1920);
assert.equal(loaded.metadata.resolution.height, 1080);
assert.equal(loaded.totalDuration, 5);
assert.equal(loaded.selectedNodeIds[0], 'clip-1');
assert.equal(loaded.isPlaying, false);
assert.equal(storage.getItem(getProjectStorageKey('Integration / Demo')) !== null, true);

const legacy = JSON.stringify({ tracks: [base.tracks[0]], totalDuration: 999 });
const migrated = deserializeProject(legacy, base);
assert.equal(migrated.totalDuration, 5);
assert.equal(migrated.metadata.title, 'Integration');
assert.deepEqual(migrated.selectedNodeIds, ['clip-1']);

console.log('PERSISTENCE_ROUND_TRIP=PASS');
console.log('LEGACY_MIGRATION=PASS');
console.log('METADATA_SELECTION_PRESERVATION=PASS');

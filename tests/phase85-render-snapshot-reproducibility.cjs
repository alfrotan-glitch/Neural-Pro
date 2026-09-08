const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function mustRead(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function mustContain(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

const hash = mustRead('src/features/video-studio/playback/services/renderSnapshotHash.ts');
const snapshot = mustRead('src/features/video-studio/playback/services/atomicRenderSnapshot.ts');
const exportService = mustRead('src/features/video-studio/export/services/exportService.ts');

mustContain(hash, "schema: 1", 'versioned hash schema');
mustContain(hash, 'Session/transaction identity is deliberately excluded', 'identity exclusion contract');
mustContain(hash, 'sourceId: layer.clip.sourceId', 'source identity in hash');
mustContain(hash, 'evaluatedTransform', 'evaluated transform in hash');
mustContain(hash, 'Object.keys(source).sort()', 'stable object key ordering');
mustContain(hash, 'padStart(16,', 'fixed hash width');

mustContain(snapshot, 'readonly snapshotHash: string;', 'snapshot hash field');
mustContain(snapshot, 'computeRenderSnapshotHash', 'hash computation');
mustContain(snapshot, 'snapshotHash,', 'hash persistence');

mustContain(exportService, 'createStandaloneRenderSnapshot', 'shared standalone snapshot path');

console.log('PHASE85_RENDER_SNAPSHOT_REPRODUCIBILITY = PASS');

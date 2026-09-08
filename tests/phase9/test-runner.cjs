const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '../..');

const tests = [
  ['timeline-multi-selection-collision-integrity', path.join(root, 'tests/phase54-multi-selection-atomic-geometry.cjs')],
  ['preview-transform-pixel-contract', path.join(root, 'tests/preview/preview-transform-phase5-pixel-contract.cjs')],
  ['project-duration-canonical', path.join(root, 'tests/phase15-project-duration-canonical.cjs')],
  ['phaseA-domain-integrity', path.join(root, 'tests/phaseA-domain-integrity.cjs')],
  ['phaseE-api-route-integrity', path.join(root, 'tests/phaseE-api-route-integrity.cjs')],
  ['phaseF-cross-feature-integration', path.join(root, 'tests/phaseF-cross-feature-integration.cjs')],
  ['architecture', path.join(__dirname, 'architecture.test.cjs')],
  ['commands', path.join(root, 'resolution-test/commands-phase6.cjs')],
  ['history', path.join(root, 'resolution-test/propertyHistory.cjs')],
  ['selectors', path.join(root, 'resolution-test/selectors-phase5.cjs')],
  ['services', path.join(root, 'resolution-test/services-phase4.cjs')],
  ['bitrate', path.join(root, 'resolution-test/exportEncodingSettings.cjs')],
  ['duration', path.join(root, 'resolution-test/projectDuration.cjs')],
  ['performance', path.join(root, 'resolution-test/performance-stage11.cjs')],
  ['security', path.join(root, 'resolution-test/security-stage12.cjs')],
  ['timeline-screenshot-parity', path.join(root, 'resolution-test/timelineScreenshotFeatureParity.cjs')],
  ['timeline-mouse-selection', path.join(root, 'tests/timeline/mouse-selection.cjs')],
  ['timeline-geometry', path.join(root, 'tests/timeline/geometry.cjs')],
  ['timeline-root-fixes', path.join(root, 'tests/timeline/root-invariants.cjs')],
  ['timeline-virtualization', path.join(root, 'tests/timeline/virtualization.cjs')],
  ['timeline-clipboard', path.join(root, 'tests/timeline/clipboard.cjs')],
  ['timeline-ripple-overwrite', path.join(root, 'tests/timeline/ripple-overwrite.cjs')],
  ['timeline-ripple-overwrite-runtime', path.join(root, 'tests/timeline/ripple-overwrite-runtime.cjs')],
  ['caption-overlay-performance', path.join(root, 'tests/phase6/caption-overlay-performance.cjs')],
  ['frame-accurate-preview', path.join(root, 'tests/phase10/frame-accurate-preview.cjs')],
  ['phaseC-command-boundary', path.join(root, 'tests/phase9/phaseC-command-boundary.cjs')],
  ['phaseH-inspector', path.join(root, 'tests/phaseH-inspector-decomposition.cjs')],
  ['caption-visual-parity-contract', path.join(root, 'tests/phase9/captionVisualParityContract.cjs')],
  ['caption-renderer-import-integrity', path.join(root, 'tests/phase9/caption-renderer-import-integrity.cjs')],
  ['p1-media-frame-geometry', path.join(root, 'tests/export/phaseP1-media-frame-geometry.cjs')],
  ['p1-media-visual-effects', path.join(root, 'tests/export/phaseP1-media-visual-effects.cjs')],
  ['p1-image-to-video-parity', path.join(root, 'tests/export/phaseP1-image-to-video-parity.cjs')],
  ['p1-audio-fade-effective-duration', path.join(root, 'tests/export/phaseP1-audio-fade-effective-duration.cjs')],
  ['p1-timeline-playable-boundaries', path.join(root, 'tests/export/phaseP1-timeline-playable-boundaries.cjs')],
  ['p2-frame-reference-selection', path.join(root, 'tests/export/phaseP2-frame-reference-selection.cjs')],
  ['p2-persistence-schema-safety', path.join(root, 'tests/export/phaseP2-persistence-schema-safety.cjs')],
  ['p2-audio-waveform-signal', path.join(root, 'tests/export/phaseP2-audio-waveform-signal.cjs')],
  ['p2-export-compositor-cache', path.join(root, 'tests/export/phaseP2-export-compositor-cache.cjs')],
  ['p2-overlay-frame-geometry', path.join(root, 'tests/export/phaseP2-overlay-frame-geometry.cjs')],
  ['phase48-timeline-interaction-geometry', path.join(root, 'tests/phase48-timeline-interaction-geometry.cjs')],
  ['phase49-timeline-drag-coordinate-integrity', path.join(root, 'tests/phase49-timeline-drag-coordinate-integrity.cjs')],
  ['phase49b-timeline-dynamic-track-geometry', path.join(root, 'tests/phase49b-timeline-dynamic-track-geometry.cjs')],
  ['phase50-timeline-universal-asset-drop', path.join(root, 'tests/phase50-timeline-universal-asset-drop.cjs')],
  ['phase51-timeline-resize-universal-contract', path.join(root, 'tests/phase51-timeline-resize-universal-contract.cjs')],
  ['phase53-timeline-snap-integrity', path.join(root, 'tests/phase53-timeline-snap-integrity.cjs')],
  ['phase54-multi-selection-atomic-geometry', path.join(root, 'tests/phase54-multi-selection-atomic-geometry.cjs')],
  ['phase56-timeline-asset-geometry-integrity', path.join(root, 'tests/phase56-timeline-asset-geometry-integrity.cjs')],
  ['phase57-preview-universal-transform-integrity', path.join(root, 'tests/phase57-preview-universal-transform-integrity.cjs')],
  ['phase58-preview-transform-geometry', path.join(root, 'tests/phase58-preview-transform-geometry.cjs')],
  ['phase63-auto-keyframe-contract', path.join(root, 'tests/phase63-auto-keyframe-contract.cjs')],
  ['phase118-repaired-defect-regressions', path.join(root, 'tests/phase118-repaired-defect-regressions.cjs')],
];

let failed = 0;
console.log('Video Studio Pro Max — Phase 9 Test Suite');
console.log('===========================================');

for (const [name, file] of tests) {
  if (!fs.existsSync(file)) {
    console.error(`[FAIL] ${name}: missing test file ${file}`);
    failed += 1;
    continue;
  }

  const result = spawnSync(process.execPath, [file], {
    cwd: root,
    encoding: 'utf8',
  });

  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');

  if (result.status !== 0) {
    console.error(`[FAIL] ${name}`);
    failed += 1;
  } else {
    console.log(`[PASS] ${name}`);
  }
}

console.log('-------------------------------------------');
console.log(failed === 0
  ? 'PHASE9_TEST_SUITE=PASS'
  : `PHASE9_TEST_SUITE=FAIL (${failed} suite${failed === 1 ? '' : 's'})`);

process.exitCode = failed === 0 ? 0 : 1;

require('../phase52-timeline-drag-autoscroll-integrity.cjs');
require('../phase52b-timeline-idle-autoscroll-integrity.cjs');

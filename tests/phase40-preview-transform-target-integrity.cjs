const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const playerPath = path.join(root, 'src/components/player/VideoPlayer.tsx');
const source = fs.readFileSync(playerPath, 'utf8');
function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

const markerCount = (source.match(/data-preview-clip-id=\{clip\.id\}/g) || []).length;
assert(markerCount === 4, 'All four preview render families expose one transform target per clip.');

const videoBlock = source.slice(source.indexOf('{activeClipsAtTime.map'), source.indexOf('{activeEffectsClips.map'));
assert(!/data-preview-clip-id=\{clip\.id\}[\s\S]{0,220}className=\"absolute inset-0 flex items-center justify-center pointer-events-none/.test(videoBlock), 'Video transform marker is not attached to the full-canvas wrapper.');
assert(/data-preview-clip-id=\{clip\.id\}[\s\S]{0,900}onMouseDown=\{\(e\) => handlePreviewClipMouseDown\(e, clip\)\}[\s\S]{0,500}transform: getPreviewTransformCss/.test(videoBlock), 'Video transform target owns both the interaction handler and canonical transform.');

const effectsBlock = source.slice(source.indexOf('{activeEffectsClips.map'), source.indexOf('{activeTextClips.map'));
assert(/data-preview-clip-id=\{clip\.id\}[\s\S]{0,1200}transform: getPreviewTransformCss[\s\S]{0,700}onMouseDown=\{\(e\) => handlePreviewClipMouseDown\(e, clip\)\}/.test(effectsBlock), 'Effect/overlay transform target owns interaction and canonical transform.');

const textBlock = source.slice(source.indexOf('{activeTextClips.map'), source.indexOf('{isExporting &&'));
assert(/data-preview-clip-id=\{clip\.id\}[\s\S]{0,500}style=\{\{[\s\S]{0,900}transform: getPreviewTransformCss/.test(textBlock), 'Caption transform is attached to the concrete caption element rather than its layout wrapper.');
assert(/data-caption-export-exclude=\"true\"/.test(textBlock), 'Caption export exclusion marker is preserved on its layout wrapper.');

const audioBlock = source.slice(source.indexOf('{activeAudioClipsAtTime.map'), source.length);
assert(/const canonicalTransform = getCanonicalClipTransform\(clip\.transform\);/.test(audioBlock), 'Audio preview card normalizes its transform before rendering.');
assert(/data-preview-clip-id=\{clip\.id\}[\s\S]{0,500}transform: getPreviewTransformCss\(canonicalTransform\)/.test(audioBlock), 'Audio preview card uses the canonical transform target.');

console.log('PHASE40_PREVIEW_TRANSFORM_TARGET_INTEGRITY=PASS');

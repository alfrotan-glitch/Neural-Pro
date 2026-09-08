const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const subtitle = fs.readFileSync(path.join(ROOT, 'src/components/player/SubtitleRenderer.tsx'), 'utf8');
const cyber = fs.readFileSync(path.join(ROOT, 'src/components/player/CyberpunkSubscribe.tsx'), 'utf8');
function assert(cond, msg) { if (!cond) throw new Error(msg); }
assert(!subtitle.includes("@import url('https://fonts.googleapis.com/css2?family=Caveat"), 'SubtitleRenderer still injects Google @import on every render');
assert(subtitle.includes('ensureCaptionFont'), 'Caption font registry is not wired');
assert(subtitle.includes('confettiAngle('), 'Confetti is not deterministic');
assert(!subtitle.includes('Math.random()'), 'Caption renderer still uses Math.random in render');
assert(subtitle.includes('layoutId={`subtitle-${clipId}-${idx}-moving-box`}'), 'Moving-box layoutId is not clip-scoped');
assert(cyber.includes('cyberpunk-float-particle'), 'Cyberpunk particle CSS animation missing');
assert(!cyber.includes('setParticles('), 'Cyberpunk particles still update React state per frame');
assert(!cyber.includes('requestAnimationFrame(() => {\n      setParticles'), 'Cyberpunk particle RAF state loop remains');
console.log('CAPTION_OVERLAY_PHASE6=PASS');

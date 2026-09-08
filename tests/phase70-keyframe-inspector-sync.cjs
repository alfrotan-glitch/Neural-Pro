#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(p){ return fs.readFileSync(path.join(root, p),'utf8'); }
const inspector = read('src/components/inspector/UniversalTransformControls.tsx');
const timeline = read('src/features/video-studio/timeline/components/TimelineAnimationMarkers.tsx');
const curve = read('src/features/video-studio/timeline/components/AnimationCurveEditor.tsx');
if (!inspector.includes('SetAnimationKeyframeValueCommand')) throw new Error('Inspector is not wired to keyframe value command');
if (!inspector.includes('selectedKeyframeIds')) throw new Error('Inspector does not read selected keyframes');
if (!inspector.includes('valueFor(\'transform.x\'')) throw new Error('Inspector does not surface selected keyframe value');
if (!timeline.includes('setCurrentTime(clipStart + k.time)')) throw new Error('Timeline keyframe selection does not sync playhead');
if (!curve.includes('clipStart + (entries.find')) throw new Error('Graph keyframe selection does not sync project time');
if (!curve.includes('data-curve-graph="multi-property"')) throw new Error('Graph editor contract missing');
console.log('PHASE70_KEYFRAME_INSPECTOR_SYNC = PASS');

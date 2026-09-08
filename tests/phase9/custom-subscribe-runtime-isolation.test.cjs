const fs = require('fs');
const assert = require('assert');

const context = fs.readFileSync('src/components/subscribe-generator/SubscribePropertiesContext.tsx', 'utf8');
const templates = fs.readFileSync('src/components/player/SubscribeTemplates.tsx', 'utf8');
const controller = fs.readFileSync('src/components/subscribe-generator/AnimationController.tsx', 'utf8');

assert(context.includes('isRuntimeBound'), 'runtime-bound flag must be exposed by subscribe context');
assert(templates.includes('runtime={{'), 'timeline custom subscribe must provide runtime state through context');
assert(templates.includes('getCustomSubscribeAnimationStage'), 'timeline custom subscribe must derive stage from playhead');
assert(controller.includes('if (isRuntimeBound || !isPlaying) return;'), 'controller timers must be disabled for timeline-bound instances');
assert(controller.includes('setAnimationStage(stage)'), 'standalone generator animation must retain timer-driven stage updates');

console.log('CUSTOM_SUBSCRIBE_RUNTIME_ISOLATION=PASS');

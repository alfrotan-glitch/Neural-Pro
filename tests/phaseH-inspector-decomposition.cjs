const fs = require('fs');
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..');
const enginePath = path.join(root, 'src/components/inspector/InspectorEngine.tsx');
const panels = [
  ['video', 'src/components/inspector/panels/VideoInspectorPanel.tsx', '<VideoInspectorPanel />'],
  ['audio', 'src/components/inspector/panels/AudioInspectorPanel.tsx', '<AudioInspectorPanel />'],
  ['text', 'src/components/inspector/panels/TextInspectorPanel.tsx', '<TextInspectorPanel />'],
];
const engine = fs.readFileSync(enginePath, 'utf8');
assert(engine.length < 55000, 'InspectorEngine remained too large after decomposition');
assert(fs.existsSync(path.join(root, 'src/components/inspector/InspectorController.tsx')), 'controller missing');
assert(fs.existsSync(path.join(root, 'src/components/inspector/InspectorFieldControls.tsx')), 'field controls missing');
for (const [type, file, usage] of panels) {
  assert(fs.existsSync(path.join(root, file)), `${file} missing`);
  assert(engine.includes(`case '${type}': return ${usage}`), `engine does not route ${type} to its panel`);
  const body = fs.readFileSync(path.join(root, file), 'utf8');
  assert(body.includes('useInspectorController'), `${file} does not consume shared controller`);
}
assert(engine.includes('<InspectorProvider value={inspectorController}>'), 'InspectorProvider not wired');
assert(!engine.includes('textTemplates.map'), 'unused template rendering remains in shell');
assert(!/setTracksDirect\s*\(/.test(engine), 'Inspector shell still directly mutates tracks');
assert(!/useProjectStore\.getState\(\)/.test(fs.readFileSync(path.join(root, panels[2][1]), 'utf8')), 'Text panel bypasses controller/store boundary');
console.log('PHASE_H_INSPECTOR_DECOMPOSITION=PASS');

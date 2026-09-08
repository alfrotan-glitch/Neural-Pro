const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const drag = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/index.ts'), 'utf8');
function fail(message) { console.error(`PHASE110_PROFESSIONAL_TRIM_INTEGRATION = FAIL: ${message}`); process.exit(1); }
if (!drag.includes("import { applyProfessionalTrim, applyRollEdit, applySlipEdit } from '../services/timelineProfessionalTrimService';")) fail('Professional trim service is not integrated into drag execution.');
if (!drag.includes("timelineEditMode === 'ripple' && selectedIds.length === 1")) fail('Ripple trim must be selected explicitly by the Timeline edit mode.');
if (!drag.includes("'ripple-left'") || !drag.includes("'ripple-right'")) fail('Both ripple trim edge contracts must be reachable from drag execution.');
if (!index.includes("export * from './timelineProfessionalTrimService';")) fail('Professional trim service must be publicly exported.');
console.log('PHASE110_PROFESSIONAL_TRIM_INTEGRATION = PASS');

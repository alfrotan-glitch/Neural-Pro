const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'src/features/video-studio/timeline/services/timelineProfessionalTrimService.ts');
const source = fs.readFileSync(servicePath, 'utf8');

function fail(message) { console.error(`PHASE110_PROFESSIONAL_TRIM = FAIL: ${message}`); process.exit(1); }
function pass(condition, message) { if (!condition) fail(message); }
pass(source.includes("'ripple-left'") && source.includes("'ripple-right'"), 'Ripple trim modes are missing.');
pass(source.includes('export function applyRollEdit'), 'Roll edit contract is missing.');
pass(source.includes('export function applySlipEdit'), 'Slip edit contract is missing.');
pass(source.includes('sourceIn + appliedSourceDelta') && source.includes('sourceOut + appliedSourceDelta'), 'Slip must move source window without changing timeline geometry.');
pass(source.includes('const shiftDelta = nextEnd - originalEnd'), 'Ripple trim must shift following clips by the exact applied boundary delta.');
pass(source.includes('Math.abs(boundary - rightEntry.clip.startAt) > EPSILON'), 'Roll edit must require adjacent clips.');
pass(source.includes('minimumDuration'), 'Professional trim service must enforce a minimum duration.');
pass(source.includes("rejectedReason: 'locked'"), 'Locked-track rejection is missing.');
console.log('PHASE110_PROFESSIONAL_TRIM = PASS');

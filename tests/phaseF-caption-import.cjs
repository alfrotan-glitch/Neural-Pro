const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const model=fs.readFileSync(path.join(root,'src/core/engine/captionRenderModel.ts'),'utf8');
const svc=fs.readFileSync(path.join(root,'src/features/video-studio/captions/services/captionImportService.ts'),'utf8');
const inspector=fs.readFileSync(path.join(root,'src/components/inspector/InspectorEngine.tsx'),'utf8');
const sidebar=fs.readFileSync(path.join(root,'src/components/workspace/ResourceSidebar.tsx'),'utf8');
const server=fs.readFileSync(path.join(root,'server.ts'),'utf8');
function assert(c,m){if(!c) throw new Error(m)}
assert(model.includes("'box'") && model.includes("'cinematic'") && model.includes("'spring'"),'caption themes missing');
assert(svc.includes('resolveCaptionImportTheme') && svc.includes('normalizeCaptionTiming'),'canonical caption import service missing');
const srtSection=inspector.slice(inspector.indexOf("fetch('/api/parse-srt'"), inspector.indexOf('// Export current timeline captions'));
assert(!srtSection.includes("captionTheme: 'karaoke'"),'SRT import still hardcodes karaoke');
assert(!inspector.includes('Math.max(1.0, parseFloat((endSeconds - startSeconds).toFixed(2)))'),'1s SRT duration clamp remains');
assert(sidebar.includes('normalizeCaptionTiming'),'generated captions do not use canonical timing');
assert(server.includes("wordTimingSource: 'inferred'"),'SRT inferred timing metadata missing');
console.log('PHASE_F_CAPTION_IMPORT=PASS');

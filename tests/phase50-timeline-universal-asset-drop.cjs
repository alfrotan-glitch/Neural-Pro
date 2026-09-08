const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const projectPath = path.join(root, 'src/features/video-studio/project/services/projectService.ts');
const timelinePath = path.join(root, 'src/components/timeline/VirtualizedTimeline.tsx');
const workspacePath = path.join(root, 'src/features/video-studio/timeline/components/TimelineWorkspace.tsx');
const boardPath = path.join(root, 'src/features/video-studio/timeline/components/TimelineTrackBoard.tsx');
for (const file of [projectPath, timelinePath, workspacePath, boardPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}
const project = fs.readFileSync(projectPath, 'utf8');
const timeline = fs.readFileSync(timelinePath, 'utf8');
const workspace = fs.readFileSync(workspacePath, 'utf8');
const board = fs.readFileSync(boardPath, 'utf8');
function must(re, text, label) { if (!re.test(text)) throw new Error(`FAIL: ${label}`); }
const roles = ['audio','element','caption','video','image','overlay','subscribe','effect','sticker'];
for (const role of roles) {
  const pattern = new RegExp(`(?:declaredType === '${role}'|case '${role}')`);
  must(pattern, project, `${role} has an explicit lane-role rule`);
}
must(/smartInsertClip\(tracks, laneRole, newClip\)/, project, 'asset insertion uses collision-aware smart placement');
must(/dataTransfer\.getData\('application\/json'\)/, timeline, 'timeline reads resource-sidebar asset drops');
must(/payload\?\.type !== 'asset' \|\| !payload\.asset/, timeline, 'timeline accepts only explicit asset drag payloads');
must(/pixelToTime\(horizontalOffset, pixelsPerSecond\)/, timeline, 'asset drop time is derived from the actual pointer position');
must(/addAssetToTracks\(\s*state\.tracks,\s*asset,\s*dropTime/s, timeline, 'asset drop creates the clip at the actual drop time');
must(/onDragOver=\{\(event\) => \{[\s\S]*application\/json[\s\S]*preventDefault\(\)/, workspace, 'asset dragover is enabled without intercepting unrelated drags');
must(/onDrop=\{handleAssetDrop\}/, workspace, 'workspace owns the asset drop boundary');
must(/handleAssetDrop: \(event: React\.DragEvent<HTMLDivElement>\) => void/, workspace, 'asset drop contract is explicit');
console.log('PHASE50_TIMELINE_UNIVERSAL_ASSET_DROP=PASS');

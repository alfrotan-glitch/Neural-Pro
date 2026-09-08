const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tscScript = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');
const tscCommand = process.execPath;

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-phase54-'));
const servicePath = path.join(root, 'src/features/video-studio/timeline/services/multiSelectionGeometryService.ts');
const resizePath = path.join(root, 'src/features/video-studio/timeline/services/timelineResizeService.ts');
const clipBoundsPath = path.join(root, 'src/features/video-studio/project/time/clipBounds.ts');
const typesPath = path.join(root, 'src/features/video-studio/project/types/project.ts');
try {
  const compile = spawnSync(tscCommand, [tscScript, '--target','ES2022','--module','CommonJS','--moduleResolution','node','--skipLibCheck','--outDir',tempRoot,servicePath,resizePath,clipBoundsPath,typesPath], {cwd:root,encoding:'utf8'});
  if (compile.status !== 0) throw new Error((compile.stdout||'')+(compile.stderr||''));
  const svc = require(path.join(tempRoot,'features/video-studio/timeline/services/multiSelectionGeometryService.js'));
  const clip=(id,start,duration,sourceDuration,trimIn=0)=>({id,sourceId:`s-${id}`,startAt:start,duration,trim:{in:trimIn,out:trimIn+duration},transform:{x:0,y:0,scale:1,rotation:0},properties:{sourceMediaDuration:sourceDuration}});
  const track=(clips)=>({id:'T',type:'video',isLocked:false,isMuted:false,isVisible:true,clips});
  const assert=(c,m)=>{if(!c) throw new Error(m)};

  // Group move snap boundary: the far edge must move as a unit; individual spacing remains unchanged.
  {
    const tracks=[track([clip('A',10,2,20),clip('B',15,3,20)])];
    const bounds=svc.getSelectionTimeBounds(tracks,['A','B']);
    assert(bounds.startAt===10 && bounds.endAt===18,'selection bounds must cover the whole group');
  }

  // Atomic right resize: B is source-bound and cannot accept +10s, so the group
  // is limited to the largest common feasible delta rather than partially resizing A.
  {
    const tracks=[track([clip('A',10,5,60),clip('B',20,5,25,15.2)])];
    const delta=svc.resolveSharedResizeDelta(tracks,['A','B'],10,'right',0.2);
    assert(delta >= 4.79 && delta <= 4.81,'shared resize must stop at the most restrictive source boundary');
  }

  // Atomic left resize: B starts too close to zero; the group must not let A
  // move farther left than B can support.
  {
    const tracks=[track([clip('A',10,5,60,5),clip('B',2,5,60,5)])];
    const delta=svc.resolveSharedResizeDelta(tracks,['A','B'],-10,'left',0.2);
    assert(delta >= -2.00000001 && delta <= -1.99999999,'shared left resize must respect the most restrictive timeline boundary');
  }


  // Group ripple is rigid: a collision with a preceding clip shifts the entire
  // selected group by one delta and preserves the original spacing.
  {
    const svcPath = path.join(root, 'src/features/video-studio/timeline/services/multiSelectionDragService.ts');
    const multiResizePath = path.join(root, 'src/features/video-studio/timeline/services/multiSelectionGeometryService.ts');
    const compile = spawnSync(tscCommand, [tscScript, '--target','ES2022','--module','CommonJS','--moduleResolution','node','--skipLibCheck','--outDir',tempRoot,svcPath,multiResizePath,resizePath,clipBoundsPath,typesPath,path.join(root,'src/features/video-studio/timeline/services/timelineEditingEngine.ts'),path.join(root,'src/lib/uuid.ts')], {cwd:root,encoding:'utf8'});
    if (compile.status !== 0) throw new Error((compile.stdout||'')+(compile.stderr||''));
    const multi = require(path.join(tempRoot,'features/video-studio/timeline/services/multiSelectionDragService.js'));
    const tracks=[track([clip('P',8,6,60),clip('A',10,2,60),clip('B',14,3,60)])];
    const result=multi.resolveMultiSelectionPlacement(tracks,['A','B'],new Map([['A','T'],['B','T']]),'ripple');
    const movedA=result.tracks[0].clips.find((c)=>c.id==='A');
    const movedB=result.tracks[0].clips.find((c)=>c.id==='B');
    assert(movedA && movedB && movedA.startAt===14 && movedB.startAt===18,'group ripple must shift all selected clips by one shared delta');
    assert(movedB.startAt - movedA.startAt === 4,'group ripple must preserve intra-group spacing');
  }

  console.log('PHASE54_MULTI_SELECTION_ATOMIC_GEOMETRY=PASS');
} finally {
  fs.rmSync(tempRoot,{recursive:true,force:true});
}

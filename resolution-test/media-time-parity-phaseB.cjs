function speedOf(clip){const raw=Number(clip.properties?.speed); return Number.isFinite(raw)&&raw>0?Math.min(16,Math.max(0.0625,raw)):1;}
function rangeOf(clip){const start=Math.max(0, Number.isFinite(clip.trim?.in)?clip.trim.in:0); const rawEnd=Number(clip.trim?.out); const end=Number.isFinite(rawEnd)&&rawEnd>start?rawEnd:null; return {start,end};}
function projectTimeToSourceTime(clip,t){const {start,end}=rangeOf(clip); const source=start+Math.max(0,t-clip.startAt)*speedOf(clip); return end===null?source:Math.min(source,end);}
function isActive(clip,t){return t>=clip.startAt && t<clip.startAt+clip.duration;}
const clip={startAt:5,duration:4,trim:{in:10,out:18},properties:{speed:2}};
for(const [t,e] of [[5,10],[6,12],[8.9,17.8],[9,18]]){const got=projectTimeToSourceTime(clip,t);if(Math.abs(got-e)>1e-9)throw new Error(`${t}: ${got} != ${e}`)}
if(isActive(clip,9)) throw new Error('exclusive end failed');
const speed=speedOf(clip), range=rangeOf(clip); const timeline=clip.duration*speed; const sourceDuration=Math.min(range.end-range.start,timeline); if(sourceDuration!==8) throw new Error('audio source duration mismatch');
console.log('MEDIA_TIME_MAPPING_PARITY=PASS');

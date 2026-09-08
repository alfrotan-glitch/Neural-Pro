import React, { useMemo, useRef, useState } from 'react';
import type { AnimatableProperty, AnimationKeyframe } from '../../animation/types/animation';
import { MoveAnimationKeyframeWithValueCommand, MoveAnimationKeyframesCommand, MoveAnimationKeyframeToPropertyCommand, SetAnimationKeyframeBezierControlsCommand } from '../../animation/keyframeCommands';
import { useProjectStore } from '../../../../store/useProjectStore';

type Entry = AnimationKeyframe & { property: AnimatableProperty };
type Props = { clipId: string; clipStart: number; clipDuration: number; selected: Entry; entries: Entry[]; pixelsPerSecond: number; selectedIds?: string[]; onSelectKeyframes?: (ids: string[]) => void };
type Point = { x: number; y: number };

const W = 520;
const H = 240;
const P = 28;
const PROPERTIES: AnimatableProperty[] = ['transform.x','transform.y','transform.scaleX','transform.scaleY','transform.rotation','transform.opacity'];
const LABELS: Record<AnimatableProperty,string> = {
  'transform.x':'X','transform.y':'Y','transform.scaleX':'Scale X','transform.scaleY':'Scale Y','transform.rotation':'Rotation','transform.opacity':'Opacity',
};
const COLORS: Record<AnimatableProperty,string> = {
  'transform.x':'#67e8f9','transform.y':'#a78bfa','transform.scaleX':'#fbbf24','transform.scaleY':'#fb7185','transform.rotation':'#34d399','transform.opacity':'#60a5fa',
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const cubic = (a:number,b:number,c:number,d:number,t:number) => { const u=1-t; return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d; };
const defaultBezier = (which:'in'|'out'): Point => which === 'out' ? {x:.25,y:.25} : {x:.75,y:.75};
function numericRange(property: AnimatableProperty, values: number[]) {
  if (property === 'transform.rotation') return [-360,360] as const;
  if (property === 'transform.opacity') return [0,100] as const;
  const finite = values.filter(Number.isFinite); const min=finite.length?Math.min(...finite):0; const max=finite.length?Math.max(...finite):100; const span=Math.max(10,max-min); return [min-span*.15,max+span*.15] as const;
}

export const AnimationCurveEditor: React.FC<Props> = ({ clipId, clipStart, clipDuration, selected, entries, pixelsPerSecond, selectedIds = [], onSelectKeyframes }) => {
  const executeCommand = useProjectStore(s => s.executeCommand);
  const setCurrentTime = useProjectStore(s => s.setCurrentTime);
  const [activeProperty, setActiveProperty] = useState<AnimatableProperty>(selected.property);
  const [visibleProperties, setVisibleProperties] = useState<AnimatableProperty[]>([selected.property]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({x:0,y:0});
  const [interaction, setInteraction] = useState<null | {kind:'node'|'handle'|'pan';id?:string;handle?:'in'|'out';start:{x:number;y:number;panX:number;panY:number};origin:{time:number;value:number;handle?:Point}}>(null);
  const [draftNode,setDraftNode]=useState<{id:string;time:number;value:number}|null>(null);
  const [draftNodeGroup,setDraftNodeGroup]=useState<Record<string,number>>({});
  const [draftHandle,setDraftHandle]=useState<{id:string;handle:'in'|'out';point:Point}|null>(null);
  const dragRef=useRef<SVGSVGElement|null>(null);
  const grouped = useMemo(() => {
    const map = new Map<AnimatableProperty,Entry[]>();
    for (const e of entries) { if (!PROPERTIES.includes(e.property)) continue; const arr=map.get(e.property) ?? []; arr.push(e); map.set(e.property,arr); }
    for (const arr of map.values()) arr.sort((a,b)=>a.time-b.time || a.id.localeCompare(b.id));
    return map;
  }, [entries]);
  const activeEntries = grouped.get(activeProperty) ?? [];
  const maxT = Math.max(clipDuration, ...activeEntries.map(e=>e.time), 0.001);
  const plotW=W-P*2, plotH=H-P*2;
  const rowH = plotH / Math.max(1, visibleProperties.length);
  const rangeFor = (prop:AnimatableProperty) => numericRange(prop,(grouped.get(prop)??[]).map(e=>e.value));
  const tx=(time:number)=>P+((time/Math.max(.001,maxT))*plotW)*zoom+pan.x;
  const rowIndex=(prop:AnimatableProperty)=>Math.max(0,visibleProperties.indexOf(prop));
  const ty=(prop:AnimatableProperty,value:number)=>{
    const [minV,maxV]=rangeFor(prop); const i=rowIndex(prop); const top=P+i*rowH; return top+rowH-(((value-minV)/Math.max(.001,maxV-minV))*rowH)*zoom+pan.y;
  };
  const inv=(clientX:number,clientY:number)=>{
    const svg=dragRef.current; if(!svg)return {time:selected.time,value:selected.value}; const r=svg.getBoundingClientRect(); const sx=(clientX-r.left)/r.width*W; const sy=(clientY-r.top)/r.height*H;
    const i=rowIndex(activeProperty); const top=P+i*rowH; const [minV,maxV]=rangeFor(activeProperty);
    return { time:clamp(((sx-P-pan.x)/Math.max(.01,plotW*zoom))*maxT,0,maxT), value:clamp(minV+((top+rowH-sy+pan.y)/Math.max(.01,rowH*zoom))*(maxV-minV),minV,maxV) };
  };
  const viewNode=(e:Entry)=>draftNode?.id===e.id?{...e,time:draftNode.time,value:draftNode.value}:e;
  const viewHandle=(e:Entry,w:'in'|'out')=>draftHandle?.id===e.id&&draftHandle.handle===w?draftHandle.point:(e.bezier?.[w]??defaultBezier(w));
  const beginNode=(e:Entry,ev:React.PointerEvent<SVGCircleElement>)=>{ev.stopPropagation();const nextSelection=ev.shiftKey ? (selectedIds.includes(e.id) ? selectedIds.filter(id=>id!==e.id) : [...selectedIds,e.id]) : (selectedIds.includes(e.id) ? selectedIds : [e.id]);onSelectKeyframes?.(nextSelection); if (nextSelection.length === 1) { setCurrentTime(clipStart + (entries.find(x=>x.id===nextSelection[0])?.time ?? e.time)); } ev.currentTarget.setPointerCapture(ev.pointerId);setActiveProperty(e.property);setVisibleProperties(ps=>ps.includes(e.property)?ps:[...ps,e.property]);const movable=nextSelection.length>1 && nextSelection.every(id=>entries.some(x=>x.id===id));if(movable){const origins:Record<string,number>={}; for(const id of nextSelection){const source=entries.find(x=>x.id===id); if(source) origins[id]=source.time;} setDraftNodeGroup(origins);} else {setDraftNode({id:e.id,time:e.time,value:e.value});} setInteraction({kind:'node',id:e.id,start:{x:ev.clientX,y:ev.clientY,panX:pan.x,panY:pan.y},origin:{time:e.time,value:e.value}});};
  const beginHandle=(e:Entry,w:'in'|'out',ev:React.PointerEvent<SVGCircleElement>)=>{ev.stopPropagation();onSelectKeyframes?.([e.id]);ev.currentTarget.setPointerCapture(ev.pointerId);const h=e.bezier?.[w]??defaultBezier(w);setActiveProperty(e.property);setVisibleProperties(ps=>ps.includes(e.property)?ps:[...ps,e.property]);setInteraction({kind:'handle',id:e.id,handle:w,start:{x:ev.clientX,y:ev.clientY,panX:pan.x,panY:pan.y},origin:{time:e.time,value:e.value,handle:h}});setDraftHandle({id:e.id,handle:w,point:h});};
  const beginPan=(ev:React.PointerEvent<SVGSVGElement>)=>{ev.currentTarget.setPointerCapture(ev.pointerId);setInteraction({kind:'pan',start:{x:ev.clientX,y:ev.clientY,panX:pan.x,panY:pan.y},origin:{time:0,value:0}});};
  const update=(ev:React.PointerEvent<SVGElement>)=>{if(!interaction)return;ev.stopPropagation();if(interaction.kind==='pan'){setPan({x:interaction.start.panX+ev.clientX-interaction.start.x,y:interaction.start.panY+ev.clientY-interaction.start.y});return;}if(interaction.kind==='node'&&interaction.id){const p=inv(ev.clientX,ev.clientY);if(Object.keys(draftNodeGroup).length>1){const firstTime=interaction.origin.time;const rawDelta=p.time-firstTime;const ids=Object.keys(draftNodeGroup);const minDelta=Math.max(...ids.map(id=>-((draftNodeGroup[id]??0))));const maxDelta=Math.min(...ids.map(id=>maxT-(draftNodeGroup[id]??0)));const delta=clamp(rawDelta,minDelta,maxDelta);const next:Record<string,number>={};for(const id of ids) next[id]=(draftNodeGroup[id]??0)+delta;setDraftNodeGroup(next);return;}const idx=activeEntries.findIndex(k=>k.id===interaction.id);const prev=idx>0?activeEntries[idx-1]!.time+1e-5:0;const next=idx<activeEntries.length-1?activeEntries[idx+1]!.time-1e-5:maxT;setDraftNode({id:interaction.id,time:clamp(p.time,prev,next),value:p.value});return;}if(interaction.kind==='handle'&&interaction.id&&interaction.handle){const p=inv(ev.clientX,ev.clientY);const oh=interaction.origin.handle??defaultBezier(interaction.handle);const [minV,maxV]=rangeFor(activeProperty);const dx=(p.time-interaction.origin.time)/Math.max(.001,maxT);const dy=(p.value-interaction.origin.value)/Math.max(.001,maxV-minV);setDraftHandle({id:interaction.id,handle:interaction.handle,point:{x:clamp(oh.x+dx,0,1),y:clamp(oh.y+dy,-2,3)}});}};
  const finish=(ev:React.PointerEvent<SVGElement>)=>{if(!interaction)return;ev.stopPropagation();const animations=useProjectStore.getState().animations;if(interaction.kind==='node'&&Object.keys(draftNodeGroup).length>1){const delta=draftNodeGroup[interaction.id!]! - (interaction.origin.time);if(Math.abs(delta)>1e-7)executeCommand(new MoveAnimationKeyframesCommand(animations,Object.keys(draftNodeGroup),delta));} else if(interaction.kind==='node'&&draftNode){if(Math.abs(draftNode.time-interaction.origin.time)>1e-7||Math.abs(draftNode.value-interaction.origin.value)>1e-7)executeCommand(new MoveAnimationKeyframeWithValueCommand(animations,draftNode.id,draftNode.time,draftNode.value));} else if(interaction.kind==='handle'&&draftHandle){const o=interaction.origin.handle??defaultBezier(draftHandle.handle);if(Math.abs(draftHandle.point.x-o.x)>1e-7||Math.abs(draftHandle.point.y-o.y)>1e-7)executeCommand(new SetAnimationKeyframeBezierControlsCommand(animations,[draftHandle.id],{[draftHandle.handle]:draftHandle.point}));}setInteraction(null);setDraftNode(null);setDraftNodeGroup({});setDraftHandle(null);};
  const toggleProperty=(prop:AnimatableProperty)=>setVisibleProperties(ps=>{
    if (ps.includes(prop)) {
      if (ps.length===1) return ps;
      const next=ps.filter(p=>p!==prop);
      if (activeProperty===prop) setActiveProperty(next[0]!);
      return next;
    }
    return [...ps,prop];
  });

  const renderGrid = () => visibleProperties.flatMap((prop,i) => {
    const y = P + i * rowH;
    return [
      <line key={`${prop}-base`} x1={P} y1={y+rowH} x2={W-P} y2={y+rowH} stroke="white" strokeOpacity=".08" />,
      <text key={`${prop}-label`} x={4} y={y+11} fill={COLORS[prop]} fontSize="8">{LABELS[prop]}</text>,
      ...Array.from({length:7},(_,j) => <line key={`${prop}-grid-${j}`} x1={P+(j/6)*plotW} y1={y} x2={P+(j/6)*plotW} y2={y+rowH} stroke="white" strokeOpacity=".035" />),
    ];
  });

  const renderPaths = () => visibleProperties.flatMap(prop => {
    const arr = grouped.get(prop) ?? [];
    return arr.slice(0,-1).map((left,i) => {
      const right = arr[i+1]!;
      const lv = viewNode(left), rv = viewNode(right), out = viewHandle(left,'out'), inn = viewHandle(right,'in');
      const d = Array.from({length:32},(_,j) => {
        const t=j/31;
        const x=lv.time+(rv.time-lv.time)*cubic(0,out.x,inn.x,1,t);
        const y=lv.value+(rv.value-lv.value)*cubic(0,out.y,inn.y,1,t);
        return `${j?'L':'M'} ${tx(x).toFixed(2)} ${ty(prop,y).toFixed(2)}`;
      }).join(' ');
      return <path key={`${prop}-${left.id}`} d={d} fill="none" stroke={COLORS[prop]} strokeWidth={prop===activeProperty?2:1} strokeOpacity={prop===activeProperty ? 0.9:0.35} />;
    });
  });

  const renderNodes = () => (grouped.get(activeProperty) ?? []).map((e, index, arr) => {
    const v=viewNode(e);
    const active=selectedIds.includes(e.id);
    const prev=arr[index-1], next=arr[index+1];
    const ih=viewHandle(e,'in'), oh=viewHandle(e,'out');
    const prevTime=prev ? Math.max(0, v.time-(v.time-prev.time)*ih.x) : v.time;
    const nextTime=next ? v.time+(next.time-v.time)*oh.x : v.time;
    return <g key={e.id}>
      <circle cx={tx(v.time)} cy={ty(activeProperty,v.value)} r={active?4:3} fill={COLORS[activeProperty]} stroke="white" strokeWidth={active?1.5:1} onPointerDown={(ev)=>beginNode(e,ev)} style={{cursor:'move'}} />
      {e.interpolation==='bezier' && prev && <>
        <line x1={tx(v.time)} y1={ty(activeProperty,v.value)} x2={tx(prevTime)} y2={ty(activeProperty,v.value)} stroke={COLORS[activeProperty]} strokeOpacity=".25" />
        <circle cx={tx(prevTime)} cy={ty(activeProperty,v.value)} r="2" fill={COLORS[activeProperty]} fillOpacity=".8" onPointerDown={(ev)=>beginHandle(e,'in',ev)} />
      </>}
      {e.interpolation==='bezier' && next && <>
        <line x1={tx(v.time)} y1={ty(activeProperty,v.value)} x2={tx(nextTime)} y2={ty(activeProperty,v.value)} stroke={COLORS[activeProperty]} strokeOpacity=".25" />
        <circle cx={tx(nextTime)} cy={ty(activeProperty,v.value)} r="2" fill={COLORS[activeProperty]} fillOpacity=".8" onPointerDown={(ev)=>beginHandle(e,'out',ev)} />
      </>}
    </g>;
  });

  return (
    <div className="absolute left-1 right-1 bottom-8 z-50 rounded border border-white/10 bg-black/90 px-2 py-1.5 pointer-events-auto" data-curve-editor="true" data-curve-graph="multi-property" data-clip-id={clipId}>
      <div className="flex flex-wrap items-center gap-1 pb-1 text-[7px] text-white/65">
        <span className="font-black text-white/75">GRAPH</span>
        {PROPERTIES.map(prop => (
          <button key={prop} type="button" aria-pressed={visibleProperties.includes(prop)} onClick={()=>{setActiveProperty(prop);toggleProperty(prop);}} className="rounded px-1 py-0.5 border border-white/10" style={{color:COLORS[prop]}}>{LABELS[prop]}</button>
        ))}
        <span className="ml-auto text-white/45">Active: {LABELS[activeProperty]} · {activeEntries.length} KF · {zoom.toFixed(2)}×</span>
      </div>
      <svg ref={dragRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-44 select-none" role="img" aria-label="Multi-property animation graph" onWheel={(e)=>{e.preventDefault();setZoom(z=>clamp(z*(e.deltaY<0?1.1:.9),.5,4));}} onPointerDown={beginPan} onPointerMove={update} onPointerUp={finish} onPointerCancel={finish}>
        {renderGrid()}
        {renderPaths()}
        {renderNodes()}
      </svg>
      <div className="flex items-center justify-between text-[6px] text-white/40 px-1"><span>Time 0 → {maxT.toFixed(2)}s · each property uses its own value range</span><span>Wheel = zoom · empty graph = pan · Node = move</span></div>
    </div>
  );
};

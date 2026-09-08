import React, { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../../../../store/useProjectStore';
import {
  MoveAnimationKeyframeCommand,
  MoveAnimationKeyframesCommand,
  DeleteAnimationKeyframesCommand,
  SetAnimationKeyframeEasingCommand,
  SetAnimationKeyframeInterpolationCommand,
  SetAnimationKeyframeBezierControlsCommand,
  MoveAnimationKeyframeToPropertyCommand,
} from '../../animation/keyframeCommands';
import { SetAnimationKeyframesCommand } from '../../animation/commands';
import { PasteAnimationKeyframesCommand } from '../../animation/keyframeClipboardCommands';
import type { AnimatableProperty, AnimationEasing, KeyframeBezierControls, AnimationKeyframe } from '../../animation/types/animation';
import { AnimationCurveEditor } from './AnimationCurveEditor';

const PROPERTIES: AnimatableProperty[] = ['transform.x','transform.y','transform.scaleX','transform.scaleY','transform.rotation','transform.opacity'];
const EASINGS: AnimationEasing[] = ['linear','ease-in','ease-out','ease-in-out','back-in','back-out','back-in-out','elastic-out','bounce-out'];
const CLIPBOARD_PREFIX = 'videostudio.animation-keyframes.v1:';

type Entry = AnimationKeyframe & { property: AnimatableProperty };

function writeClipboard(entries: Entry[]) {
  const sorted = [...entries].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  const min = sorted[0]?.time ?? 0;
  return JSON.stringify({
    prefix: CLIPBOARD_PREFIX,
    entries: sorted.map((e) => ({
      property: e.property,
      relativeTime: e.time - min,
      value: e.value,
      interpolation: e.interpolation,
      easing: e.easing,
      bezier: e.bezier,
    })),
  });
}

async function readClipboard(): Promise<Array<{property: AnimatableProperty; relativeTime: number; value: number; interpolation: 'linear'|'bezier'|'hold'; easing: AnimationEasing; bezier?: KeyframeBezierControls}>> {
  if (!navigator.clipboard?.readText) return [];
  const raw = await navigator.clipboard.readText();
  if (!raw.startsWith(CLIPBOARD_PREFIX)) return [];
  const parsed = JSON.parse(raw.slice(CLIPBOARD_PREFIX.length));
  if (!parsed || !Array.isArray(parsed.entries)) return [];
  return parsed.entries.filter((e: any) =>
    PROPERTIES.includes(e.property) && Number.isFinite(e.relativeTime) && Number.isFinite(e.value) &&
    ['linear','bezier','hold'].includes(e.interpolation) && EASINGS.includes(e.easing) &&
    (!e.bezier || (!e.bezier.in || (Number.isFinite(e.bezier.in.x) && Number.isFinite(e.bezier.in.y))) && (!e.bezier.out || (Number.isFinite(e.bezier.out.x) && Number.isFinite(e.bezier.out.y))))
  );
}

export const TimelineAnimationMarkers: React.FC<{ clipId: string; clipStart: number; clipDuration: number; pixelsPerSecond: number }> = ({ clipId, clipStart, clipDuration, pixelsPerSecond }) => {
  const animations = useProjectStore(s => s.animations) ?? [];
  const selectedNodeIds = useProjectStore(s => s.selectedNodeIds);
  const selected = selectedNodeIds.includes(clipId);
  const currentTime = useProjectStore(s => s.currentTime);
  const setCurrentTime = useProjectStore(s => s.setCurrentTime);
  const executeCommand = useProjectStore(s => s.executeCommand);
  const selectedKeyframes = useProjectStore(s => s.selectedKeyframeIds) ?? [];
  const setSelectedKeyframes = useProjectStore(s => s.setSelectedKeyframeIds);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; anchorTime: number } | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [easing, setEasing] = useState<AnimationEasing>('linear');
  const [interpolation, setInterpolation] = useState<'linear'|'bezier'|'hold'>('linear');
  const [bezierX, setBezierX] = useState(0.25);
  const entries = useMemo<Entry[]>(() => animations.find(a => a.elementId === clipId)?.tracks
    ?.filter(t => t.enabled && PROPERTIES.includes(t.property))
    .flatMap(track => (track.keyframes ?? []).map(k => ({ id: k.id, property: track.property, time: k.time, value: k.value, interpolation: k.interpolation, easing: k.easing, bezier: k.bezier }))) ?? [], [animations, clipId]);
  const visible = entries.filter(e => e.time >= -1e-7 && e.time <= clipDuration + 1e-7);
  const selectedSet = new Set(selectedKeyframes);
  const selectedEntries = visible.filter(e => selectedSet.has(e.id));

  useEffect(() => {
    const validIds = selectedKeyframes.filter(id => visible.some(e => e.id === id));
    if (validIds.length !== selectedKeyframes.length) {
      setSelectedKeyframes(validIds);
    }
  }, [clipId, animations, clipDuration]);

  const addAtCurrentTime = () => {
    const local = Math.max(0, Math.min(clipDuration, currentTime - clipStart));
    const projectStore = useProjectStore.getState();
    const clip = projectStore.tracks.flatMap(t => t.clips).find(c => c.id === clipId);
    if (!clip) return;
    const existingAnimation = animations.find(a => a.elementId === clipId);
    const newEntries: Array<{ property: AnimatableProperty; time: number; value: number }> = PROPERTIES.map(property => {
      const base = property === 'transform.x' ? clip.transform.x : property === 'transform.y' ? clip.transform.y : property === 'transform.scaleX' ? (clip.transform.scaleX ?? clip.transform.scale ?? 100) : property === 'transform.scaleY' ? (clip.transform.scaleY ?? clip.transform.scale ?? 100) : property === 'transform.rotation' ? clip.transform.rotation : (clip.transform.opacity ?? 100);
      const track = existingAnimation?.tracks.find(t => t.property === property);
      const existing = track?.keyframes.find(k => Math.abs(k.time - local) < 1e-6);
      return { property, time: local, value: existing?.value ?? base };
    });
    executeCommand(new SetAnimationKeyframesCommand({ elementId: clipId, entries: newEntries }, animations));
  };

  const beginKeyframeDrag = (e: React.PointerEvent<HTMLDivElement>, entry: Entry) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ids = selectedSet.has(entry.id) ? selectedKeyframes : [entry.id];
    if (!selectedSet.has(entry.id)) {
      setSelectedKeyframes(ids);
      setCurrentTime(clipStart + entry.time);
    }
    setDraggingIds(ids);
    setDragStart({ x: e.clientX, anchorTime: entry.time });
    setDragTime(entry.time);
  };

  const finishKeyframeDrag = (e: React.PointerEvent<HTMLDivElement>, entry: Entry) => {
    e.stopPropagation();
    if (!dragStart || draggingIds.length === 0) return;
    const rawDelta = (e.clientX - dragStart.x) / Math.max(1, pixelsPerSecond);
    const minSelectedTime = Math.min(...selectedEntries.filter(k => draggingIds.includes(k.id)).map(k => k.time), entry.time);
    const maxSelectedTime = Math.max(...selectedEntries.filter(k => draggingIds.includes(k.id)).map(k => k.time), entry.time);
    const maxDelta = Math.max(0, clipDuration - maxSelectedTime);
    const minDelta = -minSelectedTime;
    const delta = Math.max(minDelta, Math.min(maxDelta, rawDelta));
    if (draggingIds.length === 1) {
      const target = Math.max(0, Math.min(clipDuration, entry.time + delta));
      if (Math.abs(target - entry.time) > 1e-7) executeCommand(new MoveAnimationKeyframeCommand(useProjectStore.getState().animations, entry.id, target));
    } else if (Math.abs(delta) > 1e-7) {
      executeCommand(new MoveAnimationKeyframesCommand(useProjectStore.getState().animations, draggingIds, delta));
    }
    setDraggingIds([]); setDragStart(null); setDragTime(null);
  };

  const copySelected = async () => {
    if (!selectedEntries.length) return;
    try { await navigator.clipboard.writeText(writeClipboard(selectedEntries)); useProjectStore.getState().showToast(`📋 ${selectedEntries.length} keyframe${selectedEntries.length > 1 ? 's' : ''} copied`); } catch { useProjectStore.getState().showToast('Clipboard access denied'); }
  };

  const pasteAtPlayhead = async () => {
    try {
      const clipboardEntries = await readClipboard();
      if (!clipboardEntries.length) return;
      const local = Math.max(0, Math.min(clipDuration, currentTime - clipStart));
      executeCommand(new PasteAnimationKeyframesCommand(useProjectStore.getState().animations, clipId, clipboardEntries, local));
      useProjectStore.getState().showToast(`📌 ${clipboardEntries.length} keyframes pasted`);
    } catch { useProjectStore.getState().showToast('Clipboard does not contain Video Studio keyframes'); }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (active && ['INPUT','TEXTAREA','SELECT'].includes(active.tagName)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'c') { e.preventDefault(); void copySelected(); }
      if (meta && e.key.toLowerCase() === 'v') { e.preventDefault(); void pasteAtPlayhead(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedKeyframes.length) {
        e.preventDefault(); executeCommand(new DeleteAnimationKeyframesCommand(useProjectStore.getState().animations, selectedKeyframes));
        setSelectedKeyframes([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedKeyframes, clipId, clipDuration, clipStart, currentTime, executeCommand]);

  const applyEasing = (next: AnimationEasing) => {
    setEasing(next);
    if (selectedKeyframes.length) executeCommand(new SetAnimationKeyframeEasingCommand(useProjectStore.getState().animations, selectedKeyframes, next));
  };

  const applyBezierHandle = (which: 'in'|'out', axis: 'x'|'y', nextValue: number) => {
    const entry = selectedEntries[0];
    if (!entry || entry.interpolation !== 'bezier' || selectedEntries.length !== 1) return;
    const minVal = axis === 'x' ? 0 : -2;
    const maxVal = axis === 'x' ? 1 : 3;
    const next = Math.max(minVal, Math.min(maxVal, Number.isFinite(nextValue) ? nextValue : 0.5));
    const existing = entry.bezier ?? {};
    const current = existing[which] ?? (which === 'out' ? { x: 0.25, y: 0.25 } : { x: 0.75, y: 0.75 });
    const handle = { x: axis === 'x' ? next : current.x, y: axis === 'y' ? next : current.y };
    executeCommand(new SetAnimationKeyframeBezierControlsCommand(useProjectStore.getState().animations, [entry.id], { [which]: handle }));
  };

  const applyInterpolation = (next: 'linear'|'bezier'|'hold') => {
    setInterpolation(next);
    if (selectedKeyframes.length) executeCommand(new SetAnimationKeyframeInterpolationCommand(useProjectStore.getState().animations, selectedKeyframes, next));
  };

  const moveSelectedToProperty = (property: AnimatableProperty) => {
    if (selectedEntries.length !== 1 || selectedEntries[0]!.property === property) return;
    const entry = selectedEntries[0]!;
    executeCommand(new MoveAnimationKeyframeToPropertyCommand(useProjectStore.getState().animations, entry.id, property));
    setSelectedKeyframes([]);
  };

  if (!selected) return null;

  return <>
    <div className="absolute left-1 bottom-1 z-50 flex items-center gap-1 pointer-events-auto">
      <span className="text-[6px] font-mono text-white/40 pointer-events-none">ANIM</span>
      <button type="button" title="Add transform keyframes at playhead" onClick={(e) => { e.stopPropagation(); addAtCurrentTime(); }} className="rounded bg-black/55 border border-white/10 px-1 text-[7px] font-black text-white/80 hover:text-white">KF+</button>
      <select aria-label="Keyframe interpolation" value={interpolation} onChange={(e) => { e.stopPropagation(); applyInterpolation(e.target.value as 'linear'|'bezier'|'hold'); }} className="h-4 rounded bg-black/70 border border-white/10 text-[7px] text-white/80">
        {(['linear','bezier','hold'] as const).map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      <select aria-label="Keyframe easing" value={easing} onChange={(e) => { e.stopPropagation(); applyEasing(e.target.value as AnimationEasing); }} className="h-4 rounded bg-black/70 border border-white/10 text-[7px] text-white/80">
        {EASINGS.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      {selectedEntries.length === 1 && <select aria-label="Move keyframe to property" value={selectedEntries[0]!.property} onChange={(e) => { e.stopPropagation(); moveSelectedToProperty(e.target.value as AnimatableProperty); }} className="h-4 rounded bg-black/70 border border-white/10 text-[7px] text-white/80">
        {PROPERTIES.map(value => <option key={value} value={value}>{value}</option>)}
      </select>}
      {selectedEntries.length === 1 && selectedEntries[0]?.interpolation === 'bezier' && <>
        <label className="flex items-center gap-0.5 text-[6px] text-white/50">IN-X<input aria-label="Bezier In X" type="number" min="0" max="1" step="0.01" value={selectedEntries[0]?.bezier?.in?.x ?? 0.75} onChange={(e) => { e.stopPropagation(); applyBezierHandle('in','x', Number(e.target.value)); }} className="w-8 h-4 bg-black/70 border border-white/10 rounded px-1 text-[7px] text-white" /></label>
        <label className="flex items-center gap-0.5 text-[6px] text-white/50">IN-Y<input aria-label="Bezier In Y" type="number" min="-2" max="3" step="0.01" value={selectedEntries[0]?.bezier?.in?.y ?? 0.75} onChange={(e) => { e.stopPropagation(); applyBezierHandle('in','y', Number(e.target.value)); }} className="w-8 h-4 bg-black/70 border border-white/10 rounded px-1 text-[7px] text-white" /></label>
        <label className="flex items-center gap-0.5 text-[6px] text-white/50">OUT-X<input aria-label="Bezier Out X" type="number" min="0" max="1" step="0.01" value={selectedEntries[0]?.bezier?.out?.x ?? 0.25} onChange={(e) => { e.stopPropagation(); applyBezierHandle('out','x', Number(e.target.value)); }} className="w-8 h-4 bg-black/70 border border-white/10 rounded px-1 text-[7px] text-white" /></label>
        <label className="flex items-center gap-0.5 text-[6px] text-white/50">OUT-Y<input aria-label="Bezier Out Y" type="number" min="-2" max="3" step="0.01" value={selectedEntries[0]?.bezier?.out?.y ?? 0.25} onChange={(e) => { e.stopPropagation(); applyBezierHandle('out','y', Number(e.target.value)); }} className="w-8 h-4 bg-black/70 border border-white/10 rounded px-1 text-[7px] text-white" /></label>
      </>}
    </div>
    {selectedEntries.length > 0 && <div className="absolute right-1 bottom-1 z-50 flex gap-1 pointer-events-auto">
      <button type="button" title="Copy selected keyframes" onClick={(e) => { e.stopPropagation(); void copySelected(); }} className="rounded bg-black/55 border border-white/10 px-1 text-[7px] text-white/80">Copy</button>
      <button type="button" title="Paste keyframes at playhead" onClick={(e) => { e.stopPropagation(); void pasteAtPlayhead(); }} className="rounded bg-black/55 border border-white/10 px-1 text-[7px] text-white/80">Paste</button>
      <button type="button" title="Delete selected keyframes" onClick={(e) => { e.stopPropagation(); executeCommand(new DeleteAnimationKeyframesCommand(useProjectStore.getState().animations, selectedKeyframes)); setSelectedKeyframes([]); }} className="rounded bg-black/55 border border-white/10 px-1 text-[7px] text-white/80">Delete</button>
    </div>}
    {visible.map(k => {
      const left = Math.max(1, Math.min(Math.max(2, clipDuration * pixelsPerSecond - 4), (dragTime !== null && draggingIds.includes(k.id) ? dragTime : k.time) * pixelsPerSecond));
      const active = selectedSet.has(k.id);
      return <div key={k.id} title={`${k.property} @ ${k.time.toFixed(2)}s`} onPointerDown={(e) => beginKeyframeDrag(e, k)} onPointerMove={(e) => { if (draggingIds.includes(k.id) && dragStart) setDragTime(Math.max(0, Math.min(clipDuration, dragStart.anchorTime + (e.clientX - dragStart.x) / Math.max(1, pixelsPerSecond)))); }} onPointerUp={(e) => finishKeyframeDrag(e, k)} onClick={(e) => { e.stopPropagation(); if (e.shiftKey) setSelectedKeyframes(selectedKeyframes.includes(k.id) ? selectedKeyframes.filter(id => id !== k.id) : [...selectedKeyframes, k.id]); else { setSelectedKeyframes([k.id]); setCurrentTime(clipStart + k.time); } }} onDoubleClick={(e) => { e.stopPropagation(); setCurrentTime(clipStart + k.time); }} className={`pointer-events-auto absolute bottom-[3px] z-50 h-2 w-2 -translate-x-1/2 rotate-45 border cursor-ew-resize ${active ? 'bg-cyan-300 border-white shadow-[0_0_6px_rgba(34,211,238,0.9)]' : 'bg-yellow-300 border-white/80'}`} style={{ left }} />;
    })}
    {visible.length > 0 && <div className="absolute inset-x-0 bottom-0 h-px bg-yellow-300/25 pointer-events-none" />}
    {selectedEntries.length > 0 && <AnimationCurveEditor clipId={clipId} clipStart={clipStart} clipDuration={clipDuration} selected={selectedEntries[0]!} entries={visible} pixelsPerSecond={pixelsPerSecond} selectedIds={selectedKeyframes} onSelectKeyframes={setSelectedKeyframes} />}
  </>;
};

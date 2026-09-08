import React from 'react';
import { Layers, Move, RotateCw, Lock, Eye } from 'lucide-react';
import { useInspectorController } from './InspectorController';
import { createTrackSnapshotCommand } from '../../features/video-studio/project/commands';
import { SetAnimationKeyframeValueCommand } from '../../features/video-studio/animation/keyframeCommands';
import { useProjectStore } from '../../store/useProjectStore';

export const UniversalTransformControls: React.FC<{ id?: string }> = ({ id = 'universal_transform_controls' }) => {
  const {
    activeNode,
    tracks,
    selectedNodeIds,
    updateNodesProperty,
    executeCommand,
    uniformScale,
    setUniformScale,
  } = useInspectorController();

  const autoKeyframeEnabled = useProjectStore((state) => state.autoKeyframeEnabled);
  const animations = useProjectStore((state) => state.animations) ?? [];
  const selectedKeyframeIds = useProjectStore((state) => state.selectedKeyframeIds) ?? [];
  const setCurrentTime = useProjectStore((state) => state.setCurrentTime);
  const setAutoKeyframeEnabled = useProjectStore((state) => state.setAutoKeyframeEnabled);

  const transform = activeNode.transform;
  const scale = transform.scale ?? 100;
  const scaleX = transform.scaleX ?? 100;
  const scaleY = transform.scaleY ?? 100;
  const x = transform.x ?? 0;
  const y = transform.y ?? 0;
  const rotation = transform.rotation ?? 0;
  const opacity = transform.opacity ?? 100;
  const selectedKeyframe = selectedKeyframeIds.length === 1
    ? animations.find((a) => a.elementId === activeNode.id)?.tracks.flatMap((t) => (t.keyframes ?? []).map((k) => ({ ...k, property: t.property }))).find((k) => k.id === selectedKeyframeIds[0])
    : undefined;

  const valueFor = (property: string, fallback: number) =>
    selectedKeyframe?.property === property ? selectedKeyframe.value : fallback;

  const updateTransformValue = (property: string, value: number) => {
    if (selectedKeyframe?.property === property) {
      executeCommand(new SetAnimationKeyframeValueCommand(useProjectStore.getState().animations, selectedKeyframe.id, value));
      return;
    }
    updateNodesProperty(selectedNodeIds, property, value);
  };


  const clampScale = (value: number) => Math.max(10, Math.min(500, value));

  const updateAxisScale = (axis: 'scaleX' | 'scaleY', value: number) => {
    const next = clampScale(value);
    if (!uniformScale) {
      updateNodesProperty(selectedNodeIds, `transform.${axis}`, next);
      return;
    }

    // Width/height changes with the aspect lock are one user action and must
    // therefore produce one history entry for the whole selection.
    const currentTracks = tracks;
    const nextTracks = currentTracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (!selectedNodeIds.includes(clip.id)) return clip;
        return {
          ...clip,
          transform: {
            ...clip.transform,
            scaleX: next,
            scaleY: next,
          },
        };
      }),
    }));

    executeCommand(createTrackSnapshotCommand('Aspect-Locked Transform', currentTracks, nextTracks));
  };

  return (
    <section id={id} className="space-y-3 bg-black/10 border border-cyan-500/10 p-3 rounded-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[10px] uppercase font-black tracking-wider text-gray-300">Universal Transform</span>
        </div>
        <button
          type="button"
          onClick={() => setUniformScale(!uniformScale)}
          className={`px-2 py-1 rounded border text-[8px] font-bold uppercase tracking-wider cursor-pointer ${uniformScale ? 'text-cyan-300 border-cyan-400/20 bg-cyan-500/10' : 'text-gray-500 border-white/5 bg-white/5'}`}
        >
          <Lock className="inline w-3 h-3 mr-1" />
          Aspect {uniformScale ? 'Locked' : 'Free'}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setAutoKeyframeEnabled(!autoKeyframeEnabled)}
        className={`w-full flex items-center justify-between rounded-lg border px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider ${autoKeyframeEnabled ? 'border-amber-400/30 bg-amber-500/10 text-amber-300' : 'border-white/5 bg-white/5 text-gray-500'}`}
        title="When enabled, Preview and Inspector transform edits create/update a keyframe at the current playhead"
      >
        <span>Auto-Keyframe</span>
        <span>{autoKeyframeEnabled ? 'On' : 'Off'}</span>
      </button>

      {selectedKeyframe && <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 px-2 py-1.5 text-[8px] text-amber-200/80 flex items-center justify-between">
        <span>Editing Keyframe · {selectedKeyframe.property}</span>
        <button type="button" className="font-mono text-amber-300 hover:text-amber-200" onClick={() => setCurrentTime(activeNode.startAt + selectedKeyframe.time)}>{(activeNode.startAt + selectedKeyframe.time).toFixed(2)}s</button>
      </div>}

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[8px] font-bold uppercase text-gray-500">X
          <input type="number" value={Math.round(valueFor('transform.x', x))} onChange={(e) => updateTransformValue('transform.x', Number(e.target.value) || 0)} className="mt-1 w-full bg-[#111218] border border-white/5 rounded-lg px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="block text-[8px] font-bold uppercase text-gray-500">Y
          <input type="number" value={Math.round(valueFor('transform.y', y))} onChange={(e) => updateTransformValue('transform.y', Number(e.target.value) || 0)} className="mt-1 w-full bg-[#111218] border border-white/5 rounded-lg px-2 py-1.5 text-xs text-white" />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="block text-[8px] font-bold uppercase text-gray-500">Scale
          <input type="number" min="10" max="500" value={Math.round(valueFor('transform.scale', scale))} onChange={(e) => updateTransformValue('transform.scale', clampScale(Number(e.target.value) || 10))} className="mt-1 w-full bg-[#111218] border border-white/5 rounded-lg px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="block text-[8px] font-bold uppercase text-gray-500">Width
          <input type="number" min="10" max="500" value={Math.round(valueFor('transform.scaleX', scaleX))} onChange={(e) => selectedKeyframe?.property === 'transform.scaleX' ? updateTransformValue('transform.scaleX', Number(e.target.value) || 10) : updateAxisScale('scaleX', Number(e.target.value) || 10)} className="mt-1 w-full bg-[#111218] border border-white/5 rounded-lg px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="block text-[8px] font-bold uppercase text-gray-500">Height
          <input type="number" min="10" max="500" value={Math.round(valueFor('transform.scaleY', scaleY))} onChange={(e) => selectedKeyframe?.property === 'transform.scaleY' ? updateTransformValue('transform.scaleY', Number(e.target.value) || 10) : updateAxisScale('scaleY', Number(e.target.value) || 10)} className="mt-1 w-full bg-[#111218] border border-white/5 rounded-lg px-2 py-1.5 text-xs text-white" />
        </label>
      </div>

      <div className="space-y-1">
        <label className="text-[8px] font-bold uppercase text-gray-500 flex items-center gap-1"><RotateCw className="w-3 h-3" /> Rotation</label>
        <div className="flex gap-2 items-center">
          <input type="range" min="-180" max="180" step="1" value={valueFor('transform.rotation', rotation)} onChange={(e) => updateTransformValue('transform.rotation', Number(e.target.value))} className="flex-1 accent-cyan-400" />
          <span className="w-12 text-right text-[9px] font-mono text-cyan-400">{Math.round(valueFor('transform.rotation', rotation))}°</span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[8px] font-bold uppercase text-gray-500 flex items-center gap-1"><Eye className="w-3 h-3" /> Opacity</label>
        <input type="range" min="0" max="100" step="1" value={valueFor('transform.opacity', opacity)} onChange={(e) => updateTransformValue('transform.opacity', Number(e.target.value))} className="w-full accent-cyan-400" />
      </div>

      <div className="text-[8px] text-gray-600 flex items-center gap-1"><Move className="w-3 h-3" /> Drag in Preview or edit exact values here.</div>
    </section>
  );
};

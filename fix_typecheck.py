from pathlib import Path
p=Path('/mnt/data/work_rar')

# App.tsx
f=p/'src/App.tsx'; s=f.read_text()
s=s.replace("    newScript[index].text = editValue;", "    const targetLine = newScript[index];\n    if (!targetLine) return;\n    targetLine.text = editValue;")
s=s.replace("        if (match && match[1].length < 50) {\n          addCurrentTurn();\n          currentSpeaker = match[1].trim();\n          currentText = match[2];", "        const speakerPart = match?.[1];\n        const textPart = match?.[2];\n        if (speakerPart !== undefined && textPart !== undefined && speakerPart.length < 50) {\n          addCurrentTurn();\n          currentSpeaker = speakerPart.trim();\n          currentText = textPart;")
s=s.replace("        emotion: defaultEmotions[i % defaultEmotions.length]", "        emotion: defaultEmotions[i % defaultEmotions.length] ?? 'Neutral'")
s=s.replace("            style={{ width: audioProgress.includes('part') ? `${(parseInt(audioProgress.split('part ')[1].split(' ')[0]) / parseInt(audioProgress.split('of ')[1])) * 100}%` : '100%' }}", "            style={{ width: (() => {\n              if (!audioProgress.includes('part')) return '100%';\n              const partMatch = audioProgress.match(/part\\s+(\\d+)\\s+of\\s+(\\d+)/i);\n              if (!partMatch) return '0%';\n              const part = Number(partMatch[1]);\n              const total = Number(partMatch[2]);\n              return total > 0 ? `${Math.min(100, Math.max(0, (part / total) * 100))}%` : '0%';\n            })() }}")
f.write_text(s)

# Text inspector
f=p/'src/components/inspector/panels/TextInspectorPanel.tsx'; s=f.read_text().replace("textContent.replace(/\\w\\S*/g, (w) =>", "textContent.replace(/\\w\\S*/g, (w: string) =>"); f.write_text(s)

# Audio wave
f=p/'src/components/player/AudioWaveOverlay.tsx'; s=f.read_text().replace("bars[0] / 320", "(bars[0] ?? 0) / 320"); f.write_text(s)

# Cyberpunk preset
f=p/'src/components/player/CyberpunkSubscribe.tsx'; s=f.read_text()
s=s.replace("(activeLogoPreset ?? CYBERPUNK_LOGO_PRESETS[0]).color", "(activeLogoPreset ?? CYBERPUNK_LOGO_PRESETS[0] ?? CYBERPUNK_LOGO_PRESETS[0]).color")
s=s.replace("(activeLogoPreset ?? CYBERPUNK_LOGO_PRESETS[0]).emoji", "(activeLogoPreset ?? CYBERPUNK_LOGO_PRESETS[0] ?? CYBERPUNK_LOGO_PRESETS[0]).emoji")
f.write_text(s)

# SubtitleRenderer transitions
f=p/'src/components/player/SubtitleRenderer.tsx'; s=f.read_text()
s=s.replace("type: 'spring',\n        stiffness", "type: 'spring' as const,\n        stiffness")
s=s.replace("type: 'tween',\n        ease: 'linear'", "type: 'tween' as const,\n        ease: 'linear' as const")
s=s.replace("type: 'tween',\n        ease: 'easeInOut'", "type: 'tween' as const,\n        ease: 'easeInOut' as const")
s=s.replace("    type: 'spring',\n    stiffness: 300", "    type: 'spring' as const,\n    stiffness: 300")
f.write_text(s)

# Preview compositor zIndex
f=p/'src/features/video-studio/playback/compositor/previewCompositorIndex.ts'; s=f.read_text()
s=s.replace("export interface IndexedPreviewClip extends OrderedClip {\n  endAt: number;\n}", "export interface IndexedPreviewClip extends OrderedClip {\n  endAt: number;\n  zIndex: number;\n}")
s=s.replace("        endAt: clip.startAt + getEffectiveClipTimelineDuration(clip),", "        endAt: clip.startAt + getEffectiveClipTimelineDuration(clip),\n        zIndex: getPreviewLayerZIndex(role, trackIndex, clipIndex),")
s=s.replace("          endAt: clip.startAt + getEffectiveClipTimelineDuration(clip),", "          endAt: clip.startAt + getEffectiveClipTimelineDuration(clip),\n          zIndex: getPreviewLayerZIndex('overlay', trackIndex, clipIndex),")
f.write_text(s)

# VirtualizedTimeline match and refs/handlers
f=p/'src/components/timeline/VirtualizedTimeline.tsx'; s=f.read_text()
s=s.replace("    const match = searchMatches[nextIdx];\n    setSelectedNodeIds([match.clipId]);", "    const match = searchMatches[nextIdx];\n    if (!match) return;\n    setSelectedNodeIds([match.clipId]);")
s=s.replace("    const match = searchMatches[currentMatchIndex];\n    \n    const initialTracks", "    const match = searchMatches[currentMatchIndex];\n    if (!match) return;\n    \n    const initialTracks")
# refs are typically above; replace generic declarations
s=s.replace("const workspaceRef = useRef<HTMLDivElement>(null);", "const workspaceRef = useRef<HTMLDivElement | null>(null);")
s=s.replace("const timelineRef = useRef<HTMLDivElement>(null);", "const timelineRef = useRef<HTMLDivElement | null>(null);")
f.write_text(s)

# Workspace types: allow null refs and precise handlers
f=p/'src/features/video-studio/timeline/components/TimelineWorkspace.tsx'; s=f.read_text()
s=s.replace("workspaceRef: React.RefObject<HTMLDivElement>;", "workspaceRef: React.RefObject<HTMLDivElement | null>;")
s=s.replace("timelineRef: React.RefObject<HTMLDivElement>;", "timelineRef: React.RefObject<HTMLDivElement | null>;")
s=s.replace("handleWorkspaceMouseDown: (event: React.PointerEvent<HTMLDivElement>, trackId: string) => void;", "handleWorkspaceMouseDown: (event: React.MouseEvent<HTMLDivElement>, trackId: string) => void;")
s=s.replace("handleContextMenu: (event: React.PointerEvent<HTMLDivElement>, clipId?: string, trackId?: string) => void;", "handleContextMenu: (event: React.MouseEvent<HTMLDivElement>, clipId?: string, trackId?: string) => void;")
s=s.replace("handleClipMouseDown: (event: React.PointerEvent<HTMLDivElement>, clipId: string, trackId: string, trackType: string) => void;", "handleClipMouseDown: (event: React.PointerEvent<HTMLDivElement>, clipId: string, trackId: string, trackType: Track['type']) => void;")
s=s.replace("handleClipDoubleClick: (event: React.MouseEvent, clip: ClipNode, trackType: string) => void;", "handleClipDoubleClick: (event: React.MouseEvent<Element>, clip: ClipNode, trackType: string) => void;")
s=s.replace("activeDrag: unknown;", "activeDrag: import('./timelineInteractionTypes').ActiveDrag | null;")
f.write_text(s)

# TrackRow context/mousedown mouse event types
f=p/'src/features/video-studio/timeline/components/TimelineTrackRow.tsx'; s=f.read_text()
s=s.replace("handleWorkspaceMouseDown: (event: React.PointerEvent<HTMLDivElement>, trackId: string) => void;", "handleWorkspaceMouseDown: (event: React.MouseEvent<HTMLDivElement>, trackId: string) => void;")
s=s.replace("handleContextMenu: (event: React.PointerEvent<HTMLDivElement>, clipId?: string, trackId?: string) => void;", "handleContextMenu: (event: React.MouseEvent<HTMLDivElement>, clipId?: string, trackId?: string) => void;")
f.write_text(s)

# TimelineClip context menu type
f=p/'src/features/video-studio/timeline/components/TimelineClip.tsx'; s=f.read_text().replace("handleContextMenu: (event: React.PointerEvent<HTMLDivElement>, clipId?: string, trackId?: string) => void;", "handleContextMenu: (event: React.MouseEvent<HTMLDivElement>, clipId?: string, trackId?: string) => void;"); f.write_text(s)

# TrackBoard sorted access
f=p/'src/features/video-studio/timeline/components/TimelineTrackBoard.tsx'; s=f.read_text().replace("      const type = sortedTracks[index].type;", "      const track = sortedTracks[index];\n      if (!track) continue;\n      const type = track.type;"); f.write_text(s)

# ResourceSidebar file guard and onClick wrapper
f=p/'src/components/workspace/ResourceSidebar.tsx'; s=f.read_text()
s=s.replace("    const file = files[0];\n    const isAudio", "    const file = files[0];\n    if (!file) return;\n    const isAudio")
s=s.replace("onClick={handleAutoCaption}", "onClick={() => { void handleAutoCaption(); }}")
f.write_text(s)

# Persistence callback typing
f=p/'src/features/video-studio/project/services/projectPersistenceService.ts'; s=f.read_text().replace("? track.clips.map((clip) => {", "? track.clips.map((clip: Track['clips'][number]) => {"); f.write_text(s)

# VideoPlayer bounce prop - add prop declaration, and uses already pass it
f=p/'src/components/player/SubtitleRenderer.tsx'; s=f.read_text()
needle="  clipEnd?: number;\n"
if needle in s and "bounceDuration?: number;" not in s:
    s=s.replace(needle, needle+"  bounceDuration?: number;\n")
f.write_text(s)

# Virtualized drag handler row type annotation - target exact
f=p/'src/components/timeline/VirtualizedTimeline.tsx'; s=f.read_text().replace("hitTestIndexRef.current?.rows.map((row) => row.trackId)", "hitTestIndexRef.current?.rows.map((row: { trackId: string }) => row.trackId)"); f.write_text(s)

print('patched')

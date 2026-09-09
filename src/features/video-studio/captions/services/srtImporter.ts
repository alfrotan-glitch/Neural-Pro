import { useProjectStore } from '../../../../store/useProjectStore';
import { createTrackSnapshotCommand } from '../../project/commands';
import { parseCaptionTimestamp } from './captionTimecodeService';
import { getProjectFps } from './captionProjectFps';
import { toAppError } from '../../../../domain/errors/appError';
import { runCaptions } from '../../../../app/workflows/captions/runCaptionsWorkflow';
import { normalizeCaptionTiming, normalizeCaptionTheme, resolveCaptionImportTheme } from './captionImportService';
import type { Track, ClipNode } from '../../project/types/project';

export interface ParsedSrtItem {
  id: string | number;
  start_time: string | number;
  end_time: string | number;
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
  wordTimingSource?: string;
}

/**
 * Client-side fallback parser for standard .srt subtitle files.
 */
export function parseSrtClient(content: string, fps: number): ParsedSrtItem[] {
  if (!content || !content.trim()) return [];

  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = normalized.split(/\n\n+/);
  const items: ParsedSrtItem[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const rawBlock = blocks[i];
    if (!rawBlock) continue;
    const block = rawBlock.trim();
    if (!block) continue;

    const lines = block.split('\n');
    let timeLineIdx = -1;

    for (let j = 0; j < lines.length; j++) {
      const line = lines[j];
      if (line && line.includes('-->')) {
        timeLineIdx = j;
        break;
      }
    }

    if (timeLineIdx === -1) continue;

    const firstLine = lines[0]?.trim();
    const id = timeLineIdx > 0 && firstLine ? firstLine : String(items.length + 1);
    const timeLine = lines[timeLineIdx]?.trim() || '';
    const timeParts = timeLine.split(/\s*-->\s*/);

    if (timeParts.length < 2 || !timeParts[0] || !timeParts[1]) continue;

    const startTimeRaw = timeParts[0].trim();
    const endTimeRaw = (timeParts[1].split(/\s+/)[0] || '').trim();

    if (!startTimeRaw || !endTimeRaw) continue;

    // Clean text lines (remove potential HTML formatting tags like <i>, <font>, etc.)
    const textLines = lines.slice(timeLineIdx + 1);
    const rawText = textLines.join('\n').replace(/<[^>]*>/g, '').trim();

    if (!rawText) continue;

    try {
      const startSeconds = parseCaptionTimestamp(startTimeRaw, fps);
      const endSeconds = parseCaptionTimestamp(endTimeRaw, fps);
      const duration = Math.max(0.1, endSeconds - startSeconds);

      // Generate inferred word timestamps
      const wordsList = rawText.split(/\s+/).filter(Boolean);
      const words = wordsList.map((word, wIdx) => {
        const wordStart = startSeconds + (wIdx / wordsList.length) * duration;
        const wordEnd = startSeconds + ((wIdx + 1) / wordsList.length) * duration;
        return {
          word,
          start: parseFloat(wordStart.toFixed(3)),
          end: parseFloat(wordEnd.toFixed(3))
        };
      });

      items.push({
        id: String(id || items.length + 1),
        start_time: startTimeRaw,
        end_time: endTimeRaw,
        text: rawText,
        words,
        wordTimingSource: 'inferred'
      });
    } catch {
      // Ignore unparseable block
    }
  }

  return items;
}

/**
 * Imports an SRT file, deserializes its captions, and inserts them onto a dedicated text track in the timeline.
 */
export async function importSrtFile(
  file: File,
  options?: {
    captionTheme?: string;
    captionDisplayMode?: 'line' | 'word' | 'page';
    onSuccess?: (count: number) => void;
  }
): Promise<boolean> {
  const store = useProjectStore.getState();
  store.showToast(`📂 Loading ${file.name}...`);

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onerror = () => {
      store.showToast('❌ Failed to read SRT file.');
      resolve(false);
    };

    reader.onload = async (e) => {
      const content = e.target?.result;
      if (typeof content !== 'string' || !content.trim()) {
        store.showToast('❌ SRT file is empty.');
        resolve(false);
        return;
      }

      let projectFps: number;
      try {
        projectFps = getProjectFps();
      } catch (fpsError) {
        store.showToast(`❌ ${toAppError(fpsError, 'The project frame rate is not valid.').message}`);
        resolve(false);
        return;
      }

      let captions: ParsedSrtItem[] = [];

      try {
        // Server-side parse through the caption workflow (validated + typed).
        const parsed = await runCaptions({
          source: 'import-srt',
          srtContent: content,
          projectFps,
        });
        if (Array.isArray(parsed) && parsed.length > 0) {
          captions = parsed as ParsedSrtItem[];
        }
      } catch {
        // Both paths below are real parses of the same file: the local parser is
        // a legitimate fallback, not substitute AI content.
      }

      // Fallback to robust client parser
      if (captions.length === 0) {
        captions = parseSrtClient(content, projectFps);
      }

      if (captions.length === 0) {
        store.showToast('❌ No valid subtitle blocks found in SRT file.');
        resolve(false);
        return;
      }

      const currentTracks = store.tracks;
      const currentCaptionTrack = currentTracks.find((t: Track) => t.type === 'text');
      const existingCaptionTheme = currentCaptionTrack?.clips.find((clip: ClipNode) =>
        normalizeCaptionTheme(clip.properties?.captionTheme)
      )?.properties?.captionTheme;
      const theme = options?.captionTheme || resolveCaptionImportTheme({ existingCaptionTheme }) || 'glow';
      const displayMode = options?.captionDisplayMode || 'line';

      const newClips: ClipNode[] = captions.map((cap, idx) => {
        const timing = normalizeCaptionTiming(
          {
            id: String(cap.id || idx + 1),
            start_time: cap.start_time,
            end_time: cap.end_time,
            text: cap.text,
            words: cap.words || [],
          },
          projectFps,
        );

        return {
          id: `srt_${Date.now()}_${idx}`,
          sourceId: `srt_src_${idx}`,
          startAt: parseFloat(timing.startAt.toFixed(3)),
          duration: timing.duration,
          trim: { in: 0, out: timing.duration },
          transform: { x: 0, y: 65, scale: 100, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100 },
          properties: {
            name: `SRT ${idx + 1}`,
            textContent: cap.text,
            fontFamily: 'Inter',
            fontSize: 22,
            textColor: '#ffffff',
            color: 'from-pink-600 to-pink-500',
            words: cap.words || [],
            wordTimingSource: cap.wordTimingSource || 'inferred',
            captionTheme: theme,
            captionDisplayMode: displayMode,
            containerWidth: 550,
            containerHeight: 110,
            containerAutoWidth: true,
            containerAutoHeight: true,
          },
        };
      });

      // Place clips into timeline:
      // If there is an existing text track that is completely empty, use it.
      // Otherwise, create a new dedicated text track to safely isolate the imported subtitles.
      let nextTracks = [...currentTracks];
      const emptyTextTrackIndex = nextTracks.findIndex((t: Track) => t.type === 'text' && (!t.clips || t.clips.length === 0));

      if (emptyTextTrackIndex !== -1 && nextTracks[emptyTextTrackIndex]) {
        nextTracks[emptyTextTrackIndex] = {
          ...nextTracks[emptyTextTrackIndex]!,
          clips: newClips,
        };
      } else {
        const newTrackId = `track_srt_${Date.now()}`;
        const newTrack: Track = {
          id: newTrackId,
          type: 'text',
          name: 'Captions (SRT)',
          clips: newClips,
          isMuted: false,
          isLocked: false,
          isVisible: true,
        };
        nextTracks.push(newTrack);
      }

      store.executeCommand(createTrackSnapshotCommand('Import SRT Subtitles', currentTracks, nextTracks));
      store.showToast(`✨ Successfully imported ${newClips.length} subtitles from "${file.name}"!`);
      options?.onSuccess?.(newClips.length);
      resolve(true);
    };

    reader.readAsText(file);
  });
}

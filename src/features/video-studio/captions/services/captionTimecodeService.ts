export type CaptionTimestamp = string | number;

export const DEFAULT_CAPTION_FPS = 30;

function finiteOrThrow(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

export function parseCaptionTimestamp(value: CaptionTimestamp, fps = DEFAULT_CAPTION_FPS): number {
  if (typeof value === 'number') return finiteOrThrow(value, 'timestamp');

  const raw = String(value).trim();
  if (!raw) throw new Error('Timestamp is empty');
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`Invalid FPS: ${fps}`);

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    return finiteOrThrow(Number(raw), 'timestamp');
  }

  const normalized = raw.replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length !== 3 && parts.length !== 4) {
    throw new Error(`Unsupported timestamp format: ${raw}`);
  }

  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const s = Number(parts[2]);
  if (![h, m, s].every(Number.isFinite) || h < 0 || m < 0 || m >= 60 || s < 0 || s >= 60) {
    throw new Error(`Invalid timestamp components: ${raw}`);
  }

  if (parts.length === 3) {
    // HH:MM:SS.mmm (SRT-compatible) or HH:MM:SS.sss
    return finiteOrThrow(h * 3600 + m * 60 + s, 'timestamp');
  }

  // HH:MM:SS:FF
  const frames = Number(parts[3]);
  if (!Number.isInteger(frames) || frames < 0 || frames >= fps) {
    throw new Error(`Invalid frame component: ${raw}`);
  }
  return finiteOrThrow(h * 3600 + m * 60 + s + (frames / fps), 'timestamp');
}

export function secondsToFrameTimecode(seconds: number, fps = DEFAULT_CAPTION_FPS): string {
  finiteOrThrow(seconds, 'seconds');
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`Invalid FPS: ${fps}`);

  const totalFrames = Math.max(0, Math.round(seconds * fps));
  const frames = totalFrames % Math.round(fps);
  const totalSeconds = Math.floor(totalFrames / Math.round(fps));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(frames)}`;
}

export function secondsToSrtTimestamp(seconds: number): string {
  finiteOrThrow(seconds, 'seconds');
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function normalizeSrtTimestamp(value: string): string {
  const raw = value.trim().replace('.', ',');
  const match = raw.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) throw new Error(`Invalid SRT timestamp: ${value}`);
  const parsed = parseCaptionTimestamp(raw);
  const canonical = secondsToSrtTimestamp(parsed);
  return canonical;
}

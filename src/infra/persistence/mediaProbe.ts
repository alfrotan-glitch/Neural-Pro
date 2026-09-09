/**
 * Media probing: measure once, then authoritative (contract R3, ADR-010).
 *
 * Probing is best-effort by design. In a runtime without `<video>`/`<audio>`
 * (Node, a locked-down frame) it returns `null`s rather than throwing, which
 * makes the asset `durationUnknown` — a state the UI must surface, never paper
 * over with a guessed duration.
 */

import type { AssetKind, MediaProbe } from '../../domain/assets/types';

export function emptyProbe(kind: AssetKind, mimeType: string): MediaProbe {
  return { kind, mimeType, duration: null, width: null, height: null, sampleRate: null, channels: null };
}

export function inferAssetKind(mimeType: string, fileName?: string | null): AssetKind {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  const name = (fileName || '').toLowerCase();
  if (/\.(mp4|webm|mov|mkv|avi|m4v)$/.test(name)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(name)) return 'audio';
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(name)) return 'image';
  return 'video';
}

interface ProbeEnvironment {
  readonly url: string;
  readonly blob: Blob;
}

type DocumentLike = {
  createElement(tag: 'video' | 'audio'): HTMLMediaElementLike;
};

interface HTMLMediaElementLike {
  src: string;
  preload: string;
  muted: boolean;
  duration: number;
  videoWidth?: number;
  videoHeight?: number;
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
  load(): void;
}

interface ProbeGlobals {
  document?: DocumentLike;
  createImageBitmap?: (blob: Blob) => Promise<{ width: number; height: number; close?: () => void }>;
  Image?: new () => { src: string; width: number; height: number; onload: (() => void) | null; onerror: (() => void) | null };
  AudioContext?: new () => AudioContextLike;
  webkitAudioContext?: new () => AudioContextLike;
  setTimeout?: (handler: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

interface AudioContextLike {
  decodeAudioData(buffer: ArrayBuffer, onSuccess: (audio: AudioBufferLike) => void, onFailure?: () => void): Promise<AudioBufferLike> | void;
  close?(): Promise<void> | void;
}

interface AudioBufferLike {
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
}

const PROBE_TIMEOUT_MS = 5000;

/** Measures media characteristics from bytes. Never throws. */
export async function probeBlob(
  blob: Blob,
  mimeType: string,
  url: string,
  globals: ProbeGlobals = globalThis as unknown as ProbeGlobals,
): Promise<MediaProbe> {
  const kind = inferAssetKind(mimeType);
  const probe: ProbeEnvironment = { url, blob };

  if (kind === 'image') return probeImage(probe, globals, mimeType);
  if (kind === 'audio') return probeAudio(probe, globals, mimeType);
  return probeVideo(probe, globals, mimeType);
}

function withTimeout<T>(globals: ProbeGlobals, promise: Promise<T>, fallback: T): Promise<T> {
  const schedule = globals.setTimeout;
  const cancel = globals.clearTimeout;
  if (typeof schedule !== 'function') return promise;
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const handle = schedule(() => finish(fallback), PROBE_TIMEOUT_MS);
    void promise.then(
      (value) => {
        if (typeof cancel === 'function' && handle !== undefined) cancel(handle);
        finish(value);
      },
      () => {
        if (typeof cancel === 'function' && handle !== undefined) cancel(handle);
        finish(fallback);
      },
    );
  });
}

async function probeVideo(
  probe: ProbeEnvironment,
  globals: ProbeGlobals,
  mimeType: string,
): Promise<MediaProbe> {
  const base = emptyProbe('video', mimeType);
  if (!globals.document) return base;

  return withTimeout(
    globals,
    new Promise<MediaProbe>((resolve) => {
      const element = globals.document!.createElement('video');
      element.preload = 'metadata';
      element.muted = true;
      const onLoaded = (): void => {
        const duration = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : null;
        cleanup();
        resolve({
          ...base,
          duration,
          width: element.videoWidth && element.videoWidth > 0 ? element.videoWidth : null,
          height: element.videoHeight && element.videoHeight > 0 ? element.videoHeight : null,
        });
      };
      const onError = (): void => {
        cleanup();
        resolve(base);
      };
      const cleanup = (): void => {
        element.removeEventListener('loadedmetadata', onLoaded);
        element.removeEventListener('error', onError);
        element.src = '';
      };
      element.addEventListener('loadedmetadata', onLoaded);
      element.addEventListener('error', onError);
      element.src = probe.url;
      element.load();
    }),
    base,
  );
}

/** How far into a file we are willing to look for a `data` chunk header. */
const CONTAINER_SCAN_BYTES = 64 * 1024;

export interface ContainerAudioProbe {
  readonly duration: number | null;
  readonly sampleRate: number | null;
  readonly channels: number | null;
}

/**
 * Reads duration out of a container's own header instead of decoding it.
 *
 * Why this exists: `decodeAudioData` and `<audio>` are the normal sources, but
 * both can be unavailable (a locked-down frame, a worker, Node) or can fail on a
 * file the browser refuses to decode. The media this app *generates itself* is
 * canonical PCM WAV (`audioBufferToWav`), whose duration is exactly
 * `dataSize / byteRate` — a fact, not an estimate. Deriving it structurally makes
 * `measure()` authoritative for generated audio in every runtime, which is what
 * the duration-authority contract (R3, ADR-010) actually needs.
 *
 * Returns `null` for anything that is not a readable RIFF/WAVE file. Never throws.
 */
export async function probeContainerAudio(blob: Blob): Promise<ContainerAudioProbe | null> {
  if (typeof blob.slice !== 'function' || typeof blob.arrayBuffer !== 'function') return null;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await blob.slice(0, CONTAINER_SCAN_BYTES).arrayBuffer());
  } catch {
    return null;
  }
  if (bytes.length < 44) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number): string =>
    String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let sampleRate: number | null = null;
  let channels: number | null = null;
  let byteRate: number | null = null;
  let blockAlign: number | null = null;
  let audioFormat: number | null = null;
  let factSamples: number | null = null;
  let dataBytes: number | null = null;

  // Chunks are `id(4) size(4) payload(size)`, padded to an even boundary, and may
  // appear in any order — so walk them rather than assuming the canonical 44 bytes.
  let cursor = 12;
  while (cursor + 8 <= bytes.length) {
    const id = tag(cursor);
    const size = view.getUint32(cursor + 4, true);
    const payload = cursor + 8;

    if (id === 'fmt ' && payload + 16 <= bytes.length) {
      audioFormat = view.getUint16(payload, true);
      channels = view.getUint16(payload + 2, true) || null;
      sampleRate = view.getUint32(payload + 4, true) || null;
      byteRate = view.getUint32(payload + 8, true) || null;
      blockAlign = view.getUint16(payload + 12, true) || null;
    } else if (id === 'fact' && payload + 4 <= bytes.length) {
      // Compressed formats store the true sample count here.
      factSamples = view.getUint32(payload, true) || null;
    } else if (id === 'data') {
      dataBytes = size;
      break;
    }

    cursor = payload + size + (size % 2);
  }

  if (sampleRate === null || channels === null) return null;

  let duration: number | null = null;
  if (factSamples !== null) {
    duration = factSamples / sampleRate;
  } else if (dataBytes !== null) {
    // A `byteRate` of 0 (or a missing fmt chunk) is not a licence to guess.
    const rate = byteRate ?? (blockAlign !== null ? sampleRate * blockAlign : null);
    if (rate && rate > 0) duration = dataBytes / rate;
  }
  if (duration === null || !Number.isFinite(duration) || duration <= 0) return null;

  // Only PCM and IEEE float are exactly derivable; for anything else the decoded
  // measurement remains the authority.
  if (audioFormat !== null && audioFormat !== 1 && audioFormat !== 3) return null;

  return { duration, sampleRate, channels };
}

async function probeAudio(
  probe: ProbeEnvironment,
  globals: ProbeGlobals,
  mimeType: string,
): Promise<MediaProbe> {
  const base = emptyProbe('audio', mimeType);
  let measured: MediaProbe = base;

  if (globals.document) {
    measured = await withTimeout(
      globals,
      new Promise<MediaProbe>((resolve) => {
        const element = globals.document!.createElement('audio');
        element.preload = 'metadata';
        const onLoaded = (): void => {
          const duration = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : null;
          cleanup();
          resolve({ ...base, duration });
        };
        const onError = (): void => {
          cleanup();
          resolve(base);
        };
        const cleanup = (): void => {
          element.removeEventListener('loadedmetadata', onLoaded);
          element.removeEventListener('error', onError);
          element.src = '';
        };
        element.addEventListener('loadedmetadata', onLoaded);
        element.addEventListener('error', onError);
        element.src = probe.url;
        element.load();
      }),
      base,
    );
  }

  const container = await probeContainerAudio(probe.blob);
  const decode = await decodeAudioInfo(probe.blob, globals);
  if (!container && !decode) return measured;

  return {
    ...measured,
    // An element/decode measurement wins when present; the container header is the
    // exact fallback that still works where no decoder is available.
    duration: measured.duration ?? container?.duration ?? decode?.duration ?? null,
    sampleRate: container?.sampleRate ?? decode?.sampleRate ?? null,
    channels: container?.channels ?? decode?.channels ?? null,
  };
}

async function decodeAudioInfo(
  blob: Blob,
  globals: ProbeGlobals,
): Promise<{ duration: number | null; sampleRate: number | null; channels: number | null } | null> {
  const Ctor = globals.AudioContext ?? globals.webkitAudioContext;
  if (!Ctor || typeof blob.arrayBuffer !== 'function') return null;
  let context: AudioContextLike | null = null;
  try {
    context = new Ctor();
    const buffer = await blob.arrayBuffer();
    const audio = await new Promise<AudioBufferLike | null>((resolve) => {
      const result = context!.decodeAudioData(
        buffer,
        (decoded) => resolve(decoded),
        () => resolve(null),
      );
      if (result && typeof (result as Promise<AudioBufferLike>).then === 'function') {
        void (result as Promise<AudioBufferLike>).then(
          (decoded) => resolve(decoded),
          () => resolve(null),
        );
      }
    });
    if (!audio) return null;
    return {
      duration: Number.isFinite(audio.duration) ? audio.duration : null,
      sampleRate: Number.isFinite(audio.sampleRate) ? audio.sampleRate : null,
      channels: Number.isFinite(audio.numberOfChannels) ? audio.numberOfChannels : null,
    };
  } catch {
    return null;
  } finally {
    try {
      void context?.close?.();
    } catch {
      /* noop */
    }
  }
}

async function probeImage(
  probe: ProbeEnvironment,
  globals: ProbeGlobals,
  mimeType: string,
): Promise<MediaProbe> {
  const base = emptyProbe('image', mimeType);

  if (typeof globals.createImageBitmap === 'function') {
    try {
      const bitmap = await globals.createImageBitmap(probe.blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return { ...base, width: size.width, height: size.height };
    } catch {
      /* fall through to the <img> path */
    }
  }

  if (!globals.Image) return base;
  return withTimeout(
    globals,
    new Promise<MediaProbe>((resolve) => {
      const image = new globals.Image!();
      image.onload = () => resolve({ ...base, width: image.width, height: image.height });
      image.onerror = () => resolve(base);
      image.src = probe.url;
    }),
    base,
  );
}

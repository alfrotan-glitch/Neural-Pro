import type { ClipNode } from '../../project/types/project';

export interface AudioWaveform {
  peaks: number[];
  duration: number;
  sampleRate: number;
  channels: number;
}

export interface ExtractedAudioAsset {
  blob: Blob;
  url: string;
  mimeType: string;
  waveform: AudioWaveform;
  method: 'source-audio' | 'mediarecorder-capture';
}

export class AudioExtractionError extends Error {
  readonly code: string;
  constructor(message: string, code = 'AUDIO_EXTRACTION_FAILED') {
    super(message);
    this.name = 'AudioExtractionError';
    this.code = code;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('Audio extraction aborted.', 'AbortError');
  }
}

async function decodeWaveform(blob: Blob, signal?: AbortSignal): Promise<AudioWaveform> {
  throwIfAborted(signal);
  const arrayBuffer = await blob.arrayBuffer();
  throwIfAborted(signal);
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
    throwIfAborted(signal);

    const bucketCount = Math.max(64, Math.min(512, Math.ceil(buffer.duration * 30)));
    const peaks = new Array<number>(bucketCount).fill(0);
    const channels = buffer.numberOfChannels;
    const framesPerBucket = Math.max(1, Math.floor(buffer.length / bucketCount));

    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = bucket * framesPerBucket;
      const end = Math.min(buffer.length, start + framesPerBucket);
      let peak = 0;
      for (let channel = 0; channel < channels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let index = start; index < end; index += 1) {
          peak = Math.max(peak, Math.abs(data[index] ?? 0));
        }
      }
      peaks[bucket] = Math.round(Math.min(1, peak) * 100);
    }

    return {
      peaks,
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

async function captureVideoAudio(
  sourceUrl: string,
  signal?: AbortSignal,
): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new AudioExtractionError('Audio extraction requires a browser media environment.', 'BROWSER_REQUIRED');
  }
  const video = document.createElement('video');
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.muted = false;
  video.playsInline = true;
  video.src = sourceUrl;

  const recorderType = pickRecorderMimeType();
  if (!recorderType) {
    throw new AudioExtractionError('This browser cannot record an extracted audio stream.', 'MEDIA_RECORDER_UNSUPPORTED');
  }
  if (!('captureStream' in HTMLMediaElement.prototype)) {
    throw new AudioExtractionError('This browser does not support media stream capture for audio extraction.', 'CAPTURE_STREAM_UNSUPPORTED');
  }

  const capture = (): MediaStream => {
    const mediaVideo = video as HTMLVideoElement & { captureStream?: () => MediaStream };
    if (typeof mediaVideo.captureStream !== 'function') {
      throw new AudioExtractionError('MediaStream capture is unavailable.', 'CAPTURE_STREAM_UNSUPPORTED');
    }
    return mediaVideo.captureStream();
  };

  const waitForReady = new Promise<void>((resolve, reject) => {
    const onLoaded = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new AudioExtractionError('The source video could not be loaded for audio extraction.', 'MEDIA_LOAD_FAILED')); };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.load();
  });

  try {
    throwIfAborted(signal);
    await waitForReady;
    throwIfAborted(signal);
    const stream = capture();
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new AudioExtractionError('The selected video does not contain an audio track.', 'NO_AUDIO_TRACK');
    }

    const audioOnly = new MediaStream(audioTracks);
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(audioOnly, { mimeType: recorderType });

    const result = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new AudioExtractionError('The browser failed while capturing the video audio stream.', 'MEDIA_RECORDER_ERROR'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorderType }));
    });

    const abortHandler = () => {
      try { recorder.stop(); } catch { /* already stopped */ }
      video.pause();
      stream.getTracks().forEach((track) => track.stop());
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    recorder.start(250);
    await video.play();
    await new Promise<void>((resolve) => {
      const onEnded = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); resolve(); };
      const cleanup = () => {
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('ended', onEnded, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await result;
    signal?.removeEventListener('abort', abortHandler);
    stream.getTracks().forEach((track) => track.stop());
    return blob;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}

async function fetchSource(sourceUrl: string, signal?: AbortSignal): Promise<Blob> {
  throwIfAborted(signal);
  const response = await fetch(sourceUrl, { signal });
  if (!response.ok) {
    throw new AudioExtractionError(`Media request failed (${response.status}).`, 'MEDIA_FETCH_FAILED');
  }
  const blob = await response.blob();
  throwIfAborted(signal);
  return blob;
}

export async function extractAudioFromClip(
  clip: ClipNode,
  signal?: AbortSignal,
): Promise<ExtractedAudioAsset> {
  const sourceUrl = typeof clip.properties.videoUrl === 'string' && clip.properties.videoUrl
    ? clip.properties.videoUrl
    : typeof clip.properties.audioUrl === 'string' && clip.properties.audioUrl
      ? clip.properties.audioUrl
      : null;

  if (!sourceUrl) {
    throw new AudioExtractionError('The selected clip does not have a media source.', 'NO_MEDIA_SOURCE');
  }

  const isExplicitAudio = typeof clip.properties.audioUrl === 'string' && Boolean(clip.properties.audioUrl);
  if (isExplicitAudio) {
    const blob = await fetchSource(sourceUrl, signal);
    const waveform = await decodeWaveform(blob, signal);
    return {
      blob,
      url: URL.createObjectURL(blob),
      mimeType: blob.type || 'audio/*',
      waveform,
      method: 'source-audio',
    };
  }

  try {
    const sourceBlob = await fetchSource(sourceUrl, signal);
    const waveform = await decodeWaveform(sourceBlob, signal);
    return {
      blob: sourceBlob,
      url: URL.createObjectURL(sourceBlob),
      mimeType: sourceBlob.type || 'audio/*',
      waveform,
      method: 'source-audio',
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const blob = await captureVideoAudio(sourceUrl, signal);
    const waveform = await decodeWaveform(blob, signal);
    return {
      blob,
      url: URL.createObjectURL(blob),
      mimeType: blob.type || 'audio/webm',
      waveform,
      method: 'mediarecorder-capture',
    };
  }
}

export async function analyzeAudioUrl(
  url: string,
  signal?: AbortSignal,
): Promise<AudioWaveform> {
  const blob = await fetchSource(url, signal);
  return decodeWaveform(blob, signal);
}

import * as Mp4Muxer from 'mp4-muxer';
import type { ExportJob } from '../store/useExportStore';
import { getExportDimensions } from '../core/engine/exportResolution';
import {
  parseBitrate,
  validateVideoBitrate,
} from '../core/engine/exportEncodingSettings';

export interface WebCodecsExportProgress {
  percentage: number;
  frame?: number;
  fps?: number;
  timeRemainingSec?: number;
}

export type WebCodecsFrameRenderer = (
  frameIndex: number,
  signal?: AbortSignal
) => Promise<HTMLCanvasElement | null>;


function audioRequired(settings: ExportJob['settings']): boolean {
  return settings.audioBitrate !== undefined;
}

export async function waitForEncoderQueue(
  encoder: { encodeQueueSize: number; ondequeue: ((this: any, ev?: any) => any) | null },
  maxQueue = 4,
): Promise<void> {
  while (encoder.encodeQueueSize > maxQueue) {
    await new Promise<void>((resolve) => {
      let timer: any = null;
      const cleanup = () => {
        if (timer !== null) {
          if (typeof window !== 'undefined') window.clearTimeout(timer);
          else clearTimeout(timer);
          timer = null;
        }
        encoder.ondequeue = null;
      };
      encoder.ondequeue = () => {
        cleanup();
        resolve();
      };
      const setTimer = typeof window !== 'undefined' ? window.setTimeout : setTimeout;
      timer = setTimer(() => {
        cleanup();
        resolve();
      }, 100);
    });
  }
}

function assertSupportedConfiguration(settings: ExportJob['settings']): void {
  // Stage 1 deliberately uses one production encoder path. The current
  // browser implementation is an H.264/AAC MP4 pipeline. Unsupported UI
  // selections must fail explicitly instead of silently becoming H.264/MP4.
  if (settings.format !== 'mp4') {
    throw new Error(`Export format "${settings.format}" is not supported by the current production WebCodecs muxer. Select MP4.`);
  }
  if (typeof VideoEncoder === 'undefined' || typeof VideoEncoder.isConfigSupported !== 'function') {
    throw new Error('WebCodecs VideoEncoder is not available in this browser.');
  }
  if (typeof AudioEncoder === 'undefined' && audioRequired(settings)) {
    throw new Error('WebCodecs AudioEncoder is not available; audio export cannot be completed safely.');
  }
}

export async function exportVideoWebCodecs(
  settings: ExportJob['settings'],
  totalFrames: number,
  audioBuffer: AudioBuffer | null,
  renderFrame: WebCodecsFrameRenderer,
  onProgress: (progress: WebCodecsExportProgress) => void,
  signal?: AbortSignal
): Promise<Blob> {
  assertSupportedConfiguration(settings);

  const { width, height } = getExportDimensions(settings.resolution);
  const fps = settings.fps;
  const roundedWidth = Math.floor(width / 2) * 2;
  const roundedHeight = Math.floor(height / 2) * 2;
  validateVideoBitrate(
    settings.videoBitrate,
    settings.resolution,
    settings.fps,
    settings.codec,
  );

  const videoBitrate = settings.videoBitrate;
  const audioBitrate = parseBitrate(settings.audioBitrate);

  console.info(`Starting production WebCodecs export ${roundedWidth}x${roundedHeight}@${fps}`);

  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: {
      codec: settings.codec === 'H.264' ? 'avc' : settings.codec === 'H.265' ? 'hevc' : 'av1',
      width: roundedWidth,
      height: roundedHeight,
    },
    audio: audioBuffer
      ? {
          codec: 'aac',
          sampleRate: audioBuffer.sampleRate,
          numberOfChannels: audioBuffer.numberOfChannels,
        }
      : undefined,
    fastStart: 'in-memory',
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      encoderError = error instanceof Error ? error : new Error(String(error));
    },
  });

  const codecCandidates: Record<ExportJob['settings']['codec'], string[]> = {
    'H.264': ['avc1.640033', 'avc1.64002a', 'avc1.4d0033', 'avc1.4d002a', 'avc1.42001f'],
    'H.265': ['hev1.2.4.L153.B0', 'hvc1.2.4.L153.B0', 'hev1.1.6.L120.B0'],
    'AV1': ['av01.0.08M.08', 'av01.0.05M.08', 'av01.0.04M.08'],
  };

  let selectedConfig: VideoEncoderConfig | null = null;

  if (typeof VideoEncoder === 'undefined' || typeof VideoEncoder.isConfigSupported !== 'function') {
    throw new Error('WebCodecs VideoEncoder is not available in this browser.');
  }

  for (const codec of codecCandidates[settings.codec]) {
    const candidate: VideoEncoderConfig = {
      codec,
      width: roundedWidth,
      height: roundedHeight,
      bitrate: videoBitrate,
      framerate: fps,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'quality',
    };

    try {
      const support = await VideoEncoder.isConfigSupported(candidate);
      if (support.supported && support.config) {
        selectedConfig = support.config;
        break;
      }
    } catch {
      // Continue checking the next valid H.264 profile.
    }
  }

  if (!selectedConfig) {
    throw new Error(`No supported ${settings.codec} VideoEncoder configuration was found for ${roundedWidth}x${roundedHeight}@${fps}. Your browser/GPU does not provide the requested codec at this resolution and frame rate.`);
  }

  videoEncoder.configure(selectedConfig);

  try {
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error('Export cancelled.');
      }

      await waitForEncoderQueue(videoEncoder, 4);
      if (encoderError) throw encoderError;

      const canvas = await renderFrame(frameIndex, signal);
      if (!canvas) {
        throw new Error(`Frame renderer returned no frame at index ${frameIndex}.`);
      }

      if (encoderError) throw encoderError;

      const timestamp = Math.round((frameIndex / fps) * 1_000_000);
      const frame = new VideoFrame(canvas, { timestamp });
      try {
        videoEncoder.encode(frame, {
          keyFrame: frameIndex === 0 || frameIndex % Math.max(1, Math.round(fps * 2)) === 0,
        });
      } finally {
        frame.close();
      }

      const percentage = 15 + Math.round(((frameIndex + 1) / totalFrames) * 84);
      const remainingFrames = totalFrames - frameIndex - 1;
      onProgress({
        percentage: Math.min(99, percentage),
        frame: frameIndex + 1,
        fps,
        timeRemainingSec: Math.max(0, Math.ceil(remainingFrames / fps)),
      });
    }

    await videoEncoder.flush();
    if (encoderError) throw encoderError;

    if (audioBuffer) {
      if (typeof AudioEncoder === 'undefined') {
        throw new Error('WebCodecs AudioEncoder is not available; audio export cannot be completed safely.');
      }

      let audioEncoderError: Error | null = null;
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (error) => {
          audioEncoderError = error instanceof Error ? error : new Error(String(error));
        },
      });

      try {
        const audioConfig: AudioEncoderConfig = {
          codec: 'mp4a.40.2',
          sampleRate: audioBuffer.sampleRate,
          numberOfChannels: audioBuffer.numberOfChannels,
          bitrate: audioBitrate,
        };

        if (typeof AudioEncoder.isConfigSupported === 'function') {
          const support = await AudioEncoder.isConfigSupported(audioConfig);
          if (!support.supported) {
            throw new Error(`AAC audio encoding is not supported at ${audioBuffer.sampleRate}Hz.`);
          }
        }

        audioEncoder.configure(audioConfig);

        const sampleRate = audioBuffer.sampleRate;
        const channels = audioBuffer.numberOfChannels;
        const framesPerChunk = sampleRate;

        for (let offset = 0; offset < audioBuffer.length; offset += framesPerChunk) {
          if (signal?.aborted) {
            throw signal.reason instanceof Error ? signal.reason : new Error('Export cancelled.');
          }

          await waitForEncoderQueue(audioEncoder, 4);

          const frameCount = Math.min(framesPerChunk, audioBuffer.length - offset);
          const planarData = new Float32Array(frameCount * channels);
          for (let channel = 0; channel < channels; channel += 1) {
            planarData.set(
              audioBuffer.getChannelData(channel).subarray(offset, offset + frameCount),
              channel * frameCount
            );
          }

          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate,
            numberOfFrames: frameCount,
            numberOfChannels: channels,
            timestamp: Math.round((offset / sampleRate) * 1_000_000),
            data: planarData,
          });

          try {
            audioEncoder.encode(audioData);
          } finally {
            audioData.close();
          }
        }

        await audioEncoder.flush();
        if (audioEncoderError) throw audioEncoderError;
      } finally {
        if (audioEncoder.state !== 'closed') {
          audioEncoder.close();
        }
      }
    }

    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('Export cancelled.');
    }

    muxer.finalize();
    const buffer = muxer.target.buffer;
    return new Blob([buffer], { type: 'video/mp4' });
  } finally {
    if (videoEncoder.state !== 'closed') {
      videoEncoder.close();
    }
  }
}

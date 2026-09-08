import type { ExportResolution, ExportCodec, ExportFPS, ExportFormat, ExportQuality, AudioBitrate } from '../../features/video-studio/export/types/codecs';

export interface EncodingSettingsInput {
  resolution: ExportResolution;
  fps: ExportFPS;
  codec: ExportCodec;
  quality: ExportQuality;
  videoBitrate: number;
  audioBitrate: AudioBitrate;
  format: ExportFormat;
}

export interface EncodingCapability {
  supported: boolean;
  reason?: string;
}

export interface VideoBitrateRange {
  min: number;
  recommended: number;
  max: number;
}

const BASE_30FPS_BITRATE: Record<ExportResolution, number> = {
  '720p': 4_000_000,
  '1080p': 8_000_000,
  '2K': 16_000_000,
  '4K': 35_000_000,
  '8K': 80_000_000,
};

const CODEC_EFFICIENCY: Record<ExportCodec, number> = {
  'H.264': 1,
  'H.265': 0.68,
  AV1: 0.58,
};

const QUALITY_MULTIPLIER: Record<ExportQuality, number> = {
  Fast: 0.75,
  Balanced: 1,
  'High Quality': 1.3,
};

const FPS_MULTIPLIER: Record<ExportFPS, number> = {
  24: 0.9,
  30: 1,
  60: 1.65,
};

const AUDIO_BITRATES: Record<AudioBitrate, number> = {
  '128k': 128_000,
  '192k': 192_000,
  '256k': 256_000,
  '320k': 320_000,
};

function roundBitrate(value: number): number {
  const step = value >= 10_000_000 ? 100_000 : 50_000;
  return Math.max(step, Math.round(value / step) * step);
}

export function parseBitrate(value: AudioBitrate): number {
  return AUDIO_BITRATES[value];
}

export function getVideoBitrateRange(
  resolution: ExportResolution,
  fps: ExportFPS,
  codec: ExportCodec,
): VideoBitrateRange {
  const codecFactor = CODEC_EFFICIENCY[codec];
  const fpsFactor = FPS_MULTIPLIER[fps];
  const codecAdjustedBase = BASE_30FPS_BITRATE[resolution] * codecFactor;
  const recommended = roundBitrate(codecAdjustedBase * fpsFactor);

  // The range is derived from the target resolution, frame rate and codec,
  // rather than using a global bitrate ceiling. This keeps 4K/8K viable while
  // preventing obviously invalid values for smaller exports.
  const min = roundBitrate(recommended * 0.5);
  const max = roundBitrate(recommended * 2.0);

  return {
    min,
    recommended,
    max,
  };
}

export function calculateRecommendedVideoBitrate(
  resolution: ExportResolution,
  fps: ExportFPS,
  quality: ExportQuality,
  codec: ExportCodec = 'H.264',
): number {
  const range = getVideoBitrateRange(resolution, fps, codec);
  return Math.min(
    range.max,
    Math.max(
      range.min,
      roundBitrate(range.recommended * QUALITY_MULTIPLIER[quality]),
    ),
  );
}

export function validateVideoBitrate(
  bitrate: number,
  resolution: ExportResolution,
  fps: ExportFPS,
  codec: ExportCodec,
): void {
  if (!Number.isFinite(bitrate) || bitrate <= 0) {
    throw new Error('Video bitrate must be a positive finite number.');
  }

  const range = getVideoBitrateRange(resolution, fps, codec);
  if (bitrate < range.min || bitrate > range.max) {
    throw new Error(
      `Video bitrate ${formatBitrate(bitrate)} is outside the supported range ` +
      `${formatBitrate(range.min)}–${formatBitrate(range.max)} for ` +
      `${resolution} ${fps} FPS ${codec}.`,
    );
  }
}

export function getQualityBitrateOptions(
  resolution: ExportResolution,
  fps: ExportFPS,
  codec: ExportCodec,
  quality: ExportQuality,
): ReadonlyArray<{ label: string; bitrate: number }> {
  const range = getVideoBitrateRange(resolution, fps, codec);
  const recommended = calculateRecommendedVideoBitrate(
    resolution,
    fps,
    quality,
    codec,
  );

  const values = [
    { label: 'Efficient', bitrate: range.min },
    { label: 'Recommended', bitrate: recommended },
    { label: 'High Quality', bitrate: Math.min(range.max, roundBitrate(recommended * 1.2)) },
    { label: 'Maximum', bitrate: range.max },
  ];

  return values.filter(
    (option, index, all) =>
      all.findIndex((candidate) => candidate.bitrate === option.bitrate) === index,
  );
}

export function formatBitrate(bitrate: number): string {
  if (bitrate >= 1_000_000) {
    return `${(bitrate / 1_000_000).toFixed(1)} Mbps`;
  }

  return `${Math.round(bitrate / 1000)} kbps`;
}

export function getFormatCapability(format: ExportFormat): EncodingCapability {
  if (format !== 'mp4') {
    return {
      supported: false,
      reason:
        `${format.toUpperCase()} export is not implemented by the current production muxer. ` +
        'MP4 is the only supported production format.',
    };
  }

  return { supported: true };
}

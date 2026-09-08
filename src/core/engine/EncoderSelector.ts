// src/core/engine/EncoderSelector.ts
import { EncoderDetector, DetectionResult, HardwareEncoderProfile } from './EncoderDetector';

export interface PerformanceEstimation {
  estimatedFps: number;
  cpuOverheadPercent: number;
  gpuOverheadPercent: number;
  renderingTimeMultiplier: number; // e.g. 0.25 means renders 4x faster than real-time
}

export class EncoderSelector {
  private static detectionResult: DetectionResult | null = null;

  /**
   * Caches and returns system hardware capabilities.
   */
  public static getSystemCapabilities(forceRefresh: boolean = false): DetectionResult {
    if (!this.detectionResult || forceRefresh) {
      this.detectionResult = EncoderDetector.analyzeHardware();
    }
    return this.detectionResult;
  }

  /**
   * Matches selected target user parameters against available encoders and recommends the optimal physical pipeline setup.
   */
  public static selectBestEncoder(options: {
    preferredCodec: 'H.264' | 'H.265' | 'AV1';
    allowHardwareAcceleration: boolean;
  }): {
    selectedEncoder: HardwareEncoderProfile;
    isHardwareAccelerated: boolean;
    performance: PerformanceEstimation;
  } {
    const caps = this.getSystemCapabilities();
    const useHardware = options.allowHardwareAcceleration;

    // Filter by capabilities
    let candidateEncoders = caps.availableEncoders;

    if (!useHardware) {
      candidateEncoders = candidateEncoders.filter(p => p.type === 'cpu');
    }

    // Map user codec friendly string to FFmpeg standard profiles
    let targetCodecType = 'h264';
    if (options.preferredCodec === 'H.265') {
      targetCodecType = 'hevc';
    } else if (options.preferredCodec === 'AV1') {
      targetCodecType = 'av1';
    }

    // Look for exact hardware matching of codec, then fall back to software or h264 hardware if not available
    let selection = candidateEncoders.find(p => p.codec === targetCodecType && p.type === 'gpu');

    // Fallback 1: If hardware requested but codec not supported, try H264 hardware
    if (!selection && useHardware) {
      selection = candidateEncoders.find(p => p.codec === 'h264' && p.type === 'gpu');
    }

    // Fallback 2: Fall back to software matching the preferred codec
    if (!selection) {
      selection = candidateEncoders.find(p => p.codec === targetCodecType && p.type === 'cpu');
    }

    // Fallback 3: Ultimate fallback to software H264
    if (!selection) {
      selection = candidateEncoders.find(p => p.id === 'libx264') || caps.availableEncoders[0];
    }

    // Calculate dynamic performance estimation
    if (!selection) {
      throw new Error(`No encoder is available for ${options.preferredCodec}.`);
    }

    const performance = this.estimatePerformance(selection, options.preferredCodec);

    return {
      selectedEncoder: selection,
      isHardwareAccelerated: selection.type === 'gpu',
      performance,
    };
  }

  /**
   * Computes expected speed, workloads, and real-time multipliers depending on the encoder's architecture.
   */
  private static estimatePerformance(
    encoder: HardwareEncoderProfile,
    codec: 'H.264' | 'H.265' | 'AV1'
  ): PerformanceEstimation {
    const baseFps = 30;
    const speedMultiplier = encoder.speedFactor;

    // Scale with resolution and codec complexity
    let codecPenalty = 1.0;
    if (codec === 'H.265') codecPenalty = 0.75;
    if (codec === 'AV1') codecPenalty = 0.45;

    const estimatedFps = Math.max(5, Math.round(baseFps * speedMultiplier * codecPenalty));
    const renderingTimeMultiplier = Number((30 / estimatedFps).toFixed(2)); // rendering ratio relative to duration

    // Workload estimation based on hardware acceleration type
    let cpuOverheadPercent = 15;
    let gpuOverheadPercent = 0;

    if (encoder.type === 'cpu') {
      cpuOverheadPercent = Math.round(45 * (1 / codecPenalty));
      gpuOverheadPercent = 2;
    } else {
      cpuOverheadPercent = 10;
      gpuOverheadPercent = Math.round(35 * speedMultiplier * codecPenalty);
    }

    return {
      estimatedFps,
      cpuOverheadPercent: Math.min(100, cpuOverheadPercent),
      gpuOverheadPercent: Math.min(100, gpuOverheadPercent),
      renderingTimeMultiplier,
    };
  }
}

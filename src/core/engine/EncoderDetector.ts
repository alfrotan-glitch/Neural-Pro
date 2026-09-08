// src/core/engine/EncoderDetector.ts

export interface HardwareEncoderProfile {
  id: string;
  name: string;
  codec: string;
  vendor: 'NVIDIA' | 'AMD' | 'Intel' | 'CPU' | 'Apple';
  type: 'gpu' | 'cpu';
  speedFactor: number; // multiplier compared to standard x264 software encoding
  description: string;
}

export interface DetectionResult {
  gpuVendor: string;
  gpuRenderer: string;
  hasWebGPUSupport: boolean;
  availableEncoders: HardwareEncoderProfile[];
  recommendedEncoder: HardwareEncoderProfile;
  performanceTier: 'High' | 'Balanced' | 'Basic';
  estimatedFps1080p: number;
}

export class EncoderDetector {
  /**
   * Queries WebGL debug renderer info to extract client GPU signatures without hardcoding.
   */
  public static detectGPU(): { vendor: string; renderer: string } {
    if (typeof window === 'undefined') {
      return { vendor: 'Generic', renderer: 'Server Environment' };
    }

    try {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (!gl) {
        return { vendor: 'Software', renderer: 'WebGL unsupported' };
      }

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) {
        return { vendor: 'Generic', renderer: 'Standard Driver' };
      }

      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';

      return { vendor, renderer };
    } catch {
      return { vendor: 'Generic', renderer: 'Safe Fallback Mode' };
    }
  }

  /**
   * Checks for WebGPU API capability in current browser.
   */
  public static hasWebGPU(): boolean {
    if (typeof navigator === 'undefined') return false;
    return !!(navigator as any).gpu;
  }

  /**
   * Scans system parameters and returns a complete hardware profile report.
   */
  public static analyzeHardware(): DetectionResult {
    const { vendor, renderer } = this.detectGPU();
    const hasWebGPU = this.hasWebGPU();

    const rendererUpper = renderer.toUpperCase();
    const vendorUpper = vendor.toUpperCase();

    const isNvidia = vendorUpper.includes('NVIDIA') || rendererUpper.includes('NVIDIA') || rendererUpper.includes('GEFORCE') || rendererUpper.includes('QUADRO');
    const isAMD = vendorUpper.includes('AMD') || rendererUpper.includes('AMD') || rendererUpper.includes('RADEON') || rendererUpper.includes('ATI');
    const isIntel = vendorUpper.includes('INTEL') || rendererUpper.includes('INTEL') || rendererUpper.includes('IRIS') || rendererUpper.includes('HD GRAPHICS');
    const isApple = vendorUpper.includes('APPLE') || rendererUpper.includes('APPLE') || rendererUpper.includes('METAL');

    const availableEncoders: HardwareEncoderProfile[] = [];

    // Always include software CPU fallback profiles
    const cpuH264: HardwareEncoderProfile = {
      id: 'libx264',
      name: 'Software x264 (CPU)',
      codec: 'h264',
      vendor: 'CPU',
      type: 'cpu',
      speedFactor: 1.0,
      description: 'Standard multi-threaded software encoder. Highly compatible but resource-heavy.'
    };

    const cpuH265: HardwareEncoderProfile = {
      id: 'libx265',
      name: 'Software x265 (CPU)',
      codec: 'hevc',
      vendor: 'CPU',
      type: 'cpu',
      speedFactor: 0.6,
      description: 'High-compression HEVC encoder. Extremely high CPU utilization.'
    };

    const cpuAV1: HardwareEncoderProfile = {
      id: 'libsvtav1',
      name: 'Software SVT-AV1 (CPU)',
      codec: 'av1',
      vendor: 'CPU',
      type: 'cpu',
      speedFactor: 0.3,
      description: 'Next-gen royalty-free video format. High CPU requirements.'
    };

    // Inject accelerated GPU encoder profiles based on vendor detection
    if (isNvidia) {
      availableEncoders.push({
        id: 'h264_nvenc',
        name: 'NVIDIA NVENC H.264 (Hardware Accelerated)',
        codec: 'h264',
        vendor: 'NVIDIA',
        type: 'gpu',
        speedFactor: 4.8,
        description: 'Dedicated NVIDIA GPU hardware encoder. Minimal CPU impact, blistering speeds.'
      });
      availableEncoders.push({
        id: 'hevc_nvenc',
        name: 'NVIDIA NVENC HEVC/H.265 (Hardware Accelerated)',
        codec: 'hevc',
        vendor: 'NVIDIA',
        type: 'gpu',
        speedFactor: 4.2,
        description: 'High efficiency NVIDIA GPU HEVC hardware codec.'
      });
      availableEncoders.push({
        id: 'av1_nvenc',
        name: 'NVIDIA NVENC AV1 (Hardware Accelerated)',
        codec: 'av1',
        vendor: 'NVIDIA',
        type: 'gpu',
        speedFactor: 3.5,
        description: 'Next-gen AV1 accelerated encoding on compatible RTX cards.'
      });
    } else if (isIntel) {
      availableEncoders.push({
        id: 'h264_qsv',
        name: 'Intel QuickSync H.264 (Hardware Accelerated)',
        codec: 'h264',
        vendor: 'Intel',
        type: 'gpu',
        speedFactor: 3.8,
        description: 'Intel integrated GPU silicon QuickSync Video accelerator.'
      });
    } else if (isAMD) {
      availableEncoders.push({
        id: 'h264_amf',
        name: 'AMD Advanced Media Framework H.264 (Hardware Accelerated)',
        codec: 'h264',
        vendor: 'AMD',
        type: 'gpu',
        speedFactor: 3.6,
        description: 'AMD dedicated hardware multimedia encoder engines.'
      });
    } else if (isApple) {
      availableEncoders.push({
        id: 'h264_videotoolbox',
        name: 'Apple VideoToolbox H.264 (Hardware Accelerated)',
        codec: 'h264',
        vendor: 'Apple',
        type: 'gpu',
        speedFactor: 4.5,
        description: 'Native Apple hardware-accelerated framework.'
      });
    }

    // Always append fallbacks
    availableEncoders.push(cpuH264);
    availableEncoders.push(cpuH265);
    availableEncoders.push(cpuAV1);

    // Pick recommended encoder (the highest speedFactor GPU encoder available)
    const gpuProfiles = availableEncoders.filter(p => p.type === 'gpu');
    const recommendedEncoder = gpuProfiles.length > 0 
      ? gpuProfiles.reduce((prev, current) => (prev.speedFactor > current.speedFactor) ? prev : current)
      : cpuH264;

    // Estimate Performance Tier and FPS
    let performanceTier: 'High' | 'Balanced' | 'Basic' = 'Basic';
    let estimatedFps1080p = 30;

    if (recommendedEncoder.type === 'gpu') {
      performanceTier = recommendedEncoder.speedFactor >= 4.0 ? 'High' : 'Balanced';
      estimatedFps1080p = Math.round(recommendedEncoder.speedFactor * 30);
    } else {
      performanceTier = 'Basic';
      estimatedFps1080p = 30;
    }

    return {
      gpuVendor: vendor || 'Unknown Vendor',
      gpuRenderer: renderer || 'Software Rasterizer',
      hasWebGPUSupport: hasWebGPU,
      availableEncoders,
      recommendedEncoder,
      performanceTier,
      estimatedFps1080p,
    };
  }
}

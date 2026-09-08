export interface MediaMixParameters {
  muted?: boolean;
  levelDb?: number;
  pan?: number;
  fadeGain?: number;
}

interface RegisteredMedia {
  element: HTMLMediaElement;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
  gain: GainNode;
  pan: StereoPannerNode;
  params: Required<MediaMixParameters>;
}

function dbToGain(levelDb: number): number {
  if (!Number.isFinite(levelDb)) return 1;
  return Math.pow(10, Math.max(-80, Math.min(24, levelDb)) / 20);
}

function clampPan(pan: number): number {
  if (!Number.isFinite(pan)) return 0;
  return Math.max(-1, Math.min(1, pan));
}

function clampFadeGain(fadeGain: number): number {
  if (!Number.isFinite(fadeGain)) return 1;
  return Math.max(0, Math.min(1, fadeGain));
}

/**
 * Owns the single interactive AudioContext for Video Studio Preview.
 *
 * Media elements are connected exactly once and are controlled through a
 * per-element gain + stereo panner chain before reaching the master gain.
 * The controller intentionally does not own Project state; callers provide
 * the resolved track/clip parameters.
 */
export class AudioMixController {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly registered = new Map<HTMLMediaElement, RegisteredMedia>();
  private readonly sourceByElement = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private masterMuted = false;
  private suspendedResumeRequested = false;

  private getAudioContextConstructor(): typeof AudioContext {
    const ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctor) throw new Error('Web Audio API AudioContext is not supported by this browser.');
    return ctor;
  }

  private ensureContext(): AudioContext {
    if (this.context && this.masterGain) return this.context;

    const AudioContextCtor = this.getAudioContextConstructor();
    const context = new AudioContextCtor();
    const masterGain = context.createGain();
    masterGain.gain.value = this.masterMuted ? 0 : 1;
    masterGain.connect(context.destination);

    this.context = context;
    this.masterGain = masterGain;
    return context;
  }

  async resumeIfNeeded(): Promise<void> {
    const context = this.context;
    if (!context || context.state !== 'suspended' || this.suspendedResumeRequested) return;

    this.suspendedResumeRequested = true;
    try {
      await context.resume();
    } catch {
      // Browser autoplay policies may reject resume until a user gesture.
    } finally {
      this.suspendedResumeRequested = false;
    }
  }

  registerMediaElement(element: HTMLMediaElement, params: MediaMixParameters = {}): void {
    const context = this.ensureContext();
    const existing = this.registered.get(element);

    if (existing) {
      existing.params = { ...existing.params, ...params };
      this.applyParameters(existing, existing.params);
      void this.resumeIfNeeded();
      return;
    }

    // Web Audio permits only one MediaElementAudioSourceNode per HTMLMediaElement.
    // React can unregister/re-register an element as props or export mode changes,
    // so keep and reuse the original source node instead of creating a second one.
    const source = this.sourceByElement.get(element) ?? context.createMediaElementSource(element);
    this.sourceByElement.set(element, source);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const gain = context.createGain();
    const pan = context.createStereoPanner();

    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(pan);
    pan.connect(this.masterGain!);

    element.muted = false;

    const registered: RegisteredMedia = {
      element,
      source,
      analyser,
      gain,
      pan,
      params: { muted: false, levelDb: 0, pan: 0, fadeGain: 1, ...params },
    };
    this.registered.set(element, registered);
    this.applyParameters(registered, registered.params);
    void this.resumeIfNeeded();
  }

  updateMediaElement(element: HTMLMediaElement, params: MediaMixParameters): void {
    const registered = this.registered.get(element);
    if (!registered) {
      this.registerMediaElement(element, params);
      return;
    }
    registered.params = { ...registered.params, ...params };
    this.applyParameters(registered, registered.params);
  }

  private applyParameters(registered: RegisteredMedia, params: Required<MediaMixParameters>): void {
    const { element, gain, pan } = registered;
    const muted = params.muted === true;
    const levelDb = params.levelDb ?? 0;
    const fadeGain = clampFadeGain(params.fadeGain ?? 1);
    const targetGain = muted || this.masterMuted ? 0 : dbToGain(levelDb) * fadeGain;

    element.muted = false;
    gain.gain.value = targetGain;
    pan.pan.value = clampPan(params.pan ?? 0);
  }

  unregisterMediaElement(element: HTMLMediaElement): void {
    const registered = this.registered.get(element);
    if (!registered) return;

    registered.params = { ...registered.params, muted: true, fadeGain: 0 };
    try { registered.gain.gain.value = 0; } catch { /* disposed context */ }
    try { registered.source.disconnect(); } catch { /* already disconnected */ }
    try { registered.analyser.disconnect(); } catch { /* already disconnected */ }
    try { registered.gain.disconnect(); } catch { /* already disconnected */ }
    try { registered.pan.disconnect(); } catch { /* already disconnected */ }

    // Keep the source node in WeakMap so the same HTMLMediaElement can be safely
    // registered again later without violating the Web Audio source-node rule.
    this.registered.delete(element);
  }

  setMasterMuted(muted: boolean): void {
    this.masterMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 1;
      for (const registered of this.registered.values()) {
        this.applyParameters(registered, registered.params);
      }
    }
  }

  isMasterMuted(): boolean {
    return this.masterMuted;
  }

  getContextState(): AudioContextState | 'uninitialized' {
    return this.context?.state ?? 'uninitialized';
  }

  getRegisteredElementCount(): number {
    return this.registered.size;
  }

  /**
   * Returns normalized RMS level (0..1) from currently audible registered media.
   * This is presentation data only; it does not alter the audio mix path.
   */
  getAggregateRmsLevel(): number {
    let maxRms = 0;
    const samples = new Uint8Array(256);

    for (const registered of this.registered.values()) {
      if (registered.params.muted || registered.params.fadeGain <= 0) continue;

      registered.analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      maxRms = Math.max(maxRms, rms);
    }

    return Math.max(0, Math.min(1, maxRms));
  }

  /**
   * Returns normalized frequency bins (0..1) sampled across currently audible media elements.
   * Enables spectrum visualizers to pulsate in exact synchrony with real speech & audio waveforms.
   */
  getAggregateFrequencyData(binCount: number = 64): Float32Array {
    const output = new Float32Array(binCount);
    const freqData = new Uint8Array(128);

    for (const registered of this.registered.values()) {
      if (registered.params.muted || registered.params.fadeGain <= 0) continue;

      registered.analyser.getByteFrequencyData(freqData);

      const validBins = Math.min(freqData.length, 120);
      for (let i = 0; i < binCount; i++) {
        // Map binCount indices to the active speech & music frequency bands
        const sampleIdx = Math.floor((i / binCount) * validBins);
        const rawByte = freqData[sampleIdx] ?? 0;
        const val = rawByte / 255;
        const currentVal = output[i] ?? 0;
        output[i] = Math.max(currentVal, val);
      }
    }

    return output;
  }
}

let singleton: AudioMixController | null = null;

export function getAudioMixController(): AudioMixController {
  singleton ??= new AudioMixController();
  return singleton;
}

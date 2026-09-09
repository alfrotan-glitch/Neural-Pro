/**
 * AiGateway — the client's only path to AI (ADR-005, contracts/ai-integration.md).
 *
 * The client may send **operation inputs only**. It may not send a model id, a
 * system instruction, generation config, tools, safety settings or raw
 * `contents`: the server owns all of it.
 */
import type { AppError } from '../errors/appError';

export interface ScriptRequest {
  readonly topic: string;
  readonly channelName: string;
  readonly duration: string;
  readonly style: string;
  readonly level: string;
  readonly speakerCount: 'Single Speaker' | 'Dual Speaker';
  readonly audience: string;
  readonly pace: string;
  readonly realism: string;
  readonly hostA?: string;
  readonly hostB?: string;
  readonly batch: number;
  readonly totalBatches: number;
}

export interface ScriptLine {
  readonly speaker: 'Host A' | 'Host B';
  readonly emotion: string;
  readonly text: string;
}

export interface ScriptResult {
  readonly metadata: {
    readonly title: string;
    readonly level: string;
    readonly estimated_duration: string;
    readonly youtube_hook: string;
  };
  readonly script: readonly ScriptLine[];
  readonly source: 'gemini';
}

export interface SpeechLine {
  readonly speaker: string;
  readonly emotion?: string;
  readonly text: string;
}

export interface SpeechRequest {
  readonly lines: readonly SpeechLine[];
  readonly voiceConfig: {
    readonly mode: 'single' | 'multi';
    readonly hostA?: string;
    readonly hostB?: string;
    readonly speakerNames?: readonly [string, string];
  };
}

export interface SpeechAudio {
  readonly mimeType: string;
  readonly base64: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSeconds: number;
}

export interface SpeechResult {
  readonly audio: SpeechAudio;
  readonly source: 'gemini';
}

export interface CaptionWord {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

export interface CaptionBlock {
  readonly id: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly text: string;
  readonly speaker?: string;
  readonly words?: readonly CaptionWord[];
}

export interface CaptionsGenerateRequest {
  readonly audioClipName: string;
  readonly duration: number;
  readonly topicPrompt: string;
  readonly projectFps: number;
}

export interface CaptionsRefineRequest {
  readonly captions: readonly CaptionBlock[];
  readonly grammarPrompt?: string;
  readonly restorePunctuation?: boolean;
  readonly projectFps: number;
}

export interface CaptionsParseSrtRequest {
  readonly srtContent: string;
  readonly refine?: boolean;
  readonly projectFps: number;
}

export interface CaptionsExportSrtRequest {
  readonly captions: readonly CaptionBlock[];
  readonly projectFps: number;
}

export interface CaptionsResult {
  readonly captions: readonly CaptionBlock[];
  readonly source: 'gemini' | 'srt' | 'local';
  readonly refined?: boolean;
}

export interface SrtExportResult {
  readonly srt: string;
  readonly source: 'local';
}

export interface AiHealth {
  readonly configured: boolean;
  readonly operations: readonly string[];
  readonly simulation: boolean;
}

export interface AiGateway {
  script(request: ScriptRequest, signal?: AbortSignal): Promise<ScriptResult>;
  speech(request: SpeechRequest, signal?: AbortSignal): Promise<SpeechResult>;
  health(signal?: AbortSignal): Promise<AiHealth>;
  captions: {
    generate(request: CaptionsGenerateRequest, signal?: AbortSignal): Promise<CaptionsResult>;
    refine(request: CaptionsRefineRequest, signal?: AbortSignal): Promise<CaptionsResult>;
    parseSrt(request: CaptionsParseSrtRequest, signal?: AbortSignal): Promise<CaptionsResult>;
    exportSrt(request: CaptionsExportSrtRequest, signal?: AbortSignal): Promise<SrtExportResult>;
  };
}

/** Thrown by the gateway; already normalised to the contract error model. */
export type { AppError };

/**
 * Operation input/output schemas — `docs/contracts/api.md` §4.
 *
 * Every request body is validated here **before** anything else happens, and
 * every AI response is validated against an output schema before it is returned
 * (`502 AI_RESPONSE_INVALID` on mismatch). Strict objects ⇒ a client-supplied
 * `model` / `config` / `tools` / `systemInstruction` field is a 400.
 */
import { arr, bool, num, obj, oneOf, str } from './schema';
import type { Schema } from './schema';
import { ALLOWED_VOICES } from '../config/models';

/* ------------------------------------------------------------------ shared */

export const CAPTION_WORD_SCHEMA = obj({
  word: str({ minLength: 1, maxLength: 200 }),
  start: num({ min: 0, max: 86_400 }),
  end: num({ min: 0, max: 86_400 }),
});

export const CAPTION_BLOCK_SCHEMA = obj(
  {
    id: str({ minLength: 1, maxLength: 120 }),
    start_time: str({ minLength: 5, maxLength: 32 }),
    end_time: str({ minLength: 5, maxLength: 32 }),
    text: str({ minLength: 1, maxLength: 4_000 }),
    speaker: str({ minLength: 1, maxLength: 60 }),
    words: arr(CAPTION_WORD_SCHEMA, { minLength: 1, maxLength: 600 }),
  },
  { optional: ['speaker', 'words'] },
);

export type CaptionBlockInput = {
  id: string;
  start_time: string;
  end_time: string;
  text: string;
  speaker?: string;
  words?: { word: string; start: number; end: number }[];
};

const PROJECT_FPS = num({ min: 1, max: 120 });

/* ------------------------------------------------------------------ script */

export const SCRIPT_REQUEST_SCHEMA = obj(
  {
    topic: str({ minLength: 1, maxLength: 500, trim: true }),
    channelName: str({ maxLength: 120, empty: true }),
    duration: str({ minLength: 1, maxLength: 40, pattern: /^[A-Za-z0-9 ()+\-.]+$/ }),
    style: str({ minLength: 1, maxLength: 120 }),
    level: str({ minLength: 1, maxLength: 60 }),
    speakerCount: oneOf(['Single Speaker', 'Dual Speaker'] as const),
    audience: str({ minLength: 1, maxLength: 200 }),
    pace: str({ minLength: 1, maxLength: 200 }),
    realism: str({ minLength: 1, maxLength: 60 }),
    hostA: str({ maxLength: 60, empty: true }),
    hostB: str({ maxLength: 60, empty: true }),
    batch: num({ min: 1, max: 50, integer: true }),
    totalBatches: num({ min: 1, max: 50, integer: true }),
  },
  { optional: ['hostA', 'hostB'] },
);

export type ScriptRequest = {
  topic: string;
  channelName: string;
  duration: string;
  style: string;
  level: string;
  speakerCount: 'Single Speaker' | 'Dual Speaker';
  audience: string;
  pace: string;
  realism: string;
  hostA?: string;
  hostB?: string;
  batch: number;
  totalBatches: number;
};

export const SCRIPT_RESULT_SCHEMA = obj({
  metadata: obj({
    title: str({ minLength: 1, maxLength: 300 }),
    level: str({ maxLength: 60, empty: true }),
    estimated_duration: str({ maxLength: 60, empty: true }),
    youtube_hook: str({ maxLength: 400, empty: true }),
  }),
  script: arr(
    obj(
      {
        speaker: oneOf(['Host A', 'Host B'] as const),
        emotion: str({ maxLength: 120, empty: true }),
        text: str({ minLength: 1, maxLength: 4_000 }),
      },
      { optional: ['emotion'] },
    ),
    { minLength: 1, maxLength: 400 },
  ),
});

export type ScriptResult = {
  metadata: { title: string; level: string; estimated_duration: string; youtube_hook: string };
  script: { speaker: 'Host A' | 'Host B'; emotion: string; text: string }[];
};

/* ------------------------------------------------------------------ speech */

export const SPEECH_REQUEST_SCHEMA = obj({
  lines: arr(
    obj(
      {
        speaker: str({ minLength: 1, maxLength: 60 }),
        emotion: str({ maxLength: 120, empty: true }),
        text: str({ minLength: 1, maxLength: 2_000 }),
      },
      { optional: ['emotion'] },
    ),
    { minLength: 1, maxLength: 20 },
  ),
  voiceConfig: obj(
    {
      mode: oneOf(['single', 'multi'] as const),
      hostA: oneOf(ALLOWED_VOICES),
      hostB: oneOf(ALLOWED_VOICES),
      speakerNames: arr(str({ minLength: 1, maxLength: 60 }), { minLength: 2, maxLength: 2 }),
    },
    { optional: ['hostA', 'hostB', 'speakerNames'] },
  ),
});

export type SpeechRequest = {
  lines: { speaker: string; emotion?: string; text: string }[];
  voiceConfig: {
    mode: 'single' | 'multi';
    hostA?: string;
    hostB?: string;
    speakerNames?: [string, string];
  };
};

export const SPEECH_RESULT_SCHEMA = obj({
  audio: obj({
    mimeType: str({ minLength: 3, maxLength: 120 }),
    base64: str({ minLength: 8, maxLength: 40_000_000 }),
    sampleRate: num({ min: 1_000, max: 192_000, integer: true }),
    channels: num({ min: 1, max: 8, integer: true }),
    durationSeconds: num({ min: 0, max: 3_600 }),
  }),
});

export type SpeechResult = {
  audio: {
    mimeType: string;
    base64: string;
    sampleRate: number;
    channels: number;
    durationSeconds: number;
  };
};

/* ---------------------------------------------------------------- captions */

export const CAPTIONS_GENERATE_SCHEMA = obj({
  audioClipName: str({ minLength: 1, maxLength: 300, trim: true }),
  duration: num({ min: 0.1, max: 86_400 }),
  topicPrompt: str({ maxLength: 2_000, empty: true }),
  projectFps: PROJECT_FPS,
});

export type CaptionsGenerateRequest = {
  audioClipName: string;
  duration: number;
  topicPrompt: string;
  projectFps: number;
};

export const CAPTIONS_REFINE_SCHEMA = obj(
  {
    captions: arr(CAPTION_BLOCK_SCHEMA, { minLength: 1, maxLength: 10_000 }),
    grammarPrompt: str({ maxLength: 2_000, empty: true }),
    restorePunctuation: bool(),
    projectFps: PROJECT_FPS,
  },
  { optional: ['grammarPrompt', 'restorePunctuation'] },
);

export type CaptionsRefineRequest = {
  captions: CaptionBlockInput[];
  grammarPrompt?: string;
  restorePunctuation?: boolean;
  projectFps: number;
};

export const CAPTIONS_PARSE_SRT_SCHEMA = obj(
  {
    srtContent: str({ minLength: 1, maxLength: 10 * 1024 * 1024 }),
    refine: bool(),
    projectFps: PROJECT_FPS,
  },
  { optional: ['refine'] },
);

export type CaptionsParseSrtRequest = { srtContent: string; refine?: boolean; projectFps: number };

export const CAPTIONS_EXPORT_SRT_SCHEMA = obj({
  captions: arr(CAPTION_BLOCK_SCHEMA, { minLength: 1, maxLength: 10_000 }),
  projectFps: PROJECT_FPS,
});

export type CaptionsExportSrtRequest = { captions: CaptionBlockInput[]; projectFps: number };

export const captionBlockArraySchema: Schema<CaptionBlockInput[]> = arr(CAPTION_BLOCK_SCHEMA, {
  minLength: 1,
  maxLength: 10_000,
});

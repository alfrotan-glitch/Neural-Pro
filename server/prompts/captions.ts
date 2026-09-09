/**
 * W3 caption prompts (server-owned). Ported from the inline prompts that used to
 * live in `server.ts`; user-supplied free text is now delimited and bounded.
 */
import { DATA_BLOCK_GUARD, userDataBlock } from './template';

export const CAPTION_SYSTEM_INSTRUCTION =
  'You are an expert video transcriber, linguist and subtitler. You produce subtitle blocks with precise ' +
  'start and end times and word-by-word timing arrays matching standard speech rates. You restore natural ' +
  'punctuation and casing directly in the word elements. ' +
  DATA_BLOCK_GUARD;

export const REFINE_SYSTEM_INSTRUCTION =
  'You are an expert copyeditor and subtitle aligner. You refine the text of caption blocks for punctuation, ' +
  'grammar and casing while strictly preserving every timestamp value and the exact original JSON structure. ' +
  DATA_BLOCK_GUARD;

export function buildCaptionGenerationContents(input: {
  audioClipName: string;
  duration: number;
  topicPrompt: string;
  projectFps: number;
}): string {
  return [
    `Generate frame-accurate, professional karaoke subtitle captions for the audio clip described below.`,
    `The clip is ${input.duration} seconds long and the project frame rate is ${input.projectFps} fps.`,
    '',
    userDataBlock('Clip name', input.audioClipName, 300),
    userDataBlock('Context / topic', input.topicPrompt, 2_000),
    '',
    'Rules:',
    '1. Restore punctuation and capitalisation from the spoken syntax; attach punctuation to the word it follows.',
    '2. Create caption blocks of roughly 3–6 seconds, starting at 0.0 and covering the whole clip.',
    '3. Split every block into words with consecutive start/end seconds that fit inside the block boundaries.',
    '4. Emit HH:MM:SS:FF timestamps computed at the stated project frame rate.',
    '5. Return a JSON array of caption blocks matching the requested schema.',
  ].join('\n');
}

export function buildCaptionRefinementContents(input: {
  captionsJson: string;
  grammarPrompt: string;
  restorePunctuation: boolean;
}): string {
  return [
    'Refine the grammar, capitalisation and punctuation of the caption blocks provided below.',
    input.restorePunctuation
      ? "Restore punctuation ('.', ',', '?', '!', '\"', '-') and capitalisation of proper nouns and acronyms."
      : 'Do NOT add punctuation marks; keep the dialogue clean and flat.',
    input.grammarPrompt ? userDataBlock('Additional formatting instructions', input.grammarPrompt, 2_000) : '',
    'Keep the exact same number of blocks and the exact same id, start_time, end_time and word timestamps.',
    'Only the text field and the word strings may change.',
    '',
    userDataBlock('Caption blocks JSON', input.captionsJson, 4_000_000),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

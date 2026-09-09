/**
 * W1 podcast-script prompt (server-owned).
 *
 * Ported from the instruction that used to live in `src/App.tsx` and travel over
 * the wire from the browser. The client now sends **operation inputs only**.
 */
import { DATA_BLOCK_GUARD, userDataBlock } from './template';
import type { ScriptRequest } from '../schemas/operations';

/** Server-owned sizing policy: the client may not dictate output length. */
export const SCRIPT_BATCH_LINES = 50;

export function targetLineCount(duration: string): number {
  if (duration.includes('3-5')) return 60;
  if (duration.includes('10')) return 120;
  if (duration.includes('15')) return 200;
  if (duration.includes('20')) return 260;
  if (duration.includes('25')) return 320;
  if (duration.includes('30')) return 400;
  return 15;
}

export function linesForBatch(request: ScriptRequest): number {
  const total = targetLineCount(request.duration);
  const batches = Math.max(1, request.totalBatches);
  const isLast = request.batch === batches;
  if (isLast && total % SCRIPT_BATCH_LINES !== 0) return total % SCRIPT_BATCH_LINES;
  return Math.min(SCRIPT_BATCH_LINES, Math.max(5, total - (request.batch - 1) * SCRIPT_BATCH_LINES));
}

export function wordsForBatch(request: ScriptRequest): number {
  const totalWords = 2_650;
  return Math.max(120, Math.floor(totalWords / Math.max(1, request.totalBatches)));
}

export function buildScriptSystemInstruction(request: ScriptRequest): string {
  const isSingle = request.speakerCount === 'Single Speaker';
  const hostA = request.hostA?.trim() || 'Julia';
  const hostB = request.hostB?.trim() || 'James';

  const hostRules = isSingle
    ? `- Host (${hostA}): the welcoming teacher. Calm, encouraging and clear.
- In the JSON output the \`speaker\` field MUST be exactly "Host A".`
    : `- Host A (${hostA}): the primary guide. Holds a "secret trick" to reveal later; leads the topic warmly.
- Host B (${hostB}): the curious learner. Asks clarifying questions, shares short relatable anecdotes, reacts naturally.
- In the JSON output the \`speaker\` field MUST be exactly "Host A" or "Host B".`;

  return `Act as an elite content producer, voice director and podcast producer.
Write a ${isSingle ? 'solo' : '2-host'} script that sounds perfectly human, educational, slow-paced and calm.

1. LANGUAGE LEVEL (critical)
- Strictly match the requested level; for beginner levels use only simple sentences and basic vocabulary.
- Tone and pace follow the requested pace. Gentle, warm, encouraging, clear — never hyped.
- Naturally explain 2–3 slightly larger words over the episode.

2. HOST DYNAMICS
${hostRules}
- The hosts address each other by name.

3. PROGRESSION
- Batch 1: warm welcome, introduce the topic, tease a "small secret" that is only revealed at the end.
- Middle batches: break the topic down, include a relatable anecdote and one vocabulary explanation.
- Final batch: reveal the secret, conclude warmly, add a call to action that asks for one ALL-CAPS word, then say goodbye.

4. FORMATTING
- Generate exactly the number of dialogue lines requested for this batch.
- Output JSON only, matching the requested schema. No literal newlines inside \`text\` strings.
- Sparingly insert bracketed delivery tags ([pause], [warm], [curious], [laughs], [chuckles], [smiles], [soft], [emphasize], [rising tone], [end confidently]) only where they genuinely improve delivery.
- Populate \`emotion\` with a dynamic transition such as "Calm to Confident" or "Curious to Excited".

${DATA_BLOCK_GUARD}`;
}

export function buildScriptContents(request: ScriptRequest): string {
  const batch = request.batch;
  const total = Math.max(1, request.totalBatches);
  const lines = linesForBatch(request);
  const words = wordsForBatch(request);

  const stage =
    batch === 1
      ? 'This is batch 1: open with a warm welcome, introduce the topic and tease the secret without revealing it.'
      : batch >= total
        ? 'This is the final batch: reveal the teased secret, conclude warmly and end with the call to action.'
        : 'This is a middle batch: continue the deep dive, include one anecdote and one vocabulary explanation.';

  return [
    userDataBlock('Topic', request.topic, 500),
    userDataBlock('Channel name', request.channelName, 120),
    userDataBlock('Audience', request.audience, 200),
    `Format: ${request.speakerCount}`,
    `Level: ${request.level}`,
    `Style: ${request.style}`,
    `Pace: ${request.pace}`,
    `Realism: ${request.realism}`,
    `Target duration: ${request.duration}`,
    `Batch: ${batch} of ${total}`,
    `Generate exactly ${lines} dialogue lines and approximately ${words} words for this batch.`,
    stage,
  ].join('\n');
}

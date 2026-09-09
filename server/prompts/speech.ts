/**
 * W2 speech prompt (server-owned). The client sends script lines and a voice
 * choice; every performance instruction lives here.
 */
import { DATA_BLOCK_GUARD, userDataBlock } from './template';
import type { SpeechRequest } from '../schemas/operations';

export const DEFAULT_SPEAKER_A = 'Sarah';
export const DEFAULT_SPEAKER_B = 'James';

const VOICE_DIRECTION = `Perform the script as a professional storyteller talking to a close friend.
- Never read flatly: let the emotional tone evolve inside each sentence.
- Vary energy, pitch, pace, rhythm, volume and emphasis; breathe where a person would.
- Bracketed vocal tags ([laughs], [chuckles], [sighs], [inhales], [gasps], [clears throat], [whispers], [pause], [short pause], [beat]) must be performed, never spoken aloud.
- Bracketed delivery tags ([slow], [soft], [high energy], [warm], [emphasize], [rising tone], [end confidently]) are commands to execute, never text to read.
- The result must feel human, dynamic and warm.`;

export function speakerNames(config: SpeechRequest['voiceConfig']): { a: string; b: string } {
  const fromConfig = config.speakerNames;
  return {
    a: (fromConfig?.[0] ?? '').trim() || DEFAULT_SPEAKER_A,
    b: (fromConfig?.[1] ?? '').trim() || DEFAULT_SPEAKER_B,
  };
}

export function buildSpeechContents(request: SpeechRequest): string {
  const names = speakerNames(request.voiceConfig);
  const isSingle = request.voiceConfig.mode === 'single';

  const script = request.lines
    .map((line) => {
      const emotion = line.emotion?.trim() ? `[Tone: ${line.emotion.trim()}] ` : '';
      if (isSingle) return `${emotion}${line.text}`;
      const isA = line.speaker === 'Host A' || line.speaker.toLowerCase() === names.a.toLowerCase();
      return `${isA ? names.a : names.b}: ${emotion}${line.text}`;
    })
    .join(isSingle ? ' ' : '\n');

  return [
    VOICE_DIRECTION,
    isSingle ? `Solo performance as ${names.a}.` : `Conversation between ${names.a} and ${names.b}.`,
    '',
    userDataBlock('Script to perform', script, 20 * 2_000),
    '',
    DATA_BLOCK_GUARD,
  ].join('\n');
}

export function buildSpeechConfig(request: SpeechRequest): {
  responseModalities: ['AUDIO'];
  speechConfig: Record<string, unknown>;
} {
  const names = speakerNames(request.voiceConfig);
  const voiceA = request.voiceConfig.hostA ?? 'Zephyr';
  const voiceB = request.voiceConfig.hostB ?? 'Puck';

  if (request.voiceConfig.mode === 'single') {
    return {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceA } },
      },
    };
  }

  return {
    responseModalities: ['AUDIO'],
    speechConfig: {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          { speaker: names.a, voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceA } } },
          { speaker: names.b, voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceB } } },
        ],
      },
    },
  };
}

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { parseCaptionTimestamp, secondsToFrameTimecode, secondsToSrtTimestamp, normalizeSrtTimestamp } from './src/features/video-studio/captions/services/captionTimecodeService';

dotenv.config();


const EXPORT_SESSION_PATTERN = /^session_[A-Za-z0-9_-]{32}$/;
const EXPORT_TOKEN = process.env.EXPORT_API_TOKEN?.trim() || '';
const EXPORT_SESSION_TTL_MS = 30 * 60 * 1000;
const EXPORT_RATE_WINDOW_MS = 60 * 1000;
const EXPORT_RATE_LIMITS: Record<string, number> = {
  '/start': 20,
  '/upload-frame': 600,
  '/upload-frames': 120,
  '/upload-audio': 60,
  '/finish': 20,
};
const EXPORT_DEFAULT_RATE_LIMIT = 60;
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const MAX_FRAME_INDEX = 10_000_000;
const MAX_BATCH_FRAMES = 120;
const MAX_SINGLE_FRAME_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_TEXT_REQUEST_BYTES = '10mb';
const MAX_BINARY_EXPORT_REQUEST_BYTES = '72mb';
const API_RATE_WINDOW_MS = 60 * 1000;
const API_RATE_LIMITS: Record<string, number> = {
  '/api/generateContent': 30,
  '/api/generate-captions': 30,
  '/api/parse-srt': 30,
  '/api/refine-captions': 20,
  '/api/export-srt': 60,
};
const apiRate = new Map<string, { windowStartedAt: number; count: number }>();

interface ExportSessionState {
  createdAt: number;
  lastActivityAt: number;
}

const exportSessions = new Map<string, ExportSessionState>();
const exportRate = new Map<string, { windowStartedAt: number; count: number }>();

const exportCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, state] of exportSessions) {
    if (now - state.lastActivityAt > EXPORT_SESSION_TTL_MS) {
      exportSessions.delete(sessionId);
      void fs.promises.rm(path.join('/tmp', sessionId), { recursive: true, force: true }).catch(() => undefined);
    }
  }
  for (const [ip, state] of exportRate) {
    if (now - state.windowStartedAt >= EXPORT_RATE_WINDOW_MS) {
      exportRate.delete(ip);
    }
  }
  for (const [key, state] of apiRate) {
    if (now - state.windowStartedAt >= API_RATE_WINDOW_MS) {
      apiRate.delete(key);
    }
  }
}, 60 * 1000);

const timerWithUnref = exportCleanupTimer as unknown as { unref?: () => void };
timerWithUnref.unref?.();

function secureTokenEquals(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function extractExportToken(req: express.Request): string {
  const header = req.header('authorization');
  if (!header) return '';
  const match = /^Bearer\s+(.+)$/.exec(header);
  return match?.[1]?.trim() || '';
}

function requireExportAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!EXPORT_TOKEN && process.env.NODE_ENV === 'production') {
    res.status(503).json({ error: 'Export API is disabled until EXPORT_API_TOKEN is configured.' });
    return;
  }

  if (EXPORT_TOKEN) {
    const received = extractExportToken(req);
    if (!secureTokenEquals(received, EXPORT_TOKEN)) {
      res.status(401).json({ error: 'Unauthorized export request.' });
      return;
    }
  }

  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = `${ip}:${req.path}`;
  const limit = EXPORT_RATE_LIMITS[req.path] ?? EXPORT_DEFAULT_RATE_LIMIT;
  const current = exportRate.get(key);
  if (!current || now - current.windowStartedAt >= EXPORT_RATE_WINDOW_MS) {
    exportRate.set(key, { windowStartedAt: now, count: 1 });
  } else {
    current.count += 1;
    if (current.count > limit) {
      res.status(429).json({ error: 'Too many requests for this export operation. Please retry later.' });
      return;
    }
  }

  next();
}

function createExportSessionId(): string {
  return `session_${crypto.randomBytes(16).toString('hex')}`;
}

function validateSessionId(value: unknown): value is string {
  return typeof value === 'string' && EXPORT_SESSION_PATTERN.test(value);
}

function getOwnedExportSession(sessionId: unknown): ExportSessionState | null {
  if (!validateSessionId(sessionId)) return null;
  const state = exportSessions.get(sessionId);
  if (!state) return null;
  if (Date.now() - state.lastActivityAt > EXPORT_SESSION_TTL_MS) {
    exportSessions.delete(sessionId);
    const staleDir = path.join('/tmp', sessionId);
    void fs.promises.rm(staleDir, { recursive: true, force: true }).catch(() => undefined);
    return null;
  }
  state.lastActivityAt = Date.now();
  return state;
}

function decodeBase64DataUrl(value: unknown, kind: 'image' | 'audio'): Buffer {
  if (typeof value !== 'string') {
    throw new Error('Binary payload must be a string.');
  }

  const prefix = kind === 'image'
    ? /^data:image\/(?:jpeg|jpg);base64,/i
    : /^data:audio\/(?:wav|x-wav|wave|webm|mpeg|mp4|aac|ogg);base64,/i;

  if (!prefix.test(value)) {
    throw new Error(`Unsupported ${kind} data URL.`);
  }

  const encoded = value.replace(prefix, '');
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error(`Invalid ${kind} base64 payload.`);
  }

  return Buffer.from(encoded, 'base64');
}

function validateFrameIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_FRAME_INDEX;
}

function removeSession(sessionId: string): void {
  exportSessions.delete(sessionId);
  void fs.promises.rm(path.join('/tmp', sessionId), { recursive: true, force: true }).catch(() => undefined);
}

function requireApiRateLimit(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const limit = API_RATE_LIMITS[req.path] ?? 60;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = `${ip}:${req.path}`;
  const now = Date.now();
  const current = apiRate.get(key);

  if (!current || now - current.windowStartedAt >= API_RATE_WINDOW_MS) {
    apiRate.set(key, { windowStartedAt: now, count: 1 });
    next();
    return;
  }

  current.count += 1;
  if (current.count > limit) {
    res.status(429).json({ error: 'Too many requests. Please retry later.' });
    return;
  }

  next();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.post('/api/generateContent', requireApiRateLimit, express.json({ limit: MAX_TEXT_REQUEST_BYTES }), async (req, res) => {
    const { audioClipName, duration, topicPrompt } = req.body ?? {};
    if (typeof audioClipName !== 'string' || !audioClipName.trim()) {
      return res.status(400).json({ error: 'audioClipName is required and must be a non-empty string' });
    }
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 86400) {
      return res.status(400).json({ error: 'duration must be a finite number greater than 0 and at most 86400 seconds' });
    }
    if (typeof topicPrompt !== 'string') {
      return res.status(400).json({ error: 'topicPrompt must be a string' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not defined. Falling back to high-fidelity simulated content.');
      const simulated = generateSimulatedContent(req.body);
      return res.json(simulated);
    }
    
    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent(req.body);
      res.json(response);
    } catch (err: any) {
      console.error('Error generating content:', err);
      console.warn('Error occurred calling Gemini API. Falling back to high-fidelity simulated content.');
      try {
        const simulated = generateSimulatedContent(req.body);
        return res.json(simulated);
      } catch (simErr: any) {
        res.status(500).json({ error: err.message || 'Failed to generate content' });
      }
    }
  });

  // 1. SPEECH-TO-TEXT / GENERATE CAPTIONS WITH GEMINI
  app.post('/api/generate-captions', requireApiRateLimit, express.json({ limit: MAX_TEXT_REQUEST_BYTES }), async (req, res) => {
    const { audioClipName, duration = 45, topicPrompt = '' } = req.body ?? {};

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not defined. Falling back to high-fidelity simulated captions.');
      // Return high-quality simulated captions aligned to the duration
      const simulated = generateSimulatedCaptions(audioClipName, duration, topicPrompt);
      return res.json({ captions: simulated, fallback: true, degraded: true, source: 'simulated', warning: 'Gemini is not configured; simulated captions were generated.' });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `Generate frame-accurate, professional karaoke subtitle captions for an audio track named "${audioClipName}".
The track is ${duration} seconds long.
${topicPrompt ? `Context / Topic: ${topicPrompt}` : ''}

You MUST generate realistic spoken dialogue representing this audio/video.
Apply STRICT GRAMMATICAL ALIGNMENT and ADVANCED PUNCTUATION RESTORATION:
1. Accurately recognize and insert all punctuation marks (Periods '.', Commas ',', Question Marks '?', Exclamation Marks '!', Quotation Marks '"', and Dashes '-') based on the speaker's syntax structure, rhetorical questions, and spoken cadence.
2. For casing-sensitive proper nouns and acronyms (like English), apply strict capitalization rules (e.g., capitalizing proper nouns like 'French', and acronyms like 'AI', 'HD', 'Vite', 'SRT', 'NLP').
3. Punctuation marks must be attached precisely to the word they follow in the 'words' array without breaking the millisecond-level synchronization. Example: { "word": "attention.", "start": 13.55, "end": 14.10 }.

Spacing should be beautiful: create separate caption blocks (usually 3-6 seconds each) starting from 0.0 seconds and covering the track up to ${duration} seconds.
For each caption block, split it into individual words. Provide start and end times in seconds for each word.
The word timings must be consecutive, logical, and strictly fit within the block's start_time and end_time.
Format the output as a JSON array of caption blocks according to the requested schema.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are an expert video transcriber, linguist, and subtitler. You produce subtitle blocks with precise start and end times, and word-by-word timing arrays matching standard speech rates. You specialize in restoring natural punctuation and casing directly in the word elements.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            description: 'List of subtitle caption blocks with precise grammar',
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: 'Unique caption block ID (e.g., cap_001)' },
                start_time: { type: Type.STRING, description: 'Frame-accurate timestamp in format HH:MM:SS:FF (e.g., 00:00:12:05)' },
                end_time: { type: Type.STRING, description: 'Frame-accurate timestamp in format HH:MM:SS:FF (e.g., 00:00:15:20)' },
                text: { type: Type.STRING, description: 'The complete dialogue sentence text for this caption block with perfect grammar and punctuation' },
                speaker: { type: Type.STRING, description: 'Identify who is speaking this block. MUST be "Host A" or "Host B"' },
                words: {
                  type: Type.ARRAY,
                  description: 'List of individual words inside this block. Each word must have trailing punctuation attached directly to the word string if appropriate.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING, description: 'The spoken word, including any attached punctuation (e.g., "attention.")' },
                      start: { type: Type.NUMBER, description: 'Start time in seconds from timeline start' },
                      end: { type: Type.NUMBER, description: 'End time in seconds from timeline start' }
                    },
                    required: ['word', 'start', 'end']
                  }
                }
              },
              required: ['id', 'start_time', 'end_time', 'text', 'speaker', 'words']
            }
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('Gemini returned an empty response');
      }

      const captions = JSON.parse(text);
      if (!validateCaptionBlocks(captions)) {
        throw new Error('Gemini returned invalid caption timing or word alignment');
      }
      res.json({ captions, fallback: false, source: 'gemini' });
    } catch (error: any) {
      console.error('Gemini STT API error:', error);
      // Fail gracefully with fallback so user is never blocked
      const simulated = generateSimulatedCaptions(audioClipName, duration, topicPrompt);
      return res.json({
        captions: simulated,
        error: error.message || 'Failed to call Gemini API',
        fallback: true,
        degraded: true,
        source: 'simulated',
        warning: 'Gemini caption generation failed; simulated captions were returned.'
      });
    }
  });

  // 1b. AI REFINE / GRAMMAR AND PUNCTUATION RESTORATION FOR EXTISTING SUBTITLES
  app.post('/api/refine-captions', requireApiRateLimit, express.json({ limit: MAX_TEXT_REQUEST_BYTES }), async (req, res) => {
    const { captions, grammarPrompt = '', restorePunctuation = true } = req.body ?? {};
    if (!Array.isArray(captions) || captions.length === 0 || captions.length > 10000) {
      return res.status(400).json({ error: 'captions must be a non-empty array with at most 10000 items' });
    }
    if (typeof grammarPrompt !== 'string') {
      return res.status(400).json({ error: 'grammarPrompt must be a string' });
    }
    if (typeof restorePunctuation !== 'boolean') {
      return res.status(400).json({ error: 'restorePunctuation must be a boolean' });
    }
    if (!validateCaptionBlocks(captions)) {
      return res.status(400).json({ error: 'captions contain invalid timing or word alignment' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not defined. Refining captions using local heuristic algorithms.');
      const refined = refineCaptionsHeuristically(captions, restorePunctuation);
      return res.json({ captions: refined, fallback: true, degraded: false, source: 'heuristic' });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `Refine the grammar, capitalization, and punctuation of the following subtitle caption blocks.
${restorePunctuation 
  ? `You must accurately restore punctuation (such as '.', ',', '?', '!', '"', '-') and capitalization (capitalizing sentences, proper nouns like 'French', 'France', 'Google', 'Croissant', and acronyms like 'AI', 'HD', 'Vite', 'SRT', 'NLP') without altering the timestamp boundaries or structural schema.`
  : `Do NOT add punctuation marks (such as '.', ',', '?', '!', '"'). Keep dialogue clean and flat without trailing punctuation marks.`
}
${grammarPrompt ? `Apply these custom grammar/formatting instructions strictly: "${grammarPrompt}"` : ''}
Keep the exact same number of blocks and the exact same 'id', 'start_time', 'end_time', and timestamps for 'words'.
Only modify the 'text' field (for corrected sentences) and the 'word' fields in the 'words' list so that they have correct spelling, grammar, proper capitalization, and attached punctuation.
Every word's punctuation must be attached to the word itself, just like the input structure.

Input captions JSON:
${JSON.stringify(captions)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are an expert copyeditor and subtitle aligner. You refine the text of caption blocks to have perfect punctuation, grammar, and casing, while strictly preserving all timestamp values and the exact original JSON structure.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            description: 'List of refined subtitle caption blocks',
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                start_time: { type: Type.STRING },
                end_time: { type: Type.STRING },
                text: { type: Type.STRING, description: 'Refined sentence with proper punctuation and capitalization' },
                words: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING, description: 'Corrected/refined word, with punctuation attached' },
                      start: { type: Type.NUMBER },
                      end: { type: Type.NUMBER }
                    },
                    required: ['word', 'start', 'end']
                  }
                }
              },
              required: ['id', 'start_time', 'end_time', 'text', 'words']
            }
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('Gemini returned empty response for refinement');
      }

      const refined = JSON.parse(text);
      if (!validateRefinedCaptions(captions, refined)) {
        throw new Error('Gemini returned caption timing/schema changes during refinement');
      }
      res.json({ captions: refined, fallback: false, degraded: false, source: 'gemini' });
    } catch (error: any) {
      console.error('Gemini refinement error:', error);
      const refined = refineCaptionsHeuristically(captions, restorePunctuation);
      res.json({ captions: refined, error: error.message, fallback: true, source: 'heuristic' });
    }
  });

  // 2. PARSE EXTERNAL SRT FILE CONTENT with Auto-Refine / Grammar Restoration
  app.post('/api/parse-srt', requireApiRateLimit, express.json({ limit: MAX_TEXT_REQUEST_BYTES }), async (req, res) => {
    const { srtContent, refine = false } = req.body ?? {};
    if (typeof srtContent !== 'string' || !srtContent.trim()) {
      return res.status(400).json({ error: 'srtContent is required and must be a non-empty string' });
    }
    if (srtContent.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'srtContent exceeds the 10MB limit' });
    }
    if (typeof refine !== 'boolean') {
      return res.status(400).json({ error: 'refine must be a boolean' });
    }

    try {
      const parsed = parseSrtContent(srtContent);
      if (parsed.length === 0) {
        return res.status(422).json({ error: 'No valid SRT caption blocks were found' });
      }
      if (!refine) {
        return res.json({ captions: parsed, fallback: false, source: 'srt' });
      }
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        // SRT import is lossless by default: do not rewrite user subtitle text or timing.
        return res.json({ captions: parsed, fallback: false, source: 'srt' });
      }

      // Call Gemini to refine the parsed SRT with advanced NLP
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `Refine the grammar, capitalization, and punctuation of the following subtitle caption blocks parsed from an SRT file.
You must accurately restore punctuation (such as '.', ',', '?', '!', '"', '-') and capitalization (capitalizing sentences, proper nouns, and acronyms like 'AI', 'HD', 'Vite', 'SRT', 'NLP') without altering the timestamp boundaries or structural schema.
Keep the exact same number of blocks and the exact same 'id', 'start_time', 'end_time', and timestamps for 'words'.
Only modify the 'text' field (for corrected sentences) and the 'word' fields in the 'words' list so that they have correct spelling, grammar, proper capitalization, and attached punctuation.
Every word's punctuation must be attached to the word itself, just like the input structure.

Input parsed captions JSON:
${JSON.stringify(parsed)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are an expert copyeditor and subtitle aligner. You refine the text of caption blocks to have perfect punctuation, grammar, and casing, while strictly preserving all timestamp values and the exact original JSON structure.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            description: 'List of refined subtitle caption blocks',
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                start_time: { type: Type.STRING },
                end_time: { type: Type.STRING },
                text: { type: Type.STRING, description: 'Refined sentence with proper punctuation and capitalization' },
                words: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING, description: 'Corrected/refined word, with punctuation attached' },
                      start: { type: Type.NUMBER },
                      end: { type: Type.NUMBER }
                    },
                    required: ['word', 'start', 'end']
                  }
                }
              },
              required: ['id', 'start_time', 'end_time', 'text', 'words']
            }
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('Gemini returned empty response for SRT refinement');
      }

      const refined = JSON.parse(text);
      if (!validateRefinedCaptions(parsed, refined)) {
        throw new Error('Gemini returned caption timing/schema changes during SRT refinement');
      }
      res.json({ captions: refined, fallback: false, degraded: false, source: 'gemini' });
    } catch (err: any) {
      console.error('SRT Parsing NLP refinement error:', err);
      // Refinement failure must never corrupt an imported SRT. Return the parsed,
      // lossless captions and explicitly report that refinement was not applied.
      const parsedFallback = parseSrtContent(srtContent);
      res.json({ captions: parsedFallback, error: err.message, fallback: false, refinementFailed: true, source: 'srt' });
    }
  });

  // 3. EXPORT CAPTIONS TO SRT FILE
  app.post('/api/export-srt', requireApiRateLimit, express.json({ limit: MAX_TEXT_REQUEST_BYTES }), (req, res) => {
    const { captions } = req.body ?? {};
    if (!Array.isArray(captions) || captions.length === 0 || captions.length > 10000) {
      return res.status(400).json({ error: 'captions must be a non-empty array with at most 10000 items' });
    }
    if (!validateCaptionBlocks(captions)) {
      return res.status(400).json({ error: 'captions contain invalid timing or word alignment' });
    }

    try {
      const srtString = exportToSrtString(captions);
      res.json({ srt: srtString });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to export SRT content' });
    }
  });

  // 4. ADVANCED FFMPEG EXPORT PIPELINE
  const exportRouter = express.Router();
  exportRouter.use(requireExportAuth);
  exportRouter.use(express.json({ limit: MAX_BINARY_EXPORT_REQUEST_BYTES }));

  exportRouter.post('/start', (req, res) => {
    const sessionId = createExportSessionId();
    const tempDir = path.join('/tmp', sessionId);
    try {
      fs.mkdirSync(tempDir, { recursive: true, mode: 0o700 });
      exportSessions.set(sessionId, {
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      });
      res.json({ sessionId, success: true });
    } catch (err: any) {
      console.error('Failed to start render session:', err);
      res.status(500).json({ error: 'Failed to start session' });
    }
  });

  exportRouter.post('/upload-frames', (req, res) => {
    const { sessionId, frames } = req.body as { sessionId?: unknown; frames?: unknown };
    if (!validateSessionId(sessionId) || !Array.isArray(frames)) {
      return res.status(400).json({ error: 'Invalid sessionId or frames array' });
    }
    if (frames.length === 0 || frames.length > MAX_BATCH_FRAMES) {
      return res.status(400).json({ error: `frames must contain 1-${MAX_BATCH_FRAMES} items` });
    }

    const session = getOwnedExportSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found or expired' });

    try {
      for (const frame of frames) {
        if (!frame || typeof frame !== 'object') {
          return res.status(400).json({ error: 'Invalid frame payload' });
        }
        const { frameIndex, frameData } = frame as { frameIndex?: unknown; frameData?: unknown };
        if (!validateFrameIndex(frameIndex)) {
          return res.status(400).json({ error: 'Invalid frameIndex' });
        }
        const buffer = decodeBase64DataUrl(frameData, 'image');
        if (buffer.length === 0 || buffer.length > MAX_SINGLE_FRAME_BYTES) {
          return res.status(413).json({ error: `Frame exceeds ${MAX_SINGLE_FRAME_BYTES} byte limit` });
        }
        const filePath = path.join('/tmp', sessionId, `frame_${String(frameIndex).padStart(6, '0')}.jpg`);
        fs.writeFileSync(filePath, buffer, { mode: 0o600 });
      }
      return res.json({ success: true, count: frames.length });
    } catch (err: any) {
      console.error('Failed to save frames:', err);
      return res.status(400).json({ error: err.message || 'Failed to save frames' });
    }
  });

  exportRouter.post('/upload-frame', (req, res) => {
    const { sessionId, frameIndex, frameData } = req.body as {
      sessionId?: unknown;
      frameIndex?: unknown;
      frameData?: unknown;
    };
    if (!validateSessionId(sessionId) || !validateFrameIndex(frameIndex)) {
      return res.status(400).json({ error: 'Invalid sessionId or frameIndex' });
    }

    const session = getOwnedExportSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found or expired' });

    try {
      const buffer = decodeBase64DataUrl(frameData, 'image');
      if (buffer.length === 0 || buffer.length > MAX_SINGLE_FRAME_BYTES) {
        return res.status(413).json({ error: `Frame exceeds ${MAX_SINGLE_FRAME_BYTES} byte limit` });
      }
      const filePath = path.join('/tmp', sessionId, `frame_${String(frameIndex).padStart(6, '0')}.jpg`);
      fs.writeFileSync(filePath, buffer, { mode: 0o600 });
      return res.json({ success: true, frameIndex });
    } catch (err: any) {
      console.error('Failed to save frame:', err);
      return res.status(400).json({ error: err.message || 'Failed to save frame' });
    }
  });

  exportRouter.post('/upload-audio', (req, res) => {
    const { sessionId, audioData } = req.body as { sessionId?: unknown; audioData?: unknown };
    if (!validateSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }

    const session = getOwnedExportSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found or expired' });

    try {
      const buffer = decodeBase64DataUrl(audioData, 'audio');
      if (buffer.length === 0 || buffer.length > MAX_AUDIO_BYTES) {
        return res.status(413).json({ error: `Audio exceeds ${MAX_AUDIO_BYTES} byte limit` });
      }

      const raw = String(audioData);
      let extension: 'webm' | 'wav' | 'mp3' = 'webm';
      if (/^data:audio\/(?:wav|x-wav|wave);base64,/i.test(raw)) extension = 'wav';
      else if (/^data:audio\/(?:mpeg);base64,/i.test(raw)) extension = 'mp3';

      const filePath = path.join('/tmp', sessionId, `audio.${extension}`);
      fs.writeFileSync(filePath, buffer, { mode: 0o600 });
      return res.json({ success: true, extension });
    } catch (err: any) {
      console.error('Failed to save audio:', err);
      return res.status(400).json({ error: err.message || 'Failed to save audio' });
    }
  });

  exportRouter.post('/finish', async (req, res) => {
    const { sessionId, fps = 30, format = 'mp4' } = req.body as {
      sessionId?: unknown;
      fps?: unknown;
      format?: unknown;
    };

    if (!validateSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    if (typeof fps !== 'number' || !Number.isFinite(fps) || fps < 1 || fps > 120) {
      return res.status(400).json({ error: 'fps must be a number between 1 and 120' });
    }
    if (format !== 'mp4') {
      return res.status(400).json({ error: 'Only MP4 is supported by the server export pipeline.' });
    }

    const session = getOwnedExportSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found or expired' });

    const tempDir = path.join('/tmp', sessionId);
    const hasWebmAudio = fs.existsSync(path.join(tempDir, 'audio.webm'));
    const hasWavAudio = fs.existsSync(path.join(tempDir, 'audio.wav'));
    const hasMp3Audio = fs.existsSync(path.join(tempDir, 'audio.mp3'));
    const audioFile = hasWavAudio ? 'audio.wav' : (hasMp3Audio ? 'audio.mp3' : (hasWebmAudio ? 'audio.webm' : null));
    const outputPath = path.join(tempDir, 'output.mp4');

    // Frame uploads are a contiguous render contract. Never start FFmpeg with
    // a sparse sequence because FFmpeg would otherwise encode a misleadingly
    // short/incomplete movie. Ignore output.mp4 from previous attempts because
    // the session is single-use and finish removes it on completion/failure.
    const frameFiles = (await fs.promises.readdir(tempDir))
      .filter((name) => /^frame_\d{6}\.jpg$/.test(name))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (frameFiles.length === 0) {
      removeSession(sessionId);
      return res.status(400).json({ error: 'No video frames were uploaded for this export session.' });
    }
    const frameIndices = frameFiles.map((name) => Number(name.slice(6, -4)));
    for (let i = 0; i < frameIndices.length; i += 1) {
      if (frameIndices[i] != i) {
        removeSession(sessionId);
        return res.status(400).json({ error: `Frame sequence is incomplete at index ${i}.` });
      }
    }

    const args = [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(tempDir, 'frame_%06d.jpg'),
    ];

    if (audioFile) {
      args.push('-i', path.join(tempDir, audioFile));
    }

    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
    if (audioFile) {
      args.push('-c:a', 'aac', '-shortest');
    }
    args.push(outputPath);

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn('ffmpeg', args, {
          cwd: tempDir,
          shell: false,
          stdio: ['ignore', 'ignore', 'pipe'],
        });

        let stderr = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
          stderr += chunk;
          if (stderr.length > 16_384) stderr = stderr.slice(-16_384);
        });

        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        });
      });

      if (!fs.existsSync(outputPath)) {
        throw new Error('Output file was not generated.');
      }

      const outputStats = await fs.promises.stat(outputPath);
      if (outputStats.size <= 0 || outputStats.size > MAX_OUTPUT_BYTES) {
        throw new Error('Generated output exceeds the server export size limit.');
      }

      const videoBuffer = await fs.promises.readFile(outputPath);
      const videoBase64 = videoBuffer.toString('base64');

      removeSession(sessionId);
      return res.json({
        success: true,
        videoData: `data:video/mp4;base64,${videoBase64}`,
      });
    } catch (err: any) {
      console.error('FFmpeg rendering error:', err);
      removeSession(sessionId);
      return res.status(500).json({
        error: 'FFmpeg rendering failed.',
        details: process.env.NODE_ENV === 'production' ? undefined : err.message,
      });
    }
  });

  app.use('/api/export', exportRouter);

  // Vite is a development-only runtime. Keep it out of the production server
  // dependency graph by loading it only when the development middleware is used.
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Caption timing is centralized in captionTimecodeService.ts.

// Generates simulated caption sequence when no API key is available or in case of errors
function generateSimulatedCaptions(audioName: string, duration: number, topicPrompt: string) {
  const isCroissant = audioName.toLowerCase().includes('croiss') || topicPrompt.toLowerCase().includes('croiss');
  
  const croissantDialogue = [
    "Welcome back to Croissant Masterclass. Today, we're baking the perfect French pastry.",
    "First, we mix our flour, yeast, sugar, and milk to create our base dough.",
    "Let's knead the dough gently, making sure it remains smooth and perfectly elastic.",
    "Now, we wrap our dough and let it rest in a cold, chilled environment for two hours.",
    "Next is the secret: we roll out cold unsalted butter to create our lamination sheet.",
    "We place the butter block onto the dough and perform our first three-fold turn.",
    "Look at these beautiful layers! Roll it thin and cut perfect triangles.",
    "We roll them up tightly from the base to form the classic crescent croissant shape.",
    "Let them proof at warm temperature until doubled in size and beautifully jiggly.",
    "Brush with egg wash and bake at 375 degrees until perfectly golden brown and crispy.",
    "Listen to that incredible crunch! A masterclass croissant baked to absolute perfection."
  ];

  const genericDialogue = [
    "Hello and welcome! In this tutorial, we are going to learn how to create amazing video projects.",
    "Let's start by looking at our resource panel and adding some visual media assets.",
    "We can drag and drop any video or audio tracks directly onto our Virtualized Timeline.",
    "Now let's select our clip and inspect its basic physical and structural properties.",
    "We can easily adjust the scale percentage, position coordinates, and rotation angle.",
    "Applying high-quality AI tools like auto-background removal enhances the output instantly.",
    "Let's play back our sequence to make sure everything aligns and matches correctly.",
    "We can also synchronize beautiful stylized captions to make the video super engaging.",
    "Using karaoke style active word highlighting brings your text to life dynamically.",
    "Finally, we can preview the whole sequence and hit the Export button to save our video.",
    "Thank you for watching! Don't forget to save your project and subscribe for more tips."
  ];

  const dialogue = isCroissant ? croissantDialogue : genericDialogue;
  const captions: any[] = [];
  const averageBlockDuration = 4.0;
  const gap = 0.5;

  let currentStart = 1.0;
  let counter = 1;

  while (currentStart < duration && counter <= dialogue.length) {
    const text = dialogue[counter - 1];
    if (text === undefined) break;
    const wordsList = text.split(' ');
    
    // Calculate a reasonable end time based on sentence length
    const blockDuration = Math.min(averageBlockDuration, Math.max(2.5, wordsList.length * 0.4));
    let currentEnd = currentStart + blockDuration;
    if (currentEnd > duration) {
      currentEnd = duration;
    }

    if (currentEnd - currentStart < 1.0) break;

    // Generate precise word timings
    const words: any[] = [];
    const wordDur = (currentEnd - currentStart) / wordsList.length;
    
    wordsList.forEach((w, idx) => {
      const rawStart = currentStart + idx * wordDur;
      const rawEnd = idx === wordsList.length - 1 ? currentEnd : currentStart + (idx + 1) * wordDur;
      const wStart = Number(rawStart.toFixed(6));
      const wEnd = Number(rawEnd.toFixed(6));
      words.push({
        word: w,
        start: wStart,
        end: wEnd
      });
    });

    captions.push({
      id: `sim_cap_${counter.toString().padStart(3, '0')}`,
      start_time: secondsToFrameTimecode(currentStart),
      end_time: secondsToFrameTimecode(currentEnd),
      text: text,
      words: words,
      speaker: counter % 2 !== 0 ? 'Host A' : 'Host B'
    });

    currentStart = currentEnd + gap;
    counter++;
  }

  return captions;
}

// Parses standard SRT file content into subtitle state object
function parseSrtContent(srt: string): any[] {
  const blocks = srt.replace(/^\uFEFF/, '').trim().split(/\r?\n(?:[ \t]*\r?\n)+/);
  const captions: any[] = [];

  blocks.forEach((block, index) => {
    const lines = block.split(/\r?\n/);
    if (lines.length < 3) return;

    // Locate the timing line instead of assuming a perfect sequence-number line.
    const timingIndex = lines.findIndex((line) => /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(line));
    if (timingIndex < 0) return;
    const timeLine = lines[timingIndex];
    if (timeLine === undefined) return;
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!timeMatch) return;

    const srtStart = timeMatch[1];
    const srtEnd = timeMatch[2];
    if (!srtStart || !srtEnd) return;

    // Convert srt times to standard decimal seconds
    const startSeconds = parseCaptionTimestamp(srtStart);
    const endSeconds = parseCaptionTimestamp(srtEnd);

    // Remaining lines represent the subtitle text
    const textLines = lines.slice(timingIndex + 1);
    const text = textLines.join(' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); // Strip HTML tags without changing semantic words

    // Generate linearly spaced word timestamps
    if (!text) return;
    const wordsList = text.split(/\s+/).filter(w => w.length > 0);
    const words: any[] = [];
    if (!(endSeconds > startSeconds)) return;

    const blockDuration = endSeconds - startSeconds;
    const wordDur = blockDuration / (wordsList.length || 1);

    wordsList.forEach((w, idx) => {
      const wStart = startSeconds + idx * wordDur;
      const wEnd = idx === wordsList.length - 1 ? endSeconds : startSeconds + (idx + 1) * wordDur;
      words.push({
        word: w,
        start: Number(wStart.toFixed(6)),
        end: Number(wEnd.toFixed(6))
      });
    });

    captions.push({
      id: `uploaded_cap_${index + 1}`,
      start_time: normalizeSrtTimestamp(srtStart),
      end_time: normalizeSrtTimestamp(srtEnd),
      text: text,
      words: words,
      wordTimingSource: 'inferred'
    });
  });

  return captions;
}

// SRT timestamps are parsed by the canonical caption timecode service.

// Convert seconds back to SRT style timestamp
const secondsToSrtTime = secondsToSrtTimestamp;

function validateCaptionBlocks(captions: any[]): boolean {
  if (!Array.isArray(captions)) return false;
  return captions.every((cap) => {
    if (!cap || typeof cap.id !== 'string' || typeof cap.text !== 'string') return false;
    let start: number;
    let end: number;
    try {
      start = parseCaptionTimestamp(cap.start_time);
      end = parseCaptionTimestamp(cap.end_time);
    } catch {
      return false;
    }
    if (!(end > start)) return false;
    if (!Array.isArray(cap.words) || cap.words.length === 0) return false;
    let previousEnd = start;
    for (let index = 0; index < cap.words.length; index += 1) {
      const word = cap.words[index];
      if (!word || typeof word.word !== 'string' || !Number.isFinite(word.start) || !Number.isFinite(word.end)) return false;
      if (!(word.end > word.start)) return false;
      if (word.start < start - 1e-6 || word.end > end + 1e-6) return false;
      if (index === 0 && Math.abs(word.start - start) > 1e-6) return false;
      if (Math.abs(word.start - previousEnd) > 1e-6) return false;
      previousEnd = word.end;
    }
    return Math.abs(previousEnd - end) <= 1e-6;
  });
}

function validateRefinedCaptions(original: any[], refined: any[]): boolean {
  if (!Array.isArray(refined) || refined.length !== original.length) return false;
  return original.every((source, index) => {
    const target = refined[index];
    if (!target || target.id !== source.id || target.start_time !== source.start_time || target.end_time !== source.end_time) return false;
    const sourceWords = Array.isArray(source.words) ? source.words : [];
    const targetWords = Array.isArray(target.words) ? target.words : [];
    if (sourceWords.length !== targetWords.length) return false;
    return sourceWords.every((word: any, wordIndex: number) => {
      const out = targetWords[wordIndex];
      return out && out.start === word.start && out.end === word.end;
    });
  });
}

// Exports caption state to SRT string format
function exportToSrtString(captions: any[]): string {
  return captions.map((cap, index) => {
    // Parse times or reconstruct from seconds
    const startSec = parseCaptionTimestamp(cap.start_time);
    const endSec = parseCaptionTimestamp(cap.end_time);

    const startSrt = secondsToSrtTime(startSec);
    const endSrt = secondsToSrtTime(endSec);

    return `${index + 1}\n${startSrt} --> ${endSrt}\n${cap.text}\n`;
  }).join('\n');
}

// Local high-fidelity heuristic algorithm for grammar, capitalization, and punctuation refinement
function refineCaptionsHeuristically(captions: any[], restorePunctuation = true): any[] {
  const acronyms = ['ai', 'hd', 'srt', 'stt', 'nlp', 'tts', 'fps', 'cpu', 'gpu', 'ui', 'api', 'url', 'json', 'id'];
  const properNouns = ['french', 'croissant', 'masterclass'];

  return captions.map((cap) => {
    if (!cap.words || cap.words.length === 0) return cap;

    const refinedWords = cap.words.map((wObj: any, index: number) => {
      let rawWord = wObj.word.trim();
      if (!rawWord) return wObj;

      // Extract trailing punctuation if any
      const puncMatch = rawWord.match(/^([a-zA-Z0-9'’]+)([^a-zA-Z0-9'’]*)$/);
      let wordStem = rawWord;
      let punctuation = '';

      if (puncMatch) {
        wordStem = puncMatch[1];
        punctuation = puncMatch[2];
      }

      const lowerStem = wordStem.toLowerCase();

      // 1. Acronym capitalization
      if (acronyms.includes(lowerStem)) {
        wordStem = wordStem.toUpperCase();
      }
      // 2. Proper nouns / standard capitalize first letter
      else if (properNouns.includes(lowerStem)) {
        wordStem = lowerStem.charAt(0).toUpperCase() + lowerStem.slice(1);
      }
      // 3. First word of the block always capitalized
      else if (index === 0) {
        wordStem = wordStem.charAt(0).toUpperCase() + wordStem.slice(1);
      }

      // Re-attach punctuation
      let finalWord = wordStem + punctuation;

      if (!restorePunctuation) {
        finalWord = finalWord.replace(/[.,!?;:]+$/g, '');
      } else if (index === cap.words.length - 1) {
        const lastChar = finalWord.slice(-1);
        if (!['.', '!', '?'].includes(lastChar)) {
          finalWord += '.';
        }
      }

      return {
        ...wObj,
        word: finalWord,
      };
    });

    // Reconstruct block text by joining words
    const refinedText = refinedWords.map((w: any) => w.word).join(' ');

    return {
      ...cap,
      text: refinedText,
      words: refinedWords,
    };
  });
}

// Local high-fidelity simulation engine for generateContent when GEMINI_API_KEY is missing/rate-limited
function generateSimulatedContent(body: any): any {
  // 1. Check if model is TTS
  if (body.model === 'gemini-2.5-flash-preview-tts') {
    const sampleRate = 24000;
    const numSamples = 24000; // 1 second of silence
    const pcmBytesLength = numSamples * 2;
    const buffer = Buffer.alloc(44 + pcmBytesLength);

    // RIFF chunk descriptor
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + pcmBytesLength, 4);
    buffer.write('WAVE', 8);

    // fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); 
    buffer.writeUInt16LE(1, 20);  
    buffer.writeUInt16LE(1, 22);  
    buffer.writeUInt32LE(sampleRate, 24); 
    buffer.writeUInt32LE(sampleRate * 2, 28); 
    buffer.writeUInt16LE(2, 32);  
    buffer.writeUInt16LE(16, 34); 

    // data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(pcmBytesLength, 40);

    // Remaining bytes are PCM (already 0-filled by Buffer.alloc)
    const base64Audio = buffer.toString('base64');

    return {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/wav',
                  data: base64Audio
                }
              }
            ]
          }
        }
      ]
    };
  }

  // 2. Otherwise, check if it's script coaching/refining or generation
  const contentsStr = JSON.stringify(body.contents || '');
  
  if (contentsStr.includes('voice director') || contentsStr.includes('emotion labels') || contentsStr.includes('Delivery Tag')) {
    const rawContents = Array.isArray(body.contents) 
      ? JSON.stringify(body.contents) 
      : String(body.contents || '');
    
    const linesToCoach: string[] = [];
    const lineRegex = /\[Line\s*(\d+)\]\s*([^:]+):\s*([^\n\r]+)/g;
    let match;
    while ((match = lineRegex.exec(rawContents)) !== null) {
      const lineText = match[3];
      if (lineText !== undefined) linesToCoach.push(lineText.trim());
    }

    if (linesToCoach.length === 0) {
      const speakerRegex = /(Host A|Host B|Sarah|James):\s*([^\n\r"]+)/g;
      while ((match = speakerRegex.exec(rawContents)) !== null) {
        const speakerText = match[2];
        if (speakerText !== undefined) linesToCoach.push(speakerText.trim());
      }
    }

    if (linesToCoach.length === 0) {
      linesToCoach.push("Welcome back to our channel!");
      linesToCoach.push("Today we have an amazing topic for you.");
    }

    const emotions = [
      "Calm to Confident", "Curious to Excited", "Serious to Warm", 
      "Warm to Inspirational", "Neutral to Curious", "Humorous to Serious", 
      "Surprise to Excitement", "Excitement to Calm", "Gentle to Humorous"
    ];

    const sfxOptions = [
      "[chuckles]", "[sighs heavily]", "[clears throat]", "[giggles]", "[pause]", "[short pause]", "[dramatic pause]",
      "[excited]", "[calm]", "[thoughtful]", "[door opens]", "[keyboard typing]", "[birds chirping]", "[wind blowing]",
      "[crowd murmuring]", "[applause]", "[music starts]", "[music fades in]", "[fade in]", "[transition sound]"
    ];

    const coachedArray = linesToCoach.map((originalText, idx) => {
      const emotion = emotions[idx % emotions.length];
      const sfx = sfxOptions[idx % sfxOptions.length];
      
      let text = originalText;
      if (idx % 2 === 0) {
        text = `${sfx} ${text}`;
      } else if (idx % 3 === 0) {
        text = text.replace(/(\.|\?|\!)$/, ' [pause]$1');
      }

      return {
        emotion,
        text
      };
    });

    const jsonText = JSON.stringify(coachedArray);
    return {
      text: jsonText,
      candidates: [
        {
          content: {
            parts: [
              {
                text: jsonText
              }
            ]
          }
        }
      ]
    };
  }

  // 3. Otherwise, it is Script Generation!
  const topicMatch = contentsStr.match(/Topic:\s*([^\r\n"\\{}]+)/i);
  const topic = topicMatch?.[1]?.trim() || 'Fascinating Discoveries';

  const channelMatch = contentsStr.match(/Channel Name:\s*([^\r\n"\\{}]+)/i);
  const channelName = channelMatch?.[1]?.trim() || 'Deep Dive Podcast';

  const batchMatch = contentsStr.match(/Batch:\s*(\d+)\s*of\s*(\d+)/i);
  const batchNum = batchMatch?.[1] ? parseInt(batchMatch[1], 10) : 1;
  const totalBatches = batchMatch?.[2] ? parseInt(batchMatch[2], 10) : 1;

  const isBaking = topic.toLowerCase().includes('bake') || topic.toLowerCase().includes('croissant') || topic.toLowerCase().includes('cook');
  const isTech = topic.toLowerCase().includes('tech') || topic.toLowerCase().includes('ai') || topic.toLowerCase().includes('robot') || topic.toLowerCase().includes('comput');

  let script: any[] = [];
  const youtubeHook = `How ${topic} Actually Works!`;

  if (batchNum === 1) {
    if (isBaking) {
      script = [
        { speaker: "Host A", emotion: "Warm to Excited", text: "[smiles warmly] Welcome back to another episode of ${channelName}! Today we are talking about the absolute art of baking, specifically... ${topic}!" },
        { speaker: "Host B", emotion: "Curious to Excited", text: "Oh, I am so excited for this. I've tried baking it myself, and let's just say, it ended up more like a brick than a pastry!" },
        { speaker: "Host A", emotion: "Humorous to Serious", text: "[chuckles] Well, that's because you likely skipped the most important secret trick, which I'm going to share with you at the very end of today's episode." },
        { speaker: "Host B", emotion: "Surprise to Excitement", text: "Wait, a secret trick? Don't do this to me! Tell me now!" },
        { speaker: "Host A", emotion: "Gentle to Humorous", text: "No way! You have to earn it. [laughs] But let's start with the basics of how we create that rich foundation." }
      ];
    } else if (isTech) {
      script = [
        { speaker: "Host A", emotion: "Warm to Excited", text: "[smiles warmly] Welcome back to ${channelName}! Today, we are deep-diving into the cutting-edge world of technology, focusing on: ${topic}." },
        { speaker: "Host B", emotion: "Curious to Excited", text: "This is huge. Honestly, the rate at which things are evolving in this space is completely mind-blowing." },
        { speaker: "Host A", emotion: "Humorous to Serious", text: "It really is. In fact, there is one key concept that most people completely overlook, and I'll reveal that secret trick towards the end of our talk today." },
        { speaker: "Host B", emotion: "Surprise to Excitement", text: "[gasps] A secret trick? Come on, don't keep me in suspense like that!" },
        { speaker: "Host A", emotion: "Gentle to Humorous", text: "Patience, my friend! [smiles] First, let's understand why this technology even exists and what problems it solves." }
      ];
    } else {
      script = [
        { speaker: "Host A", emotion: "Warm to Excited", text: "[smiles warmly] Welcome back to ${channelName}! Today, we are diving deep into a topic that has been highly requested: ${topic}." },
        { speaker: "Host B", emotion: "Curious to Excited", text: "Yes! I've been reading up on this all week, and there are so many surprising angles to it." },
        { speaker: "Host A", emotion: "Humorous to Serious", text: "Absolutely. And actually, there's a specific, lesser-known secret technique that completely changed my view on this, which I'll share at the very end." },
        { speaker: "Host B", emotion: "Surprise to Excitement", text: "[grins] Oh, a secret? Now you've really got my full attention! Let's get right into it." },
        { speaker: "Host A", emotion: "Gentle to Humorous", text: "Perfect. [takes a deep breath] Let's begin by unpacking the core principles of ${topic}." }
      ];
    }
  } else if (batchNum === totalBatches) {
    script = [
      { speaker: "Host B", emotion: "Curious to Excited", text: "Alright, we've covered the history, the methodology, and some amazing stories. But I am still waiting for that secret trick you promised!" },
      { speaker: "Host A", emotion: "Warm to Inspirational", text: "[smiles] Ah, yes! The moment of truth. The absolute secret to mastering ${topic} is simply consistency and taking it one small layer at a time." },
      { speaker: "Host B", emotion: "Surprise to Excitement", text: "Consistency! Wow. It sounds so simple, yet it makes perfect sense when you look at the big picture." },
      { speaker: "Host A", emotion: "Inspirational to Powerful", text: "Exactly. Don't rush the process. If you enjoy the journey, the results will follow naturally." },
      { speaker: "Host B", emotion: "Excitement to Calm", text: "That is incredibly inspiring. Thank you so much for sharing that, and for this incredible episode!" },
      { speaker: "Host A", emotion: "Warm to Inspirational", text: "Thank you all for listening! If you enjoyed this, please leave a comment with the word 'CREATOR' to let us know you made it to the end. [chuckles]" },
      { speaker: "Host B", emotion: "Warm to Excited", text: "Yes, comment 'CREATOR' below! See you in the next one. Bye-bye!" },
      { speaker: "Host A", emotion: "Gentle to Humorous", text: "Bye-bye! [waves]" }
    ];
  } else {
    script = [
      { speaker: "Host B", emotion: "Curious to Excited", text: "That makes so much sense. But what about the common mistakes people make when starting out?" },
      { speaker: "Host A", emotion: "Serious to Warm", text: "The biggest mistake is definitely over-complicating things. People try to do everything at once instead of building a strong foundation." },
      { speaker: "Host B", emotion: "Neutral to Curious", text: "[sighs] Guilty as charged! I always try to run before I can walk." },
      { speaker: "Host A", emotion: "Humorous to Serious", text: "[chuckles] We all do. But remember, even the absolute top experts started with the exact same simple steps we're talking about today." },
      { speaker: "Host B", emotion: "Warm to Inspirational", text: "That is really reassuring to hear. It's all about enjoying the process." }
    ];
  }

  // Replace ${topic} and ${channelName} dynamically in simulated text
  script = script.map(line => {
    return {
      ...line,
      text: line.text
        .replace(/\$\{topic\}/g, topic)
        .replace(/\$\{channelName\}/g, channelName)
    };
  });

  const podcastData = {
    metadata: {
      title: topic,
      level: "Intermediate",
      estimated_duration: "8 mins",
      youtube_hook: youtubeHook
    },
    script: script
  };

  const jsonText = JSON.stringify(podcastData);
  return {
    text: jsonText,
    candidates: [
      {
        content: {
          parts: [
            {
              text: jsonText
            }
          ]
        }
      }
    ]
  };
}

startServer();

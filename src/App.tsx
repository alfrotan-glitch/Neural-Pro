import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Square, Loader2, Mic, Settings, Volume2, Download, Sparkles, Headphones, Radio, Youtube, Video, Music, Copy, Check, FileText, Activity, Pause, Edit2, Save, MessageSquare, Sliders, Volume1 } from 'lucide-react';
import VideoStudioPro from './components/VideoStudioPro';
import SubscribeGenerator from './components/subscribe-generator/SubscribeGenerator';

// AI is reachable only through the server-owned gateway (ADR-005 / ADR-008):
// the client sends operation inputs, never a model id, system instruction,
// generation config, tool list or safety setting.
import { getAiGateway } from './infra/ai/HttpAiGateway';
import { toAppError } from './domain/errors/appError';
import { getWorkflowRuntime } from './app/workflows/runtime';
import { useWorkflowRun } from './app/workflows/react/useWorkflowRun';
import { isTerminal } from './app/workflows/transitions';
import { createPodcastWorkflow } from './app/workflows/definitions/podcast';
import { createTtsWorkflow } from './app/workflows/definitions/tts';
import type { ScriptLine as WorkflowScriptLine, SpeechLine } from './domain/ai/AiGateway';

const workflowRuntime = getWorkflowRuntime();
if (!workflowRuntime.getDefinition('podcast')) workflowRuntime.register(createPodcastWorkflow());
if (!workflowRuntime.getDefinition('tts')) workflowRuntime.register(createTtsWorkflow());

type AiHealthState = 'checking' | 'ready' | 'missing' | 'error';

const VOICES = [
  { id: 'Zephyr', label: 'Zephyr (Bright)' },
  { id: 'Puck', label: 'Puck (Upbeat)' },
  { id: 'Charon', label: 'Charon (Informative)' },
  { id: 'Kore', label: 'Kore (Firm)' },
  { id: 'Fenrir', label: 'Fenrir (Excitable)' },
  { id: 'Leda', label: 'Leda (Youthful)' },
  { id: 'Orus', label: 'Orus (Firm)' },
  { id: 'Aoede', label: 'Aoede (Breezy)' },
  { id: 'Callirrhoe', label: 'Callirrhoe (Easy-going)' },
  { id: 'Autonoe', label: 'Autonoe (Bright)' },
  { id: 'Enceladus', label: 'Enceladus (Breathy)' },
  { id: 'Iapetus', label: 'Iapetus (Clear)' },
  { id: 'Umbriel', label: 'Umbriel (Easy-going)' },
  { id: 'Algieba', label: 'Algieba (Smooth)' },
  { id: 'Despina', label: 'Despina (Smooth)' },
  { id: 'Erinome', label: 'Erinome (Clear)' },
  { id: 'Algenib', label: 'Algenib (Gravelly)' },
  { id: 'Rasalgethi', label: 'Rasalgethi (Informative)' },
  { id: 'Laomedeia', label: 'Laomedeia (Upbeat)' },
  { id: 'Achernar', label: 'Achernar (Soft)' },
  { id: 'Alnilam', label: 'Alnilam (Firm)' },
  { id: 'Schedar', label: 'Schedar (Even)' },
  { id: 'Gacrux', label: 'Gacrux (Mature)' },
  { id: 'Pulcherrima', label: 'Pulcherrima (Forward)' },
  { id: 'Achird', label: 'Achird (Friendly)' },
  { id: 'Zubenelgenubi', label: 'Zubenelgenubi (Casual)' },
  { id: 'Vindemiatrix', label: 'Vindemiatrix (Gentle)' },
  { id: 'Sadachbia', label: 'Sadachbia (Lively)' },
  { id: 'Sadaltager', label: 'Sadaltager (Knowledgeable)' },
  { id: 'Sulafat', label: 'Sulafat (Warm)' }
];
const STYLES = [
  'Educational & Engaging',
  'High-Energy (MrBeast style)',
  'Deep Conversational (Joe Rogan style)',
  'Investigative (True Crime style)',
  'Comedy & Banter'
];

const SFX_CATEGORIES = [
  {
    name: 'Laughter',
    color: 'border-orange-500/30 text-orange-400 bg-orange-500/10',
    tags: ['[laugh]', '[laughs]', '[chuckles]', '[giggles]', '[bursts into laughter]', '[laughs softly]', '[laughs nervously]', '[evil laugh]']
  },
  {
    name: 'Smiling & Positive Reactions',
    color: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
    tags: ['[smiles]', '[smiles warmly]', '[grins]', '[soft smile]', '[beams]', '[smirks]']
  },
  {
    name: 'Breathing',
    color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
    tags: ['[breathes deeply]', '[inhales]', '[exhales]', '[takes a deep breath]', '[sharp inhale]', '[slow exhale]', '[breathes heavily]', '[catches breath]']
  },
  {
    name: 'Pauses',
    color: 'border-zinc-500/30 text-zinc-400 bg-zinc-500/10',
    tags: ['[pause]', '[short pause]', '[long pause]', '[micro pause]', '[silence]', '[beat]', '[dramatic pause]']
  },
  {
    name: 'Whispering & Voice Modulation',
    color: 'border-purple-500/30 text-purple-400 bg-purple-500/10',
    tags: ['[whispers]', '[mutters]', '[murmurs]', '[speaks softly]', '[raises voice]', '[lowers voice]', '[shouts]']
  },
  {
    name: 'Surprise',
    color: 'border-rose-500/30 text-rose-400 bg-rose-500/10',
    tags: ['[gasps]', '[gasps softly]', '[gasp]', '[startled]', '[shocked silence]']
  },
  {
    name: 'Thinking & Hesitation',
    color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10',
    tags: ['[hesitates]', '[thinks]', '[brief hesitation]', '[searches for words]', '[pauses to think]']
  },
  {
    name: 'Emotion',
    color: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10',
    tags: ['[sigh]', '[sighs]', '[sighs deeply]', '[sighs heavily]', '[groans]', '[moans]', '[moans softly]', '[sniffs]', '[sniffles]', '[voice cracks]', '[chokes up]']
  },
  {
    name: 'Mouth Sounds',
    color: 'border-pink-500/30 text-pink-400 bg-pink-500/10',
    tags: ['[clears throat]', '[coughs]', '[swallows]', '[gulps]', '[clicks tongue]', '[licks lips]', '[yawns]']
  }
];

const DELIVERY_CATEGORIES = [
  {
    name: 'Speed',
    color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10',
    tags: ['[slow]', '[very slow]', '[fast]', '[very fast]', '[moderate pace]', '[accelerate]', '[slow down]']
  },
  {
    name: 'Volume',
    color: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10',
    tags: ['[soft]', '[very soft]', '[loud]', '[very loud]', '[quietly]', '[fade out]']
  },
  {
    name: 'Energy',
    color: 'border-fuchsia-500/30 text-fuchsia-400 bg-fuchsia-500/10',
    tags: ['[low energy]', '[medium energy]', '[high energy]', '[build energy]', '[calm]', '[relaxed]', '[energetic]']
  },
  {
    name: 'Emotion',
    color: 'border-pink-500/30 text-pink-400 bg-pink-500/10',
    tags: ['[happy]', '[warm]', '[friendly]', '[confident]', '[curious]', '[excited]', '[surprised]', '[serious]', '[sad]', '[empathetic]', '[inspirational]', '[dramatic]', '[playful]', '[humorous]', '[passionate]']
  },
  {
    name: 'Emphasis',
    color: 'border-violet-500/30 text-violet-400 bg-violet-500/10',
    tags: ['[emphasize]', '[strong emphasis]', '[light emphasis]', '[stress the next word]', '[keyword emphasis]']
  },
  {
    name: 'Pitch',
    color: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
    tags: ['[high pitch]', '[low pitch]', '[rising tone]', '[falling tone]', '[gentle tone]']
  },
  {
    name: 'Pauses',
    color: 'border-zinc-500/30 text-zinc-400 bg-zinc-500/10',
    tags: ['[pause]', '[short pause]', '[long pause]', '[micro pause]', '[beat]']
  },
  {
    name: 'Articulation',
    color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
    tags: ['[clearly]', '[carefully]', '[crisp pronunciation]', '[natural rhythm]', '[conversational]']
  },
  {
    name: 'Transitions',
    color: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
    tags: ['[build suspense]', '[increase intensity]', '[soften]', '[relax]', '[end warmly]', '[end confidently]', '[end with curiosity]']
  }
];

const renderDialogueText = (text: string) => {
  const regex = /(\[[^\]]+\])/g;
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('[') && part.endsWith(']')) {
          const tag = part.slice(1, -1).toLowerCase();
          let bg = 'bg-red-500/10 text-red-400 border-red-500/20';
          
          if (tag.includes('laugh') || tag.includes('giggle') || tag.includes('chuckle') || tag.includes('grin') || tag.includes('smile') || tag.includes('beam')) {
            bg = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
          } else if (tag.includes('breath') || tag.includes('inhale') || tag.includes('exhale')) {
            bg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
          } else if (tag.includes('pause') || tag.includes('silence') || tag.includes('beat') || tag.includes('hesitat') || tag.includes('think') || tag.includes('hesitation')) {
            bg = 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
          } else if (tag.includes('whisper') || tag.includes('softly') || tag.includes('mutter') || tag.includes('murmur') || tag.includes('voice') || tag.includes('quiet')) {
            bg = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
          } else if (tag.includes('gasp') || tag.includes('shock') || tag.includes('surprise') || tag.includes('startle')) {
            bg = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
          } else if (tag.includes('sigh') || tag.includes('groan') || tag.includes('sniff')) {
            bg = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
          } else if (tag.includes('throat') || tag.includes('cough') || tag.includes('swallow') || tag.includes('click') || tag.includes('lip') || tag.includes('yawn')) {
            bg = 'bg-pink-500/10 text-pink-400 border-pink-500/20';
          } else if (tag.includes('cheer') || tag.includes('whoop') || tag.includes('clap') || tag.includes('applaud') || tag.includes('celebrate')) {
            bg = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
          } else if (tag.includes('cry') || tag.includes('sob') || tag.includes('weep') || tag.includes('tearful')) {
            bg = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
          } else if (tag.includes('slow') || tag.includes('fast') || tag.includes('pace') || tag.includes('accelerate')) {
            bg = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
          } else if (tag.includes('soft') || tag.includes('loud') || tag.includes('fade')) {
            bg = 'bg-red-500/10 text-red-400 border-red-500/20';
          } else if (tag.includes('energy') || tag.includes('calm') || tag.includes('relaxed') || tag.includes('energetic')) {
            bg = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
          } else if (tag.includes('happy') || tag.includes('warm') || tag.includes('friendly') || tag.includes('confident') || tag.includes('curious') || tag.includes('excited') || tag.includes('surprised') || tag.includes('serious') || tag.includes('sad') || tag.includes('empathetic') || tag.includes('inspirational') || tag.includes('dramatic') || tag.includes('playful') || tag.includes('humorous') || tag.includes('passionate')) {
            bg = 'bg-pink-500/10 text-pink-400 border-pink-500/20';
          } else if (tag.includes('emphasize') || tag.includes('emphasis') || tag.includes('stress')) {
            bg = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
          } else if (tag.includes('pitch') || tag.includes('tone')) {
            bg = 'bg-teal-500/10 text-teal-400 border-teal-500/20';
          } else if (tag.includes('clearly') || tag.includes('carefully') || tag.includes('pronunciation') || tag.includes('rhythm') || tag.includes('conversational')) {
            bg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
          } else if (tag.includes('suspense') || tag.includes('intensity') || tag.includes('soften') || tag.includes('relax') || tag.includes('warmly') || tag.includes('confidently') || tag.includes('curiosity')) {
            bg = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
          }

          return (
            <span 
              key={i} 
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${bg} mx-1 select-none animate-pulse`}
            >
              🎤 {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

type ScriptLine = {
  speaker: string;
  emotion: string;
  text: string;
  visual_cue?: string;
  sfx?: string;
};

type PodcastData = {
  metadata: {
    title: string;
    level: string;
    estimated_duration: string;
    youtube_hook: string;
  };
  script: ScriptLine[];
};

export default function App() {
  const [viewMode, setViewMode] = useState<'podcast' | 'video' | 'subscribe'>('podcast');
  const [topic, setTopic] = useState('Tell Me About Yourself');
  const [channelName, setChannelName] = useState('English for Beginners');
  const [speakerCount, setSpeakerCount] = useState('Dual Speaker');
  const [contentFormat, setContentFormat] = useState('Educational / Teaching');
  const [level, setLevel] = useState('Beginner');
  const [duration, setDuration] = useState('Extended (15m)');
  const [style, setStyle] = useState(STYLES[0]);
  const [pace, setPace] = useState('Slow-Paced, Calm, Relaxed & Conversational');
  const [realism, setRealism] = useState('Natural');
  const [audience, setAudience] = useState('General Public');
  const [hostAVoice, setHostAVoice] = useState('Gacrux');
  const [hostBVoice, setHostBVoice] = useState('Iapetus');
  const [hostAName, setHostAName] = useState('Sarah');
  const [hostBName, setHostBName] = useState('James');
  
  const [inputMode, setInputMode] = useState<'generate' | 'import'>('generate');
  const [importedScript, setImportedScript] = useState('');

  const [podcastData, setPodcastData] = useState<PodcastData | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [scriptRunId, setScriptRunId] = useState<string | null>(null);
  const [ttsRunId, setTtsRunId] = useState<string | null>(null);
  const [aiHealth, setAiHealth] = useState<AiHealthState>('checking');
  const [aiHealthMessage, setAiHealthMessage] = useState<string>('Checking the AI service…');

  // The runs are owned by the workflow runtime; this component subscribes.
  const { run: scriptRun, cancel: cancelScriptRun } = useWorkflowRun(scriptRunId, workflowRuntime);
  const { run: ttsRun, cancel: cancelTtsRun } = useWorkflowRun(ttsRunId, workflowRuntime);

  const isGeneratingScript = scriptRun !== null && !isTerminal(scriptRun.status);
  const isGeneratingAudio = ttsRun !== null && !isTerminal(ttsRun.status);
  const scriptProgress = scriptRun ? scriptRun.phase ?? 'Working…' : null;
  const audioProgress = ttsRun ? ttsRun.phase ?? 'Working…' : null;
  const error = localError ?? scriptRun?.error?.message ?? ttsRun?.error?.message ?? null;
  const audioUrlRef = useRef<string | null>(null);
  audioUrlRef.current = audioUrl;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [tagDockTab, setTagDockTab] = useState<'sfx' | 'delivery'>('sfx');
  const [referenceTab, setReferenceTab] = useState<'sfx' | 'delivery'>('sfx');
  const [enhanceWithSFX, setEnhanceWithSFX] = useState(true);
  const [applyVoiceCoaching, setApplyVoiceCoaching] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertTagAtCursor = (tag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setEditValue(prev => prev + ' ' + tag);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    setEditValue(before + tag + after);
    
    setTimeout(() => {
      textarea.focus();
      const cursor = start + tag.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 10);
  };

  const handleEditStart = (index: number, text: string) => {
    setEditingIndex(index);
    setEditValue(text);
  };

  const handleEditSave = (index: number) => {
    if (!podcastData) return;
    const newScript = [...podcastData.script];
    const targetLine = newScript[index];
    if (!targetLine) return;
    targetLine.text = editValue;
    setPodcastData({ ...podcastData, script: newScript });
    setEditingIndex(null);
  };

  useEffect(() => {
    (window as any).setViewMode = setViewMode;
    return () => {
      delete (window as any).setViewMode;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const processImportedScript = () => {
    // Local, synchronous parsing: no AI call, so no run is created. Failures are
    // reported, never silently replaced with generated content.
    setIsImporting(true);
    setLocalError(null);
    setPodcastData(null);
    setAudioUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setAudioDurationSeconds(null);
    setIsPlaying(false);

    try {
      const lines = importedScript.split('\n');
      const parsedLines: { speaker: string, text: string }[] = [];
      let currentSpeaker = '';
      let currentText = '';

      const addCurrentTurn = () => {
        if (currentSpeaker && currentText.trim()) {
          parsedLines.push({ speaker: currentSpeaker, text: currentText.trim() });
        }
      };

      for (const line of lines) {
        const match = line.match(/^([^:]+):\s*(.*)$/);
        const speakerPart = match?.[1];
        const textPart = match?.[2];
        if (speakerPart !== undefined && textPart !== undefined && speakerPart.length < 50) {
          addCurrentTurn();
          currentSpeaker = speakerPart.trim();
          currentText = textPart;
        } else {
          if (line.trim() || currentText) {
            currentText += (currentText ? '\n' : '') + line.trim();
          }
        }
      }
      addCurrentTurn();

      if (parsedLines.length === 0) {
        throw new Error('No valid script lines found. Ensure the script follows the format "Speaker Name: Text"');
      }

      const defaultEmotions = ['Warm', 'Calm', 'Friendly', 'Curious', 'Confident', 'Serious'];
      const scriptLines = parsedLines.map((line, i) => ({
        speaker: line.speaker,
        text: line.text,
        emotion: defaultEmotions[i % defaultEmotions.length] ?? 'Neutral'
      }));

      setPodcastData({
        metadata: {
          title: topic || 'Imported Script',
          level: level,
          estimated_duration: 'Custom Length',
          youtube_hook: ''
        },
        script: scriptLines
      });
    } catch (err: unknown) {
      console.error(err);
      setLocalError(toAppError(err, 'Failed to parse the imported script.').message);
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * W1 intent. The batches, retries, timeouts, cancellation and validation all
   * live in the workflow definition — this component only starts the run and
   * renders it. A second click with the same input cannot create a second run
   * (idempotency key), which is what makes double-click safe.
   */
  const generatePodcast = () => {
    setLocalError(null);
    setPodcastData(null);
    setAudioUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setAudioDurationSeconds(null);
    setIsPlaying(false);

    const run = workflowRuntime.start(
      'podcast',
      {
        topic: topic.trim(),
        channelName,
        duration,
        style: style ?? STYLES[0] ?? 'Educational & Engaging',
        level,
        speakerCount: speakerCount === 'Single Speaker' ? 'Single Speaker' : 'Dual Speaker',
        audience,
        pace,
        realism,
        ...(hostAName ? { hostA: hostAName } : {}),
        ...(hostBName ? { hostB: hostBName } : {}),
      },
      { deps: { gateway: getAiGateway() } },
    );
    setScriptRunId(run.id);
  };

  /** W2 intent — bounded retry/timeout come from the workflow policy. */
  const generateAudio = () => {
    if (!podcastData) {
      setLocalError('Generate or import a script before synthesising audio.');
      return;
    }
    setLocalError(null);

    const isSingle = speakerCount === 'Single Speaker';
    const lines: SpeechLine[] = podcastData.script.map((line) => ({
      speaker: line.speaker,
      ...(line.emotion ? { emotion: line.emotion } : {}),
      text: line.text,
    }));

    const run = workflowRuntime.start(
      'tts',
      {
        lines,
        voiceConfig: {
          mode: isSingle ? 'single' : 'multi',
          hostA: hostAVoice,
          ...(isSingle ? {} : { hostB: hostBVoice }),
          speakerNames: [hostAName || 'Sarah', hostBName || 'James'] as [string, string],
        },
      },
      { deps: { gateway: getAiGateway() } },
    );
    setTtsRunId(run.id);
  };

  // Copy a succeeded script run into local state (subscription, not orchestration).
  const appliedScriptRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scriptRun || scriptRun.status !== 'succeeded') return;
    if (appliedScriptRunRef.current === scriptRun.id) return;
    appliedScriptRunRef.current = scriptRun.id;

    const result = scriptRun.result as { metadata?: PodcastData['metadata']; script?: WorkflowScriptLine[] } | null;
    if (!result?.metadata || !Array.isArray(result.script) || result.script.length === 0) {
      setLocalError('The generated script could not be read.');
      return;
    }
    setPodcastData({ metadata: result.metadata, script: result.script });
  }, [scriptRun]);

  // Build the object URL from the validated audio blob; the previous URL is revoked.
  const appliedTtsRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ttsRun || ttsRun.status !== 'succeeded') return;
    if (appliedTtsRunRef.current === ttsRun.id) return;
    appliedTtsRunRef.current = ttsRun.id;

    const result = ttsRun.result as { blob?: Blob; durationSeconds?: number } | null;
    const blob = result?.blob;
    if (!(blob instanceof Blob) || blob.size <= 0) {
      setLocalError('The generated audio could not be read.');
      return;
    }
    const url = URL.createObjectURL(blob);
    setAudioUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return url;
    });
    setAudioDurationSeconds(typeof result?.durationSeconds === 'number' ? result.durationSeconds : null);
  }, [ttsRun]);

  // Release the object URL and stop in-flight runs when the studio unmounts.
  useEffect(() => {
    return () => {
      const url = audioUrlRef.current;
      if (url) URL.revokeObjectURL(url);
      workflowRuntime.cancelAll('The podcast studio was closed.');
    };
  }, []);

  // The connection badge reflects /api/health/ai — it is never assumed (INV-010).
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getAiGateway()
      .health(controller.signal)
      .then((health) => {
        if (!active) return;
        setAiHealth(health.configured ? 'ready' : 'missing');
        setAiHealthMessage(
          health.configured
            ? `AI Connected (${health.operations.length} operations)`
            : 'AI is not configured on this server.',
        );
      })
      .catch((err: unknown) => {
        if (!active) return;
        setAiHealth('error');
        setAiHealthMessage(toAppError(err, 'The AI service could not be reached.').message);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const audioProgressPercent = useMemo(() => {
    if (!ttsRun) return 0;
    if (ttsRun.status === 'succeeded') return 100;
    return Math.max(0, Math.min(100, ttsRun.progress));
  }, [ttsRun]);

  const copyScript = () => {
    if (!podcastData) return;
    const text = podcastData.script.map(line => 
      `[${line.speaker}] (${line.emotion})\nText: ${line.text}\n`
    ).join('\n');
    
    navigator.clipboard.writeText(`TITLE: ${podcastData.metadata.title}\nHOOK: ${podcastData.metadata.youtube_hook}\n\n${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  return (
    <div className={`flex flex-col w-full text-gray-100 font-sans ${
      viewMode === 'video' || viewMode === 'subscribe'
        ? 'h-screen overflow-hidden bg-[#050508]'
        : 'min-h-screen bg-[#050505] selection:bg-red-500/30 pb-20 overflow-x-hidden'
    }`}>
      {/* Header */}
      <header className="border-b border-white/10 bg-black/80 backdrop-blur-xl shrink-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.3)] group-hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-all duration-300">
              <Youtube className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">Neural<span className="text-red-500">Podcast</span> <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/10 text-gray-300 ml-2 border border-white/5">PRO</span></h1>
          </div>

          {/* Studio Workspace Switcher */}
          <div className="hidden md:flex bg-white/5 p-1 rounded-xl border border-white/10 shadow-inner gap-1">
            <button 
              onClick={() => setViewMode('podcast')} 
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                viewMode === 'podcast' 
                  ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" /> Podcast Script Studio
            </button>
            <button 
              onClick={() => setViewMode('video')} 
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center gap-2 cursor-pointer relative overflow-hidden ${
                viewMode === 'video' 
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_15px_rgba(124,58,237,0.3)]' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Video className="w-3.5 h-3.5" /> Video Studio PRO MAX
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
            </button>
            <button 
              onClick={() => setViewMode('subscribe')} 
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                viewMode === 'subscribe' 
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Youtube className="w-3.5 h-3.5" /> Subscribe Generator
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div
              className="text-xs font-medium text-gray-400 flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10"
              title={aiHealthMessage}
              aria-label={aiHealthMessage}
            >
              <span
                className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)] ${
                  aiHealth === 'ready'
                    ? 'bg-emerald-500 animate-pulse'
                    : aiHealth === 'checking'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-rose-500'
                }`}
              ></span>
              {aiHealth === 'ready'
                ? 'AI Connected'
                : aiHealth === 'checking'
                  ? 'Checking AI…'
                  : aiHealth === 'missing'
                    ? 'AI Not Configured'
                    : 'AI Unavailable'}
            </div>
          </div>
        </div>
      </header>

      {viewMode === 'subscribe' ? (
        <SubscribeGenerator />
      ) : viewMode === 'podcast' ? (
        <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#0f0f0f] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none transition-all duration-700 group-hover:bg-red-500/10"></div>
            
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white relative z-10">
              <Settings className="w-5 h-5 text-red-400" />
              Dashboard
            </h2>

            <div className="flex bg-black/50 p-1 mb-6 rounded-xl border border-white/10 shadow-inner relative z-10">
              <button 
                onClick={() => setInputMode('generate')} 
                className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${inputMode === 'generate' ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
              >
                Generate 
              </button>
              <button 
                onClick={() => setInputMode('import')} 
                className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${inputMode === 'import' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
              >
                Import Script
              </button>
            </div>
            
            <div className="space-y-5 relative z-10">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Speaker Setup</label>
                  <div className="relative">
                    <select 
                      value={speakerCount}
                      onChange={(e) => setSpeakerCount(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all appearance-none shadow-inner"
                    >
                      <option value="Single Speaker">Single Speaker (Solo)</option>
                      <option value="Dual Speaker">Dual Speaker (Co-hosted)</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Content Format</label>
                  <div className="relative">
                    <select 
                      value={contentFormat}
                      onChange={(e) => setContentFormat(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all appearance-none shadow-inner"
                    >
                      <option value="Educational / Teaching">Educational / Teaching</option>
                      <option value="Real-life Scenario / Roleplay">Real-life Scenario / Roleplay</option>
                      <option value="Interview / Q&A">Interview / Q&A</option>
                      <option value="Storytelling / Narrative">Storytelling / Narrative</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Topic</label>
                <input 
                  type="text" 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all placeholder-gray-600 shadow-inner"
                  placeholder="e.g. How to start a successful YouTube channel in 2026"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">YouTube Channel Name (Optional)</label>
                <input 
                  type="text" 
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all placeholder-gray-600 shadow-inner"
                  placeholder="e.g. NeuralCast"
                />
              </div>
              
              <div className={inputMode === 'generate' ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 gap-4"}>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">ESL Level</label>
                  <div className="relative">
                    <select 
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all appearance-none shadow-inner"
                    >
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>

                {inputMode === 'generate' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Duration</label>
                    <div className="relative">
                      <select 
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all appearance-none shadow-inner"
                      >
                        <option value="YouTube Short (< 60s)">Short (&lt;60s)</option>
                        <option value="Standard Video (3-5 mins)">Standard (3-5m)</option>
                        <option value="Deep Dive (10 mins)">Deep Dive (10m)</option>
                        <option value="Extended (15m)">Extended (15m)</option>
                        <option value="In-Depth Analysis (20 mins)">In-Depth (20m)</option>
                        <option value="Comprehensive Guide (25 mins)">Comprehensive (25m)</option>
                        <option value="Expert Masterclass (30 mins)">Masterclass (30m)</option>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Podcast Style</label>
                <div className="relative">
                  <select 
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all appearance-none shadow-inner"
                  >
                    {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Pace</label>
                  <div className="relative">
                    <select 
                      value={pace}
                      onChange={(e) => setPace(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all appearance-none shadow-inner"
                    >
                      <option value="Slow-Paced, Calm, Relaxed & Conversational">Slow-Paced, Calm, Relaxed & Conversational</option>
                      <option value="Fast & Energetic (Rapid fire)">Fast & Energetic</option>
                      <option value="Moderate & Conversational">Moderate & Conversational</option>
                      <option value="Slow & Thoughtful (Deep dive)">Slow & Thoughtful</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Realism</label>
                  <div className="relative">
                    <select 
                      value={realism}
                      onChange={(e) => setRealism(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all appearance-none shadow-inner"
                    >
                      <option value="Natural">Natural</option>
                      <option value="Extremely Messy (Stutters, interruptions)">Extremely Messy</option>
                      <option value="Clean (Radio-ready, clear)">Clean</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Target Audience</label>
                <div className="relative">
                  <select 
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all appearance-none shadow-inner"
                  >
                    <option value="General Public (Accessible, fun)">General Public</option>
                    <option value="Professionals / Experts (Technical, deep)">Professionals / Experts</option>
                    <option value="Teens / Gen Z (Trendy, fast-paced)">Teens / Gen Z</option>
                    <option value="Kids / Family (Clean, educational)">Kids / Family</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>

              <div className={`grid ${speakerCount === 'Single Speaker' ? 'grid-cols-1' : 'grid-cols-2'} gap-4 pt-4 border-t border-white/10 mt-4`}>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div> {speakerCount === 'Single Speaker' ? 'Host Name' : 'Host A Name'}
                  </label>
                  <input 
                    type="text" 
                    value={hostAName}
                    onChange={(e) => setHostAName(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all mb-3"
                    placeholder="e.g. Alex"
                  />
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Voice
                  </label>
                  <div className="relative">
                    <select 
                      value={hostAVoice}
                      onChange={(e) => setHostAVoice(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
                    >
                      {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>
                
                {speakerCount === 'Dual Speaker' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div> Host B Name
                    </label>
                    <input 
                      type="text" 
                      value={hostBName}
                      onChange={(e) => setHostBName(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all mb-3"
                      placeholder="e.g. Sam"
                    />
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                      Voice
                    </label>
                    <div className="relative">
                      <select 
                        value={hostBVoice}
                        onChange={(e) => setHostBVoice(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
                      >
                        {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4">
                {inputMode === 'import' && (
                  <div className="space-y-4 mb-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Imported Script Content</label>
                      <textarea 
                        value={importedScript}
                        onChange={(e) => setImportedScript(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all placeholder-gray-600 shadow-inner h-64 resize-y"
                        placeholder="Paste your script here...&#10;&#10;Sarah: Hello everyone!&#10;James: Hi there!"
                      />
                    </div>
                    
                    </div>
                )}
                <button
                  onClick={
                    isGeneratingScript
                      ? () => cancelScriptRun('Script generation cancelled.')
                      : inputMode === 'generate'
                        ? generatePodcast
                        : processImportedScript
                  }
                  disabled={
                    !isGeneratingScript &&
                    (isImporting || (inputMode === 'generate' ? !topic.trim() : !importedScript.trim()))
                  }
                  className={`w-full text-white rounded-xl px-4 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                    inputMode === 'generate' 
                      ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_30px_rgba(239,68,68,0.4)]' 
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                  }`}
                >
                  {isGeneratingScript ? (
                    <><Square className="w-5 h-5" /> Cancel — {scriptProgress || 'Processing...'}</>
                  ) : inputMode === 'generate' ? (
                    <><Sparkles className="w-5 h-5" /> Generate Viral Script</>
                  ) : (
                    <><FileText className="w-5 h-5" /> Process Imported Script</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Dynamic Voice Direction System Card */}
          <div className="bg-[#0f0f0f] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none transition-all duration-75 group-hover:bg-red-500/10"></div>
            
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white relative z-10">
              <Sliders className="w-5 h-5 text-red-500" />
              Dynamic Voice Direction
            </h2>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Active storyboarding rules that prevent flat textbook reading, shaping natural pitch shifts, conversational emphasis, and real performance dynamics.
            </p>

            <div className="space-y-3 relative z-10 text-xs">
              <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col gap-1">
                <span className="font-bold text-red-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                  Storyteller Delivery Mode
                </span>
                <span className="text-gray-300">Speaks like an experienced podcast host talking to a close friend. Conversational, warm, and authentic.</span>
              </div>

              <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col gap-1">
                <span className="font-bold text-orange-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                  Multi-Phase Sentence Tuning
                </span>
                <span className="text-gray-300">Emotions evolve dynamically as meaning changes within each sentence. Never monotone or flat.</span>
              </div>

              <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col gap-1">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  Emotional Transitions Flow
                </span>
                <span className="text-gray-300">Applies progressive tonal pathways like <span className="text-orange-300">Neutral &rarr; Curious &rarr; Excited</span> and <span className="text-orange-300">Humorous &rarr; Serious</span>.</span>
              </div>

              <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between text-gray-400">
                <span className="flex items-center gap-1.5"><Volume1 className="w-3.5 h-3.5 text-red-400" /> Pitch & Pace Variation</span>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-widest">ACTIVE</span>
              </div>

              <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between text-gray-400">
                <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-orange-400" /> Natural Micro-Pauses</span>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-widest">ACTIVE</span>
              </div>
            </div>
          </div>

          {/* Human SFX & Voice Delivery Reference Card */}
          <div className="bg-[#0f0f0f] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none transition-all duration-75 group-hover:bg-emerald-500/10"></div>
            
            <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2 relative z-10">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
                <Headphones className="w-5 h-5 text-emerald-400" />
                Vocal tags reference
              </h2>
              <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/10 text-[10px] font-semibold">
                <button
                  type="button"
                  onClick={() => setReferenceTab('sfx')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${referenceTab === 'sfx' ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-gray-400 hover:text-white'}`}
                >
                  SFX
                </button>
                <button
                  type="button"
                  onClick={() => setReferenceTab('delivery')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${referenceTab === 'delivery' ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'text-gray-400 hover:text-white'}`}
                >
                  Delivery
                </button>
              </div>
            </div>
            
            <p className="text-xs text-gray-400 mb-4 leading-relaxed relative z-10">
              {referenceTab === 'sfx' 
                ? 'Vocal expressions and breathing cues synthesized natively into realistic performance audio instead of being read literally.'
                : 'Performance pacing, volume modulation, emphasis control, and transition states that direct dynamic host deliveries.'
              }
            </p>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 relative z-10 text-xs custom-scrollbar">
              {(referenceTab === 'sfx' ? SFX_CATEGORIES : DELIVERY_CATEGORIES).map((cat) => (
                <div key={cat.name} className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-300">{cat.name}</span>
                    <span className="text-[10px] font-mono text-gray-500">{cat.tags.length} Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cat.tags.map(tag => (
                      <span 
                        key={tag} 
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${cat.color}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Voice & Audio Card */}
          <div className={`bg-[#0f0f0f] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden transition-all duration-500 ${podcastData ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-4 pointer-events-none'}`}>
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
            
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white relative z-10">
              <Mic className="w-5 h-5 text-emerald-400" />
              Voice Casting & Synthesis
            </h2>
            
            <div className="space-y-5 relative z-10">
              {!audioUrl ? (
                <div className="mt-2">
                  {isGeneratingAudio && audioProgress && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-emerald-400 mb-1 font-medium">
                        <span>{audioProgress}</span>
                      </div>
                      <div className="w-full bg-black/50 rounded-full h-1.5 overflow-hidden border border-white/5">
                        <div 
                          className="bg-gradient-to-r from-emerald-500 to-teal-400 h-1.5 rounded-full transition-all duration-300 ease-out" 
                          style={{ width: `${audioProgressPercent}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={isGeneratingAudio ? () => cancelTtsRun('Speech synthesis cancelled.') : generateAudio}
                    disabled={!isGeneratingAudio && !podcastData}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-4 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {isGeneratingAudio ? (
                      <><Square className="w-5 h-5" /> Stop — {audioProgress || 'Synthesizing…'}</>
                    ) : (
                      <><Volume2 className="w-5 h-5" /> Generate Audio Track</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="bg-black/60 border border-white/10 rounded-2xl p-4 shadow-inner">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={togglePlay}
                          className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-400 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                        >
                          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                        </button>
                        <div>
                          <p className="text-sm font-bold text-white">Final Render</p>
                          <p className="text-xs text-emerald-400 flex items-center gap-1">
                            {isPlaying ? <><Activity className="w-3 h-3 animate-pulse" /> Playing</> : 'Ready'}
                          </p>
                        </div>
                      </div>
                      {isPlaying && (
                        <div className="flex items-end gap-1 h-6">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className="w-1 bg-emerald-500 rounded-full animate-pulse" style={{ height: `${Math.random() * 100}%`, animationDuration: `${0.5 + Math.random()}s` }}></div>
                          ))}
                        </div>
                      )}
                    </div>
                    <audio 
                      ref={audioRef}
                      src={audioUrl} 
                      controls 
                      className="w-full h-8 rounded-lg outline-none opacity-80 grayscale hover:grayscale-0 transition-all"
                    />
                  </div>
                  <a 
                    href={audioUrl} 
                    download={`${podcastData?.metadata.title.replace(/\s+/g, '_')}.wav`}
                    className="w-full bg-white/5 hover:bg-white/10 text-white rounded-xl px-4 py-3.5 text-sm font-bold flex items-center justify-center gap-2 transition-all border border-white/10 hover:border-white/20"
                  >
                    <Download className="w-4 h-4" /> Download .WAV
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl p-4 mb-6 text-sm flex items-start gap-3 backdrop-blur-sm">
              <div className="mt-0.5"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
              <div>{error}</div>
            </div>
          )}

          {!podcastData && !isGeneratingScript ? (
            <div className="h-[700px] border border-white/10 border-dashed rounded-[2rem] flex flex-col items-center justify-center text-gray-500 bg-[#0f0f0f]/50 shadow-inner relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6 relative z-10 shadow-[0_0_50px_rgba(255,255,255,0.05)]">
                <Youtube className="w-12 h-12 opacity-30" />
              </div>
              <p className="text-2xl font-bold text-gray-300 mb-3 relative z-10 tracking-tight">Studio is Empty</p>
              <p className="text-base text-gray-500 max-w-md text-center relative z-10 leading-relaxed">Configure your parameters on the left to generate a high-retention script with visual and SFX cues.</p>
            </div>
          ) : isGeneratingScript ? (
            <div className="h-[700px] border border-white/10 rounded-[2rem] flex flex-col items-center justify-center text-gray-400 bg-[#0f0f0f] shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-red-500/10 to-transparent opacity-50"></div>
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>
              
              <div className="relative z-10 flex flex-col items-center">
                <div className="relative w-20 h-20 mb-8">
                  <div className="absolute inset-0 border-4 border-red-500/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-red-500 rounded-full border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-red-400 animate-pulse" />
                  </div>
                </div>
                <p className="text-xl font-bold text-white mb-2 tracking-tight">Engineering High-Retention Script</p>
                <p className="text-sm text-gray-400 max-w-xs text-center">Injecting open loops, pattern interrupts, and visual hooks...</p>
              </div>
            </div>
          ) : podcastData ? (
            <div className="bg-[#0f0f0f] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl relative">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>
              
              {/* Episode Header */}
              <div className="p-8 md:p-10 border-b border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent relative">
                <div className="absolute top-8 right-8">
                  <button 
                    onClick={copyScript}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium text-gray-300 transition-all hover:text-white"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy Script'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-5">
                  <span className="px-3 py-1 rounded-md bg-red-500/10 text-red-400 text-xs font-bold uppercase tracking-widest border border-red-500/20">
                    {podcastData.metadata.level}
                  </span>
                  <span className="text-gray-400 text-sm font-medium flex items-center gap-1.5 bg-black/40 px-3 py-1 rounded-md border border-white/5">
                    <Volume2 className="w-4 h-4" />
                    ~{podcastData.metadata.estimated_duration}
                  </span>
                  <span className="text-gray-400 text-sm font-medium flex items-center gap-1.5 bg-black/40 px-3 py-1 rounded-md border border-white/5">
                    <FileText className="w-4 h-4" />
                    {style}
                  </span>
                </div>
                <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white mb-6 leading-tight max-w-2xl">
                  {podcastData.metadata.title}
                </h2>
                
                {podcastData.metadata.youtube_hook && (
                  <div className="mt-6 p-5 bg-gradient-to-r from-red-500/10 to-orange-500/5 border border-red-500/20 rounded-2xl relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                    <p className="text-xs text-red-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Youtube className="w-4 h-4" /> Suggested Title / Hook
                    </p>
                    <p className="text-white font-medium text-lg">{podcastData.metadata.youtube_hook}</p>
                  </div>
                )}
              </div>

              {/* Script Content */}
              <div className="p-8 md:p-10 space-y-8 bg-black/40">
                {podcastData.script.map((line, idx) => {
                  const isHostA = line.speaker === 'Host A' || line.speaker.toLowerCase() === (hostAName || 'Julia').toLowerCase();
                  return (
                    <div key={idx} className={`flex gap-4 md:gap-6 ${isHostA ? '' : 'flex-row-reverse'} group`}>
                      <div className="flex-shrink-0 mt-1">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg transition-transform group-hover:scale-110 ${
                          isHostA 
                            ? 'bg-gradient-to-br from-red-500/20 to-orange-500/20 text-red-400 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)]' 
                            : 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                        }`}>
                          {isHostA ? (hostAName ? hostAName.charAt(0).toUpperCase() : 'A') : (hostBName ? hostBName.charAt(0).toUpperCase() : 'B')}
                        </div>
                      </div>
                      <div className={`flex flex-col max-w-[85%] md:max-w-[75%] ${isHostA ? 'items-start' : 'items-end'}`}>
                        <div className="flex items-center gap-2.5 mb-2 px-1">
                          <span className="text-sm font-bold text-gray-300">{isHostA ? (hostAName || 'Host A') : (hostBName || 'Host B')} <span className="text-gray-600 font-normal ml-1">({isHostA ? hostAVoice : hostBVoice})</span></span>
                          {line.emotion && (
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded-md border border-white/5">
                              {line.emotion}
                            </span>
                          )}
                          <button 
                            onClick={() => handleEditStart(idx, line.text)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded-md text-gray-400 hover:text-white"
                            title="Edit Line"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {editingIndex === idx ? (
                          <div className={`w-full flex flex-col gap-2 ${isHostA ? 'items-start' : 'items-end'}`}>
                            <textarea
                              ref={textareaRef}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full min-w-[300px] bg-black/60 border border-emerald-500/50 rounded-2xl p-4 text-white text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                              rows={3}
                              autoFocus
                            />
                            
                            {/* Interactive SFX & Voice Delivery Tag Dock */}
                            <div className="w-full max-w-xl bg-black/50 border border-white/10 rounded-2xl p-3.5 shadow-inner">
                              <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <Sparkles className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
                                  Insert Tags at Cursor:
                                </span>
                                <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/10 text-[10px] font-semibold">
                                  <button
                                    type="button"
                                    onClick={() => setTagDockTab('sfx')}
                                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${tagDockTab === 'sfx' ? 'bg-red-500/20 text-red-400 font-bold' : 'text-gray-400 hover:text-white'}`}
                                  >
                                    🎤 Vocal SFX
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTagDockTab('delivery')}
                                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${tagDockTab === 'delivery' ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'text-gray-400 hover:text-white'}`}
                                  >
                                    ⚡ Voice Delivery
                                  </button>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[160px] overflow-y-auto pr-1 text-[11px] custom-scrollbar">
                                {(tagDockTab === 'sfx' ? SFX_CATEGORIES : DELIVERY_CATEGORIES).map(cat => (
                                  <div key={cat.name} className="space-y-1">
                                    <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{cat.name}</div>
                                    <div className="flex flex-wrap gap-1">
                                      {cat.tags.map(tag => (
                                        <button
                                          key={tag}
                                          type="button"
                                          onClick={() => insertTagAtCursor(tag)}
                                          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono transition-all hover:scale-105 active:scale-95 cursor-pointer ${cat.color}`}
                                        >
                                          {tag.replace('[', '').replace(']', '')}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <button onClick={() => setEditingIndex(null)} className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors">Cancel</button>
                              <button onClick={() => handleEditSave(idx)} className="px-3 py-1.5 text-xs font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg flex items-center gap-1 transition-colors border border-emerald-500/30">
                                <Save className="w-3 h-3" /> Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={`p-5 rounded-3xl text-[15px] md:text-base leading-relaxed shadow-xl mb-2 transition-all duration-300 hover:shadow-2xl ${
                            isHostA 
                              ? 'bg-[#1a1a1a] text-gray-100 rounded-tl-sm border border-white/10 hover:border-red-500/30' 
                              : 'bg-[#111827] text-gray-100 rounded-tr-sm border border-white/10 hover:border-blue-500/30'
                          }`}>
                            {renderDialogueText(line.text)}
                          </div>
                        )}
                        
                        {/* YouTube Editor Cues */}
                        {(line.visual_cue || line.sfx) && (
                          <div className={`flex flex-col gap-2 mt-2 w-full ${isHostA ? 'items-start' : 'items-end'}`}>
                            {line.visual_cue && (
                              <div className="flex items-start gap-2 text-xs text-gray-300 bg-purple-500/10 px-3 py-2 rounded-xl border border-purple-500/20 max-w-full">
                                <Video className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                                <span><span className="font-bold text-purple-300 uppercase tracking-wider text-[10px] block mb-0.5">Visual Cue</span> {line.visual_cue}</span>
                              </div>
                            )}
                            {line.sfx && (
                              <div className="flex items-start gap-2 text-xs text-gray-300 bg-amber-500/10 px-3 py-2 rounded-xl border border-amber-500/20 max-w-full">
                                <Music className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                <span><span className="font-bold text-amber-300 uppercase tracking-wider text-[10px] block mb-0.5">SFX Cue</span> {line.sfx}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                <div className="pt-10 border-t border-white/10 mt-10 flex flex-col items-center">
                  <h3 className="text-xl font-bold text-white mb-2">Ready to Render?</h3>
                  <p className="text-gray-400 text-sm mb-6 text-center max-w-md">Review your script above. You can edit any line by hovering over it and clicking the edit icon. Once you're happy, generate the final audio.</p>
                  <button
                    onClick={() => {
                      if (isGeneratingAudio) {
                        cancelTtsRun('Speech synthesis cancelled.');
                        return;
                      }
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      generateAudio();
                    }}
                    disabled={false}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-8 py-4 text-base font-bold flex items-center justify-center gap-3 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transform hover:-translate-y-0.5"
                  >
                    {isGeneratingAudio ? (
                      <><Square className="w-5 h-5" /> Stop Synthesis</>
                    ) : (
                      <><Volume2 className="w-5 h-5" /> Generate Final Audio Track</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
      ) : (
        <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
          <VideoStudioPro 
            projectName={podcastData?.metadata.title || "Croissant Masterclass Recipe"}
            initialScript={podcastData?.script || []}
            audioUrl={audioUrl}
            onBack={() => setViewMode('podcast')}
          />
        </div>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { createTrackSnapshotCommand } from '../../features/video-studio/project/commands';
import { createDedicatedTimelineTrack } from '../../features/video-studio/project/services/projectService';
import { importMediaFile } from '../../features/video-studio/project/services/projectPersistenceService';
import { normalizeCaptionTheme, resolveCaptionImportTheme, normalizeCaptionTiming } from '../../features/video-studio/captions/services/captionImportService';
import { parseCaptionTimestamp } from '../../features/video-studio/captions/services/captionTimecodeService';
import { getProjectFps } from '../../features/video-studio/captions/services/captionProjectFps';
import { runCaptions } from '../../app/workflows/captions/runCaptionsWorkflow';
import { importSrtFile } from '../../features/video-studio/captions/services/srtImporter';
import { 
  FolderOpen, Music, Type, Smile, Sparkles, Layers, 
  Languages, Palette, Sliders, Plus, Upload, Search, 
  AlertTriangle, Play, Wand2, Settings2, Info, Star,
  Loader2, Check, Mic, Bell, FileText
} from 'lucide-react';

interface ResourceSidebarProps {
  onAddClip: (asset: any) => void;
}

// Submenu types
type MediaSubmenu = 'import' | 'subprojects' | 'yours' | 'generate' | 'spaces' | 'library';
type TextSubmenu = 'add' | 'effects' | 'templates';
type StickerSubmenu = 'emoji' | 'shapes' | 'badges';

// Types for items
interface SidebarItem {
  id: string;
  type: 'video' | 'audio' | 'text' | 'caption' | 'sticker' | 'effects' | 'transitions' | 'filters' | 'adjustments';
  name: string;
  duration?: number;
  size?: string;
  thumbnail: string;
  color: string;
  isLost?: boolean;
  textContent?: string;
  category?: string;
  description?: string;
  words?: Array<{ word: string; start: number; end: number }>;
  videoUrl?: string;
  audioUrl?: string;
  imageUrl?: string;
  /** Durable identity in the asset store; the URL fields are runtime handles only. */
  videoAssetId?: string;
  audioAssetId?: string;
  imageAssetId?: string;
}

// 1. Media Section Assets
const YOURS_MEDIA: SidebarItem[] = [
  { id: 'v1', type: 'video', name: 'cooking_baking_process.mp4', duration: 18.5, size: '24.2 MB', thumbnail: '🎬', color: 'from-amber-600 to-yellow-500', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
  { id: 'v2', type: 'video', name: 'asmr_close_up_mixing.mp4', duration: 12.0, size: '15.1 MB', thumbnail: '🎬', color: 'from-orange-600 to-red-500', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4' },
  { id: 'v3', type: 'video', name: 'aesthetic_kitchen_lighting.mp4', duration: 24.0, size: '31.8 MB', thumbnail: '🎬', color: 'from-teal-600 to-blue-500', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4' },
  { id: 'img1', type: 'video', name: 'aesthetic_kitchen_decor.jpg', duration: 10.0, size: '2.5 MB', thumbnail: '🖼️', color: 'from-emerald-500 to-teal-500', imageUrl: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=800&q=80' },
  { id: 'img2', type: 'video', name: 'delicious_pancakes.jpg', duration: 8.0, size: '1.8 MB', thumbnail: '🥞', color: 'from-amber-500 to-orange-500', imageUrl: 'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?auto=format&fit=crop&w=800&q=80' },
  { id: 'v4', type: 'video', name: 'corrupted_camera_roll.mp4', duration: 0, size: '0 bytes', thumbnail: '⚠️', color: 'from-red-900 to-red-700', isLost: true },
];

const SUBPROJECTS_MEDIA: SidebarItem[] = [
  { id: 'sp1', type: 'video', name: 'Intro_Sequence.json', duration: 10.0, size: '1.2 MB', thumbnail: '📁', color: 'from-cyan-600 to-teal-500' },
  { id: 'sp2', type: 'video', name: 'Outro_Credits.json', duration: 15.0, size: '1.8 MB', thumbnail: '📁', color: 'from-blue-600 to-purple-500' },
];

const LIBRARY_MEDIA: SidebarItem[] = [
  { id: 'lib1', type: 'video', name: 'Nature_Forest_Cinematic.mp4', duration: 15.0, size: '18.4 MB', thumbnail: '🌳', color: 'from-emerald-600 to-green-500', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
  { id: 'lib2', type: 'video', name: 'Cyberpunk_City_Timelapse.mp4', duration: 22.0, size: '34.5 MB', thumbnail: '🌃', color: 'from-fuchsia-600 to-indigo-600', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
  { id: 'img3', type: 'video', name: 'cozy_studio_background.jpg', duration: 12.0, size: '4.2 MB', thumbnail: '🎨', color: 'from-purple-500 to-pink-500', imageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80' },
  { id: 'lib3', type: 'video', name: 'Acoustic_Guitar_Vibe.mp4', duration: 12.0, size: '9.3 MB', thumbnail: '🎸', color: 'from-yellow-600 to-amber-500' },
];

const SPACES_MEDIA = [
  { id: 'space1', name: 'Shared Team Space', desc: 'Podcast Production Team', isFolder: true, thumbnail: '👥' },
  { id: 'space2', name: 'My Archive Space', desc: 'Raw Cloud Backups', isFolder: true, thumbnail: '☁️' }
];

// 2. Audio Section Assets
const AUDIO_ASSETS: SidebarItem[] = [
  { id: 'au_fifa1', type: 'audio', name: 'FIFA 23 - Heat Wave.mp3', duration: 30.0, size: '4.8 MB', thumbnail: '⚽', color: 'from-blue-500 to-emerald-500', category: 'FIFA', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'au_fifa2', type: 'audio', name: 'EA Sports Stadium Jam.wav', duration: 24.5, size: '12.1 MB', thumbnail: '🔊', color: 'from-green-500 to-teal-500', category: 'FIFA', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'au_hit1', type: 'audio', name: 'Summer Sunset Hits.mp3', duration: 40.0, size: '7.2 MB', thumbnail: '🎵', color: 'from-amber-500 to-rose-500', category: 'Hits', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: 'au_hit2', type: 'audio', name: 'Synthwave Nightride.mp3', duration: 35.0, size: '6.5 MB', thumbnail: '🌌', color: 'from-purple-500 to-indigo-500', category: 'Hits', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: 'au_tense1', type: 'audio', name: 'Thriller Orchestral.wav', duration: 20.0, size: '8.4 MB', thumbnail: '💀', color: 'from-gray-700 to-red-900', category: 'Tense', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { id: 'au_tense2', type: 'audio', name: 'Suspense Drone Pad.mp3', duration: 28.0, size: '5.1 MB', thumbnail: '🛸', color: 'from-red-800 to-orange-950', category: 'Tense', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
  { id: 'au_vlog1', type: 'audio', name: 'Aesthetic Cafe Morning.mp3', duration: 32.0, size: '6.0 MB', thumbnail: '☕', color: 'from-yellow-500 to-amber-500', category: 'Vlog', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
  { id: 'au_vlog2', type: 'audio', name: 'Happy Acoustic Ukulele.wav', duration: 15.0, size: '4.2 MB', thumbnail: '🌴', color: 'from-teal-400 to-yellow-400', category: 'Vlog', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
  { id: 'au_phonk1', type: 'audio', name: 'RAVE PHONK BEAT.mp3', duration: 25.0, size: '5.4 MB', thumbnail: '⚡', color: 'from-purple-900 to-fuchsia-600', category: 'Phonk', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
  { id: 'au_phonk2', type: 'audio', name: 'Tokyo Drift Bass Boost.mp3', duration: 28.0, size: '6.1 MB', thumbnail: '🚗', color: 'from-red-600 to-black', category: 'Phonk', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
];

// 3. Text Section Assets
const TEXT_ASSETS: SidebarItem[] = [
  { id: 'txt_title', type: 'text', name: 'Add Main Title', duration: 5.0, thumbnail: '✍️', textContent: 'New Video Title ✍️', color: 'from-purple-500 to-pink-500', category: 'Add Text' },
  { id: 'txt_subtitle', type: 'text', name: 'Add Subtitle', duration: 5.0, thumbnail: '📝', textContent: 'Description or subtitle line', color: 'from-blue-500 to-purple-500', category: 'Add Text' },
  { id: 'txt_body', type: 'text', name: 'Add Body Text', duration: 5.0, thumbnail: '✏️', textContent: 'This is a sample body text for your video.', color: 'from-indigo-500 to-teal-500', category: 'Add Text' },
  
  { id: 'txt_fx1', type: 'text', name: 'Neon Pink Glow', duration: 6.0, thumbnail: '✨', textContent: '✨ NEON SHINE ✨', color: 'from-pink-500 to-fuchsia-600', category: 'Text Effects' },
  { id: 'txt_fx2', type: 'text', name: 'Retro Glitch', duration: 4.5, thumbnail: '👾', textContent: '[ SYSTEM_ERR ]', color: 'from-cyan-500 to-blue-600', category: 'Text Effects' },
  { id: 'txt_fx3', type: 'text', name: 'Cinematic Gold', duration: 8.0, thumbnail: '🏆', textContent: 'PREMIUM CINEMATIC', color: 'from-yellow-500 to-amber-600', category: 'Text Effects' },
  
  { id: 'txt_temp1', type: 'text', name: 'Modern Lower Third', duration: 5.0, thumbnail: '🏷️', textContent: '👤 John Doe | Editor', color: 'from-teal-500 to-emerald-600', category: 'Text Templates' },
  { id: 'txt_temp2', type: 'text', name: 'YouTube Subscribe', duration: 4.0, thumbnail: '🔔', textContent: 'SUBSCRIBE & LIKE 🔔', color: 'from-red-600 to-red-500', category: 'Text Templates' },
];

// 4. Captions Section Templates
const CAPTIONS_TEMPLATES: SidebarItem[] = [
  { id: 'cap_box', type: 'caption', name: 'Moving Box', duration: 7.0, thumbnail: '💬', textContent: 'Moving Box Subtitle Style 📦', color: 'from-blue-600 to-cyan-500', description: 'Smart dark bounding box dynamic to each word length for peak readability' },
  { id: 'cap_karaoke', type: 'caption', name: 'Karaoke Active', duration: 6.0, thumbnail: '🎤', textContent: 'Karaoke Active Highlights 🎤', color: 'from-purple-600 to-indigo-500', description: 'Scale & highlight current active word on the line matching audio playback', words: [
    { word: "Welcome", start: 0, end: 1 },
    { word: "to", start: 1, end: 2 },
    { word: "advanced", start: 2, end: 3 },
    { word: "video", start: 3, end: 4 },
    { word: "studio", start: 4, end: 5 },
    { word: "experience", start: 5, end: 7 }
  ]},
  { id: 'cap_line', type: 'caption', name: 'Underline Focus', duration: 8.0, thumbnail: '✍️', textContent: 'Elegant Underline Styled Subtitles ✒️', color: 'from-emerald-600 to-teal-500', description: 'Draws a smooth horizontal line beneath the word currently spoken' },
  { id: 'cap_glow', type: 'caption', name: 'Neon Glow', duration: 6.5, thumbnail: '🌟', textContent: 'Glowing Neon Text Subtitle 🌟', color: 'from-pink-600 to-amber-500', description: 'Luminescent text drop shadow to easily isolate text from bright backgrounds' },
];

// 5. Stickers Section Assets
const STICKERS_ASSETS: SidebarItem[] = [
  { id: 'st_cyber_sub', type: 'sticker', name: 'Cyberpunk Subscribe ⚡', thumbnail: '⚡', textContent: '⚡ SUBSCRIBE ⚡', color: 'from-fuchsia-600 to-cyan-500', category: 'badges', description: 'Futuristic YouTube subscribe animation with neon grids, electric outline, glitch pink button, 3D rotating thumbs-up, golden bell, scan-lines & particles' },
  { id: 'st_sub', type: 'sticker', name: 'Subscribe 🔔', thumbnail: '🔔', textContent: '🔔 SUBSCRIBE', color: 'from-red-600 to-rose-500', category: 'badges', description: 'Interactive YouTube/Social Subscribe Button Overlay' },
  { id: 'st1', type: 'sticker', name: 'Croissant 🥐', thumbnail: '🥐', textContent: '🥐', color: 'from-amber-400 to-yellow-500', category: 'emoji' },
  { id: 'st2', type: 'sticker', name: 'Fire Blast 🔥', thumbnail: '🔥', textContent: '🔥', color: 'from-orange-500 to-red-500', category: 'emoji' },
  { id: 'st3', type: 'sticker', name: 'Rocket Launch 🚀', thumbnail: '🚀', textContent: '🚀', color: 'from-cyan-400 to-blue-500', category: 'emoji' },
  { id: 'st4', type: 'sticker', name: 'Love Heart ❤️', thumbnail: '❤️', textContent: '❤️', color: 'from-red-500 to-pink-500', category: 'emoji' },
  { id: 'st5', type: 'sticker', name: 'Pointing Hand 👉', thumbnail: '👉', textContent: '👉', color: 'from-yellow-400 to-amber-500', category: 'shapes' },
  { id: 'st6', type: 'sticker', name: 'Highlight Circle ⭕', thumbnail: '⭕', textContent: '⭕', color: 'from-red-500 to-rose-600', category: 'shapes' },
  { id: 'st7', type: 'sticker', name: 'Star Rating ⭐', thumbnail: '⭐', textContent: '⭐', color: 'from-yellow-400 to-yellow-200', category: 'badges' },
  { id: 'st8', type: 'sticker', name: 'Check Verified ✅', thumbnail: '✅', textContent: '✅', color: 'from-emerald-500 to-green-600', category: 'badges' },
];

// 6. Effects Section Assets
const EFFECTS_ASSETS: SidebarItem[] = [
  { id: 'ef_cyber_sub', type: 'effects', name: 'Cyberpunk Subscribe ⚡', thumbnail: '⚡', textContent: '[ CYBERPUNK SUBSCRIBE ]', color: 'from-fuchsia-600 to-cyan-500', description: 'Futuristic YouTube subscribe animation with neon grids, electric outline, glitch pink button, 3D rotating thumbs-up, golden bell, scan-lines & particles' },
  { id: 'ef_sub', type: 'effects', name: 'Subscribe Effect ✨', thumbnail: '✨', textContent: '[ SUBSCRIBE BANNER ]', color: 'from-red-500 to-purple-600', description: 'Cinematic animated pop-up subscribe channel banner' },
  { id: 'ef1', type: 'effects', name: 'VHS Retro', thumbnail: '📼', textContent: '[ VHS RETRO FILTER ]', color: 'from-indigo-900 to-purple-800', description: 'Simulates classic, analog nostalgic videotape effects' },
  { id: 'ef2', type: 'effects', name: 'Cinematic Blur', thumbnail: '👁️', textContent: '[ CINEMATIC BLUR ]', color: 'from-blue-900 to-cyan-800', description: 'Blurs background layer to create high-end depth of field' },
  { id: 'ef3', type: 'effects', name: 'Neon Edge', thumbnail: '⚡', textContent: '[ NEON EDGE ]', color: 'from-pink-800 to-fuchsia-800', description: 'Illuminates high-contrast color boundaries & image edges' },
  { id: 'ef4', type: 'effects', name: 'Glitch Signal', thumbnail: '👾', textContent: '[ GLITCH ERR_ ]', color: 'from-red-900 to-gray-800', description: 'Generates temporary digital signal glitches and artifacts' },
];

// 7. Transitions Section Assets
const TRANSITIONS_ASSETS: SidebarItem[] = [
  { id: 'tr1', type: 'transitions', name: 'Cross Dissolve', thumbnail: '🔀', textContent: '[ CROSS DISSOLVE ]', color: 'from-teal-800 to-blue-800', description: 'Smooth cross-fade blending from first scene into second' },
  { id: 'tr2', type: 'transitions', name: 'Wipe Left', thumbnail: '⬅️', textContent: '[ WIPE LEFT ]', color: 'from-purple-800 to-pink-800', description: 'Sliding wipe from right-to-left for dynamic scene changes' },
  { id: 'tr3', type: 'transitions', name: 'Zoom In', thumbnail: '🔍', textContent: '[ ZOOM IN ]', color: 'from-yellow-800 to-orange-800', description: 'Rapid cinematic zoom to capture immediate viewer focus' },
  { id: 'tr4', type: 'transitions', name: 'Spin Reveal', thumbnail: '🔄', textContent: '[ SPIN REVEAL ]', color: 'from-emerald-800 to-teal-800', description: '360 degree camera rotation transitioning into next shot' },
];

// 8. Filters Section Assets
const FILTERS_ASSETS: SidebarItem[] = [
  { id: 'fi1', type: 'filters', name: 'Teal & Orange', thumbnail: '🎨', textContent: '[ TEAL_ORANGE_LUT ]', color: 'from-teal-700 to-orange-600', description: 'Popular cinematic look boosting skin warmth and teal skies' },
  { id: 'fi2', type: 'filters', name: 'Cyberpunk Pink', thumbnail: '🔮', textContent: '[ CYBERPINK_LUT ]', color: 'from-pink-700 to-blue-800', description: 'Neon nighttime palette with violet, magenta and cyan highlights' },
  { id: 'fi3', type: 'filters', name: 'Monochrome High-Key', thumbnail: '📷', textContent: '[ BLACK_WHITE_LUT ]', color: 'from-gray-800 to-black', description: 'Classic high-contrast black & white styling with deep shadows' },
  { id: 'fi4', type: 'filters', name: 'Warm Vintage', thumbnail: '📜', textContent: '[ VINTAGE_LUT ]', color: 'from-amber-800 to-amber-950', description: 'Aged film simulation with rich warm tones' },
];

// 9. Subscribe Templates Section Assets
const SUBSCRIBE_TEMPLATES: SidebarItem[] = [
  { 
    id: 'st_custom_subscribe', 
    type: 'sticker', 
    name: 'طراحی اختصاصی من 🛠️ (Subscribe Generator)', 
    thumbnail: '🛠️', 
    textContent: '🔔 CUSTOM', 
    color: 'from-emerald-500 via-teal-600 to-indigo-500', 
    category: 'Custom', 
    duration: 11.0,
    description: 'ویدجت اختصاصی طراحی شده در بخش Subscribe Generator با کیفیت نهایی بالا و کاملا داینامیک.' 
  },
  { 
    id: 'st_audio_wave_overlay', 
    type: 'sticker', 
    name: 'اکولایزر پادکست حرفه‌ای 🎵 (Audio Wave Overlay)', 
    thumbnail: '🎵', 
    textContent: '🎵 AUDIO WAVE', 
    color: 'from-cyan-500 via-blue-600 to-purple-600', 
    category: 'Visualizers', 
    duration: 15.0,
    description: 'اکولایزر و موج صوتی کاملا داینامیک و واکنش‌گرا به صدای گوینده پادکست با ۵ حالت بصری جذاب و مدرن.' 
  },
  { 
    id: 'st_neon_capsule', 
    type: 'sticker', 
    name: 'Neon Capsule Subscribe 🎧', 
    thumbnail: '🎧', 
    textContent: '🎧 SUBSCRIBE', 
    color: 'from-pink-500 via-purple-600 to-cyan-400', 
    category: 'Cyberpunk', 
    duration: 10.0,
    description: 'Horizontal glowing neon capsule banner with customizable logo, editable channel title/subtitle, a red subscribe button, interactive like, and ringing bell (transparent backdrop).' 
  },
  { 
    id: 'st_cyber_sub', 
    type: 'sticker', 
    name: 'Cyberpunk Subscribe ⚡', 
    thumbnail: '⚡', 
    textContent: '⚡ SUBSCRIBE ⚡', 
    color: 'from-fuchsia-600 to-cyan-500', 
    category: 'Cyberpunk', 
    duration: 10.0,
    description: 'Futuristic YouTube subscribe animation with neon grids, electric outline, glitch pink button, 3D rotating thumbs-up, golden bell, scan-lines & particles' 
  },
  { 
    id: 'st_neon_outrun', 
    type: 'sticker', 
    name: 'Retro Synthwave 🌌', 
    thumbnail: '🌌', 
    textContent: '🌌 OUTRUN 🌌', 
    color: 'from-pink-500 to-purple-600', 
    category: 'Synthwave', 
    duration: 10.0,
    description: 'Retro 80s outrun style subscribe banner with glowing sunset gradients and neon wireframe aesthetics' 
  },
  { 
    id: 'st_glass_minimal', 
    type: 'sticker', 
    name: 'Glassmorphism Minimal 💎', 
    thumbnail: '💎', 
    textContent: '💎 PREMIUM 💎', 
    color: 'from-white/10 to-white/5', 
    category: 'Minimalist', 
    duration: 10.0,
    description: 'Clean frosted glass card with glowing blur effects, modern tracking text and minimalist white details' 
  },
  { 
    id: 'st_classic_youtube', 
    type: 'sticker', 
    name: 'Classic Creator Pro 🔔', 
    thumbnail: '🔔', 
    textContent: '🔔 SUBSCRIBE', 
    color: 'from-red-600 to-rose-500', 
    category: 'Classic', 
    duration: 10.0,
    description: 'Professional standard red YouTube-style button featuring an interactive bell and click animations' 
  },
  { 
    id: 'st_matrix_glitch', 
    type: 'sticker', 
    name: 'Chrono Matrix Hack 👾', 
    thumbnail: '👾', 
    textContent: '👾 ROOT_SUB 👾', 
    color: 'from-green-600 to-black', 
    category: 'Hacker', 
    duration: 10.0,
    description: 'Matrix digital green code rain banner with terminal style text and cybernetic binary accents' 
  }
];

// Main tab definition
type MainTab = 'media' | 'audio' | 'text' | 'stickers' | 'effects' | 'transitions' | 'captions' | 'filters' | 'adjustments' | 'subscribe';

export const ResourceSidebar: React.FC<ResourceSidebarProps> = ({ onAddClip }) => {

  /**
   * Object-URL ownership moved to the AssetRegistry (INV-008): `resolveUrl` mints,
   * `releaseUrl` revokes, and the project close path revokes everything that is
   * still tracked. Revoking here as well would leave the registry tracking a dead
   * URL, so this component deliberately owns none.
   */
  const [activeTab, setActiveTab] = useState<MainTab>('media');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mediaList, setMediaList] = useState<SidebarItem[]>(YOURS_MEDIA);

  // Submenu states
  const [mediaSubmenu, setMediaSubmenu] = useState<MediaSubmenu>('yours');
  const [textSubmenu, setTextSubmenu] = useState<TextSubmenu>('add');
  const [stickerSubmenu, setStickerSubmenu] = useState<StickerSubmenu>('emoji');
  const [audioCategory, setAudioCategory] = useState<string>('all');

  // Adjustments local state (to make sliders interactive!)
  const [exposure, setExposure] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [saturation, setSaturation] = useState<number>(0);
  const [temperature, setTemperature] = useState<number>(0);

  // Audio Transcription / Captions Generator States
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedTheme, setSelectedTheme] = useState<string>('cap_karaoke');
  const [importCaptionMode, setImportCaptionMode] = useState<'phrase' | 'sentence'>('sentence');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcribeProgress, setTranscribeProgress] = useState<string>('');

  const tracks = useProjectStore(state => state.tracks);

  // Filter out any transcribable audio/video clips on the active timeline tracks
  const transcribeableClips = useMemo(() => {
    const list: Array<{ id: string; name: string; duration: number; type: 'audio' | 'video' }> = [];
    tracks.forEach(track => {
      if (track.type === 'audio' || track.type === 'video') {
        track.clips.forEach(clip => {
          list.push({
            id: clip.id,
            name: clip.properties.name || 'Unnamed Clip',
            duration: clip.duration,
            type: track.type as 'audio' | 'video'
          });
        });
      }
    });
    return list;
  }, [tracks]);

  const handleAutoCaption = useCallback(async (sourceOverride?: string) => {
    setIsTranscribing(true);
    setTranscribeProgress("Connecting to speech translation server...");
    
    let clipName = "Full Timeline Audio Track";
    let duration = 45;
    const sourceId = sourceOverride ?? selectedSource;
    
    if (sourceId !== 'all') {
      const clip = transcribeableClips.find(c => c.id === sourceId);
      if (clip) {
        clipName = clip.name;
        duration = clip.duration;
      }
    }

    try {
      setTranscribeProgress("Extracting dialogue waveforms and processing...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      setTranscribeProgress("Calling Gemini Speech-to-Text engine...");
      
      // W3 caption workflow: bounded, cancellable, typed failures — no silent
      // substitute content when the AI call fails.
      const projectFps = getProjectFps();
      const captions = await runCaptions({
        source: 'generate',
        audioClipName: clipName,
        duration,
        topicPrompt: customPrompt,
        projectFps,
      });

      setTranscribeProgress("Aligning word-by-word timestamps...");

      if (!Array.isArray(captions) || captions.length === 0) {
        throw new Error("The caption service returned no caption blocks.");
      }

      setTranscribeProgress("Applying professional styles and formatting...");
      await new Promise(resolve => setTimeout(resolve, 600));

      // Convert caption blocks to timeline clips
      let baseStyle: any = {
        fontFamily: 'Inter',
        fontSize: 22,
        textColor: '#ffffff',
        captionTheme: resolveCaptionImportTheme({ preferredTheme: selectedTheme }),
        captionDisplayMode: importCaptionMode
      };

      if (selectedTheme === 'cap_box') {
        baseStyle = {
          fontFamily: 'Inter',
          fontSize: 22,
          textColor: '#ffffff',
          captionTheme: 'box',
          captionDisplayMode: importCaptionMode,
          padding: 12,
          radius: 8
        };
      } else if (selectedTheme === 'cap_line') {
        baseStyle = {
          fontFamily: 'Inter',
          fontSize: 22,
          textColor: '#ffffff',
          captionTheme: 'line',
          captionDisplayMode: importCaptionMode
        };
      } else if (selectedTheme === 'cap_glow') {
        baseStyle = {
          fontFamily: 'Inter',
          fontSize: 22,
          textColor: '#ffff00',
          captionTheme: 'glow',
          captionDisplayMode: importCaptionMode
        };
      }

      const newCaptionClips = captions.map((block: any, idx: number) => {
        const startAt = block.words && block.words.length > 0 
          ? block.words[0].start 
          : parseCaptionTimestamp(block.start_time, projectFps);
        
        const endAt = block.words && block.words.length > 0
          ? block.words[block.words.length - 1].end
          : parseCaptionTimestamp(block.end_time, projectFps);
        
        const timing = normalizeCaptionTiming(
          { id: `generated_${idx}`, start_time: startAt, end_time: endAt, text: block.text, words: block.words || [] },
          projectFps,
        );

        return {
          id: `gen_cap_${Date.now()}_${idx}`,
          sourceId: `gen_cap_src_${idx}`,
          startAt: parseFloat(timing.startAt.toFixed(3)),
          duration: timing.duration,
          trim: { in: 0, out: timing.duration },
          transform: { x: 0, y: 65, scale: 100, rotation: 0, opacity: 100 },
          properties: {
            name: `AI Subtitle Block ${idx + 1}`,
            textContent: block.text,
            words: block.words,
            speaker: block.speaker || (idx % 2 === 0 ? 'Host A' : 'Host B'),
            ...baseStyle
          }
        };
      });

      // Generated captions go into a single dedicated subtitle/caption lane.
      const project = useProjectStore.getState();
      let nextTracks = [...project.tracks];
      const emptyCaptionTrackIndex = nextTracks.findIndex((t) => (t.type === 'text' || t.laneRole === 'caption') && (!t.clips || t.clips.length === 0) && !t.isLocked);
      if (emptyCaptionTrackIndex >= 0) {
        nextTracks = nextTracks.map((t, i) => i === emptyCaptionTrackIndex ? { ...t, clips: newCaptionClips, laneRole: 'caption' as const } : t);
      } else {
        const captionTrackCount = nextTracks.filter((t) => t.laneRole === 'caption' || t.type === 'text').length + 1;
        const newTrack = {
          id: crypto.randomUUID(),
          type: 'text' as const,
          laneRole: 'caption' as const,
          name: `Captions ${captionTrackCount}`,
          isLocked: false,
          isMuted: false,
          isVisible: true,
          clips: newCaptionClips,
        };
        const lastSameRole = nextTracks.reduce((last, track, index) => (
          (track.laneRole ?? track.type) === 'caption' || track.type === 'text' ? index : last
        ), -1);
        nextTracks.splice(lastSameRole >= 0 ? lastSameRole + 1 : 0, 0, newTrack);
      }

      project.executeCommand(createTrackSnapshotCommand('Add Generated Subtitles Track', project.tracks, nextTracks));
      useProjectStore.getState().showToast(
        `✨ Transcribed and applied ${newCaptionClips.length} AI captions successfully!`
      );

    } catch (err: any) {
      console.error("Transcribing failed:", err);
      useProjectStore.getState().showToast("❌ Transcription failed: " + err.message);
    } finally {
      setIsTranscribing(false);
    }
  }, [customPrompt, importCaptionMode, selectedSource, selectedTheme, transcribeableClips]);

  useEffect(() => {
    const onTimelineTranscript = (event: Event) => {
      const detail = (event as CustomEvent<{ clipIds?: string[] }>).detail;
      const clipId = detail?.clipIds?.[0];
      if (!clipId) return;

      setSelectedSource(clipId);
      void handleAutoCaption(clipId);
    };

    window.addEventListener('video-studio:timeline:transcribe', onTimelineTranscript);
    return () => {
      window.removeEventListener('video-studio:timeline:transcribe', onTimelineTranscript);
    };
  }, [handleAutoCaption]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.srt')) {
      void importSrtFile(file);
      e.target.value = '';
      return;
    }

    /**
     * Import path (WP-05): bytes go to the asset store first, then the sidebar
     * item carries BOTH the measured, authoritative duration and the AssetId.
     * The object URL is a runtime handle minted by the registry.
     */
    void (async () => {
      try {
        const { assetId, record, objectUrl } = await importMediaFile({ file });
        const isAudio = record.kind === 'audio';
        const isImage = record.kind === 'image';
        const measured = record.duration !== null && record.duration > 0 ? record.duration : null;
        const duration = measured ?? (isImage ? 5.0 : 5.0);

        const newAsset: SidebarItem = {
          id: `u_${assetId}`,
          type: isAudio ? 'audio' as const : 'video' as const,
          name: file.name,
          duration,
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          thumbnail: isImage ? '🖼️' : isAudio ? '🔊' : '🎬',
          color: isImage
            ? 'from-emerald-600 to-teal-600'
            : isAudio
              ? 'from-fuchsia-600 to-indigo-600'
              : 'from-cyan-600 to-blue-600',
          videoUrl: isAudio || isImage ? undefined : objectUrl,
          audioUrl: isAudio ? objectUrl : undefined,
          imageUrl: isImage ? objectUrl : undefined,
          videoAssetId: isAudio || isImage ? undefined : assetId,
          audioAssetId: isAudio ? assetId : undefined,
          imageAssetId: isImage ? assetId : undefined,
        };

        setMediaList(prev => [newAsset, ...prev]);
        useProjectStore.getState().showToast(
          measured === null && !isImage
            ? `⚠️ Imported ${file.name}, but its duration could not be measured — a 5 s placeholder length was used.`
            : `📥 Imported asset: ${file.name} (${duration.toFixed(1)}s)`,
        );
      } catch (error) {
        useProjectStore.getState().showToast(
          `❌ Could not store ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    })();
  };

  // Mock AI Generator triggering
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  
  const handleAiGenerate = () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    setTimeout(() => {
      const generatedAsset: SidebarItem = {
        id: `ai_${Date.now()}`,
        type: 'video',
        name: `AI_${aiPrompt.slice(0, 15).replace(/\s+/g, '_')}.mp4`,
        duration: 8.0,
        size: '12.4 MB',
        thumbnail: '✨',
        color: 'from-cyan-500 to-purple-600'
      };
      setMediaList(prev => [generatedAsset, ...prev]);
      setMediaSubmenu('yours');
      setIsGenerating(false);
      setAiPrompt('');
      useProjectStore.getState().showToast(`✨ Generated AI video clip successfully!`);
    }, 2000);
  };

  const handleApplyPreset = (presetName: string, textStyle: string) => {
    const asset = {
      id: `adj_${Date.now()}`,
      type: 'adjustments',
      name: `${presetName} Preset`,
      duration: 10,
      thumbnail: 'Sliders',
      color: 'from-indigo-600 to-blue-500',
      textContent: textStyle
    };
    onAddClip(asset);
  };

  // Determine which list to render and filter it with searchQuery
  const getFilteredItems = (): SidebarItem[] => {
    const query = searchQuery.toLowerCase();
    
    switch (activeTab) {
      case 'media':
        let currentList: SidebarItem[] = [];
        if (mediaSubmenu === 'yours' || mediaSubmenu === 'import') {
          currentList = mediaList;
        } else if (mediaSubmenu === 'subprojects') {
          currentList = SUBPROJECTS_MEDIA;
        } else if (mediaSubmenu === 'library') {
          currentList = LIBRARY_MEDIA;
        }
        return currentList.filter(item => item.name.toLowerCase().includes(query));

      case 'audio':
        let filteredAudio = AUDIO_ASSETS;
        if (audioCategory !== 'all') {
          filteredAudio = AUDIO_ASSETS.filter(a => a.category === audioCategory);
        }
        return filteredAudio.filter(item => item.name.toLowerCase().includes(query));

      case 'text':
        let filteredText = TEXT_ASSETS;
        if (textSubmenu === 'add') {
          filteredText = TEXT_ASSETS.filter(t => t.category === 'Add Text');
        } else if (textSubmenu === 'effects') {
          filteredText = TEXT_ASSETS.filter(t => t.category === 'Text Effects');
        } else if (textSubmenu === 'templates') {
          filteredText = TEXT_ASSETS.filter(t => t.category === 'Text Templates');
        }
        return filteredText.filter(item => item.name.toLowerCase().includes(query));

      case 'captions':
        return CAPTIONS_TEMPLATES.filter(item => item.name.toLowerCase().includes(query));

      case 'stickers':
        let filteredSticker = STICKERS_ASSETS;
        if (stickerSubmenu === 'emoji') {
          filteredSticker = STICKERS_ASSETS.filter(s => s.category === 'emoji');
        } else if (stickerSubmenu === 'shapes') {
          filteredSticker = STICKERS_ASSETS.filter(s => s.category === 'shapes');
        } else if (stickerSubmenu === 'badges') {
          filteredSticker = STICKERS_ASSETS.filter(s => s.category === 'badges');
        }
        return filteredSticker.filter(item => item.name.toLowerCase().includes(query));

      case 'effects':
        return EFFECTS_ASSETS.filter(item => item.name.toLowerCase().includes(query));

      case 'transitions':
        return TRANSITIONS_ASSETS.filter(item => item.name.toLowerCase().includes(query));

      case 'filters':
        return FILTERS_ASSETS.filter(item => item.name.toLowerCase().includes(query));

      case 'subscribe':
        return SUBSCRIBE_TEMPLATES.filter(item => item.name.toLowerCase().includes(query));

      default:
        return [];
    }
  };

  const filteredItems = getFilteredItems();

  // Navigation tabs metadata (Icons & Titles)
  const tabsMetadata: { id: MainTab; labelFa: string; labelEn: string; icon: React.ReactNode }[] = [
    { id: 'media', labelFa: 'Media', labelEn: 'Media', icon: <FolderOpen className="w-4 h-4" /> },
    { id: 'subscribe', labelFa: 'ویجت و اکولایزر', labelEn: 'Sub & Wave', icon: <Bell className="w-4 h-4" /> },
    { id: 'audio', labelFa: 'Audio', labelEn: 'Audio', icon: <Music className="w-4 h-4" /> },
    { id: 'text', labelFa: 'Text', labelEn: 'Text', icon: <Type className="w-4 h-4" /> },
    { id: 'stickers', labelFa: 'Stickers', labelEn: 'Stickers', icon: <Smile className="w-4 h-4" /> },
    { id: 'effects', labelFa: 'Effects', labelEn: 'Effects', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'transitions', labelFa: 'Transitions', labelEn: 'Transitions', icon: <Layers className="w-4 h-4" /> },
    { id: 'captions', labelFa: 'Captions', labelEn: 'Captions', icon: <Languages className="w-4 h-4" /> },
    { id: 'filters', labelFa: 'Filters', labelEn: 'Filters', icon: <Palette className="w-4 h-4" /> },
    { id: 'adjustments', labelFa: 'Adjust', labelEn: 'Adjustments', icon: <Sliders className="w-4 h-4" /> },
  ];

  return (
    <div className="h-full flex bg-[#06070a] text-gray-200 overflow-hidden" id="resource_sidebar_container">
      
      {/* 1. Main Vertical Navigation Toolbar (Leftside narrow panel) */}
      <div className="w-[68px] bg-[#090a0f] border-r border-white/5 flex flex-col items-center py-3 gap-1 shrink-0 select-none" id="vertical_navigation_toolbar">
        {tabsMetadata.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab_button_${tab.id}`}
              onClick={() => {
                setActiveTab(tab.id);
                setSearchQuery('');
              }}
              title={`${tab.labelEn}`}
              className={`w-14 h-12 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                isActive 
                  ? 'bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span className="text-[8.5px] font-medium truncate max-w-full px-0.5">{tab.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Contextual Sidebar Body */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d0e12]" id="contextual_sidebar_body">
        
        {/* Title and Smart Search */}
        <div className="p-3 border-b border-white/5 space-y-2.5" id="contextual_sidebar_header">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-gray-100 flex items-center gap-1.5 uppercase tracking-wide" id="contextual_sidebar_title">
              {activeTab === 'media' && '📁 Media Section'}
              {activeTab === 'subscribe' && '🔔 Widgets & Equalizers (ویجت و اکولایزر)'}
              {activeTab === 'audio' && '🎵 Audio Library'}
              {activeTab === 'text' && '✍️ Text Overlays'}
              {activeTab === 'stickers' && '🥐 Stickers & Badges'}
              {activeTab === 'effects' && '✨ Video Effects'}
              {activeTab === 'transitions' && '🔀 Transitions'}
              {activeTab === 'captions' && '💬 Captions Styling'}
              {activeTab === 'filters' && '🎨 LUT Filters'}
              {activeTab === 'adjustments' && '🔧 Adjustments'}
            </h2>
            <span className="text-[8px] font-bold text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded uppercase leading-none">
              PRO
            </span>
          </div>

          {/* Smart Search Bar */}
          {activeTab !== 'adjustments' && (
            <div className="relative" id="search_bar_wrapper">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input 
                id="sidebar_search_input"
                type="text" 
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#13141a] border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
              />
            </div>
          )}
        </div>

        {/* 3. Submenus and Specific Content Layouts */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar min-h-0 space-y-3" id="sidebar_scrolling_content">
          
          {/* MEDIA SUB-TABS BAR */}
          {activeTab === 'media' && (
            <div className="flex flex-wrap gap-1 bg-[#13141a]/60 p-1 rounded-lg border border-white/5 mb-2.5" id="media_sub_tabs">
              {(['import', 'subprojects', 'yours', 'generate', 'spaces', 'library'] as const).map((sub) => {
                const subLabels: Record<MediaSubmenu, string> = {
                  import: 'Import File',
                  subprojects: 'Subprojects',
                  yours: 'Your Media',
                  generate: 'AI Generator',
                  spaces: 'Spaces',
                  library: 'Library'
                };
                return (
                  <button
                    key={sub}
                    id={`media_sub_tab_${sub}`}
                    onClick={() => setMediaSubmenu(sub)}
                    className={`px-2 py-1 rounded text-[9px] font-bold transition-all ${
                      mediaSubmenu === sub 
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/20' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {subLabels[sub]}
                  </button>
                );
              })}
            </div>
          )}

          {/* AUDIO SUB-TABS BAR */}
          {activeTab === 'audio' && (
            <div className="flex flex-wrap gap-1 bg-[#13141a]/60 p-1 rounded-lg border border-white/5 mb-2.5" id="audio_sub_tabs">
              {['all', 'FIFA', 'Hits', 'Tense', 'Vlog', 'Phonk'].map((cat) => (
                <button
                  key={cat}
                  id={`audio_sub_tab_${cat}`}
                  onClick={() => setAudioCategory(cat)}
                  className={`px-2 py-1 rounded text-[9px] font-bold transition-all ${
                    (cat === 'all' && audioCategory === 'all') || audioCategory === cat
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/20' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {cat === 'all' ? 'All' : cat}
                </button>
              ))}
            </div>
          )}

          {/* TEXT SUB-TABS BAR */}
          {activeTab === 'text' && (
            <div className="flex gap-1 bg-[#13141a]/60 p-1 rounded-lg border border-white/5 mb-2.5" id="text_sub_tabs">
              {(['add', 'effects', 'templates'] as const).map((sub) => {
                const textLabels: Record<TextSubmenu, string> = {
                  add: 'Add Text',
                  effects: 'Text Effects',
                  templates: 'Templates'
                };
                return (
                  <button
                    key={sub}
                    id={`text_sub_tab_${sub}`}
                    onClick={() => setTextSubmenu(sub)}
                    className={`flex-1 text-center py-1 rounded text-[9px] font-bold transition-all ${
                      textSubmenu === sub 
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/20' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {textLabels[sub]}
                  </button>
                );
              })}
            </div>
          )}

          {/* STICKERS SUB-TABS BAR */}
          {activeTab === 'stickers' && (
            <div className="flex gap-1 bg-[#13141a]/60 p-1 rounded-lg border border-white/5 mb-2.5" id="stickers_sub_tabs">
              {(['emoji', 'shapes', 'badges'] as const).map((sub) => {
                const stickerLabels: Record<StickerSubmenu, string> = {
                  emoji: 'Emoji',
                  shapes: 'Shapes',
                  badges: 'Badges'
                };
                return (
                  <button
                    key={sub}
                    id={`sticker_sub_tab_${sub}`}
                    onClick={() => setStickerSubmenu(sub)}
                    className={`flex-1 text-center py-1 rounded text-[9px] font-bold transition-all ${
                      stickerSubmenu === sub 
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/20' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {stickerLabels[sub]}
                  </button>
                );
              })}
            </div>
          )}

          {/* SPECIFIC PANEL: MEDIA IMPORT UPLOAD */}
          {activeTab === 'media' && mediaSubmenu === 'import' && (
            <div className="space-y-3" id="media_import_panel">
              <label className="border-2 border-dashed border-white/10 hover:border-cyan-400/30 rounded-xl p-5 text-center bg-black/20 hover:bg-black/30 transition-all flex flex-col items-center justify-center cursor-pointer group">
                <Upload className="w-6 h-6 text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-[11px] font-bold text-gray-200">Upload New Media Asset</span>
                <span className="text-[9px] text-gray-500 mt-1">Drag & drop video, audio or image files here</span>
                <input type="file" accept="video/*,audio/*,image/*" onChange={handleFileUpload} className="hidden" />
              </label>
              
              <div className="bg-[#13141a]/40 border border-white/5 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-300">Cross-Platform Playback Engine</h4>
                    <p className="text-[9px] text-gray-500 mt-1 leading-relaxed">
                      All uploaded files are fully parsed locally within the browser context and successfully layered onto the video timeline safely.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SPECIFIC PANEL: MEDIA GENERATIVE AI */}
          {activeTab === 'media' && mediaSubmenu === 'generate' && (
            <div className="space-y-3 bg-[#111218] border border-white/5 rounded-xl p-3.5" id="media_generate_panel">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-[11px] font-bold text-cyan-300">AI Prompt Video Generator</h3>
              </div>
              <p className="text-[9px] text-gray-400 leading-relaxed">
                Describe the specific scene or overlay you want to design, and the local AI system will model and render it instantly.
              </p>
              
              <textarea 
                id="ai_generation_prompt"
                rows={3}
                placeholder="e.g. delicious chocolate chip cookies baking in a hot oven, cinematic close-up..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                disabled={isGenerating}
                className="w-full bg-[#08090d] border border-white/10 rounded-lg p-2 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />

              <button 
                id="ai_generate_button"
                onClick={handleAiGenerate}
                disabled={isGenerating || !aiPrompt.trim()}
                className={`w-full py-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2 transition-all ${
                  isGenerating 
                    ? 'bg-gray-800 text-gray-500 cursor-wait' 
                    : aiPrompt.trim() 
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black cursor-pointer' 
                      : 'bg-white/5 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isGenerating ? (
                  <>
                    <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    Modeling dynamic scene pipelines...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate AI Video Clip
                  </>
                )}
              </button>
            </div>
          )}

          {/* SPECIFIC PANEL: MEDIA SPACES */}
          {activeTab === 'media' && mediaSubmenu === 'spaces' && (
            <div className="space-y-2" id="media_spaces_panel">
              {SPACES_MEDIA.map(space => (
                <div key={space.id} id={`space_card_${space.id}`} className="bg-[#111218] border border-white/5 rounded-xl p-3 flex items-center justify-between group hover:border-cyan-500/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-sm">
                      {space.thumbnail}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-200">{space.name}</p>
                      <p className="text-[8px] text-gray-500 mt-0.5">{space.desc}</p>
                    </div>
                  </div>
                  <button className="text-[8px] border border-white/10 hover:border-cyan-400/50 hover:text-cyan-400 px-2 py-1 rounded transition-all cursor-pointer">
                    View Space
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ADJUSTMENT SLIDERS */}
          {activeTab === 'adjustments' && (
            <div className="space-y-4" id="adjustments_panel">
              <div className="bg-[#111218] border border-white/5 rounded-xl p-3.5 space-y-3.5">
                <div className="flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[10px] font-bold text-gray-300">Video Grading & Correction (LUT Master)</span>
                </div>

                {/* Exposure */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-medium text-gray-400">
                    <span>Exposure</span>
                    <span className={exposure !== 0 ? "text-cyan-400 font-bold" : ""}>{exposure > 0 ? `+${exposure}` : exposure}</span>
                  </div>
                  <input 
                    type="range" min="-100" max="100" value={exposure} 
                    onChange={(e) => setExposure(Number(e.target.value))}
                    className="w-full accent-cyan-400 h-1 bg-black rounded"
                  />
                </div>

                {/* Contrast */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-medium text-gray-400">
                    <span>Contrast</span>
                    <span className={contrast !== 0 ? "text-cyan-400 font-bold" : ""}>{contrast > 0 ? `+${contrast}` : contrast}</span>
                  </div>
                  <input 
                    type="range" min="-100" max="100" value={contrast} 
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full accent-cyan-400 h-1 bg-black rounded"
                  />
                </div>

                {/* Saturation */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-medium text-gray-400">
                    <span>Saturation</span>
                    <span className={saturation !== 0 ? "text-cyan-400 font-bold" : ""}>{saturation > 0 ? `+${saturation}` : saturation}</span>
                  </div>
                  <input 
                    type="range" min="-100" max="100" value={saturation} 
                    onChange={(e) => setSaturation(Number(e.target.value))}
                    className="w-full accent-cyan-400 h-1 bg-black rounded"
                  />
                </div>

                {/* Temperature */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-medium text-gray-400">
                    <span>Temperature</span>
                    <span className={temperature !== 0 ? "text-cyan-400 font-bold" : ""}>{temperature > 0 ? `+${temperature}` : temperature}</span>
                  </div>
                  <input 
                    type="range" min="-100" max="100" value={temperature} 
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full accent-cyan-400 h-1 bg-black rounded"
                  />
                </div>

                <div className="flex gap-2 pt-2 border-t border-white/5">
                  <button 
                    onClick={() => {
                      setExposure(0);
                      setContrast(0);
                      setSaturation(0);
                      setTemperature(0);
                      useProjectStore.getState().showToast('🧹 Reset picture corrections');
                    }}
                    className="flex-1 py-1.5 rounded bg-white/5 hover:bg-white/10 text-[9px] font-bold text-gray-400 hover:text-white transition-all cursor-pointer"
                  >
                    Clear All
                  </button>
                  <button 
                    onClick={() => {
                      const valueString = `Exp:${exposure} Cnt:${contrast} Sat:${saturation} Temp:${temperature}`;
                      handleApplyPreset('Custom LUT', valueString);
                    }}
                    className="flex-1 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-black text-[9px] font-bold transition-all cursor-pointer"
                  >
                    Apply Correction
                  </button>
                </div>
              </div>

              {/* Ready Adjustment Presets */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quick Adjustment Presets</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => {
                      setExposure(10);
                      setContrast(25);
                      setSaturation(15);
                      setTemperature(5);
                      handleApplyPreset('High Contrast Boost', 'Exp:10 Cnt:25 Sat:15 Temp:5');
                    }}
                    className="bg-[#111218] border border-white/5 hover:border-cyan-500/30 p-2.5 rounded-xl text-left hover:bg-[#151722] transition-all cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5 text-cyan-400 mb-1" />
                    <p className="text-[10px] font-bold text-gray-200 truncate">High Contrast Boost</p>
                    <p className="text-[8px] text-gray-500 mt-0.5 truncate">Punchy shadows & vivid details</p>
                  </button>

                  <button 
                    onClick={() => {
                      setExposure(-5);
                      setContrast(10);
                      setSaturation(-10);
                      setTemperature(20);
                      handleApplyPreset('Warm Cinematic Shadows', 'Exp:-5 Cnt:10 Sat:-10 Temp:20');
                    }}
                    className="bg-[#111218] border border-white/5 hover:border-cyan-500/30 p-2.5 rounded-xl text-left hover:bg-[#151722] transition-all cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5 text-cyan-400 mb-1" />
                    <p className="text-[10px] font-bold text-gray-200 truncate">Warm Shadows</p>
                    <p className="text-[8px] text-gray-500 mt-0.5 truncate">Cinematic warm shadows & grading</p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* AI SPEECH-TO-TEXT / AUDIO-TO-CAPTIONS TRANSCRIBER */}
          {activeTab === 'captions' && (
            <>
              <div className="bg-gradient-to-br from-[#0c0d14] to-[#121422] border border-cyan-500/20 rounded-xl p-4 space-y-4 shadow-xl mb-4" id="ai_autocaptions_panel">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-cyan-500/10 rounded-lg text-cyan-400">
                    <Mic className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase text-cyan-400 tracking-wider">AI Speech-to-Text</h3>
                    <p className="text-[8px] text-gray-500 font-bold uppercase tracking-wide">تبدیل خودکار صدا به زیرنویس</p>
                  </div>
                </div>
                <span className="text-[8px] font-extrabold text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded border border-cyan-400/20 uppercase tracking-widest">
                  GEMINI AI
                </span>
              </div>

              {/* 1. Select Audio Source */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                  <span>1. Audio Source / منبع صدا</span>
                  <span className="text-cyan-400 text-[8px]">required</span>
                </div>
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  disabled={isTranscribing}
                  className="w-full bg-[#171822] border border-white/10 rounded-lg px-2.5 py-2 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/50 cursor-pointer disabled:opacity-50"
                >
                  <option value="all">Full Timeline Soundtrack (کل صدای تایم‌لاین)</option>
                  {transcribeableClips.map(clip => (
                    <option key={clip.id} value={clip.id}>
                      {clip.type === 'audio' ? '🎵' : '🎬'} {clip.name} ({clip.duration.toFixed(1)}s)
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Select Style Template */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">2. Caption Style / قالب زیرنویس</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'cap_karaoke', name: 'Karaoke Pop', desc: 'Active word pop-up', icon: '🎤' },
                    { id: 'cap_box', name: 'Smart Box', desc: 'Subtle bounding card', icon: '📦' },
                    { id: 'cap_line', name: 'Underline', desc: 'Focus line beneath word', icon: '✒️' },
                    { id: 'cap_glow', name: 'Neon Glow', desc: 'Vibrant text glow', icon: '🌟' }
                  ].map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => setSelectedTheme(theme.id)}
                      disabled={isTranscribing}
                      className={`p-2 rounded-lg border text-left transition-all flex flex-col justify-between cursor-pointer disabled:opacity-50 ${
                        selectedTheme === theme.id
                          ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.1)]'
                          : 'bg-[#171822] border-white/5 text-gray-400 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{theme.icon}</span>
                        <span className="text-[9px] font-black uppercase truncate">{theme.name}</span>
                      </div>
                      <span className="text-[7px] text-gray-500 leading-tight mt-1">{theme.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Select Display/Split Mode */}
              <div className="space-y-1.5" id="caption_import_mode_section">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">3. Display Mode / حالت نمایش جملات</span>
                <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-lg border border-white/5">
                  <button
                    onClick={() => setImportCaptionMode('phrase')}
                    disabled={isTranscribing}
                    className={`py-1.5 px-1 text-[9px] font-black uppercase rounded-md transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-50 ${
                      importCaptionMode === 'phrase'
                        ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-400/20'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <span className="text-[10px]">📋 Phrase</span>
                    <span className="text-[6px] lowercase font-normal opacity-60">Full phrase together</span>
                  </button>
                  <button
                    onClick={() => setImportCaptionMode('sentence')}
                    disabled={isTranscribing}
                    className={`py-1.5 px-1 text-[9px] font-black uppercase rounded-md transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-50 ${
                      importCaptionMode === 'sentence'
                        ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-400/20'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <span className="text-[10px]">✂️ Split Sentence</span>
                    <span className="text-[6px] lowercase font-normal opacity-60">Split at commas & ends</span>
                  </button>
                </div>
              </div>

              {/* 4. Custom AI Prompt Guide */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                  <span>4. Topic or Accent / کلمات کلیدی (اختیاری)</span>
                  <span className="text-[8px] text-gray-500 lowercase font-normal">helps spelling accuracy</span>
                </div>
                <textarea
                  rows={2}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  disabled={isTranscribing}
                  placeholder="e.g. French lamination baking, croissant tutorial..."
                  className="w-full bg-[#171822] border border-white/10 rounded-lg p-2 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 disabled:opacity-50 resize-none"
                />
              </div>

              {/* 4. Action Button with loading state */}
              <button
                onClick={() => { void handleAutoCaption(); }}
                disabled={isTranscribing}
                className={`w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isTranscribing
                    ? 'bg-[#171822] text-cyan-400 border border-cyan-500/20'
                    : 'bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black shadow-[0_0_15px_rgba(34,211,238,0.25)]'
                }`}
              >
                {isTranscribing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="animate-pulse">{transcribeProgress}</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Generate AI Subtitles / ساخت زیرنویس با هوش مصنوعی</span>
                  </>
                )}
              </button>

              <div className="bg-[#12131d] border border-cyan-500/10 rounded-lg p-2 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <p className="text-[8px] text-gray-500 leading-relaxed">
                  The AI transcriber automatically converts vocal tracks into perfectly synced caption blocks. You can choose to split or group sentences in the inspector panel on the right.
                </p>
              </div>
            </div>

            {/* DIRECT SRT SUBTITLE IMPORT CARD */}
            <div className="bg-gradient-to-br from-[#0c0d14] to-[#121422] border border-purple-500/20 rounded-xl p-4 space-y-3 shadow-xl mb-4" id="srt_subtitles_import_panel">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg text-purple-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase text-purple-400 tracking-wider">Import Subtitles (SRT)</h3>
                    <p className="text-[8px] text-gray-500 font-bold uppercase tracking-wide">بارگذاری مستقیم فایل زیرنویس بدون نیاز به متن اولیه</p>
                  </div>
                </div>
                <span className="text-[8px] font-extrabold text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded border border-purple-400/20 uppercase tracking-widest">
                  .SRT
                </span>
              </div>

              <label 
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file) void importSrtFile(file);
                }}
                className="border-2 border-dashed border-purple-500/20 hover:border-purple-400/50 rounded-xl p-4 text-center bg-purple-950/10 hover:bg-purple-950/20 transition-all flex flex-col items-center justify-center cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 mb-2 group-hover:scale-110 transition-transform">
                  <Upload className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black text-gray-200">انتخاب یا کشیدن فایل SRT</span>
                <span className="text-[8px] text-gray-500 mt-0.5">Click or Drop your .srt file here</span>
                <input 
                  type="file" 
                  accept=".srt" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importSrtFile(file);
                    e.target.value = '';
                  }} 
                  className="hidden" 
                />
              </label>

              <div className="bg-[#12131d] border border-purple-500/10 rounded-lg p-2 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                <p className="text-[8px] text-gray-500 leading-relaxed">
                  فایل‌های زیرنویس SRT بدون نیاز به وجود متن روی تایم‌لاین، مستقیماً خوانده شده و به عنوان یک ترک مستقل و هماهنگ روی ویدیو اضافه می‌شوند.
                </p>
              </div>
            </div>
          </>
          )}

          {/* CARD-GRID SYSTEM FOR RENDERING ITEMS */}
          {activeTab !== 'adjustments' && mediaSubmenu !== 'generate' && mediaSubmenu !== 'import' && mediaSubmenu !== 'spaces' && (
            <>
              {activeTab === 'text' && (
                <div className="mb-3 p-2.5 bg-purple-950/20 border border-purple-500/20 rounded-xl flex items-center justify-between gap-2" id="text_tab_srt_banner">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-gray-200">Import Subtitles (.SRT)</p>
                      <p className="text-[8px] text-gray-500 truncate">بارگذاری مستقیم بدون نیاز به نمونه متن</p>
                    </div>
                  </div>
                  <label className="text-[9px] font-bold bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 border border-purple-400/30 px-2.5 py-1 rounded-lg cursor-pointer transition-all shrink-0">
                    Import .SRT
                    <input 
                      type="file" 
                      accept=".srt" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void importSrtFile(file);
                        e.target.value = '';
                      }} 
                      className="hidden" 
                    />
                  </label>
                </div>
              )}

              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center" id="empty_search_state">
                  <AlertTriangle className="w-7 h-7 text-white/5 mb-2.5" />
                  <p className="text-[11px] text-gray-500">No matching assets found</p>
                </div>
              ) : (
              <div className="grid grid-cols-1 gap-2" id="resource_cards_grid">
                {filteredItems.map((item) => {
                  
                  // Media Lost visual state handler (rendered in deep red with link overlay)
                  if (item.isLost) {
                    return (
                      <div 
                        key={item.id} 
                        id={`lost_media_card_${item.id}`}
                        className="bg-[#1a0a0a]/50 border-2 border-red-500/30 rounded-xl p-3 flex items-center justify-between group transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0 shadow-lg animate-pulse">
                            <AlertTriangle className="w-4.5 h-4.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-red-400 truncate max-w-[120px]">{item.name}</p>
                            <p className="text-[8px] text-red-500/70 font-semibold uppercase tracking-wider mt-0.5">Media Lost</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            // Mock Relink
                            const restoredItem = { ...item, isLost: false, color: 'from-purple-600 to-indigo-600', thumbnail: '🎬' };
                            setMediaList(prev => prev.map(p => p.id === item.id ? restoredItem : p));
                            useProjectStore.getState().showToast(`✅ Successfully relinked asset: ${item.name}`);
                          }}
                          className="text-[8px] bg-red-900/40 hover:bg-red-900/80 text-red-300 border border-red-500/30 px-2 py-1 rounded font-bold transition-all cursor-pointer uppercase"
                        >
                          Relink
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      id={`resource_card_${item.id}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'asset', asset: item }));
                      }}
                      className="bg-[#111218] border border-white/5 hover:border-cyan-500/20 hover:bg-[#151722] rounded-xl p-2.5 flex items-center justify-between group transition-all relative"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Custom visual thumbnail representation */}
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-tr ${item.color} flex items-center justify-center text-base shadow-inner shrink-0 relative overflow-hidden`}>
                          {item.thumbnail}
                          {/* Audio Wave anim visual wrapper for sound files */}
                          {item.type === 'audio' && (
                            <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/40 flex items-end justify-center gap-0.5 px-1 py-0.5">
                              <span className="w-0.5 h-1 bg-cyan-400 animate-[pulse_0.8s_infinite]" />
                              <span className="w-0.5 h-2 bg-cyan-400 animate-[pulse_1.2s_infinite]" />
                              <span className="w-0.5 h-1.5 bg-cyan-400 animate-[pulse_1s_infinite]" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-gray-200 truncate max-w-[150px]">{item.name}</p>
                          <p className="text-[8px] text-gray-500 mt-0.5 font-medium flex items-center gap-1.5">
                            {item.duration !== undefined && (
                              <span className="text-cyan-400 font-bold">{item.duration.toFixed(1)}s</span>
                            )}
                            {item.size && (
                              <span>• {item.size}</span>
                            )}
                            {item.category && (
                              <span className="bg-white/5 px-1 rounded text-gray-400">{item.category}</span>
                            )}
                          </p>
                          {item.description && (
                            <p className="text-[8px] text-gray-500 mt-1 leading-relaxed max-w-[170px] truncate">{item.description}</p>
                          )}
                        </div>
                      </div>

                      {/* QUICK ACTION BUTTONS */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onAddClip(item)}
                          className="w-6 h-6 rounded bg-cyan-500 hover:bg-cyan-400 text-black flex items-center justify-center scale-95 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all cursor-pointer shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                          title="Add directly to timeline"
                        >
                          <Plus className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        </div>
      </div>

    </div>
  );
};

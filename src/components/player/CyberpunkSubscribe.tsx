import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ThumbsUp, 
  Bell, 
  Activity, 
  Cpu, 
  Sparkles, 
  Tv, 
  Check, 
  Upload, 
  RefreshCw, 
  Volume2, 
  VolumeX,
  Layers
} from 'lucide-react';
import {
  CYBERPUNK_LOGO_PRESETS,
  normalizeCyberpunkSubscribeProperties,
  type CyberpunkSubscribeProperties,
} from '../../core/engine/cyberpunkSubscribeModel';

interface CyberpunkSubscribeProps {
  clipId?: string;
  isPlaying?: boolean;
  currentTime?: number;
  properties?: Partial<CyberpunkSubscribeProperties>;
  onPropertiesChange?: (properties: Partial<CyberpunkSubscribeProperties>) => void;
}

export const CyberpunkSubscribe: React.FC<CyberpunkSubscribeProps> = ({ 
  clipId, 
  isPlaying = false, 
  currentTime = 0,
  properties,
  onPropertiesChange,
}) => {
  const persisted = useMemo(
    () => normalizeCyberpunkSubscribeProperties(properties),
    [properties],
  );
  const activeLogoPreset = useMemo(
    () => CYBERPUNK_LOGO_PRESETS.find((logo) => logo.id === persisted.logoPresetId) ?? CYBERPUNK_LOGO_PRESETS[0],
    [persisted.logoPresetId],
  );

  const [isBellRinging, setIsBellRinging] = useState<boolean>(false);
  const [channelNameDraft, setChannelNameDraft] = useState<string>(persisted.channelName);

  useEffect(() => {
    setChannelNameDraft(persisted.channelName);
  }, [persisted.channelName]);
  
  // Particle geometry is deterministic and animated entirely by CSS; React never updates it per frame.
  const particles = useMemo(() => Array.from({ length: 15 }, (_, i) => {
    const seed = (i * 1103515245 + 12345) >>> 0;
    const unit = (offset: number) => ((Math.imul(seed ^ offset, 2654435761) >>> 0) / 0x100000000);
    return {
      id: i,
      x: unit(11) * 100,
      y: unit(23) * 100,
      size: unit(37) * 2 + 1,
      color: unit(41) > 0.5 ? '#a855f7' : '#06b6d4',
      duration: 8 + unit(53) * 10,
      delay: -unit(61) * 10,
      driftX: (unit(71) - 0.5) * 30,
    };
  }), []);
  const [sparks, setSparks] = useState<Array<{ id: number; angle: number; distance: number; size: number }>>([]);
  const [glitchTrigger, setGlitchTrigger] = useState<boolean>(false);
  

  // Periodic visual events: trigger a glitch or a bell ring when playing
  useEffect(() => {
    if (!isPlaying) return;

    // Trigger subtle signal glitch every 4 seconds
    const glitchInterval = setInterval(() => {
      setGlitchTrigger(true);
      setTimeout(() => setGlitchTrigger(false), 250);
    }, 4200);

    // Trigger golden bell ring shake every 5 seconds
    const bellInterval = setInterval(() => {
      setIsBellRinging(true);
      setTimeout(() => setIsBellRinging(false), 1200);
    }, 5000);

    return () => {
      clearInterval(glitchInterval);
      clearInterval(bellInterval);
    };
  }, [isPlaying]);

  // Trigger spark bursts on like or subscribe clicks
  const triggerSparks = () => {
    const newSparks = Array.from({ length: 12 }).map((_, i) => ({
      id: Date.now() + i,
      angle: (i / 12) * Math.PI * 2 + (Math.random() * 0.4 - 0.2),
      distance: Math.random() * 40 + 20,
      size: Math.random() * 4 + 2
    }));
    setSparks(newSparks);
    // Auto clear sparks after animation completes
    setTimeout(() => {
      setSparks([]);
    }, 800);
  };

  const patchProperties = (patch: Partial<CyberpunkSubscribeProperties>) => {
    onPropertiesChange?.(patch);
  };

  const handleSubscribeClick = () => {
    patchProperties({ subscribed: !persisted.subscribed });
    triggerSparks();
    setGlitchTrigger(true);
    setTimeout(() => setGlitchTrigger(false), 300);
  };

  const handleLikeClick = () => {
    patchProperties({ liked: !persisted.liked });
    triggerSparks();
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          patchProperties({ customLogoUrl: event.target.result as string });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <>
      <style>{`
        @keyframes cyber-float-particle {
          0% { transform: translate3d(0, 12px, 0); opacity: 0.1; }
          50% { transform: translate3d(var(--cyber-drift-x), -45px, 0); opacity: 0.75; }
          100% { transform: translate3d(calc(var(--cyber-drift-x) * -0.35), -105px, 0); opacity: 0; }
        }
        .cyberpunk-float-particle { animation-name: cyber-float-particle; animation-timing-function: linear; animation-iteration-count: infinite; will-change: transform, opacity; }
        @media (prefers-reduced-motion: reduce) { .cyberpunk-float-particle { animation: none !important; } }
      `}</style>
    <div className="absolute inset-0 w-full h-full bg-[#030408] overflow-hidden flex flex-col items-center justify-between p-4 md:p-6 font-mono text-white select-none">
      
      {/* 1. RETRO CYBERPUNK 3D GRID LAYER */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden opacity-80">
        {/* Sky/Atmosphere Glow */}
        <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-purple-950/20 via-cyan-950/5 to-transparent blur-3xl" />
        
        {/* Horizon glowing light line */}
        <div className="absolute top-1/2 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent blur-[1px] shadow-[0_0_12px_#06b6d4]" />
        
        {/* Perspective 3D Grid container */}
        <div 
          className="absolute inset-0 origin-center"
          style={{ 
            perspective: '250px',
            transformStyle: 'preserve-3d'
          }}
        >
          {/* Neon Purple Grid plane rotating backward on X axis */}
          <motion.div 
            className="absolute inset-0 origin-top bg-repeat"
            style={{ 
              transform: 'rotateX(75deg) translateY(-30%) scale(1.6)',
              backgroundImage: `
                linear-gradient(to right, rgba(168, 85, 247, 0.18) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(168, 85, 247, 0.18) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
              boxShadow: 'inset 0 0 100px rgba(0,0,0,1)'
            }}
            animate={isPlaying ? {
              backgroundPositionY: ['0px', '40px']
            } : {}}
            transition={{
              ease: 'linear',
              duration: 2.2,
              repeat: Infinity
            }}
          />
        </div>

        {/* Ambient floating neon particles */}
        {particles.map(p => (
          <div
            key={p.id}
            className={isPlaying ? 'cyberpunk-float-particle' : ''}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              boxShadow: `0 0 8px ${p.color}`,
              borderRadius: '50%',
              opacity: 0.5 + p.size * 0.15,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              ['--cyber-drift-x' as string]: `${p.driftX}px`,
            }}
          />
        ))}

        {/* Horizontal Retro Scanlines */}
        <div 
          className="absolute inset-0 bg-repeat pointer-events-none opacity-20"
          style={{
            backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)',
            backgroundSize: '100% 4px',
          }}
        />

        {/* Diagonal Screen Mesh overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(rgba(18,16,16,0)_40%,rgba(0,0,0,0.5)_100%)] pointer-events-none" />
      </div>

      {/* 2. TOP HUD: DIAGNOSTICS & SYSTEM READOUTS */}
      <div className="w-full flex justify-between items-start z-10 text-[8px] md:text-[10px] text-cyan-400 font-bold border-b border-cyan-500/15 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-purple-500 animate-pulse" />
          <span className="tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
            SYS_MONITOR // RENDER_ENG_V4
          </span>
        </div>
        
        <div className="hidden sm:flex items-center gap-4 text-purple-400">
          <span className="animate-pulse">● PLAYING_60FPS</span>
          <span>CH_ID: {persisted.channelName.slice(0, 8)}</span>
          <span className="text-gray-500">TIME: {currentTime.toFixed(2)}s</span>
        </div>

        <div className="flex items-center gap-1.5 text-pink-400">
          <Cpu className="w-3.5 h-3.5" />
          <span>CYBER_MODE: ONLINE</span>
        </div>
      </div>

      {/* 3. CENTER PIECE: HOLOGRAPHIC LOGO & CHANNEL TITLE */}
      <div className="flex-1 flex flex-col items-center justify-center z-10 my-4 relative">
        
        {/* Glitch Overlay container */}
        <div className={`relative flex flex-col items-center transition-all ${
          glitchTrigger ? 'skew-x-12 scale-105 filter hue-rotate-90 saturate-200' : ''
        }`}>
          
          {/* Target HUD Brackets */}
          <div className="absolute -inset-6 border-l border-t border-cyan-500/40 w-4 h-4 -translate-x-1 -translate-y-1" />
          <div className="absolute -inset-6 border-r border-t border-cyan-500/40 w-4 h-4 translate-x-1 -translate-y-1 right-0" />
          <div className="absolute -inset-6 border-l border-b border-cyan-500/40 w-4 h-4 -translate-x-1 translate-y-1 bottom-0" />
          <div className="absolute -inset-6 border-r border-b border-cyan-500/40 w-4 h-4 translate-x-1 translate-y-1 bottom-0 right-0" />

          {/* Holographic Outer Ring */}
          <motion.div 
            className="absolute -inset-4 rounded-full border border-dashed border-cyan-400/30"
            animate={{ rotate: 360 }}
            transition={{ ease: 'linear', duration: 15, repeat: Infinity }}
          />
          <motion.div 
            className="absolute -inset-2 rounded-full border-2 border-purple-500/20 border-t-purple-500/60"
            animate={{ rotate: -360 }}
            transition={{ ease: 'linear', duration: 8, repeat: Infinity }}
          />

          {/* Main Logo Container */}
          <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center p-1 bg-black border border-cyan-500/40 shadow-[0_0_25px_rgba(6,182,212,0.15)]">
            
            {/* Pulsing Neon Glow Backing */}
            <motion.div 
              className="absolute inset-0 rounded-full bg-cyan-500/10"
              animate={{ 
                scale: [1, 1.08, 1],
                opacity: [0.3, 0.7, 0.3],
                boxShadow: ['0 0 10px rgba(6,182,212,0.2)', '0 0 25px rgba(6,182,212,0.4)', '0 0 10px rgba(6,182,212,0.2)']
              }}
              transition={{ ease: 'easeInOut', duration: 2, repeat: Infinity }}
            />

            {/* Logo Frame Render */}
            <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-tr ${
              (activeLogoPreset ?? CYBERPUNK_LOGO_PRESETS[0]!).color
            } relative shadow-[inset_0_4px_12px_rgba(0,0,0,0.6)]`}>
              
              {persisted.customLogoUrl ? (
                <img 
                  src={persisted.customLogoUrl} 
                  alt="Custom Channel Logo" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl md:text-5xl filter drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] select-none">
                  {(activeLogoPreset ?? CYBERPUNK_LOGO_PRESETS[0]!).emoji}
                </span>
              )}

              {/* Holographic Glare sweep */}
              <motion.div 
                className="absolute inset-y-0 -left-12 w-8 bg-white/20 skew-x-[35deg] blur-sm pointer-events-none"
                animate={isPlaying ? {
                  left: ['-50%', '150%']
                } : {}}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  repeatDelay: 1.5,
                  ease: 'easeInOut'
                }}
              />
            </div>
          </div>

          {/* Channel Name Text Block */}
          <div className="mt-5 flex flex-col items-center">
            <div className="relative">
              {/* Channel title glow behind */}
              <span className="absolute inset-0 blur-md select-none text-cyan-400 font-extrabold text-sm md:text-base tracking-widest text-center opacity-60">
                {persisted.channelName}
              </span>
              <input 
                type="text" 
                value={channelNameDraft}
                onChange={(e) => setChannelNameDraft(e.target.value.toUpperCase())}
                onBlur={() => patchProperties({ channelName: channelNameDraft })}
                className="relative bg-transparent text-center border-b border-transparent hover:border-cyan-500/20 focus:border-cyan-400 outline-none text-cyan-200 font-black text-sm md:text-base tracking-widest uppercase py-0.5 px-3 max-w-[200px]"
                title="Double click to edit channel name"
              />
            </div>
            
            <div className="flex items-center gap-1.5 text-[8px] tracking-widest text-purple-400 mt-1 uppercase font-bold">
              <span>EST. 2026</span>
              <span>•</span>
              <span className="text-cyan-400">NETRUNNER APPROVED</span>
            </div>
          </div>

        </div>

        {/* Interactive Burst Sparks particles */}
        {sparks.map(spark => (
          <motion.div
            key={spark.id}
            className="absolute w-2 h-2 rounded-full bg-cyan-400"
            style={{
              x: 0,
              y: 0,
              boxShadow: '0 0 10px #00ffcc, 0 0 20px #06b6d4',
            }}
            initial={{ scale: 1, opacity: 1 }}
            animate={{ 
              x: Math.cos(spark.angle) * spark.distance,
              y: Math.sin(spark.angle) * spark.distance,
              scale: 0.1,
              opacity: 0
            }}
            transition={{ ease: 'easeOut', duration: 0.65 }}
          />
        ))}

      </div>

      {/* 4. ACTIONS AREA: 3D LIKE, FLICKERING SUBSCRIBE, SHAKING GOLDEN BELL */}
      <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 z-10 py-3 px-4 border-t border-cyan-500/15">
        
        {/* LEFT ACTION: 3D THUMBS UP */}
        <motion.button
          onClick={handleLikeClick}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border font-bold text-xs tracking-widest uppercase transition-all shadow-[0_4px_12px_rgba(0,0,0,0.5)] cursor-pointer select-none active:scale-95 ${
            persisted.liked 
              ? 'bg-[#00ffcc]/10 border-[#00ffcc] text-[#00ffcc] shadow-[0_0_15px_rgba(0,255,204,0.2)]' 
              : 'bg-black/40 border-cyan-500/30 text-cyan-400 hover:border-cyan-400 hover:shadow-[0_0_10px_rgba(6,182,212,0.15)]'
          }`}
          whileHover={{ y: -2 }}
        >
          <motion.div
            animate={persisted.liked ? {
              scale: [1, 1.4, 0.9, 1.1, 1],
              rotate: [0, -15, 10, -5, 0]
            } : {
              rotateY: isPlaying ? [0, 360] : 0
            }}
            transition={{ duration: 0.5, repeat: persisted.liked ? 0 : Infinity, repeatDelay: 6 }}
          >
            <ThumbsUp className={`w-4 h-4 ${persisted.liked ? 'fill-current' : ''}`} />
          </motion.div>
          <span>{persisted.liked ? 'LIKED' : 'LIKE'}</span>
        </motion.button>

        {/* CENTER ACTION: FLICKERING PINK SUBSCRIBE */}
        <div className="relative group">
          {/* Neon Pink Button glow back */}
          <div className={`absolute -inset-1 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 blur-sm opacity-40 group-hover:opacity-100 transition-all duration-300 ${
            persisted.subscribed ? 'from-emerald-400 to-cyan-500' : ''
          }`} />

          <button
            onClick={handleSubscribeClick}
            className={`relative px-8 py-3 rounded-xl font-black text-sm tracking-widest uppercase shadow-2xl transition-all border-2 select-none cursor-pointer active:scale-95 flex items-center gap-2 ${
              persisted.subscribed
                ? 'bg-[#00ffcc] border-[#00ffcc] text-black font-black shadow-[0_0_20px_rgba(0,255,204,0.4)]'
                : 'bg-gradient-to-r from-[#ff007f] to-purple-600 border-[#ff007f]/50 text-white animate-flicker font-black hover:border-pink-400'
            }`}
            style={{
              textShadow: persisted.subscribed ? 'none' : '0 2px 8px rgba(255,0,127,0.8)'
            }}
          >
            {persisted.subscribed ? (
              <>
                <Check className="w-4 h-4 stroke-[3px]" />
                <span>SUBSCRIBED</span>
              </>
            ) : (
              <>
                <motion.span 
                  animate={isPlaying ? { opacity: [1, 0.3, 1, 0.8, 0.2, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                  className="mr-0.5"
                >
                  ⚡
                </motion.span>
                <span>SUBSCRIBE</span>
              </>
            )}
          </button>
        </div>

        {/* RIGHT ACTION: SHAKING GOLDEN BELL */}
        <motion.button
          onClick={() => {
            patchProperties({ notificationsEnabled: !persisted.notificationsEnabled });
            setIsBellRinging(true);
            triggerSparks();
            setTimeout(() => setIsBellRinging(false), 1200);
          }}
          className={`relative flex items-center justify-center p-3 rounded-xl border shadow-[0_4px_12px_rgba(0,0,0,0.5)] cursor-pointer select-none active:scale-95 ${
            persisted.subscribed 
              ? 'bg-amber-400/10 border-amber-400 text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.2)]'
              : 'bg-black/40 border-yellow-600/30 text-yellow-600 hover:border-yellow-400 hover:text-yellow-400'
          }`}
          whileHover={{ y: -2 }}
          title="Turn on notifications"
        >
          {/* Bell Rings Light Trail circles */}
          <AnimatePresence>
            {isBellRinging && (
              <>
                <motion.div 
                  className="absolute inset-0 rounded-xl border border-amber-400/80 pointer-events-none"
                  initial={{ scale: 1, opacity: 1 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.65 }}
                />
                <motion.div 
                  className="absolute inset-0 rounded-xl border border-amber-400/30 pointer-events-none"
                  initial={{ scale: 1, opacity: 1 }}
                  animate={{ scale: 2.6, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.9, delay: 0.15 }}
                />
              </>
            )}
          </AnimatePresence>

          <motion.div
            animate={isBellRinging ? {
              rotate: [-20, 20, -20, 20, -10, 10, -5, 5, 0],
              scale: [1, 1.25, 1.25, 1]
            } : {}}
            transition={{ duration: 0.75 }}
          >
            <Bell className={`w-4 h-4 ${persisted.subscribed || persisted.notificationsEnabled || isBellRinging ? 'fill-current' : ''}`} />
          </motion.div>
        </motion.button>

      </div>

      {/* 5. BOTTOM BAR: LOGO SWAPPER & CUSTOMIZATION RAIL */}
      <div className="w-full mt-2 flex flex-col md:flex-row items-center justify-between gap-2 bg-black/60 border border-cyan-500/10 rounded-xl p-2.5 z-10 text-[9px] md:text-[10px]">
        <div className="flex flex-wrap items-center gap-1.5" id="presets_row">
          <span className="text-gray-400 uppercase font-bold tracking-wider mr-1">Choose Logo:</span>
          {CYBERPUNK_LOGO_PRESETS.map((logo) => (
            <button
              key={logo.id}
              onClick={() => {
                patchProperties({ logoPresetId: logo.id, customLogoUrl: null });
                triggerSparks();
              }}
              className={`px-2 py-1 rounded border transition-colors cursor-pointer ${
                persisted.logoPresetId === logo.id && !persisted.customLogoUrl
                  ? 'bg-purple-600/30 border-purple-500 text-purple-300 font-bold'
                  : 'bg-white/[0.02] border-white/5 text-gray-400 hover:text-white'
              }`}
              title={`Switch channel emblem to ${logo.name}`}
            >
              {logo.emoji} {logo.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3.5 mt-1 md:mt-0" id="controls_row">
          {/* Custom logo file uploader */}
          <label className="flex items-center gap-1 bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/30 text-cyan-400 px-2.5 py-1 rounded cursor-pointer transition-colors font-bold uppercase tracking-wider">
            <Upload className="w-3 h-3" />
            <span>Upload custom</span>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleLogoUpload} 
              className="hidden" 
            />
          </label>

          {/* Preset randomizer */}
          <button
            onClick={() => {
              const currentIndex = Math.max(0, CYBERPUNK_LOGO_PRESETS.findIndex((logo) => logo.id === persisted.logoPresetId));
              const nextLogo = CYBERPUNK_LOGO_PRESETS[(currentIndex + 1) % CYBERPUNK_LOGO_PRESETS.length];
              if (nextLogo) patchProperties({ logoPresetId: nextLogo.id, customLogoUrl: null });
              triggerSparks();
            }}
            className="flex items-center gap-1 bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-gray-300 px-2 py-1 rounded cursor-pointer transition-colors"
            title="Randomize style preset"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Embedded CSS for flicker animations and high-tech styling */}
      <style>{`
        @keyframes flicker {
          0%, 19.999%, 22%, 62.999%, 64%, 64.999%, 70%, 100% {
            opacity: 1;
            filter: drop-shadow(0 0 4px #ff007f) drop-shadow(0 0 12px #ff007f) drop-shadow(0 0 30px rgba(255,0,127,0.6));
          }
          20%, 21.999%, 63%, 63.999%, 65%, 69.999% {
            opacity: 0.35;
            filter: none;
          }
        }
        .animate-flicker {
          animation: flicker 4s infinite;
        }
        input::selection {
          background: rgba(6, 182, 212, 0.4);
          color: white;
        }
      `}</style>

    </div>
    </>
  );
};

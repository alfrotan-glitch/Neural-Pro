import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ThumbsUp, Bell, Check, Heart, Play, Star, Terminal, Upload } from 'lucide-react';
import AnimationController from '../subscribe-generator/AnimationController';
import { SubscribePropertiesProvider } from '../subscribe-generator/SubscribePropertiesContext';
import { getCustomSubscribeAnimationStage } from '../../core/engine/customSubscribeRenderModel';

interface SubscribeTemplateProps {
  templateId: string;
  isPlaying?: boolean;
  currentTime?: number;
  properties?: any;
  onPropertiesChange?: (patch: any) => void;
}

export const SubscribeTemplates: React.FC<SubscribeTemplateProps> = ({ 
  templateId, 
  isPlaying = false, 
  currentTime = 0,
  properties = {},
  onPropertiesChange
}) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [bellState, setBellState] = useState<'none' | 'all' | 'personalized'>('none');
  const [bellRinging, setBellRinging] = useState(false);
  const [subCount, setSubCount] = useState(128450);

  // States for the customizable Neon Capsule template
  const channelTitle = properties.channelTitle || properties.name || 'English Unleashed';
  const channelSubtitle = properties.channelSubtitle || properties.subtitle || 'Subscribe Us';
  const uploadedLogo = properties.logoImage || null;

  const updateProperty = (key: string, value: any) => {
    if (onPropertiesChange) {
      onPropertiesChange({ [key]: value });
    }
  };


  // Auto trigger subtle movements or indicators when playing
  useEffect(() => {
    if (!isPlaying) return;
    
    // Auto ring bells periodically
    const bellInterval = setInterval(() => {
      setBellRinging(true);
      setTimeout(() => setBellRinging(false), 800);
    }, 4500);

    return () => clearInterval(bellInterval);
  }, [isPlaying]);

  const handleSubscribe = () => {
    setIsSubscribed(!isSubscribed);
    setSubCount(prev => isSubscribed ? prev - 1 : prev + 1);
  };

  switch (templateId) {
    case 'st_custom_subscribe':
    case 'ef_custom_subscribe':
      return (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center p-4 bg-transparent select-none overflow-hidden">
          <div className="transform scale-[0.85] md:scale-[1.15] origin-center w-full flex items-center justify-center">
            <SubscribePropertiesProvider
              properties={properties}
              runtime={{
                animationStage: getCustomSubscribeAnimationStage(
                  currentTime,
                  Number(properties?.animationSpeed ?? 1),
                ),
                isPlaying,
              }}
            >
              <AnimationController />
            </SubscribePropertiesProvider>
          </div>
        </div>
      );

    case 'st_neon_capsule':
    case 'ef_neon_capsule':
      return (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center p-4 bg-transparent select-none overflow-hidden font-sans">
          {/* Main capsule container with gradient glowing border */}
          <div className="relative w-full max-w-4xl h-24 md:h-28 rounded-full p-[2px] bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-400 shadow-[0_0_20px_rgba(236,72,153,0.35),_0_0_30px_rgba(6,182,212,0.35)]">
            
            {/* Transparent inner backplate */}
            <div className="w-full h-full rounded-full bg-[#0d0f19]/45 backdrop-blur-md flex items-center justify-between px-6 py-2 relative">
              
              {/* Scanline overlay for cyber feel */}
              <div 
                className="absolute inset-0 rounded-full bg-repeat pointer-events-none opacity-[0.07]"
                style={{
                  backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0) 50%, rgba(0, 0, 0, 0.4) 50%)',
                  backgroundSize: '100% 4px',
                }}
              />

              {/* LEFT: LOGO SPOT (glowing circle) */}
              <div className="flex items-center gap-4 z-10">
                <div className="relative group">
                  {/* Circular pink glowing frame */}
                  <label className="relative w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center border-2 border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.4)] bg-black/60 overflow-hidden cursor-pointer hover:scale-105 transition-all">
                    {uploadedLogo ? (
                      <img 
                        src={uploadedLogo} 
                        alt="Channel Logo" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-2xl md:text-3xl filter drop-shadow-[0_2px_8px_rgba(236,72,153,0.6)]">🎧</span>
                    )}

                    {/* Hover upload overlay */}
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[8px] text-pink-400 font-bold uppercase tracking-wider">
                      <Upload className="w-4 h-4 mb-0.5 text-pink-400" />
                      <span>Upload</span>
                    </div>

                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            if (event.target?.result) {
                              updateProperty("logoImage", event.target.result as string);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }} 
                      className="hidden" 
                    />
                  </label>
                </div>

                {/* MIDDLE: EDITABLE TEXTS */}
                <div className="flex flex-col text-left">
                  <input 
                    type="text" 
                    value={channelTitle} 
                    onChange={(e) => updateProperty("channelTitle", e.target.value)}
                    className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-pink-500 outline-none text-white text-sm md:text-lg font-bold tracking-wide py-0.5 w-full max-w-[150px] sm:max-w-[220px]"
                    title="Click to edit Title"
                    placeholder="English Unleashed"
                  />
                  <input 
                    type="text" 
                    value={channelSubtitle} 
                    onChange={(e) => updateProperty("channelSubtitle", e.target.value)}
                    className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-cyan-400 outline-none text-gray-300 text-[10px] md:text-xs font-semibold tracking-widest uppercase py-0.5 w-full max-w-[150px] sm:max-w-[220px] mt-0.5"
                    title="Click to edit Subtitle"
                    placeholder="Subscribe Us"
                  />
                </div>
              </div>

              {/* RIGHT: ACTIONS (Like, Subscribe, Bell) */}
              <div className="flex items-center gap-3 z-10">
                {/* LIKE BUTTON (glowing cyan outline) */}
                <button
                  onClick={() => setIsLiked(!isLiked)}
                  className={`flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-full border text-[9px] md:text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    isLiked
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                      : 'bg-black/40 border-cyan-500/30 text-cyan-500/70 hover:border-cyan-400 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  }`}
                >
                  <ThumbsUp className={`w-3.5 h-3.5 ${isLiked ? 'fill-current text-cyan-400' : ''}`} />
                  <span>{isLiked ? 'LIKED' : 'LIKE'}</span>
                </button>

                {/* SUBSCRIBE BUTTON (glowing red button with arrow pointer) */}
                <div className="relative group">
                  <button
                    onClick={handleSubscribe}
                    className={`px-5 md:px-6 py-2 md:py-2.5 rounded-full text-[10px] md:text-xs font-black tracking-widest uppercase transition-all border cursor-pointer select-none relative ${
                      isSubscribed
                        ? 'bg-[#12131a] border-[#00ffcc] text-[#00ffcc] shadow-[0_0_15px_rgba(0,255,204,0.35)]'
                        : 'bg-red-600 border-red-500 text-white hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.45)]'
                    }`}
                  >
                    {isSubscribed ? 'SUBSCRIBED' : 'SUBSCRIBE'}
                  </button>

                  {/* Animated click arrow indicator (cursor pointer) */}
                  {!isSubscribed && isPlaying && (
                    <motion.div
                      className="absolute -bottom-2 right-1 pointer-events-none"
                      animate={{
                        x: [15, -5, 15],
                        y: [15, -3, 15],
                        scale: [1, 0.9, 1]
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 3.5,
                        ease: 'easeInOut'
                      }}
                    >
                      {/* White mouse cursor */}
                      <svg className="w-5 h-5 drop-shadow-[0_2px_5px_rgba(0,0,0,0.5)]" viewBox="0 0 24 24" fill="none">
                        <path d="M4.5 3V17 L9.5 12.5 H16.5 L4.5 3 Z" fill="white" stroke="black" strokeWidth="2" strokeLinejoin="miter" />
                      </svg>
                    </motion.div>
                  )}
                </div>

                {/* NOTIFICATION BELL */}
                <button
                  onClick={() => {
                    setBellState(bellState === 'all' ? 'none' : 'all');
                    setBellRinging(true);
                    setTimeout(() => setBellRinging(false), 850);
                  }}
                  className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center border-2 transition-all cursor-pointer ${
                    bellState === 'all'
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.35)]'
                      : 'bg-black/40 border-pink-500/30 text-pink-500/70 hover:border-pink-500 hover:text-pink-400 hover:shadow-[0_0_10px_rgba(236,72,153,0.2)]'
                  }`}
                >
                  <motion.div
                    animate={bellRinging ? {
                      rotate: [-15, 15, -15, 15, -8, 8, 0],
                      scale: [1, 1.2, 1.2, 1]
                    } : {}}
                    transition={{ duration: 0.6 }}
                  >
                    <Bell className={`w-4 h-4 ${bellState === 'all' ? 'fill-current' : ''}`} />
                  </motion.div>
                </button>
              </div>

            </div>
          </div>
        </div>
      );

    case 'st_neon_outrun':
    case 'ef_neon_outrun':
      return (
        <div className="absolute inset-0 w-full h-full bg-[#0a0518] flex flex-col items-center justify-between p-6 overflow-hidden font-sans border border-pink-500/30 rounded-lg">
          {/* Wireframe neon pink sun background */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full bg-gradient-to-t from-yellow-500 via-pink-600 to-transparent opacity-10 pointer-events-none" />
          
          {/* Glowing wireframe landscape */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(rgba(236,72,153,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(236,72,153,0.1)_1px,transparent_1px)] bg-[size:20px_20px] [transform:rotateX(60deg)] origin-bottom opacity-40 pointer-events-none" />

          {/* Top Info Header */}
          <div className="w-full flex justify-between items-center z-10 text-[9px] text-pink-400 font-mono tracking-widest uppercase">
            <span>// SYNTH_WAVE //</span>
            <span className="animate-pulse">● OUTRUN ACTIVE</span>
          </div>

          {/* Center Sun & Title */}
          <div className="flex-1 flex flex-col items-center justify-center z-10 my-2 relative">
            <motion.div
              animate={isPlaying ? { rotate: 360 } : {}}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
              className="w-14 h-14 rounded-full border border-dashed border-pink-500/30 absolute -z-10"
            />
            
            <div className="text-3xl mb-1 filter drop-shadow-[0_0_8px_rgba(236,72,153,0.6)]">🌌</div>
            <h4 className="text-sm font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 uppercase">
              RETRO_OUTRUN
            </h4>
            <p className="text-[8px] text-gray-400 font-mono mt-0.5 tracking-wider">EST. 1988 • CODESWEEP</p>
          </div>

          {/* Actions Bar */}
          <div className="w-full flex items-center justify-center gap-3 z-10">
            {/* Like */}
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-mono tracking-widest transition-all ${
                isLiked 
                  ? 'bg-pink-500/20 border-pink-500 text-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.3)]' 
                  : 'bg-black/40 border-pink-500/20 text-pink-500/70 hover:border-pink-500/50'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current text-pink-500' : ''}`} />
              <span>{isLiked ? 'FAV' : 'FAVORITE'}</span>
            </button>

            {/* Subscribe */}
            <button 
              onClick={handleSubscribe}
              className={`relative px-5 py-2 rounded-lg font-black text-[10px] tracking-widest transition-all uppercase border ${
                isSubscribed 
                  ? 'bg-cyan-400 text-black border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]' 
                  : 'bg-transparent border-pink-500 text-pink-400 shadow-[0_0_12px_rgba(236,72,153,0.2)] hover:bg-pink-500 hover:text-white'
              }`}
            >
              {isSubscribed ? 'SUBSCRIBED' : 'SUBSCRIBE'}
            </button>

            {/* Bell */}
            <button 
              onClick={() => {
                setBellState(bellState === 'all' ? 'none' : 'all');
                setBellRinging(true);
                setTimeout(() => setBellRinging(false), 800);
              }}
              className={`p-2 rounded-lg border transition-all ${
                bellState === 'all'
                  ? 'bg-purple-600/30 border-purple-500 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                  : 'bg-black/40 border-purple-500/20 text-purple-500/60'
              }`}
            >
              <motion.div
                animate={bellRinging ? { rotate: [-15, 15, -15, 15, 0] } : {}}
                transition={{ duration: 0.5 }}
              >
                <Bell className={`w-3.5 h-3.5 ${bellState === 'all' ? 'fill-current' : ''}`} />
              </motion.div>
            </button>
          </div>
        </div>
      );

    case 'st_glass_minimal':
    case 'ef_glass_minimal':
      return (
        <div className="absolute inset-0 w-full h-full bg-[#03060f] flex flex-col items-center justify-between p-6 overflow-hidden border border-white/10 rounded-lg">
          {/* Subtle colored blobs moving in the background */}
          <div className="absolute top-[-10%] left-[-10%] w-36 h-36 rounded-full bg-blue-500/10 blur-[40px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-36 h-36 rounded-full bg-cyan-500/10 blur-[40px] pointer-events-none" />

          {/* Minimal glass container */}
          <div className="absolute inset-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl pointer-events-none" />

          {/* Top line indicator */}
          <div className="w-full flex justify-between items-center z-10 text-[8px] text-gray-500 font-sans tracking-widest uppercase px-2">
            <span>PREMIUM EXPERIENCE</span>
            <span>CH_NO // 204</span>
          </div>

          {/* Minimalist Logo */}
          <div className="flex-1 flex flex-col items-center justify-center z-10 my-2 relative">
            <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/[0.02] shadow-[inset_0_2px_10px_rgba(255,255,255,0.05)]">
              <span className="text-xl filter drop-shadow-[0_2px_8px_rgba(255,255,255,0.2)]">💎</span>
            </div>
            <h4 className="text-xs font-semibold tracking-[0.3em] text-white uppercase mt-2.5">
              GLASSM_STUDIO
            </h4>
            <p className="text-[7.5px] text-gray-500 font-sans mt-0.5 tracking-widest uppercase">Creative Design Hub</p>
          </div>

          {/* Flat Glass Actions */}
          <div className="w-full flex items-center justify-center gap-3.5 z-10 px-2 pb-1">
            <button
              onClick={() => setIsLiked(!isLiked)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[8.5px] tracking-wider font-medium transition-all ${
                isLiked 
                  ? 'bg-white/10 border-white/40 text-white' 
                  : 'bg-transparent border-white/10 text-gray-400 hover:text-white hover:border-white/25'
              }`}
            >
              <ThumbsUp className="w-3 h-3" />
              <span>{isLiked ? 'LIKED' : 'LIKE'}</span>
            </button>

            <button
              onClick={handleSubscribe}
              className={`px-5 py-2 rounded-lg text-[9px] font-bold tracking-widest uppercase transition-all border ${
                isSubscribed
                  ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.15)]'
                  : 'bg-transparent border-white/20 text-white hover:bg-white hover:text-black'
              }`}
            >
              {isSubscribed ? 'SUBSCRIBED' : 'SUBSCRIBE'}
            </button>

            <button
              onClick={() => {
                setBellState(bellState === 'all' ? 'none' : 'all');
                setBellRinging(true);
                setTimeout(() => setBellRinging(false), 800);
              }}
              className={`p-2 rounded-lg border transition-all ${
                bellState === 'all'
                  ? 'bg-white/10 border-white/40 text-white'
                  : 'bg-transparent border-white/10 text-gray-400 hover:text-white hover:border-white/25'
              }`}
            >
              <motion.div
                animate={bellRinging ? { scale: [1, 1.2, 0.9, 1.1, 1] } : {}}
                transition={{ duration: 0.4 }}
              >
                <Bell className={`w-3.5 h-3.5 ${bellState === 'all' ? 'fill-current' : ''}`} />
              </motion.div>
            </button>
          </div>
        </div>
      );

    case 'st_classic_youtube':
    case 'ef_classic_youtube':
      return (
        <div className="absolute inset-0 w-full h-full bg-[#0f0f0f] flex flex-col justify-between p-5 rounded-lg border border-red-600/15 overflow-hidden font-sans">
          {/* Classic YouTube banner background design */}
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-red-600/5 rounded-full blur-[30px]" />
          
          {/* Top title bar */}
          <div className="w-full flex justify-between items-center text-[8.5px] text-gray-500 font-semibold uppercase border-b border-white/[0.04] pb-2">
            <span>SOCIAL CREATOR OVERLAY</span>
            <span className="text-red-500 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE STREAM
            </span>
          </div>

          {/* Main User Profile card */}
          <div className="flex items-center gap-3.5 my-2.5 bg-[#1a1a1a]/40 p-3 rounded-xl border border-white/[0.03]">
            <div className="relative">
              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-rose-500 to-red-600 flex items-center justify-center border-2 border-[#0f0f0f] shadow-lg">
                <span className="text-2xl">🔔</span>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border border-[#0f0f0f]" />
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-white tracking-wide truncate">CREATOR_PRO</h4>
              <p className="text-[9px] text-gray-400 mt-0.5 flex items-center gap-1">
                <span className="text-white font-semibold">
                  {subCount.toLocaleString()}
                </span>
                <span>subscribers</span>
              </p>
            </div>
          </div>

          {/* Social controls bar */}
          <div className="w-full flex items-center gap-2">
            {/* Like */}
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[9px] font-semibold tracking-wider transition-all ${
                isLiked 
                  ? 'bg-red-600 text-white shadow-[0_0_12px_rgba(220,38,38,0.3)]' 
                  : 'bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]'
              }`}
            >
              <ThumbsUp className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
              <span>{isLiked ? 'LIKED' : 'LIKE'}</span>
            </button>

            {/* Subscribe red button */}
            <button
              onClick={handleSubscribe}
              className={`flex-[1.5] py-1.5 rounded-lg text-[9px] font-bold tracking-widest uppercase transition-all text-center ${
                isSubscribed 
                  ? 'bg-[#272727] text-gray-300 hover:bg-[#3f3f3f]' 
                  : 'bg-red-600 text-white hover:bg-red-500 shadow-[0_0_15px_rgba(220,38,38,0.35)]'
              }`}
            >
              {isSubscribed ? 'SUBSCRIBED' : 'SUBSCRIBE'}
            </button>

            {/* Notification Bell */}
            <button 
              onClick={() => {
                setBellState(bellState === 'all' ? 'none' : 'all');
                setBellRinging(true);
                setTimeout(() => setBellRinging(false), 800);
              }}
              className={`p-2 rounded-lg transition-all ${
                bellState === 'all' 
                  ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.3)]' 
                  : 'bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]'
              }`}
            >
              <motion.div
                animate={bellRinging ? { rotate: [-10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.5 }}
              >
                <Bell className={`w-3.5 h-3.5 ${bellState === 'all' ? 'fill-current' : ''}`} />
              </motion.div>
            </button>
          </div>
        </div>
      );

    case 'st_matrix_glitch':
    case 'ef_matrix_glitch':
      return (
        <div className="absolute inset-0 w-full h-full bg-[#020d04] flex flex-col justify-between p-5 rounded-lg border border-green-500/20 overflow-hidden font-mono text-green-500">
          
          {/* Hacker Terminal Grid Background */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-[0.08]"
            style={{
              backgroundImage: 'linear-gradient(rgba(16, 185, 129, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.15) 1px, transparent 1px)',
              backgroundSize: '15px 15px',
            }}
          />

          {/* Header Code readouts */}
          <div className="w-full flex justify-between items-center text-[7.5px] border-b border-green-500/20 pb-1.5">
            <span className="flex items-center gap-1">
              <Terminal className="w-3 h-3 text-green-400" /> SYSTEM://NETROOT_GATEWAY
            </span>
            <span className="animate-pulse text-green-400">● SECURITY: HIGH</span>
          </div>

          {/* Matrix Glitch Log Area */}
          <div className="my-2 p-2 bg-black/60 rounded border border-green-500/10 text-left space-y-1 overflow-hidden flex-1 flex flex-col justify-center">
            <p className="text-[7px] text-green-400/70 truncate">// ESTABLISHING COMPILER SESSION...</p>
            <p className="text-[7.5px] text-green-300 font-semibold truncate">&gt; CONNECTING SECURE_STATION_A51</p>
            <p className="text-[7.5px] text-green-400 font-bold truncate">&gt; SUBSCRIBE_COMMAND: {isSubscribed ? 'COMPLETED' : 'PENDING'}</p>
          </div>

          {/* Terminal styled actions row */}
          <div className="w-full flex gap-2">
            <button
              onClick={() => setIsLiked(!isLiked)}
              className={`flex-1 py-1.5 rounded border text-[8px] font-bold tracking-widest transition-all ${
                isLiked 
                  ? 'bg-green-500/20 border-green-400 text-green-300 shadow-[0_0_10px_rgba(34,197,94,0.3)]' 
                  : 'bg-black/80 border-green-500/20 text-green-500/60 hover:border-green-500/50'
              }`}
            >
              {isLiked ? '[ LIKED ]' : '[ LIKE ]'}
            </button>

            <button
              onClick={handleSubscribe}
              className={`flex-[1.5] py-1.5 rounded font-black text-[8.5px] tracking-widest uppercase border transition-all ${
                isSubscribed 
                  ? 'bg-green-500 text-black border-green-500 font-bold shadow-[0_0_15px_rgba(34,197,94,0.4)]' 
                  : 'bg-transparent border-green-500 text-green-400 hover:bg-green-500 hover:text-black shadow-[0_0_8px_rgba(34,197,94,0.15)]'
              }`}
            >
              {isSubscribed ? '★ VERIFIED' : '★ SUBSCRIBE'}
            </button>

            <button
              onClick={() => {
                setBellState(bellState === 'all' ? 'none' : 'all');
                setBellRinging(true);
                setTimeout(() => setBellRinging(false), 800);
              }}
              className={`px-2.5 py-1.5 rounded border transition-all ${
                bellState === 'all'
                  ? 'bg-green-500/30 border-green-400 text-green-300'
                  : 'bg-black/80 border-green-500/20 text-green-500/60'
              }`}
            >
              <motion.div
                animate={bellRinging ? { rotateY: [0, 180, 360] } : {}}
                transition={{ duration: 0.6 }}
              >
                <Bell className="w-3.5 h-3.5" />
              </motion.div>
            </button>
          </div>
        </div>
      );

    default:
      return (
        <div className="absolute inset-0 bg-pink-500/10 border border-pink-500/30 flex flex-col items-center justify-center p-6 text-white text-center rounded-lg">
          <div className="text-4xl mb-2">🔔</div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-pink-500">Subscribe</h3>
          <p className="text-[10px] text-gray-400 mt-1 italic">Social Subscribe Interaction Overlay</p>
        </div>
      );
  }
};

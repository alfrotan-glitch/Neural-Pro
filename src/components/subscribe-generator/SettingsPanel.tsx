import React, { useRef } from 'react';
import { useSubscribeStore } from '../../store/useSubscribeStore';
import { useProjectStore } from '../../store/useProjectStore';
import { createTrackSnapshotCommand } from '../../features/video-studio/project/commands';
import { createDedicatedTimelineTrack, smartInsertClip } from '../../features/video-studio/project/services/projectService';
import { Upload, Download, Settings, RefreshCw, Video } from 'lucide-react';

const SettingsPanel: React.FC = () => {
  const { 
    brandName, setBrandName, 
    fontFamily, setFontFamily,
    fontWeight, setFontWeight,
    fontSize, setFontSize,
    letterSpacing, setLetterSpacing,
    theme, setTheme,
    animationSpeed, setAnimationSpeed,
    colors, setColors, 
    setIsEditorOpen, setTempLogoImage 
  } = useSubscribeStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTransferToStudio = () => {
    const { tracks, executeCommand, currentTime, showToast, setSelectedNodeIds } = useProjectStore.getState();
    const subStore = useSubscribeStore.getState();
    
    const id = `custom_sub_${Date.now()}`;
    const startAt = currentTime;
    
    const newClip: any = {
      id,
      sourceId: 'ef_custom_subscribe',
      type: 'effect',
      startAt,
      duration: 11.0, // length of sequence
      trim: { in: 0, out: 11.0 },
      transform: { x: 0, y: 30, scale: 65, rotation: 0, opacity: 100 },
      properties: { 
        name: `${subStore.brandName} Custom Subscribe Overlay`, 
        color: 'from-emerald-500 to-teal-600', 
        thumbnail: '🔔',
        brandName: subStore.brandName,
        fontFamily: subStore.fontFamily,
        fontWeight: subStore.fontWeight,
        fontSize: subStore.fontSize,
        letterSpacing: subStore.letterSpacing,
        logoImage: subStore.logoImage,
        theme: subStore.theme,
        colors: subStore.colors,
        cursorStyle: subStore.cursorStyle,
        buttonStyle: subStore.buttonStyle,
        animationStyle: subStore.animationStyle,
        animationSpeed: subStore.animationSpeed
      }
    };

    // Smart placement: use existing compatible track if no collision, or create dedicated row
    const { tracks: newTracks } = smartInsertClip(tracks, 'subscribe', newClip);

    executeCommand(createTrackSnapshotCommand('Add Subscribe Overlay', tracks, newTracks));
    setSelectedNodeIds([id]);
    
    // Switch view mode to video (Video Studio)
    if (typeof (window as any).setViewMode === 'function') {
      (window as any).setViewMode('video');
    }
    
    // Show a toast inside the Video Studio
    showToast(`✅ Custom Subscribe Overlay added to timeline!`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setTempLogoImage(e.target?.result as string);
        setIsEditorOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleColorChange = (key: keyof typeof colors, value: string) => {
    setColors({ [key]: value });
  };

  const applyTheme = (selectedTheme: string) => {
    setTheme(selectedTheme);
    // Apply preset colors based on theme
    switch (selectedTheme) {
      case 'Classic YouTube':
        setColors({ primaryColor: '#ffffff', secondaryColor: '#aaaaaa', logoGlow: '#ffffff', borderColor: '#ffffff', brandNameColor: '#ffffff', subscribeColor: '#ff0000', likeColor: '#ffffff', bellColor: '#ffffff', shadow: '#000000', outline: '#333333' });
        setFontFamily('Inter');
        setFontWeight('700');
        break;
      case 'Neon Blue':
        setColors({ primaryColor: '#00f3ff', secondaryColor: '#0088ff', logoGlow: '#00f3ff', borderColor: '#00f3ff', brandNameColor: '#00f3ff', subscribeColor: '#0088ff', likeColor: '#00f3ff', bellColor: '#00f3ff', shadow: '#00f3ff', outline: '#0088ff' });
        setFontFamily('JetBrains Mono');
        setFontWeight('600');
        break;
      case 'Neon Purple':
        setColors({ primaryColor: '#b500ff', secondaryColor: '#7a00ff', logoGlow: '#b500ff', borderColor: '#b500ff', brandNameColor: '#b500ff', subscribeColor: '#7a00ff', likeColor: '#b500ff', bellColor: '#b500ff', shadow: '#b500ff', outline: '#7a00ff' });
        setFontFamily('Space Grotesk');
        setFontWeight('700');
        break;
      case 'Cyberpunk':
        setColors({ primaryColor: '#fcee0a', secondaryColor: '#ff003c', logoGlow: '#fcee0a', borderColor: '#00f0ff', brandNameColor: '#fcee0a', subscribeColor: '#ff003c', likeColor: '#00f0ff', bellColor: '#fcee0a', shadow: '#ff003c', outline: '#fcee0a' });
        setFontFamily('JetBrains Mono');
        setFontWeight('800');
        break;
      case 'Minimal White':
        setColors({ primaryColor: '#ffffff', secondaryColor: '#e4e4e7', logoGlow: '#ffffff', borderColor: '#e4e4e7', brandNameColor: '#ffffff', subscribeColor: '#ffffff', likeColor: '#ffffff', bellColor: '#ffffff', shadow: '#ffffff', outline: '#e4e4e7' });
        setFontFamily('Inter');
        setFontWeight('400');
        break;
      case 'Pro Dark':
        setColors({ primaryColor: '#f3f4f6', secondaryColor: '#9ca3af', logoGlow: '#3b82f6', borderColor: '#374151', brandNameColor: '#f9fafb', subscribeColor: '#ef4444', likeColor: '#3b82f6', bellColor: '#f59e0b', shadow: '#000000', outline: '#1f2937' });
        setFontFamily('Inter');
        setFontWeight('600');
        break;
      case 'Gold Luxury':
        setColors({ primaryColor: '#fbbf24', secondaryColor: '#d97706', logoGlow: '#f59e0b', borderColor: '#b45309', brandNameColor: '#fef3c7', subscribeColor: '#d97706', likeColor: '#fbbf24', bellColor: '#fcd34d', shadow: '#451a03', outline: '#78350f' });
        setFontFamily('Playfair Display');
        setFontWeight('700');
        break;
      case 'Holographic':
        setColors({ primaryColor: '#e879f9', secondaryColor: '#38bdf8', logoGlow: '#c084fc', borderColor: '#2dd4bf', brandNameColor: '#f8fafc', subscribeColor: '#a855f7', likeColor: '#60a5fa', bellColor: '#34d399', shadow: '#172554', outline: '#3b0764' });
        setFontFamily('Space Grotesk');
        setFontWeight('800');
        break;
    }
  };

  const triggerExport = (format: string) => {
    if (typeof (window as any).triggerExport === 'function') {
      (window as any).triggerExport(format);
    }
  };

  return (
    <div className="w-[340px] border-l border-white/10 bg-zinc-900 overflow-y-auto flex flex-col z-20">
      <div className="p-5 border-b border-white/10 flex items-center gap-2 sticky top-0 bg-zinc-900/95 backdrop-blur z-10">
        <Settings className="w-5 h-5 text-gray-400" />
        <h2 className="font-semibold text-lg">Properties</h2>
      </div>

      <div className="p-5 space-y-8">
        
        {/* Logo Section */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Logo Configuration</label>
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-3 rounded-lg border border-dashed border-white/20 hover:border-emerald-500/50 hover:bg-emerald-500/5 flex items-center justify-center gap-2 transition"
            >
              <Upload className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium text-gray-300">Upload Logo</span>
            </button>
            <button
              onClick={() => setIsEditorOpen(true)}
              className="px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition flex items-center justify-center gap-2 text-sm font-medium text-gray-300"
            >
              <RefreshCw className="w-4 h-4" /> Edit
            </button>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
          </div>
        </div>

        {/* Theme Section */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Global Theme</label>
          <select
            value={theme}
            onChange={(e) => applyTheme(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-white"
          >
            <option value="Classic YouTube">Classic YouTube</option>
            <option value="Pro Dark">Pro Dark (Professional)</option>
            <option value="Gold Luxury">Gold Luxury</option>
            <option value="Holographic">Holographic Glass</option>
            <option value="Neon Blue">Neon Blue</option>
            <option value="Neon Purple">Neon Purple</option>
            <option value="Cyberpunk">Cyberpunk</option>
            <option value="Minimal White">Minimal White</option>
            <option value="Glass">Glass (Coming Soon)</option>
          </select>
        </div>

        {/* Typography Section */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Typography & Brand</label>
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-white mb-2"
            placeholder="Brand Name"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 text-white"
            >
              <option value="Inter">Inter</option>
              <option value="Roboto">Roboto</option>
              <option value="Montserrat">Montserrat</option>
              <option value="Poppins">Poppins</option>
              <option value="Playfair Display">Playfair Display</option>
              <option value="Space Grotesk">Space Grotesk</option>
              <option value="JetBrains Mono">JetBrains Mono</option>
            </select>
            <select
              value={fontWeight}
              onChange={(e) => setFontWeight(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 text-white"
            >
              <option value="400">Regular (400)</option>
              <option value="500">Medium (500)</option>
              <option value="600">SemiBold (600)</option>
              <option value="700">Bold (700)</option>
              <option value="800">ExtraBold (800)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-lg px-2">
              <span className="text-[10px] text-gray-500">Size</span>
              <input
                type="text"
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                className="w-full bg-transparent py-2 text-xs focus:outline-none text-white text-right"
              />
            </div>
            <div className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-lg px-2">
              <span className="text-[10px] text-gray-500">Spacing</span>
              <input
                type="text"
                value={letterSpacing}
                onChange={(e) => setLetterSpacing(e.target.value)}
                className="w-full bg-transparent py-2 text-xs focus:outline-none text-white text-right"
              />
            </div>
          </div>
        </div>

        {/* Style Selection */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Component Styles</label>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={useSubscribeStore().buttonStyle}
              onChange={(e) => useSubscribeStore.getState().setButtonStyle(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 text-white"
            >
              <option value="pill">Pill Button</option>
              <option value="rounded">Rounded Button</option>
              <option value="square">Square Button</option>
            </select>
            <select
              value={useSubscribeStore().cursorStyle}
              onChange={(e) => useSubscribeStore.getState().setCursorStyle(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 text-white"
            >
              <option value="default">Default Cursor</option>
              <option value="gaming">Gaming Cursor</option>
              <option value="minimal">Minimal Cursor</option>
            </select>
          </div>
        </div>

        {/* Colors Section */}
        <div className="space-y-4">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Color Scheme</label>
          
          <div className="space-y-2">
            {[
              { key: 'brandNameColor', label: 'Brand Text' },
              { key: 'subscribeColor', label: 'Subscribe Btn' },
              { key: 'likeColor', label: 'Like Icon' },
              { key: 'bellColor', label: 'Bell Icon' },
              { key: 'logoGlow', label: 'Logo Glow' },
              { key: 'borderColor', label: 'Border' },
              { key: 'shadow', label: 'Drop Shadow' },
            ].map((c) => (
              <div key={c.key} className="flex items-center justify-between bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">
                <span className="text-xs text-gray-300">{c.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 uppercase">{colors[c.key as keyof typeof colors]}</span>
                  <input
                    type="color"
                    value={colors[c.key as keyof typeof colors]}
                    onChange={(e) => handleColorChange(c.key as keyof typeof colors, e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Animation Section */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Animation</label>
          <div className="grid grid-cols-2 gap-2 mb-2">
             <select
              value={useSubscribeStore().animationStyle}
              onChange={(e) => useSubscribeStore.getState().setAnimationStyle(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 text-white"
            >
              <option value="spring">Springy & Bouncy</option>
              <option value="smooth">Smooth & Linear</option>
              <option value="snappy">Snappy & Fast</option>
            </select>
          </div>
          <div className="flex items-center justify-between bg-black/20 px-3 py-2 rounded-lg border border-white/5">
            <span className="text-xs text-gray-300">Speed Multiplier</span>
            <input 
              type="number" 
              step="0.1" 
              min="0.5" 
              max="3" 
              value={animationSpeed} 
              onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
              className="w-16 bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-right text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Export Section */}
        <div className="space-y-4 pt-4 border-t border-white/10">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-purple-400 uppercase tracking-widest block">Studio Integration</label>
            <button 
              onClick={handleTransferToStudio}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_20px_rgba(124,58,237,0.5)] transition flex items-center justify-center gap-2 border border-purple-500/30 transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Video className="w-4 h-4 text-purple-300" /> انتقال به Video Studio
            </button>
          </div>

          <div className="space-y-2 pt-2">
            <label className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest block">Production Export & Download</label>
            <div className="grid grid-cols-2 gap-2">
            <button onClick={() => triggerExport('WebM Alpha')} className="py-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition flex items-center justify-center gap-1.5 text-[11px] font-medium border border-emerald-500/20">
              <Download className="w-3.5 h-3.5" /> WebM Alpha
            </button>
            <button onClick={() => triggerExport('Lottie JSON')} className="py-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition flex items-center justify-center gap-1.5 text-[11px] font-medium border border-emerald-500/20">
              <Download className="w-3.5 h-3.5" /> Lottie JSON
            </button>
            <button onClick={() => triggerExport('GIF Animated')} className="py-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition flex items-center justify-center gap-1.5 text-[11px] font-medium border border-emerald-500/20">
              <Download className="w-3.5 h-3.5" /> GIF (Animated)
            </button>
            <button onClick={() => triggerExport('MP4 Video')} className="py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition flex items-center justify-center gap-1.5 text-[11px] font-medium">
              <Download className="w-3.5 h-3.5" /> MP4 Video
            </button>
          </div>
        </div>
          <div className="pt-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Project Files</label>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => triggerExport('After Effects (.aep)')} className="py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition flex items-center justify-center text-[10px] font-bold tracking-wider">
                .AEP
              </button>
              <button onClick={() => triggerExport('Premiere (.mogrt)')} className="py-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 transition flex items-center justify-center text-[10px] font-bold tracking-wider">
                .MOGRT
              </button>
              <button onClick={() => triggerExport('DaVinci Resolve')} className="py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition flex items-center justify-center text-[10px] font-bold tracking-wider">
                RESOLVE
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsPanel;

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSubscribeStore } from '../../store/useSubscribeStore';
import { Upload, CheckCircle, ChevronRight, X, Image as ImageIcon } from 'lucide-react';

const SetupWizard: React.FC = () => {
  const { 
    setupStep, setSetupStep, 
    setHasCompletedSetup, 
    setTempLogoImage, setIsEditorOpen 
  } = useSubscribeStore();
  
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSkip = () => {
    setHasCompletedSetup(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAnalyzing(true);
      // Simulate smart logo analyzer
      setTimeout(() => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setTempLogoImage(ev.target?.result as string);
          setAnalyzing(false);
          setSetupStep(3); // Go to results
        };
        reader.readAsDataURL(file);
      }, 1500);
    }
  };

  const handleContinueToEditor = () => {
    setHasCompletedSetup(true);
    setIsEditorOpen(true);
  };

  return (
    <div className="absolute inset-0 z-40 bg-zinc-950/80 backdrop-blur-xl flex items-center justify-center">
      <AnimatePresence mode="wait">
        {setupStep === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="bg-zinc-900 border border-white/10 p-8 rounded-2xl w-[450px] shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              <ImageIcon className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Welcome!</h2>
            <p className="text-gray-400 mb-8">Let's personalize your Subscribe Template and make it uniquely yours.</p>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => setSetupStep(2)}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition shadow-lg shadow-emerald-500/20"
              >
                Continue
              </button>
              <button 
                onClick={handleSkip}
                className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-medium transition"
              >
                Skip Setup
              </button>
            </div>
          </motion.div>
        )}

        {setupStep === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="bg-zinc-900 border border-white/10 p-8 rounded-2xl w-[450px] shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Upload Your Brand Logo</h2>
              <button onClick={handleSkip} className="text-gray-500 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {!analyzing ? (
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-48 rounded-2xl border-2 border-dashed border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 flex flex-col items-center justify-center gap-3 transition"
                >
                  <Upload className="w-8 h-8 text-emerald-500" />
                  <div className="text-center">
                    <div className="font-semibold text-gray-200">Drag & Drop</div>
                    <div className="text-sm text-gray-500">or Browse Files</div>
                  </div>
                </button>
                <div className="text-xs text-gray-500 text-center">
                  Supported: PNG, SVG, AI, EPS, PDF, JPG, WEBP
                </div>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                />
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                <div className="text-emerald-400 font-medium animate-pulse">Smart Analyzing Logo...</div>
              </div>
            )}
          </motion.div>
        )}

        {setupStep === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="bg-zinc-900 border border-white/10 p-8 rounded-2xl w-[450px] shadow-2xl"
          >
            <h2 className="text-xl font-bold mb-6 text-center">Logo Analysis Complete</h2>
            
            <div className="space-y-3 mb-8">
              {[
                { label: 'Resolution', checked: true },
                { label: 'Transparent', checked: true },
                { label: 'Margins Detected', checked: true },
                { label: 'Auto Crop Recommended', checked: true },
              ].map((item, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.15 }}
                  key={i} 
                  className="flex items-center gap-3 bg-black/40 p-3 rounded-lg border border-white/5"
                >
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <span className="text-gray-300 font-medium">{item.label}</span>
                </motion.div>
              ))}
            </div>

            <button 
              onClick={handleContinueToEditor}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              Open Logo Editor <ChevronRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SetupWizard;

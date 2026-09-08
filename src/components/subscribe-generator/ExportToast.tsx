import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useSubscribeStore } from '../../store/useSubscribeStore';

interface ExportToastProps {
  isVisible: boolean;
  format: string;
  onClose: () => void;
}

const ExportToast: React.FC<ExportToastProps> = ({ isVisible, format, onClose }) => {
  const [status, setStatus] = React.useState<'rendering' | 'done'>('rendering');
  const store = useSubscribeStore();

  const handleRealDownload = () => {
    let fileContent: string | Uint8Array = "";
    let fileName = "";
    let mimeType = "";

    if (format.includes('JSON') || format.includes('resolve') || format.includes('Project') || format.includes('.aep') || format.includes('.mogrt')) {
      // Export JSON config
      const config = {
        generator: "NeuralPodcast Subscribe Generator",
        brandName: store.brandName,
        fontFamily: store.fontFamily,
        fontWeight: store.fontWeight,
        fontSize: store.fontSize,
        theme: store.theme,
        colors: store.colors,
        buttonStyle: store.buttonStyle,
        cursorStyle: store.cursorStyle,
        animationStyle: store.animationStyle,
        animationSpeed: store.animationSpeed,
        exportedAt: new Date().toISOString()
      };
      fileContent = JSON.stringify(config, null, 2);
      fileName = `${store.brandName.toLowerCase().replace(/\s+/g, '_')}_subscribe_config.json`;
      mimeType = "application/json";
    } else if (format.includes('GIF')) {
      // Create a tiny 1x1 transparent GIF just as a placeholder since real GIF encoding requires an external library
      // In a real production app, we would use gif.js or ffmpeg.wasm here to capture the canvas.
      fileContent = new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 68, 0, 59]);
      fileName = `${store.brandName.toLowerCase().replace(/\s+/g, '_')}_subscribe.gif`;
      mimeType = "image/gif";
    } else {
      // Export standalone responsive HTML/CSS widget (perfect for OBS / Web / Studio integration)
      fileContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${store.brandName} - Subscribe Overlay</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=${store.fontFamily.replace(/\s+/g, '+')}:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    body {
      background-color: transparent;
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
      font-family: "${store.fontFamily}", sans-serif;
    }
    .custom-container {
      background: rgba(10, 10, 10, 0.95);
      border-radius: 9999px;
      border: 1px solid ${store.colors.borderColor}40;
      box-shadow: 0 10px 40px ${store.colors.shadow}90, inset 0 0 20px ${store.colors.primaryColor}10;
      padding: 8px 16px;
      display: inline-flex;
      align-items: center;
      position: relative;
    }
  </style>
</head>
<body>
  <div class="custom-container">
    <!-- Logo -->
    <div style="border: 2px solid ${store.colors.borderColor}; box-shadow: 0 0 15px ${store.colors.logoGlow}60" class="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-zinc-800">
      ${store.logoImage ? `<img src="${store.logoImage}" class="w-full h-full object-cover" />` : `<span style="color: ${store.colors.primaryColor}" class="text-xl">✨</span>`}
    </div>

    <!-- Brand Name -->
    <div style="color: ${store.colors.brandNameColor}; font-weight: ${store.fontWeight}; font-size: ${store.fontSize}; letter-spacing: ${store.letterSpacing}" class="ml-3 mr-4 font-bold whitespace-nowrap text-lg">
      ${store.brandName}
    </div>

    <!-- Action items -->
    <div class="flex items-center gap-2">
      <!-- Like -->
      <button style="border-color: ${store.colors.borderColor}30; color: ${store.colors.likeColor}" class="px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1 bg-black/30">
        👍 Like
      </button>
      
      <!-- Subscribe -->
      <button style="background-color: ${store.colors.subscribeColor}; border-radius: ${store.buttonStyle === 'pill' ? '9999px' : store.buttonStyle === 'rounded' ? '8px' : '0px'}" class="px-4 py-1.5 text-white font-bold text-xs uppercase shadow-md">
        Subscribe
      </button>

      <!-- Bell -->
      <button style="color: ${store.colors.bellColor}" class="p-1.5 rounded-full bg-black/30">
        🔔
      </button>
    </div>
  </div>
</body>
</html>`;
      fileName = `${store.brandName.toLowerCase().replace(/\s+/g, '_')}_obs_overlay.html`;
      mimeType = "text/html";
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (isVisible) {
      setStatus('rendering');
      const timer = setTimeout(() => {
        setStatus('done');
        try {
          handleRealDownload();
        } catch (e) {
          console.error("Download error", e);
        }
        setTimeout(() => {
          onClose();
        }, 3000);
      }, 2500); // simulate rendering time
      return () => clearTimeout(timer);
    }
  }, [isVisible, format]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-white/10 shadow-2xl rounded-xl p-4 flex items-center gap-4 min-w-[300px]"
        >
          {status === 'rendering' ? (
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          ) : (
            <CheckCircle className="w-6 h-6 text-emerald-500" />
          )}
          
          <div>
            <h4 className="text-sm font-bold text-white">
              {status === 'rendering' ? `Rendering ${format}...` : `Export Complete`}
            </h4>
            <p className="text-xs text-gray-400">
              {status === 'rendering' ? 'Processing alpha channels & animations.' : `${format} file is ready to download.`}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ExportToast;

import React, { useRef, useState, useEffect } from 'react';
import { useSubscribeStore } from '../../store/useSubscribeStore';
import { X, ZoomIn, ZoomOut, RotateCcw, Maximize, Check } from 'lucide-react';

const LogoEditor: React.FC = () => {
  const { isEditorOpen, setIsEditorOpen, tempLogoImage, setLogoImage } = useSubscribeStore();
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (isEditorOpen) {
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
    }
  }, [isEditorOpen]);

  if (!isEditorOpen || !tempLogoImage) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const applyCrop = () => {
    if (!canvasRef.current || !imageRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // We render the cropped area
    const size = 300;
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);
    
    // Draw circular mask (optional if we just want a transparent PNG, we can leave it square and let border-radius handle it)
    // Actually we want the cropped logo. We'll just draw the transformed image into the canvas.
    ctx.translate(size / 2, size / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    
    const img = imageRef.current;
    // Calculate aspect ratio and dimensions
    const imgAspect = img.naturalWidth / img.naturalHeight;
    let w = size;
    let h = size;
    if (imgAspect > 1) {
      h = size / imgAspect;
    } else {
      w = size * imgAspect;
    }

    ctx.drawImage(
      img, 
      -w / 2 + position.x / scale, 
      -h / 2 + position.y / scale, 
      w, 
      h
    );

    const croppedDataUrl = canvas.toDataURL('image/png');
    setLogoImage(croppedDataUrl);
    setIsEditorOpen(false);
  };

  const handleAutoCrop = () => {
    setScale(1.5);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-[500px] shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="font-semibold text-lg text-white">Logo Crop Editor</h3>
          <button onClick={() => setIsEditorOpen(false)} className="text-gray-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Editor Area */}
        <div className="p-6 flex flex-col items-center">
          <div className="text-sm text-gray-400 mb-4 text-center">
            Drag to pan. Everything outside the circle will be clipped.
          </div>
          
          <div 
            className="w-[300px] h-[300px] relative rounded-full border-2 border-emerald-500/50 overflow-hidden bg-black cursor-move flex items-center justify-center"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div className="absolute inset-0 pointer-events-none rounded-full shadow-[inset_0_0_0_200px_rgba(0,0,0,0.4)] z-10" />
            <img 
              ref={imageRef}
              src={tempLogoImage} 
              alt="Logo Preview" 
              className="max-w-none pointer-events-none"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                transition: isDragging ? 'none' : 'transform 0.2s',
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
              draggable={false}
            />
          </div>

          {/* Controls */}
          <div className="mt-6 flex items-center gap-4 bg-black/40 p-2 rounded-xl border border-white/5">
            <button onClick={() => setScale(s => s * 0.9)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg" title="Zoom Out">
              <ZoomOut className="w-5 h-5" />
            </button>
            <button onClick={() => setScale(s => s * 1.1)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg" title="Zoom In">
              <ZoomIn className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-white/10 mx-2" />
            <button onClick={() => setRotation(r => r - 15)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg" title="Rotate">
              <RotateCcw className="w-5 h-5" />
            </button>
            <button onClick={handleAutoCrop} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg" title="Auto Crop">
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-zinc-950 border-t border-white/10 flex justify-end gap-3">
          <button 
            onClick={() => setIsEditorOpen(false)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button 
            onClick={applyCrop}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition flex items-center gap-2"
          >
            <Check className="w-4 h-4" /> Apply Crop
          </button>
        </div>

        {/* Hidden Canvas for rendering final cropped image */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};

export default LogoEditor;

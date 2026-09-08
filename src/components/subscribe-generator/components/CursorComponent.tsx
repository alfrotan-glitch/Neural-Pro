import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { useSubscribeProperties } from '../SubscribePropertiesContext';

const CursorComponent: React.FC = () => {
  const { animationStage, animationSpeed, cursorStyle } = useSubscribeProperties();
  const [position, setPosition] = useState({ x: 200, y: 200 });
  const [scale, setScale] = useState(1);
  const [opacity, setOpacity] = useState(0);

  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

  const renderCursor = () => {
    if (cursorStyle === 'gaming') {
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" className="drop-shadow-xl" style={{ filter: 'drop-shadow(0px 4px 4px rgba(0,0,0,0.5))' }}>
          <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86h7.1c.45 0 .67-.54.35-.85L5.5 3.21z" fill="white" stroke="black" strokeWidth="1.5" strokeLinejoin="miter" />
        </svg>
      );
    }
    if (cursorStyle === 'minimal') {
      return (
        <div className="w-5 h-5 bg-white rounded-full border-2 border-black drop-shadow-md" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.5))', transform: 'translate(-50%, -50%)' }} />
      );
    }
    return (
      <svg width="24" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1.38541 1.48839C0.840788 0.704285 1.40191 -0.420847 2.35565 -0.420847L22.148 0.052445C23.0135 0.0731213 23.4908 1.0772 22.9555 1.75338L14.7348 12.1384C14.4172 12.5397 14.3983 13.1118 14.6865 13.5332L20.2104 21.6111C20.7412 22.3875 20.3703 23.4682 19.5015 23.6766L15.3582 24.6705C14.9392 24.7711 14.5028 24.6366 14.2275 24.3225L1.8797 10.2396C1.36585 9.6536 -0.198279 8.23292 0.155495 7.15178C0.509268 6.07064 1.38541 1.48839 1.38541 1.48839Z" fill="white" stroke="black" strokeWidth="1.5"/>
      </svg>
    );
  };

  useEffect(() => {
    // Determine active target based on animationStage
    let activeId = '';
    switch (animationStage) {
      case 2:
        activeId = 'target-logo';
        break;
      case 3:
      case 4:
        activeId = 'target-like';
        break;
      case 5:
      case 6:
        activeId = 'target-subscribe';
        break;
      case 7:
      case 8:
        activeId = 'target-bell';
        break;
    }

    let animationFrameId: number;

    // Calculate hotspot offset based on cursor style
    let hotspotX = 0;
    let hotspotY = 0;
    if (cursorStyle === 'gaming') {
      hotspotX = 6.4;
      hotspotY = 3.7;
    } else if (cursorStyle === 'minimal') {
      hotspotX = 0;
      hotspotY = 0;
    } else { // default
      hotspotX = 1.4;
      hotspotY = 1.5;
    }

    const updatePosition = () => {
      if (activeId) {
        const container = document.getElementById('animation-container-inner');
        const target = document.getElementById(activeId);
        
        if (container && target) {
          const containerRect = container.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          
          // Calculate any scale factor applied by CSS transforms (e.g. responsive scaling)
          const scaleX = container.offsetWidth > 0 ? (containerRect.width / container.offsetWidth) : 1;
          const scaleY = container.offsetHeight > 0 ? (containerRect.height / container.offsetHeight) : 1;
          
          const x = (targetRect.left - containerRect.left + (targetRect.width / 2)) / scaleX - hotspotX;
          const y = (targetRect.top - containerRect.top + (targetRect.height / 2)) / scaleY - hotspotY;

          setPosition(prev => {
            if (Math.abs(prev.x - x) < 0.05 && Math.abs(prev.y - y) < 0.05) {
              return prev;
            }
            return { x, y };
          });
        }
      }
      animationFrameId = requestAnimationFrame(updatePosition);
    };

    if (activeId) {
      updatePosition();
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [animationStage, cursorStyle]);

  useEffect(() => {
    // Clear previous timeouts
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];

    const multiplier = 1 / animationSpeed;

    switch (animationStage) {
      case 0:
      case 1:
        setOpacity(0);
        setPosition({ x: 100, y: 150 });
        break;
      case 2:
        setOpacity(1);
        timeoutRefs.current.push(setTimeout(() => setScale(0.8), 300 * multiplier));
        timeoutRefs.current.push(setTimeout(() => setScale(1), 500 * multiplier));
        break;
      case 3:
        break;
      case 4:
        setScale(0.8);
        timeoutRefs.current.push(setTimeout(() => setScale(1), 200 * multiplier));
        break;
      case 5:
        break;
      case 6:
        setScale(0.8);
        timeoutRefs.current.push(setTimeout(() => setScale(1), 200 * multiplier));
        break;
      case 7:
        break;
      case 8:
        setScale(0.8);
        timeoutRefs.current.push(setTimeout(() => setScale(1), 200 * multiplier));
        break;
      case 9:
        setPosition(prev => ({ x: prev.x, y: prev.y + 100 }));
        timeoutRefs.current.push(setTimeout(() => setOpacity(0), 300 * multiplier));
        break;
    }

    return () => {
      timeoutRefs.current.forEach(clearTimeout);
    };
  }, [animationStage, animationSpeed]);

  return (
    <motion.div
      animate={{ x: position.x, y: position.y, scale, opacity }}
      transition={{ 
        x: { type: "spring", bounce: 0, duration: 0.8 * (1/animationSpeed) },
        y: { type: "spring", bounce: 0, duration: 0.8 * (1/animationSpeed) },
        scale: { duration: 0.1 * (1/animationSpeed) },
        opacity: { duration: 0.3 * (1/animationSpeed) }
      }}
      className="absolute top-0 left-0 z-50 pointer-events-none"
      style={{
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))'
      }}
    >
      {renderCursor()}
    </motion.div>
  );
};

export default CursorComponent;

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSubscribeStore } from '../../store/useSubscribeStore';
import { useSubscribeProperties } from './SubscribePropertiesContext';
import LogoComponent from './components/LogoComponent';
import BrandNameComponent from './components/BrandNameComponent';
import LikeComponent from './components/LikeComponent';
import SubscribeComponent from './components/SubscribeComponent';
import BellComponent from './components/BellComponent';
import CursorComponent from './components/CursorComponent';

const AnimationController: React.FC = () => {
  const { isPlaying, animationStage, animationSpeed, colors, isRuntimeBound } = useSubscribeProperties();
  const setAnimationStage = useSubscribeStore((state) => state.setAnimationStage);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isRuntimeBound || !isPlaying) return;

    const baseStages = [
      { stage: 1, delay: 500 },
      { stage: 2, delay: 1500 },
      { stage: 3, delay: 2500 },
      { stage: 4, delay: 3500 },
      { stage: 5, delay: 4500 },
      { stage: 6, delay: 5500 },
      { stage: 7, delay: 6500 },
      { stage: 8, delay: 7500 },
      { stage: 9, delay: 9500 },
      { stage: 10, delay: 10500 },
    ];
    const safeSpeed = Number.isFinite(animationSpeed) && animationSpeed > 0 ? animationSpeed : 1;
    const timeoutIds = baseStages.map(({ stage, delay }) =>
      setTimeout(() => setAnimationStage(stage), delay * (1 / safeSpeed)),
    );
    return () => timeoutIds.forEach(clearTimeout);
  }, [animationSpeed, isPlaying, isRuntimeBound, setAnimationStage]);


  const isVisible = animationStage >= 1 && animationStage < 10;

  return (
    <div className="relative flex items-center h-full w-full justify-center">
      <AnimatePresence>
        {isVisible && (
          <motion.div
            id="animation-outer-container"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.8 * (1/animationSpeed) } }}
            transition={{ duration: 0.5 * (1/animationSpeed) }}
            className="flex items-center justify-center p-4 rounded-2xl relative"
            ref={containerRef}
            style={{ 
              filter: `drop-shadow(0 10px 30px ${colors.shadow})` 
            }}
          >
            <motion.div 
              layout
              className="flex items-center relative z-10 bg-[#0a0a0a]/90 backdrop-blur-2xl rounded-full border shadow-2xl p-2"
              style={{
                borderColor: colors.borderColor + '40',
                boxShadow: `0 0 40px ${colors.shadow}60, inset 0 0 20px ${colors.primaryColor}10`
              }}
              id="animation-container-inner"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 * (1/animationSpeed) }}
            >
              <LogoComponent />
              <BrandNameComponent />
              <LikeComponent />
              <SubscribeComponent />
              <BellComponent />
              {isPlaying && <CursorComponent />}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AnimationController;

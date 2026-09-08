import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSubscribeProperties } from '../SubscribePropertiesContext';

const LikeIcon = ({ filled }: { filled: boolean }) => (
  <svg 
    viewBox="0 0 24 24" 
    className="w-7 h-7"
    fill={filled ? "currentColor" : "none"} 
    stroke="currentColor" 
    strokeWidth={filled ? "0" : "2"}
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
  </svg>
);

const LikeComponent: React.FC = () => {
  const { colors, animationStage, animationSpeed, getTransition } = useSubscribeProperties();
  const multiplier = 1 / animationSpeed;

  const isVisible = animationStage >= 3;
  const isLiked = animationStage >= 4;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          id="target-like"
          initial={{ scale: 0, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={getTransition()}
          className="relative mr-4 flex items-center justify-center cursor-pointer"
        >
          <motion.div
            animate={isLiked ? { scale: [1, 1.4, 0.9, 1], rotate: [0, -15, 10, 0] } : {}}
            transition={{ duration: 0.5 * multiplier }}
            style={{ 
              color: isLiked ? colors.likeColor : colors.secondaryColor,
              filter: isLiked ? `drop-shadow(0 0 8px ${colors.likeColor}60)` : 'none'
            }}
            className="transition-colors"
          >
            <LikeIcon filled={isLiked} />
          </motion.div>

          {/* Particle Burst */}
          {isLiked && animationStage === 4 && (
            <>
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                  animate={{ 
                    x: Math.cos(i * (Math.PI * 2) / 6) * 35, 
                    y: Math.sin(i * (Math.PI * 2) / 6) * 35,
                    scale: 1.5,
                    opacity: 0
                  }}
                  transition={{ duration: 0.5 * multiplier, ease: "easeOut" }}
                  className="absolute w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: colors.likeColor }}
                />
              ))}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LikeComponent;

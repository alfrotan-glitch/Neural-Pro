import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSubscribeProperties } from '../SubscribePropertiesContext';

const BellIcon = ({ ringing }: { ringing: boolean }) => (
  <svg 
    viewBox="0 0 24 24" 
    className="w-7 h-7"
    fill={ringing ? "currentColor" : "none"} 
    stroke="currentColor" 
    strokeWidth={ringing ? "0" : "2"}
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
  </svg>
);

const BellComponent: React.FC = () => {
  const { colors, animationStage, animationSpeed, getTransition } = useSubscribeProperties();
  const multiplier = 1 / animationSpeed;

  const isVisible = animationStage >= 7;
  const isRinging = animationStage >= 8;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          id="target-bell"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={getTransition()}
          className="relative flex items-center justify-center cursor-pointer"
        >
          <motion.div
            animate={isRinging ? { 
              rotate: [0, -15, 20, -20, 15, -10, 5, 0],
              scale: [1, 1.2, 1]
            } : {}}
            transition={{ duration: 0.6 * multiplier }}
            style={{ 
              color: isRinging ? colors.bellColor : colors.secondaryColor,
              filter: isRinging ? `drop-shadow(0 0 8px ${colors.bellColor}80)` : 'none'
            }}
            className="transition-colors"
          >
            <BellIcon ringing={isRinging} />
          </motion.div>

          {/* Sound Waves */}
          {isRinging && animationStage === 8 && (
            <>
              <motion.div
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: 2.5, opacity: 0 }}
                transition={{ duration: 0.8 * multiplier, ease: "easeOut" }}
                className="absolute w-8 h-8 border-2 rounded-full"
                style={{ borderColor: colors.bellColor }}
              />
              <motion.div
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: 3.5, opacity: 0 }}
                transition={{ duration: 0.8 * multiplier, delay: 0.2 * multiplier, ease: "easeOut" }}
                className="absolute w-8 h-8 border rounded-full"
                style={{ borderColor: colors.bellColor }}
              />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BellComponent;

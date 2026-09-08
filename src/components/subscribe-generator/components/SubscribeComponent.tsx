import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSubscribeProperties } from '../SubscribePropertiesContext';

const SubscribeComponent: React.FC = () => {
  const { colors, animationStage, animationSpeed, buttonStyle, getTransition } = useSubscribeProperties();
  const multiplier = 1 / animationSpeed;

  const isVisible = animationStage >= 5;
  const isSubscribed = animationStage >= 6;

  let borderRadius = '9999px'; // pill
  if (buttonStyle === 'rounded') borderRadius = '8px';
  if (buttonStyle === 'square') borderRadius = '0px';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={getTransition()}
          className="mr-4"
        >
          <motion.button
            id="target-subscribe"
            animate={isSubscribed ? { scale: [1, 0.9, 1.05, 1] } : {}}
            transition={{ duration: 0.4 * multiplier }}
            className="px-6 py-2.5 font-bold text-sm flex items-center justify-center min-w-[140px] relative overflow-hidden"
            style={{ 
              borderRadius,
              backgroundColor: isSubscribed ? 'rgba(255,255,255,0.1)' : colors.subscribeColor,
              color: isSubscribed ? colors.secondaryColor : '#ffffff',
              boxShadow: !isSubscribed ? `0 0 15px ${colors.subscribeColor}50` : 'none',
              transition: `background-color ${0.3*multiplier}s ease, color ${0.3*multiplier}s ease, box-shadow ${0.3*multiplier}s ease`
            }}
          >
            {isSubscribed ? 'Subscribed ✓' : 'Subscribe'}

            {/* Click Ripple Effect */}
            {isSubscribed && animationStage === 6 && (
              <motion.div
                initial={{ scale: 0, opacity: 0.5 }}
                animate={{ scale: 2.5, opacity: 0 }}
                transition={{ duration: 0.5 * multiplier }}
                className="absolute inset-0 bg-white/20"
                style={{ borderRadius }}
              />
            )}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SubscribeComponent;

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSubscribeProperties } from '../SubscribePropertiesContext';

const BrandNameComponent: React.FC = () => {
  const { brandName, fontFamily, fontWeight, fontSize, letterSpacing, colors, animationStage, getTransition } = useSubscribeProperties();

  const isVisible = animationStage >= 2;

  // Render individual letters for staggered animation if desired, 
  // but a simple slide for the whole block is what we currently do. 
  // User asked for: "Letters slightly staggered."
  // Let's implement staggered letters.

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={getTransition()}
          className="ml-4 mr-6 whitespace-nowrap overflow-hidden flex items-center"
        >
          <div 
            className="flex items-center"
            style={{ 
              color: colors.brandNameColor, 
              fontFamily, 
              fontWeight, 
              fontSize, 
              letterSpacing 
            }}
          >
            {brandName.split('').map((char, index) => (
              <motion.span
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ 
                  delay: index * 0.03, 
                  type: "spring", 
                  stiffness: 100 
                }}
              >
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BrandNameComponent;

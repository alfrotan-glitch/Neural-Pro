import React from 'react';
import { motion } from 'motion/react';
import { useSubscribeProperties } from '../SubscribePropertiesContext';
import { Sparkles } from 'lucide-react';

const LogoComponent: React.FC = () => {
  const { logoImage, colors, animationStage, animationSpeed, getTransition } = useSubscribeProperties();

  const isVisible = animationStage >= 1;
  const isClicked = animationStage >= 2;

  const multiplier = 1 / animationSpeed;

  return (
    <motion.div
      id="target-logo"
      initial={{ scale: 0, opacity: 0, rotate: -20 }}
      animate={isVisible ? { 
        scale: isClicked ? [1, 0.9, 1.1, 1] : 1,
        opacity: 1,
        rotate: 0
      } : { scale: 0, opacity: 0, rotate: -20 }}
      transition={isClicked 
        ? { duration: 0.5 * multiplier, times: [0, 0.2, 0.5, 1], ease: "easeInOut" }
        : getTransition(0.8)
      }
      className="relative z-20 flex-shrink-0"
      style={{
        filter: isVisible ? `drop-shadow(0 0 10px ${colors.logoGlow}40)` : 'none'
      }}
    >
      <div 
        className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden bg-zinc-800"
        style={{
          border: `2px solid ${colors.borderColor}`,
          boxShadow: isClicked ? `0 0 20px ${colors.logoGlow}80` : 'none',
          transition: `box-shadow ${0.3 * multiplier}s ease`
        }}
      >
        {logoImage ? (
          <img src={logoImage} alt="Logo" className="w-full h-full object-cover" />
        ) : (
          <Sparkles className="w-6 h-6" style={{ color: colors.primaryColor }} />
        )}
      </div>

      {/* Ripple Effect on Click */}
      {isClicked && animationStage === 2 && (
        <motion.div
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 2.5, opacity: 0 }}
          transition={{ duration: 0.6 * multiplier, ease: "easeOut" }}
          className="absolute inset-0 rounded-full z-[-1]"
          style={{ backgroundColor: colors.logoGlow }}
        />
      )}
    </motion.div>
  );
};

export default LogoComponent;

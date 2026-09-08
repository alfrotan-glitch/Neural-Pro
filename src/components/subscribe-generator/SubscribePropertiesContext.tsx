import React, { createContext, useContext } from 'react';
import { useSubscribeStore } from '../../store/useSubscribeStore';

export interface SubscribeProps {
  brandName?: string;
  fontFamily?: string;
  fontWeight?: string;
  fontSize?: string;
  letterSpacing?: string;
  logoImage?: string | null;
  theme?: string;
  colors?: {
    logoGlow: string;
    borderColor: string;
    brandNameColor: string;
    subscribeColor: string;
    likeColor: string;
    bellColor: string;
    outline: string;
    shadow: string;
    primaryColor: string;
    secondaryColor: string;
  };
  animationSpeed?: number;
  cursorStyle?: string;
  buttonStyle?: string;
  animationStyle?: string;
}

const SubscribePropertiesContext = createContext<SubscribeProps | null>(null);

export interface SubscribeRuntimeState {
  animationStage?: number;
  isPlaying?: boolean;
}

export const SubscribePropertiesProvider: React.FC<{
  properties?: SubscribeProps;
  runtime?: SubscribeRuntimeState;
  children: React.ReactNode;
}> = ({ properties, runtime, children }) => {
  const value = properties || runtime ? { ...properties, __runtime: runtime } as SubscribeProps & { __runtime?: SubscribeRuntimeState } : null;
  return (
    <SubscribePropertiesContext.Provider value={value}>
      {children}
    </SubscribePropertiesContext.Provider>
  );
};

export const useSubscribeProperties = () => {
  const context = useContext(SubscribePropertiesContext);
  const store = useSubscribeStore();

  if (context) {
    const runtime = (context as SubscribeProps & { __runtime?: SubscribeRuntimeState }).__runtime;
    return {
      brandName: context.brandName !== undefined ? context.brandName : store.brandName,
      fontFamily: context.fontFamily !== undefined ? context.fontFamily : store.fontFamily,
      fontWeight: context.fontWeight !== undefined ? context.fontWeight : store.fontWeight,
      fontSize: context.fontSize !== undefined ? context.fontSize : store.fontSize,
      letterSpacing: context.letterSpacing !== undefined ? context.letterSpacing : store.letterSpacing,
      logoImage: context.logoImage !== undefined ? context.logoImage : store.logoImage,
      theme: context.theme !== undefined ? context.theme : store.theme,
      colors: context.colors !== undefined ? { ...store.colors, ...context.colors } : store.colors,
      animationSpeed: context.animationSpeed !== undefined ? context.animationSpeed : store.animationSpeed,
      cursorStyle: context.cursorStyle !== undefined ? context.cursorStyle : store.cursorStyle,
      buttonStyle: context.buttonStyle !== undefined ? context.buttonStyle : store.buttonStyle,
      animationStyle: context.animationStyle !== undefined ? context.animationStyle : store.animationStyle,
      
      animationStage: runtime?.animationStage !== undefined ? runtime.animationStage : store.animationStage,
      isPlaying: runtime?.isPlaying !== undefined ? runtime.isPlaying : store.isPlaying,
      isRuntimeBound: runtime?.animationStage !== undefined || runtime?.isPlaying !== undefined,
      getTransition: (customDuration?: number) => {
        const speed = context.animationSpeed !== undefined ? context.animationSpeed : store.animationSpeed;
        const style = context.animationStyle !== undefined ? context.animationStyle : store.animationStyle;
        const duration = (customDuration || 0.6) * (1 / speed);
        
        if (style === 'smooth') {
          return { duration, ease: "easeInOut" };
        }
        if (style === 'snappy') {
          return { duration: duration * 0.7, type: "spring", bounce: 0.2 };
        }
        return { type: "spring", bounce: 0.5, duration };
      }
    };
  }

  return {
    brandName: store.brandName,
    fontFamily: store.fontFamily,
    fontWeight: store.fontWeight,
    fontSize: store.fontSize,
    letterSpacing: store.letterSpacing,
    logoImage: store.logoImage,
    theme: store.theme,
    colors: store.colors,
    animationSpeed: store.animationSpeed,
    cursorStyle: store.cursorStyle,
    buttonStyle: store.buttonStyle,
    animationStyle: store.animationStyle,
    animationStage: store.animationStage,
    isPlaying: store.isPlaying,
    getTransition: store.getTransition,
    isRuntimeBound: false,
  };
};

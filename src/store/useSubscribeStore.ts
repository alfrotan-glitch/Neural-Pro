import { create } from 'zustand';

interface SubscribeState {
  hasCompletedSetup: boolean;
  setHasCompletedSetup: (completed: boolean) => void;
  setupStep: number;
  setSetupStep: (step: number) => void;

  brandName: string;
  setBrandName: (name: string) => void;
  
  fontFamily: string;
  setFontFamily: (font: string) => void;
  fontWeight: string;
  setFontWeight: (weight: string) => void;
  fontSize: string;
  setFontSize: (size: string) => void;
  letterSpacing: string;
  setLetterSpacing: (spacing: string) => void;
  
  logoImage: string | null;
  setLogoImage: (url: string | null) => void;
  
  theme: string;
  setTheme: (theme: string) => void;

  colors: {
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
  setColors: (colors: Partial<SubscribeState['colors']>) => void;

  animationStage: number; // 0 to 10
  setAnimationStage: (stage: number) => void;
  animationSpeed: number;
  setAnimationSpeed: (speed: number) => void;
  
  cursorStyle: string;
  setCursorStyle: (style: string) => void;
  buttonStyle: string;
  setButtonStyle: (style: string) => void;
  animationStyle: string;
  setAnimationStyle: (style: string) => void;
  getTransition: (customDuration?: number) => any;

  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  
  isEditorOpen: boolean;
  setIsEditorOpen: (isOpen: boolean) => void;
  tempLogoImage: string | null;
  setTempLogoImage: (url: string | null) => void;
}

export const useSubscribeStore = create<SubscribeState>((set, get) => ({
  hasCompletedSetup: false,
  setHasCompletedSetup: (completed) => set({ hasCompletedSetup: completed }),
  setupStep: 1,
  setSetupStep: (step) => set({ setupStep: step }),

  brandName: 'English Unleashed Official',
  setBrandName: (name) => set({ brandName: name }),
  
  fontFamily: 'Inter',
  setFontFamily: (font) => set({ fontFamily: font }),
  fontWeight: '700',
  setFontWeight: (weight) => set({ fontWeight: weight }),
  fontSize: '24px',
  setFontSize: (size) => set({ fontSize: size }),
  letterSpacing: 'normal',
  setLetterSpacing: (spacing) => set({ letterSpacing: spacing }),
  
  logoImage: null,
  setLogoImage: (url) => set({ logoImage: url }),
  
  theme: 'Classic YouTube',
  setTheme: (theme) => set({ theme }),

  colors: {
    logoGlow: '#ffffff',
    borderColor: '#ffffff',
    brandNameColor: '#ffffff',
    subscribeColor: '#ff0000',
    likeColor: '#ffffff',
    bellColor: '#ffffff',
    outline: '#333333',
    shadow: '#000000',
    primaryColor: '#ffffff',
    secondaryColor: '#aaaaaa'
  },
  setColors: (newColors) => set((state) => ({ colors: { ...state.colors, ...newColors } })),
  
  animationStage: 0,
  setAnimationStage: (stage) => set({ animationStage: stage }),
  animationSpeed: 1,
  setAnimationSpeed: (speed) => set({ animationSpeed: speed }),
  
  cursorStyle: 'default',
  setCursorStyle: (style) => set({ cursorStyle: style }),
  buttonStyle: 'pill',
  setButtonStyle: (style) => set({ buttonStyle: style }),
  animationStyle: 'spring',
  setAnimationStyle: (style) => set({ animationStyle: style }),
  
  getTransition: (customDuration?: number) => {
    const state = get();
    const duration = (customDuration || 0.6) * (1 / state.animationSpeed);
    
    if (state.animationStyle === 'smooth') {
      return { duration, ease: "easeInOut" };
    }
    if (state.animationStyle === 'snappy') {
      return { duration: duration * 0.7, type: "spring", bounce: 0.2 };
    }
    // spring
    return { type: "spring", bounce: 0.5, duration };
  },
  
  isPlaying: false,
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  
  isEditorOpen: false,
  setIsEditorOpen: (isOpen) => set({ isEditorOpen: isOpen }),
  
  tempLogoImage: null,
  setTempLogoImage: (url) => set({ tempLogoImage: url }),
}));

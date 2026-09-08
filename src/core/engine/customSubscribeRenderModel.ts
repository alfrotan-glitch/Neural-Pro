export interface CustomSubscribeRenderProperties {
  brandName: string;
  fontFamily: string;
  fontWeight: string;
  fontSize: string;
  letterSpacing: string;
  logoImage: string | null;
  theme: string;
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
  animationSpeed: number;
  cursorStyle: string;
  buttonStyle: string;
  animationStyle: string;
}

const DEFAULT_COLORS: CustomSubscribeRenderProperties['colors'] = {
  logoGlow: '#ffffff', borderColor: '#ffffff', brandNameColor: '#ffffff',
  subscribeColor: '#ff0000', likeColor: '#ffffff', bellColor: '#ffffff',
  outline: '#333333', shadow: '#000000', primaryColor: '#ffffff', secondaryColor: '#aaaaaa',
};

export const DEFAULT_CUSTOM_SUBSCRIBE_PROPERTIES: CustomSubscribeRenderProperties = {
  brandName: 'English Unleashed Official',
  fontFamily: 'Inter',
  fontWeight: '700',
  fontSize: '24px',
  letterSpacing: 'normal',
  logoImage: null,
  theme: 'Classic YouTube',
  colors: DEFAULT_COLORS,
  animationSpeed: 1,
  cursorStyle: 'default',
  buttonStyle: 'pill',
  animationStyle: 'spring',
};

export function normalizeCustomSubscribeProperties(raw?: Record<string, any>): CustomSubscribeRenderProperties {
  const colors = { ...DEFAULT_COLORS, ...(raw?.colors ?? {}) };
  const speed = Number(raw?.animationSpeed ?? 1);
  return {
    ...DEFAULT_CUSTOM_SUBSCRIBE_PROPERTIES,
    ...raw,
    brandName: String(raw?.brandName ?? raw?.channelTitle ?? DEFAULT_CUSTOM_SUBSCRIBE_PROPERTIES.brandName).trim() || DEFAULT_CUSTOM_SUBSCRIBE_PROPERTIES.brandName,
    fontFamily: String(raw?.fontFamily ?? DEFAULT_CUSTOM_SUBSCRIBE_PROPERTIES.fontFamily),
    fontWeight: String(raw?.fontWeight ?? DEFAULT_CUSTOM_SUBSCRIBE_PROPERTIES.fontWeight),
    fontSize: String(raw?.fontSize ?? DEFAULT_CUSTOM_SUBSCRIBE_PROPERTIES.fontSize),
    letterSpacing: String(raw?.letterSpacing ?? DEFAULT_CUSTOM_SUBSCRIBE_PROPERTIES.letterSpacing),
    logoImage: typeof raw?.logoImage === 'string' ? raw.logoImage : null,
    colors,
    animationSpeed: Number.isFinite(speed) && speed > 0 ? speed : 1,
  };
}

export function getCustomSubscribeAnimationStage(elapsedSeconds: number, animationSpeed: number): number {
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0) * (Number.isFinite(animationSpeed) && animationSpeed > 0 ? animationSpeed : 1);
  if (elapsed >= 10.5) return 10;
  if (elapsed >= 9.5) return 9;
  if (elapsed >= 7.5) return 8;
  if (elapsed >= 6.5) return 7;
  if (elapsed >= 5.5) return 6;
  if (elapsed >= 4.5) return 5;
  if (elapsed >= 3.5) return 4;
  if (elapsed >= 2.5) return 3;
  if (elapsed >= 1.5) return 2;
  if (elapsed >= 0.5) return 1;
  return 0;
}

export function getCustomSubscribeStageOpacity(stage: number): number {
  if (stage <= 0 || stage >= 10) return 0;
  return 1;
}

export function getCustomSubscribeStageScale(stage: number): number {
  if (stage <= 0) return 0.95;
  if (stage >= 9) return 0.95;
  return 1;
}

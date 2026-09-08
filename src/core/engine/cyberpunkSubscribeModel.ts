export interface CyberpunkSubscribeProperties {
  channelName: string;
  logoPresetId: string;
  customLogoUrl: string | null;
  subscribed: boolean;
  liked: boolean;
  notificationsEnabled: boolean;
  mutedEffects: boolean;
}

export interface CyberpunkLogoPreset {
  id: string;
  emoji: string;
  name: string;
  color: string;
}

export const CYBERPUNK_LOGO_PRESETS: readonly CyberpunkLogoPreset[] = [
  { id: 'neon_phoenix', emoji: '🦅', name: 'Cyber Phoenix', color: 'from-pink-500 to-rose-500' },
  { id: 'glitch_skull', emoji: '💀', name: 'Netrunner Skull', color: 'from-cyan-500 to-blue-600' },
  { id: 'cyber_eye', emoji: '👁️', name: 'Holographic Eye', color: 'from-purple-500 to-indigo-500' },
  { id: 'arcade_joy', emoji: '🕹️', name: 'Retro Arcade', color: 'from-amber-400 to-yellow-500' },
  { id: 'synth_sun', emoji: '🌅', name: 'Outrun Sun', color: 'from-orange-500 to-pink-500' },
] as const;

export const DEFAULT_CYBERPUNK_SUBSCRIBE_PROPERTIES: CyberpunkSubscribeProperties = {
  channelName: 'NEON_GRID_MEDIA',
  logoPresetId: 'glitch_skull',
  customLogoUrl: null,
  subscribed: false,
  liked: false,
  notificationsEnabled: false,
  mutedEffects: true,
};

export function normalizeCyberpunkSubscribeProperties(
  properties?: Partial<CyberpunkSubscribeProperties>,
): CyberpunkSubscribeProperties {
  const merged: CyberpunkSubscribeProperties = {
    ...DEFAULT_CYBERPUNK_SUBSCRIBE_PROPERTIES,
    ...(properties ?? {}),
  };

  const logoExists = CYBERPUNK_LOGO_PRESETS.some(
    (logo) => logo.id === merged.logoPresetId,
  );

  if (!logoExists) {
    merged.logoPresetId = DEFAULT_CYBERPUNK_SUBSCRIBE_PROPERTIES.logoPresetId;
  }

  merged.channelName = merged.channelName.trim().slice(0, 64) || DEFAULT_CYBERPUNK_SUBSCRIBE_PROPERTIES.channelName;
  merged.customLogoUrl = merged.customLogoUrl || null;
  merged.subscribed = Boolean(merged.subscribed);
  merged.liked = Boolean(merged.liked);
  merged.notificationsEnabled = Boolean(merged.notificationsEnabled);
  merged.mutedEffects = Boolean(merged.mutedEffects);

  return merged;
}

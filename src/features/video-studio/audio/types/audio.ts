export interface BusAudioConfig {
  volume: number;
  isMuted: boolean;
}

export interface AudioConfiguration {
  voice: BusAudioConfig;
  music: BusAudioConfig;
  sfx: BusAudioConfig;
  master: BusAudioConfig;
  ducking: {
    enabled: boolean;
    sensitivity: number;
    strength: number;
  };
}

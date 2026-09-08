export interface CaptionWord {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  sourceStartTime?: number;
  sourceEndTime?: number;
}

export interface CaptionStyleOverrides {
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  activeColor?: string;
  backgroundColor?: string;
  opacity?: number;
  shadowEnabled?: boolean;
  shadowBlur?: number;
  shadowColor?: string;
  shadowOpacity?: number;
  fontWeight?: number;
  borderRadius?: number;
  padding?: number;
  textAlign?: 'left' | 'center' | 'right';
  positionX?: number;
  positionY?: number;
  maxWidth?: number;
  lineHeight?: number;
  letterSpacing?: number;
  entranceAnimation?: string;
  exitAnimation?: string;
  wordAnimation?: string;
  boxMode?: 'none' | 'solid' | 'translucent' | 'outline';
}

export interface CaptionSegment {
  id: string;
  speakerId?: string;
  startTime: number;
  endTime: number;
  text: string;
  words: CaptionWord[];
  templateId?: string;
  voiceClipId?: string;
  sourceStartTime?: number;
  sourceEndTime?: number;
  styleOverrides?: CaptionStyleOverrides;
}

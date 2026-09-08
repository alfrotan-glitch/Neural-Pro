export type MediaAssetType = 'video' | 'audio' | 'image';
export type MediaAssetRole = 'voice' | 'background-video' | 'music' | 'sfx' | 'image' | 'intro' | 'outro';

export interface MediaAsset {
  id: string;
  projectId: string;
  type: MediaAssetType;
  role: MediaAssetRole;
  name: string;
  sourceUrl: string;
  duration?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  fileSize?: number;
  createdAt: string;
}

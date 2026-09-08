import type { ExportResolution, AudioBitrate, ExportCodec, ExportFPS, ExportFormat, ExportQuality } from './codecs';
import type { ProjectState } from '../../project/types/project';

export type { ExportResolution, AudioBitrate, ExportCodec, ExportFPS, ExportFormat, ExportQuality };

export type ExportJobStatus = 'waiting' | 'preparing' | 'rendering' | 'completed' | 'failed' | 'cancelled';

export interface ExportJobSettings {
  resolution: ExportResolution;
  fps: ExportFPS;
  codec: ExportCodec;
  quality: ExportQuality;
  audioBitrate: AudioBitrate;
  videoBitrate: number;
  format: ExportFormat;
  /** Optional Timeline context for exporting only selected clips. */
  clipIds?: string[];
}

export type ExportProjectSnapshot = Readonly<Pick<ProjectState, 'projectId' | 'metadata' | 'currentTime' | 'totalDuration' | 'tracks' | 'selectedNodeIds' | 'isPlaying' | 'animations'>>;

export interface ExportJob {
  id: string;
  projectName: string;
  status: ExportJobStatus;
  progress: number;
  startTime?: string;
  endTime?: string;
  estimatedRemainingTime?: number;
  settings: ExportJobSettings;
  /** Immutable Project snapshot captured when the export job is created. */
  projectSnapshot: ExportProjectSnapshot;
  error?: string;
  downloadUrl?: string;
}

export interface ExportSettingsState {
  resolution: ExportResolution;
  fps: ExportFPS;
  codec: ExportCodec;
  quality: ExportQuality;
  audioBitrate: AudioBitrate;
  videoBitrate: number;
  videoBitrateMode: 'auto' | 'custom';
  format: ExportFormat;
  isExporting: boolean;
  exportProgress: number;
  jobs: ExportJob[];
}
